#!/usr/bin/env python3
"""Register your capabilities for a mode. Drives the chips the user
sees above the composer ("What you want to create" / "What kind of
site"). Call this once per mode when the user asks "what can you
make?" or clicks the Rediscover button — the server upserts on the
four-tuple (user, device, agent, mode), so re-running is safe.

Usage (reads JSON from stdin):
    cat <<EOF | python scripts/capability_register.py --mode creation
    [
      { "type": "image",
        "label": "Logo / wordmark",
        "description": "Clean SVG / PNG logos in your brand palette.",
        "example_prompts": [
          "Design a wordmark for ACME",
          "Tweak the logo with a teal accent"
        ]
      },
      { "type": "video",
        "label": "Short product clip",
        "description": "30–60s explainer / hero clips.",
        "example_prompts": ["Make a 30s hero clip for our homepage"]
      }
    ]
    EOF

Up to 8 entries per mode; each entry's `type` must be valid for the
mode (vibe_code only for code mode; the four media types only for
creation mode).
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import register_capabilities  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["creation", "code"])
    ap.add_argument(
        "--file",
        default=None,
        help="Path to a JSON file with the capability array. Defaults to stdin.",
    )
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    raw: str
    if args.file:
        path = Path(args.file).expanduser().resolve()
        if not path.is_file():
            print(f"error: file not found: {path}", file=sys.stderr)
            sys.exit(2)
        raw = path.read_text(encoding="utf-8")
    else:
        if sys.stdin.isatty():
            print(
                "error: pass --file or pipe JSON on stdin",
                file=sys.stderr,
            )
            sys.exit(2)
        raw = sys.stdin.read()

    try:
        capabilities = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON: {e}", file=sys.stderr)
        sys.exit(2)

    if not isinstance(capabilities, list):
        print("error: top-level value must be a JSON array", file=sys.stderr)
        sys.exit(2)

    result = register_capabilities(mode=args.mode, capabilities=capabilities)

    if args.json:
        print(json.dumps(result, indent=2))
        return

    saved = result.get("capabilities", {})
    print(
        f"ok capabilities mode={saved.get('mode')} "
        f"count={len(saved.get('capabilities', []))}"
    )


if __name__ == "__main__":
    main()
