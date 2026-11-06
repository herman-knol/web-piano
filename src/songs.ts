import type { HeardNote } from "./listener";
import { midiToName, pitchMatches } from "./notes";
import { Sheet, type Hand } from "./sheet";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** "Songs" mode: read a real score; the cursor waits until you play each note. */
export class SongsMode {
  private sheet = new Sheet($("sheet"));
  private songSelect = $<HTMLSelectElement>("song");
  private handSelect = $<HTMLSelectElement>("hand");
  private hint = $<HTMLInputElement>("hint");
  private targetEl = $("target");
  private heardEl = $("heard");
  private progressEl = $("progress");
  private messageEl = $("songMessage");
  private songKey = "";
  private correct = 0;
  private wrong = 0;
  private done = false;
  private loaded = false;
  anyOctave = true;

  constructor() {
    this.songSelect.addEventListener("change", async () => {
      const res = await fetch(this.songSelect.value);
      this.load(await res.text(), this.songSelect.value);
    });
    const fileInput = $<HTMLInputElement>("file");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const content = file.name.toLowerCase().endsWith(".mxl") ? file : await file.text();
      await this.load(content, `file:${file.name}`);
      fileInput.value = "";
    });
    this.handSelect.addEventListener("change", () => this.restart());
    this.hint.addEventListener("change", () => this.updateStatus());
    $("restart").addEventListener("click", () => this.restart());
  }

  /** Called when the tab becomes visible; loads the first song lazily. */
  show(): void {
    if (!this.loaded) {
      this.loaded = true;
      this.songSelect.dispatchEvent(new Event("change"));
    }
  }

  private hand = () => this.handSelect.value as Hand;
  private bestKey = () => `best:${this.songKey}:${this.hand()}`;

  private updateStatus() {
    const expected = this.sheet.expected(this.hand());
    this.targetEl.textContent = this.done ? "✓" : this.hint.checked && expected.length ? midiToName(expected[0]) : "♪";
    this.progressEl.textContent = `${this.correct} correct · ${this.wrong} wrong`;
  }

  private restart() {
    this.correct = 0;
    this.wrong = 0;
    this.done = false;
    this.sheet.reset();
    this.sheet.skipEmpty(this.hand());
    this.messageEl.textContent = "Play the note under the cursor.";
    this.updateStatus();
  }

  private async load(content: string | Blob, key: string) {
    this.messageEl.textContent = "Loading…";
    try {
      await this.sheet.load(content);
      this.songKey = key;
      if (this.sheet.staffCount < 2 && this.hand() === "left") this.handSelect.value = "right";
      this.restart();
    } catch (err) {
      this.messageEl.textContent = `Could not open that file: ${(err as Error).message}`;
    }
  }

  private flash(cls: string) {
    this.heardEl.classList.remove("good", "bad");
    void this.heardEl.offsetWidth;
    this.heardEl.classList.add(cls);
  }

  handle(note: HeardNote): void {
    this.heardEl.textContent = midiToName(note.midi);
    if (this.done || !this.loaded) return;
    const expected = this.sheet.expected(this.hand());
    const ok = expected.some((m) => pitchMatches(m, note.midi, note.cents, this.anyOctave));
    if (ok) {
      this.correct++;
      this.flash("good");
      this.sheet.next(this.hand());
      if (this.sheet.finished) {
        this.done = true;
        const accuracy = Math.round((100 * this.correct) / (this.correct + this.wrong));
        let best = 0;
        try { best = Number(localStorage.getItem(this.bestKey()) || 0); } catch { /* ignore */ }
        if (accuracy > best) try { localStorage.setItem(this.bestKey(), String(accuracy)); } catch { /* ignore */ }
        this.messageEl.textContent = `Finished! Accuracy ${accuracy}%${accuracy > best ? " — new best!" : ` (best ${best}%)`}. Press Restart to play again.`;
      }
    } else {
      this.wrong++;
      this.flash("bad");
      if (this.hint.checked && expected.length) this.messageEl.textContent = `That was ${midiToName(note.midi)} — try ${midiToName(expected[0])}.`;
    }
    this.updateStatus();
  }
}
