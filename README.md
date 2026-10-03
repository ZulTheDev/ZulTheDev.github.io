# Zulfaqar Jamal Portfolio

A small personal React/Vite portfolio and blog-style site.

## Ground rules

Please use the public interface as intended.

Do not attack, hack, scan, fuzz, overload, bypass, exploit, or attempt unauthorized access to the static portfolio, comments, local API, deployment services, or stored data. Do not attempt to access another visitor's information.

## Services

- Anonymous comments are stored online through the comments service.
- The AI portfolio assistant is available online through the hosted AI API.
- AI chat history is kept only in the browser session. Refreshing keeps the current session; ending the browser session clears it. The AI service does not save the conversation.
- The local chatbot follows Singapore Time (SGT, UTC+8): Monday–Friday 05:00–00:00, Saturday 24 hours, Sunday offline.

## Hiring view

Use:

`/port_resume?type_of_work_hiring=technical_officer`

The hiring view is a professional, minimal version of the interactive portfolio. The requested work type is used to select relevant skills, experience, projects, certifications and achievements instead of generating a separate static resume.

## Local admin capabilities

The local admin panel includes a dashboard with content-health validation, unsaved-change protection, browser-local draft recovery, JSON backup/import, public and hiring-view preview links, Google Drive media browsing, anonymous comment moderation, local/online service diagnostics, an online AI smoke test, and a hiring-filter relevance test. Collection editors support create, edit, duplicate, delete, reorder and structured media editing.

## Development

### Client

```powershell
cd client
npm install
npm run dev
```

### Role-based local admin

Create a password hash:

```powershell
cd server
npm run hash-admin-password -- "your-password"
```

Add the resulting hash to the local `server/.env`:

```env
ADMIN_SESSION_TTL_MINUTES=480
ADMIN_ACCOUNTS_JSON=[{"username":"admin","passwordHash":"PASTE_HASH_HERE","role":"admin"},{"username":"editor","passwordHash":"PASTE_HASH_HERE","role":"editor"},{"username":"moderator","passwordHash":"PASTE_HASH_HERE","role":"moderator"},{"username":"diagnostics","passwordHash":"PASTE_HASH_HERE","role":"diagnostics"}]
```

Roles are separated as follows: `admin` can access everything, `editor` can edit portfolio content and media, `moderator` can moderate public comments, and `diagnostics` can use API/AI diagnostics. The browser does not store the session token; the server keeps the session and sends an HttpOnly cookie.
Sessions are held in server memory and expire after the configured TTL; restarting the local API requires signing in again. `ADMIN_WRITE_SECRET` remains only as a legacy single-admin fallback when no `ADMIN_ACCOUNTS_JSON` is configured.

### Local API

```powershell
cd server
npm install
npm run dev
```

### CTF writeups, R2 media and Judge0

The local admin includes a CTF writeup editor under **CTF writeups**. A writeup is saved as a private local draft first, then published as static JSON under `client/public/ctf-blog/`. GitHub Pages serves the public routes:

- `/ctf-blog/`
- `/ctf-blog/<slug>`

Each writeup can contain sessions, rich text, tables, code, media and an interactive workflow. The workflow is edited as a small drag/drop canvas: document blocks can become objects, objects can be repositioned, and edges can be connected. The public page turns those objects into clickable navigation back into the writeup.

#### Cloudflare R2

The local server creates short-lived presigned upload/read URLs, so the R2 access key and secret remain server-side. Presigned URLs are temporary bearer URLs and are intended for individual operations such as browser uploads/downloads; configure R2 CORS for the browser origins that need direct access. urlCloudflare R2 presigned URLs documentationhttps://developers.cloudflare.com/r2/api/s3/presigned-urls/

For a published static writeup, uploaded media needs a stable public URL. Set `R2_PUBLIC_BASE_URL` to the public R2/custom-domain base used by the bucket. Do not put a 15-minute signed read URL into a published writeup because it will expire. Cloudflare documents public R2 access through custom domains or `r2.dev`, while presigned URLs are temporary. urlCloudflare R2 public buckets documentationhttps://developers.cloudflare.com/r2/buckets/public-buckets/

The expected local variables are:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_BASE_URL=
```

The R2 media UI stores objects under a per-writeup prefix such as `ctf-blog/<slug>/...` and can request a temporary signed read URL for admin inspection.

#### Judge0

Writeup code blocks use Judge0 asynchronously: submit the code, receive a token, then poll the submission until it reaches a terminal status. The local admin uses `/api/judge0/run`; the public GitHub Pages writeup uses the Vercel `/api/judge0` proxy so the public browser does not need Judge0 credentials. The code runner enforces small source/stdin/runtime/memory limits. urlJudge0 CE API documentationhttps://ce.judge0.com/

The local server variables are:

```env
JUDGE0_URL=https://ce.judge0.com
JUDGE0_AUTH_TOKEN=
JUDGE0_AUTH_USER=
```

The hosted public proxy uses the same Judge0 variables in the Vercel project. Keep the Judge0 credentials server-side.

#### Publishing

Save a draft first. **Publish** writes the static JSON/index files into `client/public/ctf-blog/`. With `GIT_AUTO_PUSH=true`, the local server also commits that directory and pushes the configured branch; otherwise run your normal `git push` workflow yourself.

```env
GIT_AUTO_PUSH=false
GIT_REPO_ROOT=
GIT_BRANCH=main
```

The generated CTF files are intentionally kept small and static so GitHub Pages can serve the writeups without requiring the local admin server to be online.

### Admin

```powershell
cd admin
npm install
npm run dev
```
