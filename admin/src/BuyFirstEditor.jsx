import { useEffect, useState } from 'react';
import { Coffee, ExternalLink, LockKeyhole, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';

const EMPTY_CARD = {
  id: '',
  title: '',
  description: '',
  cover: '',
  price: '',
  currency: 'SGD',
  purchaseUrl: '',
  kofiProductCode: '',
  content: '',
  active: true,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanCard(card) {
  return {
    id: String(card?.id || '').trim(),
    title: String(card?.title || '').trim(),
    description: String(card?.description || '').trim(),
    cover: String(card?.cover || '').trim(),
    price: String(card?.price || '').trim(),
    currency: String(card?.currency || '').trim().toUpperCase(),
    purchaseUrl: String(card?.purchaseUrl || '').trim(),
    kofiProductCode: String(card?.kofiProductCode || '').trim(),
    content: String(card?.content || ''),
    active: card?.active !== false,
  };
}

function publicCard(card) {
  const cleaned = cleanCard(card);
  return {
    id: cleaned.id,
    title: cleaned.title,
    description: cleaned.description,
    cover: cleaned.cover,
    price: cleaned.price,
    currency: cleaned.currency,
    purchaseUrl: cleaned.purchaseUrl,
    kofiProductCode: cleaned.kofiProductCode,
    active: cleaned.active,
  };
}

function makeCardId() {
  return `buy-first-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function BuyFirstEditor({
  api,
  content,
  setContent,
  savePublicContent,
  setNotice,
}) {
  const [cards, setCards] = useState(() =>
    Array.isArray(content?.buyFirst)
      ? content.buyFirst.map((card) => ({ ...EMPTY_CARD, ...clone(card) }))
      : []
  );
  const [kofiUrl, setKofiUrl] = useState(content?.settings?.kofiUrl || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentTotals, setPaymentTotals] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`${api}/api/admin/buy-first`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || data?.error || `API returned ${response.status}`);

        if (mounted) {
          setCards(Array.isArray(data.cards) ? data.cards.map((card) => ({ ...EMPTY_CARD, ...card })) : []);
          setNotice('Loaded private buy-first cards from Redis.');
        }
      } catch (error) {
        if (mounted) setNotice('Buy-first storage unavailable: ' + error.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (api) load();
    else setNotice('No local API is configured for buy-first management.');

    return () => { mounted = false; };
  }, [api]);

  function updateCard(index, field, value) {
    setCards((current) => current.map((card, cardIndex) =>
      cardIndex === index ? { ...card, [field]: value } : card
    ));
  }

  function addCard() {
    setCards((current) => [
      ...current,
      { ...EMPTY_CARD, id: makeCardId(), title: 'New protected content' },
    ]);
  }

  function removeCard(index) {
    setCards((current) => current.filter((_, cardIndex) => cardIndex !== index));
  }

  async function save() {
    if (!api) return;

    const normalized = cards.map(cleanCard);
    const invalid = normalized.find((card) =>
      !card.id ||
      !card.title ||
      !card.purchaseUrl ||
      !card.kofiProductCode ||
      !card.content
    );

    if (invalid) {
      setNotice('Every buy-first card needs an ID, title, Ko-fi purchase URL, Ko-fi product code and protected content.');
      return;
    }

    setSaving(true);
    try {
      const privateResponse = await fetch(`${api}/api/admin/buy-first`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: normalized }),
      });
      const privateData = await privateResponse.json().catch(() => ({}));
      if (!privateResponse.ok) {
        throw new Error(privateData?.message || privateData?.error || `Redis save failed (${privateResponse.status})`);
      }

      const nextContent = {
        ...content,
        buyFirst: normalized.map(publicCard),
        settings: {
          ...(content?.settings || {}),
          kofiUrl: kofiUrl.trim(),
        },
      };

      const saved = await savePublicContent(nextContent);
      setContent(saved);
      setCards(normalized);
      setNotice('Buy-first cards saved. Protected text stays in Redis; only public card metadata is published.');
    } catch (error) {
      setNotice('Buy-first save failed: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function loadPayments() {
    if (!api) return;
    setPaymentLoading(true);
    try {
      const response = await fetch(`${api}/api/admin/kofi/payments`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || data?.error || `API returned ${response.status}`);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
      setPaymentTotals(data.totals || null);
      setNotice('Loaded Ko-fi payment events from Redis.');
    } catch (error) {
      setNotice('Ko-fi payment records unavailable: ' + error.message);
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <div className="buy-first-admin-grid">
      <section className="panel">
        <div className="panel-head">
          <div>
            <small>MONETIZATION</small>
            <h2>Ko-fi & buy-first</h2>
          </div>
          <button className="accent-button" type="button" onClick={save} disabled={saving || loading}>
            <Save size={15} /> {saving ? 'Saving...' : 'Save monetization'}
          </button>
        </div>

        <div className="buy-first-admin-note">
          <LockKeyhole size={17} />
          <div>
            <strong>Protected content stays server-side</strong>
            <span>The public site receives title/price/teaser metadata only. The actual content is returned after a verified Ko-fi purchase.</span>
          </div>
        </div>

        <div className="form-grid">
          <label className="field wide">
            <span>Ko-fi tip / shop URL</span>
            <input
              value={kofiUrl}
              onChange={(event) => setKofiUrl(event.target.value)}
              placeholder="https://ko-fi.com/yourpage"
            />
          </label>
        </div>

        <div className="panel-head compact">
          <div>
            <small>PAID CONTENT</small>
            <h2>Buy-first cards</h2>
          </div>
          <button className="ghost" type="button" onClick={addCard}>
            <Plus size={15} /> Add buy-first card
          </button>
        </div>

        {loading && <div className="media-empty">Loading protected cards...</div>}

        {!loading && !cards.length && (
          <div className="media-empty">No protected cards yet. Add one, then connect its Ko-fi Shop product code.</div>
        )}

        <div className="buy-first-admin-list">
          {cards.map((card, index) => (
            <article className="buy-first-admin-card" key={card.id || index}>
              <div className="buy-first-admin-card-head">
                <div>
                  <small>BUY-FIRST #{index + 1}</small>
                  <strong>{card.title || 'Untitled protected card'}</strong>
                </div>
                <button className="delete-button compact" type="button" onClick={() => removeCard(index)}>
                  <Trash2 size={14} /> Remove
                </button>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>ID</span>
                  <input value={card.id || ''} onChange={(event) => updateCard(index, 'id', event.target.value)} />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input value={card.title || ''} onChange={(event) => updateCard(index, 'title', event.target.value)} />
                </label>
                <label className="field">
                  <span>Price</span>
                  <input value={card.price || ''} onChange={(event) => updateCard(index, 'price', event.target.value)} placeholder="5.00" />
                </label>
                <label className="field">
                  <span>Currency</span>
                  <input value={card.currency || 'SGD'} onChange={(event) => updateCard(index, 'currency', event.target.value)} />
                </label>
                <label className="field wide">
                  <span>Short description / teaser</span>
                  <textarea rows={3} value={card.description || ''} onChange={(event) => updateCard(index, 'description', event.target.value)} />
                </label>
                <label className="field wide">
                  <span>Ko-fi purchase URL</span>
                  <input value={card.purchaseUrl || ''} onChange={(event) => updateCard(index, 'purchaseUrl', event.target.value)} placeholder="Paste the Ko-fi Shop product link" />
                </label>
                <label className="field wide">
                  <span>Ko-fi product code</span>
                  <input value={card.kofiProductCode || ''} onChange={(event) => updateCard(index, 'kofiProductCode', event.target.value)} placeholder="direct_link_code from Ko-fi webhook" />
                </label>
                <label className="field wide">
                  <span>Cover image URL (optional)</span>
                  <input value={card.cover || ''} onChange={(event) => updateCard(index, 'cover', event.target.value)} placeholder="/buy-first/cover.jpg or an external URL" />
                </label>
                <label className="field wide">
                  <span>Protected content</span>
                  <textarea rows={10} value={card.content || ''} onChange={(event) => updateCard(index, 'content', event.target.value)} placeholder="Only buyers who pass Ko-fi verification can retrieve this text." />
                </label>
              </div>

              <label className="buy-first-active-toggle">
                <input type="checkbox" checked={card.active !== false} onChange={(event) => updateCard(index, 'active', event.target.checked)} />
                <span>Publish this card on the portfolio</span>
              </label>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <small>KO-FI EVENTS</small>
            <h2>Tip & purchase records</h2>
          </div>
          <button className="ghost" type="button" onClick={loadPayments} disabled={paymentLoading}>
            <RefreshCw size={15} /> {paymentLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <p className="helper">Ko-fi sends payment webhooks to the backend. Tip records and Shop Order records are kept in Redis; no raw supporter email is stored here.</p>

        {paymentTotals && (
          <div className="stat-grid">
            <div className="stat-card"><small>All events</small><strong>{paymentTotals.all || 0}</strong></div>
            <div className="stat-card"><small>Tips</small><strong>{paymentTotals.tips || 0}</strong></div>
            <div className="stat-card"><small>Shop orders</small><strong>{paymentTotals.shopOrders || 0}</strong></div>
            <div className="stat-card"><small>Subscriptions</small><strong>{paymentTotals.subscriptions || 0}</strong></div>
          </div>
        )}

        {!payments.length && <div className="media-empty">No Ko-fi events loaded yet.</div>}

        <div className="kofi-payment-list">
          {payments.slice(0, 30).map((payment) => (
            <article className="kofi-payment-card" key={payment.transactionId || payment.messageId}>
              <div>
                <strong>{payment.fromName || 'Supporter'}</strong>
                <small>{payment.type} · {payment.transactionId}</small>
              </div>
              <strong>{payment.amount} {payment.currency}</strong>
              <small>{payment.timestamp ? new Date(payment.timestamp).toLocaleString() : ''}</small>
              {payment.message && <p>{payment.message}</p>}
              {Array.isArray(payment.shopItems) && payment.shopItems.length > 0 && (
                <small>Products: {payment.shopItems.map((item) => item.direct_link_code).join(', ')}</small>
              )}
            </article>
          ))}
        </div>

        <div className="buy-first-webhook-help">
          <Coffee size={17} />
          <div>
            <strong>Ko-fi setup</strong>
            <span>Set the webhook URL to <code>/api/kofi/webhook</code> on your deployed API and put the Ko-fi verification token in the server environment. For each Shop product, copy its direct-link product code into the matching card.</span>
            <a href="https://ko-fi.com/manage/webhooks" target="_blank" rel="noreferrer">Open Ko-fi webhook settings <ExternalLink size={13} /></a>
          </div>
        </div>
      </section>
    </div>
  );
}