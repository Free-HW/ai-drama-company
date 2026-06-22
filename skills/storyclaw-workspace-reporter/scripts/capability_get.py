#!/usr/bin/env python3
"""Read your currently-registered capability list for a mode.

Use this on the SC_CAPS_CHECK_V1 mode-enter trigger to decide whether
to re-register: compare the returned `capabilities` array against what
you can actually do right now. If it matches, do nothing; if it
doesn't, call `capability_register` with the corrected set.

Usage:
    python scripts/capability_get.py --mode creation
    python scripts/capability_get.py --mode code --json

The response body is `{ "capabilities": null }` when no row exists for
this (user, device, agent, mode), or `{ "capabilities": { mode,
capabilities: [...], updatedAt, ... } }` otherwise.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import get_capabilities  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["creation", "code"])
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    result = get_capabilities(args.mode)

    if args.json:
        print(json.dumps(result, indent=2))
        return

    payload = result.get("capabilities")
    if not payload:
        print(f"ok capabilities mode={args.mode} count=0 (no row registered yet)")
        return

    entries = payload.get("capabilities") or []
    print(f"ok capabilities mode={args.mode} count={len(entries)}")
    for e in entries:
        prompts = e.get("example_prompts") or []
        print(f"  - {e.get('type')} / {e.get('label')}")
        if e.get("description"):
            print(f"      {e.get('description')}")
        if prompts:
            print(f"      examples: {', '.join(prompts[:2])}")


if __name__ == "__main__":
    main()
