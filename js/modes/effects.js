// The controller's own built-in patterns, which can show several colors along the strip.
import { CMD } from "../protocol.js";

// Names known from elkbledom for MELK-Ox controllers; other ids may work too, so the stepper covers 0-255.
const KNOWN = { 0: "Auto play", 1: "Magic back", 16: "Rainbow cycle", 32: "Color wave", 48: "Breathing", 64: "Strobe", 128: "Jump RGB", 144: "Fade RGB", 207: "Scroll" };

export default {
  id: "effects",
  name: "Built-in Effects",
  description: "Patterns stored in the controller. Step through the numbers to find the ones you like.",
  usesMic: false,
  settings: [
    { key: "effect", label: "Effect number", type: "number", min: 0, max: 255, default: 0, names: KNOWN },
    { key: "speed", label: "Speed", type: "range", min: 0, max: 100, default: 50, unit: "%" },
  ],

  create() {
    return {
      // Only send when something changed, so the effect isn't restarted every frame.
      frame({ settings }) {
        return { raw: [CMD.effect(settings.effect), CMD.effectSpeed(settings.speed)] };
      },
    };
  },
};
