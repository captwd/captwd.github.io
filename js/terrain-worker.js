import {spectrogram} from './signal.js';

self.onmessage = ({data}) => {
  try {
    const {pcm, sampleRate, duration} = data;
    const spectrum = spectrogram({sampleRate, getChannelData: () => pcm}, Math.max(2, Math.ceil(duration * 10) + 1), 64);
    const values = Uint8Array.from(spectrum.values, value => Math.round(value * 255));
    self.postMessage({duration, frames: spectrum.frames, bands: spectrum.bands, minFrequency: 60, maxFrequency: spectrum.maxFreq, values}, [values.buffer]);
  } catch (error) { self.postMessage({error: error.message || '频谱计算失败'}); }
};
