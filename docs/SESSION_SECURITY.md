# Sessions and the private admin sign-in

## Session limits

| Account                 | Signed out after no activity for | Signed out after sign-in, at the latest |
| ----------------------- | -------------------------------- | --------------------------------------- |
| Farmer, buyer, provider | 30 minutes                       | 12 hours                                |
| Admin                   | 15 minutes                       | 8 hours                                 |

The numbers live in `src/lib/auth/session-policy.ts`.

### How the limits are enforced

Every page and API request passes through `src/proxy.ts`, which:

1. verifies the signature of the sign-in token (Supabase ES256 keys) and reads two verified
   values from it: when the token was issued, and when the person originally signed in;
2. ends the session if the sign-in is older than the absolute limit;
3. ends the session if the token is older than the idle limit. While someone is active their
   token is renewed every 5 minutes, so an old token proves nothing happened in between;
4. otherwise renews the token if it is more than 5 minutes old.

Nothing in the browser can extend a session: both times come from the signed token. The browser
no longer renews the token on a timer (`autoRefreshToken: false`), so an open but unattended tab
goes idle like a closed one, and automatic status checks carry a header that stops them counting
as activity. Sign-in cookies now expire with the longest session (12 hours) instead of 400 days.

An ended session is signed out on the server. Pages redirect to the sign-in page with the reason;
API calls answer `401` with `code: "session_expired"`.

### What people see

- A minute before the idle limit: "Still there? You will be signed out in 60 seconds" with a
  **Stay signed in** button. Activity in any open Farmess tab counts.
- After a sign-out: a notice on the sign-in page saying why.
- **Profile → Sign-in and security**: the devices where the account is signed in, with
  **Sign out** for each other device and **Sign out of all other devices**
  (`/api/session/devices`, backed by `my_sessions()` and `revoke_my_session()`).

## Private admin sign-in

- The public sign-in page offers Farmer, Buyer and Transport & storage only. An admin account
  that tries it is signed out again and sees the same "Invalid login credentials" as a wrong
  password, so the page never confirms that an email is an admin account.
- Admins sign in at `/access/<key>`. The key is 24 hexadecimal characters derived from
  `FARMESS_SERVER_SECRET` with HMAC-SHA256; every other address under `/access` is an ordinary
  "page not found". The page is not linked anywhere, is marked `noindex`, sends no referrer and is
  never cached.
- `/admin` and everything under it answer "page not found" to anyone who is not a signed-in admin.
- When an admin signs out or their session ends they are sent to the home page, so an unattended
  screen does not show where admins sign in.

To get the address, run this in the `farmess` folder on a machine that has `.env.local`:

```powershell
node scripts/print-admin-link.mjs
```

Keep it private: share it only with other admins, and never put it in the repository, in
screenshots or in a chat group. Knowing the address grants nothing by itself (an admin email and
password are still required); it only keeps the admin door out of sight. To change the address,
change `FARMESS_SERVER_SECRET` in Vercel and `.env.local` and update the stored token hash
(see `private.server_tokens`).

## Response headers

Set for every response in `next.config.ts`: `X-Frame-Options: DENY` and
`Content-Security-Policy: frame-ancestors 'none'` (no framing), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: geolocation=(self), camera=(), microphone=()` and
`Strict-Transport-Security`. The `X-Powered-By` header is removed.

## Not covered

- Two-factor sign-in and sign-in attempt limits are Supabase Auth settings, not application code.
- The idle limit is judged to within 5 minutes on the server (the token-renewal interval); the
  open tab signs out at the exact limit.
