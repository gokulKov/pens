# Free secure diary setup

This version keeps the diary app in your existing GitHub repository, uses GitHub only to sign you in, and stores an encrypted backup in Cloudflare's free Workers KV. It does not write diary text into the public GitHub repository. GitHub Pages itself cannot run the private sign-in and storage functions, so publish this same repository through Cloudflare Pages. Your current GitHub Pages site can remain as it is.

## What is free and what is private

- Cloudflare Pages and Workers Free currently allow up to 100,000 requests per day. Workers KV currently includes 1 GB storage, 100,000 reads/day, and 1,000 writes/day. Limits can change; check Cloudflare's [Workers limits](C:/Users/ADMIN/Documents/Codex/2026-10-29/dev/outputs/secure-diary/index.htmlC:/Users/ADMIN/Documents/Codex/2026-10-29/dev/outputs/secure-diary/index.html) and [KV limits](https://developers.cloudflare.com/kv/platform/limits/).
- Diary backup data is encrypted in the browser with AES-GCM before upload. The separate diary password is never sent to GitHub or Cloudflare and is never saved by this app.
- GitHub login uses the account's public profile identity only (`read:user`). It does not request access to your repositories.
- Cloudflare stores ciphertext and account identifiers. If you forget the diary password, the backup cannot be decrypted.
- The diary still saves locally in the current browser. Cloud backup is manual: use **Secure backup → Encrypt & upload this device** after making changes. On another device, sign in and choose **Restore encrypted backup**.

## Publish the app

1. Keep a copy of your current diary file. Upload every file and folder in this `secure-diary` folder to the **root of the existing `pens` repository**. This includes `index.html`, `secure-sync.js`, and `functions/`. Do not upload any diary backup, password, OAuth secret, or private key.
2. Create a free Cloudflare account and create a **Pages** project connected to the same `gokulKov/pens` GitHub repository. Set the production branch to `main`, build command to blank, and build output directory to `.`. Cloudflare Pages supports Functions from a root `functions/` folder when deployed through Git integration. See [Pages Functions setup](https://developers.cloudflare.com/pages/functions/get-started/).
3. In the Pages project, create a Workers KV namespace (for example `DIARY_KV`). In **Settings → Functions → KV namespace bindings**, add a binding named `DIARY_KV` and select the namespace. See [Cloudflare Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).
4. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Set the homepage to your new Pages URL, such as `https://your-project.pages.dev`, and the authorization callback to `https://your-project.pages.dev/auth/callback`. Create the app.
5. In Cloudflare Pages **Settings → Variables and Secrets**, add `GITHUB_CLIENT_ID` and `ALLOWED_GITHUB_LOGIN` as plain variables (set the latter to your GitHub username), and `GITHUB_CLIENT_SECRET` as a secret. Never put the secret in `index.html`, JavaScript, GitHub, chat, or screenshots. The allowlist means only that GitHub account can sign in to this diary.
6. Redeploy the Pages project. Open the new `pages.dev` address, select **Secure backup**, and sign in with GitHub. Choose a long, unique diary password (12+ characters) and keep it somewhere safe. Use **Encrypt & upload this device** to create your first backup.

The OAuth app callback must exactly match the `pages.dev` URL where this diary is hosted. If you later add a custom domain, update the GitHub OAuth callback URL to match it.

## Security notes

The current `pens` repository is public, so do not place private diary text, exports, passwords, or backup files in it. The app's source code is public, but the password and encryption key are not. This design protects the backup from being read by someone who can access the KV account, but the user must still protect the browser and their diary password. Keep an offline copy of the password: there is no password reset that can recover encrypted diary contents.

GitHub's docs confirm that a client-side app cannot protect a client secret, and GitHub Pages sites are public. This is why the OAuth secret lives in Cloudflare's server-side settings and the app does not call a GitHub password field.
