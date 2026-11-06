import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

export type Hand = "right" | "left";

/** Renders a score and walks a cursor through it, exposing the expected notes at each step. */
export class Sheet {
  private osmd: OpenSheetMusicDisplay;

  constructor(container: HTMLElement) {
    this.osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      followCursor: true,
    });
  }

  async load(content: string | Blob): Promise<void> {
    await this.osmd.load(content);
    this.osmd.render();
    this.osmd.cursor.show();
    this.osmd.cursor.reset();
  }

  get title(): string {
    return this.osmd.Sheet?.TitleString || "Untitled";
  }

  get staffCount(): number {
    return this.osmd.Sheet?.Instruments.reduce((n, i) => n + i.Staves.length, 0) ?? 0;
  }

  get finished(): boolean {
    return this.osmd.cursor.Iterator.EndReached;
  }

  reset(): void {
    this.osmd.cursor.reset();
  }

  /**
   * MIDI numbers a single mic can check at the current cursor position: the top note
   * (melody) of the right hand, or the bottom note of the left hand. Empty for rests
   * and for notes that only continue a tie.
   */
  expected(hand: Hand): number[] {
    const notes = this.osmd.cursor.NotesUnderCursor().filter((n) => {
      if (n.isRest()) return false;
      if (n.NoteTie && n.NoteTie.StartNote !== n) return false;
      const staves = n.ParentStaffEntry.ParentStaff.ParentInstrument.Staves;
      const staffIndex = staves.indexOf(n.ParentStaffEntry.ParentStaff);
      // Single-staff parts count as right hand; on a grand staff, staff 0 = RH, 1 = LH.
      return staves.length < 2 ? hand === "right" : (hand === "right") === (staffIndex === 0);
    });
    if (notes.length === 0) return [];
    // OSMD halfTone is semitones above C0; MIDI C0 = 12.
    const midis = notes.map((n) => n.halfTone + 12);
    return [hand === "right" ? Math.max(...midis) : Math.min(...midis)];
  }

  /** Advance one step, then past any positions with nothing to play for this hand. */
  next(hand: Hand): void {
    this.osmd.cursor.next();
    this.skipEmpty(hand);
  }

  skipEmpty(hand: Hand): void {
    while (!this.finished && this.expected(hand).length === 0) this.osmd.cursor.next();
  }
}
