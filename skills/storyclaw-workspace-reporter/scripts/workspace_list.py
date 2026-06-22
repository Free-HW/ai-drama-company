#!/usr/bin/env python3
"""List the current agent's workspace items."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import list_items  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--kind", choices=["artifact", "link"], default=None)
    ap.add_argument("--q", default=None, help="Text search across title/description")
    ap.add_argument("--json", action="store_true", help="Emit raw JSON instead of a human summary")
    args = ap.parse_args()

    params: dict[str, str] = {"limit": str(args.limit)}
    if args.kind:
        params["kind"] = args.kind
    if args.q:
        params["q"] = args.q

    data = list_items(params)

    if args.json:
        print(json.dumps(data, indent=2))
        return

    items = data.get("items", [])
    total = data.get("total", len(items))
    print(f"{len(items)} of {total} items")
    for it in items:
        kind = it.get("kind", "?")
        title = it.get("title", "")
        item_id = it.get("id", "")
        detail = it.get("fileViewUrl") if kind == "artifact" else it.get("url")
        print(f"  [{kind}] {title}  ({item_id})")
        if detail:
            print(f"         {detail}")


if __name__ == "__main__":
    main()
