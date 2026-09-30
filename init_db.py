import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "training.db"

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exercise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS workout_template (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS template_exercise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES workout_template(id),
    exercise_id INTEGER NOT NULL REFERENCES exercise(id),
    position INTEGER NOT NULL,
    target_sets INTEGER NOT NULL,
    target_reps_min INTEGER NOT NULL,
    target_reps_max INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES workout_template(id),
    performed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS session_exercise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES workout_session(id),
    exercise_id INTEGER NOT NULL REFERENCES exercise(id),
    comment TEXT
);

CREATE TABLE IF NOT EXISTS exercise_set (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_exercise_id INTEGER NOT NULL REFERENCES session_exercise(id),
    set_number INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weight_kg REAL NOT NULL
);
"""

# Name, Sätze, Wiederholungen min, Wiederholungen max
PLAENE = {
    "Tag A": [
        ("Squats", 5, 5, 5),
        ("Kreuzheben", 3, 5, 5),
        ("Klimmzug eng", 4, 6, 8),
        ("Schrägbank", 4, 6, 8),
        ("LG Rudern Obergriff", 3, 8, 12),
        ("Trizeps Stange", 3, 8, 12),
        ("Bizeps Curls", 2, 8, 12),
    ],
    "Tag B": [
        # ("Übungsname", Sätze, Wdh min, Wdh max),
        ("Squats", 5, 5, 5),
        ("Bank drücken", 5, 5, 5),
        ("LH Rudern Untergriff", 5, 5, 5),
        ("Schulter drücken LH stehend", 3, 8, 12),
        ("Bizeps Curls SZ Stange", 3, 8, 12),
        ("Trizeps am Seil", 2, 8, 12)
    ],
}


def seed_template(conn, template_name, exercises):
    if not exercises:
        return
    exists = conn.execute(
        "SELECT id FROM workout_template WHERE name = ?", (template_name,)
    ).fetchone()
    if exists:
        return

    template_id = conn.execute(
        "INSERT INTO workout_template (name) VALUES (?)", (template_name,)
    ).lastrowid

    for position, (name, sets, rmin, rmax) in enumerate(exercises, start=1):
        conn.execute("INSERT OR IGNORE INTO exercise (name) VALUES (?)", (name,))
        exercise_id = conn.execute(
            "SELECT id FROM exercise WHERE name = ?", (name,)
        ).fetchone()[0]
        conn.execute(
            """INSERT INTO template_exercise
               (template_id, exercise_id, position,
                target_sets, target_reps_min, target_reps_max)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (template_id, exercise_id, position, sets, rmin, rmax),
        )


def main():
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)
        for template_name, exercises in PLAENE.items():
            seed_template(conn, template_name, exercises)

        for template_name in PLAENE:
            rows = conn.execute(
                """SELECT te.position, e.name, te.target_sets,
                          te.target_reps_min, te.target_reps_max
                   FROM template_exercise te
                   JOIN exercise e ON e.id = te.exercise_id
                   JOIN workout_template t ON t.id = te.template_id
                   WHERE t.name = ?
                   ORDER BY te.position""",
                (template_name,),
            ).fetchall()
            if rows:
                print(f"{template_name}:")
            for pos, name, sets, rmin, rmax in rows:
                reps = str(rmin) if rmin == rmax else f"{rmin}-{rmax}"
                print(f"  {pos}. {name}: {sets}x{reps}")


if __name__ == "__main__":
    main()