# Online comment backup

This is the 24/7 comment-only backup service for the portfolio.

Architecture:

```
GitHub Pages client
       |
       +--> local Express API (when online)
       |
       +--> Cloudflare Worker (24/7 fallback)
                    |
                    +--> Upstash Redis
```

The Worker only exposes comment endpoints. It does not host the portfolio content, admin API, Google Drive, DeepSeek, or chatbot.

## Upstash

Create a Redis database in Upstash and obtain its REST URL/token. Upstash documents Redis REST access specifically for edge/serverless environments such as Cloudflare Workers. See:

https://upstash.com/docs/redis/features/restapi

https://developers.cloudflare.com/workers/databases/third-party-integrations/upstash/

Set the Worker secrets:

```bash
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Deploy:

```bash
npm install
npm run deploy
```

The deployed `workers.dev` URL is the value to use as `VITE_COMMENTS_BACKUP_URL`.

For GitHub Pages, add a repository secret:

`COMMENTS_BACKUP_URL`

The Pages workflow will inject it at build time.

## Stored data

Redis stores only what is necessary for anonymous comments:

- comment/thread term
- comment text
- display name/nickname
- parent comment id
- creation/update timestamps
- a random browser ownership token
- a random browser-session token used for the reply limit

The Worker does not intentionally collect IP addresses, precise location, PID, PHI, chatbot conversations, Google Drive credentials, or the portfolio content JSON.

Because the public comment endpoint accepts user text, visitors should not submit secrets, passwords, government IDs, health information, payment details, or other sensitive information.
