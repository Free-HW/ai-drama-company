#!/usr/bin/env python3
"""Soft-delete a memory you wrote.

Agents can only delete memories *they* authored. Rows written by the
user or by another agent are read-only from this scope — ask the user
to delete those from the workspace drawer instead.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import memory_delete  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, dest="memory_id")
    args = ap.parse_args()

    memory_delete(args.memory_id)
    print(f"ok memory deleted id={args.memory_id}")


if __name__ == "__main__":
    main()
