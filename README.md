# Zulfaqar Jamal Portfolio

Three-part architecture: static React/Vite client, local admin/content manager, Express backup/API server.

## Client
`cd client && npm install && npm run dev`

## API
`cd server && npm install && cp .env.example .env && npm run dev`

DeepSeek is called server-side only. Google Drive OAuth and the configured root folder ID also stay server-side. The client loads `content.json` first and only uses the API as a secondary source.

## Admin
`cd admin && npm install && npm run dev`

The admin MVP edits/validates the JSON model. Production write operations should be authenticated and should enforce the Google Drive root-folder boundary.

## Games
Set `VITE_GAMES_URL` to the other GitHub Pages games repository. The Games tab embeds it with an iframe.

## Cusdis
Set `VITE_CUSDIS_APP_ID`. The modal is structured for item-level comments; replace the placeholder iframe with the Cusdis embed snippet generated for your project.

## Git automation
`scripts\\commit-push.bat "message"`

`scripts\\build-all.bat`

`scripts\\secure-repo-wipe.bat` is destructive. It rewrites history and force-pushes. It does not revoke credentials; rotate leaked secrets separately.

## Resume source
Initial factual profile data is grounded in the supplied Zulfaqar Jamal profile PDF. Project entries that require evidence not present in that source are explicitly marked as placeholders.
