import { useEffect, useState } from 'react';
import Giscus from '@giscus/react';

const API = import.meta.env.VITE_API_BASE_URL || '';

function getLocalKey(term) {
  return `portfolio-anonymous-comments:${term}`;
}

export default function GiscusComments({ discussionTerm }) {
  const [comments, setComments] = useState([]);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState('');

  async function loadComments() {
    setLoading(true);

    try {
      if (API) {
        const response = await fetch(
          `${API}/api/comments?term=${encodeURIComponent(discussionTerm)}`
        );

        if (response.ok) {
          const data = await response.json();
          setComments(Array.isArray(data.comments) ? data.comments : []);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fall back to comments stored in this browser.
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem(getLocalKey(discussionTerm)) || '[]'
      );

      setComments(Array.isArray(saved) ? saved : []);
    } catch {
      setComments([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadComments();
  }, [discussionTerm]);

  async function submitAnonymousComment(event) {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanComment = comment.trim();

    if (!cleanName) {
      setNotice('Please enter your name or nickname first.');
      return;
    }

    if (!cleanComment) {
      setNotice('Please write a comment first.');
      return;
    }

    if (cleanName.length > 50) {
      setNotice('Name must be 50 characters or less.');
      return;
    }

    if (cleanComment.length > 2000) {
      setNotice('Comment must be 2000 characters or less.');
      return;
    }

    setPosting(true);
    setNotice('');

    const payload = {
      term: discussionTerm,
      name: cleanName,
      comment: cleanComment,
    };

    try {
      if (API) {
        const response = await fetch(`${API}/api/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setComments((current) => [
            data.comment,
            ...current,
          ]);
          setName('');
          setComment('');
          setNotice('Posted anonymously.');
          setPosting(false);
          return;
        }

        throw new Error(data?.error || 'comment_post_failed');
      }

      throw new Error('comment_api_unavailable');
    } catch {
      // Local fallback so the form still works if the API is unavailable.
      try {
        const nextComment = {
          id: `local-${Date.now()}`,
          term: discussionTerm,
          name: cleanName,
          comment: cleanComment,
          createdAt: new Date().toISOString(),
          localOnly: true,
        };

        const key = getLocalKey(discussionTerm);
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        const next = [nextComment, ...(Array.isArray(saved) ? saved : [])];

        localStorage.setItem(key, JSON.stringify(next));
        setComments(next);
        setName('');
        setComment('');
        setNotice('Saved on this device. Server comments are unavailable.');
      } catch {
        setNotice('Unable to post the comment right now.');
      }
    } finally {
      setPosting(false);
    }
  }

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
          Anonymous visitors can enter a name or nickname and
          leave a comment without signing in to GitHub.
        </p>
      </div>

      <form
        className="anonymous-comment-form"
        onSubmit={submitAnonymousComment}
      >
        <div className="anonymous-comment-row">
          <label>
            <span>Name / nickname</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
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
          <span>Comment</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Write something about this item..."
          />
        </label>

        <div className="anonymous-comment-actions">
          <button
            type="submit"
            disabled={posting}
          >
            {posting ? 'Posting…' : 'Post anonymously'}
          </button>

          <small>
            {comment.length}/2000
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
          comments.map((item) => (
            <article
              className="anonymous-comment"
              key={item.id}
            >
              <header>
                <strong>{item.name}</strong>
                <time>
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleString('en-SG')
                    : ''}
                </time>
              </header>

              <p>{item.comment}</p>

              {item.localOnly && (
                <small className="anonymous-local-note">
                  saved on this device
                </small>
              )}
            </article>
          ))
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
