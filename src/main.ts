import { Listener, type HeardNote } from "./listener";
import { midiToName } from "./notes";
import { Sheet, type Hand } from "./sheet";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const songSelect = $<HTMLSelectElement>("song");
const fileInput = $<HTMLInputElement>("file");
const handSelect = $<HTMLSelectElement>("hand");
const anyOctave = $<HTMLInputElement>("anyOctave");
const hint = $<HTMLInputElement>("hint");
const micButton = $<HTMLButtonElement>("mic");
const targetEl = $("target");
const heardEl = $("heard");
const levelEl = $("level");
const progressEl = $("progress");
const messageEl = $("message");

const sheet = new Sheet($("sheet"));
let songKey = "";
let correct = 0;
let wrong = 0;
let done = false;

const hand = () => handSelect.value as Hand;

function bestKey() {
  return `best:${songKey}:${hand()}`;
}

function updateStatus() {
  const expected = sheet.expected(hand());
  targetEl.textContent = done ? "✓" : hint.checked && expected.length ? midiToName(expected[0]) : "♪";
  progressEl.textContent = `${correct} correct · ${wrong} wrong`;
}

function restart() {
  correct = 0;
  wrong = 0;
  done = false;
  sheet.reset();
  sheet.skipEmpty(hand());
  messageEl.textContent = listener.running ? "Listening… play the note under the cursor." : "Press “Start listening”, then play the note under the cursor.";
  updateStatus();
}

async function loadSong(content: string | Blob, key: string) {
  messageEl.textContent = "Loading…";
  try {
    await sheet.load(content);
    songKey = key;
    restart();
    if (sheet.staffCount < 2 && hand() === "left") handSelect.value = "right";
  } catch (err) {
    messageEl.textContent = `Could not open that file: ${(err as Error).message}`;
  }
}

function flash(el: HTMLElement, cls: string) {
  el.classList.remove("flash-good", "flash-bad");
  void el.offsetWidth;
  el.classList.add(cls);
}

function onNote(note: HeardNote) {
  heardEl.textContent = midiToName(note.midi);
  if (done) return;
  const expected = sheet.expected(hand());
  const ok = expected.some((m) => (anyOctave.checked ? (m - note.midi) % 12 === 0 : m === note.midi));
  if (ok) {
    correct++;
    flash(heardEl, "flash-good");
    sheet.next(hand());
    if (sheet.finished) {
      done = true;
      const accuracy = Math.round((100 * correct) / (correct + wrong));
      let best = 0;
      try { best = Number(localStorage.getItem(bestKey()) || 0); } catch {}
      if (accuracy > best) try { localStorage.setItem(bestKey(), String(accuracy)); } catch {}
      messageEl.textContent = `Finished! Accuracy ${accuracy}%.${accuracy > best ? " — new best!" : ` (best ${best}%)`} Press Restart to play again.`;
    }
  } else {
    wrong++;
    flash(heardEl, "flash-bad");
    if (hint.checked) messageEl.textContent = `That was ${midiToName(note.midi)} — try ${midiToName(expected[0])}.`;
  }
  updateStatus();
}

const listener = new Listener({
  onNote,
  onFrame: (_note, level) => {
    levelEl.style.width = `${Math.min(100, level * 600)}%`;
  },
});

micButton.addEventListener("click", async () => {
  if (listener.running) {
    listener.stop();
    micButton.textContent = "Start listening";
    messageEl.textContent = "Stopped listening.";
    return;
  }
  try {
    await listener.start();
    micButton.textContent = "Stop listening";
    messageEl.textContent = "Listening… play the note under the cursor.";
  } catch (err) {
    messageEl.textContent = `Microphone not available: ${(err as Error).message}`;
  }
});

songSelect.addEventListener("change", async () => {
  const res = await fetch(songSelect.value);
  loadSong(await res.text(), songSelect.value);
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const content = file.name.toLowerCase().endsWith(".mxl") ? file : await file.text();
  await loadSong(content, `file:${file.name}`);
  fileInput.value = "";
});

handSelect.addEventListener("change", restart);
hint.addEventListener("change", updateStatus);
$("restart").addEventListener("click", restart);

songSelect.dispatchEvent(new Event("change"));
