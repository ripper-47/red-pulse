// Each beat flashes the strip in a new random deep color, then it goes pitch black until the next one.
import { AdaptiveLevel } from "../audio.js";

// Every color on offer: id, name, how it looks on screen, and the LED values sent to the strip
// (the strip glows brighter than the on-screen swatch).
const COLORS = [
  ["red", "Deep red", "#8b0000", [255, 0, 0]],
  ["blue", "Dark blue", "#00008b", [0, 0, 255]],
  ["purple", "Purple", "#4b0082", [120, 0, 255]],
  ["wine", "Wine magenta", "#7a0045", [255, 0, 110]],
  ["indigo", "Indigo", "#2e0a7a", [50, 0, 255]],
  ["teal", "Dark teal", "#005c5c", [0, 160, 140]],
  ["emerald", "Emerald", "#005a14", [0, 255, 50]],
  ["orange", "Burnt orange", "#8a2a00", [255, 50, 0]],
  ["crimson", "Crimson", "#7a0018", [255, 0, 35]],
  ["ocean", "Ocean blue", "#003a8a", [0, 80, 255]],
  ["plum", "Plum", "#5a0070", [180, 0, 200]],
  ["gold", "Dark gold", "#7a5a00", [255, 140, 0]],
];
const LED = Object.fromEntries(COLORS.map(([id, , , rgb]) => [id, rgb]));

export default {
  id: "dark-colors",
  name: "Dark Colors",
  description: "Each beat flashes a new deep color, then the lights go off until the next beat.",
  usesMic: true,
  settings: [
    { key: "colors", label: "Colors", type: "swatches", options: COLORS, default: ["red", "blue", "purple", "wine", "orange"] },
    { key: "style", label: "Between beats", type: "choice", options: [["cut", "Snap off"], ["fade", "Fade out"]], default: "cut" },
    { key: "sens", label: "Sensitivity", type: "range", min: 0, max: 100, default: 60, unit: "%" },
    { key: "bass", label: "Bass focus", type: "range", min: 0, max: 100, default: 70, unit: "%" },
    { key: "gap", label: "Min time between colors", type: "range", min: 100, max: 1500, default: 250, unit: " ms" },
    { key: "flash", label: "Flash length", type: "range", min: 30, max: 600, default: 150, unit: " ms" },
  ],

  create() {
    const adaptive = new AdaptiveLevel();
    let prevEnergy = 0, lastSwitch = -Infinity;
    let current = null;

    // A random chosen color, never the one showing now (unless it's the only one chosen).
    const nextColor = (chosen) => {
      const pool = chosen.filter((id) => id !== current && LED[id]);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : current;
    };

    return {
      frame({ audio, now, settings }) {
        const mix = settings.bass / 100;
        const energy = audio.rms * (1 - mix) + audio.bass * mix;
        const level = adaptive.update(energy, settings.sens / 100);

        // Beat: a loud moment with a sudden jump in energy, spaced at least `gap` apart.
        const jump = energy - prevEnergy;
        if (level > 0.55 && jump > (adaptive.peak - adaptive.noise) * 0.12 && now - lastSwitch > settings.gap) {
          current = nextColor(settings.colors);
          lastSwitch = now;
        }
        prevEnergy = energy * 0.6 + prevEnergy * 0.4;

        // Full color the instant the beat lands, then black after the flash length: snapped off, or faded.
        // A fade's dim tail still looks lit on LEDs, so snapping off is what reads as "off between beats".
        // Capped below the gap so there is always a stretch of black before the next color.
        const flash = Math.min(settings.flash, settings.gap * 0.6);
        const t = (now - lastSwitch) / flash;
        const out = settings.style === "fade" ? Math.max(0, 1 - t) : t < 1 ? 1 : 0;
        if (!current) return { r: 0, g: 0, b: 0 };
        const [r, g, b] = LED[current];
        return { r: r * out, g: g * out, b: b * out };
      },
    };
  },
};
