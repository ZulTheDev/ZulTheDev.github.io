import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
const ONLINE_API = import.meta.env.VITE_ONLINE_API_URL || import.meta.env.VITE_COMMENTS_BACKUP_URL || 'https://zulthedevs-projects.vercel.app';
const PUBLIC_SITE = 'https://zulthedev.github.io/';
const HIRING_ROUTE = PUBLIC_SITE + 'port_resume?type_of_work_hiring=technical_officer';
const LOCAL_DRAFT_KEY = 'zul-admin-local-draft-v1';

const SECTION_META = {
  dashboard: 'Dashboard',
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
  media: 'Media library',
  comments: 'Comments & moderation',
  system: 'System & AI',
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

const CONTENT_COLLECTIONS = [
  'recent',
  'certifications',
  'achievements',
  'awards',
  'projects',
  'research',
  'experience',
  'education',
];


const ROLE_META = {
  admin: {
    label: 'Administrator',
    sections: new Set([
      'dashboard',
      'profile',
      ...CONTENT_COLLECTIONS,
      'experience',
      'education',
      'explore',
      'appearance',
      'media',
      'raw',
      'comments',
      'system',
    ]),
  },
  editor: {
    label: 'Content Editor',
    sections: new Set([
      'dashboard',
      'profile',
      ...CONTENT_COLLECTIONS,
      'experience',
      'education',
      'explore',
      'appearance',
      'media',
      'raw',
    ]),
  },
  moderator: {
    label: 'Comments Moderator',
    sections: new Set([
      'dashboard',
      'comments',
    ]),
  },
  diagnostics: {
    label: 'API Diagnostics',
    sections: new Set([
      'dashboard',
      'system',
    ]),
  },
};

const NAV_GROUPS = [
  {
    label: 'Overview',
    sections: ['dashboard'],
  },
  {
    label: 'Content',
    sections: [
      'profile',
      'recent',
      'certifications',
      'achievements',
      'awards',
      'projects',
      'research',
      'experience',
      'education',
      'explore',
      'appearance',
      'media',
      'raw',
    ],
  },
  {
    label: 'Moderation',
    sections: ['comments'],
  },
  {
    label: 'Operations',
    sections: ['system'],
  },
];

function sectionRoute(section) {
  if (section === 'dashboard') return '#/dashboard';
  if (section === 'comments') return '#/moderation/comments';
  if (section === 'system') return '#/ops/system';
  return '#/content/' + section;
}

function sectionFromRoute() {
  const hash = window.location.hash || '#/dashboard';

  if (hash === '#/dashboard') return 'dashboard';
  if (hash === '#/moderation/comments') return 'comments';
  if (hash === '#/ops/system') return 'system';

  const match = hash.match(/^#\/content\/([^/]+)$/);
  return match?.[1] || 'dashboard';
}

function canAccessSection(user, section) {
  return Boolean(
    user &&
    ROLE_META[user.role]?.sections.has(section)
  );
}

function roleLabel(role) {
  return ROLE_META[role]?.label || role || 'Unknown role';
}

function validateContent(value) {
  const errors = [];
  const warnings = [];
  const data = value && typeof value === 'object' ? value : {};

  if (!data.profile?.name?.trim()) errors.push('Profile name is empty.');
  if (!data.profile?.title?.trim()) warnings.push('Profile title is empty.');
  if (!data.profile?.headline?.trim()) warnings.push('Profile headline is empty.');
  if (!data.profile?.summary?.trim()) warnings.push('Profile summary is empty.');

  for (const section of CONTENT_COLLECTIONS) {
    const items = data[section];
    if (!Array.isArray(items)) {
      errors.push(section + ' must be an array.');
      continue;
    }

    const ids = new Set();

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        errors.push(section + ' contains an invalid item.');
        continue;
      }

      if (!item.id?.trim()) {
        errors.push(section + ' contains an item without an ID.');
      } else if (ids.has(item.id)) {
        errors.push('Duplicate ID in ' + section + ': ' + item.id + '.');
      } else {
        ids.add(item.id);
      }

      if (Array.isArray(item.media)) {
        item.media.forEach((media, index) => {
          if (!media || typeof media !== 'object') {
            errors.push(section + '/' + (item.id || 'item') + ' media #' + (index + 1) + ' is invalid.');
          } else if (!media.type) {
            warnings.push(section + '/' + (item.id || 'item') + ' media #' + (index + 1) + ' has no type.');
          }
        });
      }
    }
  }

  for (const item of Array.isArray(data.experience) ? data.experience : []) {
    if (item.start && item.end && item.end < item.start) {
      warnings.push('Experience date range looks reversed: ' + (item.company || item.id) + '.');
    }
  }

  return {
    errors,
    warnings,
    valid: errors.length === 0,
  };
}

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
  const [authState, setAuthState] = useState('loading');
  const [adminUser, setAdminUser] = useState(null);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const response = await fetch(API + '/api/admin/me', {
        credentials: 'include',
      });

      if (!response.ok) {
        setAuthState('logged-out');
        return;
      }

      const data = await response.json();

      if (!data?.user?.role || !ROLE_META[data.user.role]) {
        setAuthState('logged-out');
        return;
      }

      setAdminUser(data.user);
      setAuthState('authenticated');
    } catch {
      setAuthState('logged-out');
    }
  }

  async function login(credentials) {
    setLoginError('');

    try {
      const response = await fetch(API + '/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error === 'invalid_credentials'
          ? 'Invalid username or password.'
          : (data?.error || 'Login failed.'));
      }

      setAdminUser(data.user);
      setAuthState('authenticated');
      setLoginError('');

      const requestedSection = sectionFromRoute();
      const safeSection = canAccessSection(data.user, requestedSection)
        ? requestedSection
        : 'dashboard';

      if (window.location.hash !== sectionRoute(safeSection)) {
        window.location.hash = sectionRoute(safeSection);
      }
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function logout() {
    try {
      await fetch(API + '/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}

    setAdminUser(null);
    setAuthState('logged-out');
    window.location.hash = '#/dashboard';
  }

  if (authState === 'loading') {
    return <div className="admin-loading">ฅ^•ﻌ•^ฅ <span>Checking admin session...</span></div>;
  }

  if (authState !== 'authenticated') {
    return <LoginScreen onLogin={login} error={loginError} />;
  }

  return <AdminShell user={adminUser} onLogout={logout} />;
}

function LoginScreen({ onLogin, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      await onLogin({ username, password });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-shell">
      <form className="admin-login-card" onSubmit={submit}>
        <div className="admin-login-mark">ฅ^•ﻌ•^ฅ</div>
        <small>LOCAL ADMIN</small>
        <h1>Sign in to ZUL / ADMIN</h1>
        <p>Content editing, comment moderation and API diagnostics are separated by role.</p>

        <label className="login-field">
          <span>Username</span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="save login-submit" disabled={loading || !username || !password}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <small className="login-note">
          Local admin session is held by the server in an HttpOnly cookie.
        </small>
      </form>
    </div>
  );
}

function AdminShell({ user, onLogout }) {
  const [content, setContent] = useState(null);
  const [section, setSection] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [raw, setRaw] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [driveMedia, setDriveMedia] = useState([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentFilter, setCommentFilter] = useState('all');
  const [serviceStatus, setServiceStatus] = useState({});
  const [serviceLoading, setServiceLoading] = useState(false);
  const [onlineChatTest, setOnlineChatTest] = useState({ loading: false, reply: '', error: '' });
  const [hiringTarget, setHiringTarget] = useState('technical officer');
  const [hiringTest, setHiringTest] = useState({ loading: false, data: null, error: '' });
  const [hasDraft, setHasDraft] = useState(() => {
    try { return Boolean(localStorage.getItem(LOCAL_DRAFT_KEY)); } catch { return false; }
  });

  useEffect(() => {
    loadContent();
    refreshSystem();
  }, []);

  useEffect(() => {
    if (content) setRaw(JSON.stringify(content, null, 2));
  }, [content]);

  async function setLoadedContent(value, message) {
    const normalized = normalizeContent(value);
    setContent(normalized);
    setSavedSnapshot(JSON.stringify(normalized));
    setRaw(JSON.stringify(normalized, null, 2));
    setHasDraft(false);
    try { localStorage.removeItem(LOCAL_DRAFT_KEY); } catch {}
    setNotice(message);
  }

  async function loadContent() {
    setNotice('Loading portfolio data...');

    try {
      const response = await fetch(`${API}/api/content`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      setApiOnline(true);
      await setLoadedContent(data, 'Connected to the portfolio API.');
    } catch (error) {
      console.error(error);
      setApiOnline(false);

      // Give the editor a useful local fallback instead of an empty screen.
      try {
        const local = await fetch('/content.json');
        if (local.ok) {
          await setLoadedContent(await local.json(), 'API offline — editing local content. Saving requires the API.');
          return;
        }
      } catch {}

      await setLoadedContent(clone(DEFAULT_CONTENT), 'API and local content unavailable — started with an empty template.');
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
      if (!response.ok) throw new Error(data?.error || ('Save failed (' + response.status + ')'));

      const normalized = normalizeContent(data.content || content);
      setContent(normalized);
      setSavedSnapshot(JSON.stringify(normalized));
      try { localStorage.removeItem(LOCAL_DRAFT_KEY); } catch {}
      setHasDraft(false);
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

  function moveItem(sectionName, index, direction) {
    setContent((current) => {
      const next = [...current[sectionName]];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, [sectionName]: next };
    });
  }

  function duplicateItem(sectionName, index) {
    setContent((current) => {
      const next = [...current[sectionName]];
      const copy = clone(next[index]);
      copy.id = makeId(sectionName);
      next.splice(index + 1, 0, copy);
      return { ...current, [sectionName]: next };
    });
  }

  function restoreDraft() {
    try {
      const stored = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed?.content) throw new Error('Draft content missing.');
      setContent(normalizeContent(parsed.content));
      setNotice('Local draft restored.');
    } catch (error) {
      setNotice('Draft restore failed: ' + error.message);
    }
  }

  function discardDraft() {
    try { localStorage.removeItem(LOCAL_DRAFT_KEY); } catch {}
    setHasDraft(false);
    setNotice('Local draft cleared.');
  }

  function revertSaved() {
    if (!savedSnapshot) return;
    try {
      setContent(normalizeContent(JSON.parse(savedSnapshot)));
      setNotice('Reverted to the last loaded/saved version.');
    } catch (error) {
      setNotice('Revert failed: ' + error.message);
    }
  }

  function exportBackup() {
    if (!content) return;
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'portfolio-content-' + new Date().toISOString().slice(0, 10) + '.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Portfolio JSON backup exported.');
  }

  function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        setContent(normalizeContent(parsed));
        setNotice('Imported ' + file.name + '. Review validation and save when ready.');
      } catch (error) {
        setNotice('Import failed: ' + error.message);
      }
    };
    reader.onerror = () => setNotice('Import failed: could not read the file.');
    reader.readAsText(file);
  }

  async function refreshSystem() {
    setServiceLoading(true);

    const probe = async (label, url) => {
      const started = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let response;
        try {
          response = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        return {
          label,
          ok: response.ok,
          status: response.status,
          latency: Math.round(performance.now() - started),
          data,
        };
      } catch (error) {
        return {
          label,
          ok: false,
          status: 0,
          latency: Math.round(performance.now() - started),
          error: error.message,
        };
      }
    };

    const [local, ai, online] = await Promise.all([
      probe('Local API', API + '/api/health'),
      probe('Local AI', API + '/api/ai-status'),
      probe('Online API', ONLINE_API + '/api/health'),
    ]);

    setServiceStatus({
      local,
      ai,
      online,
      checkedAt: new Date().toISOString(),
    });
    setServiceLoading(false);
  }

  async function loadDriveMedia() {
    setDriveLoading(true);
    try {
      const response = await fetch(API + '/api/drive/media');
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Drive API returned ' + response.status);
      setDriveMedia(Array.isArray(data) ? data : []);
      setNotice('Loaded ' + (Array.isArray(data) ? data.length : 0) + ' Drive media items.');
    } catch (error) {
      setDriveMedia([]);
      setNotice('Drive media unavailable: ' + error.message);
    } finally {
      setDriveLoading(false);
    }
  }

  async function loadComments() {
    setCommentLoading(true);
    try {
      const response = await fetch(API + '/api/admin/comments', {
        headers: adminSecret.trim() ? { 'X-Admin-Secret': adminSecret.trim() } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Comments API returned ' + response.status);
      setComments(Array.isArray(data.comments) ? data.comments : []);
      setNotice('Loaded ' + (Array.isArray(data.comments) ? data.comments.length : 0) + ' comments.');
    } catch (error) {
      setComments([]);
      setNotice('Comment moderation unavailable: ' + error.message);
    } finally {
      setCommentLoading(false);
    }
  }

  async function moderateComment(id) {
    try {
      const response = await fetch(API + '/api/admin/comments/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: adminSecret.trim() ? { 'X-Admin-Secret': adminSecret.trim() } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Moderation failed (' + response.status + ')');
      setComments((current) => current.map((item) =>
        item.id === id
          ? { ...item, deleted: true, comment: '', updatedAt: new Date().toISOString() }
          : item
      ));
      setNotice('Comment hidden from the public portfolio.');
    } catch (error) {
      setNotice('Comment moderation failed: ' + error.message);
    }
  }

  async function testOnlineChat() {
    setOnlineChatTest({ loading: true, reply: '', error: '' });
    try {
      const response = await fetch(ONLINE_API + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: "Give a concise summary of Zulfaqar's current education and cybersecurity focus.",
          history: [],
          context: content,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Online AI returned ' + response.status);
      setOnlineChatTest({ loading: false, reply: data.reply || '', error: '' });
    } catch (error) {
      setOnlineChatTest({ loading: false, reply: '', error: error.message });
    }
  }

  async function testHiringFilter() {
    setHiringTest({ loading: true, data: null, error: '' });
    try {
      const response = await fetch(ONLINE_API + '/api/hiring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: hiringTarget, content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Hiring API returned ' + response.status);
      setHiringTest({ loading: false, data, error: '' });
    } catch (error) {
      setHiringTest({ loading: false, data: null, error: error.message });
    }
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

  const contentSnapshot = useMemo(
    () => (content ? JSON.stringify(content) : ''),
    [content]
  );
  const isDirty = Boolean(content && savedSnapshot && contentSnapshot !== savedSnapshot);
  const validation = useMemo(() => validateContent(content), [content]);

  useEffect(() => {
    if (!content || !isDirty) return undefined;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          LOCAL_DRAFT_KEY,
          JSON.stringify({ savedAt: new Date().toISOString(), content })
        );
        setHasDraft(true);
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [content, isDirty]);

  useEffect(() => {
    const handler = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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
          <span className={isDirty ? 'dirty-badge' : 'saved-badge'}>{isDirty ? 'Unsaved changes' : 'Saved'}</span>
          <button className="ghost" onClick={() => window.open(PUBLIC_SITE, '_blank')} disabled={saving}>Public site</button>
          <button className="ghost" onClick={() => window.open(HIRING_ROUTE, '_blank')} disabled={saving}>Hiring view</button>
          <button className="save" onClick={saveContent} disabled={saving || !apiOnline || !isDirty}>
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

          {section === 'dashboard' && (
            <DashboardEditor
              content={content}
              validation={validation}
              isDirty={isDirty}
              hasDraft={hasDraft}
              serviceStatus={serviceStatus}
              serviceLoading={serviceLoading}
              refreshSystem={refreshSystem}
              saveContent={saveContent}
              exportBackup={exportBackup}
              importBackup={importBackup}
              restoreDraft={restoreDraft}
              discardDraft={discardDraft}
              setSection={setSection}
            />
          )}

          {section === 'media' && (
            <MediaLibraryEditor
              driveMedia={driveMedia}
              driveLoading={driveLoading}
              loadDriveMedia={loadDriveMedia}
              content={content}
              updateImage={updateImage}
            />
          )}

          {section === 'comments' && (
            <CommentsEditor
              comments={comments}
              loading={commentLoading}
              filter={commentFilter}
              setFilter={setCommentFilter}
              loadComments={loadComments}
              moderateComment={moderateComment}
            />
          )}

          {section === 'system' && (
            <SystemEditor
              serviceStatus={serviceStatus}
              serviceLoading={serviceLoading}
              refreshSystem={refreshSystem}
              onlineChatTest={onlineChatTest}
              testOnlineChat={testOnlineChat}
              hiringTarget={hiringTarget}
              setHiringTarget={setHiringTarget}
              hiringTest={hiringTest}
              testHiringFilter={testHiringFilter}
            />
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
              moveItem={moveItem}
              duplicateItem={duplicateItem}
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
              moveItem={moveItem}
              duplicateItem={duplicateItem}
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
              moveItem={moveItem}
              duplicateItem={duplicateItem}
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
        <Field label="ORCID" value={profile.orcid || ''} onChange={(v) => updateProfile('orcid', v)} />
        <Field wide multiline label="Summary" value={profile.summary} onChange={(v) => updateProfile('summary', v)} />
      </div>

      <div className="subpanel">
        <PanelHeader eyebrow="PROFILE IMAGE" title="Image sources" compact />
        <div className="form-grid">
          <Field label="Local image path" value={profile.image?.local || ''} onChange={(v) => updateImage('local', v)} />
          <Field label="Google Drive file ID" value={profile.image?.driveId || ''} onChange={(v) => updateImage('driveId', v)} />
        </div>
      </div>

      <div className="subpanel">
        <PanelHeader eyebrow="CONTACT / SOCIAL" title="Profile links" compact />
        <StringListEditor
          items={Array.isArray(profile.links) ? profile.links : []}
          onChange={(value) => updateProfile('links', value)}
          placeholder="https://example.com or mailto:name@example.com"
          addLabel="Add link"
        />
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

function CardEditor({
  section,
  items,
  allItems,
  expanded,
  setExpanded,
  updateItem,
  addItem,
  removeItem,
  moveItem,
  duplicateItem,
}) {
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
                onMoveUp={() => moveItem(section, index, -1)}
                onMoveDown={() => moveItem(section, index, 1)}
                onDuplicate={() => duplicateItem(section, index)}
                section={section}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemEditorCard({
  item,
  open,
  onToggle,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  section,
}) {
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

          </div>
          <MediaListEditor
            media={Array.isArray(item.media) ? item.media : []}
            onChange={(value) => onChange('media', value)}
          />
          <div className="editor-card-actions">
            <button className="ghost small" onClick={onMoveUp}>↑ Move up</button>
            <button className="ghost small" onClick={onMoveDown}>↓ Move down</button>
            <button className="ghost small" onClick={onDuplicate}>Duplicate</button>
            <button className="delete-button" onClick={onDelete}>Delete card</button>
          </div>
        </div>
      )}
    </article>
  );
}

function ExperienceEditor({
  items,
  allItems,
  expanded,
  setExpanded,
  updateItem,
  addItem,
  removeItem,
  moveItem,
  duplicateItem,
}) {
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
                  </div>
                  <MediaListEditor
                    media={Array.isArray(item.media) ? item.media : []}
                    onChange={(value) => updateItem('experience', index, 'media', value)}
                  />
                  <div className="editor-card-actions">
                    <button className="ghost small" onClick={() => moveItem('experience', index, -1)}>↑ Move up</button>
                    <button className="ghost small" onClick={() => moveItem('experience', index, 1)}>↓ Move down</button>
                    <button className="ghost small" onClick={() => duplicateItem('experience', index)}>Duplicate</button>
                    <button className="delete-button" onClick={() => removeItem('experience', index)}>Delete experience</button>
                  </div>
                </div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EducationEditor({
  items,
  allItems,
  expanded,
  setExpanded,
  updateItem,
  addItem,
  removeItem,
  moveItem,
  duplicateItem,
}) {
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
                  <div className="editor-card-actions">
                    <button className="ghost small" onClick={() => moveItem('education', index, -1)}>↑ Move up</button>
                    <button className="ghost small" onClick={() => moveItem('education', index, 1)}>↓ Move down</button>
                    <button className="ghost small" onClick={() => duplicateItem('education', index)}>Duplicate</button>
                    <button className="delete-button" onClick={() => removeItem('education', index)}>Delete education</button>
                  </div>
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

function StringListEditor({ items, onChange, placeholder, addLabel }) {
  const values = Array.isArray(items) ? items : [];

  return (
    <div className="string-list-editor">
      {values.map((value, index) => (
        <div className="string-list-row" key={String(value) + '-' + index}>
          <input
            value={value || ''}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...values];
              next[index] = e.target.value;
              onChange(next);
            }}
          />
          <button
            className="delete-button compact"
            type="button"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="accent-button"
        type="button"
        onClick={() => onChange([...values, ''])}
      >
        + {addLabel}
      </button>
    </div>
  );
}

function MediaListEditor({ media, onChange }) {
  const items = Array.isArray(media) ? media : [];

  function update(index, field, value) {
    const next = clone(items);
    next[index] = { ...(next[index] || {}), [field]: value };
    onChange(next);
  }

  function remove(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="media-editor">
      <div className="panel-head compact">
        <div><small>ATTACHMENTS</small><h2>Media items</h2></div>
        <button className="accent-button" type="button" onClick={() => onChange([
          ...items,
          { type: 'link', title: '', body: '', url: '', driveId: '', alt: '' },
        ])}>+ Add media</button>
      </div>

      {!items.length && <div className="media-empty">No media attached. Add a link or use the Drive library.</div>}

      <div className="media-edit-list">
        {items.map((item, index) => (
          <div className="media-edit-card" key={(item.title || 'media') + '-' + index}>
            <div className="media-edit-grid">
              <label className="field">
                <span>Type</span>
                <select value={item.type || 'link'} onChange={(e) => update(index, 'type', e.target.value)}>
                  <option value="link">Link</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>
              <Field label="Title" value={item.title || ''} onChange={(v) => update(index, 'title', v)} />
              <Field wide label="URL" value={item.url || ''} onChange={(v) => update(index, 'url', v)} />
              <Field wide label="Drive file ID" value={item.driveId || ''} onChange={(v) => update(index, 'driveId', v)} />
              <Field wide multiline label="Body / description" value={item.body || ''} onChange={(v) => update(index, 'body', v)} />
              <Field wide label="Alt text" value={item.alt || ''} onChange={(v) => update(index, 'alt', v)} />
            </div>
            <button className="delete-button compact" type="button" onClick={() => remove(index)}>Remove media</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardEditor({
  content,
  validation,
  isDirty,
  hasDraft,
  serviceStatus,
  serviceLoading,
  refreshSystem,
  saveContent,
  exportBackup,
  importBackup,
  restoreDraft,
  discardDraft,
  setSection,
}) {
  const totalRecords = CONTENT_COLLECTIONS.reduce((sum, section) =>
    sum + (Array.isArray(content[section]) ? content[section].length : 0), 0);

  return (
    <div className="dashboard-grid">
      <section className="panel hero-panel">
        <div className="dashboard-intro">
          <div>
            <small>CONTROL ROOM</small>
            <h2>Portfolio admin dashboard</h2>
            <p>Manage content, protect drafts, preview the public site and verify the local + online services.</p>
          </div>
          <div className={isDirty ? 'dashboard-state dirty' : 'dashboard-state'}>
            <strong>{isDirty ? 'Draft changes ready' : 'Everything saved'}</strong>
            <span>{validation.valid ? 'Content structure passes validation.' : validation.errors.length + ' validation error(s) need attention.'}</span>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <Stat label="Content records" value={totalRecords} />
        <Stat label="Experience" value={content.experience.length} />
        <Stat label="Projects" value={content.projects.length} />
        <Stat label="Certificates" value={content.certifications.length} />
        <Stat label="Achievements" value={content.achievements.length} />
        <Stat label="Education" value={content.education.length} />
      </div>

      <section className="panel">
        <PanelHeader eyebrow="DATA HEALTH" title="Validation" />
        {!validation.errors.length && !validation.warnings.length && <div className="health-good">✓ No validation issues detected.</div>}
        {validation.errors.length > 0 && <div className="validation-group error"><strong>{validation.errors.length} error(s)</strong>{validation.errors.map((item) => <div key={item}>• {item}</div>)}</div>}
        {validation.warnings.length > 0 && <div className="validation-group warning"><strong>{validation.warnings.length} warning(s)</strong>{validation.warnings.map((item) => <div key={item}>• {item}</div>)}</div>}
      </section>

      <section className="panel">
        <PanelHeader eyebrow="SAFETY" title="Local backup & draft" />
        <div className="action-grid">
          <button className="accent-button" onClick={exportBackup}>Export JSON</button>
          <label className="ghost file-button">Import JSON<input type="file" accept="application/json,.json" onChange={importBackup} /></label>
          <button className="ghost" onClick={restoreDraft} disabled={!hasDraft}>Restore local draft</button>
          <button className="ghost" onClick={discardDraft} disabled={!hasDraft}>Discard local draft</button>
        </div>
        <p className="helper">Local drafts stay in this browser and are separate from the saved server content.</p>
      </section>

      <section className="panel">
        <PanelHeader eyebrow="SERVICES" title="Connection status" />
        <div className="service-list">
          {[['local', 'Local API'], ['ai', 'Local AI'], ['online', 'Online Vercel API']].map(([key, label]) => (
            <ServiceRow key={key} label={label} item={serviceStatus[key]} />
          ))}
        </div>
        <button className="accent-button" onClick={refreshSystem} disabled={serviceLoading}>{serviceLoading ? 'Checking...' : 'Refresh services'}</button>
      </section>

      <section className="panel">
        <PanelHeader eyebrow="QUICK NAV" title="Editor shortcuts" />
        <div className="quick-nav">
          {CONTENT_COLLECTIONS.map((section) => <button key={section} className="ghost" onClick={() => setSection(section)}>{SECTION_META[section]}</button>)}
        </div>
      </section>

      <section className="panel">
        <PanelHeader eyebrow="PUBLISHING" title="Preview" />
        <div className="preview-links">
          <button className="accent-button" onClick={() => window.open(PUBLIC_SITE, '_blank')}>Open public homepage</button>
          <button className="ghost" onClick={() => window.open(HIRING_ROUTE, '_blank')}>Open technical officer view</button>
          <button className="save" onClick={saveContent} disabled={!isDirty}>Save current changes</button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="stat-card"><small>{label}</small><strong>{value}</strong></div>;
}

function ServiceRow({ label, item }) {
  if (!item) return <div className="service-row"><span>{label}</span><b>Not checked</b></div>;
  return (
    <div className="service-row">
      <span>{label}</span>
      <div>
        <b className={item.ok ? 'service-ok' : 'service-fail'}>{item.ok ? 'Online' : 'Offline'}</b>
        {item.status > 0 && <small>{item.status} · {item.latency} ms</small>}
        {item.error && <small>{item.error}</small>}
        {item.data?.chatbot !== undefined && <small>Chatbot: {item.data.chatbot ? 'configured' : 'missing'}</small>}
      </div>
    </div>
  );
}

function MediaLibraryEditor({ driveMedia, driveLoading, loadDriveMedia, content, updateImage }) {
  return (
    <section className="panel">
      <PanelHeader eyebrow="GOOGLE DRIVE" title="Media library" />
      <div className="media-library-toolbar">
        <p className="helper">Browse the configured Drive root in read-only mode. Copy IDs into media items or attach a file to the profile image.</p>
        <button className="accent-button" onClick={loadDriveMedia} disabled={driveLoading}>{driveLoading ? 'Loading...' : 'Refresh Drive'}</button>
      </div>
      <div className="profile-drive-row">
        <Field label="Profile Drive file ID" value={content.profile.image?.driveId || ''} onChange={(v) => updateImage('driveId', v)} />
      </div>
      {!driveMedia.length ? <div className="media-empty">No Drive media loaded yet.</div> : (
        <div className="drive-grid">
          {driveMedia.map((item) => (
            <article className="drive-card" key={item.id}>
              {item.thumbnailLink ? <img src={item.thumbnailLink} alt="" /> : <div className="drive-thumb">FILE</div>}
              <div><strong title={item.name}>{item.name}</strong><small>{item.mimeType || 'Unknown type'}</small><code>{item.id}</code></div>
              <div className="drive-actions">
                <button className="ghost small" onClick={() => navigator.clipboard?.writeText(item.id)}>Copy ID</button>
                <button className="accent-button small" onClick={() => updateImage('driveId', item.id)}>Use for profile</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CommentsEditor({ comments, loading, filter, setFilter, loadComments, moderateComment }) {
  const visible = comments.filter((item) => filter === 'active' ? !item.deleted : filter === 'deleted' ? item.deleted : true);
  return (
    <section className="panel">
      <div className="panel-head">
        <div><small>ONLINE COMMENTS</small><h2>Moderation queue</h2></div>
        <button className="accent-button" onClick={loadComments} disabled={loading}>{loading ? 'Loading...' : 'Refresh comments'}</button>
      </div>
      <div className="comment-toolbar">
        {['all', 'active', 'deleted'].map((value) => {
          const count = comments.filter((item) => value === 'all' || (value === 'active' && !item.deleted) || (value === 'deleted' && item.deleted)).length;
          return <button key={value} className={filter === value ? 'filter-pill active' : 'filter-pill'} onClick={() => setFilter(value)}>{value} ({count})</button>;
        })}
      </div>
      {!visible.length ? <EmptyState action={null} /> : (
        <div className="comment-admin-list">
          {visible.map((item) => (
            <article className={item.deleted ? 'comment-admin-card deleted' : 'comment-admin-card'} key={item.id}>
              <div className="comment-admin-top"><div><strong>{item.name || 'Anonymous'}</strong><small>{item.term}</small></div><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small></div>
              <p>{item.deleted ? '[Hidden from public view]' : item.comment}</p>
              {item.parentId && <small className="comment-reply-label">Reply · parent {item.parentId}</small>}
              {!item.deleted && <div className="comment-admin-actions"><button className="delete-button" onClick={() => moderateComment(item.id)}>Hide comment</button></div>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SystemEditor({
  serviceStatus,
  serviceLoading,
  refreshSystem,
  onlineChatTest,
  testOnlineChat,
  hiringTarget,
  setHiringTarget,
  hiringTest,
  testHiringFilter,
}) {
  return (
    <div className="system-grid">
      <section className="panel">
        <PanelHeader eyebrow="RUNTIME" title="Service diagnostics" />
        <div className="service-list">{[['local', 'Local API'], ['ai', 'Local AI'], ['online', 'Online API']].map(([key, label]) => <ServiceRow key={key} label={label} item={serviceStatus[key]} />)}</div>
        <button className="accent-button" onClick={refreshSystem} disabled={serviceLoading}>{serviceLoading ? 'Checking...' : 'Run diagnostic'}</button>
        {serviceStatus.checkedAt && <small className="system-note">Checked {new Date(serviceStatus.checkedAt).toLocaleString()}</small>}
      </section>

      <section className="panel">
        <PanelHeader eyebrow="PUBLIC AI" title="Chatbot smoke test" />
        <p className="helper">Sends one real request to the online Vercel chatbot using the current portfolio content.</p>
        <button className="accent-button" onClick={testOnlineChat} disabled={onlineChatTest.loading}>{onlineChatTest.loading ? 'Testing...' : 'Test online AI'}</button>
        {onlineChatTest.reply && <div className="test-output">{onlineChatTest.reply}</div>}
        {onlineChatTest.error && <div className="test-error">{onlineChatTest.error}</div>}
      </section>

      <section className="panel">
        <PanelHeader eyebrow="HIRING FILTER" title="Relevance test" />
        <div className="inline-test">
          <Field label="Target work type" value={hiringTarget} onChange={setHiringTarget} />
          <button className="accent-button" onClick={testHiringFilter} disabled={hiringTest.loading || !hiringTarget.trim()}>{hiringTest.loading ? 'Testing...' : 'Run hiring filter'}</button>
        </div>
        {hiringTest.data && (
          <div className="selection-grid">
            {Object.entries(hiringTest.data).map(([key, ids]) => (
              <div className="selection-card" key={key}><small>{SECTION_META[key] || key}</small><strong>{Array.isArray(ids) ? ids.length : 0}</strong><span>{Array.isArray(ids) ? ids.join(', ') || 'No matches' : 'Invalid response'}</span></div>
            ))}
          </div>
        )}
        {hiringTest.error && <div className="test-error">{hiringTest.error}</div>}
      </section>
    </div>
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
