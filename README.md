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

### Local API

```powershell
cd server
npm install
npm run dev
```

### Admin

```powershell
cd admin
npm install
npm run dev
```
