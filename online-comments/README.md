# Online comment backup

This is the small 24/7 comment API for the portfolio.

It uses **Redis Cloud** as the database and a minimal Vercel serverless API as the online HTTP layer. The browser never receives the Redis database password.

Redis Cloud is a managed Redis database service. Applications connect to the database with a Redis client and the database endpoint/credentials; the Redis Cloud REST API documented by Redis is for managing Redis Cloud resources, not for exposing arbitrary application data to the browser. citeturn677241search8turn716634search1

## Setup

Create a Redis Cloud database and copy its database connection string. Redis Cloud provides a public database endpoint for Essentials and Pro databases; the connection information is shown in the database configuration/quickstart screens. citeturn716634search14turn906360search8

Set this Vercel environment variable:

`REDIS_URL`

Example shape:

```
redis[s]://username:password@host:port
```

Use the connection string provided by your Redis Cloud database.

Deploy this directory as its own Vercel project:

```powershell
cd online-comments
npm install
vercel
```

### Public Judge0 protection

The public `/api/judge0` endpoint uses the same Redis Cloud database for persistent abuse controls. Limits are shared across Vercel instances rather than stored only in one serverless process:

- 8 executions per IP per minute
- 40 executions per IP per hour
- 2 identical submissions per fingerprint per 15 seconds
- 120 executions per minute globally

The limiter returns HTTP `429` with `Retry-After` and `X-RateLimit-*` headers. If Redis is unavailable, the code runner fails closed with HTTP `503` instead of bypassing the protection.

Vercel documents `x-forwarded-for` as the requester's public IP and notes that Vercel overwrites it to prevent spoofed client IPs; `x-vercel-forwarded-for` is also available. citeturn897335search0

Set a random secret for stable one-way hashing of rate-limit identifiers:

```env
RATE_LIMIT_HASH_SECRET=
```

The raw IP address is not written into the rate-limit keys; the key uses a SHA-256-derived identifier.

Then set the resulting project URL as the GitHub repository secret:

`COMMENTS_BACKUP_URL`

The GitHub Pages build already injects that value as `VITE_COMMENTS_BACKUP_URL`.

## What is stored

Only anonymous comment data is stored:

- display name / nickname
- comment text
- thread term
- parent comment id
- creation/update timestamps
- opaque browser ownership token

The browser keeps the ownership token in a first-party cookie with a local-storage backup so the same browser can return later and still edit or delete its own comments. The comment limit is up to 10 replies per anonymous browser identity for each discussion. The browser can create a new anonymous identity when its cookie and local storage are cleared, so this is an anonymous convenience/ownership mechanism rather than account authentication.

The online comment service does not intentionally store IP addresses, precise location, PID, PHI, passwords, API keys, payment information, Google Drive credentials, chatbot conversations, or portfolio content.

## Scope

This service is deliberately small. It is a comment persistence endpoint for a personal portfolio, not a general-purpose backend, security-testing target, or enterprise platform.


## Google Drive portfolio knowledge scope

The public portfolio chatbot is intentionally hard-scoped to exactly one Google Drive folder:

`10XU8zeRpx9Ladh501vWjZepzm0j7ZOq6`

The service account should be given **Viewer** access to that folder only. The chatbot recursively scans descendant folders, searches the Drive full-text index for relevant files, and reads the most relevant Google Docs, Sheets, Slides, text, JSON and XML content for each visitor question.

Binary or unsupported files are not treated as if their contents were read. Their filename, folder path, MIME type and explicit Drive description may be used as metadata evidence only. This prevents the chatbot from inventing details from an unread PDF, image, video or other binary file.

The Drive folder ID is fixed in application code so a Vercel environment variable cannot accidentally widen the chatbot to a different Drive folder. A configured Media folder is accepted only when it is inside the approved root.
