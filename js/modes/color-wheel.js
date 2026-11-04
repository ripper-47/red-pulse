// One steady color for the whole strip, picked on a color wheel. No sound needed.

// Hue goes around the wheel, saturation from the white center (0) to the full color at the edge (1).
export function hsv(h, s) {
  const f = (n) => { const k = (n + h / 60) % 6; return 255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))); };
  return [Math.round(f(5)), Math.round(f(3)), Math.round(f(1))];
}
const PALE = 0.35; // below this saturation the strip shows mostly white, which looks noisy on it
const toHex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

function render(field, ctx) {
  const el = (tag, cls, props) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, props);
  const wrap = el("div", "wheel");
  const canvas = el("canvas", "wheel-canvas", { tabIndex: 0 });
  canvas.setAttribute("role", "slider");
  canvas.setAttribute("aria-label", "Color wheel");
  const knob = el("span", "wheel-knob");
  wrap.append(canvas, knob);
  const readout = el("div", "wheel-readout");
  const chip = el("span", "wheel-chip");
  const code = el("span", "wheel-hex");
  readout.append(chip, code);
  const hint = el("p", "hint", { textContent: "Pale colors and white can look noisy on these lights. Deeper colors look cleaner." });
  field.append(wrap, readout, hint);

  // Draw the wheel once, pixel by pixel, at the screen's resolution.
  const size = 260, dpr = Math.min(devicePixelRatio || 1, 2), px = Math.round(size * dpr);
  canvas.width = canvas.height = px;
  const g = canvas.getContext("2d"), img = g.createImageData(px, px), R = px / 2;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const dx = x + 0.5 - R, dy = y + 0.5 - R, d = Math.hypot(dx, dy) / R;
    if (d > 1) continue;
    const [r, gr, b] = hsv((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, d);
    const i = (y * px + x) * 4;
    img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b;
    img.data[i + 3] = d > 0.99 ? Math.round((1 - d) * 100 * 255) : 255; // soft edge
  }
  g.putImageData(img, 0, 0);

  const show = () => {
    const { h, s } = ctx.get();
    const rgb = hsv(h, s), a = h * Math.PI / 180;
    knob.style.left = 50 + Math.cos(a) * s * 50 + "%";
    knob.style.top = 50 + Math.sin(a) * s * 50 + "%";
    knob.style.background = chip.style.background = toHex(rgb);
    code.textContent = toHex(rgb).toUpperCase();
    canvas.setAttribute("aria-valuetext", code.textContent);
    hint.hidden = s >= PALE;
  };
  const pick = (e) => {
    const box = canvas.getBoundingClientRect(), r = box.width / 2;
    const dx = e.clientX - box.left - r, dy = e.clientY - box.top - r;
    ctx.set({ h: Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360), s: Math.round(Math.min(1, Math.hypot(dx, dy) / r) * 100) / 100 });
    show();
  };
  canvas.onpointerdown = (e) => { canvas.setPointerCapture(e.pointerId); pick(e); };
  canvas.onpointermove = (e) => { if (canvas.hasPointerCapture(e.pointerId)) pick(e); };
  // Arrow keys: left/right turn the hue, up/down change how deep the color is.
  canvas.onkeydown = (e) => {
    const { h, s } = ctx.get(), step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[e.key];
    if (!step) return;
    e.preventDefault();
    ctx.set({ h: (h + step[0] + 360) % 360, s: Math.round(Math.max(0, Math.min(1, s + step[1])) * 100) / 100 });
    show();
  };
  show();
}

export default {
  id: "color-wheel",
  name: "Color Wheel",
  description: "Pick a color and the lights stay on it. Press Start, then drag on the wheel to change it.",
  usesMic: false,
  settings: [
    { key: "color", label: "Color", type: "custom", default: { h: 0, s: 1 }, render },
  ],

  palette: (settings) => [hsv(settings.color.h, settings.color.s)],

  create() {
    return {
      frame({ settings }) {
        const [r, g, b] = hsv(settings.color.h, settings.color.s);
        return { r, g, b };
      },
    };
  },
};
