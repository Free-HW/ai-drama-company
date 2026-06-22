#!/usr/bin/env python3
"""Update title / description / tags on a workspace item you created."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import print_result_summary, update_item  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, dest="item_id")
    ap.add_argument("--title", default=None)
    ap.add_argument("--description", default=None)
    ap.add_argument("--output-process", dest="output_process", default=None)
    ap.add_argument("--tags", action="append", default=None, help="Replace tags; pass once per tag")
    args = ap.parse_args()

    patch: dict[str, object] = {}
    if args.title is not None:
        patch["title"] = args.title
    if args.description is not None:
        patch["description"] = args.description
    if args.output_process is not None:
        patch["outputProcess"] = args.output_process
    if args.tags is not None:
        patch["tags"] = args.tags

    if not patch:
        print("error: nothing to update (pass --title / --description / --output-process / --tags)", file=sys.stderr)
        sys.exit(1)

    item = update_item(args.item_id, patch)
    print_result_summary(item)


if __name__ == "__main__":
    main()
