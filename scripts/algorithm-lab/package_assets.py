"""Manifest and package the finished Algorithm Lab submission images."""

import hashlib
import json
from pathlib import Path
import struct
import zipfile


ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "assets/submission/algorithm-lab-2026-09-19"
OUTPUT = ROOT / "output/railplan-algorithm-lab-devpost.zip"


def image_dimensions(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        position = 2
        while position < len(data):
            if data[position] != 255:
                raise ValueError("Invalid JPEG marker")
            marker = data[position + 1]
            size = int.from_bytes(data[position + 2 : position + 4], "big")
            if marker in (0xC0, 0xC1, 0xC2):
                height, width = struct.unpack(">HH", data[position + 5 : position + 9])
                return width, height
            position += size + 2
        raise ValueError("JPEG dimensions missing")
    return None


def main():
    files = sorted(
        path
        for path in PACK.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    )
    entries = []
    for path in files:
        if path.is_symlink():
            raise ValueError(f"Do not package symlinks: {path}")
        data = path.read_bytes()
        if len(data) > 2_000 * 1024:
            raise ValueError(f"File exceeds repository upload cap: {path}")
        entry = {
            "file": path.relative_to(PACK).as_posix(),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        dimensions = image_dimensions(data)
        if dimensions:
            entry["width"], entry["height"] = dimensions
        entries.append(entry)
    manifest = PACK / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "captureOrigin": "local preview",
                "cloudDeploymentVerified": False,
                "files": entries,
            },
            indent=2,
        )
        + "\n"
    )
    OUTPUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in [*files, manifest]:
            archive.write(path, Path("railplan-algorithm-lab") / path.relative_to(PACK))
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None
    print(
        json.dumps(
            {
                "archive": str(OUTPUT),
                "files": len(files) + 1,
                "bytes": OUTPUT.stat().st_size,
            }
        )
    )


if __name__ == "__main__":
    main()
