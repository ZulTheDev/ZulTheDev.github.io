# Admin content connection

The private Node API (`server`, port 8787) owns `/api/content` and admin writes.
Vercel (`online-comments`) supplies public chat/comments/health; it does not implement
`/api/content`. R2 availability and AI configuration do not prove that content is reachable.

## Run locally (two terminals, repository root)

```powershell
npm ci --prefix server
npm run dev --prefix server
```

```powershell
npm ci --prefix admin
npm run dev --prefix admin
```

Open http://localhost:5174. The admin dev server proxies `/api` to
http://127.0.0.1:8787 by default. Keep both terminals running.

In an existing `admin/.env`, remove old `VITE_API_BASE_URL` and
`VITE_PRIVATE_API_URL` overrides (or leave them empty) to activate this proxy.
An existing nonempty override takes precedence. Restart Vite after changes.
Do not overwrite your `server/.env` or its credentials.

If Node is on another private/Tailscale machine, set `ADMIN_PROXY_TARGET` in
`admin/.env` to that machine's actual API origin. The Node server uses HTTP;
an HTTPS URL works only when a TLS reverse proxy/Tailscale Serve is configured.
Do not use the Vite frontend port or Vercel public service as the private API target.

A production admin build does not include the development proxy. Set
`VITE_PRIVATE_API_URL` to its reachable private API origin before building;
the default is http://localhost:8787. An HTTPS admin needs a private HTTPS API
to avoid mixed-content blocking. Keep the unauthenticated admin server private.

## Verify

Visit http://localhost:5174/api/health in development: expect JSON with
`service: "portfolio-private-admin-api"`. `/api/content` must return a JSON
object containing `profile`. HTML means the request reached a frontend/login
page or a misrouted proxy, even if its HTTP status is 200.

The editor loads a bundled snapshot from `client/public/content.json` if the
content API fails or times out. This is build-time data, not a live backup.
Existing recovery drafts are preserved; use Restore local draft to recover them.
Saving still requires the private API. Nothing is automatically written to Vercel.
AI status reports configuration only, not a live inference/reachability test.

Run regression checks with `node --test admin/tests/api.test.js` and build with
`npm run build --prefix admin`.
