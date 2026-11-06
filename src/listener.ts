import { PitchDetector } from "pitchy";
import { freqToMidi } from "./notes";

export interface HeardNote {
  midi: number; // rounded MIDI note number
  cents: number; // deviation from the rounded note
}

export interface ListenerOptions {
  onNote: (note: HeardNote) => void; // fired once per detected note onset
  onFrame?: (note: HeardNote | null, level: number) => void; // every analysis frame
}

const MIN_CLARITY = 0.9;
const MIN_LEVEL = 0.01; // RMS below this counts as silence
const STABLE_FRAMES = 3; // consecutive frames of the same pitch before we trust it
const REATTACK_RATIO = 1.6; // level jump that counts as a new strike of the same key

/**
 * Listens to the microphone and reports note onsets. Monophonic: it hears one note at a time,
 * which is what single-mic pitch detection can do reliably.
 */
export class Listener {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private raf = 0;

  constructor(private opts: ListenerOptions) {}

  get running(): boolean {
    return !!this.ctx;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 4096;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    const detector = PitchDetector.forFloat32Array(buf.length);
    const sampleRate = this.ctx.sampleRate;

    let candidate = -1;
    let candidateFrames = 0;
    let emitted = -1; // note currently "held" (already reported)
    let minLevelSinceEmit = Infinity;

    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const s of buf) sum += s * s;
      const level = Math.sqrt(sum / buf.length);

      let heard: HeardNote | null = null;
      if (level > MIN_LEVEL) {
        const [freq, clarity] = detector.findPitch(buf, sampleRate);
        if (clarity > MIN_CLARITY && freq > 25 && freq < 4500) {
          const exact = freqToMidi(freq);
          const midi = Math.round(exact);
          heard = { midi, cents: Math.round((exact - midi) * 100) };
        }
      }

      if (level < MIN_LEVEL) emitted = -1; // silence releases the held note
      minLevelSinceEmit = Math.min(minLevelSinceEmit, level);

      if (heard) {
        candidateFrames = heard.midi === candidate ? candidateFrames + 1 : 1;
        candidate = heard.midi;
        const reattack = heard.midi === emitted && level > minLevelSinceEmit * REATTACK_RATIO;
        if (candidateFrames >= STABLE_FRAMES && (heard.midi !== emitted || reattack)) {
          emitted = heard.midi;
          minLevelSinceEmit = level;
          this.opts.onNote(heard);
        }
      } else {
        candidateFrames = 0;
        candidate = -1;
      }

      this.opts.onFrame?.(heard, level);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = undefined;
  }
}
