#!/usr/bin/env python3
"""Build Firebase Hosting frontend files without local data or credentials."""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
FILES = [
    "index.html", "admin.html", "landing.html", "style.css", "app.js", "config.js",
    "marketplace.html", "marketplace.js", "partner-portal.html", "partner-portal.js",
    "portal.html", "login_bg.png",
]
DIRECTORIES = ["components", "src", "vendor", "partner-portal"]


def main():
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    PUBLIC.mkdir(parents=True)
    for filename in FILES:
        source = ROOT / filename
        if source.exists():
            shutil.copy2(source, PUBLIC / filename)
    for dirname in DIRECTORIES:
        source = ROOT / dirname
        if source.exists():
            shutil.copytree(source, PUBLIC / dirname)
    # Static frontend/API are served by the same Cloud Run app during this prototype.
    # Firebase Hosting is not a standalone frontend target until Hosting rewrites are provisioned.
    print(f"Prepared Firebase Hosting files in {PUBLIC}")


if __name__ == "__main__":
    main()
