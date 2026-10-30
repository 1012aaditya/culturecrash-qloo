# Supabase email templates

CultureCrash verifies email links at `/auth/confirm` with a **token hash**, so a link works on any device:
someone can sign up on a laptop and confirm from their phone. Supabase's default templates use a PKCE
link that only works in the browser that started the sign-up, which is why they need changing once.

Where: Supabase dashboard → **Authentication → Emails → Templates**. In each template below, replace the
link (the `href`, which defaults to `{{ .ConfirmationURL }}`) with the one shown. Leave the rest of the
email as it is. `{{ .SiteURL }}` is the Site URL set under Authentication → URL Configuration.

| Template | Link |
|---|---|
| Confirm sign up | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=%2Fsettings%2Fsecurity%3Frecovery%3D1` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings` |

For example, the "Confirm sign up" body becomes:

```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your email:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm your email</a></p>
```

The older `/auth/callback` route still handles PKCE links, so emails already sent keep working in the
browser that requested them.
