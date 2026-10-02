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

function normalizeContent(data) {
  const source = data || {};
  const profile = source.profile || {};
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
      image: profile.image || {},
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
                src={media[0].src}
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
========================================================= */

function Chat({ content }) {
  const [open, setOpen] = useState(false);

  const [question, setQuestion] =
    useState('');

  const [messages, setMessages] =
    useState([
      {
        a: 1,
        t: "Mrrp! Ask me about Zul's work, skills, projects or certifications.",
      },
    ]);

  async function send() {
    if (!question.trim()) {
      return;
    }

    const message = question;

    setQuestion('');

    setMessages((current) => [
      ...current,
      {
        t: message,
      },
    ]);

    /* ---------------------------------------------
       NO API CONFIGURED
    --------------------------------------------- */

    if (!API) {
      setMessages((current) => [
        ...current,
        {
          a: 1,
          t: 'AI server is not configured yet.',
        },
      ]);

      return;
    }

    /* ---------------------------------------------
       SEND TO AI API
    --------------------------------------------- */

    try {
      const response = await fetch(
        `${API}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            message,
            context: content,
          }),
        }
      );

      const data =
        await response.json();

      setMessages((current) => [
        ...current,
        {
          a: 1,
          t:
            data.reply ||
            'No reply',
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          a: 1,
          t: 'Backup AI is unavailable.',
        },
      ]);
    }
  }

  return (
    <div className="chat">
      {/* ---------------------------------------------
          CHAT WINDOW
      --------------------------------------------- */}

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
              placeholder="Ask the cat..."
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

      {/* ---------------------------------------------
          CHAT BUTTON
      --------------------------------------------- */}

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
    imageConfig.local ||
    profile?.photoLocal ||
    '/profile.jpg';

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
   MAIN APPLICATION
========================================================= */

function App() {
  const [content, setContent] = useState(null);
  const [loadProgress, setLoadProgress] = useState(8);
  const [selected, setSelected] = useState(null);

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
            ).map((item) => (
              <article key={item.id || item.title}>
                <b>{item.title}</b>
                <br />
                <small>{item.description || item.summary || ''}</small>
              </article>
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
              (item) => (
                <article
                  key={item.id}
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
                </article>
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