// Geometry and playback derive from the same decoded PCM buffer.
export function summarize(buffer, bins = 1600) {
  const data = buffer.getChannelData(0), low = new Float32Array(bins), high = new Float32Array(bins);
  let peak = 0.001;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * data.length / bins), end = Math.max(start + 1, Math.floor((b + 1) * data.length / bins));
    for (let j = start; j < end; j++) { low[b] = Math.min(low[b], data[j]); high[b] = Math.max(high[b], data[j]); }
    peak = Math.max(peak, -low[b], high[b]);
  }
  return { low, high, peak, bins };
}
function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len, wr0 = Math.cos(angle), wi0 = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = start + j, b = a + len / 2, tr = wr * real[b] - wi * imag[b], ti = wr * imag[b] + wi * real[b];
        real[b] = real[a] - tr; imag[b] = imag[a] - ti; real[a] += tr; imag[a] += ti;
        const next = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = next;
      }
    }
  }
}
export function spectrogram(buffer, frames = 112, bands = 44) {
  const data = buffer.getChannelData(0), size = 2048, values = new Float32Array(frames * bands);
  const maxFreq = Math.min(10000, buffer.sampleRate * 0.48);
  for (let f = 0; f < frames; f++) {
    const real = new Float32Array(size), imag = new Float32Array(size), center = Math.floor(f / (frames - 1) * (data.length - 1));
    for (let i = 0; i < size; i++) real[i] = (data[center + i - size / 2] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    fft(real, imag);
    for (let b = 0; b < bands; b++) {
      const lo = 60 * (maxFreq / 60) ** (b / bands), hi = 60 * (maxFreq / 60) ** ((b + 1) / bands);
      const first = Math.max(1, Math.floor(lo / buffer.sampleRate * size)), last = Math.min(size / 2, Math.max(first + 1, Math.ceil(hi / buffer.sampleRate * size)));
      let power = 0;
      for (let k = first; k < last; k++) power = Math.max(power, Math.hypot(real[k], imag[k]) / size * 2);
      values[f * bands + b] = Math.max(0, Math.min(1, (20 * Math.log10(power + 1e-7) + 75) / 65));
    }
  }
  return { values, frames, bands, maxFreq };
}
// Waveform-similarity overlap-add, using the same grain alignment for every channel.
export function stretchSegment(ctx, buffer, start, end, ratio) {
  const sampleRate = buffer.sampleRate, first = Math.floor(start * sampleRate), length = Math.max(1, Math.floor((end - start) * sampleRate));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).subarray(first, first + length));
  const outputLength = Math.max(1, Math.round(length * ratio)), out = ctx.createBuffer(channels.length, outputLength, sampleRate);
  if (Math.abs(ratio - 1) < 0.001) { channels.forEach((ch, c) => out.copyToChannel(ch, c)); return out; }
  if (length < 32) {
    channels.forEach((ch, c) => { const dest = out.getChannelData(c); for (let i = 0; i < outputLength; i++) dest[i] = ch[Math.min(ch.length - 1, Math.floor(i / ratio))] || 0; });
    return out;
  }
  const windowSize = Math.min(2048, 2 ** Math.floor(Math.log2(length))), hop = Math.max(1, windowSize >> 1);
  const search = Math.min(Math.round(sampleRate * 0.008), hop >> 1), weights = new Float32Array(outputLength);
  const window = Float32Array.from({ length: windowSize }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (windowSize - 1)));
  let previous = 0;
  for (let target = 0, grain = 0; target < outputLength; target += hop, grain++) {
    const expected = Math.min(length - windowSize, Math.round(target / ratio));
    let source = Math.max(0, expected), best = -Infinity;
    if (grain && expected > search && expected + search + windowSize < length) {
      const reference = Math.min(previous + hop, length - hop);
      for (let candidate = expected - search; candidate <= expected + search; candidate += 4) {
        let dot = 0, aa = 1e-9, bb = 1e-9;
        for (let j = 0; j < hop; j += 8) {
          const a = channels[0][reference + j] || 0, b = channels[0][candidate + j] || 0;
          dot += a * b; aa += a * a; bb += b * b;
        }
        const correlation = dot / Math.sqrt(aa * bb);
        if (correlation > best) { best = correlation; source = candidate; }
      }
    }
    for (let i = 0; i < windowSize && target + i < outputLength; i++) weights[target + i] += window[i];
    channels.forEach((ch, c) => {
      const dest = out.getChannelData(c);
      for (let i = 0; i < windowSize && target + i < outputLength; i++) dest[target + i] += (ch[source + i] || 0) * window[i];
    });
    previous = source;
  }
  for (let c = 0; c < channels.length; c++) {
    const dest = out.getChannelData(c);
    for (let i = 0; i < outputLength; i++) if (weights[i] > 1e-5) dest[i] /= weights[i];
  }
  return out;
}
export function wavBlob(buffer, gain = 1) {
  const channels = buffer.numberOfChannels, bytes = buffer.length * channels * 2, raw = new ArrayBuffer(44 + bytes), view = new DataView(raw);
  const str = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, bytes, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const value = Math.max(-1, Math.min(1, data[c][i] * gain));
    view.setInt16(44 + (i * channels + c) * 2, value * (value < 0 ? 32768 : 32767), true);
  }
  return new Blob([raw], { type: 'audio/wav' });
}
