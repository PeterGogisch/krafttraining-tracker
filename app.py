import sqlite3
from pathlib import Path

import streamlit as st
from backup import backup_database

DB_PATH = Path(__file__).parent / "training.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def load_template_names(conn):
    return [
        r[0]
        for r in conn.execute("SELECT name FROM workout_template ORDER BY name")
    ]


def load_template(conn, template_name):
    return conn.execute(
        """SELECT te.exercise_id, e.name, te.target_sets,
                  te.target_reps_min, te.target_reps_max
           FROM template_exercise te
           JOIN exercise e ON e.id = te.exercise_id
           JOIN workout_template t ON t.id = te.template_id
           WHERE t.name = ?
           ORDER BY te.position""",
        (template_name,),
    ).fetchall()


def load_last(conn, template_name, exercise_id):
    """Sätze und Kommentar vom letzten Training dieses Tages für diese Übung."""
    row = conn.execute(
        """SELECT se.id, se.comment, ws.performed_at
           FROM session_exercise se
           JOIN workout_session ws ON ws.id = se.session_id
           JOIN workout_template t ON t.id = ws.template_id
           WHERE t.name = ? AND se.exercise_id = ?
           ORDER BY ws.performed_at DESC, ws.id DESC
           LIMIT 1""",
        (template_name, exercise_id),
    ).fetchone()
    if row is None:
        return None
    sets = conn.execute(
        """SELECT set_number, reps, weight_kg
           FROM exercise_set
           WHERE session_exercise_id = ?
           ORDER BY set_number""",
        (row[0],),
    ).fetchall()
    return {"comment": row[1], "date": row[2], "sets": sets}


def save_session(conn, template_name, exercises):
    template_id = conn.execute(
        "SELECT id FROM workout_template WHERE name = ?", (template_name,)
    ).fetchone()[0]
    session_id = conn.execute(
        "INSERT INTO workout_session (template_id) VALUES (?)", (template_id,)
    ).lastrowid

    for ex_id, _name, n_sets, _rmin, _rmax in exercises:
        sets = []
        for i in range(1, n_sets + 1):
            reps = st.session_state[f"reps_{template_name}_{ex_id}_{i}"]
            weight = st.session_state[f"weight_{template_name}_{ex_id}_{i}"]
            if reps > 0:  # Sätze mit 0 Wiederholungen werden ignoriert
                sets.append((i, reps, weight))
        comment = st.session_state[f"comment_{template_name}_{ex_id}"].strip() or None

        if not sets and not comment:
            continue  # Übung wurde nicht gemacht

        se_id = conn.execute(
            """INSERT INTO session_exercise (session_id, exercise_id, comment)
               VALUES (?, ?, ?)""",
            (session_id, ex_id, comment),
        ).lastrowid
        for set_number, reps, weight in sets:
            conn.execute(
                """INSERT INTO exercise_set
                   (session_exercise_id, set_number, reps, weight_kg)
                   VALUES (?, ?, ?, ?)""",
                (se_id, set_number, reps, weight),
            )
    conn.commit()


def clear_inputs():
    for key in list(st.session_state.keys()):
        if key.startswith(("reps_", "weight_", "comment_")):
            del st.session_state[key]


st.set_page_config(page_title="Krafttraining", page_icon="🏋️")
st.title("🏋️ Krafttraining")

if st.session_state.pop("backup_failed", False):
    st.warning("Training gespeichert, aber die Sicherung ist fehlgeschlagen.")

conn = get_conn()
template_name = st.selectbox("Trainingstag", load_template_names(conn))
exercises = load_template(conn, template_name)

with st.form(f"training_{template_name}"):
    for ex_id, name, n_sets, rmin, rmax in exercises:
        target_reps = str(rmin) if rmin == rmax else f"{rmin}-{rmax}"
        st.subheader(name)
        st.caption(f"Ziel: {n_sets} x {target_reps}")

        last = load_last(conn, template_name, ex_id)
        last_by_set = {}
        if last:
            last_by_set = {s[0]: (s[1], s[2]) for s in last["sets"]}
            volume = sum(r * w for _, r, w in last["sets"])
            lines = [f"Satz {n}: {r} x {w:g} kg" for n, r, w in last["sets"]]
            st.info(
                f"**Letztes Mal ({last['date'][:10]})** – "
                f"Volumen {volume:g} kg\n\n" + "  \n".join(lines)
            )
            if last["comment"]:
                st.warning(f"Kommentar: {last['comment']}")

        for i in range(1, n_sets + 1):
            prev_reps, prev_weight = last_by_set.get(i, (0, 0.0))
            c0, c1, c2 = st.columns([1, 2, 2])
            c0.markdown(f"**Satz {i}**")
            c1.number_input(
                "Wiederholungen", min_value=0, step=1, value=prev_reps,
                key=f"reps_{template_name}_{ex_id}_{i}",
                label_visibility="collapsed",
            )
            c2.number_input(
                "Gewicht (kg)", min_value=0.0, step=2.5, value=float(prev_weight),
                format="%.1f", key=f"weight_{template_name}_{ex_id}_{i}",
                label_visibility="collapsed",
            )

        st.text_area(
            "Kommentar (optional)", key=f"comment_{template_name}_{ex_id}", height=68
        )
        st.divider()

    submitted = st.form_submit_button("Training speichern", type="primary")

if submitted:
    save_session(conn, template_name, exercises)
    try:
        backup_database()
    except (OSError, sqlite3.Error):
        st.session_state["backup_failed"] = True
    clear_inputs()
    st.session_state["saved"] = True
    st.rerun()

conn.close()