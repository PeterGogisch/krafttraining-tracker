import Dexie, { type Table } from 'dexie';

export type Day = 'A' | 'B';
export type SetEntry = { reps: number; weight: number };
export type ExerciseEntry = { name: string; sets: SetEntry[]; comment: string };
export type Workout = { id?: number; day: Day; date: string; entries: ExerciseEntry[] };

class TrainingDB extends Dexie {
  workouts!: Table<Workout, number>;

  constructor() {
    super('krafttraining');
    this.version(1).stores({ workouts: '++id, day, date' });
  }
}

export const db = new TrainingDB();

// Letztes Training eines Tages (für die Anzeige "letztes Mal")
export async function lastWorkout(day: Day): Promise<Workout | undefined> {
  const all = await db.workouts.where('day').equals(day).sortBy('date');
  return all[all.length - 1];
}

// Volumen einer Übung = Summe aus Wiederholungen mal Gewicht
export function volume(entry: ExerciseEntry): number {
  return entry.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
}