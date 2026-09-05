# CrewMatch QA & Stability Pass

## Checked
- JavaScript syntax (`node --check app.js`)
- Duplicate function declarations
- HTML `id` uniqueness
- JavaScript `getElementById()` references against HTML IDs
- Inline event-handler count
- Responsive overflow safeguards
- Login/signup state logic
- Match/unmatch action wiring
- Swipe input event handling
- Mobile touch/pointer double-event prevention
- CSP compatibility of the static assets

## Fixed
1. Login is the default auth mode and the signup panel is CSS-hidden by default.
2. Signup can only appear after the Sign Up control is activated.
3. Login and signup panels are mutually exclusive through both CSS and JavaScript state.
4. The landing page was rebuilt with a modern responsive grid and mobile breakpoints.
5. Inputs, buttons, cards and navigation are constrained with `min-width:0` and viewport-safe sizing.
6. Unmatch remains explicitly visible and is included in the match card action group.
7. Swipe cards use Pointer Events when supported and Touch Events only as a fallback, preventing duplicate swipe actions on touch devices.
8. Like/Pass actions remain available as buttons as well as swipe gestures.
9. No duplicate JavaScript function declarations were found.
10. No missing JavaScript DOM IDs were found.
11. No inline HTML event handlers remain.

## 2026 Update — Signup/login isolation, data loss fixes, dashboard redesign
1. Fixed a stray extra `</div>` in `index.html` that closed `#signupBox` one element too early. This had pulled the entire "Preferences & Intentions" block (Looking For, Age Range, purpose checkboxes, terms checkbox, submit button) out of the sign-up panel's DOM scope, so it rendered on **both** the login and signup screens regardless of mode. It is now correctly nested inside `#signupBox` and hidden/shown only in signup mode.
2. Fixed the signup handler silently discarding the "Looking For", "Age Range", and "Purpose" selections — they are now validated against an allow-list and saved to the user record, and shown on the profile page.
3. Fixed uploaded signup profile photos always being replaced by the default stock avatar: `safeImageUrl()` only allow-listed `images.unsplash.com` HTTPS URLs, silently rejecting the `data:` URIs produced by the photo upload flow (in both signup and Edit Profile). It now also accepts validated `data:image/(jpeg|png|webp);base64,...` URIs within the existing 2MB image limit.
4. Aligned the signup password field's `minlength`/placeholder (was 8) with the actually enforced minimum of 10 characters (`config.json: minPasswordLength`), so native browser validation no longer contradicts the JS validation message.
5. Redesigned the post-login dashboard (nav, welcome banners, discover card, matches/requests panels, events, chat, profile) with a bolder gradient identity, deeper elevation/shadows, and hover motion, without touching the existing landing/auth screens.
6. Added a decorative flight-path/plane illustration (CSS-only, SVG data-URI) to every section's welcome banner, a subtle dot-grid texture behind dashboard content, SVG line-icons on every nav tab, a live "quick stats" strip on Discover (new crew nearby / mutual connections / gatherings joined), and hand-drawn line-art illustrations for every empty state (all caught up, no matches, no requests, no messages, no conversation selected).
7. Found and fixed several `style="..."` HTML attributes still present in `app.js`-generated markup (match/request/message-list empty states, chat contact rows, event cards, the fatal-error fallback screen) that were silently being dropped by the page's own strict `style-src` CSP (no `'unsafe-inline'`) — these now use the already-defined `inline-style-*` classes or new dedicated classes instead.

## Important architecture note
This package is still the browser/localStorage version of CrewMatch. It is suitable for front-end testing, but it is **not a shared multi-user production database**. For real users across devices, connect the frontend to Supabase (with RLS) as discussed separately.
