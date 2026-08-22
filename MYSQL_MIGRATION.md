# MySQL and Google OAuth Setup

1. Copy `.env.example` values into `.env` and fill in the MySQL and Google OAuth values.
2. Run `npm run db:init` to verify the connection and create the configured database/tables. The API and either worker also run this initialization automatically when they start.
3. In Google Cloud Console, add the exact `GOOGLE_REDIRECT_URI` as an authorized redirect URI.
4. Start sign-in by redirecting the browser to `GET /auth/google`.

On completion, the callback returns `{ token, user }`. When `GOOGLE_OAUTH_SUCCESS_URL` is set, it redirects there and appends the token as `?token=...`. For the React Native app, set it to `linkerin://auth/callback`. Send that value with protected API calls as `Authorization: Bearer <token>`.

`MYSQL_SSL=true` enables TLS for managed MySQL providers. This migration creates new MySQL tables; it does not copy existing Supabase data.
