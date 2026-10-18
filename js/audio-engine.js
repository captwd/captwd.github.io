import { summarize, spectrogram, stretchSegment, wavBlob } from './signal.js';
export class AudioLab extends EventTarget {
  constructor() {
    super(); this.buffer = null; this.ctx = null; this.source = null; this.playing = false;
    this.start = 0; this.end = 1; this.ratio = 1; this.db = 0; this.head = 0; this.loading = false; this.loadId = 0; this.playId = 0;
    this.title = 'Matcha-TTS · 喜悦'; this.kind = 'happy'; this.cache = new Map();
  }
  emit(type = 'change') { this.dispatchEvent(new Event(type)); }
  context() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持声音播放');
    return this.ctx ||= new AudioContextClass();
  }
  async load(input, title, kind) {
    this.stop(); const token = ++this.loadId; this.loading = true; this.emit();
    try {
      let decoded;
      if (typeof input === 'string' && this.cache.has(input)) decoded = this.cache.get(input);
      else {
        let bytes;
        if (input instanceof Blob) { if (input.size > 30 * 1024 * 1024) throw new Error('请导入 30 MB 以内的声音'); bytes = await input.arrayBuffer(); }
        else { const response = await fetch(input); if (!response.ok) throw new Error('声音文件读取失败'); bytes = await response.arrayBuffer(); }
        decoded = await this.context().decodeAudioData(bytes);
        if (decoded.duration > 60) throw new Error('请使用 60 秒以内的声音片段');
        if (typeof input === 'string') this.cache.set(input, decoded);
      }
      if (token !== this.loadId) return;
      this.buffer = decoded; this.summary = summarize(decoded); this.spectrum = spectrogram(decoded);
      this.title = title; this.kind = kind; this.start = 0; this.end = Math.min(2.5, decoded.duration); this.head = 0; this.ratio = 1; this.db = 0; this.processedKey = '';
      this.loading = false; this.emit('loaded'); this.emit();
    } catch (error) { if (token === this.loadId) { this.loading = false; this.emit(); this.dispatchEvent(new CustomEvent('error', { detail: error.message })); } }
  }
  stop() {
    this.playId++; this.playing = false;
    if (this.source) { this.source.onended = null; try { this.source.stop(); } catch {} this.source.disconnect(); this.source = null; }
    if (this.outputGain) { this.outputGain.disconnect(); this.outputGain = null; }
  }
  select(start, end) {
    if (!this.buffer) return;
    this.stop(); const duration = this.buffer.duration, minimum = Math.min(0.08, duration);
    this.start = Math.max(0, Math.min(duration - minimum, start)); this.end = Math.max(this.start + minimum, Math.min(duration, end)); this.head = this.start; this.emit();
  }
  setRatio(value) { this.stop(); this.ratio = value; this.head = this.start; this.emit(); }
  setGain(value) { this.db = value; if (this.outputGain) { this.outputGain.gain.cancelScheduledValues(this.ctx.currentTime); this.outputGain.gain.setTargetAtTime(10 ** (value / 20), this.ctx.currentTime, 0.025); } this.emit(); }
  segment() {
    const key = [this.loadId, this.start, this.end, this.ratio].join(':');
    if (key !== this.processedKey) { this.processed = stretchSegment(this.context(), this.buffer, this.start, this.end, this.ratio); this.processedKey = key; }
    return this.processed;
  }
  async play() {
    if (!this.buffer || this.loading) return;
    this.stop(); const token = this.playId;
    try {
      const ctx = this.context(); await ctx.resume(); if (token !== this.playId) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = this.segment();
      const fade = Math.min(0.008, source.buffer.duration / 4), now = ctx.currentTime, volume = 10 ** (this.db / 20);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + fade); gain.gain.setValueAtTime(volume, now + source.buffer.duration - fade); gain.gain.linearRampToValueAtTime(0, now + source.buffer.duration);
      source.connect(gain); gain.connect(ctx.destination); this.source = source; this.outputGain = gain; this.began = now; this.head = this.start; this.playing = true;
      source.onended = () => { if (this.source !== source) return; this.playing = false; this.head = this.end; source.disconnect(); gain.disconnect(); this.source = null; this.outputGain = null; this.emit(); };
      source.start(); this.emit();
    } catch (error) { this.stop(); this.emit(); this.dispatchEvent(new CustomEvent('error', { detail: error.message })); }
  }
  toggle() { if (this.playing) { this.head = this.position(); this.stop(); this.emit(); } else this.play(); }
  position() { return this.playing ? Math.min(this.end, this.start + (this.ctx.currentTime - this.began) / this.ratio) : this.head; }
  outputTime(time) { return time <= this.start ? time : time < this.end ? this.start + (time - this.start) * this.ratio : time + (this.end - this.start) * (this.ratio - 1); }
  inputTime(time) { const edge = this.start + (this.end - this.start) * this.ratio; return time <= this.start ? time : time < edge ? this.start + (time - this.start) / this.ratio : time - (this.end - this.start) * (this.ratio - 1); }
  get duration() { return this.buffer ? this.outputTime(this.buffer.duration) : 1; }
  download() {
    if (!this.buffer) return;
    const url = URL.createObjectURL(wavBlob(this.segment(), 10 ** (this.db / 20))), link = document.createElement('a');
    link.href = url; link.download = `wave-notes-${this.start.toFixed(2)}-${this.end.toFixed(2)}-${this.ratio.toFixed(2)}x.wav`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
