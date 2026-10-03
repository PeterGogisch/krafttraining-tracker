export type PlanExercise = { name: string; sets: number; reps: string };

export const PLAN: Record<'A' | 'B', PlanExercise[]> = {
  A: [
    { name: 'Squats', sets: 5, reps: '5' },
    { name: 'Kreuzheben', sets: 3, reps: '5' },
    { name: 'Klimmzug eng', sets: 4, reps: '6-8' },
    { name: 'Schrägbank', sets: 4, reps: '6-8' },
    { name: 'LG Rudern Obergriff', sets: 3, reps: '8-12' },
    { name: 'Trizeps Stange', sets: 3, reps: '8-12' },
    { name: 'Bizeps Curls', sets: 2, reps: '8-12' },
  ],
  B: [
    { name: 'Squats', sets: 5, reps: '5' },
    { name: 'Bank drücken', sets: 5, reps: '5' },
    { name: 'LH Rudern Untergriff', sets: 5, reps: '5' },
    { name: 'Schulter drücken LH stehend', sets: 3, reps: '8-12' },
    { name: 'Bizeps Curls SZ Stange', sets: 3, reps: '8-12' },
    { name: 'Trizeps am Seil', sets: 2, reps: '8-12' },
  ],
};