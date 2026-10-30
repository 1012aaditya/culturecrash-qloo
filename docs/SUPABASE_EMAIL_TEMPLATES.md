# Supabase email links

Sign-up confirmation and password-reset links work on **any device** (sign up on a laptop, confirm on a
phone) with Supabase's **default** email templates — no template change is needed.

How: the app asks Supabase for these emails without PKCE (`emailLinkClient()` in `src/lib/auth/supabase.ts`).
Supabase's default link then sends the person to `/auth/complete` with the session in the URL fragment;
that page hands it to the server once (Supabase Auth validates it), stores the normal cookie session and
removes it from the address bar. If Supabase sends the link to the Site URL instead (when the redirect
address isn't on the allow list), `EmailLinkForwarder` in the root layout passes it on.

Make sure Authentication → URL Configuration has the Site URL set to the live address and
`https://culturecrash.vercel.app/**` under Redirect URLs.

## Optional: token-hash templates (needs custom SMTP)

Supabase only allows editing email templates once a custom SMTP provider is configured (Authentication →
Emails → Set up SMTP). If you do that later, the links below use `/auth/confirm`, which verifies a token
hash on the server and also works on any device:

| Template | Link |
|---|---|
| Confirm sign up | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=%2Fsettings%2Fsecurity%3Frecovery%3D1` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings` |

`/auth/callback` still handles PKCE links already sent, in the browser that requested them.
