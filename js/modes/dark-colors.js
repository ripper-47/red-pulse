// Each beat flashes the strip in a new random deep color, which fades to pitch black before the next one.
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
  description: "Each beat flashes a new deep color, with pitch black in between.",
  usesMic: true,
  settings: [
    { key: "sens", label: "Sensitivity", type: "range", min: 0, max: 100, default: 60, unit: "%" },
    { key: "bass", label: "Bass focus", type: "range", min: 0, max: 100, default: 70, unit: "%" },
    { key: "gap", label: "Min time between colors", type: "range", min: 100, max: 1500, default: 250, unit: " ms" },
    { key: "flash", label: "Flash length", type: "range", min: 30, max: 600, default: 150, unit: " ms" },
  ],

  create() {
    const adaptive = new AdaptiveLevel();
    let prevEnergy = 0, lastSwitch = -Infinity;
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

        // Beat: a loud moment with a sudden jump in energy, spaced at least `gap` apart.
        const jump = energy - prevEnergy;
        if (level > 0.55 && jump > (adaptive.peak - adaptive.noise) * 0.12 && now - lastSwitch > settings.gap) {
          current = nextColor();
          lastSwitch = now;
        }
        prevEnergy = energy * 0.6 + prevEnergy * 0.4;

        // Full color the instant the beat lands, fading to black over the flash length.
        // Capped below the gap so there is always a moment of black before the next color.
        const flash = Math.min(settings.flash, settings.gap * 0.7);
        const out = Math.max(0, 1 - (now - lastSwitch) / flash);
        const [r, g, b] = PALETTE[current];
        return { r: r * out, g: g * out, b: b * out };
      },
    };
  },
};
