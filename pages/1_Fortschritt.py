import sqlite3
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

DB_PATH = Path(__file__).parent.parent / "training.db"

st.set_page_config(page_title="Fortschritt", page_icon="📈")
st.title("📈 Fortschritt")

conn = sqlite3.connect(DB_PATH)
df = pd.read_sql_query(
    """SELECT ws.id AS session_id, ws.performed_at, t.name AS template,
              e.name AS exercise, s.set_number, s.reps, s.weight_kg
       FROM exercise_set s
       JOIN session_exercise se ON se.id = s.session_exercise_id
       JOIN workout_session ws ON ws.id = se.session_id
       JOIN workout_template t ON t.id = ws.template_id
       JOIN exercise e ON e.id = se.exercise_id
       ORDER BY ws.performed_at, ws.id""",
    conn,
)
conn.close()

if df.empty:
    st.info("Noch keine Trainingsdaten vorhanden.")
    st.stop()

day = st.selectbox("Trainingstag", sorted(df["template"].unique()))
df = df[df["template"] == day].copy()

df["volume"] = df["reps"] * df["weight_kg"]
df["date"] = pd.to_datetime(df["performed_at"])
df["label"] = (
    df["date"].dt.strftime("%d.%m.%Y")
    + " (Nr. " + df["session_id"].astype(str) + ")"
)

tab1, tab2 = st.tabs(["Pro Übung", "Trainings vergleichen"])

with tab1:
    exercise = st.selectbox("Übung", sorted(df["exercise"].unique()))
    ex = df[df["exercise"] == exercise]
    per_session = ex.groupby(["session_id", "label"], as_index=False).agg(
        Volumen=("volume", "sum"),
        Topgewicht=("weight_kg", "max"),
        Wiederholungen=("reps", "sum"),
    )

    for column, title in [
        ("Volumen", "Volumen pro Training (kg)"),
        ("Topgewicht", "Höchstes Gewicht pro Training (kg)"),
        ("Wiederholungen", "Wiederholungen gesamt pro Training"),
    ]:
        fig = px.line(
            per_session, x="label", y=column, markers=True,
            title=f"{exercise}: {title}",
        )
        fig.update_xaxes(type="category", title=None)
        st.plotly_chart(fig)

with tab2:
    per_training = df.groupby(["session_id", "label"], as_index=False)["volume"].sum()

    fig = px.bar(
        per_training, x="label", y="volume",
        title=f"{day}: Gesamtvolumen pro Training (kg)",
    )
    fig.update_xaxes(type="category", title=None)
    st.plotly_chart(fig)

    labels = per_training["label"].tolist()
    if len(labels) < 2:
        st.info(f"Für einen Vergleich werden mindestens zwei Trainings von {day} benötigt.")
    else:
        c1, c2 = st.columns(2)
        a = c1.selectbox("Training 1 (älter)", labels, index=len(labels) - 2)
        b = c2.selectbox("Training 2 (neuer)", labels, index=len(labels) - 1)

        comp = (
            df[df["label"].isin([a, b])]
            .groupby(["exercise", "label"], as_index=False)["volume"]
            .sum()
        )
        fig = px.bar(
            comp, x="exercise", y="volume", color="label", barmode="group",
            title="Volumen pro Übung im Vergleich (kg)",
        )
        fig.update_xaxes(title=None)
        st.plotly_chart(fig)

        pivot = comp.pivot(index="exercise", columns="label", values="volume")
        if a != b and a in pivot.columns and b in pivot.columns:
            base = pivot[a].where(pivot[a] != 0)
            pivot["Differenz (kg)"] = pivot[b] - pivot[a]
            pivot["Differenz (%)"] = ((pivot[b] - pivot[a]) / base * 100).round(1)
        st.dataframe(pivot)