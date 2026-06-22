#!/usr/bin/env python3
"""List your own creations (auto-scoped to this agent + device).

Usage:
    python scripts/creation_list.py
    python scripts/creation_list.py --mode creation
    python scripts/creation_list.py --mode code --status running
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import list_creations  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["creation", "code"], default=None)
    ap.add_argument(
        "--status",
        choices=[
            "pending",
            "running",
            "awaiting_answer",
            "done",
            "failed",
            "cancelled",
            "stalled",
        ],
        default=None,
    )
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    params: dict[str, str] = {"limit": str(args.limit), "offset": str(args.offset)}
    if args.mode:
        params["mode"] = args.mode
    if args.status:
        params["status"] = args.status

    data = list_creations(params)

    if args.json:
        print(json.dumps(data, indent=2))
        return

    items = data.get("items", [])
    total = data.get("total", len(items))
    print(f"{len(items)} of {total} creations")
    for it in items:
        print(
            f"  [{it.get('mode')}/{it.get('type')}] "
            f"{it.get('title')}  "
            f"({it.get('id')}) — {it.get('status')}"
        )


if __name__ == "__main__":
    main()
