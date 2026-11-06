import { midiToName } from "./notes";

const BLACK = new Set([1, 3, 6, 8, 10]);

/** Clickable on-screen keyboard, for practising without a piano or when the room is noisy. */
export class Keyboard {
  private keys = new Map<number, HTMLElement>();

  constructor(el: HTMLElement, from: number, to: number, onPress: (midi: number) => void) {
    el.innerHTML = "";
    el.classList.add("keyboard");
    const keys = document.createElement("div");
    keys.className = "keys";
    el.appendChild(keys);
    let whiteIndex = 0;
    for (let m = from; m <= to; m++) {
      const key = document.createElement("button");
      const black = BLACK.has(m % 12);
      key.className = black ? "key black" : "key white";
      key.setAttribute("aria-label", midiToName(m));
      if (black) key.style.left = `calc(var(--white-w) * ${whiteIndex} - var(--black-w) / 2)`;
      else {
        whiteIndex++;
        if (m % 12 === 0) key.textContent = midiToName(m);
      }
      key.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onPress(m);
      });
      keys.appendChild(key);
      this.keys.set(m, key);
    }
    el.style.setProperty("--whites", String(whiteIndex));
  }

  flash(midi: number, kind: "good" | "bad"): void {
    const key = this.keys.get(midi);
    if (!key) return;
    key.classList.remove("good", "bad");
    void key.offsetWidth;
    key.classList.add(kind);
    setTimeout(() => key.classList.remove(kind), 500);
  }

  scrollTo(midi: number): void {
    this.keys.get(midi)?.scrollIntoView({ block: "nearest", inline: "center" });
  }
}
