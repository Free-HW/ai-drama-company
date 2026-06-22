"""Creation-mode API wrappers, reusing workspace_client's HTTP + .auth
machinery so a single `.auth` token covers every endpoint this skill
calls (per plan v2.7 §技能工具集 → "扩 workspace-reporter").

Stdlib only — same constraint as workspace_client. Imports the
underscored `_request` helper from workspace_client by design;
they are sibling modules in the same skill package, not a public
API boundary.
"""

from typing import Any, Optional
from urllib.parse import urlencode

# Re-uses the same auth token, base URL resolution, UA string, and
# error formatting as the workspace tools.
from workspace_client import _request as _http  # type: ignore[attr-defined]


def create_creation(
    *,
    mode: str,
    artifact_type: str,
    title: str,
    source_message_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "mode": mode,
        "type": artifact_type,
        "title": title,
    }
    if source_message_id:
        body["sourceMessageId"] = source_message_id
    if metadata:
        body["metadata"] = metadata
    return _http("POST", "/api/creations", json_body=body)


def patch_creation(creation_id: str, **fields: Any) -> dict[str, Any]:
    # Drop None entries so callers can pass kwargs unconditionally
    # without explicitly clearing fields.
    cleaned = {k: v for k, v in fields.items() if v is not None}
    return _http("PATCH", f"/api/creations/{creation_id}", json_body=cleaned)


def get_creation(creation_id: str) -> dict[str, Any]:
    return _http("GET", f"/api/creations/{creation_id}")


def list_creations(params: Optional[dict[str, str]] = None) -> dict[str, Any]:
    qs = f"?{urlencode(params)}" if params else ""
    return _http("GET", f"/api/creations{qs}")


def delete_creation(creation_id: str) -> dict[str, Any]:
    return _http("DELETE", f"/api/creations/{creation_id}")


def attach_artifact(
    creation_id: str,
    *,
    filename: str,
    mime_type: str,
    byte_size: int,
    label: Optional[str] = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "filename": filename,
        "mimeType": mime_type,
        "byteSize": byte_size,
    }
    if label:
        body["label"] = label
    return _http(
        "POST",
        f"/api/creations/{creation_id}/artifacts",
        json_body=body,
    )


def ask_question(
    creation_id: str,
    *,
    question: str,
    options: list[dict[str, str]],
    allow_other: bool = False,
    allow_custom_text: bool = False,
) -> dict[str, Any]:
    return _http(
        "POST",
        f"/api/creations/{creation_id}/questions",
        json_body={
            "question": question,
            "options": options,
            "allowOther": allow_other,
            "allowCustomText": allow_custom_text,
        },
    )


def register_capabilities(
    *,
    mode: str,
    capabilities: list[dict[str, Any]],
) -> dict[str, Any]:
    return _http(
        "POST",
        "/api/capabilities",
        json_body={"mode": mode, "capabilities": capabilities},
    )


def get_capabilities(mode: str) -> dict[str, Any]:
    """Read the agent's currently-registered capability list for the
    given mode. Server is the source of truth; this exists so the
    agent can diff its real-time abilities against what was previously
    registered (called from the SC_CAPS_CHECK_V1 mode-enter trigger)."""
    return _http("GET", f"/api/capabilities?mode={mode}")
