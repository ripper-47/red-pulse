// MELK / ELK-BLEDOM family (Magic Lantern app, device "OA10").
// Service FFF0, write FFF3. Frames are 9 bytes, 0x7E ... 0xEF.
// Full UUID strings: some iOS Web Bluetooth browsers (Bluefy) don't accept the short numeric form.
export const SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
export const WRITE_CHAR = "0000fff3-0000-1000-8000-00805f9b34fb";
// Other services this controller family has been seen with, so a different board still gets found.
export const ALT_SERVICES = [
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ffd0-0000-1000-8000-00805f9b34fb",
  "0000ffd5-0000-1000-8000-00805f9b34fb",
];
export const NAME_PREFIXES = ["MELK", "OA", "ELK"];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

export const CMD = {
  login1: [0x7e, 0x07, 0x83],
  login2: [0x7e, 0x04, 0x04],
  on: [0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef],
  off: [0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef],
  color: (r, g, b) => [0x7e, 0x00, 0x05, 0x03, clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), 0x00, 0xef],
  brightness: (pct) => [0x7e, 0x04, 0x01, clamp(pct, 0, 100), 0x01, 0xff, 0xff, 0x00, 0xef],
  // Built-in controller effects and their speed (0-100); see elkbledom's EFFECTS_MELK_Ox for ids.
  effect: (id) => [0x7e, 0x05, 0x03, clamp(id, 0, 255), 0x06, 0xff, 0xff, 0x00, 0xef],
  effectSpeed: (pct) => [0x7e, 0x04, 0x02, clamp(pct, 0, 100), 0xff, 0xff, 0xff, 0x00, 0xef],
};

export const hex = (a) => a.map((b) => b.toString(16).padStart(2, "0")).join(" ");
