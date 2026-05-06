# Brainmaster Login

A private React client for the Brainmaster/TRIBE v2 magic-link login flow.

It uses the same public API surface as the existing Brainmaster CLI and leaderboard:

- Auth backend: `https://notes.highscore.page/api/auth/*`
- Brainmaster API: `https://tiktok.highscore.page/api/tribe/*`

The app stores no password, no API key, and no server secret. Users request a magic link, click it in email, and the browser session cookie is then used for authenticated Brainmaster requests.

## Run Locally

```bash
npm install
npm run dev
```

Open the printed local URL, request a magic link, then click the email link. Once confirmed, the app shows the signed-in email, project list, and recent Brainmaster jobs.

## API Notes

Login request:

```http
POST https://notes.highscore.page/api/auth/request
Content-Type: application/json

{ "email": "user@example.com" }
```

Poll login:

```http
GET https://notes.highscore.page/api/auth/status?request_id=<id>
```

Check session:

```http
GET https://notes.highscore.page/api/auth/me
```

Brainmaster examples:

```http
GET https://tiktok.highscore.page/api/tribe/projects
GET https://tiktok.highscore.page/api/tribe/jobs
```
