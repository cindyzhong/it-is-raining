# Rain bottles

Branch: `codex/drift-bottles`. The original rain code stays on `main`.

## Preview

Run `python3 -m http.server 8080` and open http://localhost:8080.
With an empty `BOTTLES_API_URL`, the UI is explicitly a local demo. Find uses sample
bottles; Write saves local messages; Mine has a demo-only button to simulate an
incoming reply. Nothing is shared. Demo messages are not uploaded when connected.

## Connect Cloudflare

Requires Node 22+ and your Cloudflare account. From `worker/`:

1. `npx wrangler login`
2. `npx wrangler d1 create rain-bottles`
3. Put the returned database ID in `wrangler.jsonc`.
4. `npx wrangler d1 migrations apply rain-bottles --remote`
5. `npx wrangler deploy`
6. Set `window.BOTTLES_API_URL` in `bottles-config.js` to the returned HTTPS Worker URL.

Keep `ALLOWED_ORIGINS` aligned with the exact frontend origins. GitHub Pages can
stay where it is. Deploying the Worker does not deploy this Git feature branch.
To test the real API locally, run the frontend on port 8080 with the Worker URL set.
For a fully local backend use `npx wrangler d1 migrations apply rain-bottles --local`
and `npx wrangler dev`, then use its local URL in bottles-config.js.

## Behavior and limitations

- Nickname: 1–24 Unicode code points; message/reply: 1–300. Browser maxlength may
  be stricter for emoji. Plain text only.
- Browser generates a 256-bit secret, stored locally. Server stores its SHA-256
  hash; it never uses the nickname as identity. Clearing storage loses access.
- One reply per bottle per identity, enforced by a database unique constraint.
  Another browser/new identity can bypass this casual visitor limit.
- Replies are only returned to the bottle author. No reply threads or emails.
- Mine displays the latest 50 bottles and up to 200 recent replies. New labels
  appear when Mine is opened. The bottle badge checks on page load, focus, and
  every 60 seconds while the page is visible. Clicking an unread badge opens Mine.
- Writes limited to 20 attempts/hour per identity and per hashed IP (shared
  networks share that limit). CORS is not an anti-bot control. For a wider public
  launch, consider Turnstile if spam becomes a problem.
- A random indexed pivot selects a bottle without scanning/sorting the whole
  table. Selection is approximate, not uniformly random, and repeats are possible.
- Moderation: in Cloudflare's D1 console, set `hidden=1` on a bottle or reply to
  hide it. Set it back to 0 to restore. No admin UI or automatic moderation.
- No account recovery, cross-device sync, notifications, or deletion UI in v1.

## Checks

Run `node worker/test.mjs` using Node 24+ (built-in SQLite). This exercises the
Worker routing and SQL with an in-memory SQLite adapter. It does not replace a
remote D1 smoke test after deployment.

To return to the original site after saving these changes: `git switch main`.
No changes are pushed or merged automatically.
