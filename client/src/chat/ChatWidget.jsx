import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { requestChatReply, allBackendsCoolingDown } from './chat-api';
import { localAnswer } from './chat-fallback';

const SESSION_KEY = 'portfolio-ai-chat-session';
const MAX_CHARS = 2000; // matches the server's MAX_MESSAGE_CHARS

const GREETING = [
  { a: 1, t: "Ask me about Zul's work, skills, projects or certifications.", sys: 1 },
];

// Sanitise whatever is in sessionStorage: a malformed entry must never reach
// the render (an object rendered as a React child would crash the whole page).
function readSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (!Array.isArray(parsed)) return GREETING;
    const clean = parsed
      .filter((m) => m && typeof m.t === 'string' && m.t.trim())
      .map((m) => ({ a: m.a ? 1 : undefined, t: m.t.slice(0, 6000), off: m.off ? 1 : undefined, sys: m.sys ? 1 : undefined }))
      .slice(-20);
    return clean.length ? clean : GREETING;
  } catch {
    return GREETING;
  }
}

function writeSession(messages) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-20)));
  } catch {
    /* storage disabled */
  }
}

function ChatInner({ content, bases, Avatar }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState(GREETING);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    setMessages(readSession());
    setReady(true);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (ready) writeSession(messages);
  }, [messages, ready]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, sending, open]);

  const push = (entry) => setMessages((current) => [...current, entry]);

  async function send() {
    const message = question.trim().slice(0, MAX_CHARS);
    if (!message || busy.current) return;

    busy.current = true;
    setSending(true);
    setQuestion('');

    // History = earlier turns only (the server appends `message` itself), and
    // without our own notices/offline answers.
    const history = messages
      .filter((m) => !m.sys && !m.off)
      .slice(-10)
      .map((m) => ({ role: m.a ? 'assistant' : 'user', content: m.t }));

    push({ t: message });

    try {
      let result;

      if (allBackendsCoolingDown(bases)) {
        result = { type: 'unavailable', reason: 'cooling_down' };
      } else {
        abortRef.current = new AbortController();
        result = await requestChatReply({
          bases,
          signal: abortRef.current.signal,
          payload: {
            portfolioId: 'zulfaqar-jamal',
            page: typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '/',
            message,
            history,
            context: content,
          },
        });
      }

      if (result.type === 'reply') {
        setOffline(false);
        push({ a: 1, t: result.reply });
      } else if (result.type === 'rejected') {
        push({ a: 1, t: result.message, sys: 1 });
      } else if (result.reason !== 'aborted') {
        // Live AI is down: answer from the portfolio itself instead of failing.
        setOffline(true);
        push({ a: 1, t: localAnswer(message, content), off: 1 });
      }
    } catch (error) {
      // Defence in depth - requestChatReply never throws, but nothing here
      // may ever escape into React.
      console.error('Chat send failed:', error);
      setOffline(true);
      push({ a: 1, t: localAnswer(message, content), off: 1 });
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <div className="chat">
      {open && (
        <div className="cw">
          <header className="chat-header">
            <div className="chat-title">
              <Avatar size={22} />
              <span>Zul's AI</span>
              {offline && <small className="chat-status">offline mode</small>}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close AI chat">
              <X size={15} />
            </button>
          </header>

          <div className="msgs" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={m.a ? 'bot' : 'usr'} style={{ whiteSpace: 'pre-line' }}>
                {m.t}
                {m.off ? <small className="chat-note">{'\n'}From the portfolio (live AI unavailable)</small> : null}
              </div>
            ))}
            {sending && <div className="bot" style={{ opacity: 0.7 }}>Thinking…</div>}
            <span ref={endRef} />
          </div>

          <footer>
            <input
              value={question}
              maxLength={MAX_CHARS}
              disabled={sending}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent?.isComposing) send();
              }}
              placeholder={sending ? 'Waiting for a reply…' : 'Ask the portfolio...'}
            />
            <button onClick={send} disabled={sending || !question.trim()} aria-label="Send message">
              <ChevronRight />
            </button>
          </footer>
        </div>
      )}

      <button className="cat" onClick={() => setOpen(!open)} aria-label="Open Zul's AI">
        <Avatar size={36} />
      </button>
    </div>
  );
}

// If anything in the chat ever throws while rendering, drop just the chat
// bubble - never the portfolio page around it.
class ChatBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('Chat widget crashed and was disabled:', error);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function ChatWidget(props) {
  return (
    <ChatBoundary>
      <ChatInner {...props} />
    </ChatBoundary>
  );
}
