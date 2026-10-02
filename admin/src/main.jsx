import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

const SECTION_META = {
  profile: 'Profile',
  recent: 'Recent activity',
  certifications: 'Certifications',
  achievements: 'Achievements',
  awards: 'Awards & Honour',
  projects: 'Projects',
  research: 'Research',
  experience: 'Work experience',
  education: 'Education',
  explore: 'Explore',
  appearance: 'Appearance',
  raw: 'Raw JSON',
};

const EMPTY_ITEM = {
  id: '',
  title: '',
  issuer: '',
  category: '',
  description: '',
  date: '',
  link: '',
  media: [],
};

const EMPTY_EXPERIENCE = {
  id: '',
  company: '',
  role: '',
  location: '',
  start: '',
  end: '',
  summary: '',
  elaboration: '',
  reflection: '',
  skills: [],
  media: [],
};

const EMPTY_EDUCATION = {
  id: '',
  school: '',
  qualification: '',
  period: '',
  description: '',
};

const DEFAULT_CONTENT = {
  profile: {
    name: 'Zulfaqar Jamal',
    displayName: 'Zulfaqar Jamal',
    title: '',
    headline: '',
    summary: '',
    pronouns: '',
    location: 'Singapore',
    email: '',
    linkedin: '',
    github: '',
    website: '',
    image: {
      local: '/profile.jpg',
      driveId: '',
    },
    links: [],
  },
  settings: {
    theme: {
      bg: '#0e0b13',
      primary: '#f2a8d4',
      violet: '#cbb5ff',
      text: '#f7eff9',
      muted: '#aa9eaf',
      line: '#302635',
    },
  },
  recent: [],
  certifications: [],
  achievements: [],
  awards: [],
  projects: [],
  research: [],
  experience: [],
  education: [],
  explore: [],
};

function normalizeContent(value) {
  const source = value && typeof value === 'object' ? value : {};
  const profile = source.profile || {};
  const settings = source.settings || {};
  const theme = settings.theme || {};

  return {
    ...DEFAULT_CONTENT,
    ...source,
    profile: {
      ...DEFAULT_CONTENT.profile,
      ...profile,
      image: {
        ...DEFAULT_CONTENT.profile.image,
        ...(profile.image || {}),
      },
      links: Array.isArray(profile.links)
        ? profile.links
        : [profile.linkedin, profile.github, profile.website].filter(Boolean),
    },
    settings: {
      ...DEFAULT_CONTENT.settings,
      ...settings,
      theme: {
        ...DEFAULT_CONTENT.settings.theme,
        ...theme,
      },
    },
    recent: Array.isArray(source.recent) ? source.recent : [],
    certifications: Array.isArray(source.certifications) ? source.certifications : [],
    achievements: Array.isArray(source.achievements) ? source.achievements : [],
    awards: Array.isArray(source.awards) ? source.awards : [],
    projects: Array.isArray(source.projects) ? source.projects : [],
    research: Array.isArray(source.research) ? source.research : [],
    experience: Array.isArray(source.experience) ? source.experience : [],
    education: Array.isArray(source.education) ? source.education : [],
    explore: Array.isArray(source.explore) ? source.explore : [],
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function App() {
  const [content, setContent] = useState(null);
  const [section, setSection] = useState('profile');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [raw, setRaw] = useState('');

  useEffect(() => {
    loadContent();
  }, []);

  useEffect(() => {
    if (content) setRaw(JSON.stringify(content, null, 2));
  }, [content]);

  async function loadContent() {
    setNotice('Loading portfolio data...');

    try {
      const response = await fetch(`${API}/api/content`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = normalizeContent(await response.json());
      setContent(data);
      setApiOnline(true);
      setNotice('Connected to the portfolio API.');
    } catch (error) {
      console.error(error);
      setApiOnline(false);

      // Give the editor a useful local fallback instead of an empty screen.
      try {
        const local = await fetch('/content.json');
        if (local.ok) {
          setContent(normalizeContent(await local.json()));
          setNotice('API offline — editing local content. Saving requires the API.');
          return;
        }
      } catch {}

      setContent(clone(DEFAULT_CONTENT));
      setNotice('API and local content unavailable — started with an empty template.');
    }
  }

  async function saveContent() {
    if (!content) return;

    setSaving(true);
    setNotice('Saving content...');

    try {
      const response = await fetch(`${API}/api/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(adminSecret.trim()
            ? { 'X-Admin-Secret': adminSecret.trim() }
            : {}),
        },
        body: JSON.stringify(content),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Save failed (${response.status})`);

      setContent(normalizeContent(data.content || content));
      setNotice(`Saved successfully at ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setNotice(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function updateProfile(field, value) {
    setContent((current) => ({
      ...current,
      profile: { ...current.profile, [field]: value },
    }));
  }

  function updateImage(field, value) {
    setContent((current) => ({
      ...current,
      profile: {
        ...current.profile,
        image: { ...current.profile.image, [field]: value },
      },
    }));
  }

  function updateTheme(field, value) {
    setContent((current) => ({
      ...current,
      settings: {
        ...current.settings,
        theme: { ...current.settings.theme, [field]: value },
      },
    }));
  }

  function updateItem(sectionName, index, field, value) {
    setContent((current) => {
      const items = [...current[sectionName]];
      items[index] = { ...items[index], [field]: value };
      return { ...current, [sectionName]: items };
    });
  }

  function addItem(sectionName, item) {
    setContent((current) => ({
      ...current,
      [sectionName]: [...current[sectionName], item],
    }));
  }

  function removeItem(sectionName, index) {
    setContent((current) => ({
      ...current,
      [sectionName]: current[sectionName].filter((_, i) => i !== index),
    }));
  }

  function applyRaw() {
    try {
      const parsed = JSON.parse(raw);
      setContent(normalizeContent(parsed));
      setNotice('Raw JSON applied to the visual editor.');
    } catch (error) {
      setNotice(`JSON error: ${error.message}`);
    }
  }

  function syncRaw() {
    setRaw(JSON.stringify(content, null, 2));
    setNotice('Raw JSON synchronized.');
  }

  const listSections = new Set([
    'recent',
    'certifications',
    'achievements',
    'awards',
    'projects',
    'research',
    'experience',
    'education',
  ]);

  const visibleItems = useMemo(() => {
    if (!content || !Array.isArray(content[section])) return [];
    if (!search.trim()) return content[section];

    const q = search.toLowerCase();
    return content[section].filter((item) => JSON.stringify(item).toLowerCase().includes(q));
  }, [content, section, search]);

  if (!content) {
    return <div className="admin-loading">ฅ^•ﻌ•^ฅ <span>Loading content manager...</span></div>;
  }

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <div className="brand-block">
          <strong>ZUL / ADMIN</strong>
          <span className={apiOnline ? 'status online' : 'status'}>
            <i /> {apiOnline ? 'API online' : 'API offline'}
          </span>
        </div>

        <div className="top-actions">
          <input
            className="secret-input"
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="Admin key"
            aria-label="Admin write key"
          />
          <button className="ghost" onClick={loadContent} disabled={saving}>Reload</button>
          <button className="ghost" onClick={syncRaw} disabled={saving}>Sync JSON</button>
          <button className="save" onClick={saveContent} disabled={saving || !apiOnline}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <small>CONTENT SYSTEM</small>
            <h2>Portfolio editor</h2>
            <p>Edit the public site without touching JSX.</p>
          </div>

          <nav className="section-nav">
            {Object.entries(SECTION_META).map(([key, label]) => (
              <button
                key={key}
                className={section === key ? 'active' : ''}
                onClick={() => { setSection(key); setSearch(''); setExpanded(null); }}
              >
                <span>{label}</span>
                {Array.isArray(content[key]) && <em>{content[key].length}</em>}
              </button>
            ))}
          </nav>
        </aside>

        <main className="editor">
          <div className="editor-heading">
            <div>
              <small>EDITOR / {SECTION_META[section].toUpperCase()}</small>
              <h1>{SECTION_META[section]}</h1>
            </div>

            {listSections.has(section) && (
              <label className="search-box">
                <span>⌕</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search this section..."
                />
              </label>
            )}
          </div>

          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}

          {section === 'profile' && (
            <ProfileEditor
              profile={content.profile}
              updateProfile={updateProfile}
              updateImage={updateImage}
            />
          )}

          {section === 'appearance' && (
            <AppearanceEditor
              theme={content.settings.theme}
              updateTheme={updateTheme}
            />
          )}

          {section === 'explore' && (
            <ExploreEditor
              items={content.explore}
              addItem={() => addItem('explore', 'New category')}
              update={(index, value) => {
                setContent((current) => {
                  const next = [...current.explore];
                  next[index] = value;
                  return { ...current, explore: next };
                });
              }}
              remove={(index) => removeItem('explore', index)}
            />
          )}

          {section === 'raw' && (
            <section className="panel raw-panel">
              <div className="panel-head">
                <div><small>ADVANCED</small><h2>Complete content.json</h2></div>
                <button className="accent-button" onClick={applyRaw}>Apply JSON</button>
              </div>
              <textarea
                className="raw-editor"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                spellCheck={false}
              />
            </section>
          )}

          {['recent', 'certifications', 'achievements', 'awards', 'projects', 'research'].includes(section) && (
            <CardEditor
              section={section}
              items={visibleItems}
              allItems={content[section]}
              expanded={expanded}
              setExpanded={setExpanded}
              updateItem={updateItem}
              addItem={addItem}
              removeItem={removeItem}
            />
          )}

          {section === 'experience' && (
            <ExperienceEditor
              items={visibleItems}
              allItems={content.experience}
              expanded={expanded}
              setExpanded={setExpanded}
              updateItem={updateItem}
              addItem={addItem}
              removeItem={removeItem}
            />
          )}

          {section === 'education' && (
            <EducationEditor
              items={visibleItems}
              allItems={content.education}
              expanded={expanded}
              setExpanded={setExpanded}
              updateItem={updateItem}
              addItem={addItem}
              removeItem={removeItem}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ProfileEditor({ profile, updateProfile, updateImage }) {
  return (
    <section className="panel">
      <PanelHeader eyebrow="HERO / IDENTITY" title="Profile" />
      <div className="form-grid">
        <Field label="Name" value={profile.name} onChange={(v) => updateProfile('name', v)} />
        <Field label="Display name" value={profile.displayName} onChange={(v) => updateProfile('displayName', v)} />
        <Field label="Pronouns" value={profile.pronouns} onChange={(v) => updateProfile('pronouns', v)} />
        <Field label="Location" value={profile.location} onChange={(v) => updateProfile('location', v)} />
        <Field label="Title" value={profile.title} onChange={(v) => updateProfile('title', v)} />
        <Field label="Headline" value={profile.headline} onChange={(v) => updateProfile('headline', v)} />
        <Field label="Email" value={profile.email} onChange={(v) => updateProfile('email', v)} />
        <Field label="LinkedIn" value={profile.linkedin} onChange={(v) => updateProfile('linkedin', v)} />
        <Field label="GitHub" value={profile.github} onChange={(v) => updateProfile('github', v)} />
        <Field label="Website" value={profile.website} onChange={(v) => updateProfile('website', v)} />
        <Field wide multiline label="Summary" value={profile.summary} onChange={(v) => updateProfile('summary', v)} />
      </div>

      <div className="subpanel">
        <PanelHeader eyebrow="PROFILE IMAGE" title="Image sources" compact />
        <div className="form-grid">
          <Field label="Local image path" value={profile.image?.local || ''} onChange={(v) => updateImage('local', v)} />
          <Field label="Google Drive file ID" value={profile.image?.driveId || ''} onChange={(v) => updateImage('driveId', v)} />
        </div>
      </div>
    </section>
  );
}

function AppearanceEditor({ theme, updateTheme }) {
  return (
    <section className="panel">
      <PanelHeader eyebrow="CLIENT UI" title="Appearance" />
      <p className="helper">These values are stored in content.json. Add the matching CSS-variable loader to the client to make the public site react immediately.</p>
      <div className="color-grid">
        {Object.entries(theme).map(([key, value]) => (
          <label className="color-field" key={key}>
            <span>{key}</span>
            <div>
              <input type="color" value={value} onChange={(e) => updateTheme(key, e.target.value)} />
              <input value={value} onChange={(e) => updateTheme(key, e.target.value)} />
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}

function CardEditor({ section, items, allItems, expanded, setExpanded, updateItem, addItem, removeItem }) {
  return (
    <section className="collection">
      <div className="collection-toolbar">
        <span>{allItems.length} card{allItems.length === 1 ? '' : 's'}</span>
        <button className="accent-button" onClick={() => addItem(section, { ...clone(EMPTY_ITEM), id: makeId(section) })}>+ Add card</button>
      </div>

      {!items.length ? (
        <EmptyState action={<button className="accent-button" onClick={() => addItem(section, { ...clone(EMPTY_ITEM), id: makeId(section) })}>+ Add first card</button>} />
      ) : (
        <div className="item-list">
          {items.map((item) => {
            const index = allItems.indexOf(item);
            const open = expanded === `${section}-${index}`;
            return (
              <ItemEditorCard
                key={`${item.id || item.title || 'item'}-${index}`}
                item={item}
                open={open}
                onToggle={() => setExpanded(open ? null : `${section}-${index}`)}
                onChange={(field, value) => updateItem(section, index, field, value)}
                onDelete={() => removeItem(section, index)}
                section={section}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemEditorCard({ item, open, onToggle, onChange, onDelete, section }) {
  return (
    <article className={open ? 'editor-card open' : 'editor-card'}>
      <button className="editor-card-head" onClick={onToggle}>
        <div>
          <small>{item.issuer || item.category || section}</small>
          <strong>{item.title || 'Untitled card'}</strong>
          <span>{item.description || 'No description yet'}</span>
        </div>
        <b>{open ? '−' : '+'}</b>
      </button>

      {open && (
        <div className="editor-card-body">
          <div className="form-grid">
            <Field label="ID" value={item.id} onChange={(v) => onChange('id', v)} />
            <Field label="Title" value={item.title} onChange={(v) => onChange('title', v)} />
            <Field label="Issuer / Organisation" value={item.issuer} onChange={(v) => onChange('issuer', v)} />
            <Field label="Category" value={item.category} onChange={(v) => onChange('category', v)} />
            <Field label="Date" value={item.date} onChange={(v) => onChange('date', v)} />
            <Field label="External link" value={item.link} onChange={(v) => onChange('link', v)} />
            <Field wide multiline label="Description" value={item.description} onChange={(v) => onChange('description', v)} />
            <Field wide multiline label="Media JSON (advanced)" value={JSON.stringify(item.media || [], null, 2)} onChange={(v) => {
              try { onChange('media', JSON.parse(v)); } catch {}
            }} />
          </div>
          <div className="danger-row">
            <button className="delete-button" onClick={onDelete}>Delete card</button>
          </div>
        </div>
      )}
    </article>
  );
}

function ExperienceEditor({ items, allItems, expanded, setExpanded, updateItem, addItem, removeItem }) {
  return (
    <section className="collection">
      <div className="collection-toolbar">
        <span>{allItems.length} experience entr{allItems.length === 1 ? 'y' : 'ies'}</span>
        <button className="accent-button" onClick={() => addItem('experience', { ...clone(EMPTY_EXPERIENCE), id: makeId('experience') })}>+ Add experience</button>
      </div>

      {!items.length ? <EmptyState action={<button className="accent-button" onClick={() => addItem('experience', { ...clone(EMPTY_EXPERIENCE), id: makeId('experience') })}>+ Add first experience</button>} /> : (
        <div className="item-list">
          {items.map((item) => {
            const index = allItems.indexOf(item);
            const open = expanded === `experience-${index}`;
            return (
              <article key={`${item.id || 'experience'}-${index}`} className={open ? 'editor-card open' : 'editor-card'}>
                <button className="editor-card-head" onClick={() => setExpanded(open ? null : `experience-${index}`)}>
                  <div>
                    <small>{item.company || 'Company'}</small>
                    <strong>{item.role || 'Untitled role'}</strong>
                    <span>{item.start || 'Start'} — {item.end || 'Present'}</span>
                  </div>
                  <b>{open ? '−' : '+'}</b>
                </button>

                {open && <div className="editor-card-body">
                  <div className="form-grid">
                    <Field label="ID" value={item.id} onChange={(v) => updateItem('experience', index, 'id', v)} />
                    <Field label="Company" value={item.company} onChange={(v) => updateItem('experience', index, 'company', v)} />
                    <Field label="Role" value={item.role} onChange={(v) => updateItem('experience', index, 'role', v)} />
                    <Field label="Location" value={item.location} onChange={(v) => updateItem('experience', index, 'location', v)} />
                    <Field label="Start (YYYY-MM)" value={item.start} onChange={(v) => updateItem('experience', index, 'start', v)} />
                    <Field label="End (YYYY-MM)" value={item.end} onChange={(v) => updateItem('experience', index, 'end', v)} />
                    <Field wide multiline label="Summary" value={item.summary} onChange={(v) => updateItem('experience', index, 'summary', v)} />
                    <Field wide multiline label="Elaboration" value={item.elaboration} onChange={(v) => updateItem('experience', index, 'elaboration', v)} />
                    <Field wide multiline label="Reflection" value={item.reflection} onChange={(v) => updateItem('experience', index, 'reflection', v)} />
                    <Field wide label="Skills (comma separated)" value={Array.isArray(item.skills) ? item.skills.join(', ') : ''} onChange={(v) => updateItem('experience', index, 'skills', v.split(',').map((x) => x.trim()).filter(Boolean))} />
                    <Field wide multiline label="Media JSON (advanced)" value={JSON.stringify(item.media || [], null, 2)} onChange={(v) => { try { updateItem('experience', index, 'media', JSON.parse(v)); } catch {} }} />
                  </div>
                  <div className="danger-row"><button className="delete-button" onClick={() => removeItem('experience', index)}>Delete experience</button></div>
                </div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EducationEditor({ items, allItems, expanded, setExpanded, updateItem, addItem, removeItem }) {
  return (
    <section className="collection">
      <div className="collection-toolbar">
        <span>{allItems.length} education entr{allItems.length === 1 ? 'y' : 'ies'}</span>
        <button className="accent-button" onClick={() => addItem('education', { ...clone(EMPTY_EDUCATION), id: makeId('education') })}>+ Add education</button>
      </div>

      {!items.length ? <EmptyState action={<button className="accent-button" onClick={() => addItem('education', { ...clone(EMPTY_EDUCATION), id: makeId('education') })}>+ Add first education</button>} /> : (
        <div className="item-list">
          {items.map((item) => {
            const index = allItems.indexOf(item);
            const open = expanded === `education-${index}`;
            return (
              <article key={`${item.id || 'education'}-${index}`} className={open ? 'editor-card open' : 'editor-card'}>
                <button className="editor-card-head" onClick={() => setExpanded(open ? null : `education-${index}`)}>
                  <div>
                    <small>{item.school || 'School'}</small>
                    <strong>{item.qualification || 'Qualification'}</strong>
                    <span>{item.period || 'Period not set'}</span>
                  </div>
                  <b>{open ? '−' : '+'}</b>
                </button>
                {open && <div className="editor-card-body">
                  <div className="form-grid">
                    <Field label="ID" value={item.id} onChange={(v) => updateItem('education', index, 'id', v)} />
                    <Field label="School" value={item.school} onChange={(v) => updateItem('education', index, 'school', v)} />
                    <Field label="Qualification" value={item.qualification} onChange={(v) => updateItem('education', index, 'qualification', v)} />
                    <Field label="Period" value={item.period} onChange={(v) => updateItem('education', index, 'period', v)} />
                    <Field wide multiline label="Description" value={item.description} onChange={(v) => updateItem('education', index, 'description', v)} />
                  </div>
                  <div className="danger-row"><button className="delete-button" onClick={() => removeItem('education', index)}>Delete education</button></div>
                </div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExploreEditor({ items, addItem, update, remove }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div><small>SIDE QUESTS</small><h2>Explore categories</h2></div>
        <button className="accent-button" onClick={addItem}>+ Add category</button>
      </div>

      <div className="explore-editor-list">
        {items.map((item, index) => (
          <div className="explore-row" key={`${item}-${index}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <input value={item} onChange={(e) => update(index, e.target.value)} />
            <button className="delete-button compact" onClick={() => remove(index)}>×</button>
          </div>
        ))}
        {!items.length && <EmptyState action={<button className="accent-button" onClick={addItem}>+ Add category</button>} />}
      </div>
    </section>
  );
}

function PanelHeader({ eyebrow, title, compact = false }) {
  return (
    <div className={compact ? 'panel-head compact' : 'panel-head'}>
      <div><small>{eyebrow}</small><h2>{title}</h2></div>
    </div>
  );
}

function Field({ label, value, onChange, multiline = false, wide = false }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}</span>
      {multiline ? (
        <textarea rows={5} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function EmptyState({ action }) {
  return (
    <div className="empty-state">
      <div className="empty-cat">ฅ^•ﻌ•^ฅ</div>
      <strong>No content here yet</strong>
      <small>Add an item and it will appear on the public portfolio.</small>
      {action}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
