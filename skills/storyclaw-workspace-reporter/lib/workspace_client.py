"""Shared HTTP helpers for the workspace-reporter skill.

Uses only stdlib so it runs on any agent with Python 3.10+ and no pip.

The auth token lives in `.auth` next to SKILL.md. It is written into
the skill zip *per install* by the StoryClaw installer — each agent
gets its own file in its own workspace, so different agents on the
same device do not share a key.
"""

import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional


DEFAULT_BASE_URL = "https://storyclaw.com"

# Carries the skill version + Python version for server-side telemetry and
# WAF allowlisting. The default `Python-urllib/3.x` UA from stdlib is on
# the storyclaw.com Cloudflare block list and gets rejected with error
# 1010 before reaching Next.js — we identify ourselves explicitly so the
# WAF can let our traffic through and so logs can distinguish skill calls.
SKILL_VERSION = "1.4.10"
USER_AGENT = (
    f"storyclaw-workspace-reporter/{SKILL_VERSION} "
    f"(python-urllib; python {sys.version_info.major}.{sys.version_info.minor})"
)


def base_url() -> str:
    return os.environ.get("STORYCLAW_WORKSPACE_BASE_URL") or DEFAULT_BASE_URL


def _auth_token() -> str:
    # lib/workspace_client.py → skill root → .auth
    auth_path = Path(__file__).resolve().parent.parent / ".auth"
    if not auth_path.is_file():
        print(
            "error: workspace-reporter auth file not found at "
            f"{auth_path}. This skill must be installed through the "
            "StoryClaw drawer so the auth key gets provisioned.",
            file=sys.stderr,
        )
        sys.exit(2)
    token = auth_path.read_text(encoding="utf-8").strip()
    if not token:
        print(
            f"error: workspace-reporter auth file at {auth_path} is empty",
            file=sys.stderr,
        )
        sys.exit(2)
    return token


def _request(
    method: str,
    path: str,
    *,
    json_body: Optional[dict[str, Any]] = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """Make a JSON API call; return parsed response on 2xx, exit on failure."""
    url = f"{base_url().rstrip('/')}{path}"
    headers = {
        "authorization": f"Bearer {_auth_token()}",
        "accept": "application/json",
        "user-agent": USER_AGENT,
    }
    body: Optional[bytes] = None
    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        headers["content-type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        print(f"error: {method} {path} → {e.code}\n{detail}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:  # noqa: BLE001
        print(f"error: {method} {path} — {e}", file=sys.stderr)
        sys.exit(1)


def upload_file_to_s3(upload_url: str, file_path: Path, content_type: str) -> None:
    """PUT the file contents to the presigned S3 URL. The URL is signed to
    the exact content-type and content-length, so we must match them."""
    size = file_path.stat().st_size
    with file_path.open("rb") as f:
        req = urllib.request.Request(
            upload_url,
            data=f,
            method="PUT",
            headers={
                "content-type": content_type,
                "content-length": str(size),
                # S3 isn't behind Cloudflare and doesn't need this for WAF
                # reasons, but a consistent UA keeps logs uniform across
                # both hops of an upload.
                "user-agent": USER_AGENT,
            },
        )
        try:
            # urlopen consumes the file object lazily on read; we buffer it to
            # avoid chunked encoding which the presigned URL does not accept.
            req.data = f.read()
            with urllib.request.urlopen(req, timeout=300) as resp:
                if resp.status >= 300:
                    print(f"error: S3 upload returned {resp.status}", file=sys.stderr)
                    sys.exit(1)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            print(f"error: S3 upload {e.code}\n{detail}", file=sys.stderr)
            sys.exit(1)


def guess_mime(path: Path, override: Optional[str] = None) -> str:
    if override:
        return override
    mime, _ = mimetypes.guess_type(str(path))
    return mime or "application/octet-stream"


def print_result_summary(item: dict[str, Any]) -> None:
    """Print a short, human-readable line the LLM can echo verbatim."""
    kind = item.get("kind")
    title = item.get("title")
    item_id = item.get("id")
    if kind == "artifact":
        url = item.get("fileViewUrl")
        print(f"ok workspace_item id={item_id} title={title!r} preview={url}")
    elif kind == "link":
        print(f"ok workspace_item id={item_id} title={title!r} url={item.get('url')}")
    else:
        print(f"ok workspace_item id={item_id} title={title!r}")


# ── API wrappers ──────────────────────────────────────────────────────────

def create_upload_url(filename: str, content_type: str, size_bytes: int) -> dict[str, Any]:
    return _request(
        "POST",
        "/api/workspace/upload-url",
        json_body={
            "filename": filename,
            "contentType": content_type,
            "sizeBytes": size_bytes,
        },
    )


def create_item(payload: dict[str, Any]) -> dict[str, Any]:
    return _request("POST", "/api/workspace/items", json_body=payload)


def list_items(params: Optional[dict[str, str]] = None) -> dict[str, Any]:
    from urllib.parse import urlencode

    qs = f"?{urlencode(params)}" if params else ""
    return _request("GET", f"/api/workspace/items{qs}")


def update_item(item_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    return _request("PATCH", f"/api/workspace/items/{item_id}", json_body=patch)


def create_share(
    item_id: str,
    expiry: str = "7d",
    locale: str = "en",
) -> dict[str, Any]:
    """Create a public share link for an item the agent owns.

    The server restricts agent-created shares to `scope='public'` and to
    items the bearer key was issued for. Returns the API payload
    `{share, url, emailsSent}`.
    """
    return _request(
        "POST",
        f"/api/workspace/items/{item_id}/shares",
        json_body={"scope": "public", "expiry": expiry, "locale": locale},
    )


# ── Memory API wrappers ─────────────────────────────────────────────────
#
# The memory routes are dual-mode: same endpoints serve the dashboard UI
# and the agent skill. When called with our `ws_*` bearer the server
# defaults `visibility=agent_private` and `source=agent_explicit` — to
# write into the cross-agent shared library, pass `visibility="shared"`.


def memory_save(
    *,
    title: str,
    body: str,
    visibility: Optional[str] = None,
    key: Optional[str] = None,
    tags: Optional[list[str]] = None,
    pinned: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"title": title, "body": body}
    if visibility:
        payload["visibility"] = visibility
    if key:
        payload["key"] = key
    if tags:
        payload["tags"] = tags
    if pinned:
        payload["pinned"] = True
    return _request("POST", "/api/memories", json_body=payload)


def memory_list(params: Optional[dict[str, str]] = None) -> dict[str, Any]:
    from urllib.parse import urlencode

    qs = f"?{urlencode(params)}" if params else ""
    return _request("GET", f"/api/memories{qs}")


def memory_search(q: str, limit: Optional[int] = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"q": q}
    if limit is not None:
        payload["limit"] = limit
    return _request("POST", "/api/memories/search", json_body=payload)


def memory_delete(memory_id: str) -> dict[str, Any]:
    return _request("DELETE", f"/api/memories/{memory_id}")


def memory_pinned() -> dict[str, Any]:
    return _request("GET", "/api/memories/pinned")


# ── Agent self-evolution wrappers ──────────────────────────────────────


def fetch_agent_category_slugs() -> list[str]:
    """List valid agent_template category slugs from the public catalog.

    The endpoint is unauthenticated and tiny (≤ ~20 rows). Used by the
    package script as a pre-flight check: fail before uploading if the
    agent's manifest category isn't in this set, since the server-side
    validator rejects the upload otherwise. On any error we return an
    empty list — the caller treats that as "skip pre-flight" so a
    flaky check never blocks a valid publish.
    """
    try:
        data = _request("GET", "/api/talenthub/categories", timeout=10.0)
    except SystemExit:
        return []
    raw = data.get("categories") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return []
    slugs: list[str] = []
    for row in raw:
        if isinstance(row, dict):
            slug = row.get("slug")
            if isinstance(slug, str) and slug:
                slugs.append(slug)
    return slugs


def workspace_register_agent(
    *,
    item_id: str,
    file_key: str,
    title: str,
    size_bytes: int,
) -> dict[str, Any]:
    """Register an uploaded agent zip as a kind='agent' workspace item.

    The server runs the structural validator (manifest schema, size
    caps, blacklist) on the bytes already at rest in S3. On failure
    the underlying `_request` helper prints the error JSON to stderr
    and exits 1; this function only returns on success.
    """
    return _request(
        "POST",
        "/api/workspace/items",
        json_body={
            "kind": "agent",
            "itemId": item_id,
            "fileKey": file_key,
            "title": title,
            "mimeType": "application/zip",
            "sizeBytes": size_bytes,
        },
    )
