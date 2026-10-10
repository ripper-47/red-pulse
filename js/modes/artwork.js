// Each beat flashes a color taken from the album cover of the song playing, then the lights go black.
// The cover comes from the Music app on a Mac (through helper/now-playing.py), from the shared screen
// (a box drawn around it, re-read every second so it follows the song), or from a picture chosen on the device.
import { canShareAudio } from "../audio.js";
import { FLASH_SETTINGS, beatFlasher, pickOther } from "./flash.js";

// Until there is a cover to read (or for one with no real color): Dark Colors' deep colors, as many as asked
// for: deep red, dark blue, purple, wine magenta, burnt orange, indigo.
const FALLBACK = [[255, 0, 0], [0, 0, 255], [120, 0, 255], [255, 0, 110], [255, 50, 0], [50, 0, 255]];
const colorsFor = (settings) => (live.palette.length ? live.palette : FALLBACK.slice(0, settings.count));
const SAMPLE_MS = 1000;

// Shared between the running mode and its settings panel.
const live = { screen: null, picture: null, pictureSrc: "", palette: [], view: null };

// The Mac helper that reports what the Music app is playing (helper/now-playing.py).
const HELPER = "http://127.0.0.1:47800";
export const HELPER_CMD = "curl -fsSL https://ripper-47.github.io/red-pulse/helper/now-playing.py | python3 -";
const music = { img: null, song: null, state: "idle", busy: false, lastPoll: -Infinity };

export default {
  id: "artwork",
  name: "Album Art",
  description: "Each beat flashes a color from the song's album cover, then the lights go off until the next beat.",
  usesMic: true,
  usesScreen: true, // asks for a sharper screen picture when sharing, so a small cover can be read
  settings: [
    { key: "art", label: "Album cover", type: "custom", default: { use: canShareAudio ? "music" : "picture", screen: null, picture: null, crop: null }, render },
    { key: "count", label: "Colors per cover", type: "range", min: 1, max: 6, default: 4 },
    ...FLASH_SETTINGS,
  ],

  // Shown under the lamp: the cover's colors, or the stand-ins until there is a cover.
  palette: colorsFor,

  create({ stream } = {}) {
    const track = stream?.getVideoTracks()[0];
    live.screen = track ? watchScreen(track) : null;
    let settings, lastSample = -Infinity;
    const flash = beatFlasher((current) => {
      const list = colorsFor(settings);
      return pickOther(list, list.find((c) => current && c.join() === current.join()));
    });
    live.view?.draw();
    return {
      frame(f) {
        settings = f.settings;
        if (f.now - lastSample > SAMPLE_MS) {
          lastSample = f.now;
          // A bad screen frame or cover must not stop the flashing; the last colors stay in use.
          try { refresh(settings); } catch (e) { console.warn("Album Art couldn't read the cover", e); }
        }
        return flash(f);
      },
      stop() {
        live.screen?.stop();
        live.screen = null;
        live.view?.draw();
      },
    };
  },
};

// ---- Reading the cover ----

// The image and the box (fractions of it) the colors come from right now, or null.
function source(art) {
  if (art.use === "music") {
    const img = music.img;
    return img ? { img, w: img.width, h: img.height, box: { x: 0, y: 0, w: 1, h: 1 } } : null;
  }
  if (art.use === "screen") {
    const s = live.screen;
    return s?.frame && art.screen ? { img: s.frame, w: s.w, h: s.h, box: art.screen } : null;
  }
  const img = loadPicture(art.picture);
  return img?.naturalWidth ? { img, w: img.naturalWidth, h: img.naturalHeight, box: art.crop || { x: 0, y: 0, w: 1, h: 1 } } : null;
}

const sampler = document.createElement("canvas");
// Read at 96×96 without smoothing, so thin colored lettering on a plain cover keeps its real color
// instead of being blended into the background.
const N = 96;
sampler.width = sampler.height = N;
const sctx = sampler.getContext("2d", { willReadFrequently: true });
sctx.imageSmoothingEnabled = false;

function refresh(settings) {
  if (settings.art.use === "music") pollMusic();
  const src = source(settings.art);
  if (src) {
    const { img, w, h, box } = src;
    sctx.drawImage(img, box.x * w, box.y * h, Math.max(1, box.w * w), Math.max(1, box.h * h), 0, 0, N, N);
    live.palette = paletteOf(sctx.getImageData(0, 0, N, N).data, settings.count);
  } else {
    live.palette = [];
  }
  live.view?.draw();
}

// Asks the helper what's playing every two seconds, and fetches the cover when the song changes.
async function pollMusic() {
  const now = performance.now();
  if (music.busy || now - music.lastPoll < 1500) return;
  music.busy = true; music.lastPoll = now;
  const before = music.state + (music.song?.id || "");
  try {
    const song = await (await fetch(HELPER + "/now", { cache: "no-store" })).json();
    music.state = song.playing ? "playing" : "paused";
    if (song.playing && song.id !== music.song?.id) {
      const r = await fetch(HELPER + "/art", { cache: "no-store" });
      music.img = r.ok ? await createImageBitmap(await r.blob()) : null;
      music.song = song;
    }
  } catch {
    music.state = "nohelper";
  } finally {
    music.busy = false;
  }
  if (music.state + (music.song?.id || "") !== before) live.view?.changed();
}

// The cover's main colors, most prominent first, made vivid for the LEDs (they can't show dark or gray).
// Pixels are grouped by hue; near-black and gray pixels are skipped, and close hues count as one color.
export function paletteOf(data, count) {
  const BINS = 24;
  const weight = new Float64Array(BINS), sum = Array.from({ length: BINS }, () => [0, 0, 0]);
  let total = 0, colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max / 255, s = max ? (max - min) / max : 0;
    if (v < 0.12 || s < 0.25) continue;
    colored++;
    const wt = s * s * v;
    const bin = Math.floor(hueOf(r, g, b, max, min) * BINS) % BINS;
    weight[bin] += wt; total += wt;
    sum[bin][0] += r * wt; sum[bin][1] += g * wt; sum[bin][2] += b * wt;
  }
  // Fewer than 0.3% colored pixels is noise. A black-and-white cover gives no colors, so the stand-in
  // deep colors play (never white: the strip shows stray colors in white and pale tints).
  if (colored < (data.length / 4) * 0.003) return [];
  // Exactly `count` colors. First the cover's strongest hues, kept at least 30° apart; then any other hue
  // it really uses; then, if the cover has fewer hues than asked for, close neighbours of its own hues
  // (15° steps), so a red cover gives reds, crimsons and oranges rather than unrelated colors.
  const binDist = (a, b) => Math.min(Math.abs(a - b), BINS - Math.abs(a - b));
  const order = [...weight.keys()].filter((b) => weight[b] > total * 0.005).sort((a, b) => weight[b] - weight[a]);
  const picked = [];
  for (const [minGap, minShare] of [[2, 0.03], [1, 0.005]]) {
    for (const bin of order) {
      if (picked.length >= count) break;
      if (weight[bin] < total * minShare || picked.some((p) => binDist(p, bin) < minGap)) continue;
      picked.push(bin);
    }
  }
  const colors = picked.map((bin) => vivid(sum[bin].map((c) => c / weight[bin])));
  const used = new Set(picked);
  for (let step = 1; colors.length < count && step < BINS / 2; step++) {
    for (const bin of picked) {
      for (const n of [(bin + step) % BINS, (bin - step + BINS) % BINS]) {
        if (colors.length >= count || used.has(n)) continue;
        used.add(n);
        // Same offset from the cover's own hue (not the bin's center), so the neighbours stay close to it.
        const [r, g, b] = colors[picked.indexOf(bin)];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const off = (n - bin + BINS) % BINS <= BINS / 2 ? step : -step;
        colors.push(fromHue(hueOf(r, g, b, max, min) + off / BINS));
      }
    }
  }
  return colors;
}

// A pure, fully saturated color for a hue (0..1, wraps), as 0-255 LED values.
function fromHue(hue) {
  const h = (((hue % 1) + 1) % 1) * 6;
  const f = (n) => { const k = (n + h) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); };
  return [f(5), f(3), f(1)];
}

function hueOf(r, g, b, max, min) {
  const d = max - min || 1;
  const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  return ((h / 6) % 1 + 1) % 1;
}

// Same hue at full strength and full saturation, as 0-255 LED values. The strip shows stray colors in
// light tints (all three channels lit), so the weakest channel is always off.
function vivid([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const s = 1;
  const h = hueOf(r, g, b, max, min) * 6;
  const f = (n) => {
    const k = (n + h) % 6;
    return Math.round(255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

// Keeps the latest picture of the shared screen. Chrome's track processor keeps delivering frames while the
// tab is in the background; a video element is the fallback.
function watchScreen(track) {
  const s = { frame: null, w: 0, h: 0, stop() {} };
  if (window.MediaStreamTrackProcessor) {
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    let on = true;
    (async () => {
      while (true) {
        const { value, done } = await reader.read().catch(() => ({ done: true }));
        if (done) break;
        if (!on) { value.close(); break; }
        s.frame?.close();
        s.frame = value; s.w = value.displayWidth; s.h = value.displayHeight;
      }
    })();
    s.stop = () => { on = false; reader.cancel().catch(() => {}); s.frame?.close(); s.frame = null; };
  } else {
    const v = Object.assign(document.createElement("video"), { muted: true, playsInline: true, srcObject: new MediaStream([track]) });
    v.play().catch(() => {});
    Object.defineProperties(s, {
      frame: { get: () => (v.videoWidth ? v : null) },
      w: { get: () => v.videoWidth },
      h: { get: () => v.videoHeight },
    });
    s.stop = () => { v.srcObject = null; };
  }
  return s;
}

function loadPicture(src) {
  if (src !== live.pictureSrc) {
    live.pictureSrc = src || "";
    live.picture = null;
    if (src) {
      const img = new Image();
      img.onload = () => { if (live.pictureSrc === src) { live.picture = img; live.view?.changed(); } };
      img.src = src;
    }
  }
  return live.picture;
}

// A chosen photo, shrunk so it fits in the browser's saved settings.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("couldn't open that picture")); };
    img.src = url;
  });
}

// ---- Settings panel: a preview of the screen or picture, where a box is dragged around the cover ----

function render(field, ctx) {
  const el = (tag, cls, props) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, props);
  const seg = el("div", "seg");
  const musicBtn = el("button", "", { textContent: "Music app" });
  const screenBtn = el("button", "", { textContent: "Screen" });
  const pictureBtn = el("button", "", { textContent: "Picture" });
  seg.append(musicBtn, screenBtn, pictureBtn);
  seg.style.gridTemplateColumns = "repeat(3, 1fr)";
  const canvas = el("canvas", "art-view");
  const note = el("p", "hint");
  const file = el("input", "", { type: "file", accept: "image/*", hidden: true });
  const choose = el("button", "art-choose", { textContent: "Choose a picture" });
  // The command that starts the Music app helper, with a Copy button.
  const setup = el("div", "art-setup");
  const cmd = el("code", "", { textContent: HELPER_CMD });
  const copy = el("button", "art-choose", { textContent: "Copy command" });
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(HELPER_CMD); copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy command"), 2000); }
    catch { getSelection().selectAllChildren(cmd); }
  };
  const setupLabel = el("p", "hint art-setup-label", { textContent: "Helper command for Terminal" });
  setup.append(setupLabel, cmd, copy);
  if (canShareAudio) field.append(seg);
  field.append(canvas, note, setup, choose, file);

  const art = () => ctx.get();
  const update = (patch) => { ctx.set({ ...art(), ...patch }); view.changed(); };
  musicBtn.onclick = () => update({ use: "music" });
  screenBtn.onclick = () => update({ use: "screen" });
  pictureBtn.onclick = () => update({ use: "picture" });
  choose.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0]; file.value = "";
    if (!f) return;
    try { update({ use: "picture", picture: await shrink(f), crop: null }); }
    catch (e) { note.textContent = "Couldn't open that picture. Try a JPEG or PNG."; }
  };

  // Dragging on the preview sets the box (as fractions of the image).
  let drag = null;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  canvas.onpointerdown = (e) => { if (art().use === "music") return; canvas.setPointerCapture(e.pointerId); drag = { from: at(e), box: null }; };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    const [x0, y0] = drag.from, [x1, y1] = at(e);
    drag.box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    view.draw();
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    const box = drag?.box; drag = null;
    if (box && box.w > 0.005 && box.h > 0.005) update(art().use === "screen" ? { screen: box } : { crop: box });
    else view.draw();
  };

  // While stopped, keep checking the Music app so the cover and colors show before Start.
  // Moving "Colors per cover" re-reads the cover right away, so the preview always shows that many colors.
  let lastCount = ctx.settings.count;
  const poll = setInterval(() => {
    if (!canvas.isConnected) return clearInterval(poll);
    if (art().use === "music") pollMusic();
    if (ctx.settings.count !== lastCount) { lastCount = ctx.settings.count; view.changed(); }
  }, 250);

  const view = {
    // Settings changed: re-read the colors now instead of waiting for the next sample.
    changed() { refresh(ctx.settings); },
    draw() {
      if (!canvas.isConnected) { if (live.view === view) live.view = null; clearInterval(poll); return; }
      const a = art();
      musicBtn.classList.toggle("sel", a.use === "music");
      screenBtn.classList.toggle("sel", a.use === "screen");
      pictureBtn.classList.toggle("sel", a.use === "picture");
      choose.hidden = a.use !== "picture";
      const img = a.use === "music" ? music.img : a.use === "screen" ? live.screen?.frame : loadPicture(a.picture);
      const [w, h] = a.use === "music" ? [img?.width, img?.height] : a.use === "screen" ? [live.screen?.w, live.screen?.h] : [img?.naturalWidth, img?.naturalHeight];
      canvas.classList.toggle("art-cover", a.use === "music");
      // Always there on the Music app tab, so the command is at hand each time the helper needs starting.
      setup.hidden = a.use !== "music";
      setupLabel.hidden = music.state === "nohelper"; // the note above already introduces it
      canvas.hidden = !(img && w);
      if (!canvas.hidden) {
        canvas.width = 640; canvas.height = Math.round((640 * h) / w);
        const g = canvas.getContext("2d");
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        const box = drag?.box || (a.use === "screen" ? a.screen : a.crop);
        if (box) {
          const [x, y, bw, bh] = [box.x * canvas.width, box.y * canvas.height, box.w * canvas.width, box.h * canvas.height];
          g.fillStyle = "rgba(0,0,0,.55)";
          g.beginPath(); g.rect(0, 0, canvas.width, canvas.height); g.rect(x, y, bw, bh); g.fill("evenodd");
          g.strokeStyle = "#efe7dc"; g.lineWidth = 3; g.strokeRect(x, y, bw, bh);
        }
      }
      note.textContent =
        a.use === "music"
          ? music.state === "nohelper" ? "To read covers from the Music app, run this in Terminal on your Mac and leave that window open while music plays. If Chrome asks to reach devices on your network, allow it."
          : music.state === "idle" ? "Looking for the Music app…"
          : music.state === "paused" ? "Music isn't playing. The colors follow the next song that plays."
          : music.song ? `Now playing: ${music.song.title} · ${music.song.artist}${music.img ? "" : " (no cover found)"}` : ""
          : a.use === "screen"
          ? !live.screen ? "With Sound from set to Music on this computer, press Start and share the screen showing Spotify or Music."
          : !w ? "Waiting for the shared screen…"
          : !a.screen ? "Drag a box around the album cover. The colors follow it each time the song changes."
          : "Reading the cover every second. Drag again if it moved."
          : !a.picture ? "Choose a picture of the album cover. A screenshot of the Now Playing screen works."
          : "Drag a box to use only part of the picture.";
    },
  };
  live.view = view;
  view.changed();
}
