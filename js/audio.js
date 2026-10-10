// Sound input: the microphone, or (on a computer) the music itself via the browser's share picker.
// Each frame gives raw loudness features; modes decide what to do with them.

const RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

// Chrome and Edge on a computer can capture a tab's or the whole system's sound. Phones can't.
export const canShareAudio = !!navigator.mediaDevices?.getDisplayMedia && !/iPhone|iPad|Android/i.test(navigator.userAgent);

export class Mic {
  // source: "mic", or "share" to hear what the computer plays. onEnded fires if sharing is stopped.
  // sharp: when sharing, keep the screen picture detailed enough to read from (Album Art reads the cover).
  // fps: screen pictures per second when sharing (Movie mode follows the picture, so it needs more than 1).
  // log gets a line for each capture hiccup, so a report from the page's log says what happened.
  async start(source = "mic", onEnded, { sharp = false, fps = 1, log = () => {} } = {}) {
    this.log = log;
    // Made before the picker, while the Start click still counts: a context created after a slow pick
    // can stay suspended and never produce sound.
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    this.ctx.resume().catch(() => {});
    try {
      if (source === "share") {
        // Chrome only offers audio alongside video, so ask for a tiny video track. It is left running:
        // on some systems stopping it ends the shared sound too.
        this.stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: fps, width: sharp ? 1920 : 320 },
          audio: { ...RAW, suppressLocalAudioPlayback: false },
          systemAudio: "include",
          selfBrowserSurface: "exclude",
          preferCurrentTab: false,
        });
        const track = this.stream.getAudioTracks()[0];
        if (!track) throw new Error("no audio was shared. Turn on the audio switch in the share window");
        track.onended = () => {
          const video = this.stream?.getVideoTracks()[0];
          log("shared sound ended" + (video?.readyState === "live" ? " (screen share still on)" : ""));
          onEnded?.();
        };
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: RAW });
      }
      // resume() can wait forever if the audio output is busy switching (AirPods connecting, for example);
      // don't hold up Start for it, onstatechange below keeps retrying.
      await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 1000))]);
    } catch (e) {
      this.stop();
      throw e;
    }
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0; // no averaging across frames, so hits register at once
    this.#connect();

    // Between songs the system can pause the capture or the audio engine (for example when the player
    // switches sample rate), and the sound may not come back on its own. Each of these puts it back.
    const track = this.stream.getAudioTracks()[0];
    track.onmute = () => log("sound capture paused");
    track.onunmute = () => { log("sound capture resumed"); this.#connect(); };
    this.ctx.onstatechange = () => {
      if (!this.ctx) return;
      log("audio engine " + this.ctx.state);
      if (this.ctx.state !== "running" && this.ctx.state !== "closed") this.ctx.resume().catch(() => {});
    };
    this.silentSince = null; this.lastHeal = 0;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeBuf = new Float32Array(this.analyser.fftSize);
  }

  // (Re)attach the stream to the analyser with a fresh source node.
  #connect() {
    if (!this.ctx) return;
    try { this.src?.disconnect(); } catch {}
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.src.connect(this.analyser);
  }

  // Called while input is dead silent: every 2 s, wake the audio engine and reattach the stream.
  // Harmless during a real pause, and it brings back sound that stalled after one.
  #heal(now) {
    if (now - this.lastHeal < 2000) return;
    this.lastHeal = now;
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    this.#connect();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => { t.onended = t.onmute = t.onunmute = null; t.stop(); });
    this.ctx?.close();
    this.ctx = null;
  }

  // Mean spectrum magnitude (0..1) between two frequencies.
  #band(loHz, hiHz) {
    const hzPerBin = this.ctx.sampleRate / this.analyser.fftSize;
    const lo = Math.max(1, Math.floor(loHz / hzPerBin)), hi = Math.min(this.freq.length - 1, Math.ceil(hiHz / hzPerBin));
    let s = 0; for (let i = lo; i <= hi; i++) s += this.freq[i];
    return s / ((hi - lo + 1) * 255);
  }

  // { rms, bass, mid, treble, spectrum }. bass/mid/treble are squared band magnitudes scaled to sit near rms values.
  read() {
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) sum += this.timeBuf[i] * this.timeBuf[i];
    this.analyser.getByteFrequencyData(this.freq);
    const now = performance.now();
    if (sum === 0) {
      this.silentSince ??= now;
      if (now - this.silentSince > 1500) this.#heal(now);
    } else {
      if (this.silentSince !== null && now - this.silentSince > 1500) this.log("sound back after " + ((now - this.silentSince) / 1000).toFixed(1) + " s of silence");
      this.silentSince = null;
    }
    const shape = (v) => Math.pow(v, 2) * 0.25;
    return {
      rms: Math.sqrt(sum / this.timeBuf.length),
      bass: shape(this.#band(40, 180)),
      mid: shape(this.#band(180, 2000)),
      treble: shape(this.#band(2000, 8000)),
      spectrum: this.freq,
    };
  }
}

// Turns a raw energy value into 0..1 that adapts to the room: tracks a noise floor and a slowly falling peak.
export class AdaptiveLevel {
  constructor() { this.peak = 0.02; this.noise = 0.003; }
  // sensitivity 0..1, higher reacts to quieter sound.
  update(energy, sensitivity) {
    const n = this.noise;
    this.noise = energy < n ? n * 0.9 + energy * 0.1 : n * 0.999 + energy * 0.001;
    this.peak = Math.max(energy, this.peak * 0.995, this.noise * 2 + 0.002);
    const ceiling = this.noise + (this.peak - this.noise) * (1.15 - sensitivity * 0.85);
    return Math.min(1, Math.max(0, (energy - this.noise) / Math.max(1e-4, ceiling - this.noise)));
  }
}
