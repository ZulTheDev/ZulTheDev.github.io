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
- opaque browser-session token

The online comment service does not intentionally store IP addresses, precise location, PID, PHI, passwords, API keys, payment information, Google Drive credentials, chatbot conversations, or portfolio content.

## Scope

This service is deliberately small. It is a comment persistence endpoint for a personal portfolio, not a general-purpose backend, security-testing target, or enterprise platform.
