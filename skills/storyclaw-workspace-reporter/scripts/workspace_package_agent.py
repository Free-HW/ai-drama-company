#!/usr/bin/env python3
"""Package the current agent into the user's workspace.

Thin wrapper around `talenthub agent export`. We do NOT zip files
here — talenthub owns agent packaging (deterministic zip, dotfile
filter, manifest schema, etc.). This script only delivers the
already-built zip to the workspace surface:

  1. Run `talenthub agent export <agentId> -o <tmp.zip> --json`.
  2. Parse the JSONL output; require a `done` event.
  3. Upload the zip via /api/workspace/upload-url + register via
     /api/workspace/items.

If `talenthub agent export` errors, this script reports it and exits.
It does NOT fall back to packaging the agent itself — by design.
Letting the LLM-driven agent zip its own state was the failure mode
this refactor removes.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import (  # noqa: E402
    create_upload_url,
    fetch_agent_category_slugs,
    upload_file_to_s3,
    workspace_register_agent,
)


# Cap matches the workspace-side validator (`validateAgentZip`) so
# we fail locally before wasting an S3 upload on a too-big zip.
MAX_ZIP_BYTES = 100 * 1024 * 1024


def _id_from_workspace_basename(name: str) -> str | None:
    """Map a talenthub workspace dir basename to an agent id.

    Per `talenthub paths.ts:resolveWorkspaceDir`, the main agent uses
    `<state-dir>/workspace` and named agents use
    `<state-dir>/workspace-<id>`."""
    if name == "workspace":
        return "main"
    if name.startswith("workspace-"):
        return name[len("workspace-"):] or None
    return None


def resolve_agent_id(arg_agent_id: str | None) -> str:
    if arg_agent_id:
        return arg_agent_id
    # 1. Explicit env vars in any of the published conventions.
    for var in ("TALENTHUB_AGENT_ID", "OPENCLAW_AGENT_ID", "STORYCLAW_AGENT_ID"):
        val = os.environ.get(var)
        if val:
            return val.strip()
    # 2. Derive from the skill's own installed path. Talenthub installs
    #    this skill under <workspace>/skills/storyclaw-workspace-reporter/,
    #    so walking up four parents from this file lands on the
    #    workspace root — whose basename encodes the agent id.
    #
    #    .../workspace/skills/storyclaw-workspace-reporter/scripts/workspace_package_agent.py
    #     ↑4              ↑3       ↑2                          ↑1   ↑0
    workspace_root = Path(__file__).resolve().parents[3]
    derived = _id_from_workspace_basename(workspace_root.name)
    if derived:
        return derived
    # 3. Fall back to env-supplied dirs (openclaw's canonical, then the
    #    older STORYCLAW alias).
    for var in ("OPENCLAW_WORKSPACE", "OPENCLAW_AGENT_DIR", "STORYCLAW_AGENT_DIR"):
        env_dir = os.environ.get(var)
        if not env_dir:
            continue
        derived = _id_from_workspace_basename(Path(env_dir).resolve().name)
        if derived:
            return derived
    print(
        "error: cannot determine talenthub agent id. The packager looks "
        "for the agent id in (1) --agent-id, (2) $TALENTHUB_AGENT_ID / "
        "$OPENCLAW_AGENT_ID / $STORYCLAW_AGENT_ID, (3) this skill's own "
        "install path (which talenthub places under "
        "<workspace>/skills/storyclaw-workspace-reporter/), (4) "
        "$OPENCLAW_WORKSPACE / $OPENCLAW_AGENT_DIR / "
        "$STORYCLAW_AGENT_DIR. None of those resolved. Pass --agent-id "
        "explicitly to bypass the lookup.",
        file=sys.stderr,
    )
    sys.exit(1)


def run_talenthub_export(agent_id: str, output_path: Path) -> dict:
    """Invoke talenthub via `npx --yes @storyclaw/talenthub@latest
    agent export <agentId> -o <path> --json`, parse the JSONL stream,
    and return the `done` event.

    We invoke through `npx` (matching openclaw's gateway in
    `agents-install.ts` / `agents-upgrade.ts`) so the device never
    needs a pre-installed talenthub CLI — npx fetches the latest
    published version on demand.

    On any failure (npx not found, non-zero exit, `error` event, no
    `done` event) we print to stderr and exit 1 — no fallback path.
    """
    argv = [
        "npx",
        "--yes",
        "@storyclaw/talenthub@latest",
        "agent",
        "export",
        agent_id,
        "-o",
        str(output_path),
        "--json",
    ]
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
            # Mirror openclaw's gateway: keep colour codes out of the
            # JSONL stream so the parser doesn't have to strip them.
            env={**os.environ, "FORCE_COLOR": "0"},
        )
    except FileNotFoundError:
        print(
            "error: `npx` not found on PATH. The workspace-reporter skill "
            "shells out to `npx @storyclaw/talenthub@latest`; install Node.js "
            "(which bundles npx) before retrying.",
            file=sys.stderr,
        )
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(
            "error: `npx @storyclaw/talenthub@latest agent export` timed out "
            "after 5 minutes",
            file=sys.stderr,
        )
        sys.exit(1)

    done_event: dict | None = None
    error_event: dict | None = None
    for line in proc.stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            event = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        kind = event.get("event")
        if kind == "done":
            done_event = event
        elif kind == "error":
            error_event = event

    if proc.returncode != 0 or error_event or not done_event:
        if error_event:
            detail = error_event.get("message") or "no message"
        elif proc.stderr.strip():
            detail = proc.stderr.strip()
        else:
            detail = proc.stdout.strip() or f"exit {proc.returncode}"
        print(f"error: talenthub agent export failed — {detail}", file=sys.stderr)
        sys.exit(1)

    return done_event


def preflight_manifest_category(zip_path: Path) -> None:
    """Fail early if manifest.category isn't in the server's allowlist.

    Without this check, the server-side validator rejects the upload only
    after an S3 PUT round-trip. For the agent UX, every retry then costs
    a full re-package — talenthub clone + zip rebuild + upload — even
    though the rejection is determined by a single string compare.

    Behaviour:
      - Read `manifest.json` straight out of the local zip (no full
        unzip; just one entry read).
      - Fetch the current category slugs from the public catalog.
        If the fetch fails (network, server error), we *skip* the
        pre-flight — the server is still authoritative and will reject
        cleanly on upload. We don't want a flaky catalog request to
        block a valid publish.
      - If both the slug list and the manifest's category resolve and
        the category isn't in the list, exit 1 with the allowed slugs
        in the error so the agent can self-correct on retry.
    """
    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            with z.open("manifest.json") as f:
                manifest = json.loads(f.read().decode("utf-8"))
    except (KeyError, zipfile.BadZipFile, json.JSONDecodeError, OSError):
        # manifest missing / malformed — let the server return a clear
        # `manifest_missing` / `manifest_invalid` so the caller sees one
        # canonical error path.
        return

    category = manifest.get("category") if isinstance(manifest, dict) else None
    if not isinstance(category, str) or not category:
        # Same reasoning as above — defer to the server's typed reply.
        return

    allowed = fetch_agent_category_slugs()
    if not allowed:
        # No allowlist available; defer to server.
        return

    if category not in allowed:
        print(
            "error: manifest.category '"
            f"{category}' is not a valid agent_template category. "
            f"Allowed: {', '.join(sorted(allowed))}. "
            "Update the category in your agent's identity files and "
            "re-package.",
            file=sys.stderr,
        )
        sys.exit(1)


def filter_zip(src: Path, dst: Path, excludes: list[str]) -> list[str]:
    """Copy `src` into `dst` skipping entries that match any of
    `excludes`. An exclude matches if the zip entry path equals it OR
    starts with `<exclude>/` (so the agent can pass either a single
    file path or a directory prefix). Returns the list of paths that
    were actually skipped, for caller logging."""
    skipped: list[str] = []
    with zipfile.ZipFile(src, "r") as zin, zipfile.ZipFile(
        dst, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for info in zin.infolist():
            name = info.filename
            if any(name == e or name.startswith(f"{e.rstrip('/')}/") for e in excludes):
                skipped.append(name)
                continue
            zout.writestr(info, zin.read(name))
    return skipped


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--agent-id",
        default=None,
        help=(
            "Talenthub agent id to package. Defaults to $STORYCLAW_AGENT_ID, "
            "then to the basename of $STORYCLAW_AGENT_DIR per talenthub's "
            "workspace naming convention."
        ),
    )
    ap.add_argument(
        "--exclude",
        action="append",
        default=[],
        metavar="PATH",
        help=(
            "Zip entry path (or directory prefix) to remove from the "
            "talenthub-built zip before upload. Repeatable. Use this "
            "to re-run after a `blacklisted_file` server error: pass "
            "the exact path the server reported in `detail`. NEVER "
            "use this to drop files the server didn't flag — the "
            "retry must be additive over prior --exclude values."
        ),
    )
    args = ap.parse_args()

    agent_id = resolve_agent_id(args.agent_id)

    # talenthub writes the zip to a path we own; we delete it after upload.
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        tmp_path = Path(tmp.name)

    filtered_path: Path | None = None
    try:
        done = run_talenthub_export(agent_id, tmp_path)
        # `done.output` is the path talenthub wrote to. We passed it
        # explicitly above, but trust the event in case talenthub
        # canonicalised the path.
        zip_path = Path(done.get("output") or tmp_path)
        if not zip_path.is_file():
            print(
                f"error: talenthub reported success but {zip_path} is not a "
                "file. Aborting.",
                file=sys.stderr,
            )
            sys.exit(1)

        # Pre-flight: fail before upload if the manifest category is not
        # in the server's allowlist. Saves the S3 upload + register
        # round-trip on every retry of a misconfigured agent.
        preflight_manifest_category(zip_path)

        # If the caller passed --exclude, rewrite the zip to a sibling
        # temp file with those entries removed. The agent uses this on
        # retry after a server-side `blacklisted_file` error: pass the
        # exact path the server reported.
        if args.exclude:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as ftmp:
                filtered_path = Path(ftmp.name)
            skipped = filter_zip(zip_path, filtered_path, args.exclude)
            if not skipped:
                print(
                    "warning: --exclude was set but no zip entries matched: "
                    f"{args.exclude}",
                    file=sys.stderr,
                )
            else:
                print(
                    f"info: stripped {len(skipped)} entry/entries before upload: "
                    f"{', '.join(skipped[:5])}"
                    + (" …" if len(skipped) > 5 else ""),
                    file=sys.stderr,
                )
            zip_path = filtered_path

        size_bytes = zip_path.stat().st_size
        if size_bytes > MAX_ZIP_BYTES:
            print(
                f"error: zip is {size_bytes} bytes; the workspace caps at "
                f"{MAX_ZIP_BYTES} bytes. Prune large recipes or skills.",
                file=sys.stderr,
            )
            sys.exit(1)

        content_type = "application/zip"
        filename = f"{agent_id}.zip"

        presign = create_upload_url(
            filename=filename,
            content_type=content_type,
            size_bytes=size_bytes,
        )
        upload_file_to_s3(presign["uploadUrl"], zip_path, content_type)

        # The server runs validateAgentZip and overrides title with
        # manifest.name, so the title we pass here is a placeholder.
        # On validation failure, _request prints the error JSON to
        # stderr and exits 1.
        item = workspace_register_agent(
            item_id=presign["itemId"],
            file_key=presign["fileKey"],
            title=agent_id,
            size_bytes=size_bytes,
        )
        print(
            f"ok agent_id={item.get('id')} talenthub_agent={agent_id} "
            f"size={size_bytes}"
        )
    finally:
        for p in (tmp_path, filtered_path):
            if p is None:
                continue
            try:
                p.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    main()
