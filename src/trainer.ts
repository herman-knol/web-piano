import type { Keyboard } from "./keyboard";
import {
  LEVELS, midiToName, pitchMatches, writtenId, writtenMidi, writtenName,
  type Accidental, type Clef, type WrittenNote,
} from "./notes";
import { drawStaff, type StaffMark } from "./staff";

interface NoteStats {
  seen: number;
  correct: number; // answered right on the first try
  time: number; // moving average response time in ms (first-try answers only)
}

export type ClefChoice = Clef | "both";

const STATS_KEY = "trainer:stats:v1";
const BEST_KEY = "trainer:challengeBest:v1";
const CHALLENGE_MS = 60_000;
const NEXT_DELAY_MS = 450;

const color = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** 0 = weak … 1 = mastered; null = not practised yet. */
export function mastery(s: NoteStats | undefined): number | null {
  if (!s || s.seen === 0) return null;
  const accuracy = s.correct / s.seen;
  const speed = Math.max(0, Math.min(1, (4000 - s.time) / 3000)); // 1s → 1, 4s → 0
  const confidence = Math.min(1, s.seen / 4);
  return accuracy * (0.6 + 0.4 * speed) * confidence;
}

export interface TrainerUI {
  staff: HTMLElement;
  prompt: HTMLElement;
  streak: HTMLElement;
  accuracy: HTMLElement;
  avgTime: HTMLElement;
  timer: HTMLElement;
  best: HTMLElement;
  masteryGrid: HTMLElement;
  challengeButton: HTMLButtonElement;
}

export class Trainer {
  private stats: Record<string, NoteStats> = load(STATS_KEY, {});
  private bestChallenge: number = load(BEST_KEY, 0);
  private target!: WrittenNote;
  private shownAt = 0;
  private wrongTries = 0;
  private waiting = false; // between a correct answer and the next note
  private paused = false; // showing the challenge result
  private session = { answered: 0, firstTry: 0, streak: 0, timeTotal: 0 };
  private challengeEnd = 0;
  private challengeTimer = 0;

  clef: ClefChoice = "treble";
  level = 0;
  anyOctave = false;

  constructor(private ui: TrainerUI, private keyboard: Keyboard) {
    ui.challengeButton.addEventListener("click", () =>
      this.challengeEnd ? this.endChallenge(false) : this.startChallenge(),
    );
    this.ui.best.textContent = String(this.bestChallenge);
  }

  private pool(): WrittenNote[] {
    const lvl = LEVELS[this.level];
    if (this.clef === "treble") return lvl.treble;
    if (this.clef === "bass") return lvl.bass;
    return [...lvl.treble, ...lvl.bass];
  }

  /** Pick the next note, favouring notes that are new, slow or often missed. */
  private pick(): WrittenNote {
    const pool = this.pool().filter((n) => !this.target || writtenId(n) !== writtenId(this.target));
    const weights = pool.map((n) => {
      const m = mastery(this.stats[writtenId(n)]);
      return m === null ? 3 : 0.4 + (1 - m) * 4;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) <= 0) return pool[i];
    return pool[pool.length - 1];
  }

  /** Start fresh with the current settings. */
  reset(): void {
    this.paused = false;
    this.session = { answered: 0, firstTry: 0, streak: 0, timeTotal: 0 };
    this.next();
    this.renderMastery();
  }

  redraw(extra?: StaffMark): void {
    const marks: StaffMark[] = [{ note: this.target, color: color("--ink") }];
    if (extra) marks.push(extra);
    drawStaff(this.ui.staff, this.target.clef, marks);
  }

  private next(): void {
    this.target = this.pick();
    this.wrongTries = 0;
    this.waiting = false;
    this.shownAt = performance.now();
    this.ui.staff.dataset.target = String(writtenMidi(this.target)); // handy for automated tests
    this.redraw();
    this.setPrompt("Play this note", "");
    this.renderStats();
  }

  private setPrompt(text: string, cls: string) {
    this.ui.prompt.textContent = text;
    this.ui.prompt.className = `prompt ${cls}`;
  }

  /** Spell a played MIDI note so it can be drawn as a red "you played" note. */
  private spell(midi: number): WrittenNote | null {
    const clef = this.target.clef;
    const [lo, hi] = clef === "treble" ? [53, 88] : [31, 67];
    if (midi < lo || midi > hi) return null;
    const useFlats = this.target.acc === "b";
    const pc = midi % 12;
    const sharpNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const flatNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    const name = (useFlats ? flatNames : sharpNames)[pc];
    return { step: name[0], acc: (name[1] ?? "") as Accidental, octave: Math.floor(midi / 12) - 1, clef };
  }

  handle(midi: number, cents = 0): void {
    if (this.waiting || !this.target) return;
    const want = writtenMidi(this.target);
    const ok = pitchMatches(want, midi, cents, this.anyOctave);
    const id = writtenId(this.target);
    const s = (this.stats[id] ??= { seen: 0, correct: 0, time: 0 });

    if (ok) {
      const ms = performance.now() - this.shownAt;
      if (this.wrongTries === 0) {
        s.seen++;
        s.correct++;
        s.time = s.time ? s.time * 0.6 + ms * 0.4 : ms;
        this.session.firstTry++;
        this.session.streak++;
        this.session.timeTotal += ms;
      }
      this.session.answered++;
      save(STATS_KEY, this.stats);
      this.keyboard.flash(midi, "good");
      drawStaff(this.ui.staff, this.target.clef, [{ note: this.target, color: color("--good") }]);
      this.setPrompt(`✓ ${writtenName(this.target)} · ${(ms / 1000).toFixed(1)}s`, "good");
      this.renderStats();
      this.renderMastery();
      this.waiting = true;
      setTimeout(() => !this.paused && this.next(), NEXT_DELAY_MS);
      return;
    }

    if (this.wrongTries === 0) {
      s.seen++;
      s.time = s.time ? s.time * 0.6 + 6000 * 0.4 : 6000; // a miss counts as slow
      this.session.streak = 0;
      save(STATS_KEY, this.stats);
    }
    this.wrongTries++;
    this.keyboard.flash(midi, "bad");
    const played = this.spell(midi);
    this.redraw(played ? { note: played, color: color("--bad") } : undefined);
    const tip = this.wrongTries >= 2 ? ` — it's ${writtenName(this.target)}` : " — try again";
    const octaveOff = (want - midi) % 12 === 0;
    const extra = octaveOff ? " (right note, wrong octave — the mic may have misheard; see “Accept any octave”)" : "";
    this.setPrompt(`✗ You played ${midiToName(midi)}${tip}${extra}`, "bad");
    if (this.wrongTries >= 2) this.keyboard.flash(want, "good");
    this.renderStats();
  }

  private renderStats(): void {
    const { answered, firstTry, streak, timeTotal } = this.session;
    this.ui.streak.textContent = String(streak);
    this.ui.accuracy.textContent = answered ? `${Math.round((100 * firstTry) / answered)}%` : "–";
    this.ui.avgTime.textContent = firstTry ? `${(timeTotal / firstTry / 1000).toFixed(1)}s` : "–";
  }

  renderMastery(): void {
    const grid = this.ui.masteryGrid;
    grid.innerHTML = "";
    for (const clef of ["treble", "bass"] as const) {
      const notes = this.pool().filter((n) => n.clef === clef);
      if (!notes.length) continue;
      const row = document.createElement("div");
      row.className = "mastery-row";
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = clef === "treble" ? "Treble" : "Bass";
      row.appendChild(label);
      for (const n of notes) {
        const m = mastery(this.stats[writtenId(n)]);
        const chip = document.createElement("span");
        chip.className = "chip " + (m === null ? "new" : m > 0.75 ? "strong" : m > 0.4 ? "ok" : "weak");
        chip.textContent = writtenName(n);
        chip.title = m === null ? "Not practised yet" : `Mastery ${Math.round(m * 100)}%`;
        row.appendChild(chip);
      }
      grid.appendChild(row);
    }
  }

  clearStats(): void {
    this.stats = {};
    save(STATS_KEY, this.stats);
    this.renderMastery();
  }

  private startChallenge(): void {
    this.reset();
    this.challengeEnd = performance.now() + CHALLENGE_MS;
    this.ui.challengeButton.textContent = "Stop challenge";
    const tick = () => {
      const left = this.challengeEnd - performance.now();
      if (left <= 0) return this.endChallenge(true);
      this.ui.timer.textContent = `${Math.ceil(left / 1000)}s`;
    };
    tick();
    this.challengeTimer = window.setInterval(tick, 200);
  }

  private endChallenge(completed: boolean): void {
    clearInterval(this.challengeTimer);
    this.challengeEnd = 0;
    this.ui.challengeButton.textContent = "60-second challenge";
    this.ui.timer.textContent = "–";
    if (!completed) return;
    const score = this.session.firstTry;
    const isBest = score > this.bestChallenge;
    if (isBest) {
      this.bestChallenge = score;
      save(BEST_KEY, score);
      this.ui.best.textContent = String(score);
    }
    this.waiting = true;
    this.paused = true;
    drawStaff(this.ui.staff, this.target.clef, []);
    this.setPrompt(`Time! ${score} notes read correctly${isBest ? " — new best!" : ""}`, "good");
    setTimeout(() => {
      this.paused = false;
      this.next();
    }, 2500);
  }
}
