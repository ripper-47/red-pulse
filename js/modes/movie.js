// The lights take the main color of whatever is on the computer's screen and glide between colors as the
// picture changes, pulsing softly instead of flashing. Dark scenes take the lights down with them.
import { AdaptiveLevel } from "../audio.js";
import { paletteOf, fromHue, hueOf, watchScreen } from "./artwork.js";

const SAMPLE_MS = 120; // how often the screen is read
const W = 64, H = 36; // the picture is shrunk to this before reading its color

// The color being shown now, for the chip under the lamp.
const live = { color: null };

export default {
  id: "movie",
  name: "Movie",
  description: "The lights follow the main color on your computer's screen and pulse softly with it. Press Start and share the screen or the tab with the movie, with its sound.",
  usesMic: true,
  sharesScreen: true, // always shares the screen and its sound, whatever "Sound from" says
  screenFps: 10,
  settings: [
    { key: "pulse", label: "Pulse", type: "choice", options: [["sound", "With the sound"], ["breathe", "Slow breathe"], ["steady", "Steady"]], default: "sound" },
    { key: "depth", label: "Pulse depth", type: "range", min: 0, max: 100, default: 60, unit: "%" },
    { key: "smooth", label: "Color change time", type: "range", min: 100, max: 3000, step: 100, default: 800, unit: " ms" },
    { key: "sens", label: "Sensitivity", type: "range", min: 0, max: 100, default: 60, unit: "%" },
  ],

  palette: () => (live.color ? [live.color] : []),

  create({ stream } = {}) {
    const track = stream?.getVideoTracks()[0];
    const screen = track ? watchScreen(track) : null;
    const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const adaptive = new AdaptiveLevel();

    // Where the lights are heading (from the screen) and where they are now. Hue is eased around the color
    // wheel at full saturation, never through the grays and whites a straight RGB blend would pass.
    let targetHue = 0, targetScene = 1; // deep red until the screen gives a color
    let hue = 0, scene = 0, env = 0;
    let lastSample = -Infinity, lastNow = null, first = true;

    function sample() {
      if (!screen?.frame || !screen.w) return;
      g.drawImage(screen.frame, 0, 0, W, H);
      const data = g.getImageData(0, 0, W, H).data;
      // How much of the picture is lit: a dark scene (or a black screen) takes the lights down with it.
      // Letterbox bars are only part of the frame, so they don't dim a bright film.
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) if (Math.max(data[i], data[i + 1], data[i + 2]) > 40) lit++;
      targetScene = Math.min(1, lit / (W * H) / 0.15);
      // The strongest color on screen. A scene with no real color (gray, black and white) keeps the last one.
      const [c] = paletteOf(data, 1);
      if (c) targetHue = hueOf(c[0], c[1], c[2], Math.max(...c), Math.min(...c));
      if (c && first) { hue = targetHue; first = false; } // start on the screen's color, not glide in from red
    }

    return {
      frame({ audio, now, settings }) {
        const dt = lastNow === null ? 0 : Math.min(200, now - lastNow);
        lastNow = now;
        if (now - lastSample > SAMPLE_MS) {
          lastSample = now;
          // A bad screen frame must not stop the lights; the last color stays.
          try { sample(); } catch (e) { console.warn("Movie mode couldn't read the screen", e); }
        }

        // Glide toward the screen's color, the short way round the color wheel.
        const k = 1 - Math.exp(-dt / (settings.smooth / 3));
        let d = targetHue - hue;
        d -= Math.round(d);
        hue = (((hue + d * k) % 1) + 1) % 1;
        scene += (targetScene - scene) * k;

        // Pulse: brightness rises and falls smoothly, between (1 - depth) and full. Never a flash.
        let wave = 1;
        if (settings.pulse === "sound" && audio) {
          const energy = audio.rms * 0.4 + audio.bass * 0.6;
          const level = adaptive.update(energy, settings.sens / 100);
          // Quick but soft rise, slow fall.
          const rate = level > env ? 1 - Math.exp(-dt / 70) : 1 - Math.exp(-dt / 450);
          env += (level - env) * rate;
          wave = env;
        } else if (settings.pulse === "breathe") {
          wave = 0.5 - 0.5 * Math.cos((now / 4000) * 2 * Math.PI);
        }
        const depth = settings.depth / 100;
        let out = scene * (1 - depth + depth * wave);
        if (out < 0.04) out = 0; // the strip glows unevenly when barely on, so go fully dark instead

        const [r, g2, b] = fromHue(hue);
        live.color = [r, g2, b];
        return { r: r * out, g: g2 * out, b: b * out };
      },
      stop() {
        screen?.stop();
        live.color = null;
      },
    };
  },
};
