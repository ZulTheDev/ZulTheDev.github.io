# Local admin GitHub App setup

The local admin publishes CTF writeups through a GitHub App installation instead of a personal GitHub token.

## 1. Create the GitHub App

Create a GitHub App from your GitHub developer settings. Give it a clear name such as `ZulTheDev Portfolio Admin`.

For repository permissions, keep the App narrow:

- Repository metadata: Read-only
- Contents: Read & write

Do not add Issues, Pull requests, Actions, Administration, or organization permissions unless a later feature specifically needs them.

## 2. Install the App

Install the App only on `ZulTheDev/ZulTheDev.github.io`.

After installation, note the installation ID. The installation URL contains this ID, and it is also available from the installed App details.

## 3. Generate the App private key

Generate one private key for the App and download the PEM file. Keep this file private. Do not put it in Git, the React app, Cloudflare R2, or GitHub Actions logs.

## 4. Configure the local server

Copy `server/.env.example` to `server/.env` and fill these values:

```env
GITHUB_APP_ID=123456
GITHUB_INSTALLATION_ID=12345678
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"
GITHUB_OWNER=ZulTheDev
GITHUB_REPO=ZulTheDev.github.io
GITHUB_BRANCH=main
GITHUB_APP_AUTO_PUSH=true
```

The private-key value may use literal `\\n` sequences in the `.env` file; the local server converts them back to PEM newlines before signing the GitHub App JWT.

## 5. Run the server and check diagnostics

Start the local API:

```powershell
cd server
npm install
npm run dev
```

Then open the local admin panel and run **Service diagnostics**. A `GitHub App` row is included in the checks. It should report the configured repository and branch when the installation can be reached.

## 6. Publish flow

When `GITHUB_APP_AUTO_PUSH=true`, publishing a CTF writeup:

1. saves the published JSON files locally;
2. requests a temporary GitHub App installation token;
3. creates a Git tree containing the writeup and index JSON;
4. creates a commit; and
5. advances the configured branch without force-updating it.

The local admin therefore does not need a personal GitHub PAT for publishing. If the branch moved while a publish was in progress, the server reports a retryable branch-moved error instead of force-pushing over the newer commit.

## Security notes

The React admin never receives the App private key or installation token. The credentials remain server-side in the local API process.

Keep the local server bound to your own machine and never expose its GitHub App credentials through the browser, static client build, or committed `.env` file.

See the GitHub Apps documentation for the platform-side setup and authentication model: https://docs.github.com/en/apps