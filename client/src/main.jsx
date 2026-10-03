import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import GiscusComments from './GiscusComments';
import {
  ArrowUpRight,
  ChevronRight,
  X,
  Sparkles,
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_BASE_URL || '';

const ANONYMOUS_DEVICE_KEY = 'portfolio-anonymous-device-id';
const ANONYMOUS_SESSION_KEY = 'portfolio-comment-session-id';

function getAnonymousIdentity() {
  let deviceId = '';
  let sessionId = '';

  try {
    deviceId =
      localStorage.getItem(ANONYMOUS_DEVICE_KEY) || '';

    if (!deviceId) {
      deviceId =
        globalThis.crypto?.randomUUID?.() ||
        `anon-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      localStorage.setItem(
        ANONYMOUS_DEVICE_KEY,
        deviceId
      );
    }

    sessionId =
      sessionStorage.getItem(ANONYMOUS_SESSION_KEY) ||
      '';

    if (!sessionId) {
      sessionId =
        globalThis.crypto?.randomUUID?.() ||
        `session-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      sessionStorage.setItem(
        ANONYMOUS_SESSION_KEY,
        sessionId
      );
    }
  } catch {
    deviceId =
      globalThis.crypto?.randomUUID?.() ||
      `anon-${Date.now()}`;

    sessionId =
      globalThis.crypto?.randomUUID?.() ||
      `session-${Date.now()}`;
  }

  return {
    deviceId,
    sessionId,
  };
}

const GAMES =
  import.meta.env.VITE_GAMES_URL ||
  'https://YOUR-GAMES-REPO.github.io/';

const date = (value) =>
  value
    ? new Date(`${value}-01`).toLocaleDateString('en-SG', {
        month: 'short',
        year: 'numeric',
      })
    : 'Present';

const months = (start, end) => {
  const startDate = new Date(`${start}-01`);
  const endDate = end
    ? new Date(`${end}-01`)
    : new Date();

  return Math.max(
    1,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      endDate.getMonth() -
      startDate.getMonth() +
      1
  );
};

/* =========================================================
   CONTENT NORMALIZATION
   Keeps the client safe when the CMS/API has optional fields.
========================================================= */

function normalizeAssetPath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  let normalized = value.trim();

  // Keep external/data/blob URLs untouched.
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('//') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:')
  ) {
    return normalized;
  }

  // Vite's public/ directory is served from the site root.
  while (normalized.startsWith('../public/')) {
    normalized = normalized.slice('../public'.length);
  }

  if (normalized.startsWith('./public/')) {
    normalized = normalized.slice('./public'.length);
  } else if (normalized.startsWith('public/')) {
    normalized = normalized.slice('public'.length);
  } else if (normalized.startsWith('/public/')) {
    normalized = normalized.slice('/public'.length);
  }

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  return normalized;
}

function normalizeContent(data) {
  const source = data || {};
  const profile = source.profile || {};
  const profileImage = profile.image || profile.photo || {};
  const links = Array.isArray(profile.links)
    ? profile.links
    : [profile.linkedin, profile.github, profile.website, profile.email]
        .filter(Boolean);

  return {
    ...source,
    profile: {
      ...profile,
      name: profile.name || 'Zulfaqar Jamal',
      summary: profile.summary || '',
      pronouns: profile.pronouns || '',
      links,
      image: {
        ...profileImage,
        local:
          normalizeAssetPath(profileImage.local) ||
          '/images/profile.png',
      },
    },
    explore: Array.isArray(source.explore) ? source.explore : [],
    recent: Array.isArray(source.recent) ? source.recent : [],
    certifications: Array.isArray(source.certifications) ? source.certifications : [],
    achievements: Array.isArray(source.achievements) ? source.achievements : [],
    awards: Array.isArray(source.awards) ? source.awards : [],
    projects: Array.isArray(source.projects) ? source.projects : [],
    research: Array.isArray(source.research) ? source.research : [],
    experience: Array.isArray(source.experience) ? source.experience : [],
    education: Array.isArray(source.education) ? source.education : [],
  };
}

/* =========================================================
   HORIZONTAL CONTENT RAIL
========================================================= */

function Rail({ items, onOpen }) {
  return (
    <div className="rail">
      {items.length === 0 ? (
        <div className="card card-empty">
          <small>CONTENT MANAGER</small>
          <h3>No entries yet</h3>
          <p>Add items from the admin content manager.</p>
        </div>
      ) : (items.map((item) => (
        <button
          className="card"
          key={item.id}
          onClick={() => onOpen(item)}
        >
          <small>
            {item.issuer ||
              item.category ||
              'Portfolio'}
          </small>

          <h3>{item.title}</h3>

          <p>{item.description}</p>

          <b>
            Open <ArrowUpRight size={14} />
          </b>
        </button>
      )))}
    </div>
  );
}

/* =========================================================
   CERTIFICATION / AWARD / PROJECT MODAL
========================================================= */

function Modal({ item, type, close }) {
  const media = item.media?.length
    ? item.media
    : [
        {
          type: 'text',
          title: item.title,
          body: item.description,
        },
      ];

  return (
    <div
      className="back"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div className="modal">
        <button
          className="x"
          onClick={close}
          aria-label="Close modal"
        >
          <X />
        </button>

        {/* ---------------------------------------------
            MEDIA SIDEBAR
        --------------------------------------------- */}

        <aside>
          <small>{type}</small>

          {media.map((mediaItem, index) => (
            <div
              className="mi"
              key={index}
            >
              <em>{mediaItem.type}</em>

              <strong>
                {mediaItem.title ||
                  `Media ${index + 1}`}
              </strong>
            </div>
          ))}
        </aside>

        {/* ---------------------------------------------
            MAIN MODAL CONTENT
        --------------------------------------------- */}

        <section>
          <div className="preview">
            {media[0].type === 'image' ? (
              <img
                src={normalizeAssetPath(media[0].src)}
                alt={
                  media[0].title ||
                  item.title
                }
              />
            ) : (
              <div>
                <Sparkles />

                <h2>
                  {media[0].title ||
                    item.title}
                </h2>

                <p>
                  {media[0].body ||
                    item.description}
                </p>
              </div>
            )}
          </div>

          <div className="desc">
            <small>Description</small>

            <p>
              {media[0].description ||
                media[0].body ||
                item.description ||
                'No description provided.'}
            </p>
          </div>

          {/* -----------------------------------------
              GISCUS DISCUSSION
          ----------------------------------------- */}

          <GiscusComments
            discussionTerm={`portfolio:${item.id}`}
          />
        </section>
      </div>
    </div>
  );
}

/* =========================================================
   WORK EXPERIENCE MODAL
========================================================= */

function ExpModal({ x, close }) {
  return (
    <div
      className="back"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div className="expmodal">
        <button
          className="x"
          onClick={close}
          aria-label="Close modal"
        >
          <X />
        </button>

        {/* ---------------------------------------------
            EXPERIENCE MEDIA AREA
        --------------------------------------------- */}

        <div className="expmedia">
          ฅ^•ﻌ•^ฅ
        </div>

        {/* ---------------------------------------------
            EXPERIENCE DETAILS
        --------------------------------------------- */}

        <div className="expbody">
          <small>
            {date(x.start)} — {date(x.end)}
          </small>

          <h2>{x.role}</h2>

          <p>
            {x.company} · {x.location}
          </p>

          <h4>What I did</h4>

          <p>{x.summary}</p>

          {x.elaboration && (
            <>
              <h4>Elaboration</h4>
              <p>{x.elaboration}</p>
            </>
          )}

          {x.reflection && (
            <>
              <h4>Reflection</h4>
              <p>{x.reflection}</p>
            </>
          )}

          {/* -----------------------------------------
              SKILL TAGS
          ----------------------------------------- */}

          <div className="tags">
            {[
              'Leadership',
              'Problem Solving',
              'Communication',
              'Technology',
            ].map((tag) => (
              <span key={tag}>
                {tag}
              </span>
            ))}
          </div>

          {/* -----------------------------------------
              GISCUS EXPERIENCE DISCUSSION
          ----------------------------------------- */}

          <GiscusComments
            discussionTerm={`portfolio:experience-${x.id}`}
          />
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   AI CHAT
   Browser session only: refresh keeps the conversation;
   closing the browser session clears it. The server does not
   persist chat history.
========================================================= */

const CHAT_SESSION_KEY = 'portfolio-ai-chat-session';

function readChatSession() {
  try {
    const saved = sessionStorage.getItem(CHAT_SESSION_KEY);

    if (!saved) {
      return [
        {
          a: 1,
          t: "Ask me about Zul's work, skills, projects or certifications.",
        },
      ];
    }

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed) && parsed.length
      ? parsed.slice(-20)
      : [];
  } catch {
    return [
      {
        a: 1,
        t: "Ask me about Zul's work, skills, projects or certifications.",
      },
    ];
  }
}

function writeChatSession(messages) {
  try {
    sessionStorage.setItem(
      CHAT_SESSION_KEY,
      JSON.stringify(messages.slice(-20))
    );
  } catch {
    // Session storage may be disabled.
  }
}

const ONLINE_API =
  import.meta.env.VITE_ONLINE_API_URL ||
  import.meta.env.VITE_COMMENTS_BACKUP_URL ||
  '';

function Chat({ content }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] =
    useState(() => readChatSession());

  useEffect(() => {
    writeChatSession(messages);
  }, [messages]);

  async function send() {
    const message = question.trim();

    if (!message) {
      return;
    }

    setQuestion('');

    const nextMessages = [
      ...messages,
      {
        t: message,
      },
    ];

    setMessages(nextMessages);

    const history = nextMessages
      .slice(-12)
      .map((item) => ({
        role: item.a ? 'assistant' : 'user',
        content: item.t,
      }));

    const endpoints = [
      ONLINE_API,
      API,
    ].filter(
      (value, index, list) =>
        value &&
        list.indexOf(value) === index
    );

    for (const base of endpoints) {
      try {
        const response = await fetch(
          base + '/api/chat',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              history,
              context: content,
            }),
          }
        );

        const data =
          await response.json()
            .catch(() => ({}));

        if (response.ok) {
          setMessages((current) => [
            ...current,
            {
              a: 1,
              t:
                data.reply ||
                'No reply available.',
            },
          ]);

          return;
        }
      } catch {
        // Try the next backend.
      }
    }

    setMessages((current) => [
      ...current,
      {
        a: 1,
        t: 'AI service is temporarily unavailable.',
      },
    ]);
  }

  return (
    <div className="chat">
      {open && (
        <div className="cw">
          <header>
            ฅ^•ﻌ•^ฅ Zul's AI

            <button
              onClick={() =>
                setOpen(false)
              }
              aria-label="Close AI chat"
            >
              <X size={15} />
            </button>
          </header>

          <div className="msgs">
            {messages.map(
              (message, index) => (
                <div
                  key={index}
                  className={
                    message.a
                      ? 'bot'
                      : 'usr'
                  }
                >
                  {message.t}
                </div>
              )
            )}
          </div>

          <footer>
            <input
              value={question}
              onChange={(event) =>
                setQuestion(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter'
                ) {
                  send();
                }
              }}
              placeholder="Ask the portfolio..."
            />

            <button
              onClick={send}
              aria-label="Send message"
            >
              <ChevronRight />
            </button>
          </footer>
        </div>
      )}

      <button
        className="cat"
        onClick={() =>
          setOpen(!open)
        }
        aria-label="Open Zul's AI"
      >
        ฅ^•ﻌ•^ฅ
      </button>
    </div>
  );
}

/*
LOADING BARRR
*/
/* =========================================================
   PROFILE PHOTO
   Local JPG -> Google Drive -> cat fallback
========================================================= */

function ProfilePhoto({ profile }) {
  const imageConfig =
    profile?.image ||
    profile?.photo ||
    {};

  const localSrc =
    normalizeAssetPath(
      imageConfig.local ||
      profile?.photoLocal ||
      '/images/profile.png'
    ) || '/images/profile.png';

  const driveId =
    imageConfig.driveId ||
    imageConfig.googleDriveId ||
    profile?.photoDriveId ||
    import.meta.env.VITE_PROFILE_IMAGE_DRIVE_ID ||
    '';

  const driveProxySrc =
    API && driveId
      ? `${API}/api/drive/image/${encodeURIComponent(driveId)}`
      : '';

  const driveDirectSrc =
    driveId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(
          driveId
        )}&sz=w1200`
      : '';

  const sources = [
    localSrc,
    driveProxySrc,
    driveDirectSrc,
  ].filter(Boolean);

  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [localSrc, driveId]);

  const src = sources[sourceIndex];

  if (!src) {
    return (
      <div
        className="hero-photo-empty"
        aria-label="Profile photo unavailable"
      >
        <span>ฅ^•ﻌ•^ฅ</span>
      </div>
    );
  }

  return (
    <div className="hero-photo-frame">
      <div className="hero-photo-glow" />

      <div className="hero-photo-cutout">
        <img
          className="hero-photo"
          src={src}
          alt={`${profile?.name || 'Zulfaqar Jamal'} profile`}
          onError={() => {
            setSourceIndex((current) => {
              const next = current + 1;

              return next < sources.length
                ? next
                : sources.length;
            });
          }}
        />
      </div>

      <div className="hero-photo-scan" />

      <div className="hero-photo-corner hero-photo-corner-tl" />
      <div className="hero-photo-corner hero-photo-corner-tr" />
      <div className="hero-photo-corner hero-photo-corner-bl" />
      <div className="hero-photo-corner hero-photo-corner-br" />
    </div>
  );
}

/* =========================================================
   LOADING BARRR
========================================================= */

function LoadingScreen({ progress = 0 }) {
  const safeProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="loading-screen">
      <div className="loader-shell">

        {/* Trans-colour cutout ring */}
        <div
          className="loader-ring"
          style={{
            '--progress': `${safeProgress * 3.6}deg`,
          }}
        >
          <div className="loader-ring-inner" />

          {/* little radio ticks */}
          <span className="tick tick-1" />
          <span className="tick tick-2" />
          <span className="tick tick-3" />
          <span className="tick tick-4" />
          <span className="tick tick-5" />
          <span className="tick tick-6" />

          {/* scanner */}
          <div className="loader-scanner" />

          {/* coder cat */}
          <div className="coder-cat">
            <div className="cat-ear cat-ear-left" />
            <div className="cat-ear cat-ear-right" />

            <div className="cat-head">
              <span className="cat-eye cat-eye-left" />
              <span className="cat-eye cat-eye-right" />
              <span className="cat-nose">⌁</span>
              <span className="cat-mouth">ω</span>
            </div>

            {/* laptop */}
            <div className="cat-laptop">
              <div className="cat-screen">
                <span>&gt;_</span>
              </div>
              <div className="cat-base" />
            </div>

            {/* paws */}
            <div className="cat-paw cat-paw-left" />
            <div className="cat-paw cat-paw-right" />
          </div>
        </div>

        {/* Progress text */}
        <div className="loader-status">
          <div className="loader-label">
            <span>ฅ^•ﻌ•^ฅ</span>
            <strong> booting zul.exe </strong>
            <span>ฅ^•ﻌ•^ฅ</span>
          </div>

          <div className="loader-progress">
            <span
              style={{
                width: `${safeProgress}%`,
              }}
            />
          </div>

          <div className="loader-meta">
            <span>LOADING...</span>
            <span>{Math.round(safeProgress)}%</span>
          </div>

          <div className="loader-subtext">
            preparing the cat's workspace...
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PROFESSIONAL HIRING FILTER VIEW
   Route: /port_resume?type_of_work_hiring=...
   
   The query selects relevant portfolio evidence rather than
   generating a replacement resume. The same interactive cards,
   timelines and detail modals remain available.
========================================================= */

function formatHiringTarget(value) {
  if (!value) {
    return 'General hiring';
  }

  return decodeURIComponent(value)
    .replace(/[+_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function uniqueValues(values) {
  return Array.from(
    new Set(values.filter(Boolean))
  );
}

function fallbackHiringFilter(content, target) {
  const terms = target
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const score = (item) => {
    const haystack =
      JSON.stringify(item).toLowerCase();

    return terms.reduce(
      (total, term) =>
        total +
        (haystack.includes(term) ? 1 : 0),
      0
    );
  };

  const pick = (items, limit) =>
    items
      .map((item) => ({
        item,
        score: score(item),
      }))
      .sort((a, b) => b.score - a.score)
      .filter(({ score }) => score > 0)
      .slice(0, Math.min(limit, items.length))
      .map(({ item }) => item.id)
      .filter(Boolean);

  return {
    experience: terms.length
      ? pick(content.experience, 6)
      : content.experience.map((item) => item.id),
    projects: terms.length
      ? pick(content.projects, 5)
      : content.projects.map((item) => item.id),
    certifications: terms.length
      ? pick(content.certifications, 8)
      : content.certifications.map((item) => item.id),
    achievements: terms.length
      ? pick(content.achievements, 8)
      : content.achievements.map((item) => item.id),
    awards: terms.length
      ? pick(content.awards, 5)
      : content.awards.map((item) => item.id),
    education: content.education.map(
      (item) => item.id
    ),
  };
}

function filterContentByHiring(content, selection) {
  const selectedIds = (key, items) => {
    const ids = new Set(
      Array.isArray(selection && selection[key])
        ? selection[key]
        : []
    );

    return items.filter(
      (item) => ids.has(item.id)
    );
  };

  return {
    ...content,
    experience: selectedIds(
      'experience',
      content.experience
    ),
    projects: selectedIds(
      'projects',
      content.projects
    ),
    certifications: selectedIds(
      'certifications',
      content.certifications
    ),
    achievements: selectedIds(
      'achievements',
      content.achievements
    ),
    awards: selectedIds(
      'awards',
      content.awards
    ),
    education: selectedIds(
      'education',
      content.education
    ),
    research: [],
    recent: [],
    explore: [],
  };
}

function HiringPortfolioView({
  content,
  target,
}) {
  const [filtered, setFiltered] = useState(null);
  const [status, setStatus] =
    useState('Selecting relevant evidence…');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;

    async function runFilter() {
      if (!ONLINE_API) {
        if (active) {
          setFiltered(
            filterContentByHiring(
              content,
              fallbackHiringFilter(
                content,
                target
              )
            )
          );
          setStatus(
            'Focused using local portfolio data.'
          );
        }
        return;
      }

      try {
        const response = await fetch(
          ONLINE_API + '/api/hiring',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              target,
              content,
            }),
          }
        );

        const data =
          await response.json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data && data.error
              ? data.error
              : 'hiring_filter_failed'
          );
        }

        if (active) {
          setFiltered(
            filterContentByHiring(
              content,
              data
            )
          );
          setStatus(
            'Focused by the portfolio AI.'
          );
        }
      } catch {
        if (active) {
          setFiltered(
            filterContentByHiring(
              content,
              fallbackHiringFilter(
                content,
                target
              )
            )
          );
          setStatus(
            'Focused using local portfolio data.'
          );
        }
      }
    }

    runFilter();

    return () => {
      active = false;
    };
  }, [content, target]);

  if (!filtered) {
    return (
      <div className="hiring-portfolio-page hiring-loading">
        <div>
          <span>PROFESSIONAL / HIRING VIEW</span>
          <h1>{target}</h1>
          <p>{status}</p>
        </div>
      </div>
    );
  }

  const skillItems = [
    ...filtered.experience,
    ...filtered.projects,
    ...filtered.certifications,
  ];

  const skills = uniqueValues(
    skillItems.flatMap(
      (item) =>
        Array.isArray(item.skills)
          ? item.skills
          : []
    )
  ).slice(0, 16);

  const durations =
    filtered.experience.map(
      (item) =>
        months(item.start, item.end)
    );

  const maxDuration = Math.max(
    1,
    ...(durations.length
      ? durations
      : [1])
  );

  const open = (type, item) =>
    setSelected([type, item]);

  return (
    <div className="hiring-portfolio-page">
      <header className="hiring-portfolio-header">
        <div>
          <span>
            PROFESSIONAL / HIRING VIEW
          </span>
          <h1>{content.profile.name}</h1>
          <p>{target}</p>
          <small>
            {content.profile.location}
          </small>
        </div>

        <div className="hiring-portfolio-actions">
          <a href="/">Portfolio</a>
          <a
            href={'mailto:' + content.profile.email}
          >
            Contact
          </a>
        </div>
      </header>

      <div className="hiring-focus-note">
        <strong>Role focus</strong>
        <span>{status}</span>
      </div>

      <main>
        <section className="hiring-profile-section">
          <small>PROFILE</small>
          <p>{content.profile.summary}</p>
        </section>

        {skills.length > 0 && (
          <section className="hiring-profile-section">
            <small>RELEVANT SKILLS</small>
            <div className="hiring-skill-list">
              {skills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          </section>
        )}

        {filtered.experience.length > 0 && (
          <section className="hiring-profile-section">
            <small>RELEVANT EXPERIENCE</small>
            <div className="hiring-interactive-list">
              {filtered.experience.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    open('exp', item)
                  }
                >
                  <div>
                    <strong>{item.role}</strong>
                    <span>{item.company}</span>
                  </div>

                  <div className="hiring-entry-bar">
                    <i
                      style={{
                        width:
                          Math.max(
                            8,
                            (
                              months(
                                item.start,
                                item.end
                              ) /
                              maxDuration
                            ) * 100
                          ) + '%',
                      }}
                    />
                  </div>

                  <small>
                    {date(item.start)} —{' '}
                    {date(item.end)}
                  </small>
                </button>
              ))}
            </div>
          </section>
        )}

        {filtered.projects.length > 0 && (
          <section className="hiring-profile-section">
            <small>RELEVANT PROJECTS</small>
            <div className="hiring-card-grid">
              {filtered.projects.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    open('Project', item)
                  }
                >
                  <span>
                    {item.category || 'PROJECT'}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <b>Open details →</b>
                </button>
              ))}
            </div>
          </section>
        )}

        {filtered.certifications.length > 0 && (
          <section className="hiring-profile-section">
            <small>RELEVANT CERTIFICATIONS</small>
            <div className="hiring-card-grid">
              {filtered.certifications.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    open('Certification', item)
                  }
                >
                  <span>
                    {item.issuer || 'CERTIFICATION'}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <b>Open details →</b>
                </button>
              ))}
            </div>
          </section>
        )}

        {filtered.achievements.length > 0 && (
          <section className="hiring-profile-section">
            <small>RELEVANT ACHIEVEMENTS</small>
            <div className="hiring-card-grid">
              {filtered.achievements.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    open('Achievement', item)
                  }
                >
                  <span>
                    {item.issuer || 'ACHIEVEMENT'}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <b>Open details →</b>
                </button>
              ))}
            </div>
          </section>
        )}

        {filtered.awards.length > 0 && (
          <section className="hiring-profile-section">
            <small>RELEVANT RECOGNITION</small>
            <div className="hiring-card-grid">
              {filtered.awards.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    open('Award', item)
                  }
                >
                  <span>
                    {item.issuer || 'RECOGNITION'}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <b>Open details →</b>
                </button>
              ))}
            </div>
          </section>
        )}

        {filtered.education.length > 0 && (
          <section className="hiring-profile-section">
            <small>EDUCATION</small>
            <div className="hiring-education-grid">
              {filtered.education.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    open(
                      'Education',
                      {
                        ...item,
                        title: item.school,
                        description:
                          item.description ||
                          item.qualification,
                      }
                    )
                  }
                >
                  <strong>{item.school}</strong>
                  <span>{item.qualification}</span>
                  <small>{item.period}</small>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="hiring-portfolio-footer">
        <span>
          {content.profile.name} · {target}
        </span>
        <a href="/">
          Return to interactive portfolio
        </a>
      </footer>

      {selected && selected[0] === 'exp' ? (
        <ExpModal
          x={selected[1]}
          close={() =>
            setSelected(null)
          }
        />
      ) : (
        selected && (
          <Modal
            type={selected[0]}
            item={selected[1]}
            close={() =>
              setSelected(null)
            }
          />
        )
      )}
    </div>
  );
}

/* =========================================================
   MAIN APPLICATION
========================================================= */

function App() {
  const [content, setContent] = useState(null);
  const [loadProgress, setLoadProgress] = useState(8);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const { deviceId, sessionId } =
      getAnonymousIdentity();

    if (!API) {
      return;
    }

    fetch(`${API}/api/access/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId,
        sessionId,
      }),
    }).catch(() => {
      // Anonymous access tracking is best-effort.
    });
  }, []);

  const [page, setPage] = useState(
    location.hash.slice(1) || 'home'
  );

  /* ---------------------------------------------
     LOAD CONTENT
  --------------------------------------------- */

  useEffect(() => {
    let mounted = true;

    const loadContent = async () => {
      try {
        setLoadProgress(18);

        const response = await fetch('/content.json');

        if (!response.ok) {
          throw new Error('content.json unavailable');
        }

        setLoadProgress(42);

        const data = await response.json();

        setLoadProgress(68);

        if (mounted) {
          setContent(normalizeContent(data));
        }

        /*
         * API is optional. Static content remains the fallback.
         */
        if (API) {
          try {
            const apiResponse = await fetch(
              `${API}/api/content`
            );

            if (apiResponse.ok) {
              const apiData = await apiResponse.json();

              setLoadProgress(88);

              if (
                mounted &&
                apiData?.profile
              ) {
                setContent(normalizeContent(apiData));
              }
            }
          } catch {
            // Keep using the static content.
          }
        }

        setLoadProgress(100);
      } catch (error) {
        console.error(
          'Portfolio content loading failed:',
          error
        );
      }
    };

    loadContent();

    /* -------------------------------------------
       HASH ROUTING
    ------------------------------------------- */

    const handleHashChange = () => {
      setPage(
        location.hash.slice(1) ||
          'home'
      );
    };

    addEventListener(
      'hashchange',
      handleHashChange
    );

    return () => {
      mounted = false;

      removeEventListener(
        'hashchange',
        handleHashChange
      );
    };
  }, []);

  /* ---------------------------------------------
     LOADING STATE
  --------------------------------------------- */

  if (!content) {
    return (
      <LoadingScreen
        progress={loadProgress}
      />
    );
  }

  /* =======================================================
     PROFESSIONAL HIRING ROUTE
  ======================================================= */

  const hiringPath =
    location.pathname.replace(/\/+$/, '') === '/port_resume';

  if (hiringPath) {
    const params = new URLSearchParams(location.search);
    const rawTarget =
      params.get('type_of_work_hiring') || '';

    return (
      <HiringPortfolioView
        content={content}
        target={formatHiringTarget(rawTarget)}
      />
    );
  }

  /* =======================================================
     GAMES PAGE
  ======================================================= */

  if (page === 'games') {
    return (
      <>
        <nav>
          <b>
            ZUL<span>/</span>JAMAL
          </b>

          <a href="#home">
            Home
          </a>
        </nav>

        <div className="games">
          <iframe
            src={GAMES}
            title="games"
            loading="lazy"
          />
        </div>
      </>
    );
  }

  /* =======================================================
     EXPLORE PAGE
  ======================================================= */

  if (page === 'explore') {
    return (
      <>
        <nav>
          <b>
            ZUL<span>/</span>JAMAL
          </b>

          <a href="#home">
            Home
          </a>
        </nav>

        <main className="explore">
          <small>
            OFF-DUTY / SIDE QUESTS
          </small>

          <h1>
            Explore the human
            <br />
            <i>
              behind the terminal.
            </i>
          </h1>

          <p>
            Casual things Zul doesn't
            mind sharing.
          </p>

          <div className="exploregrid">
            {content.explore.map(
              (item, index) => (
                <a
                  key={index}
                  href={`#explore-${index}`}
                >
                  {'0' +
                    (index + 1)}{' '}
                  {item}

                  <ArrowUpRight />
                </a>
              )
            )}
          </div>
        </main>

        <Chat
          content={content}
        />
      </>
    );
  }

  /* =======================================================
     EXPERIENCE DURATION
  ======================================================= */

  const durations = content.experience.map((item) =>
    months(item.start, item.end)
  );

  const maxDuration = Math.max(
    1,
    ...(durations.length ? durations : [1])
  );

  /* =======================================================
     MAIN PORTFOLIO
  ======================================================= */

  return (
    <>
      {/* ===================================================
          NAVIGATION
      =================================================== */}

      <nav>
        <a href="#home">
          <b>
            ZUL<span>/</span>JAMAL
          </b>
        </a>

        <div>
          {[
            'home',
            'recent',
            'certifications',
            'awards',
            'projects',
            'experience',
            'contact',
          ].map((item) => (
            <a
              key={item}
              href={`#${item}`}
            >
              {item}
            </a>
          ))}
        </div>

        <a href="#explore">
          Explore{' '}
          <Sparkles size={13} />
        </a>

        <a href="#games">
          Games
        </a>
      </nav>

      <main>
        {/* =================================================
            HERO
        ================================================= */}

        <section
          id="home"
          className="hero"
        >
          <div>
            <div className="identity-lockup" aria-label="Zulfaqar Jamal identity">
              <span
                className="identity-name identity-zulfaqar"
                data-hover="Zulfiya"
              >
                Zulfaqar
              </span>{' '}
              <span
                className="identity-name identity-jamal"
                data-hover="(Firebyte_1011 / Firesecurity)"
              >
                Jamal
              </span>
            </div>

            <h1>
              Security minded.
              <br />
              <i>
                Builder heart.
              </i>
            </h1>

            <p>
              {content.profile.summary}
            </p>

            <a
              className="btn"
              href="#experience"
            >
              Explore experience
              <ArrowUpRight />
            </a>
          </div>

          <div className="heroart">
            <ProfilePhoto
              profile={content.profile}
            />

            <div
              className="hero-pronouns"
              tabIndex={0}
              title="Hover or focus to reveal"
            >
              <span className="pronoun-label">
                pronouns
              </span>

              <span className="pronoun-value">
                {content.profile.pronouns || 'not set'}
              </span>

              <span className="pronoun-hint">
                hover
              </span>
            </div>
          </div>
        </section>

        {/* =================================================
            RECENT ACTIVITY
        ================================================= */}

        <section id="recent">
          <small>
            01 / SIGNAL
          </small>

          <h2>
            Recent activity
          </h2>

          <div className="tiles">
            {(content.recent.length
              ? content.recent
              : [
                  {
                    id: 'recent-development',
                    title: 'Software development',
                    description: 'Automation and indie development.',
                  },
                  {
                    id: 'recent-security',
                    title: 'Security community',
                    description: 'CTF learning and team leadership.',
                  },
                  {
                    id: 'recent-human',
                    title: 'Human side',
                    description: 'Content, music, leadership and learning.',
                  },
                ]
            ).map((item, index) => (
              <button
                className="tile-button"
                key={item.id || item.title || index}
                onClick={() =>
                  setSelected([
                    'Recent Activity',
                    {
                      ...item,
                      id:
                        item.id ||
                        `recent-${index}`,
                      title:
                        item.title ||
                        'Recent activity',
                      description:
                        item.description ||
                        item.summary ||
                        '',
                    },
                  ])
                }
              >
                <b>{item.title}</b>
                <br />
                <small>
                  {item.description ||
                    item.summary ||
                    ''}
                </small>
                <span className="tile-button-open">
                  Open <ArrowUpRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* =================================================
            CERTIFICATIONS
        ================================================= */}

        <section id="certifications">
          <small>
            02 / PROOF
          </small>

          <h2>
            Certification &
            Achievements
          </h2>

          <Rail
            items={content.certifications}
            onOpen={(item) =>
              setSelected(['Certification', item])
            }
          />

          <div className="section-subhead">
            <small>ACHIEVEMENTS</small>
            <h3>Achievements</h3>
          </div>

          <Rail
            items={content.achievements}
            onOpen={(item) =>
              setSelected(['Achievement', item])
            }
          />
        </section>

        {/* =================================================
            AWARDS
        ================================================= */}

        <section id="awards">
          <small>
            03 / RECOGNITION
          </small>

          <h2>
            Awards & Honour
          </h2>

          <Rail
            items={content.awards}
            onOpen={(item) =>
              setSelected([
                'Award',
                item,
              ])
            }
          />
        </section>

        {/* =================================================
            PROJECTS
        ================================================= */}

        <section id="projects">
          <small>
            04 / LAB
          </small>

          <h2>
            Project & Research
          </h2>

          <Rail
            items={content.projects}
            onOpen={(item) =>
              setSelected(['Project', item])
            }
          />

          <div className="section-subhead">
            <small>RESEARCH</small>
            <h3>Research</h3>
          </div>

          <Rail
            items={content.research}
            onOpen={(item) =>
              setSelected(['Research', item])
            }
          />
        </section>

        {/* =================================================
            WORK EXPERIENCE
        ================================================= */}

        <section id="experience">
          <small>
            05 / TIMELINE
          </small>

          <h2>
            Work experience
          </h2>

          <div className="timeline">
            {content.experience.map(
              (item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    setSelected([
                      'exp',
                      item,
                    ])
                  }
                >
                  <div>
                    <strong>
                      {item.company}
                    </strong>

                    <span>
                      {item.role}
                    </span>
                  </div>

                  <div className="bar">
                    <i
                      style={{
                        width: `${Math.max(
                          8,
                          (months(
                            item.start,
                            item.end
                          ) /
                            maxDuration) *
                            100
                        )}%`,
                      }}
                    />
                  </div>

                  <small>
                    {date(item.start)} —{' '}
                    {date(item.end)}
                  </small>
                </button>
              )
            )}
          </div>
        </section>

        {/* =================================================
            EDUCATION
        ================================================= */}

        <section>
          <small>
            06 / FOUNDATION
          </small>

          <h2>
            Education
          </h2>

          <div className="tiles">
            {content.education.map(
              (item, index) => (
                <button
                  className="tile-button"
                  key={item.id || index}
                  onClick={() =>
                    setSelected([
                      'Education',
                      {
                        ...item,
                        id:
                          item.id ||
                          `education-${index}`,
                        title:
                          item.school ||
                          'Education',
                        description:
                          [
                            item.qualification,
                            item.period,
                          ]
                            .filter(Boolean)
                            .join(' · '),
                      },
                    ])
                  }
                >
                  <b>
                    {item.school}
                  </b>

                  <p>
                    {item.qualification}
                  </p>

                  <small>
                    {item.period}
                  </small>

                  <span className="tile-button-open">
                    Open <ArrowUpRight size={14} />
                  </span>
                </button>
              )
            )}
          </div>
        </section>

        {/* =================================================
            CONTACT
        ================================================= */}

        <section
          id="contact"
          className="contact"
        >
          <div>
            <small>
              07 / OPEN CHANNEL
            </small>

            <h2>
              Let's build something
              <br />
              <i>
                useful & curious.
              </i>
            </h2>
          </div>

          <div>
            {content.profile.links.map(
              (link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link}

                  <ArrowUpRight />
                </a>
              )
            )}
          </div>
        </section>
      </main>

      {/* ===================================================
          FOOTER
      =================================================== */}

      <footer>
        © {new Date().getFullYear()}{' '}
        Zulfaqar Jamal
      </footer>

      {/* ===================================================
          AI CHAT
      =================================================== */}

      <Chat
        content={content}
      />

      {/* ===================================================
          MODALS
      =================================================== */}

      {selected?.[0] ===
      'exp' ? (
        <ExpModal
          x={selected[1]}
          close={() =>
            setSelected(null)
          }
        />
      ) : (
        selected && (
          <Modal
            type={selected[0]}
            item={selected[1]}
            close={() =>
              setSelected(null)
            }
          />
        )
      )}
    </>
  );
}

/* =========================================================
   REACT ROOT
========================================================= */

createRoot(
  document.getElementById('root')
).render(
  <App />
);