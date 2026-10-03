import { Chart, registerables, type ChartConfiguration } from 'chart.js';
import { PLAN } from './plan';
import { db, volume, type Day, type ExerciseEntry, type Workout } from './db';

Chart.register(...registerables);
Chart.defaults.color = '#9a9aa0';
Chart.defaults.borderColor = '#2a2a2d';

let charts: Chart[] = [];
let selectedExercise = '';

const r = (n: number) => Math.round(n * 100) / 100;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const totalVolume = (w: Workout) => r(w.entries.reduce((sum, e) => sum + volume(e), 0));

export function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

function makeChart(
  canvas: HTMLCanvasElement,
  type: 'bar' | 'line',
  labels: string[],
  data: (number | null)[],
  label: string
): Chart {
  const chart = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          backgroundColor: '#f5a623',
          borderColor: '#f5a623',
          tension: 0.25,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  } as ChartConfiguration);
  charts.push(chart);
  return chart;
}

function compareHtml(day: Day, workouts: Workout[]): string {
  if (workouts.length < 2) {
    return '<p class="info">Dafür braucht es mindestens zwei gespeicherte Trainings.</p>';
  }
  const last = workouts[workouts.length - 1];
  const prev = workouts[workouts.length - 2];

  const setsText = (e?: ExerciseEntry) =>
    e && e.sets.length ? e.sets.map((s) => `${s.reps}×${s.weight}`).join(' · ') : '–';

  const rows = PLAN[day]
    .map((ex) => {
      const a = prev.entries.find((e) => e.name === ex.name);
      const b = last.entries.find((e) => e.name === ex.name);
      const va = a ? r(volume(a)) : 0;
      const vb = b ? r(volume(b)) : 0;
      const diff = r(vb - va);
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
      const sign = diff > 0 ? '+' : '';
      return `
        <div class="cmp">
          <div class="cmp-name">${ex.name} <span class="${cls}">${sign}${diff}</span></div>
          <div class="info">${fmtDate(prev.date)}: ${setsText(a)} (${va})</div>
          <div class="info">${fmtDate(last.date)}: ${setsText(b)} (${vb})</div>
        </div>`;
    })
    .join('');

  return `<p class="info">Volumen = Wiederholungen × Gewicht, summiert über alle Sätze.</p>${rows}`;
}

export async function renderProgress(
  container: HTMLElement,
  day: Day,
  onDayChange: (d: Day) => void
) {
  destroyCharts();

  const workouts = await db.workouts.where('day').equals(day).sortBy('date');
  const names = PLAN[day].map((e) => e.name);
  if (!names.includes(selectedExercise)) selectedExercise = names[0];

  const body =
    workouts.length === 0
      ? '<p class="info">Für diesen Tag sind noch keine Trainings gespeichert.</p>'
      : `
    <section class="card">
      <h2>Gesamtvolumen pro Training</h2>
      <div class="chart-box"><canvas id="chart-total"></canvas></div>
    </section>
    <section class="card">
      <h2>Volumen pro Übung</h2>
      <select id="ex-select">
        ${names.map((n) => `<option ${n === selectedExercise ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <div class="chart-box"><canvas id="chart-ex"></canvas></div>
      <p class="info" id="ex-stats"></p>
    </section>
    <section class="card">
      <h2>Vergleich: letztes vs. vorletztes Training</h2>
      ${compareHtml(day, workouts)}
    </section>`;

  container.innerHTML = `
    <header>
      <h1>Fortschritt</h1>
      <div class="tabs">
        <button data-day="A" class="${day === 'A' ? 'active' : ''}">Tag A</button>
        <button data-day="B" class="${day === 'B' ? 'active' : ''}">Tag B</button>
      </div>
      <p class="info">${workouts.length} Training(s) gespeichert</p>
    </header>
    ${body}
  `;

  container.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => onDayChange(btn.dataset.day as Day));
  });

  if (workouts.length === 0) return;

  const labels = workouts.map((w) => fmtDate(w.date));

  makeChart(
    container.querySelector<HTMLCanvasElement>('#chart-total')!,
    'bar',
    labels,
    workouts.map(totalVolume),
    'Gesamtvolumen'
  );

  let exChart: Chart | undefined;

  const drawExercise = () => {
    if (exChart) {
      exChart.destroy();
      charts = charts.filter((c) => c !== exChart);
    }

    const values = workouts.map((w) => {
      const e = w.entries.find((x) => x.name === selectedExercise);
      return e && e.sets.length ? r(volume(e)) : null;
    });

    exChart = makeChart(
      container.querySelector<HTMLCanvasElement>('#chart-ex')!,
      'line',
      labels,
      values,
      'Volumen'
    );

    const vals = values.filter((v): v is number => v !== null);
    const stats = container.querySelector('#ex-stats')!;
    if (vals.length === 0) {
      stats.textContent = 'Noch keine Daten für diese Übung.';
    } else {
      const lastV = vals[vals.length - 1];
      let text = `Bestes: ${Math.max(...vals)} · Letztes: ${lastV}`;
      if (vals.length > 1) {
        const d = r(lastV - vals[vals.length - 2]);
        text += ` · zum vorigen Mal: ${d > 0 ? '+' : ''}${d}`;
      }
      stats.textContent = text;
    }
  };

  const select = container.querySelector<HTMLSelectElement>('#ex-select')!;
  select.addEventListener('change', () => {
    selectedExercise = select.value;
    drawExercise();
  });
  drawExercise();
}