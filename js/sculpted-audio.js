import {stretchSegment} from './signal.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The original samples play before and after the edit. Only the selected clip is stretched.
export class SculptedAudio extends EventTarget {
  constructor(media) {
    super(); this.media = media; this.edit = null; this.version = 0; this.nodes = [];
    this.bufferMode = false; this.playing = false; this.offset = 0; this.ignoreMedia = false; this.intent = 0;
    for (const type of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'error']) {
      media.addEventListener(type, () => { if (!this.ignoreMedia && !this.bufferMode) this.emit(type); });
    }
  }
  emit(type) { this.dispatchEvent(new Event(type)); }
  context() {
    if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); }
    return this.ctx;
  }
  unlock() { return this.context().resume(); }
  get src() { return this.media.src; }
  set src(value) {
    this.pause(); this.version++; this.decoding = null; this.buffer = null; this.processed = null;
    this.processedKey = ''; this.edit = null; this.bufferMode = false; this.offset = 0; this.knownDuration = 0; this.media.src = value;
  }
  load() { this.media.load(); }
  get sourceDuration() { return Number.isFinite(this.media.duration) ? this.media.duration : this.buffer?.duration || this.knownDuration || NaN; }
  get duration() { return this.outputTime(this.sourceDuration); }
  get volume() { return this.media.volume; }
  set volume(value) { this.media.volume = value; if (this.master) this.master.gain.setTargetAtTime(value, this.ctx.currentTime, .02); }
  get paused() { return this.bufferMode ? !this.playing : this.media.paused; }
  get currentTime() { return this.bufferMode ? clamp(this.offset + (this.playing ? Math.max(0, this.ctx.currentTime - this.began) : 0), 0, this.duration) : this.outputTime(this.media.currentTime); }
  set currentTime(value) {
    this.intent++;
    const time = clamp(value, 0, Math.max(0, this.duration - .001));
    if (this.bufferMode) { const resume = this.playing; this.halt(); this.offset = time; if (resume) this.start(time); }
    else this.media.currentTime = this.inputTime(time);
    this.emit('timeupdate');
  }
  outputTime(time, edit = this.edit) {
    if (!edit || time <= edit.start) return time;
    return time < edit.end ? edit.start + (time - edit.start) * edit.ratio : time + (edit.end - edit.start) * (edit.ratio - 1);
  }
  inputTime(time, edit = this.edit) {
    if (!edit || time <= edit.start) return time;
    const edge = edit.start + (edit.end - edit.start) * edit.ratio;
    return time < edge ? edit.start + (time - edit.start) / edit.ratio : time - (edit.end - edit.start) * (edit.ratio - 1);
  }
  preview(edit) {
    const originalPosition = this.inputTime(this.currentTime);
    this.pause(); this.version++; this.edit = edit ? {...edit} : null;
    this.offset = this.outputTime(originalPosition);
    if (!this.bufferMode && Number.isFinite(this.media.duration)) this.media.currentTime = originalPosition;
    this.emit('loadedmetadata');
  }
  key() { return this.edit ? [this.edit.start, this.edit.end, this.edit.ratio].join(':') : ''; }
  async decode() {
    if (this.buffer) return this.buffer;
    if (!this.decoding) {
      const src = this.src;
      const pending = (async () => {
        const response = await fetch(src); if (!response.ok) throw new Error('无法读取原音乐');
        const buffer = await this.context().decodeAudioData(await response.arrayBuffer());
        if (this.src !== src) throw new Error('音乐已切换');
        this.buffer = buffer; return buffer;
      })();
      this.decoding = pending;
      pending.catch(() => { if (this.decoding === pending) this.decoding = null; });
    }
    return this.decoding;
  }
  async commit() {
    this.pause(false);
    const token = this.version, edit = this.edit && {...this.edit};
    if (!edit || (Math.abs(edit.ratio - 1) < .001 && Math.abs(edit.db) < .01)) {
      const originalPosition = this.inputTime(this.currentTime); this.pause(false); this.bufferMode = false;
      if (Number.isFinite(this.media.duration)) this.media.currentTime = originalPosition;
      this.emit('loadedmetadata'); return true;
    }
    const buffer = await this.decode(); if (token !== this.version) return false;
    const key = this.key();
    if (key !== this.processedKey) { this.processed = stretchSegment(this.context(), buffer, edit.start, edit.end, edit.ratio); this.processedKey = key; }
    this.offset = this.currentTime; this.ignoreMedia = true; this.media.pause(); this.ignoreMedia = false;
    this.bufferMode = true; this.emit('loadedmetadata'); return true;
  }
  halt() {
    this.run = (this.run || 0) + 1;
    for (const {source, gain} of this.nodes) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); gain.disconnect(); }
    this.nodes = []; this.playing = false;
  }
  pause(invalidate = true) {
    if (invalidate) this.intent++;
    if (!this.bufferMode) { this.media.pause(); return; }
    const wasPlaying = this.playing, time = this.currentTime; this.halt(); this.offset = time;
    if (wasPlaying) this.emit('pause');
  }
  async play() {
    const token = this.version, intent = ++this.intent;
    if (this.edit || this.bufferMode) {
      if (this.edit && (Math.abs(this.edit.ratio - 1) > .001 || Math.abs(this.edit.db) > .01)) await this.unlock();
      if (intent !== this.intent || !(await this.commit()) || token !== this.version || intent !== this.intent) return;
    }
    if (this.bufferMode) { await this.unlock(); if(intent!==this.intent||token!==this.version)return;this.start(this.currentTime); }
    else await this.media.play();
  }
  async playRange(start, end) {
    const token = this.version, intent = ++this.intent; await this.unlock(); await this.decode();
    if (token !== this.version || intent !== this.intent || !(await this.commit()) || intent !== this.intent) return false;
    if (!this.processed || this.processedKey !== this.key()) { this.processed = stretchSegment(this.context(), this.buffer, this.edit.start, this.edit.end, this.edit.ratio); this.processedKey = this.key(); }
    this.ignoreMedia = true; this.media.pause(); this.ignoreMedia = false; this.bufferMode = true;
    this.start(start, end); return true;
  }
  start(from, until = null) {
    this.halt(); const run = this.run, ctx = this.context(), now = ctx.currentTime + .012, edit = this.edit;
    const limit = clamp(until ?? this.duration, 0, this.duration); from = clamp(from, 0, Math.max(0, limit - .001));
    const edge = edit ? this.outputTime(edit.end) : 0;
    const pieces = edit ? [
      {start: 0, end: edit.start, buffer: this.buffer, offset: 0, volume: 1},
      {start: edit.start, end: edge, buffer: this.processed, offset: 0, volume: 10 ** (edit.db / 20)},
      {start: edge, end: this.duration, buffer: this.buffer, offset: edit.end, volume: 1}
    ] : [{start: 0, end: this.duration, buffer: this.buffer, offset: 0, volume: 1}];
    for (const piece of pieces) {
      const start = Math.max(from, piece.start), end = Math.min(limit, piece.end), duration = end - start;
      if (duration <= .0001 || !piece.buffer) continue;
      const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = piece.buffer;
      const at = now + start - from, fade = Math.min(.005, duration / 4);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(piece.volume, at + fade);
      gain.gain.setValueAtTime(piece.volume, at + duration - fade); gain.gain.linearRampToValueAtTime(0, at + duration);
      source.connect(gain); gain.connect(this.master); this.nodes.push({source, gain});
      source.start(at, piece.offset + start - piece.start, duration);
    }
    this.offset = from; this.began = now; this.playing = this.nodes.length > 0;
    const last = this.nodes.at(-1);
    if (last) last.source.onended = () => {
      if (run !== this.run) return;
      this.halt(); this.offset = limit;
      if (until === null && this.media.loop) { this.offset = 0; this.start(0); }
      else { this.emit('pause'); this.emit('timeupdate'); }
    };
    this.emit('play');
  }
}
