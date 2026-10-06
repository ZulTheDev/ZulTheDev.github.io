/*
 * Offline answers built ONLY from the portfolio's own content.json.
 * Nothing is invented: every sentence returned is copied from the content.
 */

const STOP = new Set(('a an and are as at be by can do does for from has have how i in is it its me my of on or ' +
  'tell about what whats which who whom with you your zul he his him she her they their this that the to was were ' +
  'will would please show give any some more').split(' '));

const SECTIONS = [
  ['certifications', 'Certification'],
  ['projects', 'Project'],
  ['achievements', 'Achievement'],
  ['awards', 'Award'],
  ['research', 'Research'],
];

const stem = (t) =>
  t.length > 4 ? t.replace(/ies$/, 'y').replace(/(es|s)$/, '') : t;

const tokens = (value) =>
  String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .map(stem);

// "what certifications ..." -> the person wants that whole section.
const INTENTS = [
  [/certif|credential|cert\b/, 'Certification'],
  [/project|built|build|tool/, 'Project'],
  [/award/, 'Award'],
  [/achiev/, 'Achievement'],
  [/research|paper|publication/, 'Research'],
  [/experience|work|job|role|career|employ/, 'Experience'],
  [/educat|stud|school|universit|degree|qualif|college/, 'Education'],
];
const INTENT_WORDS = new Set(
  ['certification', 'certificate', 'credential', 'project', 'award', 'achievement', 'research', 'paper',
   'publication', 'experience', 'work', 'job', 'role', 'career', 'education', 'study', 'school', 'university',
   'degree', 'qualification', 'college', 'built', 'build', 'tool', 'have', 'has', 'had', 'did', 'done'].map(stem)
);

function buildEntries(content) {
  const entries = [];
  const add = (label, title, detail, ...fields) =>
    entries.push({ label, title, detail, words: new Set(tokens(fields.flat().join(' '))) });

  for (const [key, label] of SECTIONS) {
    for (const item of content?.[key] || []) {
      if (item?.title) {
        add(label, item.title, [item.issuer, item.description].filter(Boolean).join(' - '),
          item.title, item.issuer, item.category, item.description);
      }
    }
  }
  for (const item of content?.experience || []) {
    if (item?.role || item?.company) {
      add('Experience', [item.role, item.company].filter(Boolean).join(' @ '), item.summary || '',
        item.role, item.company, item.summary, item.elaboration, Array.isArray(item.skills) ? item.skills.join(' ') : '');
    }
  }
  for (const item of content?.education || []) {
    if (item?.school || item?.qualification) {
      add('Education', [item.qualification, item.school].filter(Boolean).join(' - '), item.description || '',
        item.school, item.qualification, item.description);
    }
  }
  return entries;
}

function contactAnswer(profile = {}) {
  const lines = [
    profile.email && `Email: ${profile.email}`,
    profile.linkedin && `LinkedIn: ${profile.linkedin}`,
    profile.github && `GitHub: ${profile.github}`,
    profile.website && `Website: ${profile.website}`,
  ].filter(Boolean);
  return lines.length ? `You can reach ${profile.name || 'Zul'} here:\n${lines.join('\n')}` : null;
}

const format = (list) =>
  list.map((e) => `${e.label}: ${e.title}${e.detail ? `\n${e.detail}` : ''}`).join('\n\n');

export function localAnswer(question, content) {
  const profile = content?.profile || {};
  const raw = String(question || '').toLowerCase();
  const asked = tokens(question);
  const entries = buildEntries(content);

  if (/\b(contact|e-?mail|reach|hire|linkedin|github|get in touch)\b/.test(raw)) {
    const contact = contactAnswer(profile);
    if (contact) return contact;
  }

  if (/\b(who is|who are|introduce|summary|overview|background)\b|about\s+(him|zul|zulfaqar|yourself|you)\s*[?.!]*$/.test(raw)
      && profile.summary) {
    return `${profile.name || 'Zul'} - ${profile.title || ''}\n${profile.summary}`.trim();
  }

  const intent = INTENTS.find(([re]) => re.test(raw))?.[1];
  const topical = asked.filter((t) => !INTENT_WORDS.has(t)); // e.g. "ctf", "python"

  const scored = (pool) =>
    pool
      .map((entry) => ({ entry, score: topical.reduce((n, t) => n + (entry.words.has(t) ? 1 : 0), 0) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.entry);

  if (intent) {
    const section = entries.filter((e) => e.label === intent);
    const hits = topical.length ? scored(section) : section;
    if (hits.length) return format(hits.slice(0, 4));
    // Topic given but not found in that section: search everything.
  }

  const hits = scored(entries);
  if (hits.length) return format(hits.slice(0, 3));

  const contact = contactAnswer(profile);
  return (
    "I couldn't find that in the portfolio. Try asking about projects, certifications, experience or education." +
    (contact ? `\n\n${contact}` : '')
  );
}
