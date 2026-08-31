#!/usr/bin/env python3
"""Export the VPS research SQLite archive to the Vercel static snapshot."""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import json, os, re, sqlite3, subprocess, sys

HOME = Path(os.environ.get("HERMES_HOME", "/opt/data"))
DB_PATH = HOME / "research-archive" / "research.sqlite3"
REPO = Path(os.environ.get("RESEARCH_VERCEL_REPO", str(HOME / "research-archive-vercel")))
OUTPUT = REPO / "data" / "research.json"
SSH_KEY = Path(os.environ.get("RESEARCH_GITHUB_KEY", str(HOME / "research-archive-deploy.key")))


def rows(conn: sqlite3.Connection, query: str, args: tuple = ()) -> list[dict]:
    conn.row_factory = sqlite3.Row
    return [dict(row) for row in conn.execute(query, args)]


def learning_text(plain: str, source_number: int) -> str:
    lines = plain.splitlines()
    starts = [i for i, line in enumerate(lines) if re.match(r"^\s*\d{1,2}\s*[·|]", line)]
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        block = [line.strip() for line in lines[start:end] if line.strip()]
        if block and (f"[{source_number}]" in block[0] or f"[{source_number}]" in " ".join(block[:2])):
            return "\n".join(block)
    return ""


def snapshot() -> dict:
    if not DB_PATH.exists():
        return {"generated_at": datetime.now(timezone.utc).isoformat(), "editions_count": 0, "items_count": 0, "social_checks_count": 0, "social_leads_count": 0, "categories": {}, "editions": [], "items": [], "social": {"checks": [], "leads": []}}
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    edition_rows = rows(conn, "SELECT edition_id,captured_at,subject,plain_body,item_count,social_target_count,social_lead_count FROM editions ORDER BY captured_at DESC")
    item_rows = rows(conn, """
      SELECT i.item_id,i.edition_id,i.source_number,i.category,i.title,i.publisher,i.source_type,
             i.published,i.source_url,i.description,i.evidence_excerpt,i.image_url,i.video_url,
             i.video_search_url,e.captured_at AS edition_captured
      FROM research_items i JOIN editions e ON e.edition_id=i.edition_id
      ORDER BY e.captured_at DESC, i.source_number
    """)
    check_rows = rows(conn, "SELECT check_id,edition_id,platform,target,checked_at,method,status,profile_or_search FROM social_checks ORDER BY checked_at DESC,target")
    lead_rows = rows(conn, "SELECT lead_id,edition_id,platform,account_query,title,source_url,published,evidence_excerpt,verification_status,source_type FROM social_leads ORDER BY published DESC")
    conn.close()
    by_edition: dict[str, list[dict]] = {}
    for item in item_rows:
        item["learning_text"] = learning_text(next((e["plain_body"] for e in edition_rows if e["edition_id"] == item["edition_id"]), ""), int(item["source_number"]))
        by_edition.setdefault(item["edition_id"], []).append(item)
    editions = []
    for edition in edition_rows:
        value = {key: edition[key] for key in ("edition_id", "captured_at", "subject", "item_count", "social_target_count", "social_lead_count")}
        value["items"] = by_edition.get(edition["edition_id"], [])
        value["plain_body"] = edition["plain_body"]
        editions.append(value)
    category_counts: dict[str, int] = {}
    for item in item_rows:
        category_counts[item["category"]] = category_counts.get(item["category"], 0) + 1
    latest_edition = edition_rows[0]["edition_id"] if edition_rows else ""
    latest_checks = [item for item in check_rows if item["edition_id"] == latest_edition]
    latest_leads = [item for item in lead_rows if item["edition_id"] == latest_edition]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "editions_count": len(edition_rows), "items_count": len(item_rows),
        "social_checks_count": len(check_rows), "social_leads_count": len(lead_rows),
        "categories": category_counts, "editions": editions, "items": item_rows,
        "social": {"checks": latest_checks, "leads": latest_leads},
    }


def git_env() -> dict:
    value = os.environ.copy()
    if SSH_KEY.exists():
        value["GIT_SSH_COMMAND"] = f"ssh -i {SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
    return value


def run(command: list[str], cwd: Path | None = None, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=str(cwd) if cwd else None, env=env, capture_output=True, text=True, timeout=90, check=False)


def main() -> int:
    if not REPO.joinpath(".git").exists():
        print(json.dumps({"status": "repo_missing", "repo": str(REPO)}))
        return 0
    sync_env = git_env()
    fetched = run(["git", "fetch", "origin"], REPO, sync_env)
    if fetched.returncode != 0:
        print(json.dumps({"status": "fetch_failed", "stderr": fetched.stderr[-900:]}))
        return 1
    rebased = run(["git", "rebase", "origin/main"], REPO, sync_env)
    if rebased.returncode != 0:
        run(["git", "rebase", "--abort"], REPO, sync_env)
        print(json.dumps({"status": "rebase_failed", "stderr": rebased.stderr[-900:]}))
        return 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(snapshot(), ensure_ascii=False, indent=2) + "\n"
    previous = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
    if content == previous:
        print(json.dumps({"status": "unchanged", "repo": str(REPO), "output": str(OUTPUT)}))
        return 0
    OUTPUT.write_text(content, encoding="utf-8")
    run(["git", "config", "user.name", "Lind-hack"], REPO)
    run(["git", "config", "user.email", "110059658+Lind-hack@users.noreply.github.com"], REPO)
    staged = run(["git", "add", "--", "data/research.json"], REPO)
    if staged.returncode != 0:
        print(json.dumps({"status": "git_add_failed", "stderr": staged.stderr[-500:]}))
        return 1
    diff = run(["git", "diff", "--cached", "--quiet", "--", "data/research.json"], REPO)
    if diff.returncode == 0:
        print(json.dumps({"status": "unchanged_after_stage", "repo": str(REPO)}))
        return 0
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    committed = run(["git", "commit", "-m", f"chore: update research archive {stamp}"], REPO)
    if committed.returncode != 0:
        print(json.dumps({"status": "commit_failed", "stderr": committed.stderr[-700:]}))
        return 1
    push_env = git_env()
    pushed = run(["git", "push", "origin", "main"], REPO, push_env)
    if pushed.returncode != 0:
        print(json.dumps({"status": "push_failed", "stderr": pushed.stderr[-900:]}))
        return 1
    sha = run(["git", "rev-parse", "HEAD"], REPO).stdout.strip()
    data = json.loads(content)
    print(json.dumps({"status": "pushed", "repo": str(REPO), "sha": sha, "items": data.get("items_count", 0), "editions": data.get("editions_count", 0)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
