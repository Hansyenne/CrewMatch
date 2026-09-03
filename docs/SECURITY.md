# Security Notes

## Fixed in this frontend
- Passwords are never stored as plaintext for newly created accounts.
- Password derivation uses Web Crypto PBKDF2-SHA-256 with random salts and 150,000 iterations.
- Sessions use `sessionStorage` rather than persistent `localStorage`.
- Legacy plaintext demo database storage is purged by the app.
- Strict Content Security Policy removes inline scripts and inline style attributes.
- Dynamic actions use event delegation instead of inline `onclick` handlers.
- User input is length-limited and normalized.
- User-generated HTML is escaped/sanitized before insertion.
- Images are restricted to HTTPS Unsplash URLs or validated local data images used only for the demo UI.
- Uploaded profile images are limited to 2 MB and JPEG/PNG/WebP.
- Messages and reports have size limits.
- Matching, messaging and account deletion perform client-side integrity checks.
- Verification documents are not persisted to browser storage.

## Production requirements
A real launch must move trust and sensitive data to a backend. Use server-side password hashing (prefer Argon2id or a vetted bcrypt configuration), a database, HttpOnly/Secure/SameSite cookies or equivalent secure sessions, CSRF protection where applicable, strict server-side authorization, rate limiting, audit logging, malware/file-content scanning and private encrypted object storage for FaceCard/Platinum Card documents.

Never put production secrets, admin credentials, verification bypass codes, payment secrets or database credentials in HTML, CSS, JavaScript or public JSON.
