"""Build the extension ZIP from tracked runtime files; no credentials or test data."""
from pathlib import Path
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["version"]
tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
allowed = {"manifest.json", "README.md", "DEVELOPMENT.md", "LICENSE", "CHANGELOG.md"}
files = sorted(p for p in tracked if p and (p in allowed or ("/" not in p and p.endswith(".html")) or p.startswith(("src/", "icons/"))))
assert "manifest.json" in files
out = root / "dist" / f"jira-board-plus-{version}.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (root / name).read_bytes())
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
print(out)
