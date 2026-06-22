#!/usr/bin/env python3
"""Read a creation row by id. Use this at the start of any turn that
continues a prior creation — never rebuild context from chat history
alone (plan §askQuestion 行为 hard rule).

Usage:
    python scripts/creation_get.py --id <creation_id>
    python scripts/creation_get.py --id <creation_id> --json
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import get_creation  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, dest="creation_id")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    result = get_creation(args.creation_id)

    if args.json:
        print(json.dumps(result, indent=2))
        return

    creation = result.get("creation", {})
    print(
        f"ok creation id={creation.get('id')} "
        f"mode={creation.get('mode')} "
        f"type={creation.get('type')} "
        f"status={creation.get('status')} "
        f"title={creation.get('title')!r}"
    )
    sm = creation.get("statusMessage")
    if sm:
        print(f"   message: {sm}")


if __name__ == "__main__":
    main()
