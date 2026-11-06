import "./style.css";
import { Keyboard } from "./keyboard";
import { Listener } from "./listener";
import { LEVELS, midiToName } from "./notes";
import { SongsMode } from "./songs";
import { Trainer, type ClefChoice } from "./trainer";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- Settings persisted per browser -------------------------------------------------------
const SETTINGS_KEY = "settings:v1";
interface Settings { tab: "trainer" | "songs"; clef: ClefChoice; level: number; anyOctave: boolean }
let settings: Settings = { tab: "trainer", clef: "treble", level: 0, anyOctave: false };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { /* ignore */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };

// ---- Modes --------------------------------------------------------------------------------
const keyboard = new Keyboard($("keyboard"), 36, 84, (midi) => route(midi)); // C2–C6
const trainer = new Trainer(
  {
    staff: $("staff"),
    prompt: $("prompt"),
    streak: $("streak"),
    accuracy: $("accuracy"),
    avgTime: $("avgTime"),
    timer: $("timer"),
    best: $("best"),
    masteryGrid: $("mastery"),
    challengeButton: $<HTMLButtonElement>("challenge"),
  },
  keyboard,
);
const songs = new SongsMode();

function route(midi: number, cents = 0) {
  if (settings.tab === "trainer") trainer.handle(midi, cents);
  else songs.handle({ midi, cents });
}

// ---- Microphone ---------------------------------------------------------------------------
const micButton = $<HTMLButtonElement>("mic");
const micStatus = $("micStatus");
const levelEl = $("level");
const hearingEl = $("hearing");
let lastHeardAt = 0;
const listener = new Listener({
  onNote: (n) => route(n.midi, n.cents),
  onFrame: (n, level) => {
    levelEl.style.width = `${Math.min(100, level * 600)}%`;
    // Live tuner readout: shows exactly what the mic hears, incl. how far off-pitch it is.
    const now = performance.now();
    if (n) {
      lastHeardAt = now;
      hearingEl.textContent = `${midiToName(n.midi)} ${n.cents >= 0 ? "+" : "−"}${Math.abs(n.cents)}¢`;
      hearingEl.classList.toggle("off", Math.abs(n.cents) > 30);
    } else if (now - lastHeardAt > 600) {
      hearingEl.textContent = "–";
      hearingEl.classList.remove("off");
    }
  },
});
micButton.addEventListener("click", async () => {
  if (listener.running) {
    listener.stop();
    micButton.textContent = "🎤 Start listening";
    micButton.classList.remove("on");
    micStatus.textContent = "Mic off — you can also click the keys below";
    return;
  }
  try {
    await listener.start();
    micButton.textContent = "🎤 Listening";
    micButton.classList.add("on");
    micStatus.textContent = "Play on your piano";
  } catch (err) {
    micStatus.textContent = `Microphone not available: ${(err as Error).message}`;
  }
});

// ---- Controls -----------------------------------------------------------------------------
const clefSelect = $<HTMLSelectElement>("clef");
const levelSelect = $<HTMLSelectElement>("levelSelect");
const levelDesc = $("levelDesc");
const anyOctave = $<HTMLInputElement>("anyOctave");

LEVELS.forEach((l, i) => levelSelect.add(new Option(l.name, String(i))));

function applySettings() {
  trainer.clef = settings.clef;
  trainer.level = settings.level;
  trainer.anyOctave = settings.anyOctave;
  songs.anyOctave = settings.anyOctave;
  levelDesc.textContent = LEVELS[settings.level].description;
}

clefSelect.value = settings.clef;
levelSelect.value = String(settings.level);
anyOctave.checked = settings.anyOctave;
applySettings();

clefSelect.addEventListener("change", () => { settings.clef = clefSelect.value as ClefChoice; saveSettings(); applySettings(); trainer.reset(); });
levelSelect.addEventListener("change", () => { settings.level = Number(levelSelect.value); saveSettings(); applySettings(); trainer.reset(); });
anyOctave.addEventListener("change", () => { settings.anyOctave = anyOctave.checked; saveSettings(); applySettings(); });
$("clearStats").addEventListener("click", () => { if (confirm("Forget all note statistics?")) trainer.clearStats(); });

// ---- Tabs ---------------------------------------------------------------------------------
function showTab(tab: Settings["tab"]) {
  settings.tab = tab;
  saveSettings();
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $("trainerView").hidden = tab !== "trainer";
  $("songsView").hidden = tab !== "songs";
  if (tab === "songs") songs.show();
}
document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab as Settings["tab"])));

// Redraw the staff when the colour scheme changes (VexFlow paints fixed colours).
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => trainer.redraw());

showTab(settings.tab);
trainer.reset();
keyboard.scrollTo(60);
