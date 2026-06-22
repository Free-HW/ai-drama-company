#!/usr/bin/env python3
"""Semantic search over the user's memory store.

Call this near the start of a task to pull in any relevant facts the
user (or other agents) have left behind. Pinned ★ memories always rank
first; non-pinned rows follow by cosine similarity to the query.

If the embedding provider is down, the server silently degrades to a
keyword (ILIKE) search and sets `degraded: true` in the response.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import memory_search  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--q", required=True, help="Natural-language query")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--json", action="store_true", help="Emit raw JSON instead of a human summary")
    args = ap.parse_args()

    data = memory_search(args.q, limit=args.limit)
    if args.json:
        print(json.dumps(data, indent=2))
        return

    memories = data.get("memories", [])
    if data.get("degraded"):
        print(f"({len(memories)} memories, keyword fallback — embeddings unavailable)")
    else:
        print(f"({len(memories)} memories)")
    for m in memories:
        star = "★ " if m.get("pinned") else "  "
        vis = m.get("visibility", "?")
        title = m.get("title", "")
        mid = m.get("id", "")
        sim = m.get("similarity")
        sim_s = f" sim={sim:.2f}" if isinstance(sim, (int, float)) else ""
        body = (m.get("body") or "").replace("\n", " ")
        if len(body) > 80:
            body = body[:77] + "..."
        print(f"{star}[{vis}]{sim_s} {title}  ({mid})")
        if body:
            print(f"        {body}")


if __name__ == "__main__":
    main()
