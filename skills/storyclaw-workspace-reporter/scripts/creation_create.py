#!/usr/bin/env python3
"""Create a new creation row. Returns the creation id on stdout.

Usage:
    python scripts/creation_create.py \\
        --mode creation \\
        --type image \\
        --title "Logo exploration v3"

    python scripts/creation_create.py \\
        --mode code \\
        --type vibe_code \\
        --title "Stripe landing for ACME" \\
        --metadata '{"hint": "single-page"}'

`--mode` must match `--type`: vibe_code only for mode=code; the four
media types only for mode=creation. Mirrors the DB CHECK constraint.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import create_creation  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["creation", "code"])
    ap.add_argument(
        "--type",
        required=True,
        choices=["image", "video", "audio", "file", "vibe_code"],
        dest="artifact_type",
    )
    ap.add_argument("--title", required=True)
    ap.add_argument("--source-message-id", default=None)
    ap.add_argument(
        "--metadata",
        default=None,
        help="JSON object stringified. Merged into creations.metadata.",
    )
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    metadata = None
    if args.metadata:
        try:
            metadata = json.loads(args.metadata)
        except json.JSONDecodeError as e:
            print(f"error: --metadata is not valid JSON: {e}", file=sys.stderr)
            sys.exit(2)
        if not isinstance(metadata, dict):
            print("error: --metadata must be a JSON object", file=sys.stderr)
            sys.exit(2)

    result = create_creation(
        mode=args.mode,
        artifact_type=args.artifact_type,
        title=args.title,
        source_message_id=args.source_message_id,
        metadata=metadata,
    )

    if args.json:
        print(json.dumps(result, indent=2))
        return

    creation = result.get("creation", {})
    print(
        f"ok creation id={creation.get('id')} "
        f"mode={creation.get('mode')} "
        f"type={creation.get('type')} "
        f"status={creation.get('status')}"
    )


if __name__ == "__main__":
    main()
