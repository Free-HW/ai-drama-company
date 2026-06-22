#!/usr/bin/env python3
"""Create a public share link for a workspace item.

Agent-created shares are limited to `scope='public'` (anyone-with-the-link).
The item must have been registered by this same agent via
`workspace_report_artifact.py` — the server checks the bearer key's
(deviceId, agentId) matches the item's.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import create_share  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--item-id", required=True, help="Workspace item id from workspace_report_artifact")
    ap.add_argument(
        "--expiry",
        default="7d",
        choices=["1d", "7d", "30d", "never"],
        help="When the link stops working (default: 7d)",
    )
    ap.add_argument(
        "--locale",
        default="en",
        help="Locale hint for the share URL host (default: en)",
    )
    args = ap.parse_args()

    payload = create_share(
        item_id=args.item_id,
        expiry=args.expiry,
        locale=args.locale,
    )
    url = payload.get("url") or ""
    share = payload.get("share") or {}
    if not url:
        print("error: server did not return a share url", file=sys.stderr)
        sys.exit(1)
    # Match the line shape used by other tools in this skill so the LLM
    # can grep for `ok share_url=...` in its tool output.
    print(
        f"ok share_url={url} token={share.get('token')} expires={share.get('expiresAt') or 'never'}"
    )


if __name__ == "__main__":
    main()
