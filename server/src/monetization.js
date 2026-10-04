import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from 'redis';

const router = express.Router();

const REDIS_URL = process.env.REDIS_URL || '';
const BUY_FIRST_HASH = 'portfolio:buyfirst:data';
const BUY_FIRST_ACCESS_TTL = Math.max(
  60 * 60,
  Number(process.env.BUY_FIRST_ACCESS_TTL_SECONDS || 31536000)
);
const KOFI_PAYMENT_HASH = 'portfolio:kofi:payments';
const KOFI_PAYMENT_INDEX = 'portfolio:kofi:payments:index';
const KOFI_MESSAGE_SET = 'portfolio:kofi:messages';

let redisClientPromise = null;

function redisConfigured() {
  return Boolean(REDIS_URL);
}

async function getRedis() {
  if (!redisConfigured()) {
    throw new Error('redis_not_configured');
  }

  if (!redisClientPromise) {
    const client = createClient({ url: REDIS_URL });

    client.on('error', (error) => {
      console.error('Redis monetization client error:', error?.message || error);
    });

    redisClientPromise = client
      .connect()
      .then(() => client)
      .catch((error) => {
        redisClientPromise = null;
        throw error;
      });
  }

  return redisClientPromise;
}

function requireRedis(response) {
  if (!redisConfigured()) {
    response.status(503).json({
      error: 'redis_not_configured',
      message: 'Persistent monetization storage is not configured.',
    });
    return false;
  }
  return true;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function emailHash(value) {
  return createHash('sha256')
    .update(normalizeEmail(value))
    .digest('hex');
}

function normalizeTransactionId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const txid = url.searchParams.get('txid');
    if (txid) return txid.trim();
  } catch {
    // The field may already contain the transaction ID.
  }
  return raw;
}

function constantTimeMatch(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function sanitizeBuyFirstPublic(card) {
  return {
    id: String(card?.id || '').trim(),
    title: String(card?.title || '').trim(),
    description: String(card?.description || '').trim(),
    cover: String(card?.cover || '').trim(),
    price: String(card?.price || '').trim(),
    currency: String(card?.currency || '').trim().toUpperCase(),
    purchaseUrl: String(card?.purchaseUrl || '').trim(),
    kofiProductCode: String(card?.kofiProductCode || '').trim(),
    active: card?.active !== false,
  };
}

function normalizeBuyFirstPrivate(card) {
  const publicCard = sanitizeBuyFirstPublic(card);
  return {
    ...publicCard,
    content: String(card?.content || ''),
    updatedAt: typeof card?.updatedAt === 'string' ? card.updatedAt : new Date().toISOString(),
  };
}

function isValidCardId(id) {
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id);
}

async function getBuyFirstCard(id) {
  const redis = await getRedis();
  const raw = await redis.hGet(BUY_FIRST_HASH, id);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

router.post(
  '/api/kofi/webhook',
  express.urlencoded({ extended: false, limit: '1mb' }),
  async (request, response) => {
    const expectedToken = process.env.KO_FI_VERIFICATION_TOKEN || '';

    if (!expectedToken) {
      return response.status(503).json({ error: 'kofi_not_configured' });
    }

    let payload;
    try {
      const raw = request.body?.data;
      if (typeof raw !== 'string' || !raw.trim()) throw new Error('missing_data');
      payload = JSON.parse(raw);
    } catch {
      return response.status(400).json({ error: 'invalid_kofi_payload' });
    }

    if (!constantTimeMatch(payload?.verification_token, expectedToken)) {
      return response.status(401).json({ error: 'invalid_kofi_verification' });
    }

    if (!payload?.message_id || !payload?.kofi_transaction_id) {
      return response.status(400).json({ error: 'missing_kofi_identity' });
    }

    if (!requireRedis(response)) return;

    try {
      const redis = await getRedis();
      if (await redis.sIsMember(KOFI_MESSAGE_SET, payload.message_id)) {
        return response.json({ ok: true, duplicate: true });
      }

      const timestamp = new Date(payload.timestamp || Date.now()).toISOString();
      const shopItems = Array.isArray(payload.shop_items)
        ? payload.shop_items
            .filter((item) => item && typeof item === 'object')
            .map((item) => ({
              direct_link_code: String(item.direct_link_code || ''),
              variation_name: item.variation_name == null ? null : String(item.variation_name),
              quantity: Math.max(1, Number(item.quantity) || 1),
            }))
            .filter((item) => item.direct_link_code)
        : [];

      const payment = {
        messageId: String(payload.message_id),
        transactionId: String(payload.kofi_transaction_id),
        timestamp,
        type: String(payload.type || 'Unknown'),
        isPublic: Boolean(payload.is_public),
        fromName: String(payload.from_name || ''),
        message: payload.message == null ? '' : String(payload.message),
        amount: String(payload.amount || '0'),
        currency: String(payload.currency || '').toUpperCase(),
        emailHash: payload.email ? emailHash(payload.email) : '',
        isSubscriptionPayment: Boolean(payload.is_subscription_payment),
        isFirstSubscriptionPayment: Boolean(payload.is_first_subscription_payment),
        tierName: payload.tier_name == null ? null : String(payload.tier_name),
        shopItems,
        receivedAt: new Date().toISOString(),
      };

      await redis.hSet(KOFI_PAYMENT_HASH, payment.transactionId, JSON.stringify(payment));
      await redis.zAdd(KOFI_PAYMENT_INDEX, { score: Date.parse(timestamp) || Date.now(), value: payment.transactionId });
      await redis.sAdd(KOFI_MESSAGE_SET, payment.messageId);

      return response.json({ ok: true, stored: true });
    } catch (error) {
      console.error('Ko-fi webhook storage error:', error?.message || error);
      return response.status(503).json({ error: 'kofi_storage_failed' });
    }
  }
);

router.get('/api/admin/kofi/payments', async (request, response) => {
  if (!requireRedis(response)) return;
  try {
    const redis = await getRedis();
    const ids = await redis.zRange(KOFI_PAYMENT_INDEX, 0, -1, { REV: true });
    const payments = [];
    for (const id of ids) {
      const raw = await redis.hGet(KOFI_PAYMENT_HASH, id);
      if (!raw) continue;
      try { payments.push(JSON.parse(raw)); } catch {}
    }
    return response.json({
      payments,
      totals: {
        all: payments.length,
        tips: payments.filter((item) => item.type === 'Donation').length,
        shopOrders: payments.filter((item) => item.type === 'Shop Order').length,
        subscriptions: payments.filter((item) => item.type === 'Subscription').length,
      },
    });
  } catch (error) {
    console.error('Ko-fi admin read error:', error?.message || error);
    return response.status(503).json({ error: 'kofi_admin_unavailable' });
  }
});

router.get('/api/admin/buy-first', async (request, response) => {
  if (!requireRedis(response)) return;
  try {
    const redis = await getRedis();
    const values = await redis.hGetAll(BUY_FIRST_HASH);
    const cards = Object.values(values)
      .map((raw) => { try { return JSON.parse(raw); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    return response.json({ cards });
  } catch (error) {
    console.error('Buy-first admin read error:', error?.message || error);
    return response.status(503).json({ error: 'buy_first_admin_unavailable' });
  }
});

router.put('/api/admin/buy-first', async (request, response) => {
  const cards = Array.isArray(request.body?.cards) ? request.body.cards : null;
  if (!cards) return response.status(400).json({ error: 'cards_array_required' });
  if (cards.length > 100) return response.status(400).json({ error: 'too_many_buy_first_cards' });

  const normalized = cards.map(normalizeBuyFirstPrivate);
  if (normalized.some((card) => !isValidCardId(card.id) || !card.title || !card.purchaseUrl || !card.kofiProductCode || !card.content)) {
    return response.status(400).json({
      error: 'each buy-first card needs id, title, purchaseUrl, kofiProductCode and protected content',
    });
  }

  if (!requireRedis(response)) return;

  try {
    const redis = await getRedis();
    const previousIds = await redis.hKeys(BUY_FIRST_HASH);
    const nextIds = new Set(normalized.map((card) => card.id));
    for (const card of normalized) {
      await redis.hSet(BUY_FIRST_HASH, card.id, JSON.stringify(card));
    }
    const removed = previousIds.filter((id) => !nextIds.has(id));
    if (removed.length) await redis.hDel(BUY_FIRST_HASH, removed);
    return response.json({ ok: true, cards: normalized, removed });
  } catch (error) {
    console.error('Buy-first admin write error:', error?.message || error);
    return response.status(503).json({ error: 'buy_first_save_failed' });
  }
});

router.post('/api/buy-first/:id/claim', async (request, response) => {
  const id = String(request.params.id || '').trim();
  const email = normalizeEmail(request.body?.email);
  const transactionId = normalizeTransactionId(request.body?.transactionId);

  if (!isValidCardId(id)) return response.status(400).json({ error: 'invalid_buy_first_id' });
  if (!email || email.length > 320 || !email.includes('@')) return response.status(400).json({ error: 'valid_email_required' });
  if (!transactionId || transactionId.length > 200) return response.status(400).json({ error: 'transaction_id_required' });
  if (!requireRedis(response)) return;

  try {
    const redis = await getRedis();
    const card = await getBuyFirstCard(id);
    if (!card || card.active === false) return response.status(404).json({ error: 'buy_first_not_found' });

    const attemptsKey = 'portfolio:buyfirst:claim-rate:' + emailHash(email) + ':' + id;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 60);
    if (attempts > 12) return response.status(429).json({ error: 'too_many_claim_attempts' });

    const rawPayment = await redis.hGet(KOFI_PAYMENT_HASH, transactionId);
    if (!rawPayment) {
      return response.status(404).json({
        error: 'purchase_not_found',
        message: 'The purchase could not be verified yet. Ko-fi webhooks can take a moment to arrive.',
      });
    }

    let payment;
    try { payment = JSON.parse(rawPayment); } catch { return response.status(503).json({ error: 'purchase_record_invalid' }); }
    if (payment.type !== 'Shop Order') return response.status(400).json({ error: 'not_shop_purchase' });
    if (payment.emailHash !== emailHash(email)) return response.status(403).json({ error: 'purchase_email_mismatch' });

    const purchased = Array.isArray(payment.shopItems)
      ? payment.shopItems.some((item) => item.direct_link_code === card.kofiProductCode)
      : false;
    if (!purchased) return response.status(403).json({ error: 'wrong_kofi_product' });

    const token = randomBytes(32).toString('base64url');
    const access = {
      cardId: id,
      transactionId,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + BUY_FIRST_ACCESS_TTL * 1000).toISOString(),
    };

    await redis.set(
      'portfolio:buyfirst:access:' + token,
      JSON.stringify(access),
      { EX: BUY_FIRST_ACCESS_TTL }
    );

    return response.json({ ok: true, accessToken: token, expiresAt: access.expiresAt });
  } catch (error) {
    console.error('Buy-first claim error:', error?.message || error);
    return response.status(503).json({ error: 'buy_first_claim_failed' });
  }
});

router.post('/api/buy-first/:id/unlock', async (request, response) => {
  const id = String(request.params.id || '').trim();
  const token = String(request.body?.accessToken || '').trim();
  if (!isValidCardId(id) || token.length < 40 || token.length > 200) return response.status(400).json({ error: 'invalid_buy_first_access' });
  if (!requireRedis(response)) return;

  try {
    const redis = await getRedis();
    const raw = await redis.get('portfolio:buyfirst:access:' + token);
    if (!raw) return response.status(403).json({ error: 'buy_first_access_expired' });
    const access = JSON.parse(raw);
    if (access.cardId !== id) return response.status(403).json({ error: 'buy_first_access_invalid' });

    const card = await getBuyFirstCard(id);
    if (!card || card.active === false) return response.status(404).json({ error: 'buy_first_not_found' });

    return response.json({ ok: true, card: { id: card.id, title: card.title, content: card.content } });
  } catch (error) {
    console.error('Buy-first unlock error:', error?.message || error);
    return response.status(503).json({ error: 'buy_first_unlock_failed' });
  }
});

export default router;