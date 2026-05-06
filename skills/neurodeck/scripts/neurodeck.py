#!/usr/bin/env python3
"""Neurodeck CLI: login, submit, and query owned Brainmaster/TRIBE v2 jobs."""

from __future__ import annotations

import argparse
import http.cookiejar as cookiejar
import json
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import os
import requests

API_BASE = os.environ.get("BRAINMASTER_API_BASE", "https://tiktok.highscore.page")
AUTH_BASE = os.environ.get("BRAINMASTER_AUTH_BASE", "https://notes.highscore.page")
SESSION_DIR = Path(os.environ.get("BRAINMASTER_HOME", str(Path.home() / ".brainmaster")))
COOKIE_FILE = SESSION_DIR / "cookies.txt"
SCRIPT_DIR = Path(__file__).resolve().parent


@dataclass
class OwnedJob:
    job_id: str
    filename: str
    source: str
    n_segments: int | None = None
    created_at: str | None = None


def session() -> requests.Session:
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    s.cookies = cookiejar.LWPCookieJar(str(COOKIE_FILE))
    if COOKIE_FILE.exists():
        try:
            s.cookies.load(ignore_discard=True, ignore_expires=True)
        except Exception:
            pass
    return s


def save_session(s: requests.Session) -> None:
    s.cookies.save(ignore_discard=True, ignore_expires=True)


def api_json(s: requests.Session, path: str, **kwargs: Any) -> Any:
    r = s.get(f"{API_BASE}{path}", timeout=kwargs.pop("timeout", 30), **kwargs)
    if r.status_code >= 400:
        raise SystemExit(f"ERROR {r.status_code}: {r.text}")
    return r.json()


def whoami_email(s: requests.Session) -> str | None:
    r = s.get(f"{AUTH_BASE}/api/auth/me", timeout=15)
    if r.status_code != 200:
        return None
    return r.json().get("email")


def require_auth(s: requests.Session) -> str:
    email = whoami_email(s)
    if not email:
        raise SystemExit("ERROR: not logged in. Run: neurodeck login --email you@example.com")
    return email


def cmd_login(args: argparse.Namespace) -> None:
    s = session()
    existing = whoami_email(s)
    if existing and not args.force:
        print(f"already logged in as {existing}; pass --force to re-login")
        return
    r = s.post(f"{AUTH_BASE}/api/auth/request", json={"email": args.email}, timeout=30)
    if r.status_code != 200:
        raise SystemExit(f"ERROR: auth/request returned {r.status_code}: {r.text}")
    data = r.json()
    request_id = data["request_id"]
    print(f"magic link sent to {args.email}; expires in {data.get('expires_in', '?')}s")
    print(f"request_id: {request_id}")
    print("waiting for confirmation", end="", flush=True)
    start = time.time()
    while True:
        time.sleep(2.5)
        r = s.get(f"{AUTH_BASE}/api/auth/status", params={"request_id": request_id}, timeout=15)
        if r.status_code == 404:
            raise SystemExit("\nERROR: login request not found")
        d = r.json()
        if d.get("status") == "confirmed":
            save_session(s)
            print(f"\nlogged in as {d.get('email') or args.email} ({int(time.time() - start)}s)")
            return
        if d.get("status") == "expired":
            raise SystemExit("\nERROR: magic link expired")
        print(".", end="", flush=True)


def cmd_whoami(_: argparse.Namespace) -> None:
    s = session()
    email = require_auth(s)
    print(email)


def cmd_logout(_: argparse.Namespace) -> None:
    s = session()
    s.post(f"{AUTH_BASE}/api/auth/logout", timeout=15)
    if COOKIE_FILE.exists():
        COOKIE_FILE.unlink()
    print("logged out")


def cmd_projects(_: argparse.Namespace) -> None:
    s = session()
    require_auth(s)
    projects = api_json(s, "/api/tribe/projects")
    if not projects:
        print("(no projects)")
        return
    print(f"{'project_id':<38}  {'jobs':>4}  name")
    print("-" * 70)
    for p in projects:
        print(f"{p['project_id']:<38}  {len(p.get('jobs', [])):>4}  {p['name']}")


def cmd_project_create(args: argparse.Namespace) -> None:
    s = session()
    require_auth(s)
    r = s.post(f"{API_BASE}/api/tribe/projects", json={"name": args.name}, timeout=30)
    if r.status_code != 201:
        raise SystemExit(f"ERROR {r.status_code}: {r.text}")
    p = r.json()
    print(f"created project {p['project_id']}: {p['name']}")


def indexed_jobs_by_id(s: requests.Session) -> dict[str, dict[str, Any]]:
    try:
        jobs = api_json(s, "/api/tribe/jobs")
    except SystemExit:
        return {}
    return {j["job_id"]: j for j in jobs if j.get("job_id")}


def owned_jobs(s: requests.Session) -> list[OwnedJob]:
    require_auth(s)
    projects = api_json(s, "/api/tribe/projects")
    records = api_json(s, "/api/tribe/records")
    indexed = indexed_jobs_by_id(s)
    by_id: dict[str, OwnedJob] = {}

    for project in projects:
        for job in project.get("jobs", []):
            by_id[job["job_id"]] = OwnedJob(
                job_id=job["job_id"],
                filename=job.get("filename") or job["job_id"],
                source=project.get("name") or "Project",
                n_segments=job.get("n_segments"),
                created_at=job.get("created_at"),
            )

    for record in records.values() if isinstance(records, dict) else []:
        job_id = record.get("job_id")
        if not job_id:
            continue
        hydrated = indexed.get(job_id, {})
        existing = by_id.get(job_id)
        by_id[job_id] = OwnedJob(
            job_id=job_id,
            filename=(existing.filename if existing else None) or hydrated.get("filename") or job_id,
            source=(existing.source if existing else None) or record.get("category") or "Saved record",
            n_segments=(existing.n_segments if existing else None) or hydrated.get("n_segments"),
            created_at=(existing.created_at if existing else None) or hydrated.get("created_at") or record.get("updated_at"),
        )

    return sorted(by_id.values(), key=lambda j: j.created_at or "", reverse=True)


def print_jobs(rows: list[OwnedJob], limit: int | None = None) -> None:
    rows = rows[:limit] if limit else rows
    if not rows:
        print("(no owned jobs found)")
        return
    print(f"{'job_id':<14}  {'segments':>8}  {'source':<24}  filename")
    print("-" * 100)
    for j in rows:
        print(f"{j.job_id:<14}  {str(j.n_segments or '-'):>8}  {j.source[:24]:<24}  {j.filename}")


def cmd_my_jobs(args: argparse.Namespace) -> None:
    rows = owned_jobs(session())
    print_jobs(rows, args.limit)


def cmd_query(args: argparse.Namespace) -> None:
    q = " ".join(args.query).lower()
    rows = [
        j for j in owned_jobs(session())
        if q in j.job_id.lower() or q in j.filename.lower() or q in j.source.lower()
    ]
    print_jobs(rows, args.limit)


def summarize_roi(roi: dict[str, list[float]], limit: int) -> list[tuple[str, float]]:
    rows: list[tuple[str, float]] = []
    for name, series in roi.items():
        values = [v for v in series if isinstance(v, (int, float))]
        mean = sum(values) / len(values) if values else 0.0
        rows.append((name, mean))
    return sorted(rows, key=lambda x: abs(x[1]), reverse=True)[:limit]


def print_roi_summary(roi: dict[str, list[float]], limit: int) -> None:
    print("\nTop ROI parcels by absolute mean:")
    for name, mean in summarize_roi(roi, limit):
        print(f"  {mean: .6f}  {name}")


def cmd_show(args: argparse.Namespace) -> None:
    s = session()
    owned = {j.job_id: j for j in owned_jobs(s)}
    if args.job_id not in owned:
        raise SystemExit("ERROR: job is not in this signed-in user's projects or records")

    job = owned[args.job_id]
    meta = api_json(s, f"/api/tribe/jobs/{args.job_id}/meta")
    roi = api_json(s, f"/api/tribe/jobs/{args.job_id}/roi")
    link = s.get(f"{API_BASE}/api/tribe/jobs/{args.job_id}/input", timeout=30, allow_redirects=False)
    input_url = link.headers.get("Location") if link.status_code in (301, 302, 303, 307, 308) else None

    print(f"job_id: {job.job_id}")
    print(f"filename: {job.filename}")
    print(f"source: {job.source}")
    print(f"segments: {job.n_segments or meta.get('n_segments', '-')}")
    if input_url:
        print(f"input_url: {input_url}")
    print_roi_summary(roi, args.roi_limit)
    if args.json:
        print("\nmeta:")
        print(json.dumps(meta, indent=2))


def poll(s: requests.Session, call_id: str, interval: int = 10, max_wait: int = 900) -> dict[str, Any]:
    start = time.time()
    while time.time() - start < max_wait:
        d = api_json(s, f"/api/tribe/status/{call_id}")
        st = d.get("status")
        elapsed = int(time.time() - start)
        if st == "done":
            print(f"\ndone in {elapsed}s")
            print(json.dumps(d.get("result"), indent=2))
            return d["result"]
        if st == "error":
            raise SystemExit(f"\nerror after {elapsed}s: {d.get('detail')}")
        print(f"[{elapsed:>4}s] {st}", end="\r", flush=True)
        time.sleep(interval)
    raise SystemExit(f"\nTIMEOUT after {max_wait}s; call_id={call_id} still running")


def submit_file(
    s: requests.Session,
    path: Path,
    *,
    project: str | None = None,
    role: str = "submission",
    wait: bool = False,
) -> dict[str, Any] | None:
    if not path.exists():
        raise SystemExit(f"ERROR: file not found: {path}")
    with path.open("rb") as f:
        r = s.post(f"{API_BASE}/api/tribe/submit", files={"file": (path.name, f)}, timeout=300)
    if r.status_code != 200:
        raise SystemExit(f"ERROR {r.status_code}: {r.text}")
    call_id = r.json()["call_id"]
    print(f"call_id: {call_id}")
    if not (wait or project):
        return None
    result = poll(s, call_id)
    if project:
        body = {
            "job_id": result["job_id"],
            "filename": path.name,
            "role": role,
            "n_segments": result["n_segments"],
        }
        ar = s.post(f"{API_BASE}/api/tribe/projects/{project}/jobs", json=body, timeout=30)
        if ar.status_code != 201:
            print(f"WARN: project assignment failed {ar.status_code}: {ar.text}", file=sys.stderr)
        else:
            print(f"assigned to project {project} as {role}")
    return result


def cmd_submit(args: argparse.Namespace) -> None:
    s = session()
    require_auth(s)
    submit_file(
        s,
        Path(args.filepath),
        project=args.project,
        role=args.role,
        wait=args.wait,
    )


def safe_slug(raw: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", raw.strip().lower()).strip("-")
    return slug[:80] or "website"


def record_scroll_video(url: str, out_dir: Path) -> Path:
    script = SCRIPT_DIR / "scroll-video.cjs"
    if not script.exists():
        raise SystemExit(f"ERROR: missing recorder script: {script}")
    if not shutil.which("node"):
        raise SystemExit("ERROR: website QA requires node. Install Node.js, then rerun ./install.sh")

    out_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["NODE_PATH"] = str((SCRIPT_DIR.parent / "node_modules").resolve())
    proc = subprocess.run(
        ["node", str(script), url, str(out_dir)],
        cwd=str(SCRIPT_DIR.parent),
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()
        raise SystemExit(
            "ERROR: scroll video capture failed. "
            "Run ./install.sh to install Playwright/Chromium.\n"
            f"{detail}"
        )
    video_path: Path | None = None
    for line in proc.stdout.splitlines():
        if line.startswith("VIDEO_PATH:"):
            candidate = Path(line.split(":", 1)[1].strip())
            if candidate.exists():
                video_path = candidate
                break
    if not video_path:
        videos = sorted(out_dir.glob("*.webm"), key=lambda p: p.stat().st_mtime, reverse=True)
        if videos:
            video_path = videos[0]
    if not video_path:
        raise SystemExit("ERROR: scroll video capture did not produce a .webm file")
    return video_path


def cmd_qa_url(args: argparse.Namespace) -> None:
    s = session()
    require_auth(s)
    parsed = urlparse(args.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise SystemExit("ERROR: qa-url requires a full http(s) URL")

    host = safe_slug(parsed.netloc)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.out_dir).expanduser().resolve() if args.out_dir else SESSION_DIR / "website-videos"
    print(f"recording scroll video for {args.url}")
    captured = record_scroll_video(args.url, out_dir)

    final_path = out_dir / f"qa-{host}-{stamp}.webm"
    if captured.resolve() != final_path.resolve():
        shutil.move(str(captured), final_path)
    print(f"video: {final_path}")

    result = submit_file(
        s,
        final_path,
        project=args.project,
        role=args.role,
        wait=not args.no_wait,
    )
    if not result:
        return

    job_id = result.get("job_id")
    if not job_id:
        return
    print(f"\nwebsite_qa_job: {job_id}")
    try:
        roi = api_json(s, f"/api/tribe/jobs/{job_id}/roi")
        print_roi_summary(roi, args.roi_limit)
    except SystemExit as exc:
        print(f"WARN: could not fetch ROI summary: {exc}", file=sys.stderr)


def cmd_status(args: argparse.Namespace) -> None:
    s = session()
    require_auth(s)
    print(json.dumps(api_json(s, f"/api/tribe/status/{args.call_id}"), indent=2))


def main() -> None:
    p = argparse.ArgumentParser(prog="neurodeck", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sl = sub.add_parser("login")
    sl.add_argument("--email", required=True)
    sl.add_argument("--force", action="store_true")
    sl.set_defaults(func=cmd_login)

    sub.add_parser("whoami").set_defaults(func=cmd_whoami)
    sub.add_parser("logout").set_defaults(func=cmd_logout)
    sub.add_parser("projects").set_defaults(func=cmd_projects)

    spc = sub.add_parser("project-create")
    spc.add_argument("name")
    spc.set_defaults(func=cmd_project_create)

    smj = sub.add_parser("my-jobs", help="list jobs owned via projects or records")
    smj.add_argument("--limit", type=int, default=50)
    smj.set_defaults(func=cmd_my_jobs)

    sq = sub.add_parser("query", help="search owned jobs")
    sq.add_argument("query", nargs="+")
    sq.add_argument("--limit", type=int, default=25)
    sq.set_defaults(func=cmd_query)

    ss = sub.add_parser("show", help="show owned job details")
    ss.add_argument("job_id")
    ss.add_argument("--roi-limit", type=int, default=12)
    ss.add_argument("--json", action="store_true", help="include raw metadata JSON")
    ss.set_defaults(func=cmd_show)

    subm = sub.add_parser("submit")
    subm.add_argument("filepath")
    subm.add_argument("--project")
    subm.add_argument("--role", choices=["reference", "submission"], default="submission")
    subm.add_argument("--wait", action="store_true")
    subm.set_defaults(func=cmd_submit)

    qa = sub.add_parser("qa-url", help="record a website scroll video and submit it to TRIBE")
    qa.add_argument("url")
    qa.add_argument("--project", help="assign result to this project_id")
    qa.add_argument("--role", choices=["reference", "submission"], default="submission")
    qa.add_argument("--out-dir", help="directory for captured .webm files")
    qa.add_argument("--no-wait", action="store_true", help="submit only; do not poll for the TRIBE result")
    qa.add_argument("--roi-limit", type=int, default=12)
    qa.set_defaults(func=cmd_qa_url)

    st = sub.add_parser("status")
    st.add_argument("call_id")
    st.set_defaults(func=cmd_status)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
