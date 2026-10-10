// Each beat flashes the strip in a new random deep color, then it goes pitch black until the next one.
import { FLASH_SETTINGS, beatFlasher, pickOther } from "./flash.js";

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
    ...FLASH_SETTINGS,
  ],

  palette: (settings) => settings.colors.filter((id) => LED[id]).map((id) => LED[id]),

  create() {
    // Never the same color twice in a row (unless only one is chosen).
    let settings;
    const flash = beatFlasher((current) => pickOther(settings.colors.filter((id) => LED[id]).map((id) => LED[id]), current));
    return {
      frame(f) {
        settings = f.settings;
        return flash(f);
      },
    };
  },
};
