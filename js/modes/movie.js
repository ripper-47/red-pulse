// The lights take the main colors of whatever is on the computer's screen and pulse softly, gliding to the
// next of those colors with each pulse instead of flashing. Dark scenes take the lights down with them.
import { AdaptiveLevel } from "../audio.js";
import { paletteOf, fromHue, hueOf, watchScreen } from "./artwork.js";

const SAMPLE_MS = 120; // how often the screen is read
const W = 64, H = 36; // the picture is shrunk to this before reading its color

// The screen's colors right now, for the chips under the lamp.
const live = { colors: [] };

export default {
  id: "movie",
  name: "Movie",
  description: "The lights pulse softly through the main colors on your computer's screen, moving to the next color with each pulse. Press Start and share the screen or the tab with the movie, with its sound.",
  usesMic: true,
  sharesScreen: true, // always shares the screen and its sound, whatever "Sound from" says
  screenFps: 10,
  settings: [
    { key: "pulse", label: "Pulse", type: "choice", options: [["sound", "With the sound"], ["breathe", "Slow breathe"], ["steady", "Steady"]], default: "sound" },
    { key: "count", label: "Colors from the screen", type: "range", min: 1, max: 5, default: 3 },
    { key: "depth", label: "Pulse depth", type: "range", min: 0, max: 100, default: 60, unit: "%" },
    { key: "smooth", label: "Color change time", type: "range", min: 100, max: 3000, step: 100, default: 800, unit: " ms" },
    { key: "sens", label: "Sensitivity", type: "range", min: 0, max: 100, default: 60, unit: "%" },
  ],

  palette: () => live.colors,

  create({ stream } = {}) {
    const track = stream?.getVideoTracks()[0];
    const screen = track ? watchScreen(track) : null;
    const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const adaptive = new AdaptiveLevel();

    // Where the lights are heading (from the screen) and where they are now. Hue is eased around the color
    // wheel at full saturation, never through the grays and whites a straight RGB blend would pass.
    let hues = [0], targetScene = 1; // deep red until the screen gives colors
    let hue = 0, scene = 0, env = 0, step = 0;
    let lastSample = -Infinity, lastNow = null, first = true;
    let prevEnergy = 0, lastBeat = -Infinity, lastCycle = 0;

    function sample(count) {
      if (!screen?.frame || !screen.w) return;
      g.drawImage(screen.frame, 0, 0, W, H);
      const data = g.getImageData(0, 0, W, H).data;
      // How much of the picture is lit: a dark scene (or a black screen) takes the lights down with it.
      // Letterbox bars are only part of the frame, so they don't dim a bright film.
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) if (Math.max(data[i], data[i + 1], data[i + 2]) > 40) lit++;
      targetScene = Math.min(1, lit / (W * H) / 0.15);
      // The strongest colors on screen, most prominent first. A scene with no real color (gray, black and
      // white) keeps the last ones.
      const colors = paletteOf(data, count);
      if (!colors.length) return;
      live.colors = colors;
      hues = colors.map((c) => hueOf(c[0], c[1], c[2], Math.max(...c), Math.min(...c)));
      if (first) { hue = hues[0]; first = false; } // start on the screen's color, not glide in from red
    }

    return {
      frame({ audio, now, settings }) {
        const dt = lastNow === null ? 0 : Math.min(200, now - lastNow);
        lastNow = now;
        if (now - lastSample > SAMPLE_MS) {
          lastSample = now;
          // A bad screen frame must not stop the lights; the last color stays.
          try { sample(settings.count); } catch (e) { console.warn("Movie mode couldn't read the screen", e); }
        }

        // Pulse: brightness rises and falls smoothly, between (1 - depth) and full. Never a flash.
        // Each new pulse moves on to the next of the screen's colors.
        let wave = 1;
        if (settings.pulse === "sound" && audio) {
          const energy = audio.rms * 0.4 + audio.bass * 0.6;
          const level = adaptive.update(energy, settings.sens / 100);
          // A pulse starts on a loud moment with a sudden jump in energy, at most every 400 ms.
          if (level > 0.55 && energy - prevEnergy > (adaptive.peak - adaptive.noise) * 0.12 && now - lastBeat > 400) { step++; lastBeat = now; }
          prevEnergy = energy * 0.6 + prevEnergy * 0.4;
          // Quick but soft rise, slow fall.
          const rate = level > env ? 1 - Math.exp(-dt / 70) : 1 - Math.exp(-dt / 450);
          env += (level - env) * rate;
          wave = env;
        } else if (settings.pulse === "breathe") {
          // One breath every 4 s; the color moves on at the dimmest point, between breaths.
          wave = 0.5 - 0.5 * Math.cos((now / 4000) * 2 * Math.PI);
          const cycle = Math.floor(now / 4000);
          if (cycle !== lastCycle) { step++; lastCycle = cycle; }
        } else if (now - lastBeat > 3000) {
          step++; lastBeat = now; // steady: a new color every 3 s
        }
        const targetHue = hues[step % hues.length];

        // Glide toward that color, the short way round the color wheel.
        const k = 1 - Math.exp(-dt / (settings.smooth / 3));
        let d = targetHue - hue;
        d -= Math.round(d);
        hue = (((hue + d * k) % 1) + 1) % 1;
        scene += (targetScene - scene) * k;

        const depth = settings.depth / 100;
        let out = scene * (1 - depth + depth * wave);
        if (out < 0.04) out = 0; // the strip glows unevenly when barely on, so go fully dark instead

        const [r, g2, b] = fromHue(hue);
        return { r: r * out, g: g2 * out, b: b * out };
      },
      stop() {
        screen?.stop();
        live.colors = [];
      },
    };
  },
};
