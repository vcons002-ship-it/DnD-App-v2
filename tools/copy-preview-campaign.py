"""Read-only SQLite online backup. Never import the application's DB module.
Creates an independent test copy, not a migration or a new production campaign.
"""
import argparse
import pathlib
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument("source")
parser.add_argument("destination")
args = parser.parse_args()
source = pathlib.Path(args.source).resolve(strict=True)
destination = pathlib.Path(args.destination).resolve()
if source == destination or destination.exists():
    raise SystemExit("Refusing to overwrite an existing database.")
destination.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as live:
    with sqlite3.connect(destination) as preview:
        live.backup(preview)
        result = preview.execute("pragma integrity_check").fetchone()[0]
        if result != "ok":
            raise SystemExit("Backup integrity check failed")
print("Read-only source backup complete; independent copy integrity: ok.")
