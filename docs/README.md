# SkyConnection — Hardened Static Frontend

This package separates the site into HTML, CSS, JavaScript and JSON so it is easier to maintain and deploy to GitHub Pages or another static host.

## Files
- `index.html` — page structure and UI
- `styles.css` — all styling; inline style attributes removed
- `app.js` — hardened client-side application engine
- `data.json` — demo profiles/events only
- `config.json` — non-secret application limits and security configuration
- `SECURITY.md` — production security requirements

## Demo accounts
The demo accounts shown on the login screen use the demo password `demo123`.

## Important security limitation
This is a hardened **browser demo**, not a secure production backend. A static website cannot keep a real user database, passwords, private verification documents, authoritative verification state, or private messages secret from the person using the browser.

For production use:
`GitHub Pages → HTTPS API/backend → database + private encrypted object storage`

The production backend must perform authentication, authorization, rate limiting, verification, document handling, moderation and server-side validation.
