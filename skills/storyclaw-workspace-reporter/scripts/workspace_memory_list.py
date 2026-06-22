#!/usr/bin/env python3
"""List memories visible to this agent.

The server scopes the response automatically:
  - shared rows from any agent in the user's library
  - this agent's own agent_private rows

Other agents' private rows are not visible from this scope.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import memory_list  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument(
        "--visibility",
        choices=["shared", "agent_private"],
        default=None,
        help="Filter to one visibility (default: both)",
    )
    ap.add_argument("--pinned", action="store_true", help="Only ★ pinned memories")
    ap.add_argument("--q", default=None, help="Keyword search across title/body")
    ap.add_argument("--json", action="store_true", help="Emit raw JSON instead of a human summary")
    args = ap.parse_args()

    params: dict[str, str] = {"limit": str(args.limit)}
    if args.visibility:
        params["visibility"] = args.visibility
    if args.pinned:
        params["pinned"] = "true"
    if args.q:
        params["q"] = args.q

    data = memory_list(params)
    if args.json:
        print(json.dumps(data, indent=2))
        return

    memories = data.get("memories", [])
    total = data.get("total", len(memories))
    print(f"{len(memories)} of {total} memories")
    for m in memories:
        star = "★ " if m.get("pinned") else "  "
        vis = m.get("visibility", "?")
        title = m.get("title", "")
        mid = m.get("id", "")
        body = (m.get("body") or "").replace("\n", " ")
        if len(body) > 80:
            body = body[:77] + "..."
        print(f"{star}[{vis}] {title}  ({mid})")
        if body:
            print(f"        {body}")


if __name__ == "__main__":
    main()
