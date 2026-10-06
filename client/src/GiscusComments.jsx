import { useEffect, useMemo, useState } from 'react';
import Giscus from '@giscus/react';

function normalizeApiBase(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

const API = normalizeApiBase(
  import.meta.env.VITE_API_BASE_URL
);
const COMMENTS_BACKUP_API = normalizeApiBase(
  import.meta.env.VITE_COMMENTS_BACKUP_URL
);

function commentApiCandidates() {
  return [
    COMMENTS_BACKUP_API,
    API,
  ].filter(
    (value, index, list) =>
      value &&
      list.indexOf(value) === index
  );
}

const DEVICE_KEY = 'portfolio-anonymous-device-id';
const DEVICE_COOKIE = 'portfolio-anonymous-device-id';
const NAME_KEY = 'portfolio-anonymous-display-name';
const MAX_USER_REPLIES = 10;
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 730;

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readCookie(name) {
  try {
    const prefix = name + '=';
    const item = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(prefix));

    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  } catch {
    return '';
  }
}

function writeCookie(name, value) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      name + '=' + encodeURIComponent(value) +
      '; Max-Age=' + DEVICE_COOKIE_MAX_AGE +
      '; Path=/; SameSite=Lax' + secure;
  } catch {
    // Ignore unavailable cookies.
  }
}

function validBrowserId(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9-]{20,100}$/.test(value)
  );
}

function getPersistentId() {
  let id = '';

  try {
    id = readCookie(DEVICE_COOKIE);

    if (!validBrowserId(id)) {
      id = localStorage.getItem(DEVICE_KEY) || '';
    }

    if (!validBrowserId(id)) {
      id = createId();
    }

    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    if (!validBrowserId(id)) {
      id = createId();
    }
  }

  writeCookie(DEVICE_COOKIE, id);
  return id;
}

function getSavedName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

function saveName(value) {
  try {
    if (value) {
      localStorage.setItem(NAME_KEY, value);
    } else {
      localStorage.removeItem(NAME_KEY);
    }
  } catch {
    // Storage can be disabled in some browsers.
  }
}

function getLocalKey(term) {
  return `portfolio-anonymous-comments:${term}`;
}

function getLocalStateKey() {
  return 'portfolio-anonymous-comment-state';
}

function readLocalState() {
  try {
    return JSON.parse(
      localStorage.getItem(getLocalStateKey()) || '{}'
    );
  } catch {
    return {};
  }
}

function writeLocalState(state) {
  try {
    localStorage.setItem(
      getLocalStateKey(),
      JSON.stringify(state)
    );
  } catch {
    // Ignore unavailable storage.
  }
}

function cacheReplyCount(
  deviceId,
  discussionTerm,
  count
) {
  const state = readLocalState();

  state[deviceId] = {
    ...(state[deviceId] || {}),
    repliesByTerm: {
      ...(state[deviceId]?.repliesByTerm || {}),
      [discussionTerm]: Math.max(
        0,
        Number(count) || 0
      ),
    },
  };

  writeLocalState(state);
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('en-SG');
}

function normalizeComment(comment) {
  return {
    ...comment,
    parentId: comment.parentId || null,
    canEdit: Boolean(comment.canEdit),
    deleted: Boolean(comment.deleted),
  };
}

export default function GiscusComments({ discussionTerm }) {
  const deviceId = useMemo(() => getPersistentId(), []);

  const [comments, setComments] = useState([]);
  const [name, setName] = useState(() => getSavedName());
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState('');
  const [replyCount, setReplyCount] = useState(0);
  useEffect(() => {
    saveName(name.trim());
  }, [name]);

  async function loadComments() {
    setLoading(true);

    const candidates =
      commentApiCandidates();

    for (const base of candidates) {
      try {
        const response = await fetch(
          `${base}/api/comments?term=${encodeURIComponent(
            discussionTerm
          )}&deviceId=${encodeURIComponent(
            deviceId
          )}`
        );

        if (response.ok) {
          const data = await response.json();

          setComments(
            Array.isArray(data.comments)
              ? data.comments.map(normalizeComment)
              : []
          );

          const remoteReplyCount =
            Number(data.replyCount || 0);

          setReplyCount(
            remoteReplyCount
          );

          cacheReplyCount(
            deviceId,
            discussionTerm,
            remoteReplyCount
          );

          setLoading(false);
          return;
        }
      } catch {
        // Try the next comment backend.
      }
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem(
          getLocalKey(discussionTerm)
        ) || '[]'
      );

      const localComments =
        Array.isArray(saved)
          ? saved.map(normalizeComment)
          : [];

      setComments(localComments);

      const localState = readLocalState();

      setReplyCount(
        Number(
          localState?.[deviceId]
            ?.repliesByTerm?.[discussionTerm] || 0
        )
      );
    } catch {
      setComments([]);
      setReplyCount(0);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadComments();
  }, [discussionTerm, deviceId]);

  function resetComposer() {
    setReplyTo(null);
    setComment('');
    setNotice('');
  }

  function startReply(item) {
    setEditingId(null);
    setEditingText('');
    setReplyTo(item);
    setComment('');
    setNotice('');
  }

  function startEdit(item) {
    if (!item.canEdit || item.deleted) {
      return;
    }

    setReplyTo(null);
    setEditingId(item.id);
    setEditingText(item.comment || '');
    setNotice('');
  }

  async function removeComment(item) {
    if (!item.canEdit) {
      return;
    }

    const confirmed = window.confirm(
      'Delete your comment? Your replies remain visible.'
    );

    if (!confirmed) {
      return;
    }

    setNotice('');

    const candidates =
      commentApiCandidates();

    for (const base of candidates) {
      try {
        const response = await fetch(
          `${base}/api/comments/${encodeURIComponent(item.id)}`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              deviceId,
            }),
          }
        );

        if (response.ok) {
          await loadComments();
          setNotice('Your comment was deleted.');
          return;
        }

        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 404
        ) {
          const data =
            await response
              .json()
              .catch(() => ({}));

          setNotice(
            data?.error ||
              'Unable to delete the comment.'
          );
          return;
        }
      } catch {
        // Try the backup backend.
      }
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem(
          getLocalKey(discussionTerm)
        ) || '[]'
      );

      const next =
        Array.isArray(saved)
          ? saved.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    deleted: true,
                    comment: '',
                    updatedAt:
                      new Date().toISOString(),
                  }
                : entry
            )
          : [];

      localStorage.setItem(
        getLocalKey(discussionTerm),
        JSON.stringify(next)
      );

      setComments(
        next.map(normalizeComment)
      );
      setNotice('Your comment was deleted.');
    } catch {
      setNotice(
        'Unable to delete the comment right now.'
      );
    }
  }

  async function saveEdit(event) {
    event.preventDefault();

    const cleanComment =
      editingText.trim();

    if (!cleanComment) {
      setNotice(
        'Please write a comment first.'
      );
      return;
    }

    if (cleanComment.length > 2000) {
      setNotice(
        'Comment must be 2000 characters or less.'
      );
      return;
    }

    setPosting(true);
    setNotice('');

    const candidates =
      commentApiCandidates();

    try {
      for (const base of candidates) {
        const response = await fetch(
          `${base}/api/comments/${encodeURIComponent(
            editingId
          )}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              deviceId,
              comment: cleanComment,
            }),
          }
        );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (response.ok) {
          setComments(
            (current) =>
              current.map((item) =>
                item.id === editingId
                  ? normalizeComment(
                      data.comment
                    )
                  : item
              )
          );

          setEditingId(null);
          setEditingText('');
          setNotice('Comment updated.');
          return;
        }

        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 404
        ) {
          setNotice(
            data?.error ||
              'Unable to edit the comment.'
          );
          return;
        }
      }

      throw new Error('edit_failed');
    } catch {
      setNotice(
        'Unable to edit the comment right now.'
      );
    } finally {
      setPosting(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();

    const cleanName =
      name.trim();

    const cleanComment =
      comment.trim();

    if (!cleanName) {
      setNotice(
        'Please enter your name or nickname first.'
      );
      return;
    }

    if (!cleanComment) {
      setNotice(
        'Please write a comment first.'
      );
      return;
    }

    if (cleanName.length > 50) {
      setNotice(
        'Name must be 50 characters or less.'
      );
      return;
    }

    if (cleanComment.length > 2000) {
      setNotice(
        'Comment must be 2000 characters or less.'
      );
      return;
    }

    const isReply =
      Boolean(replyTo);

    if (
      isReply &&
      replyCount >= MAX_USER_REPLIES
    ) {
      setNotice(
        'Reply limit reached for this anonymous browser (' +
          MAX_USER_REPLIES +
          ').'
      );
      return;
    }

    setPosting(true);
    setNotice('');

    const payload = {
      term: discussionTerm,
      name: cleanName,
      comment: cleanComment,
      parentId:
        replyTo?.id || null,
      deviceId,
    };

    try {
      const candidates =
        commentApiCandidates();

      for (const base of candidates) {
        const response = await fetch(
          `${base}/api/comments`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(payload),
          }
        );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (response.ok) {
          setComments(
            (current) => [
              normalizeComment(
                data.comment
              ),
              ...current,
            ]
          );

          setName(cleanName);
          setComment('');
          setReplyTo(null);

          if (isReply) {
            const nextReplyCount =
              replyCount + 1;

            setReplyCount(
              nextReplyCount
            );

            cacheReplyCount(
              deviceId,
              discussionTerm,
              nextReplyCount
            );
          }

          setNotice(
            isReply
              ? 'Reply posted anonymously.'
              : 'Posted anonymously.'
          );

          return;
        }

        if (response.status === 429) {
          setNotice(
            data?.message ||
              'Reply limit reached for this anonymous browser (' +
              MAX_USER_REPLIES +
              ').'
          );
          return;
        }

        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 404
        ) {
          setNotice(
            data?.error ||
              'Unable to post the comment.'
          );
          return;
        }
      }

      throw new Error(
        'comment_api_unavailable'
      );
    } catch {
      try {
        const nextComment = {
          id: createId(),
          term: discussionTerm,
          name: cleanName,
          comment: cleanComment,
          createdAt:
            new Date().toISOString(),
          parentId:
            replyTo?.id || null,
          ownerId: deviceId,
          canEdit: true,
          localOnly: true,
        };

        const key =
          getLocalKey(
            discussionTerm
          );

        const saved = JSON.parse(
          localStorage.getItem(key) ||
            '[]'
        );

        const next = [
          nextComment,
          ...(Array.isArray(saved)
            ? saved
            : []),
        ];

        localStorage.setItem(
          key,
          JSON.stringify(next)
        );

        if (isReply) {
          const state =
            readLocalState();

          state[deviceId] = {
            ...(state[deviceId] || {}),
            repliesByTerm: {
              ...(state[deviceId]?.repliesByTerm || {}),
              [discussionTerm]:
                Number(
                  state[deviceId]
                    ?.repliesByTerm?.[discussionTerm] || 0
                ) + 1,
            },
          };

          writeLocalState(
            state
          );

          setReplyCount(
            (current) =>
              current + 1
          );
        }

        setComments(
          next.map(normalizeComment)
        );

        setName(cleanName);
        setComment('');
        setReplyTo(null);

        setNotice(
          'Saved on this device. Cloud and local comment servers are unavailable.'
        );
      } catch {
        setNotice(
          'Unable to post the comment right now.'
        );
      }
    } finally {
      setPosting(false);
    }
  }

  const repliesByParent = useMemo(() => {
    const map = new Map();

    for (const item of comments) {
      if (!item.parentId) {
        continue;
      }

      if (!map.has(item.parentId)) {
        map.set(item.parentId, []);
      }

      map.get(item.parentId).push(item);
    }

    return map;
  }, [comments]);

  function renderComment(item, depth = 0) {
    const children = repliesByParent.get(item.id) || [];

    return (
      <article
        className={[
          'anonymous-comment',
          depth > 0 ? 'anonymous-comment-reply' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        key={item.id}
      >
        <header>
          <strong>
            {item.deleted ? 'Anonymous' : item.name}
          </strong>

          <time>
            {formatDate(item.updatedAt || item.createdAt)}
            {item.updatedAt && !item.deleted ? ' · edited' : ''}
          </time>
        </header>

        {editingId === item.id ? (
          <form
            className="anonymous-edit-form"
            onSubmit={saveEdit}
          >
            <textarea
              value={editingText}
              onChange={(event) =>
                setEditingText(event.target.value)
              }
              maxLength={2000}
              rows={3}
              autoFocus
            />

            <div className="anonymous-comment-actions">
              <button
                type="submit"
                disabled={posting}
              >
                {posting ? 'Saving…' : 'Save edit'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEditingText('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p>
            {item.deleted
              ? 'This comment was deleted by its author.'
              : item.comment}
          </p>
        )}

        {!item.deleted && (
          <div className="anonymous-comment-controls">
            <button
              type="button"
              onClick={() => startReply(item)}
            >
              Reply
            </button>

            {item.canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                >
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => removeComment(item)}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {children.length > 0 && (
          <div className="anonymous-comment-children">
            {children.map((child) =>
              renderComment(
                child,
                Math.min(depth + 1, 6)
              )
            )}
          </div>
        )}
      </article>
    );
  }

  const canReply =
    replyCount < MAX_USER_REPLIES;

  return (
    <section className="portfolio-comments">
      <div className="portfolio-comments-header">
        <span className="comments-kicker">
          DISCUSSION // COMMUNITY
        </span>

        <h3>
          Discuss this item
        </h3>

        <p>
          Anonymous comments use a private browser ID stored in a
          first-party cookie and local browser storage. Your name is
          remembered on this browser. No IP address or device fingerprint
          is required. Clearing browser storage or cookies removes the
          anonymous ownership access.
        </p>
      </div>

      {replyTo && (
        <div className="replying-to">
          Replying to <strong>{replyTo.name}</strong>
          <button
            type="button"
            onClick={resetComposer}
            aria-label="Cancel reply"
          >
            Cancel
          </button>
        </div>
      )}

      <form
        className="anonymous-comment-form"
        onSubmit={submitComment}
      >
        <div className="anonymous-comment-row">
          <label>
            <span>Name / nickname</span>
            <input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              maxLength={50}
              placeholder="Enter your name"
              autoComplete="nickname"
            />
          </label>

          <div className="anonymous-comment-badge">
            ANONYMOUS
          </div>
        </div>

        <label>
          <span>
            {replyTo ? 'Reply' : 'Comment'}
          </span>
          <textarea
            value={comment}
            onChange={(event) =>
              setComment(event.target.value)
            }
            maxLength={2000}
            rows={4}
            placeholder={
              replyTo
                ? 'Write a reply...'
                : 'Write something about this item...'
            }
          />
        </label>

        <div className="anonymous-comment-actions">
          <button
            type="submit"
            disabled={posting || (replyTo && !canReply)}
          >
            {posting
              ? 'Posting…'
              : replyTo
                ? 'Post reply'
                : 'Post anonymously'}
          </button>

          <small>
            {comment.length}/2000
            {replyTo
              ? ' · ' +
                Math.max(
                  0,
                  MAX_USER_REPLIES - replyCount
                ) +
                ' replies left'
              : ''}
          </small>
        </div>

        {notice && (
          <p className="anonymous-comment-notice">
            {notice}
          </p>
        )}
      </form>

      <div className="anonymous-comment-list">
        <div className="anonymous-comment-list-header">
          <span>ANONYMOUS COMMENTS</span>
          <span>{comments.length}</span>
        </div>

        {loading ? (
          <div className="anonymous-comment-empty">
            Loading comments…
          </div>
        ) : comments.length === 0 ? (
          <div className="anonymous-comment-empty">
            No anonymous comments yet. Be the first.
          </div>
        ) : (
          comments
            .filter((item) => !item.parentId)
            .map((item) => renderComment(item))
        )}
      </div>

      <div className="github-comment-divider">
        <span>OR COMMENT WITH GITHUB</span>
      </div>

      <Giscus
        repo="ZulTheDev/ZulTheDev.github.io"
        repoId="R_kgDOQ7JCjA"
        category="General"
        categoryId="DIC_kwDOQ7JCjM4DG4UY"
        mapping="specific"
        term={discussionTerm}
        strict="1"
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="top"
        theme="dark"
        lang="en"
        loading="lazy"
      />
    </section>
  );
}
