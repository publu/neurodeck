---
name: neurodeck
description: Log in to Brainmaster/TRIBE v2 with magic links, submit media/text/website QA videos, list/query a user's own workspace jobs, and fetch job metadata, ROI summaries, and input links.
metadata: {"openclaw":{"emoji":"🧠","homepage":"https://github.com/publu/neurodeck","requires":{"bins":["python3","node"],"env":[]},"install":[{"id":"requests","kind":"python","packages":["requests"],"label":"Install Python requests"},{"id":"playwright","kind":"node","packages":["playwright"],"label":"Install Playwright for website QA"}]}}
---

# Neurodeck

Use this skill when a user asks to log in to Brainmaster, submit media/text to TRIBE v2, QA a website through a captured scroll video, list or query their own Brainmaster jobs, create projects, check job status, or fetch job ROI/meta/input.

## Core Rules

- Use the bundled CLI: `scripts/neurodeck.py`.
- For website QA, use `qa-url`; it records a deterministic full-page scroll video with Playwright, submits the `.webm` to TRIBE, then summarizes the ROI.
- Authentication is magic-link only. Never ask for or store passwords.
- Brainmaster session cookies live in `${BRAINMASTER_HOME:-~/.brainmaster}/cookies.txt`.
- Treat `/api/tribe/jobs` as a broad indexed list, not a pure ownership boundary.
- For “my jobs,” use user-owned projects plus user-owned records, then hydrate filenames from the indexed list.
- Do not fetch details for arbitrary job IDs unless the job appears in the signed-in user's projects or records.

## Quick Commands

```bash
python3 skills/neurodeck/scripts/neurodeck.py login --email user@example.com
python3 skills/neurodeck/scripts/neurodeck.py whoami
python3 skills/neurodeck/scripts/neurodeck.py projects
python3 skills/neurodeck/scripts/neurodeck.py my-jobs
python3 skills/neurodeck/scripts/neurodeck.py query "say my name"
python3 skills/neurodeck/scripts/neurodeck.py show <job_id>
python3 skills/neurodeck/scripts/neurodeck.py submit ./file.mp3 --project <project_id> --role submission --wait
python3 skills/neurodeck/scripts/neurodeck.py qa-url https://example.com --project <project_id>
python3 skills/neurodeck/scripts/neurodeck.py costs
python3 skills/neurodeck/scripts/neurodeck.py costs --by-email
```

## Login Flow

1. Run `login --email`.
2. Tell the user to click the magic link in their email.
3. The CLI polls `/api/auth/status` until confirmed, then saves the session cookie.
4. Verify with `whoami`.

## Owned Job Query Workflow

When the user asks to view/query their jobs:

1. Run `my-jobs` to list owned jobs.
2. Run `query <text>` to search by filename, project/category/source, or job ID.
3. Run `show <job_id>` for details.

`show` fetches:

- `GET /api/tribe/jobs/:job_id/meta`
- `GET /api/tribe/jobs/:job_id/roi`
- `GET /api/tribe/jobs/:job_id/input` as a short-lived input link

The CLI refuses `show` if the job is not in the user's project/record ownership set.

## Website QA Workflow

When the user asks to QA a website with Brainmaster/TRIBE:

1. Make sure the user is logged in with `whoami`.
2. If needed, create or choose a project with `project-create` / `projects`.
3. Run:

```bash
python3 skills/neurodeck/scripts/neurodeck.py qa-url https://site.example --project <project_id>
```

This command:

- records a `1440x900` Playwright scroll video into `${BRAINMASTER_HOME:-~/.brainmaster}/website-videos`
- submits the video to `/api/tribe/submit`
- waits for completion by default
- assigns the completed job to the project when `--project` is provided
- prints the TRIBE job ID and top ROI parcels by absolute mean

Use `--no-wait` for fire-and-forget capture/submission. Use `--out-dir` to keep captures in a repo-local folder.

## API Map

Auth backend:

- `POST https://notes.highscore.page/api/auth/request`
- `GET https://notes.highscore.page/api/auth/status?request_id=...`
- `GET https://notes.highscore.page/api/auth/me`
- `POST https://notes.highscore.page/api/auth/logout`

Brainmaster backend:

- `GET /api/tribe/projects`
- `POST /api/tribe/projects`
- `GET /api/tribe/jobs`
- `GET /api/tribe/records`
- `POST /api/tribe/submit`
- `GET /api/tribe/status/:call_id`
- `GET /api/tribe/costs`
- `GET /api/tribe/costs/by-email` (admin-only)
- `GET /api/tribe/jobs/:job_id/meta`
- `GET /api/tribe/jobs/:job_id/roi`
- `GET /api/tribe/jobs/:job_id/input`

## Output Guidance

For job query responses, include:

- filename
- job ID
- source project/category
- segment count
- created date

For `show`, summarize top ROI parcels by absolute mean and include the input URL when available.
