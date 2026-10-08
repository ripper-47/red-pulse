// Deep colors that jump to a new random pick on each beat, with brightness following the sound.
import { AdaptiveLevel } from "../audio.js";

// LED values for each palette color (the strip glows brighter than these look on screen).
const PALETTE = [
  [255, 0, 0],    // Deep red
  [0, 0, 255],    // Dark blue
  [120, 0, 255],  // Purple
  [255, 0, 110],  // Wine magenta
  [50, 0, 255],   // Indigo
  [255, 0, 35],   // Crimson
  [180, 0, 200],  // Plum
  [255, 50, 0],   // Burnt orange
];

export default {
  id: "dark-colors",
  name: "Dark Colors",
  description: "Deep colors that switch on every beat and pulse with the sound around your phone.",
  usesMic: true,
  settings: [
    { key: "sens", label: "Sensitivity", type: "range", min: 0, max: 100, default: 60, unit: "%" },
    { key: "floor", label: "Lowest glow", type: "range", min: 0, max: 60, default: 4, unit: "%" },
    { key: "bass", label: "Bass focus", type: "range", min: 0, max: 100, default: 70, unit: "%" },
    { key: "gap", label: "Min time between colors", type: "range", min: 100, max: 1500, default: 250, unit: " ms" },
  ],

  create() {
    const adaptive = new AdaptiveLevel();
    let env = 0, prevEnergy = 0, lastSwitch = 0;
    let current = Math.floor(Math.random() * PALETTE.length);

    // Any color except the one showing now.
    const nextColor = () => {
      const i = Math.floor(Math.random() * (PALETTE.length - 1));
      return i >= current ? i + 1 : i;
    };

    return {
      frame({ audio, now, settings }) {
        const mix = settings.bass / 100;
        const energy = audio.rms * (1 - mix) + audio.bass * mix;
        const level = adaptive.update(energy, settings.sens / 100);
        const floor = settings.floor / 100;

        // Beat: a loud moment with a sudden jump in energy, spaced at least `gap` apart.
        const jump = energy - prevEnergy;
        if (level > 0.55 && jump > (adaptive.peak - adaptive.noise) * 0.12 && now - lastSwitch > settings.gap) {
          current = nextColor();
          lastSwitch = now;
        }
        prevEnergy = energy * 0.6 + prevEnergy * 0.4;

        env = level > env ? env + (level - env) * 0.7 : env + (level - env) * 0.12; // fast attack, soft release
        const out = floor + (1 - floor) * Math.pow(env, 1.6);
        const [r, g, b] = PALETTE[current];
        return { r: r * out, g: g * out, b: b * out };
      },
    };
  },
};
