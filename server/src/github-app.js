import { createPrivateKey, createSign } from 'node:crypto';

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'ZulTheDev-Portfolio-Admin/1.0';

let installationTokenCache = null;

function required(name) {
  return String(process.env[name] || '').trim();
}

export function githubAppConfigured() {
  return Boolean(
    required('GITHUB_APP_ID') &&
    required('GITHUB_INSTALLATION_ID') &&
    required('GITHUB_APP_PRIVATE_KEY') &&
    required('GITHUB_OWNER') &&
    required('GITHUB_REPO')
  );
}

function githubRepository() {
  const owner = required('GITHUB_OWNER');
  const repo = required('GITHUB_REPO');

  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(owner) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)
  ) {
    throw new Error('github_app_repository_invalid');
  }

  return { owner, repo };
}

function githubBranch() {
  const branch = required('GITHUB_BRANCH') || 'main';

  if (
    branch === '' ||
    branch.includes('..') ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.includes('\\\\') ||
    branch.length > 250
  ) {
    throw new Error('github_app_branch_invalid');
  }

  return branch;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

function githubAppJwt() {
  const appId = required('GITHUB_APP_ID');
  const privateKeyValue = required('GITHUB_APP_PRIVATE_KEY');

  if (!appId || !privateKeyValue) {
    throw new Error('github_app_not_configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(
    JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
    })
  );
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: appId,
    })
  );
  const unsigned = header + '.' + payload;

  const privateKey = createPrivateKey({
    key: privateKeyValue.replaceAll('\\\\n', '\n'),
    format: 'pem',
  });

  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();

  return unsigned + '.' + base64Url(signer.sign(privateKey));
}

async function githubRequest(apiPath, { method = 'GET', token, body } = {}) {
  const response = await fetch(GITHUB_API + apiPath, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      ...(token
        ? { Authorization: 'Bearer ' + token }
        : {}),
      ...(body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });

  const raw = await response.text();

  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
      data?.error ||
      ('GitHub API HTTP ' + response.status)
    );
    error.status = response.status;
    error.github = data;
    throw error;
  }

  return data;
}

async function getInstallationToken() {
  if (
    installationTokenCache &&
    Date.now() < installationTokenCache.expiresAt
  ) {
    return installationTokenCache.token;
  }

  const installationId = required(
    'GITHUB_INSTALLATION_ID'
  );

  if (!installationId) {
    throw new Error(
      'github_app_installation_not_configured'
    );
  }

  const data = await githubRequest(
    '/app/installations/' +
      encodeURIComponent(installationId) +
      '/access_tokens',
    {
      method: 'POST',
      token: githubAppJwt(),
    }
  );

  if (!data?.token) {
    throw new Error(
      'github_app_installation_token_missing'
    );
  }

  const expiresAt = Date.parse(
    data.expires_at || ''
  );

  installationTokenCache = {
    token: data.token,
    expiresAt:
      Number.isFinite(expiresAt)
        ? expiresAt - 60_000
        : Date.now() + 50 * 60_000,
  };

  return data.token;
}

function safePublishedPath(value) {
  const filePath = String(value || '').trim();

  if (
    !filePath.startsWith('client/public/ctf-blog/') ||
    filePath.includes('..') ||
    filePath.startsWith('/') ||
    filePath.length > 500
  ) {
    throw new Error(
      'github_app_publish_path_invalid'
    );
  }

  return filePath;
}

export async function checkGitHubAppConnection() {
  if (!githubAppConfigured()) {
    return {
      configured: false,
      reachable: false,
      repository: null,
      branch: githubBranch(),
    };
  }

  const { owner, repo } = githubRepository();
  const branch = githubBranch();
  const token = await getInstallationToken();

  await githubRequest(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo),
    { token }
  );

  return {
    configured: true,
    reachable: true,
    repository: owner + '/' + repo,
    branch,
  };
}

export async function publishFilesWithGitHubApp({
  title,
  files,
}) {
  if (!githubAppConfigured()) {
    throw new Error(
      'github_app_not_configured'
    );
  }

  if (
    !Array.isArray(files) ||
    files.length === 0
  ) {
    throw new Error(
      'github_app_publish_files_required'
    );
  }

  const { owner, repo } = githubRepository();
  const branch = githubBranch();
  const token = await getInstallationToken();

  const ref = await githubRequest(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/git/ref/heads/' +
      encodeURIComponent(branch),
    { token }
  );

  const headSha = ref?.object?.sha;

  if (!headSha) {
    throw new Error(
      'github_app_branch_head_missing'
    );
  }

  const headCommit = await githubRequest(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/git/commits/' +
      encodeURIComponent(headSha),
    { token }
  );

  const entries = files.map((file) => ({
    path: safePublishedPath(file.path),
    mode: '100644',
    type: 'blob',
    content: String(file.content || ''),
  }));

  const tree = await githubRequest(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/git/trees',
    {
      method: 'POST',
      token,
      body: {
        base_tree: headCommit?.tree?.sha,
        tree: entries,
      },
    }
  );

  if (!tree?.sha) {
    throw new Error(
      'github_app_tree_creation_failed'
    );
  }

  const commitMessage =
    'Publish CTF writeup: ' +
    String(title || 'Untitled writeup')
      .replace(
        /[^a-zA-Z0-9 _-]/g,
        ''
      )
      .trim()
      .slice(0, 120);

  const commit = await githubRequest(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/git/commits',
    {
      method: 'POST',
      token,
      body: {
        message:
          commitMessage ||
          'Publish CTF writeup',
        tree: tree.sha,
        parents: [headSha],
      },
    }
  );

  if (!commit?.sha) {
    throw new Error(
      'github_app_commit_creation_failed'
    );
  }

  try {
    await githubRequest(
      '/repos/' +
        encodeURIComponent(owner) +
        '/' +
        encodeURIComponent(repo) +
        '/git/refs/heads/' +
        encodeURIComponent(branch),
      {
        method: 'PATCH',
        token,
        body: {
          sha: commit.sha,
          force: false,
        },
      }
    );
  } catch (error) {
    if (error?.status === 422) {
      throw new Error(
        'github_app_branch_moved_retry_publish'
      );
    }

    throw error;
  }

  return {
    pushed: true,
    provider: 'github-app',
    repository: owner + '/' + repo,
    branch,
    commitSha: commit.sha,
    message:
      'Published through the GitHub App installation.',
  };
}
