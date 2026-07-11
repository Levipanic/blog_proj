# AGENTS.md

ПОЛЬЗОВАТЕЛЮ ОТВЕЧАЙ НА РУССКОМ.

## Project
Personal microblog / diary site. Not a SPA. Keep it simple, old-web / old-Twitter inspired, privacy-friendly, no user accounts.

## Main rule
Work in small focused changes. Do not rewrite architecture unless the task explicitly asks for it.

## Tech assumptions
- Backend: Node.js / Express / SQLite.
- Frontend: vanilla HTML/CSS/JS.
- Public site is MPA, not SPA.
- Admin panel is private and available only via `/admin`.

## UX direction
- Prioritize comfortable long-read experience.
- Keep public UI cozy, compact, readable, and personal.
- Do not add login/accounts for readers.
- Reader data such as settings, reading progress, volume, and layout mode should stay in `localStorage`.
- Comments should stay anonymous-friendly; name is optional.

## Coding style
- Prefer minimal, readable code over abstractions.
- Reuse existing helpers/components when possible.
- Avoid introducing large dependencies.
- Keep JS modular only where it actually reduces complexity.
- Do not mix unrelated tasks in one change.
- Preserve existing behavior unless the task says otherwise.

## Security rules
- Never expose admin controls in public UI.
- All admin API routes must require valid admin session.
- Protect post create/delete, comment delete/moderation, upload, and future admin endpoints.
- Do not trust frontend validation.
- Escape/sanitize user content. Comments must not render unsafe HTML.
- Uploads must validate size, extension, and MIME type.
- Avoid SVG uploads unless sanitized or served safely.
- Use secure cookies in production: HttpOnly, SameSite, Secure.
- Add CSRF protection for admin write actions where possible.

## Anti-spam direction
- Do not treat long comments as spam by default.
- Use score-based anti-spam, not one harsh rule.
- Suspicious comments should go to `pending` when possible.
- Obvious script garbage may be rejected.
- Add protections against scripted floods:
  - rate limit `POST /comments` by `ip_hash`;
  - store comment attempts in SQLite;
  - temporary mute for abusive `ip_hash`;
  - challenge token tied to `post_id`;
  - randomized honeypot field;
  - random-garbage text detector;
  - Origin/Referer as soft signals;
  - request body size limits.
- Public error messages should be vague and friendly. Detailed spam reasons belong in admin/logs.

## Database changes
- Prefer migrations or safe `ALTER TABLE` changes.
- Never drop user data casually.
- Back up SQLite DB before schema changes.
- Add indexes for new lookup-heavy tables.
- Preserve old posts/comments during migrations.

## Public feature guidelines
Useful features for this project:
- reading progress bar;
- table of contents from `h2`;
- continue reading via `localStorage`;
- read time computed from post text length;
- feed mode: list/grid;
- local reader settings;
- spoiler media overlay;
- comment likes with cooldown;
- better 404 page;
- post preview cover selection.

## Admin editor guidelines
- Admin editor is for the author only: prioritize speed and safety.
- Keep old up/down block buttons even if drag-and-drop is added.
- Add stable block IDs before features that depend on selecting/reordering blocks.
- Autosave drafts to `localStorage`.
- Warn before closing with unsaved changes.
- Add collapse/expand for long blocks.
- Preview should match real public rendering.

## Testing checklist after changes
- Public pages load without admin session.
- `/admin` requires key/session.
- Admin write APIs reject unauthenticated requests.
- Old posts still render.
- Comments escape unsafe text.
- Normal long comments are accepted or pending, not rejected as garbage.
- Script-like random comments are rate-limited/rejected/muted.
- Mobile layout still works.
- localStorage reset works.

## Do not do
- Do not convert the site to SPA unless explicitly requested.
- Do not add reader accounts, login, OAuth, profiles, or tracking.
- Do not add heavy frameworks for small UI tasks.
- Do not expose raw IP addresses in admin UI; use hashes/truncated hashes.
- Do not silently delete potentially valid user comments if `pending` is available.
