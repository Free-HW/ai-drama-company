#!/usr/bin/env python3
"""Save a memory to the user's long-term store.

Defaults to `visibility=agent_private` — only this agent (and the user)
will see the entry back. Pass `--visibility shared` to write to the
cross-agent library; that's how *other* agents the user employs will
find the fact later.

Refuses inputs containing secrets (API keys, private keys, mnemonics,
passwords, ID numbers); the server's filter is the source of truth, but
agents should already avoid capturing those.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import memory_save  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True, help="Short 5–10 word label")
    ap.add_argument("--body", required=True, help="1–2 sentence fact (≤1 KB)")
    ap.add_argument(
        "--visibility",
        choices=["agent_private", "shared"],
        default=None,
        help="Default is agent_private; pass 'shared' only when this fact helps the user's other agents.",
    )
    ap.add_argument(
        "--key",
        default=None,
        help="Optional normalized tag like 'user.tone' or 'customer.<name>'",
    )
    ap.add_argument(
        "--tags",
        action="append",
        default=None,
        help="Optional free-form tag (pass once per tag)",
    )
    ap.add_argument(
        "--pinned",
        action="store_true",
        help="(Reserved) only users may pin memories; agent attempts are rejected by the server.",
    )
    args = ap.parse_args()

    payload = memory_save(
        title=args.title,
        body=args.body,
        visibility=args.visibility,
        key=args.key,
        tags=args.tags,
        pinned=args.pinned,
    )
    mem = payload.get("memory") or {}
    if not mem.get("id"):
        print("error: server did not return a memory id", file=sys.stderr)
        sys.exit(1)
    print(
        f"ok memory id={mem['id']} visibility={mem.get('visibility')} title={mem.get('title')!r}"
    )


if __name__ == "__main__":
    main()
