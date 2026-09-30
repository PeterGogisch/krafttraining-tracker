import json
import sqlite3
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "training.db"
CONFIG_PATH = BASE_DIR / "config_local.json"  # lokal, wird nicht versioniert

KEEP_LAST = 30  # so viele Tages-Sicherungen bleiben erhalten


def get_backup_dir():
    """Zielordner aus config_local.json, sonst der Ordner 'backups' im Projekt."""
    if CONFIG_PATH.exists():
        try:
            config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if config.get("backup_dir"):
                return Path(config["backup_dir"]).expanduser()
        except (OSError, ValueError):
            pass  # kaputte Konfiguration: auf den Standardordner ausweichen
    return BASE_DIR / "backups"


def backup_database():
    """Legt eine Sicherung pro Tag an (überschreibt die vom selben Tag)
    und löscht die ältesten, wenn es mehr als KEEP_LAST gibt."""
    if not DB_PATH.exists():
        return None

    backup_dir = get_backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"training_{date.today().isoformat()}.db"

    source = sqlite3.connect(DB_PATH)
    dest = sqlite3.connect(target)
    source.backup(dest)
    dest.close()
    source.close()

    for old in sorted(backup_dir.glob("training_*.db"))[:-KEEP_LAST]:
        old.unlink()

    return target


if __name__ == "__main__":
    result = backup_database()
    print(f"Sicherung erstellt: {result}" if result else "Keine Datenbank gefunden.")