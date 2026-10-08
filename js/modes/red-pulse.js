// All-red lights that pulse or blink with sound from the phone mic.
import { AdaptiveLevel } from "../audio.js";

export default {
  id: "red-pulse",
  name: "Red Pulse",
  description: "All-red lights that pulse with the sound around your phone.",
  usesMic: true,
  settings: [
    { key: "style", label: "Style", type: "choice", options: [["pulse", "Pulse"], ["blink", "Blink"]], default: "pulse" },
    { key: "sens", label: "Sensitivity", type: "range", min: 0, max: 100, default: 60, unit: "%" },
    { key: "bass", label: "Bass focus", type: "range", min: 0, max: 100, default: 70, unit: "%" },
  ],

  create() {
    const adaptive = new AdaptiveLevel();
    let env = 0, prevEnergy = 0, blinkUntil = 0;
    const BLACK = 0.08; // below this the strip goes fully dark instead of glowing faintly

    return {
      // Called every animation frame. Returns { r, g, b } (0-255) or null to send nothing.
      frame({ audio, now, settings }) {
        const mix = settings.bass / 100;
        const energy = audio.rms * (1 - mix) + audio.bass * mix;
        const level = adaptive.update(energy, settings.sens / 100);
        let out;

        if (settings.style === "pulse") {
          env = level > env ? level : env + (level - env) * 0.2; // instant attack, quick release
          out = Math.pow(env, 1.6);
          if (out < BLACK) out = 0;
        } else {
          // Blink: flash on a sudden jump in energy, hold briefly, pitch black otherwise.
          const jump = energy - prevEnergy;
          if (level > 0.55 && jump > (adaptive.peak - adaptive.noise) * 0.12 && now > blinkUntil - 40) blinkUntil = now + 110;
          out = now <= blinkUntil ? 1 : 0;
        }
        prevEnergy = energy * 0.6 + prevEnergy * 0.4;
        return { r: out * 255, g: 0, b: 0 };
      },
    };
  },
};
