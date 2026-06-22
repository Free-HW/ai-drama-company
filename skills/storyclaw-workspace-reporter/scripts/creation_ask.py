#!/usr/bin/env python3
"""File an askQuestion turn on a creation. Use when you need a user
decision before you can keep working — the chat renders the question
inline (ai-elements/question) and the parent creation flips to
`awaiting_answer`. **End your turn after calling this.** The next turn
will come back with the answer; call `creation_get` first to read it.

Usage:
    python scripts/creation_ask.py \\
        --id <creation_id> \\
        --question "Which mood should the fox have?" \\
        --option sleepy:"Sleepy and curled up" \\
        --option alert:"Alert, ears forward" \\
        --option playful:"Playful, mid-pounce" \\
        --allow-other --allow-custom-text

`--option` is `value:label` (value is what comes back; label is what
the user reads). Repeat for each option.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import ask_question  # noqa: E402


def parse_option(raw: str) -> dict[str, str]:
    if ":" not in raw:
        raise argparse.ArgumentTypeError(
            f"option {raw!r} must be in 'value:label' form"
        )
    value, label = raw.split(":", 1)
    if not value.strip() or not label.strip():
        raise argparse.ArgumentTypeError(
            f"option {raw!r} has an empty value or label"
        )
    return {"value": value.strip(), "label": label.strip()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, dest="creation_id")
    ap.add_argument("--question", required=True)
    ap.add_argument(
        "--option",
        action="append",
        type=parse_option,
        default=[],
        help="value:label pair. Pass multiple --option flags.",
    )
    ap.add_argument("--allow-other", action="store_true")
    ap.add_argument("--allow-custom-text", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not args.option:
        print(
            "error: at least one --option is required",
            file=sys.stderr,
        )
        sys.exit(2)

    result = ask_question(
        args.creation_id,
        question=args.question,
        options=args.option,
        allow_other=args.allow_other,
        allow_custom_text=args.allow_custom_text,
    )

    if args.json:
        print(json.dumps(result, indent=2))
        return

    q = result.get("question", {})
    print(
        f"ok question id={q.get('id')} "
        f"creation={q.get('creationId')} "
        f"options={len(q.get('options', []))}"
    )
    print("   end your turn — the answer arrives on the next user message")


if __name__ == "__main__":
    main()
