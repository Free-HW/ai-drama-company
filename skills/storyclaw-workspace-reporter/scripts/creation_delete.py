#!/usr/bin/env python3
"""Delete a creation row (and cascade artifacts / progress / questions).

Server policy: delete is user-scope only — agents can't wipe history
even on their own rows. If you call this from a skill-bearer context
the server returns 403; the right move there is `creation_update`
with `--status cancelled` instead.

Usage:
    python scripts/creation_delete.py --id <creation_id>
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import delete_creation  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, dest="creation_id")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    result = delete_creation(args.creation_id)

    if args.json:
        print(json.dumps(result, indent=2))
        return

    print(f"ok deleted id={args.creation_id}")


if __name__ == "__main__":
    main()
