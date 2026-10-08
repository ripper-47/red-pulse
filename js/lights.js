// Bluetooth connection to the light controller. Knows nothing about modes or audio.
import { SERVICE, WRITE_CHAR, ALT_SERVICES, NAME_PREFIXES, CMD } from "./protocol.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const errText = (e) => (e && (e.message || e.name)) || String(e);

export class Lights {
  constructor({ log = () => {}, onDisconnect = () => {} } = {}) {
    this.log = log;
    this.onDisconnect = onDisconnect;
    this.device = null;
    this.ch = null;
    this.busy = false;
  }

  static get supported() { return !!navigator.bluetooth; }
  get connected() { return !!(this.device && this.device.gatt.connected && this.ch); }
  get name() { return (this.device && this.device.name) || "lights"; }

  // Throws an Error whose message names the step that failed; NotFoundError means the user cancelled the picker.
  async connect({ showAll = false, onStep = () => {} } = {}) {
    const optional = [SERVICE, ...ALT_SERVICES];
    const filtered = { filters: NAME_PREFIXES.map((namePrefix) => ({ namePrefix })), optionalServices: optional };
    const all = { acceptAllDevices: true, optionalServices: optional };
    let step = "choosing device";
    try {
      onStep(step);
      try {
        this.device = await navigator.bluetooth.requestDevice(showAll ? all : filtered);
      } catch (e) {
        if (e && e.name === "NotFoundError") throw e;
        this.log("filtered search failed (" + errText(e) + "), showing all devices");
        this.device = await navigator.bluetooth.requestDevice(all);
      }
      this.log("picked: " + (this.device.name || "(no name)"));
      this.device.addEventListener("gattserverdisconnected", () => { this.ch = null; this.onDisconnect(); });
      step = "connecting"; onStep(step);
      const server = await this.device.gatt.connect();
      step = "finding the lights' control channel"; onStep(step);
      this.ch = await this.#findWriteChar(server);
      step = "sending hello"; onStep(step);
      // MELK controllers drop the link unless this handshake comes first.
      await this.write(CMD.login1); await sleep(300);
      await this.write(CMD.login2); await sleep(300);
      await this.write(CMD.on);
      this.log("connected to " + this.name);
    } catch (e) {
      if (e && e.name === "NotFoundError") throw e;
      const err = new Error("while " + step + ": " + errText(e));
      err.step = step;
      throw err;
    }
  }

  disconnect() { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); }

  async write(bytes) {
    if (!this.ch) return false;
    const data = new Uint8Array(bytes);
    if (this.ch.writeValueWithoutResponse) await this.ch.writeValueWithoutResponse(data);
    else await this.ch.writeValue(data);
    return true;
  }

  // Several commands in a row, holding off live frames until they're done.
  async send(...commands) {
    this.busy = true;
    try { for (const c of commands) await this.write(c); }
    catch (e) { this.log("send failed: " + errText(e)); }
    finally { this.busy = false; }
  }

  // While the radio is busy, keep only the newest frame and send it the moment the radio frees up,
  // so nothing queues behind the music and the latest change is never left waiting for the next frame.
  async writeLatest(bytes) {
    if (!this.ch) return;
    if (this.busy) { this.pending = bytes; return; }
    this.busy = true;
    try {
      let next = bytes;
      while (next) {
        this.pending = null;
        await this.write(next);
        next = this.pending;
      }
    } catch (e) { this.log("write failed: " + errText(e)); }
    finally { this.busy = false; this.pending = null; }
  }

  // Use FFF0/FFF3 when present; otherwise log what the device offers and pick its first writable characteristic.
  async #findWriteChar(server) {
    try {
      const svc = await server.getPrimaryService(SERVICE);
      return await svc.getCharacteristic(WRITE_CHAR);
    } catch (e) {
      this.log("FFF3 not found (" + errText(e) + "), scanning services");
    }
    let fallback = null;
    for (const uuid of ALT_SERVICES) {
      let svc;
      try { svc = await server.getPrimaryService(uuid); } catch { continue; }
      for (const c of await svc.getCharacteristics()) {
        const p = c.properties;
        this.log("svc " + uuid.slice(4, 8) + " char " + c.uuid.slice(4, 8) + (p.write ? " write" : "") + (p.writeWithoutResponse ? " writeNR" : "") + (p.notify ? " notify" : ""));
        if (!fallback && (p.write || p.writeWithoutResponse)) fallback = c;
      }
    }
    if (!fallback) throw new Error("no writable characteristic found");
    this.log("using " + fallback.uuid);
    return fallback;
  }
}
