# Production architecture

Browser -> static client -> local content first -> backup API only when available.

Chat: browser -> API -> DeepSeek. If primary AI fails, API can call a Tailscale secondary endpoint using a server-only shared secret.

Drive: local/admin -> authenticated API -> Google Drive OAuth -> only configured root folder.

Git: local admin/content workflow -> build -> commit -> push.

For production, add authentication, rate limiting, audit logs, HTTPS, strict CORS allow-lists, CSRF protection for browser admin, and a secret manager.
