// Generates simple single-staff MusicXML files for the built-in public-domain songs.
// Usage: node scripts/make-songs.mjs
import { writeFileSync } from "node:fs";

const DIV = 2; // divisions per quarter note
const TYPES = { 1: "eighth", 2: "quarter", 3: "quarter", 4: "half", 6: "half", 8: "whole" };

function noteXml(token) {
  // token like "E4:q", "D4:h.", "C4:w", "R:q"
  const [p, d] = token.split(":");
  const dur = { e: 1, q: 2, "q.": 3, h: 4, "h.": 6, w: 8 }[d];
  const dot = d.endsWith(".") ? "<dot/>" : "";
  if (p === "R") return `<note><rest/><duration>${dur}</duration><type>${TYPES[dur]}</type>${dot}</note>`;
  const m = p.match(/^([A-G])(#|b)?(\d)$/);
  const alter = m[2] === "#" ? "<alter>1</alter>" : m[2] === "b" ? "<alter>-1</alter>" : "";
  return `<note><pitch><step>${m[1]}</step>${alter}<octave>${m[3]}</octave></pitch><duration>${dur}</duration><type>${TYPES[dur]}</type>${dot}</note>`;
}

function song(title, composer, measures) {
  const body = measures
    .map((m, i) => {
      const attrs =
        i === 0
          ? `<attributes><divisions>${DIV}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`
          : "";
      const bar = i === measures.length - 1 ? `<barline location="right"><bar-style>light-heavy</bar-style></barline>` : "";
      return `<measure number="${i + 1}">${attrs}${m.trim().split(/\s+/).map(noteXml).join("")}${bar}</measure>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
<work><work-title>${title}</work-title></work>
<identification><creator type="composer">${composer}</creator></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
${body}
</part>
</score-partwise>
`;
}

writeFileSync(
  "public/songs/ode-to-joy.musicxml",
  song("Ode to Joy", "Ludwig van Beethoven", [
    "E4:q E4:q F4:q G4:q", "G4:q F4:q E4:q D4:q", "C4:q C4:q D4:q E4:q", "E4:q. D4:e D4:h",
    "E4:q E4:q F4:q G4:q", "G4:q F4:q E4:q D4:q", "C4:q C4:q D4:q E4:q", "D4:q. C4:e C4:h",
  ])
);

writeFileSync(
  "public/songs/twinkle-twinkle.musicxml",
  song("Twinkle Twinkle Little Star", "Traditional", [
    "C4:q C4:q G4:q G4:q", "A4:q A4:q G4:h", "F4:q F4:q E4:q E4:q", "D4:q D4:q C4:h",
    "G4:q G4:q F4:q F4:q", "E4:q E4:q D4:h", "G4:q G4:q F4:q F4:q", "E4:q E4:q D4:h",
    "C4:q C4:q G4:q G4:q", "A4:q A4:q G4:h", "F4:q F4:q E4:q E4:q", "D4:q D4:q C4:h",
  ])
);
console.log("songs written");
