# Production architecture

Browser -> static client -> local content first -> backup API only when available.

Chat: browser -> API -> DeepSeek. If primary AI fails, API can call a Tailscale secondary endpoint using a server-only shared secret.

Drive: local/admin -> local API -> Google Drive OAuth -> only configured root folder.

Git: local admin/content workflow -> build -> commit -> push.

The local admin API intentionally has no authentication or role checks. If this server is ever exposed beyond the local machine, add authentication, rate limiting, audit logs, HTTPS, strict CORS allow-lists, CSRF protection for browser admin, and a secret manager.
