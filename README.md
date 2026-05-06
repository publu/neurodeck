# Brainmaster

A private React client and installable agent skill for the Brainmaster/TRIBE v2 magic-link login flow.

It uses the same public API surface as the existing Brainmaster CLI and leaderboard:

- Auth backend: `https://notes.highscore.page/api/auth/*`
- Brainmaster API: `https://tiktok.highscore.page/api/tribe/*`

The app and skill store no password, no API key, and no server secret. Users request a magic link, click it in email, and the session cookie is then used for authenticated Brainmaster requests.

## Install Skill

```bash
git clone https://github.com/publu/brainmaster-login.git
cd brainmaster-login
./install.sh
```

The installer copies `skills/brainmaster` into `${AGENT_SKILLS_DIR:-~/.agents/skills}` and links the CLI as `${AGENT_BIN_DIR:-~/.local/bin}/brainmaster`.

Useful commands:

```bash
brainmaster login --email user@example.com
brainmaster whoami
brainmaster projects
brainmaster my-jobs
brainmaster query "say my name"
brainmaster show <job_id>
brainmaster submit ./file.mp3 --project <project_id> --role submission --wait
```

## Run Locally

```bash
npm install
npm run dev
```

Open the printed local URL, request a magic link, then click the email link. Once confirmed, the app shows the signed-in email, project list, and queryable owned jobs.

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
GET https://tiktok.highscore.page/api/tribe/records
```
