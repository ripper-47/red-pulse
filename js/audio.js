// Microphone input. Each frame gives raw loudness features; modes decide what to do with them.

export class Mic {
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0; // no averaging across frames, so hits register at once
    src.connect(this.analyser);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeBuf = new Float32Array(this.analyser.fftSize);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
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
