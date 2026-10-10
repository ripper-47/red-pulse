// Shared by the flash modes: each beat flashes the strip in a new color, then it goes black until the next one.
import { AdaptiveLevel } from "../audio.js";

// The beat and flash controls, listed after a mode's own color settings.
export const FLASH_SETTINGS = [
  { key: "style", label: "Between beats", type: "choice", options: [["cut", "Snap off"], ["fade", "Fade out"]], default: "cut" },
  { key: "sens", label: "Sensitivity", type: "range", min: 0, max: 100, default: 60, unit: "%" },
  { key: "bass", label: "Bass focus", type: "range", min: 0, max: 100, default: 70, unit: "%" },
  { key: "gap", label: "Min time between colors", type: "range", min: 100, max: 1500, default: 250, unit: " ms" },
  { key: "flash", label: "Flash length", type: "range", min: 30, max: 600, default: 150, unit: " ms" },
];

// Returns a frame function. pick(current) gives the next [r, g, b] on each beat (current is the one showing, or null).
export function beatFlasher(pick) {
  const adaptive = new AdaptiveLevel();
  let prevEnergy = 0, lastSwitch = -Infinity;
  let current = null;

  return ({ audio, now, settings }) => {
    const mix = settings.bass / 100;
    const energy = audio.rms * (1 - mix) + audio.bass * mix;
    const level = adaptive.update(energy, settings.sens / 100);

    // Beat: a loud moment with a sudden jump in energy, spaced at least `gap` apart.
    const jump = energy - prevEnergy;
    if (level > 0.55 && jump > (adaptive.peak - adaptive.noise) * 0.12 && now - lastSwitch > settings.gap) {
      current = pick(current) || current;
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
    const [r, g, b] = current;
    return { r: r * out, g: g * out, b: b * out };
  };
}

// A random entry of the list that isn't `current` (unless it's the only one).
export function pickOther(list, current) {
  const pool = list.filter((c) => c !== current);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : list[0];
}
