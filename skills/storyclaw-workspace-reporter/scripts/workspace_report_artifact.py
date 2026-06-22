#!/usr/bin/env python3
"""Register a local file as a private workspace artifact."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from workspace_client import (  # noqa: E402
    create_item,
    create_upload_url,
    guess_mime,
    print_result_summary,
    upload_file_to_s3,
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="Path to the local file")
    ap.add_argument("--title", required=True)
    ap.add_argument("--description", default=None)
    ap.add_argument("--output-process", dest="output_process", default=None)
    ap.add_argument("--mime", default=None, help="Override mime type (else auto)")
    ap.add_argument("--tags", action="append", default=[])
    args = ap.parse_args()

    path = Path(args.file).expanduser().resolve()
    if not path.is_file():
        print(f"error: {path} is not a file", file=sys.stderr)
        sys.exit(1)

    size_bytes = path.stat().st_size
    content_type = guess_mime(path, args.mime)

    # 1. Get presigned URL + item id
    presign = create_upload_url(
        filename=path.name,
        content_type=content_type,
        size_bytes=size_bytes,
    )
    upload_url = presign["uploadUrl"]
    file_key = presign["fileKey"]
    item_id = presign["itemId"]

    # 2. Upload bytes to S3
    upload_file_to_s3(upload_url, path, content_type)

    # 3. Register the item
    item = create_item({
        "kind": "artifact",
        "itemId": item_id,
        "fileKey": file_key,
        "title": args.title,
        "description": args.description,
        "outputProcess": args.output_process,
        "tags": args.tags,
        "mimeType": content_type,
        "sizeBytes": size_bytes,
    })
    print_result_summary(item)


if __name__ == "__main__":
    main()
