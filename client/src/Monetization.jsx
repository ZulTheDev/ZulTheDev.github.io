import { useEffect, useMemo, useState } from 'react';
import { Coffee, ExternalLink, KeyRound, LockKeyhole, Sparkles } from 'lucide-react';

const ACCESS_KEY_PREFIX = 'portfolio-buy-first-access:';

function getSavedAccess(cardId) {
  try {
    return localStorage.getItem(ACCESS_KEY_PREFIX + cardId) || '';
  } catch {
    return '';
  }
}

function saveAccess(cardId, token) {
  try {
    if (token) {
      localStorage.setItem(ACCESS_KEY_PREFIX + cardId, token);
    } else {
      localStorage.removeItem(ACCESS_KEY_PREFIX + cardId);
    }
  } catch {
    // Keep unlock functional even when localStorage is unavailable.
  }
}

function readError(data, fallback) {
  return data?.message || data?.error || fallback;
}

export default function MonetizationSection({
  cards = [],
  kofiUrl = '',
  apiBase = '',
}) {
  const normalizedCards = useMemo(
    () => (Array.isArray(cards) ? cards : []).filter((card) => card?.active !== false),
    [cards]
  );

  const [activeId, setActiveId] = useState(null);
  const [email, setEmail] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [loadingId, setLoadingId] = useState(null);
  const [unlocked, setUnlocked] = useState({});
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const tokens = normalizedCards
      .map((card) => [card.id, getSavedAccess(card.id)])
      .filter(([, token]) => token);

    if (!tokens.length || !apiBase) return;

    let cancelled = false;

    async function restoreAccess() {
      for (const [cardId, token] of tokens) {
        try {
          const response = await fetch(
            `${apiBase}/api/buy-first/${encodeURIComponent(cardId)}/unlock`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken: token }),
            }
          );

          const data = await response.json().catch(() => ({}));

          if (response.ok && data?.card?.content && !cancelled) {
            setUnlocked((current) => ({
              ...current,
              [cardId]: data.card.content,
            }));
          } else if (response.status === 403) {
            saveAccess(cardId, '');
          }
        } catch {
          // The saved token remains available for a later retry.
        }
      }
    }

    restoreAccess();

    return () => {
      cancelled = true;
    };
  }, [apiBase, normalizedCards]);

  function openPurchase(card) {
    setActiveId(card.id);
    setNotice('');
    if (card.purchaseUrl) {
      window.open(card.purchaseUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async function unlock(card) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanTransaction = transactionId.trim();

    if (!apiBase) {
      setNotice('The purchase verification service is not connected yet.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setNotice('Enter the email address used for your Ko-fi purchase.');
      return;
    }

    if (!cleanTransaction) {
      setNotice('Enter your Ko-fi transaction ID or payment URL.');
      return;
    }

    setLoadingId(card.id);
    setNotice('Checking your purchase with Ko-fi records...');

    try {
      const claimResponse = await fetch(
        `${apiBase}/api/buy-first/${encodeURIComponent(card.id)}/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            transactionId: cleanTransaction,
          }),
        }
      );

      const claimData = await claimResponse.json().catch(() => ({}));

      if (!claimResponse.ok) {
        throw new Error(
          readError(
            claimData,
            'Your purchase could not be verified yet.'
          )
        );
      }

      const token = claimData?.accessToken || '';
      if (!token) throw new Error('No access token was returned.');

      const unlockResponse = await fetch(
        `${apiBase}/api/buy-first/${encodeURIComponent(card.id)}/unlock`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token }),
        }
      );

      const unlockData = await unlockResponse.json().catch(() => ({}));

      if (!unlockResponse.ok || !unlockData?.card?.content) {
        throw new Error(
          readError(
            unlockData,
            'The purchase was verified, but the protected content could not be opened.'
          )
        );
      }

      saveAccess(card.id, token);
      setUnlocked((current) => ({
        ...current,
        [card.id]: unlockData.card.content,
      }));
      setNotice('Purchase verified. Your content is unlocked.');
    } catch (error) {
      setNotice(error?.message || 'Unable to verify the purchase right now.');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section id="buy-first" className="support-section">
      <div className="support-header">
        <div>
          <small>06 / SUPPORT</small>
          <h2>Support & buy-first content</h2>
          <p>
            Tip the project if it helped you, or unlock selected deep-dive content after a Ko-fi purchase.
          </p>
        </div>

        {kofiUrl ? (
          <a
            className="support-tip-button"
            href={kofiUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Coffee size={17} />
            Tip via Ko-fi
            <ExternalLink size={15} />
          </a>
        ) : (
          <div className="support-tip-button disabled">
            <Coffee size={17} />
            Ko-fi link not configured
          </div>
        )}
      </div>

      <div className="support-tip-note">
        <Sparkles size={15} />
        <span>Tips stay on Ko-fi. Payment events are recorded by the portfolio backend for your support dashboard.</span>
      </div>

      {normalizedCards.length > 0 && (
        <div className="buy-first-grid">
          {normalizedCards.map((card) => {
            const content = unlocked[card.id];
            const open = activeId === card.id;
            const loading = loadingId === card.id;

            return (
              <article className={content ? 'buy-first-card unlocked' : 'buy-first-card'} key={card.id}>
                {card.cover ? (
                  <img
                    src={card.cover}
                    alt=""
                    className="buy-first-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="buy-first-cover-placeholder">
                    <LockKeyhole size={30} />
                  </div>
                )}

                <div className="buy-first-body">
                  <div className="buy-first-meta">
                    <span>BUY-FIRST</span>
                    {card.price && <strong>{card.price} {card.currency || ''}</strong>}
                  </div>

                  <h3>{card.title}</h3>
                  <p>{card.description || 'Protected content. Purchase access first.'}</p>

                  {content ? (
                    <div className="buy-first-content">
                      <div className="buy-first-content-label">
                        <KeyRound size={14} /> Unlocked
                      </div>
                      <div className="buy-first-content-text">
                        {content.split('\\n').map((line, index) => (
                          <p key={index}>{line || '\u00a0'}</p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="support-buy-button"
                        onClick={() => openPurchase(card)}
                      >
                        <LockKeyhole size={16} />
                        Buy first
                        <ExternalLink size={15} />
                      </button>

                      <button
                        type="button"
                        className="support-unlock-toggle"
                        onClick={() => {
                          setActiveId(open ? null : card.id);
                          setNotice('');
                        }}
                      >
                        {open ? 'Close unlock form' : 'Already purchased? Unlock'}
                      </button>

                      {open && (
                        <div className="buy-first-unlock">
                          <label className="support-field">
                            <span>Ko-fi purchase email</span>
                            <input
                              type="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="you@example.com"
                              autoComplete="email"
                            />
                          </label>

                          <label className="support-field">
                            <span>Transaction ID / payment URL</span>
                            <input
                              value={transactionId}
                              onChange={(event) => setTransactionId(event.target.value)}
                              placeholder="Ko-fi transaction ID"
                              autoComplete="off"
                            />
                          </label>

                          <button
                            type="button"
                            className="support-buy-button"
                            disabled={loading}
                            onClick={() => unlock(card)}
                          >
                            <KeyRound size={16} />
                            {loading ? 'Verifying...' : 'Unlock content'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!normalizedCards.length && (
        <div className="support-empty">
          <LockKeyhole size={22} />
          <strong>No buy-first content is published yet.</strong>
          <span>Use the local admin to create a protected card.</span>
        </div>
      )}

      {notice && <div className="support-notice">{notice}</div>}
    </section>
  );
}