# Zulfaqar Jamal Portfolio

A small, personal React/Vite portfolio with a deliberately simple architecture.

This project is **a portfolio, not a scalable enterprise platform, public security-testing target, or production-grade infrastructure benchmark**. The application is intentionally limited in scope and should be treated as a small personal project.

## Architecture

```
GitHub Pages
  |
  +-- React/Vite portfolio
  |     |
  |     +-- Anonymous comments
  |             |
  |             +-- Cloudflare Worker -> Upstash Redis (24/7 comment persistence)
  |             |
  |             +-- Local Express API -> shared Redis when local server is online
  |                                      -> local JSON fallback if Redis is unavailable
  |
  +-- Local Express API
        +-- content API
        +-- Google Drive media
        +-- DeepSeek chatbot
        +-- local visitor/session tracker
```

The online backup service is intentionally **comment-only**. It does not provide the admin API, portfolio content API, Google Drive integration, DeepSeek chatbot, or local visitor tracker.

Upstash Redis exposes a REST API that works well from edge/serverless runtimes such as Cloudflare Workers, avoiding a long-lived TCP connection requirement. citeturn859439search0turn796663search3

## Comment storage

Anonymous comments are the only application data intentionally replicated to the online Redis store.

Stored comment fields are limited to what the feature needs:

- display name / nickname
- comment text
- thread term
- parent comment id
- creation/update timestamps
- random browser ownership token
- random browser-session token used for the 10-reply session limit

The comment service does **not intentionally collect IP addresses, precise location, PID, PHI, passwords, API keys, payment information, Google Drive credentials, chatbot conversations, or the portfolio content JSON**.

### Browser identity

The browser creates an opaque random ownership token in local storage and a separate random session token in session storage.

This allows the same browser profile to return and manage its own anonymous comments while keeping reply limits tied to a browser session.

This is not an authentication system or a cryptographic identity system. Clearing site storage, changing browser profiles, or using another browser/device creates a new anonymous identity.

## Online Redis backup setup

The online comment backup lives in:

`cloud-comments/`

It is a Cloudflare Worker backed by Upstash Redis.

### 1. Create the Redis database

Create an Upstash Redis database and copy its REST URL and token from the database details.

Upstash documents the REST API and Cloudflare Workers integration here:

- https://upstash.com/docs/redis/features/restapi
- https://developers.cloudflare.com/workers/databases/third-party-integrations/upstash/

### 2. Configure the Worker

```powershell
cd cloud-comments
npm install

npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Deploy:

```powershell
npm run deploy
```

The Worker will provide a `workers.dev` URL.

### 3. Connect GitHub Pages to the backup

Add a GitHub repository secret named:

`COMMENTS_BACKUP_URL`

Set it to the deployed Worker URL.

The Pages workflow injects this value into `VITE_COMMENTS_BACKUP_URL`.

When configured, the portfolio prefers this cloud comment service for comment traffic so comments can remain available even when the local server is offline. The local API remains a fallback, and both can use the same Redis store.

### 4. Connect the local server to the same Redis database

Copy the Redis credentials into your **local** `server/.env`:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Do not commit these values.

With Redis configured, the local Express API and the Cloudflare Worker use the same Redis comment store. This means comments can continue to exist when the local machine is offline.

The local JSON comment file remains a fallback for development when Redis is unavailable. Local-only comments are migrated into Redis when the shared store becomes available again.

## Local development

### Client

```powershell
cd client
npm install
npm run dev
```

### Local API

```powershell
cd server
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use the actual Node/npm commands above rather than pasting shell commands into JavaScript files.

### Admin

```powershell
cd admin
npm install
npm run dev
```

## Local server operating schedule

The local server is intended to follow this schedule in **Singapore Time (SGT, UTC+8)**:

| Day | Local server |
|---|---|
| Monday | 05:00 – 00:00 |
| Tuesday | 05:00 – 00:00 |
| Wednesday | 05:00 – 00:00 |
| Thursday | 05:00 – 00:00 |
| Friday | 05:00 – 00:00 |
| Saturday | 24 hours |
| Sunday | **OFF** |

The schedule is an operational plan, not an automatic enforcement mechanism.

When the local server is offline, the portfolio's **comment service can continue through the online Redis-backed Worker** once the backup is configured.

The chatbot is tied to the local server and is therefore **not a 24/7 service**. It is unavailable whenever the local server is offline, including the scheduled Sunday shutdown.

The online comment Worker has **no chatbot feature**.

## Visitor rules and acceptable use

This portfolio is a small personal project. It is **not authorized as a target for infrastructure stress testing, offensive security testing, exploitation, or automated abuse**.

By interacting with the site, visitors are expected to:

1. Use the normal public portfolio interface only.
2. Do not attempt denial-of-service, request flooding, load testing, or resource exhaustion.
3. Do not brute-force, credential-stuff, or attempt to bypass authentication or authorization.
4. Do not probe for secrets, environment variables, private files, server-side source, Redis credentials, Google Drive credentials, admin credentials, or local-machine resources.
5. Do not attempt exploitation of the local Express server, Tailscale endpoint, cloud Worker, Redis database, GitHub repository, or deployment infrastructure.
6. Do not perform automated vulnerability scanning, fuzzing, mass endpoint enumeration, or exploit-chain testing against this portfolio without explicit written authorization.
7. Do not attempt to access, modify, delete, or exfiltrate another visitor's comments or data.
8. Do not impersonate another visitor or intentionally abuse anonymous ownership controls.
9. Do not submit passwords, API keys, government identification numbers, payment information, health information, or other sensitive personal information into comments.
10. Do not use the portfolio as a general-purpose hosting service, relay, proxy, malware delivery point, or command-and-control endpoint.
11. Do not interfere with the local server's availability or the scheduled operating hours.
12. Respect the fact that this project is intentionally small and may contain weaknesses, rough edges, outages, limited capacity, and incomplete security hardening.

### Important security expectation

The infrastructure is **not a hardened enterprise environment**.

That does not mean visitors are invited to attack it.

Treat the site as a normal personal portfolio and use the features for their intended purpose. The local server, cloud Worker, Redis database, deployment pipeline, and related infrastructure are operational components of the portfolio, not a challenge environment.

## Responsible disclosure

If you discover a genuine security problem during normal use, do not exploit it further, access unrelated data, persist access, or publish a working exploit against the infrastructure.

Instead, preserve only the minimum information needed to describe the issue and report it privately to the portfolio owner.

## Scope

For the time being, this repository should be treated as:

**a simple personal portfolio with a small commenting system and a limited local backend.**

It is not intended to be:

- a scalable SaaS application
- a multi-tenant platform
- a production enterprise API
- a security research lab
- a benchmark target
- a public penetration-testing environment

## Games

Set `VITE_GAMES_URL` to the other GitHub Pages games repository. The Games tab embeds it with an iframe.

## Git automation

`scripts\\commit-push.bat "message"`

`scripts\\build-all.bat`

`scripts\\secure-repo-wipe.bat` is destructive. It rewrites history and force-pushes. It does not revoke credentials; rotate leaked secrets separately.

## Resume source

Initial factual profile data is grounded in the supplied Zulfaqar Jamal profile PDF. Project entries that require evidence not present in that source are explicitly marked as placeholders.
