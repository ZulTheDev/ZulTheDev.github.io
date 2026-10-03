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
  'ctf-writeups': 'CTF writeups',
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
      'ctf-writeups',
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

const WRITEUP_BLOCK_TYPES = [
  ['paragraph', 'Paragraph'],
  ['heading', 'Heading'],
  ['quote', 'Quote'],
  ['list', 'List'],
  ['table', 'Table'],
  ['code', 'Code'],
  ['media', 'Media'],
  ['workflow', 'Interactive workflow'],
];

const JUDGE0_LANGUAGES = [
  { id: 71, label: 'Python 3' },
  { id: 63, label: 'JavaScript' },
  { id: 54, label: 'C++' },
  { id: 50, label: 'C' },
  { id: 62, label: 'Java' },
  { id: 60, label: 'Go' },
  { id: 73, label: 'Rust' },
  { id: 74, label: 'TypeScript' },
  { id: 72, label: 'Ruby' },
  { id: 46, label: 'Bash' },
];

function newWriteup() {
  const sessionId = makeId('session');

  return {
    version: 1,
    title: 'Untitled CTF Writeup',
    slug: 'untitled-ctf-writeup',
    excerpt: '',
    author: 'Zulfaqar Jamal',
    tags: [],
    ctf: {
      event: '',
      category: '',
      difficulty: '',
      points: '',
      flag: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    status: 'draft',
    sessions: [
      { id: sessionId, title: 'Introduction' },
    ],
    blocks: [
      { id: makeId('block'), sessionId, type: 'paragraph', html: '' },
    ],
    workspace: {
      id: makeId('workspace'),
      title: 'Interactive workflow',
      nodes: [],
      edges: [],
    },
  };
}

function App() {
  return <AdminShell />;
}

function AdminShell() {
  const [content, setContent] = useState(null);
  const [section, setSectionState] = useState(() => {
    return sectionFromRoute();
  });
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
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
  const [writeups, setWriteups] = useState([]);
  const [activeWriteup, setActiveWriteup] = useState(null);
  const [writeupTab, setWriteupTab] = useState('document');
  const [writeupLoading, setWriteupLoading] = useState(false);
  const [writeupSaving, setWriteupSaving] = useState(false);
  const [writeupPublishing, setWriteupPublishing] = useState(false);
  const [r2Objects, setR2Objects] = useState([]);
  const [r2Loading, setR2Loading] = useState(false);


  useEffect(() => {
    loadContent();
    refreshSystem();

    const handleHashChange = () => {
      const requested = sectionFromRoute();
      setSectionState(requested);
      setSearch('');
      setExpanded(null);
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (content) setRaw(JSON.stringify(content, null, 2));
  }, [content]);

  useEffect(() => {
    if (section === 'ctf-writeups') {
      loadWriteups();
    }
  }, [section]);


  function setSection(nextSection) {
    setSectionState(nextSection);
    setSearch('');
    setExpanded(null);

    const nextRoute = sectionRoute(nextSection);

    if (window.location.hash !== nextRoute) {
      window.location.hash = nextRoute;
    }
  }

  async function authFetch(url, options = {}) {
    return fetch(url, options);
  }

  function buildWriteupFrom(value) {
    const base = value && typeof value === 'object' ? clone(value) : newWriteup();

    return {
      ...newWriteup(),
      ...base,
      ctf: {
        ...newWriteup().ctf,
        ...(base.ctf || {}),
      },
      sessions: Array.isArray(base.sessions) && base.sessions.length
        ? base.sessions
        : newWriteup().sessions,
      blocks: Array.isArray(base.blocks)
        ? base.blocks
        : [],
      workspace: {
        ...newWriteup().workspace,
        ...(base.workspace || {}),
        nodes: Array.isArray(base.workspace?.nodes) ? base.workspace.nodes : [],
        edges: Array.isArray(base.workspace?.edges) ? base.workspace.edges : [],
      },
    };
  }

  async function loadWriteups() {
    setWriteupLoading(true);

    try {
      const response = await authFetch(API + '/api/writeups');

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'Writeup API returned ' + response.status
        );
      }

      setWriteups(
        Array.isArray(data.drafts)
          ? data.drafts
          : []
      );
    } catch (error) {
      setNotice('Writeups unavailable: ' + error.message);
    } finally {
      setWriteupLoading(false);
    }
  }

  function startNewWriteup() {
    setActiveWriteup(newWriteup());
    setWriteupTab('document');
  }

  async function openWriteup(slug) {
    setWriteupLoading(true);

    try {
      const response = await authFetch(
        API + '/api/writeups/' + encodeURIComponent(slug)
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'Writeup returned ' + response.status
        );
      }

      setActiveWriteup(buildWriteupFrom(data));
      setWriteupTab('document');
    } catch (error) {
      setNotice('Unable to open writeup: ' + error.message);
    } finally {
      setWriteupLoading(false);
    }
  }

  function updateActiveWriteup(updater) {
    setActiveWriteup((current) => {
      if (!current) return current;
      return typeof updater === 'function'
        ? updater(current)
        : updater;
    });
  }

  async function saveWriteupDraft() {
    if (!activeWriteup) return;

    setWriteupSaving(true);

    try {
      const slug =
        safeWriteupSlug(activeWriteup.slug || activeWriteup.title);

      const payload = {
        ...activeWriteup,
        slug,
        updatedAt: new Date().toISOString(),
        status: 'draft',
      };

      const response = await authFetch(
        API + '/api/writeups/' + encodeURIComponent(slug),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'Writeup save failed'
        );
      }

      setActiveWriteup(
        buildWriteupFrom(data.writeup || payload)
      );

      await loadWriteups();
      setNotice('Writeup draft saved.');
      return buildWriteupFrom(data.writeup || payload);
    } catch (error) {
      setNotice('Writeup save failed: ' + error.message);
      return null;
    } finally {
      setWriteupSaving(false);
    }
  }

  async function publishActiveWriteup() {
    if (!activeWriteup) return;

    setWriteupPublishing(true);

    try {
      const saved = await saveWriteupDraft();

      if (!saved) {
        throw new Error('Writeup draft could not be saved.');
      }

      const slug = saved.slug;

      const response = await authFetch(
        API +
          '/api/writeups/' +
          encodeURIComponent(slug) +
          '/publish',
        {
          method: 'POST',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'Writeup publish failed'
        );
      }

      setActiveWriteup(
        buildWriteupFrom(data.writeup || activeWriteup)
      );

      await loadWriteups();

      const deploy = data.deploy || data.writeup?.deploy;
      const deployMessage =
        deploy?.pushed
          ? ' GitHub App commit ' + (deploy.commitSha || '').slice(0, 7) + '.'
          : deploy?.message
            ? ' ' + deploy.message
            : '';

      setNotice(
        'Published: ' +
          (data.url || '/ctf-blog/' + slug) +
          deployMessage
      );
    } catch (error) {
      setNotice('Writeup publish failed: ' + error.message);
    } finally {
      setWriteupPublishing(false);
    }
  }

  async function deleteWriteupDraft(slug) {
    if (!slug) return;

    if (!window.confirm('Delete this CTF writeup draft?')) {
      return;
    }

    try {
      const response = await authFetch(
        API + '/api/writeups/' + encodeURIComponent(slug),
        { method: 'DELETE' }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'Writeup delete failed');
      }

      if (activeWriteup?.slug === slug) {
        setActiveWriteup(null);
      }

      await loadWriteups();
      setNotice('Writeup draft deleted.');
    } catch (error) {
      setNotice('Writeup delete failed: ' + error.message);
    }
  }

  async function openR2Object(key) {
    const cleanKey = String(key || '').trim();

    if (!cleanKey) return;

    try {
      const response = await authFetch(
        API +
          '/api/r2/read-url?key=' +
          encodeURIComponent(cleanKey)
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'R2 read URL unavailable');
      }

      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNotice('R2 read failed: ' + error.message);
    }
  }

  async function deleteR2Object(key) {
    const cleanKey = String(key || '').trim();

    if (!cleanKey) return;

    if (!window.confirm('Delete this R2 object? This cannot be undone.')) {
      return;
    }

    try {
      const response = await authFetch(
        API + '/api/r2/objects',
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: cleanKey,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'R2 delete failed');
      }

      updateWriteup((current) => ({
        ...current,
        mediaLibrary: Array.isArray(current.mediaLibrary)
          ? current.mediaLibrary.filter(
              (item) => item?.key !== cleanKey
            )
          : [],
        blocks: Array.isArray(current.blocks)
          ? current.blocks.map((block) => {
              if (
                block?.type !== 'media' ||
                block.media?.key !== cleanKey
              ) {
                return block;
              }

              return {
                ...block,
                media: {
                  ...(block.media || {}),
                  key: '',
                  url: '',
                },
              };
            })
          : [],
      }));

      setNotice('Deleted R2 object: ' + cleanKey);
      await loadR2Objects(activeWriteup?.slug || activeWriteup?.title || '');
    } catch (error) {
      setNotice('R2 delete failed: ' + error.message);
    }
  }

  async function uploadWriteupFile(file, slug) {
    if (!file) return null;

    const response = await authFetch(
      API + '/api/r2/upload-url',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          writeupSlug: slug,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error || 'R2 upload URL unavailable'
      );
    }

    const uploadResponse = await fetch(
      data.uploadUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Type':
            file.type ||
            'application/octet-stream',
        },
        body: file,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(
        'R2 upload returned ' +
          uploadResponse.status
      );
    }

    return {
      key: data.key,
      url: data.publicUrl || '',
      type: file.type || 'application/octet-stream',
      name: file.name,
      size: file.size,
    };
  }

  async function uploadRepositoryMedia(file, folder = 'portfolio-media') {
    if (!file) return null;

    if (
      !file.type.startsWith('image/') &&
      file.type !== 'application/pdf'
    ) {
      throw new Error(
        'Only image files and PDF files can be uploaded to the portfolio repository.'
      );
    }

    if (file.size > 18_000_000) {
      throw new Error(
        'Repository media must be smaller than 18 MB.'
      );
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(String(reader.result || ''));
      reader.onerror = () =>
        reject(
          new Error(
            'Could not read the selected file.'
          )
        );
      reader.readAsDataURL(file);
    });

    const commaIndex = dataUrl.indexOf(',');
    const contentBase64 =
      commaIndex >= 0
        ? dataUrl.slice(commaIndex + 1)
        : '';

    if (!contentBase64) {
      throw new Error(
        'Selected file did not contain readable data.'
      );
    }

    const response = await authFetch(
      API + '/api/repo/media/upload',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentBase64,
          folder,
        }),
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.error ||
          'Repository media upload failed (' +
          response.status +
          ')'
      );
    }

    return {
      ...data,
      type:
        file.type === 'application/pdf'
          ? 'pdf'
          : file.type.startsWith('image/')
            ? 'image'
            : 'link',
      name: file.name,
      mimeType: file.type,
      size: file.size,
    };
  }

  async function loadR2Objects(slug = '') {
    setR2Loading(true);

    try {
      const prefixValue = String(slug || '').trim();
      const prefix = prefixValue
        ? 'ctf-blog/' + safeWriteupSlug(prefixValue) + '/'
        : 'ctf-blog/';

      const response = await authFetch(
        API +
          '/api/r2/objects?prefix=' +
          encodeURIComponent(prefix)
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'R2 list failed'
        );
      }

      setR2Objects(
        Array.isArray(data.objects)
          ? data.objects
          : []
      );
    } catch (error) {
      setNotice('R2 library unavailable: ' + error.message);
    } finally {
      setR2Loading(false);
    }
  }

  function safeWriteupSlug(value) {
    const slug = String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);

    if (!slug) {
      throw new Error('Writeup title/slug is required.');
    }

    return slug;
  }

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
      const response = await authFetch(`${API}/api/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',

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

      const deploy = data.deploy;
      if (deploy?.pushed) {
        setNotice(
          'Saved and pushed to GitHub App (' +
          (deploy.commitSha || '').slice(0, 7) +
          ').'
        );
      } else if (deploy?.message) {
        setNotice(
          'Saved locally. ' +
          deploy.message
        );
      } else {
        setNotice(
          'Saved successfully at ' +
          new Date().toLocaleTimeString() +
          '.'
        );
      }
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

    const checks = [
      probe('Local API', API + '/api/health'),
      probe('Online API', ONLINE_API + '/api/health'),
      probe('R2', API + '/api/r2/status'),
      probe('GitHub App', API + '/api/github-app/status'),
      probe('Local AI', API + '/api/ai-status'),
    ];

    const results = await Promise.all(checks);
    const local = results[0];
    const online = results[1];
    const r2 = results[2];
    const github = results[3];
    const ai = results[4];

    setServiceStatus({
      local,
      ai,
      online,
      r2,
      github,
      checkedAt: new Date().toISOString(),
    });
    setServiceLoading(false);
  }

  async function loadDriveMedia() {
    setDriveLoading(true);
    try {
      const response = await authFetch(API + '/api/drive/media');
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
      const response = await authFetch(API + '/api/admin/comments');
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
      const response = await authFetch(API + '/api/admin/comments/' + encodeURIComponent(id), {
        method: 'DELETE',
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
          <span className="admin-user-chip">
            <strong>LOCAL</strong>
            <small>NO AUTH</small>
          </span>
          <button className="ghost" onClick={loadContent} disabled={saving}>Reload</button>
          <>
            <button className="ghost" onClick={syncRaw} disabled={saving}>Sync JSON</button>
            <span className={isDirty ? 'dirty-badge' : 'saved-badge'}>{isDirty ? 'Unsaved changes' : 'Saved'}</span>
          </>
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
            {NAV_GROUPS.map((group) => {
              return (
                <div className="nav-group" key={group.label}>
                  <small>{group.label}</small>
                  {group.sections.map((key) => (
                    <button
                      key={key}
                      className={section === key ? 'active' : ''}
                      onClick={() => setSection(key)}
                    >
                      <span>{SECTION_META[key]}</span>
                      {Array.isArray(content[key]) && <em>{content[key].length}</em>}
                    </button>
                  ))}
                </div>
              );
            })}
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

          {section === 'ctf-writeups' && (
            <WriteupsEditor
              writeups={writeups}
              activeWriteup={activeWriteup}
              setActiveWriteup={setActiveWriteup}
              loading={writeupLoading}
              saving={writeupSaving}
              publishing={writeupPublishing}
              tab={writeupTab}
              setTab={setWriteupTab}
              startNew={startNewWriteup}
              openWriteup={openWriteup}
              saveDraft={saveWriteupDraft}
              publish={publishActiveWriteup}
              deleteDraft={deleteWriteupDraft}
              updateWriteup={updateActiveWriteup}
              uploadFile={uploadWriteupFile}
              r2Objects={r2Objects}
              r2Loading={r2Loading}
              loadR2Objects={loadR2Objects}
              openR2Object={openR2Object}
              deleteR2Object={deleteR2Object}
              githubStatus={serviceStatus.github}
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
              uploadRepositoryMedia={uploadRepositoryMedia}
              setNotice={setNotice}
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
              uploadRepositoryMedia={uploadRepositoryMedia}
              setNotice={setNotice}
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
  uploadRepositoryMedia,
  setNotice,
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
                key={`${section}-${index}`}
                item={item}
                open={open}
                onToggle={() => setExpanded(open ? null : `${section}-${index}`)}
                onChange={(field, value) => updateItem(section, index, field, value)}
                onDelete={() => removeItem(section, index)}
                onMoveUp={() => moveItem(section, index, -1)}
                onMoveDown={() => moveItem(section, index, 1)}
                onDuplicate={() => duplicateItem(section, index)}
                section={section}
                repositoryFolder={
                  section === 'certifications'
                    ? 'certs'
                    : 'portfolio-media/' + section
                }
                uploadRepositoryMedia={uploadRepositoryMedia}
                setNotice={setNotice}
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
  repositoryFolder,
  uploadRepositoryMedia,
  setNotice,
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
            repositoryFolder={repositoryFolder}
            uploadRepositoryMedia={uploadRepositoryMedia}
            setNotice={setNotice}
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
  uploadRepositoryMedia,
  setNotice,
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
              <article key={`experience-${index}`} className={open ? 'editor-card open' : 'editor-card'}>
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
                    repositoryFolder="portfolio-media/experience"
                    uploadRepositoryMedia={uploadRepositoryMedia}
                    setNotice={setNotice}
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
              <article key={`education-${index}`} className={open ? 'editor-card open' : 'editor-card'}>
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
          <div className="explore-row" key={`explore-${index}`}>
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
        <div className="string-list-row" key={`string-item-${index}`}>
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


function WriteupsEditor({
  writeups,
  activeWriteup,
  setActiveWriteup,
  loading,
  saving,
  publishing,
  tab,
  setTab,
  startNew,
  openWriteup,
  saveDraft,
  publish,
  deleteDraft,
  updateWriteup,
  uploadFile,
  r2Objects,
  r2Loading,
  loadR2Objects,
}) {
  return (
    <div className="writeup-admin-shell">
      {!activeWriteup ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <small>CTF BLOG</small>
              <h2>Writeup workspace</h2>
            </div>
            <button className="accent-button" onClick={startNew}>+ New writeup</button>
          </div>

          <p className="helper">
            Build a structured writeup, add sessions, attach R2 media, embed runnable code and create
            an interactive object-to-object workflow before publishing it to <code>/ctf-blog/&lt;slug&gt;</code>.
          </p>

          {loading ? (
            <div className="media-empty">Loading writeup drafts...</div>
          ) : !writeups.length ? (
            <EmptyState action={<button className="accent-button" onClick={startNew}>+ Create your first writeup</button>} />
          ) : (
            <div className="writeup-draft-list">
              {writeups.map((item) => (
                <div
                  className="writeup-draft-card"
                  key={item.slug}
                >
                  <button
                    className="writeup-draft-open"
                    type="button"
                    onClick={() => openWriteup(item.slug)}
                  >
                    <div>
                      <small>{item.status || 'draft'} · {item.slug}</small>
                      <strong>{item.title || 'Untitled writeup'}</strong>
                      <span>{item.excerpt || 'No excerpt yet.'}</span>
                    </div>
                    <b>Open →</b>
                  </button>
                  <button
                    className="delete-button compact"
                    type="button"
                    onClick={() => deleteDraft(item.slug)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="panel writeup-editor-panel">
          <div className="writeup-editor-head">
            <div>
              <small>WRITEUP / {activeWriteup.status || 'DRAFT'}</small>
              <h2>{activeWriteup.title || 'Untitled CTF writeup'}</h2>
              <span>/ctf-blog/{activeWriteup.slug || 'writeup-slug'}</span>
              <small className="writeup-publish-status">
                GitHub App:{' '}
                {githubStatus?.ok
                  ? 'connected'
                  : githubStatus?.status
                    ? 'not ready'
                    : 'run diagnostics'}
              </small>
            </div>
            <div className="writeup-editor-actions">
              <button className="ghost" onClick={() => setActiveWriteup(null)} disabled={saving || publishing}>Back</button>
              <button className="ghost" onClick={saveDraft} disabled={saving || publishing}>
                {saving ? 'Saving...' : 'Save draft'}
              </button>
              <button className="save" onClick={publish} disabled={saving || publishing || !activeWriteup.title?.trim()}>
                {publishing
                  ? 'Publishing...'
                  : githubStatus?.ok
                    ? 'Publish & push'
                    : 'Publish'}
              </button>
            </div>
          </div>

          <div className="writeup-tabs">
            {[
              ['document', 'Document'],
              ['workspace', 'Interactive workspace'],
              ['media', 'R2 media'],
              ['preview', 'Preview data'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? 'active' : ''}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'document' && (
            <WriteupDocumentEditor
              writeup={activeWriteup}
              updateWriteup={updateWriteup}
              uploadFile={uploadFile}
              writeupSlug={activeWriteup.slug || activeWriteup.title}
            />
          )}

          {tab === 'workspace' && (
            <WriteupWorkspaceTab
              writeup={activeWriteup}
              updateWriteup={updateWriteup}
            />
          )}

          {tab === 'media' && (
            <WriteupR2MediaTab
              writeup={activeWriteup}
              updateWriteup={updateWriteup}
              uploadFile={uploadFile}
              r2Objects={r2Objects}
              r2Loading={r2Loading}
              loadR2Objects={loadR2Objects}
            />
          )}

          {tab === 'preview' && (
            <WriteupPreviewData writeup={activeWriteup} />
          )}
        </section>
      )}
    </div>
  );
}

function WriteupDocumentEditor({
  writeup,
  updateWriteup,
  uploadFile,
}) {
  const sessions = Array.isArray(writeup.sessions) ? writeup.sessions : [];
  const blocks = Array.isArray(writeup.blocks) ? writeup.blocks : [];

  function updateField(field, value) {
    updateWriteup((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSession(index, field, value) {
    updateWriteup((current) => {
      const next = clone(current.sessions || []);
      next[index] = {
        ...(next[index] || {}),
        [field]: value,
      };
      return { ...current, sessions: next };
    });
  }

  function addSession() {
    const session = {
      id: makeId('session'),
      title: 'New session',
    };

    updateWriteup((current) => ({
      ...current,
      sessions: [...(current.sessions || []), session],
    }));
  }

  function removeSession(index) {
    updateWriteup((current) => {
      const nextSessions = current.sessions.filter((_, i) => i !== index);
      const removedId = current.sessions[index]?.id;
      const fallback = nextSessions[0]?.id || '';

      return {
        ...current,
        sessions: nextSessions.length ? nextSessions : [{ id: makeId('session'), title: 'Introduction' }],
        blocks: (current.blocks || []).map((block) =>
          block.sessionId === removedId
            ? { ...block, sessionId: fallback }
            : block
        ),
      };
    });
  }

  function addBlock(type = 'paragraph') {
    updateWriteup((current) => {
      const sessionId =
        current.sessions?.[current.sessions.length - 1]?.id || '';

      const base = {
        id: makeId('block'),
        sessionId,
        type,
      };

      if (type === 'heading') base.html = '<strong>New section</strong>';
      else if (type === 'code') Object.assign(base, { languageId: 71, code: '', stdin: '' });
      else if (type === 'table') Object.assign(base, { headers: ['Column 1', 'Column 2'], rows: [['', ''], ['', '']] });
      else if (type === 'list') base.html = '<ul><li>List item</li></ul>';
      else if (type === 'quote') base.html = '<p>Quote</p>';
      else if (type === 'media') Object.assign(base, { media: null });
      else if (type === 'workflow') Object.assign(base, { title: 'Interactive workflow' });
      else base.html = '';

      return {
        ...current,
        blocks: [...(current.blocks || []), base],
      };
    });
  }

  function updateBlock(index, nextBlock) {
    updateWriteup((current) => {
      const blocksNext = [...(current.blocks || [])];
      blocksNext[index] = nextBlock;
      return { ...current, blocks: blocksNext };
    });
  }

  function removeBlock(index) {
    updateWriteup((current) => ({
      ...current,
      blocks: (current.blocks || []).filter((_, i) => i !== index),
    }));
  }

  function moveBlock(index, direction) {
    updateWriteup((current) => {
      const next = [...(current.blocks || [])];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, blocks: next };
    });
  }

  return (
    <div className="writeup-document-layout">
      <aside className="writeup-session-rail">
        <div className="writeup-meta-card">
          <label className="field">
            <span>Title</span>
            <input value={writeup.title || ''} onChange={(e) => updateField('title', e.target.value)} />
          </label>
          <label className="field">
            <span>URL slug</span>
            <input value={writeup.slug || ''} onChange={(e) => updateField('slug', e.target.value)} />
          </label>
          <label className="field">
            <span>Excerpt</span>
            <textarea rows={4} value={writeup.excerpt || ''} onChange={(e) => updateField('excerpt', e.target.value)} />
          </label>
          <label className="field">
            <span>Tags, comma separated</span>
            <input
              value={Array.isArray(writeup.tags) ? writeup.tags.join(', ') : ''}
              onChange={(e) => updateField('tags', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
            />
          </label>

          <div className="writeup-ctf-meta-grid">
            <Field label="Event / CTF" value={writeup.ctf?.event || ''} onChange={(v) => updateField('ctf', { ...(writeup.ctf || {}), event: v })} />
            <Field label="Category" value={writeup.ctf?.category || ''} onChange={(v) => updateField('ctf', { ...(writeup.ctf || {}), category: v })} />
            <Field label="Difficulty" value={writeup.ctf?.difficulty || ''} onChange={(v) => updateField('ctf', { ...(writeup.ctf || {}), difficulty: v })} />
            <Field label="Points" value={writeup.ctf?.points || ''} onChange={(v) => updateField('ctf', { ...(writeup.ctf || {}), points: v })} />
            <Field wide label="Flag (optional)" value={writeup.ctf?.flag || ''} onChange={(v) => updateField('ctf', { ...(writeup.ctf || {}), flag: v })} />
          </div>
        </div>

        <div className="writeup-session-list">
          <div className="writeup-session-list-head">
            <small>SESSIONS</small>
            <button className="accent-button small" onClick={addSession}>+</button>
          </div>

          {sessions.map((session, index) => (
            <div className="writeup-session-row" key={session.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <input value={session.title || ''} onChange={(e) => updateSession(index, 'title', e.target.value)} />
              <button className="delete-button compact" onClick={() => removeSession(index)}>×</button>
            </div>
          ))}

          <div className="writeup-session-hint">
            These sessions become the public table-of-contents navigation and each block can be assigned to one.
          </div>
        </div>
      </aside>

      <main className="writeup-document">
        <div className="writeup-format-toolbar">
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('bold')}>B</button>
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('italic')}>I</button>
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('underline')}>U</button>
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('justifyLeft')}>Left</button>
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('justifyCenter')}>Center</button>
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('insertUnorderedList')}>• List</button>
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('insertOrderedList')}>1. List</button>
          <select className="writeup-format-select" onChange={(e) => document.execCommand('fontName', false, e.target.value)} defaultValue="">
            <option value="" disabled>Font</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Courier New">Mono</option>
            <option value="Verdana">Verdana</option>
          </select>
          <select className="writeup-format-select" onChange={(e) => document.execCommand('fontSize', false, e.target.value)} defaultValue="">
            <option value="" disabled>Size</option>
            <option value="2">Small</option>
            <option value="3">Normal</option>
            <option value="4">Large</option>
            <option value="5">XL</option>
          </select>
          <button className="ghost small" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('createLink', false, prompt('Link URL') || '')}>Link</button>
        </div>

        <div className="writeup-editor-paper">
          {!blocks.length && (
            <div className="media-empty">
              Start writing, then add tables, code, media or an interactive workflow.
            </div>
          )}

          {blocks.map((block, index) => (
            <WriteupBlockEditor
              key={block.id}
              block={block}
              index={index}
              sessions={sessions}
              update={(next) => updateBlock(index, next)}
              remove={() => removeBlock(index)}
              moveUp={() => moveBlock(index, -1)}
              moveDown={() => moveBlock(index, 1)}
              uploadFile={uploadFile}
              addBlock={addBlock}
              writeupSlug={writeup.slug || writeup.title}
            />
          ))}

          <div className="writeup-add-menu">
            {WRITEUP_BLOCK_TYPES.map(([type, label]) => (
              <button
                className="ghost"
                key={type}
                onClick={() => addBlock(type)}
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function WriteupBlockEditor({
  block,
  index,
  sessions,
  update,
  remove,
  moveUp,
  moveDown,
  uploadFile,
  writeupSlug,
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const editableTypes = new Set(['paragraph', 'heading', 'quote', 'list']);

  function updateField(field, value) {
    update({
      ...block,
      [field]: value,
    });
  }

  async function runCode() {
    setRunning(true);
    setResult(null);

    try {
      const response = await fetch(API + '/api/judge0/run', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_code: block.code || '',
          language_id: Number(block.languageId || 71),
          stdin: block.stdin || '',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
          data?.error ||
          'Judge0 request failed'
        );
      }

      setResult(data);
    } catch (error) {
      setResult({
        error: error.message,
      });
    } finally {
      setRunning(false);
    }
  }

  async function uploadMedia(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    try {
      const media = await uploadFile(file, writeupSlug || 'writeup-media');
      update({
        ...block,
        media,
      });
    } catch (error) {
      setResult({
        error: error.message,
      });
    }
  }

  return (
    <article className="writeup-block-editor">
      <div className="writeup-block-handle">
        <span>#{index + 1}</span>
        <select
          value={block.type || 'paragraph'}
          onChange={(e) => updateField('type', e.target.value)}
        >
          {WRITEUP_BLOCK_TYPES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={block.sessionId || sessions[0]?.id || ''}
          onChange={(e) => updateField('sessionId', e.target.value)}
        >
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>{session.title}</option>
          ))}
        </select>
        <div className="writeup-block-actions">
          <button className="ghost small" onClick={moveUp}>↑</button>
          <button className="ghost small" onClick={moveDown}>↓</button>
          <button className="delete-button compact" onClick={remove}>×</button>
        </div>
      </div>

      {editableTypes.has(block.type) && (
        <div
          className={'writeup-rich-editor ' + block.type}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: block.html || '' }}
          onBlur={(e) => updateField('html', e.currentTarget.innerHTML)}
        />
      )}

      {block.type === 'table' && (
        <WriteupTableEditor
          block={block}
          update={update}
        />
      )}

      {block.type === 'code' && (
        <div className="writeup-code-editor">
          <div className="writeup-code-toolbar">
            <select
              value={Number(block.languageId || 71)}
              onChange={(e) => updateField('languageId', Number(e.target.value))}
            >
              {JUDGE0_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>{language.label}</option>
              ))}
            </select>
            <button className="accent-button small" onClick={runCode} disabled={running || !block.code?.trim()}>
              {running ? 'Running...' : 'Run with Judge0'}
            </button>
          </div>
          <textarea
            className="code-input"
            value={block.code || ''}
            onChange={(e) => updateField('code', e.target.value)}
            spellCheck={false}
            placeholder="// Paste challenge code here"
          />
          <textarea
            className="stdin-input"
            value={block.stdin || ''}
            onChange={(e) => updateField('stdin', e.target.value)}
            spellCheck={false}
            placeholder="stdin (optional)"
          />
          {result && <pre className="judge-result">{JSON.stringify(result, null, 2)}</pre>}
        </div>
      )}

      {block.type === 'media' && (
        <div className="writeup-media-editor">
          <div className="media-upload-row">
            <label className="ghost file-button">
              Choose file
              <input type="file" accept="image/*,video/*,audio/*,application/pdf,text/plain,.zip,.7z,.pcap" onChange={uploadMedia} />
            </label>
            <input
              value={block.media?.url || ''}
              onChange={(e) => updateField('media', { ...(block.media || {}), url: e.target.value })}
              placeholder="or paste an R2/public media URL"
            />
          </div>
          <div className="form-grid">
            <Field label="Title" value={block.media?.name || ''} onChange={(v) => updateField('media', { ...(block.media || {}), name: v })} />
            <Field label="Alt text" value={block.media?.alt || ''} onChange={(v) => updateField('media', { ...(block.media || {}), alt: v })} />
          </div>
        </div>
      )}

      {block.type === 'workflow' && (
        <div className="writeup-workflow-placeholder">
          The interactive workflow is edited in the <strong>Interactive workspace</strong> tab.
          Drop document blocks onto the canvas there, position them and connect the objects.
        </div>
      )}
    </article>
  );
}

function WriteupTableEditor({ block, update }) {
  const headers = Array.isArray(block.headers) ? block.headers : ['Column 1', 'Column 2'];
  const rows = Array.isArray(block.rows) ? block.rows : [['', ''], ['', '']];

  function setCell(rowIndex, colIndex, value, header = false) {
    const nextHeaders = [...headers];
    const nextRows = rows.map((row) => [...row]);

    if (header) {
      nextHeaders[colIndex] = value;
    } else {
      nextRows[rowIndex][colIndex] = value;
    }

    update({
      ...block,
      headers: nextHeaders,
      rows: nextRows,
    });
  }

  function addRow() {
    update({
      ...block,
      rows: [...rows, headers.map(() => '')],
    });
  }

  function addColumn() {
    update({
      ...block,
      headers: [...headers, 'New column'],
      rows: rows.map((row) => [...row, '']),
    });
  }

  function removeRow() {
    if (rows.length <= 1) return;
    update({
      ...block,
      rows: rows.slice(0, -1),
    });
  }

  function removeColumn() {
    if (headers.length <= 1) return;
    update({
      ...block,
      headers: headers.slice(0, -1),
      rows: rows.map((row) => row.slice(0, -1)),
    });
  }

  return (
    <div className="writeup-table-editor">
      <div className="table-controls">
        <button className="ghost small" onClick={addRow}>+ row</button>
        <button className="ghost small" onClick={removeRow}>− row</button>
        <button className="ghost small" onClick={addColumn}>+ column</button>
        <button className="ghost small" onClick={removeColumn}>− column</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((header, colIndex) => (
                <th key={colIndex}>
                  <input
                    value={header}
                    onChange={(e) => setCell(0, colIndex, e.target.value, true)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {headers.map((_, colIndex) => (
                  <td key={colIndex}>
                    <input
                      value={row[colIndex] || ''}
                      onChange={(e) => setCell(rowIndex, colIndex, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WriteupWorkspaceTab({ writeup, updateWriteup }) {
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState(null);

  const workspace = writeup.workspace || {
    id: makeId('workspace'),
    title: 'Interactive workflow',
    nodes: [],
    edges: [],
  };

  function updateWorkspace(updater) {
    updateWriteup((current) => ({
      ...current,
      workspace: typeof updater === 'function'
        ? updater(current.workspace || workspace)
        : updater,
    }));
  }

  function addNode(x = 100, y = 80, label = 'Object') {
    updateWorkspace((current) => ({
      ...current,
      nodes: [
        ...(current.nodes || []),
        {
          id: makeId('node'),
          x,
          y,
          label,
          type: 'object',
          refBlockId: '',
        },
      ],
    }));
  }

  function moveNode(id, x, y) {
    updateWorkspace((current) => ({
      ...current,
      nodes: (current.nodes || []).map((node) =>
        node.id === id
          ? { ...node, x, y }
          : node
      ),
    }));
  }

  function updateNode(id, field, value) {
    updateWorkspace((current) => ({
      ...current,
      nodes: (current.nodes || []).map((node) =>
        node.id === id
          ? { ...node, [field]: value }
          : node
      ),
    }));
  }

  function removeNode(id) {
    updateWorkspace((current) => ({
      ...current,
      nodes: (current.nodes || []).filter((node) => node.id !== id),
      edges: (current.edges || []).filter(
        (edge) => edge.from !== id && edge.to !== id
      ),
    }));

    if (connectFrom === id) {
      setConnectFrom(null);
    }
  }

  function connectNode(id) {
    if (!connectMode) return;

    if (!connectFrom) {
      setConnectFrom(id);
      return;
    }

    if (connectFrom === id) {
      setConnectFrom(null);
      return;
    }

    updateWorkspace((current) => ({
      ...current,
      edges: [
        ...(current.edges || []).filter(
          (edge) =>
            !(edge.from === connectFrom && edge.to === id)
        ),
        {
          id: makeId('edge'),
          from: connectFrom,
          to: id,
          label: '',
        },
      ],
    }));

    setConnectFrom(null);
  }

  function onCanvasDrop(event) {
    event.preventDefault();

    const raw = event.dataTransfer.getData('application/x-writeup-block');

    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      const rect = event.currentTarget.getBoundingClientRect();

      updateWorkspace((current) => ({
        ...current,
        nodes: [
          ...(current.nodes || []),
          {
            id: makeId('node'),
            x: Math.max(20, event.clientX - rect.left - 70),
            y: Math.max(20, event.clientY - rect.top - 30),
            label: data.label,
            type: 'document-block',
            refBlockId: data.id,
          },
        ],
      }));
    } catch {}
  }

  function startDrag(event, block) {
    event.dataTransfer.setData(
      'application/x-writeup-block',
      JSON.stringify({
        id: block.id,
        label: (block.html || block.type || 'Block')
          .replace(/<[^>]+>/g, '')
          .slice(0, 50),
      })
    );
  }

  const nodes = Array.isArray(workspace.nodes) ? workspace.nodes : [];
  const edges = Array.isArray(workspace.edges) ? workspace.edges : [];

  return (
    <div className="writeup-workspace">
      <div className="writeup-workspace-toolbar">
        <div>
          <small>INTERACTIVE CANVAS</small>
          <h2>{workspace.title || 'Interactive workflow'}</h2>
          <p>Drag document blocks into the canvas. Turn on Connect, then click object A and object B to create a workflow edge.</p>
        </div>
        <div className="writeup-workspace-actions">
          <button className={connectMode ? 'accent-button small' : 'ghost small'} onClick={() => { setConnectMode(!connectMode); setConnectFrom(null); }}>
            {connectMode ? 'Connecting...' : 'Connect objects'}
          </button>
          <button className="ghost small" onClick={() => addNode()}>
            + Empty object
          </button>
        </div>
      </div>

      <div className="workspace-grid">
        <aside className="workspace-palette">
          <small>DRAG INTO WORKSPACE</small>
          {writeup.blocks.map((block) => (
            <div
              key={block.id}
              className="workspace-palette-item"
              draggable
              onDragStart={(event) => startDrag(event, block)}
            >
              <strong>{block.type}</strong>
              <span>{(block.html || block.code || block.title || 'Untitled').replace(/<[^>]+>/g, '').slice(0, 80)}</span>
            </div>
          ))}

          <div className="workspace-palette-help">
            Each object can point back to a document block. The public writeup turns these into clickable interactive nodes.
          </div>
        </aside>

        <div
          className={connectMode ? 'workspace-canvas connecting' : 'workspace-canvas'}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onCanvasDrop}
        >
          <svg className="workspace-edges">
            {edges.map((edge) => {
              const from = nodes.find((node) => node.id === edge.from);
              const to = nodes.find((node) => node.id === edge.to);

              if (!from || !to) return null;

              return (
                <line
                  key={edge.id}
                  x1={from.x + 70}
                  y1={from.y + 34}
                  x2={to.x + 70}
                  y2={to.y + 34}
                  markerEnd="url(#workspace-arrow)"
                />
              );
            })}
            <defs>
              <marker id="workspace-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" />
              </marker>
            </defs>
          </svg>

          {nodes.map((node) => (
            <WorkspaceNode
              key={node.id}
              node={node}
              connectMode={connectMode}
              connectFrom={connectFrom}
              blocks={writeup.blocks}
              onMove={moveNode}
              onConnect={() => connectNode(node.id)}
              onChange={updateNode}
              onRemove={() => removeNode(node.id)}
            />
          ))}

          {!nodes.length && (
            <div className="workspace-empty">
              Drag any document block here to create the first interactive object.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceNode({
  node,
  connectMode,
  connectFrom,
  blocks,
  onMove,
  onConnect,
  onChange,
  onRemove,
}) {
  const [dragging, setDragging] = useState(false);

  function startDrag(event) {
    if (connectMode) {
      event.preventDefault();
      onConnect();
      return;
    }

    setDragging(true);

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = node.x;
    const originY = node.y;

    function move(moveEvent) {
      onMove(
        node.id,
        Math.max(10, originX + moveEvent.clientX - startX),
        Math.max(10, originY + moveEvent.clientY - startY)
      );
    }

    function up() {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const block = blocks.find((item) => item.id === node.refBlockId);

  return (
    <div
      className={
        'workspace-node' +
        (dragging ? ' dragging' : '') +
        (connectFrom === node.id ? ' selected' : '')
      }
      style={{ left: node.x, top: node.y }}
      onPointerDown={startDrag}
    >
      <div className="workspace-node-top">
        <input
          value={node.label || ''}
          onChange={(event) => onChange(node.id, 'label', event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
        />
        <button className="delete-button compact" onClick={onRemove}>×</button>
      </div>
      <select
        value={node.refBlockId || ''}
        onChange={(event) => onChange(node.id, 'refBlockId', event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <option value="">No document target</option>
        {blocks.map((item, index) => (
          <option key={item.id} value={item.id}>
            #{index + 1} · {item.type}
          </option>
        ))}
      </select>
      <button
        className="workspace-node-connect"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onConnect}
      >
        {connectMode
          ? (connectFrom === node.id ? 'Selected' : 'Connect')
          : 'Select'}
      </button>
    </div>
  );
}

function WriteupR2MediaTab({
  writeup,
  updateWriteup,
  uploadFile,
  r2Objects,
  r2Loading,
  loadR2Objects,
  openR2Object,
  deleteR2Object,
  githubStatus,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(null);

  useEffect(() => {
    if (writeup?.slug) {
      loadR2Objects(writeup.slug);
    }
  }, [writeup?.slug]);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setUploading(true);
    setUploaded(null);

    try {
      const media = await uploadFile(
        file,
        writeup.slug || writeup.title
      );

      setUploaded(media);

      updateWriteup((current) => ({
        ...current,
        mediaLibrary: [
          ...(Array.isArray(current.mediaLibrary)
            ? current.mediaLibrary
            : []),
          media,
        ],
      }));
    } catch (error) {
      setUploaded({ error: error.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="writeup-r2-tab">
      <div className="writeup-r2-head">
        <div>
          <small>CLOUDFLARE R2</small>
          <h2>Writeup media storage</h2>
          <p>Upload images, video, audio, PDFs and other challenge evidence into the R2 writeup prefix.</p>
        </div>
        <div>
          <label className="accent-button file-button">
            {uploading ? 'Uploading...' : '+ Upload media'}
            <input
              type="file"
              accept="image/*,video/*,audio/*,application/pdf,text/plain,.zip,.7z,.pcap"
              onChange={upload}
              disabled={uploading}
            />
          </label>
          <button
            className="ghost"
            onClick={() => loadR2Objects(writeup.slug || writeup.title)}
            disabled={r2Loading}
          >
            {r2Loading ? 'Loading...' : 'Refresh R2'}
          </button>
        </div>
      </div>

      {uploaded && (
        <div className={uploaded.error ? 'test-error' : 'test-output'}>
          {uploaded.error || 'Uploaded: ' + (uploaded.url || uploaded.key)}
        </div>
      )}

      <div className="r2-object-list">
        {!r2Objects.length ? (
          <div className="media-empty">No R2 objects loaded yet.</div>
        ) : (
          r2Objects.map((item) => (
            <div className="r2-object-row" key={item.key}>
              <div>
                <strong>{item.key}</strong>
                <small>{item.size ? Math.round(item.size / 1024) + ' KB' : ''}</small>
              </div>
              <div className="r2-object-actions">
                <code>{item.lastModified ? new Date(item.lastModified).toLocaleString() : ''}</code>
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => openR2Object(item.key)}
                >
                  Open
                </button>
                <button
                  className="delete-button compact"
                  type="button"
                  onClick={() => deleteR2Object(item.key)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function WriteupPreviewData({ writeup }) {
  return (
    <div className="writeup-preview-data">
      <div className="preview-json-card">
        <small>PUBLIC ROUTE</small>
        <strong>/ctf-blog/{writeup.slug}</strong>
        <p>Published data will be written to client/public/ctf-blog/{writeup.slug}.json.</p>
      </div>
      <div className="preview-json-card">
        <small>PUBLIC DISCUSSION TERM</small>
        <strong>ctf-blog:{writeup.slug}</strong>
        <p>Anonymous + GitHub discussion is attached to the bottom of the public writeup.</p>
      </div>
      <pre>{JSON.stringify(writeup, null, 2)}</pre>
    </div>
  );
}

function MediaListEditor({
  media,
  onChange,
  repositoryFolder = 'portfolio-media',
  uploadRepositoryMedia,
  setNotice,
}) {
  const items = Array.isArray(media) ? media : [];
  const [uploadingIndex, setUploadingIndex] = useState(null);

  function update(index, field, value) {
    const next = clone(items);
    next[index] = {
      ...(next[index] || {}),
      [field]: value,
    };
    onChange(next);
  }

  function remove(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  async function upload(index, file) {
    if (!file || !uploadRepositoryMedia) return;

    setUploadingIndex(index);

    try {
      const result = await uploadRepositoryMedia(
        file,
        repositoryFolder
      );

      const next = clone(items);
      next[index] = {
        ...(next[index] || {}),
        type: result.type || next[index]?.type || 'image',
        title: next[index]?.title || file.name,
        src: result.publicPath || next[index]?.src || '',
        url: result.publicPath || next[index]?.url || '',
        alt: next[index]?.alt || file.name,
        repoPath: result.path || '',
        previewUrl: result.rawUrl || '',
        mimeType: result.mimeType || file.type || '',
      };

      onChange(next);

      setNotice?.(
        'Uploaded ' +
        file.name +
        ' to ' +
        (result.publicPath || repositoryFolder)
      );
    } catch (error) {
      setNotice?.(
        'Repository media upload failed: ' +
        error.message
      );
    } finally {
      setUploadingIndex(null);
    }
  }

  return (
    <div className="media-editor">
      <div className="panel-head compact">
        <div>
          <small>ATTACHMENTS</small>
          <h2>Media items</h2>
        </div>
        <button
          className="accent-button"
          type="button"
          onClick={() => onChange([
            ...items,
            {
              type: 'link',
              title: '',
              body: '',
              url: '',
              src: '',
              driveId: '',
              alt: '',
            },
          ])}
        >
          + Add media
        </button>
      </div>

      <p className="helper media-repo-helper">
        Upload an image or PDF directly into
        <code>/public/{repositoryFolder}</code>
        through the GitHub App.
      </p>

      {!items.length && (
        <div className="media-empty">
          No media attached. Add a link or upload a repository asset.
        </div>
      )}

      <div className="media-edit-list">
        {items.map((item, index) => (
          <div
            className="media-edit-card"
            key={'media-item-' + index}
          >
            <div className="media-edit-grid">
              <label className="field">
                <span>Type</span>
                <select
                  value={item.type || 'link'}
                  onChange={(e) => update(index, 'type', e.target.value)}
                >
                  <option value="link">Link</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>

              <Field
                label="Title"
                value={item.title || ''}
                onChange={(v) => update(index, 'title', v)}
              />

              <Field
                wide
                label="Public / external URL"
                value={item.url || item.src || ''}
                onChange={(v) => {
                  const next = clone(items);
                  next[index] = {
                    ...(next[index] || {}),
                    url: v,
                    src: v,
                  };
                  onChange(next);
                }}
              />

              <Field
                wide
                label="Drive file ID"
                value={item.driveId || ''}
                onChange={(v) => update(index, 'driveId', v)}
              />

              <Field
                wide
                label="Repository path"
                value={item.repoPath || ''}
                onChange={() => {}}
                readOnly
              />

              <Field
                wide
                multiline
                label="Body / description"
                value={item.body || ''}
                onChange={(v) => update(index, 'body', v)}
              />

              <Field
                wide
                label="Alt text"
                value={item.alt || ''}
                onChange={(v) => update(index, 'alt', v)}
              />
            </div>

            <div className="media-repo-actions">
              <label className="ghost file-button">
                {uploadingIndex === index
                  ? 'Uploading...'
                  : 'Upload image / PDF to repo'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploadingIndex !== null}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    await upload(index, file);
                  }}
                />
              </label>

              {(item.previewUrl || item.src) && (
                <a
                  className="ghost small"
                  href={normalizeAdminAssetPath(item.previewUrl || item.src)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open / view
                </a>
              )}

              <button
                className="delete-button compact"
                type="button"
                onClick={() => remove(index)}
              >
                Remove media
              </button>
            </div>

            {(item.previewUrl || item.src) && String(item.type).toLowerCase() === 'image' && (
              <div className="media-inline-preview">
                <img
                  src={normalizeAdminAssetPath(item.previewUrl || item.src)}
                  alt={item.alt || item.title || 'Uploaded media'}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeAdminAssetPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) return raw;
  return raw.startsWith('/')
    ? raw
    : '/' + raw.replace(/^\.?\//, '');
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
          {[
            ['local', 'Local API'],
            ['r2', 'Cloudflare R2'],
            ['ai', 'Local AI'],
            ['online', 'Online Vercel API'],
          ].map(([key, label]) => (
            <ServiceRow key={key} label={label} item={serviceStatus[key]} />
          ))}
        </div>
        <button className="accent-button" onClick={refreshSystem} disabled={serviceLoading}>{serviceLoading ? 'Checking...' : 'Refresh services'}</button>
      </section>

      <section className="panel">
        <PanelHeader eyebrow="QUICK NAV" title="Editor shortcuts" />
        <div className="quick-nav">
          {[
            'profile',
            ...CONTENT_COLLECTIONS,
            'explore',
            'appearance',
            'media',
            'ctf-writeups',
            'raw',
            'comments',
            'system',
          ]
            .filter((key, index, array) => array.indexOf(key) === index)
            .map((key) => (
              <button key={key} className="ghost" onClick={() => setSection(key)}>
                {SECTION_META[key]}
              </button>
            ))}
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
        {item.data?.repository && <small>{item.data.repository}{item.data.branch ? ' · ' + item.data.branch : ''}</small>}
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
        <div className="service-list">{[['local', 'Local API'], ['r2', 'Cloudflare R2'], ['github', 'GitHub App'], ['ai', 'Local AI'], ['online', 'Online API']].map(([key, label]) => <ServiceRow key={key} label={label} item={serviceStatus[key]} />)}</div>
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

function Field({
  label,
  value,
  onChange,
  multiline = false,
  wide = false,
  readOnly = false,
}) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={5}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
        />
      ) : (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
        />
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
