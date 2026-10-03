import { db, type Day, type ExerciseEntry, type Workout } from './db';

const LAST_KEY = 'lastBackup';
const AUTO_KEY = 'autoBackup';

export const autoBackupEnabled = () => localStorage.getItem(AUTO_KEY) !== 'off';

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function buildBackup() {
  const workouts = await db.workouts.toArray();
  const data = {
    app: 'krafttraining-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts,
  };
  const day = new Date().toLocaleDateString('sv-SE'); // ergibt JJJJ-MM-TT
  return {
    name: `krafttraining-backup-${day}.json`,
    json: JSON.stringify(data, null, 2),
    count: workouts.length,
  };
}

export async function exportBackup(): Promise<number> {
  const b = await buildBackup();
  download(b.name, b.json);
  localStorage.setItem(LAST_KEY, new Date().toISOString());
  return b.count;
}

export async function prepareShare(): Promise<File> {
  const b = await buildBackup();
  return new File([b.json], b.name + '.txt', { type: 'text/plain' });
}

export async function shareFile(file: File): Promise<string> {
  if (!navigator.share) return 'Teilen wird von diesem Browser nicht unterstützt.';
  if (!navigator.canShare?.({ files: [file] })) {
    return 'Dieser Browser erlaubt das Teilen von JSON-Dateien nicht.';
  }
  try {
    await navigator.share({ files: [file], title: 'Krafttraining-Sicherung' });
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    return 'Sicherung geteilt ✔';
  } catch (e) {
    const err = e as DOMException;
    if (err.name === 'AbortError') return 'Abgebrochen.';
    return `Teilen fehlgeschlagen: ${err.name} – ${err.message}`;
  }
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);

// Prüft einen Eintrag aus einer Sicherungsdatei und bereinigt ihn
function clean(raw: unknown): Workout | null {
  const w = raw as Partial<Workout>;
  if (
    !w ||
    (w.day !== 'A' && w.day !== 'B') ||
    typeof w.date !== 'string' ||
    isNaN(Date.parse(w.date)) ||
    !Array.isArray(w.entries)
  ) {
    return null;
  }
  const entries: ExerciseEntry[] = [];
  for (const e of w.entries) {
    if (!e || typeof e.name !== 'string') continue;
    const sets = (Array.isArray(e.sets) ? e.sets : []).flatMap((s) => {
      const reps = num(s?.reps);
      const weight = num(s?.weight);
      return reps !== null && weight !== null ? [{ reps, weight }] : [];
    });
    entries.push({ name: e.name, sets, comment: typeof e.comment === 'string' ? e.comment : '' });
  }
  return { day: w.day as Day, date: w.date, entries };
}

export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  const list: unknown[] = Array.isArray(data?.workouts) ? data.workouts : [];
  const existing = new Set((await db.workouts.toArray()).map((w) => `${w.day}|${w.date}`));

  const toAdd: Workout[] = [];
  let skipped = 0;
  let invalid = 0;

  for (const raw of list) {
    const w = clean(raw);
    if (!w) {
      invalid++;
      continue;
    }
    const key = `${w.day}|${w.date}`;
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    existing.add(key);
    toAdd.push(w);
  }

  await db.workouts.bulkAdd(toAdd);
  return { added: toAdd.length, skipped, invalid };
}

export async function renderBackup(container: HTMLElement) {
  const count = await db.workouts.count();
  let shareFileObj = await prepareShare();
  const all = (await db.workouts.toArray()).sort((a, b) => b.date.localeCompare(a.date));
  const last = localStorage.getItem(LAST_KEY);
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  const lastText = last
    ? `Letzte Sicherung: ${new Date(last).toLocaleDateString('de-DE')}`
    : 'Noch keine Sicherung erstellt';
  const warn =
    days === null || days > 7 ? '<p class="warn">Die letzte Sicherung ist länger als 7 Tage her.</p>' : '';

  container.innerHTML = `
    <header>
      <h1>Daten und Sicherung</h1>
      <p class="info">${count} Training(s) auf diesem Gerät gespeichert</p>
      <p class="info">${lastText}</p>
      ${warn}
      <p id="msg" class="msg"></p>
    </header>
    <section class="card">
      <h2>Sicherung herunterladen</h2>
      <p class="info">Speichert alle Trainings als JSON-Datei im Download-Ordner.</p>
      <button id="export" class="save">Jetzt sichern</button>
      <br> <br>
      <button id="share" class="save">Teilen</button>
    </section>
    <section class="card">
      <h2>Automatisch</h2>
      <label class="toggle">
        <input type="checkbox" id="auto" ${autoBackupEnabled() ? 'checked' : ''}>
        Nach jedem gespeicherten Training eine Sicherung herunterladen
      </label>
    </section>
    <section class="card">
      <h2>Gespeicherte Trainings</h2>
      ${
        all
          .map(
            (w) => `
        <div class="wk">
          <span>Tag ${w.day} · ${new Date(w.date).toLocaleDateString('de-DE')} · ${w.entries.length} Übungen</span>
          <button type="button" class="del" data-id="${w.id}">Löschen</button>
        </div>`
          )
          .join('') || '<p class="info">Noch keine Trainings.</p>'
      }
    </section>
    <section class="card">
      <h2>Sicherung einspielen</h2>
      <p class="info">Vorhandene Trainings bleiben erhalten, doppelte werden übersprungen.</p>
      accept="application/json,.json,text/plain,.txt"
    </section>
  `;

  const msg = container.querySelector<HTMLElement>('#msg')!;

  container.querySelector('#share')!.addEventListener('click', async () => {
    msg.textContent = await shareFile(shareFileObj);
  });

  container.querySelector('#export')!.addEventListener('click', async () => {
    const n = await exportBackup();
    msg.textContent = `${n} Training(s) gesichert ✔`;
  });

  container.querySelector<HTMLInputElement>('#auto')!.addEventListener('change', (e) => {
    localStorage.setItem(AUTO_KEY, (e.target as HTMLInputElement).checked ? 'on' : 'off');
  });

  container.querySelector<HTMLInputElement>('#import')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const res = await importBackup(file);
      shareFileObj = await prepareShare();
      msg.textContent = `Import fertig: ${res.added} neu, ${res.skipped} übersprungen, ${res.invalid} ungültig.`;
    } catch {
      msg.textContent = 'Die Datei konnte nicht gelesen werden.';
    }
  });

  container.querySelectorAll<HTMLButtonElement>('.del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Dieses Training wirklich löschen?')) return;
      await db.workouts.delete(Number(btn.dataset.id));
      await renderBackup(container);
    });
  });
}