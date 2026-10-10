// UI wiring: picks a mode, feeds it mic data every frame, and sends its color to the lights.
import { CMD, hex } from "./protocol.js";
import { Lights, errText } from "./lights.js";
import { Mic, canShareAudio } from "./audio.js";
import { MODES } from "./modes/index.js";

const $ = (id) => document.getElementById(id);
function log(msg) {
  const el = $("log");
  el.textContent = (new Date().toLocaleTimeString() + "  " + msg + "\n" + el.textContent).slice(0, 4000);
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const lights = new Lights({ log, onDisconnect: () => { stop(); setConnected(false, "Disconnected"); } });
const app = { source: "mic", method: "color", mode: null, settings: {}, instance: null, mic: null, running: false, raf: 0 };

// ---- Connection ----
function setConnected(ok, text) {
  $("dot").classList.toggle("on", ok);
  $("status").textContent = text;
  for (const id of ["go", "testRed", "off"]) $(id).disabled = !ok;
  $("connect").textContent = ok ? "Disconnect" : "Connect to lights";
}

async function connect() {
  if (lights.connected) { await stop(); lights.disconnect(); return; }
  try {
    await lights.connect({
      showAll: $("showAll").checked,
      onStep: (s) => setConnected(false, s === "choosing device" ? "Choose your lights in the list…" : "Connecting to " + lights.name + "…"),
    });
    setConnected(true, "Connected to " + lights.name);
  } catch (e) {
    log("connect failed " + errText(e));
    setConnected(false, e && e.name === "NotFoundError" ? "No device chosen" : "Couldn't connect " + errText(e));
  }
}

// ---- Mode picker and settings, built from each mode's `settings` list ----
function selectMode(id) {
  if (app.running) stop();
  app.mode = MODES.find((m) => m.id === id) || MODES[0];
  const saved = store.get("settings:" + app.mode.id) || {};
  app.settings = Object.fromEntries(app.mode.settings.map((s) => [s.key, saved[s.key] ?? s.default]));
  $("title").textContent = app.mode.name;
  $("modeDesc").textContent = app.mode.description || "";
  renderSettings();
  store.set("mode", app.mode.id);
}

function renderSettings() {
  const box = $("settings");
  box.innerHTML = "";
  const save = () => store.set("settings:" + app.mode.id, app.settings);
  for (const s of app.mode.settings) {
    const label = document.createElement("label");
    label.textContent = s.label;
    box.append(label);
    if (s.type === "choice") {
      const seg = document.createElement("div");
      seg.className = "seg";
      seg.style.gridTemplateColumns = `repeat(${s.options.length}, 1fr)`;
      for (const [value, text] of s.options) {
        const b = document.createElement("button");
        b.textContent = text;
        b.classList.toggle("sel", app.settings[s.key] === value);
        b.onclick = () => { app.settings[s.key] = value; for (const x of seg.children) x.classList.toggle("sel", x === b); save(); };
        seg.append(b);
      }
      box.append(seg);
    } else if (s.type === "range") {
      const val = document.createElement("span");
      const input = Object.assign(document.createElement("input"), { type: "range", min: s.min, max: s.max, step: s.step ?? 1, value: app.settings[s.key] });
      const show = () => (val.textContent = input.value + (s.unit || ""));
      input.oninput = () => { app.settings[s.key] = +input.value; show(); save(); };
      show();
      label.append(val);
      box.append(input);
    } else if (s.type === "number") {
      // Stepper for picking exact values on a phone, with an optional name per value.
      const row = document.createElement("div");
      row.className = "grid3";
      const minus = Object.assign(document.createElement("button"), { textContent: "−" });
      const plus = Object.assign(document.createElement("button"), { textContent: "+" });
      const val = document.createElement("div");
      val.className = "stepper-val";
      const show = () => { const v = app.settings[s.key]; val.textContent = v + (s.names?.[v] ? " · " + s.names[v] : ""); };
      const step = (d) => { app.settings[s.key] = Math.min(s.max, Math.max(s.min, app.settings[s.key] + d)); show(); save(); };
      minus.onclick = () => step(-1); plus.onclick = () => step(1);
      show();
      row.append(minus, val, plus);
      box.append(row);
    } else if (s.type === "swatches") {
      // Tap colors on or off; at least one always stays on.
      const grid = document.createElement("div");
      grid.className = "swatches";
      for (const [value, name, hex] of s.options) {
        const b = Object.assign(document.createElement("button"), { title: name });
        b.style.background = hex;
        b.append(Object.assign(document.createElement("span"), { textContent: name }));
        b.classList.toggle("sel", app.settings[s.key].includes(value));
        b.onclick = () => {
          const on = app.settings[s.key];
          if (on.includes(value)) { if (on.length === 1) return; app.settings[s.key] = on.filter((v) => v !== value); }
          else app.settings[s.key] = [...on, value];
          b.classList.toggle("sel", app.settings[s.key].includes(value));
          save();
        };
        grid.append(b);
      }
      box.append(grid);
    } else if (s.type === "color") {
      const input = Object.assign(document.createElement("input"), { type: "color", value: app.settings[s.key] });
      input.oninput = () => { app.settings[s.key] = input.value; save(); };
      box.append(input);
    }
  }
}

// ---- Run loop ----
let lastKey = "", lastSendAt = 0, lastBase = "", lastOut = { r: 0, g: 0, b: 0 };

async function start() {
  app.instance = app.mode.create(app.settings);
  if (app.mode.usesMic) {
    app.mic = new Mic();
    try { await app.mic.start(app.source, () => { log("sharing stopped"); stop(); }); }
    catch (e) {
      log((app.source === "share" ? "share: " : "mic: ") + errText(e));
      $("status").textContent = app.source === "share" ? "Sound wasn't shared. Press Start and turn on the audio switch" : "Microphone permission is needed";
      app.mic = null; return;
    }
  }
  app.running = true;
  $("go").textContent = "Stop";
  await prime();
  try { await navigator.wakeLock?.request("screen"); } catch {}
  loop();
}

// Put the lights in a known state: on, and full brightness when driving with color.
async function prime() {
  if (app.method === "color") await lights.send(CMD.on, CMD.brightness(100));
  else await lights.send(CMD.on);
  lastKey = ""; lastBase = ""; lastOut = { r: 0, g: 0, b: 0 };
}

// The controller remembers the last brightness command, so a dim level left behind here would also
// dim Magic Lantern and the built-in effects. Leaving a mode always puts it back to full.
function stop() {
  const wasRunning = app.running;
  app.running = false;
  cancelAnimationFrame(app.raf);
  app.mic?.stop(); app.mic = null;
  app.instance?.stop?.(); app.instance = null;
  $("go").textContent = "Start";
  $("orb").style.opacity = 0.08;
  if (wasRunning && lights.connected) return lights.send(CMD.brightness(100));
}

function loop() {
  if (!app.running) return;
  app.raf = requestAnimationFrame(loop);
  const now = performance.now();
  const out = app.instance.frame({ audio: app.mic ? app.mic.read() : null, now, settings: app.settings });
  if (!out) return;
  if (out.raw) {
    // Raw commands from the mode: send only when they change.
    const key = out.raw.map(hex).join("|");
    if (key !== lastKey && !lights.busy) { lastKey = key; log("sent " + key); lights.send(...out.raw); }
    return;
  }
  const peak = Math.max(out.r, out.g, out.b);
  $("orb").style.background = `radial-gradient(circle at 50% 45%, rgb(${out.r / (peak || 1) * 255},${out.g / (peak || 1) * 255},${out.b / (peak || 1) * 255}), #1a0a0d 75%)`;
  $("orb").style.opacity = Math.max(0.08, peak / 255).toFixed(3);

  // A big jump (new color, a hit, going dark) goes out immediately; small fades respect the update rate.
  const jump = Math.max(Math.abs(out.r - lastOut.r), Math.abs(out.g - lastOut.g), Math.abs(out.b - lastOut.b));
  if (jump < 60 && now - lastSendAt < 1000 / +$("rate").value) return;
  let cmd;
  if (app.method === "color") {
    cmd = CMD.color(out.r, out.g, out.b);
  } else {
    // Brightness command: set the hue at full strength once, then vary brightness.
    const k = peak ? 255 / peak : 0;
    const base = CMD.color(out.r * k, out.g * k, out.b * k);
    if (peak && hex(base) !== lastBase) { cmd = base; lastBase = hex(base); }
    else cmd = CMD.brightness((peak / 255) * 100);
  }
  const key = hex(cmd);
  if (key === lastKey && now - lastSendAt < 1000) return;
  lastSendAt = now; lastKey = key; lastOut = out;
  lights.writeLatest(cmd);
}

// ---- Wiring ----
const picker = $("mode");
for (const m of MODES) picker.append(new Option(m.name, m.id));
picker.value = store.get("mode") || MODES[0].id;
picker.onchange = () => selectMode(picker.value);
$("modePicker").hidden = MODES.length < 2;
selectMode(picker.value);

$("method").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  app.method = b.dataset.v;
  for (const x of $("method").children) x.classList.toggle("sel", x === b);
  if (app.running) prime();
});
// Sound source: only offered where the browser can share a tab's or the computer's sound.
$("sourceBox").hidden = !canShareAudio;
const setSource = (v) => {
  app.source = canShareAudio && v === "share" ? "share" : "mic";
  for (const x of $("source").children) x.classList.toggle("sel", x.dataset.v === app.source);
  $("sourceHint").hidden = app.source !== "share";
  store.set("source", app.source);
};
setSource(store.get("source"));
$("source").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || b.dataset.v === app.source) return;
  if (app.running) stop();
  setSource(b.dataset.v);
});

const showRate = () => ($("rateV").textContent = $("rate").value);
$("rate").oninput = showRate; showRate();

$("connect").onclick = connect;
$("go").onclick = () => (app.running ? stop() : start());
$("testRed").onclick = async () => { await stop(); await lights.send(CMD.on, CMD.brightness(100), CMD.color(255, 0, 0)); log("sent solid red"); };
$("off").onclick = async () => { await stop(); await lights.send(CMD.off); log("sent off"); };

// Closing or leaving the page skips stop(), so send full brightness on the way out too.
addEventListener("pagehide", () => { if (lights.connected) lights.write(CMD.brightness(100)).catch(() => {}); });

if (!Lights.supported) { $("unsupported").hidden = false; $("connect").disabled = true; }
log("protocol: on=" + hex(CMD.on) + "  red=" + hex(CMD.color(255, 0, 0)));
