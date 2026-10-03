import './style.css';
import { PLAN } from './plan';
import { db, lastWorkout, volume, type Day, type ExerciseEntry, type SetEntry } from './db';
import { renderProgress, destroyCharts } from './progress';
import { renderBackup, exportBackup, autoBackupEnabled } from './backup';

const app = document.querySelector<HTMLDivElement>('#app')!;
let currentDay: Day = 'A';
let message = '';

let view: 'training' | 'progress' | 'data' = 'training';

const nav = document.createElement('nav');
nav.className = 'nav';
nav.innerHTML = `
  <button data-view="training" class="active">Training</button>
  <button data-view="progress">Fortschritt</button>
  <button data-view="data">Daten</button>`;
app.before(nav);

nav.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    view = btn.dataset.view as typeof view;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    show();
  });
});

function show() {
  destroyCharts();
  if (view === 'training') {
    render();
  } else if (view === 'progress') {
    renderProgress(app, currentDay, (d) => {
      currentDay = d;
      show();
    });
  } else {
    renderBackup(app);
  }
}

// Schutz, damit Kommentare nicht als HTML interpretiert werden
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function render() {
  const last = await lastWorkout(currentDay);
  const exercises = PLAN[currentDay];

  const cards = exercises
    .map((ex, i) => {
      const lastEntry = last?.entries.find((e) => e.name === ex.name);

      const lastText =
        lastEntry && lastEntry.sets.length
          ? lastEntry.sets.map((s) => `${s.reps}×${s.weight}`).join(' · ') +
            ` (Volumen ${volume(lastEntry)})`
          : 'noch keine Daten';

      const lastComment = lastEntry?.comment
        ? `<p class="last-comment">Kommentar: ${esc(lastEntry.comment)}</p>`
        : '';

      const rows = Array.from({ length: ex.sets }, (_, s) => {
        const prev = lastEntry?.sets[s];
        return `
          <div class="set">
            <div class="set-title">Satz ${s + 1}</div>
            <div class="stepper">
              <span class="unit">Wdh</span>
              <button type="button" class="step" data-step="-1">−</button>
              <input type="number" inputmode="numeric" min="0" step="1"
                     data-ex="${i}" data-set="${s}" data-field="reps"
                     placeholder="0" value="${prev ? prev.reps : ''}">
              <button type="button" class="step" data-step="1">+</button>
            </div>
            <div class="stepper">
              <span class="unit">kg</span>
              <button type="button" class="step" data-step="-5">−5</button>
              <button type="button" class="step" data-step="-2.5">−2,5</button>
              <input type="number" inputmode="decimal" min="0" step="any"
                     data-ex="${i}" data-set="${s}" data-field="weight"
                     placeholder="0" value="${prev ? prev.weight : ''}">
              <button type="button" class="step" data-step="2.5">+2,5</button>
              <button type="button" class="step" data-step="5">+5</button>
            </div>
          </div>`;
      }).join('');

      return `
        <section class="card">
          <h2>${esc(ex.name)}</h2>
          <p class="target">Ziel: ${ex.sets}×${ex.reps}</p>
          <p class="last">Letztes Mal: ${lastText}</p>
          ${lastComment}
          ${rows}
          <textarea data-ex="${i}" data-field="comment" placeholder="Kommentar (optional)"></textarea>
        </section>`;
    })
    .join('');

  const lastInfo = last
    ? `Letztes Training: ${new Date(last.date).toLocaleDateString('de-DE')}`
    : 'Noch kein Training gespeichert';

  app.innerHTML = `
    <header>
      <h1>Krafttraining</h1>
      <div class="tabs">
        <button data-day="A" class="${currentDay === 'A' ? 'active' : ''}">Tag A</button>
        <button data-day="B" class="${currentDay === 'B' ? 'active' : ''}">Tag B</button>
      </div>
      <p class="info">${lastInfo}</p>
      <p id="msg" class="msg">${message}</p>
    </header>
    ${cards}
    <button id="save" class="save">Training speichern</button>
  `;
  message = '';

  // +/- Buttons
  app.querySelectorAll<HTMLButtonElement>('.step').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement!.querySelector<HTMLInputElement>('input')!;
      const current = isNaN(input.valueAsNumber) ? 0 : input.valueAsNumber;
      const next = Math.max(0, Math.round((current + Number(btn.dataset.step)) * 100) / 100);
      input.value = String(next);
    });
  });

  // Eingabefelder: markieren beim Antippen, keine negativen Werte
  app.querySelectorAll<HTMLInputElement>('.set input').forEach((input) => {
    input.addEventListener('focus', () => input.select());

    input.addEventListener('keydown', (e) => {
      if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
      if (input.dataset.field === 'reps' && (e.key === '.' || e.key === ',')) e.preventDefault();
    });

    input.addEventListener('change', () => {
      const v = input.valueAsNumber;
      if (isNaN(v)) {
        input.value = '';
        return;
      }
      let n = Math.max(0, v);
      if (input.dataset.field === 'reps') n = Math.floor(n);
      input.value = String(n);
    });
  });

  app.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDay = btn.dataset.day as Day;
      render();
    });
  });
  app.querySelector<HTMLButtonElement>('#save')!.addEventListener('click', save);
}

async function save() {
  const entries: ExerciseEntry[] = [];

  PLAN[currentDay].forEach((ex, i) => {
    const sets: SetEntry[] = [];

    for (let s = 0; s < ex.sets; s++) {
      const reps = Math.max(
        0,
        Math.floor(
          app.querySelector<HTMLInputElement>(
            `input[data-ex="${i}"][data-set="${s}"][data-field="reps"]`
          )!.valueAsNumber
        )
      );
      const weight = Math.max(
        0,
        app.querySelector<HTMLInputElement>(
          `input[data-ex="${i}"][data-set="${s}"][data-field="weight"]`
        )!.valueAsNumber
      );
      if (!isNaN(reps) && !isNaN(weight)) sets.push({ reps, weight });
    }

    const comment = app
      .querySelector<HTMLTextAreaElement>(`textarea[data-ex="${i}"]`)!
      .value.trim();
    if (sets.length || comment) entries.push({ name: ex.name, sets, comment });
  });

  if (entries.length === 0) {
    app.querySelector('#msg')!.textContent = 'Nichts zum Speichern eingetragen.';
    return;
  }

  await db.workouts.add({
    day: currentDay,
    date: new Date().toISOString(),
    entries,
  });
    if (autoBackupEnabled()) {
    try {
      await exportBackup();
    } catch {
      // die Sicherung ist optional, das Training ist schon gespeichert
    }
  }
  message = 'Training gespeichert ✔';
  await render();
  window.scrollTo(0, 0);
}

navigator.storage?.persist?.();

show();