import Vex from "vexflow";
import type { Clef, WrittenNote } from "./notes";

const VF = Vex.Flow;

export interface StaffMark {
  note: WrittenNote;
  color: string;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function staveNote(n: WrittenNote, clef: Clef, color: string) {
  const note = new VF.StaveNote({ clef, keys: [`${n.step.toLowerCase()}${n.acc}/${n.octave}`], duration: "w" });
  if (n.acc) note.addAccidental(0, new VF.Accidental(n.acc));
  note.setStyle({ fillStyle: color, strokeStyle: color });
  return note;
}

/** Draws one clef with up to two notes on it (the target and, optionally, the note you played). */
export function drawStaff(el: HTMLElement, clef: Clef, marks: StaffMark[]): void {
  el.innerHTML = "";
  const width = 220;
  const height = 150;
  const renderer = new VF.Renderer(el as HTMLDivElement, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const ink = cssVar("--ink") || "#000";
  ctx.setFillStyle(ink);
  ctx.setStrokeStyle(ink);

  const stave = new VF.Stave(0, 20, width - 1);
  stave.addClef(clef);
  stave.setContext(ctx).draw();

  const voices = marks.map((m) => {
    const v = new VF.Voice({ num_beats: 4, beat_value: 4, resolution: VF.RESOLUTION });
    v.addTickables([staveNote(m.note, clef, m.color)]);
    return v;
  });
  if (voices.length) {
    new VF.Formatter().joinVoices(voices).format(voices, width - stave.getNoteStartX() - 30);
    voices.forEach((v) => v.draw(ctx, stave));
  }

  // Scale the fixed-size drawing to fit its container.
  const svg = el.querySelector("svg");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "100%";
    svg.style.height = "auto";
  }
}
