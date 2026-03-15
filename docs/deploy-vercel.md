# Secure deploy on Vercel

This project is ready to be deployed as a static Vite app on Vercel.

## What we already prepared in the repo

- `vercel.json` defines:
  - the Vite build command
  - the output directory
  - security headers
  - long cache headers for static assets
- The app builds successfully with `npm run build`
- Dependency audit is available with `npm run security:audit`

## Before you deploy

Run these commands inside the project folder:

```bash
cd /Users/raymondbisono/Codex/qr-studio
npm run security:audit
npm run build
```

## Recommended path for a beginner

### 1. Create a GitHub repository

- Create an empty repository in GitHub.
- Name it something like `qr-studio`.

### 2. Push the local project to GitHub

From the project folder:

```bash
cd /Users/raymondbisono/Codex/qr-studio
git init
git add .
git commit -m "Initial secure QR app"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 3. Import the project into Vercel

- Log into Vercel.
- Click `Add New...` then `Project`.
- Select the GitHub repository.
- Vercel should detect `Vite` automatically.
- Confirm the project root is the repository root.
- Confirm build command is `npm run build`.
- Confirm output directory is `dist`.
- Deploy.

## 4. Check the first secure deployment

After deploy:

- Open the `.vercel.app` URL
- Verify the site loads over `https`
- Test QR generation
- Test PNG and SVG downloads

## 5. Add a custom domain later

When you are ready:

- Add the domain in the Vercel project settings
- Follow the DNS instructions Vercel shows
- Wait for DNS verification
- Verify SSL certificate is active

## 6. Security checks after deployment

- The site must use `https`
- The browser should receive the security headers from `vercel.json`
- Do not add analytics or backend secrets until we design them properly
- Re-run `npm run security:audit` before each release

## Important note about HSTS

We are not forcing `Strict-Transport-Security` yet. That is safer to enable once:

- the final custom domain is confirmed
- the domain always serves correctly over HTTPS
- you are sure you will not need temporary HTTP access during setup
