# Security Plan

## Current state

- The app is currently a static frontend built with React and Vite.
- There is no backend, no login system, no database, and no payment flow yet.
- Today the risk surface is relatively small because QR generation happens in the browser.

## What is already true today

- The project builds successfully in production mode.
- `npm audit --omit=dev` reports `0 vulnerabilities` at the moment this document was created.
- The app does not store secrets because there are no server credentials in use.
- `vercel.json` is present with build settings and baseline security headers for deployment.

## Main risks by phase

### Phase 1: static QR generator

- Malicious content entered by a user and reflected unsafely in the UI.
- Excessively large input causing rendering problems or poor performance.
- Publishing without HTTPS.
- Weak deployment configuration such as missing security headers.

### Phase 2: local history and richer UX

- Sensitive QR content stored in browser storage without user awareness.
- Accidental persistence of private Wi-Fi, phone, or contact data on shared devices.

### Phase 3: dynamic QR, analytics, accounts

- Broken access control.
- Leaked environment variables or API keys.
- Abuse of redirect endpoints.
- Rate-limit issues and bot abuse.
- Insecure admin dashboards.
- Privacy issues around scan analytics and IP data.

## Security decisions before public launch

### 1. Data handling

- Keep the app frontend-only as long as possible.
- Do not store QR history by default if it may contain sensitive data.
- If we add history later, make it opt-in and include a clear "delete all history" action.
- If we add analytics later, document exactly what is collected and why.

### 2. Input validation

- Add max lengths per field.
- Validate known formats such as URL, phone, email, and Wi-Fi SSID.
- Reject obviously malformed content before generating the QR.

### 3. Browser and hosting protections

- Publish only over HTTPS.
- Configure security headers:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`
  - `Strict-Transport-Security` once the custom domain is final
- Avoid inline scripts in production pages.

### 4. Dependency and build hygiene

- Run `npm run security:audit` before each release.
- Pin and review new dependencies instead of adding packages casually.
- Keep the project free of unused packages.

### 5. Dynamic QR future controls

- Use signed admin sessions.
- Protect write operations with authentication and authorization.
- Add server-side validation for redirect destinations.
- Add rate limiting on creation, update, and analytics endpoints.
- Log sensitive actions.
- Separate public redirect traffic from admin traffic.

## Publishing checklist

- Build works with `npm run build`.
- Dependency audit is clean.
- No secrets in the repo.
- No test or demo data exposed as production defaults.
- Custom domain uses HTTPS.
- Security headers are configured.
- Privacy text exists if analytics are enabled.
- Admin routes are protected if backend features exist.

## Recommendation for our next implementation steps

1. Add input validation and max lengths.
2. Add optional local history with explicit user control.
3. Prepare deployment config with security headers before going public.
4. Only after that, begin dynamic QR and analytics architecture.
