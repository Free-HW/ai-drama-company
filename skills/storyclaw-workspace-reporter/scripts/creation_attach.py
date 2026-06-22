#!/usr/bin/env python3
"""Upload an output file as an artifact attached to a creation.

Mints a presigned S3 PUT URL from the server, uploads the bytes
directly to S3, and records a row in creation_artifacts. Use this for
the *deliverable* (image / video / audio / file) of a media-type
creation; vibe_code source uploads have their own dedicated tool
(Phase 3).

Usage:
    python scripts/creation_attach.py \\
        --id <creation_id> \\
        --file /path/to/output.png \\
        --label "logo v3 hero"

Optional: `--mime image/png` (auto-detected otherwise).
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from creation_client import attach_artifact  # noqa: E402
from workspace_client import guess_mime, upload_file_to_s3  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, dest="creation_id")
    ap.add_argument("--file", required=True, dest="file_path")
    ap.add_argument("--mime", default=None)
    ap.add_argument("--label", default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    path = Path(args.file_path).expanduser().resolve()
    if not path.is_file():
        print(f"error: file not found: {path}", file=sys.stderr)
        sys.exit(2)

    size = path.stat().st_size
    if size == 0:
        print("error: file is empty", file=sys.stderr)
        sys.exit(2)
    mime = guess_mime(path, args.mime)

    setup = attach_artifact(
        args.creation_id,
        filename=path.name,
        mime_type=mime,
        byte_size=size,
        label=args.label,
    )
    upload_url = setup.get("uploadUrl")
    if not upload_url:
        print("error: server did not return uploadUrl", file=sys.stderr)
        sys.exit(1)

    upload_file_to_s3(upload_url, path, mime)

    if args.json:
        print(json.dumps(setup, indent=2))
        return

    artifact = setup.get("artifact", {})
    print(
        f"ok artifact id={artifact.get('id')} "
        f"creation={artifact.get('creationId')} "
        f"mime={artifact.get('mimeType')} "
        f"bytes={artifact.get('byteSize')}"
    )


if __name__ == "__main__":
    main()
