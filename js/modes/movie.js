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
    { key: "grays", label: "Black and white on screen", type: "choice", options: [["on", "Add gray shades"], ["off", "Skip"]], default: "on" },
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

    // The colors to pulse through, each { hue, sat, lum }: screen colors are full saturation and strength,
    // gray shades have no saturation and their own lightness. Hue is eased around the color wheel, and
    // saturation and lightness separately, so two colors never blend through a pale tint.
    let targets = [{ hue: 0, sat: 1, lum: 1 }], targetScene = 1; // deep red until the screen gives colors
    let hue = 0, sat = 1, lum = 1, scene = 0, env = 0, step = 0;
    let lastSample = -Infinity, lastNow = null, first = true;
    let prevEnergy = 0, lastBeat = -Infinity, lastCycle = 0;

    function sample(count, grays) {
      if (!screen?.frame || !screen.w) return;
      g.drawImage(screen.frame, 0, 0, W, H);
      const data = g.getImageData(0, 0, W, H).data;
      // How much of the picture is lit: a dark scene (or a black screen) takes the lights down with it.
      // Letterbox bars are only part of the frame, so they don't dim a bright film.
      // Also how much of it is black or near-black, and how much is white or light gray.
      let lit = 0, dark = 0, light = 0;
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
        if (max > 40) lit++;
        if (max - min > max * 0.25) continue; // has real color
        if (max < 50) dark++;
        else if (max > 180) light++;
      }
      const n = W * H;
      targetScene = Math.min(1, lit / n / 0.15);
      // The strongest colors on screen, most prominent first.
      const list = paletteOf(data, count).map((c) => ({ hue: hueOf(c[0], c[1], c[2], Math.max(...c), Math.min(...c)), sat: 1, lum: 1 }));
      // Black on screen adds dark gray shades, white adds light gray shades. With black showing, the dark
      // grays carry the darkness, so the lights stay on instead of going out.
      if (grays) {
        if (dark > n * 0.1) { list.push({ sat: 0, lum: 0.12 }, { sat: 0, lum: 0.25 }); targetScene = 1; }
        if (light > n * 0.1) list.push({ sat: 0, lum: 0.6 }, { sat: 0, lum: 0.85 });
      }
      // Nothing usable (a gray scene with grays off, say) keeps the last colors.
      if (!list.length) return;
      targets = list;
      live.colors = list.map(rgbOf);
      // Start on the screen's first color, not glide in from red.
      if (first) { ({ sat, lum } = list[0]); hue = list[0].hue ?? hue; first = false; }
    }

    return {
      frame({ audio, now, settings }) {
        const dt = lastNow === null ? 0 : Math.min(200, now - lastNow);
        lastNow = now;
        if (now - lastSample > SAMPLE_MS) {
          lastSample = now;
          // A bad screen frame must not stop the lights; the last color stays.
          try { sample(settings.count, settings.grays === "on"); } catch (e) { console.warn("Movie mode couldn't read the screen", e); }
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
        const target = targets[step % targets.length];

        // Glide toward that color, the short way round the color wheel. A gray keeps the last hue.
        const k = 1 - Math.exp(-dt / (settings.smooth / 3));
        if (target.sat) {
          let d = target.hue - hue;
          d -= Math.round(d);
          hue = (((hue + d * k) % 1) + 1) % 1;
        }
        sat += (target.sat - sat) * k;
        lum += (target.lum - lum) * k;
        scene += (targetScene - scene) * k;

        const depth = settings.depth / 100;
        let out = scene * (1 - depth + depth * wave);
        if (out < 0.04) out = 0; // the strip glows unevenly when barely on, so go fully dark instead

        const [r, g2, b] = rgbOf({ hue, sat, lum });
        return { r: r * out, g: g2 * out, b: b * out };
      },
      stop() {
        screen?.stop();
        live.colors = [];
      },
    };
  },
};

// 0-255 LED values for { hue, sat, lum }: the pure hue mixed toward gray by (1 - sat), at lum strength.
function rgbOf({ hue = 0, sat, lum }) {
  return fromHue(hue).map((v) => (v * sat + 255 * (1 - sat)) * lum);
}
