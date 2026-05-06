# Neurodeck

An installable agent skill and private React client for Brainmaster/TRIBE v2 login, submission, and owned-job query.

It uses the same public API surface as the existing Brainmaster CLI and leaderboard:

- Auth backend: `https://notes.highscore.page/api/auth/*`
- Brainmaster API: `https://tiktok.highscore.page/api/tribe/*`

The app and skill store no password, no API key, and no server secret. Users request a magic link, click it in email, and the session cookie is then used for authenticated Brainmaster requests.

## Install Skill

```bash
git clone https://github.com/publu/neurodeck.git
cd neurodeck
./install.sh
```

The installer copies `skills/neurodeck` into `${AGENT_SKILLS_DIR:-~/.agents/skills}` and links the CLI as `${AGENT_BIN_DIR:-~/.local/bin}/neurodeck`.

Useful commands:

```bash
neurodeck login --email user@example.com
neurodeck whoami
neurodeck projects
neurodeck my-jobs
neurodeck query "say my name"
neurodeck show <job_id>
neurodeck submit ./file.mp3 --project <project_id> --role submission --wait
neurodeck qa-url https://example.com --project <project_id>
```

`qa-url` records a full-page scroll video with Playwright, submits the `.webm` to TRIBE, waits for the job by default, and prints the top ROI parcels for website QA.

If browser launch fails on a fresh Linux box, install Playwright's system dependencies:

```bash
npx --prefix ~/.agents/skills/neurodeck playwright install-deps chromium
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
