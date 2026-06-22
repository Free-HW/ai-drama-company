#!/usr/bin/env python3
"""Patch an existing creation. Use it to push status/progress/message
updates as you work — the Preview Card subscribes via Realtime and
reflects each call live.

Usage:
    python scripts/creation_update.py --id <creation_id> --status running
    python scripts/creation_update.py --id <id> --progress 45 \\
        --message "stylizing colours"
    python scripts/creation_update.py --id <id> --status done

Status transitions are validated server-side against the legal-moves
table (see plan §askQuestion 行为). Terminal states (done / failed /
cancelled) are sticky.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import patch_creation  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, dest="creation_id")
    ap.add_argument(
        "--status",
        choices=[
            "running",
            "awaiting_answer",
            "done",
            "failed",
            "cancelled",
            "stalled",
        ],
        default=None,
    )
    ap.add_argument("--progress", type=int, default=None, help="0–100 integer")
    ap.add_argument("--message", default=None, dest="status_message")
    ap.add_argument("--title", default=None)
    ap.add_argument(
        "--metadata",
        default=None,
        help="JSON object stringified; shallow-merged into existing metadata",
    )
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    fields: dict[str, object] = {}
    if args.status is not None:
        fields["status"] = args.status
    if args.progress is not None:
        fields["progressPercent"] = args.progress
    if args.status_message is not None:
        fields["statusMessage"] = args.status_message
    if args.title is not None:
        fields["title"] = args.title
    if args.metadata is not None:
        try:
            md = json.loads(args.metadata)
        except json.JSONDecodeError as e:
            print(f"error: --metadata is not valid JSON: {e}", file=sys.stderr)
            sys.exit(2)
        if not isinstance(md, dict):
            print("error: --metadata must be a JSON object", file=sys.stderr)
            sys.exit(2)
        fields["metadata"] = md

    if not fields:
        print("error: nothing to update — pass at least one field", file=sys.stderr)
        sys.exit(2)

    result = patch_creation(args.creation_id, **fields)

    if args.json:
        print(json.dumps(result, indent=2))
        return

    creation = result.get("creation", {})
    print(
        f"ok updated id={creation.get('id')} "
        f"status={creation.get('status')} "
        f"progress={creation.get('progressPercent')}"
    )


if __name__ == "__main__":
    main()
