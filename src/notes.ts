const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToName(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/**
 * How far (in semitones) a heard pitch may be from the written note and still count.
 * Acoustic pianos often have single keys that are noticeably out of tune; plain rounding would turn
 * an F that is 55 cents flat into an "E". 0.65 accepts a key up to 65 cents off while still
 * rejecting the neighbouring semitone unless that one is more than 35 cents out of tune itself.
 */
export const TUNING_TOLERANCE = 0.65;

/** Does a heard pitch (MIDI note + cents) count as the target note? */
export function pitchMatches(target: number, midi: number, cents: number, anyOctave: boolean): boolean {
  let diff = midi + cents / 100 - target;
  if (anyOctave) diff -= 12 * Math.round(diff / 12);
  return Math.abs(diff) <= TUNING_TOLERANCE;
}

export type Clef = "treble" | "bass";
export type Accidental = "" | "#" | "b";

/** A written note: what you read on the staff. */
export interface WrittenNote {
  step: string; // C..B
  acc: Accidental;
  octave: number;
  clef: Clef;
}

export function writtenMidi(n: WrittenNote): number {
  return (n.octave + 1) * 12 + STEP_SEMITONES[n.step] + (n.acc === "#" ? 1 : n.acc === "b" ? -1 : 0);
}

export function writtenName(n: WrittenNote): string {
  return n.step + (n.acc === "#" ? "♯" : n.acc === "b" ? "♭" : "") + n.octave;
}

export function writtenId(n: WrittenNote): string {
  return `${n.clef}:${n.step}${n.acc}${n.octave}`;
}

/** Natural notes from `from` to `to` inclusive, e.g. naturals("C4", "G4"). */
function naturals(from: string, to: string, clef: Clef): WrittenNote[] {
  const idx = (s: string) => Number(s.slice(1)) * 7 + STEPS.indexOf(s[0]);
  const out: WrittenNote[] = [];
  for (let i = idx(from); i <= idx(to); i++) out.push({ step: STEPS[i % 7], acc: "", octave: Math.floor(i / 7), clef });
  return out;
}

function withAccidentals(notes: WrittenNote[]): WrittenNote[] {
  const out: WrittenNote[] = [];
  for (const n of notes) {
    out.push(n);
    if (n.step !== "E" && n.step !== "B") out.push({ ...n, acc: "#" });
    if (n.step !== "C" && n.step !== "F") out.push({ ...n, acc: "b" });
  }
  return out;
}

export interface Level {
  name: string;
  description: string;
  treble: WrittenNote[];
  bass: WrittenNote[];
}

export const LEVELS: Level[] = [
  {
    name: "1 · C position",
    description: "Five notes per hand around middle C",
    treble: naturals("C4", "G4", "treble"),
    bass: naturals("C3", "G3", "bass"),
  },
  {
    name: "2 · On the staff",
    description: "Every line and space of the staff",
    treble: naturals("E4", "F5", "treble"),
    bass: naturals("G2", "A3", "bass"),
  },
  {
    name: "3 · Ledger lines",
    description: "Up to two ledger lines above and below",
    treble: naturals("A3", "C6", "treble"),
    bass: naturals("C2", "E4", "bass"),
  },
  {
    name: "4 · Sharps & flats",
    description: "The full range with accidentals",
    treble: withAccidentals(naturals("A3", "C6", "treble")),
    bass: withAccidentals(naturals("C2", "E4", "bass")),
  },
];
