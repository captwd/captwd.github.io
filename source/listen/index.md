---
title: 试听 Demo
date: 2026-09-12
---

下面是几组模型的试听对比（LJSpeech val 集里的 5 句），点 ▶ 播放；鼠标移到某一列可以看对应文本。音频与[独立版 Demo](/demo/)是同一批，这里做成跟随博客主题的样式。

<div class="mmdemo">
<div class="mm-trans"><span>Transcription：</span><em id="mm-trans"></em></div>
<table class="mm-listen" id="mm-listen">
<thead><tr><th class="mm-sys">System</th><th class="mm-cond">Condition</th><th data-s="0">Sentence 1</th><th data-s="1">Sentence 2</th><th data-s="2">Sentence 3</th><th data-s="3">Sentence 4</th><th data-s="4">Sentence 5</th></tr></thead>
<tbody>
<tr><td class="mm-sys">真实录音</td><td class="mm-cond">GT</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/gt/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/gt/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/gt/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/gt/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/gt/sentence_5.wav"></button></td></tr>
<tr><td class="mm-sys" rowspan="2">本复现<br><small>140 epoch</small></td><td class="mm-cond">BigVGAN</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/ours_bigvgan/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/ours_bigvgan/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/ours_bigvgan/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/ours_bigvgan/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/ours_bigvgan/sentence_5.wav"></button></td></tr>
<tr><td class="mm-cond">HiFi-GAN</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/ours_hifigan/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/ours_hifigan/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/ours_hifigan/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/ours_hifigan/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/ours_hifigan/sentence_5.wav"></button></td></tr>
<tr><td class="mm-sys">官方预训练</td><td class="mm-cond">HiFi-GAN</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/official_hifigan/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/official_hifigan/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/official_hifigan/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/official_hifigan/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/official_hifigan/sentence_5.wav"></button></td></tr>
<tr><td class="mm-sys" rowspan="2">ConvNeXt V2<br><small>140 epoch</small></td><td class="mm-cond">BigVGAN</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/convnext140_bigvgan/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/convnext140_bigvgan/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/convnext140_bigvgan/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/convnext140_bigvgan/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/convnext140_bigvgan/sentence_5.wav"></button></td></tr>
<tr><td class="mm-cond">HiFi-GAN</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/convnext140_hifigan/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/convnext140_hifigan/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/convnext140_hifigan/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/convnext140_hifigan/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/convnext140_hifigan/sentence_5.wav"></button></td></tr>
<tr><td class="mm-sys" rowspan="2">Mamba2 双向<br><small>140 epoch</small></td><td class="mm-cond">BigVGAN</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/mamba139_bigvgan/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/mamba139_bigvgan/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/mamba139_bigvgan/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/mamba139_bigvgan/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/mamba139_bigvgan/sentence_5.wav"></button></td></tr>
<tr><td class="mm-cond">HiFi-GAN</td><td class="mm-play" data-s="0"><button class="mm-btn" data-src="/demo/audio/mamba139_hifigan/sentence_1.wav"></button></td><td class="mm-play" data-s="1"><button class="mm-btn" data-src="/demo/audio/mamba139_hifigan/sentence_2.wav"></button></td><td class="mm-play" data-s="2"><button class="mm-btn" data-src="/demo/audio/mamba139_hifigan/sentence_3.wav"></button></td><td class="mm-play" data-s="3"><button class="mm-btn" data-src="/demo/audio/mamba139_hifigan/sentence_4.wav"></button></td><td class="mm-play" data-s="4"><button class="mm-btn" data-src="/demo/audio/mamba139_hifigan/sentence_5.wav"></button></td></tr>
</tbody>
</table>
<h3>客观指标</h3>
<table class="mm-metrics">
<thead><tr><th>系统</th><th>WER ↓</th><th>CER ↓</th><th>GT-WER（上限）</th><th>MCD ↓</th></tr></thead>
<tbody>
<tr><td>真实录音（上限参照）</td><td>—</td><td>—</td><td>7.6%</td><td>—</td></tr>
<tr><td>本复现 140ep + BigVGAN</td><td>9.2%</td><td>2.6%</td><td>7.6%</td><td>52.9 ± 17.1</td></tr>
<tr><td>ConvNeXt V2 + BigVGAN（ep130）</td><td>10.4%</td><td>2.9%</td><td>7.6%</td><td>51.8 ± 16.1</td></tr>
<tr><td>ConvNeXt V2 + HiFi-GAN（ep130）</td><td>10.7%</td><td>3.2%</td><td>7.6%</td><td>51.8 ± 16.2</td></tr>
<tr class="best"><td>ConvNeXt V2 + LR 衰减 + BigVGAN（ep135）</td><td>10.1%</td><td>2.9%</td><td>7.6%</td><td>51.0 ± 16.8</td></tr>
<tr><td>Mamba2 双向 + HiFi-GAN（ep139）</td><td>8.7%</td><td>2.3%</td><td>7.6%</td><td>51.7 ± 17.4</td></tr>
<tr><td>本复现 140ep + HiFi-GAN</td><td>9.3%</td><td>2.5%</td><td>7.6%</td><td>52.9 ± 17.2</td></tr>
<tr><td>声码器往返校准（下限）</td><td>—</td><td>—</td><td>—</td><td>3.6</td></tr>
</tbody>
</table>
<p class="mm-note">WER/CER 用 wav2vec2（960h）转写计算；MCD 是本仓库自写提取器（log-mel 80 + DCT + DTW）的值，只在同一提取器内比较。评估统一挂 Denoiser。Mamba 那组的 WER 是这几组里最好的，MCD 与衰减 ConvNeXt 打平（p=0.23）。</p>
</div>

<style>
.mmdemo { color: inherit; font-size: .95rem; line-height: 1.6; }
.mmdemo .mm-trans { font-size: .9rem; opacity: .85; margin: .3rem 0 .8rem; }
.mmdemo .mm-trans em { font-style: italic; }
.mmdemo table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: .88rem; }
.mmdemo th, .mmdemo td { border: 1px solid rgba(127,127,127,.35); padding: 6px 4px; text-align: center; }
.mmdemo thead th { background: #1e7a55; color: #fff; font-weight: 600; }
.mmdemo td.mm-sys { background: #1e7a55; color: #fff; font-weight: 600; }
.mmdemo td.mm-cond { background: #2c8f66; color: #fff; }
.mmdemo td.mm-play { background: rgba(127,127,127,.06); }
.mmdemo tr:hover td.mm-play { background: rgba(30,122,85,.12); }
.mmdemo td.mm-hl, .mmdemo th.mm-hl { outline: 2px solid rgba(30,122,85,.6); outline-offset: -2px; }
.mmdemo .mm-btn { width: 34px; height: 34px; border-radius: 50%; border: 2px solid #1e7a55; background: transparent; color: #1e7a55; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.mmdemo .mm-btn:hover { background: rgba(30,122,85,.12); }
.mmdemo .mm-btn svg { width: 14px; height: 14px; fill: currentColor; }
.mmdemo .mm-btn.playing { background: #1e7a55; color: #fff; }
.mmdemo h3 { margin: 1.6rem 0 .6rem; font-size: 1.05rem; }
.mmdemo .mm-note { font-size: .85rem; opacity: .8; }
.mmdemo tr.best td { background: rgba(30,122,85,.12); }
[data-theme="dark"] .mmdemo .mm-btn { border-color: #4cc38a; color: #4cc38a; }
[data-theme="dark"] .mmdemo .mm-btn.playing { background: #4cc38a; color: #0d0d0d; }
[data-theme="dark"] .mmdemo td.mm-hl, [data-theme="dark"] .mmdemo th.mm-hl { outline-color: rgba(76,195,138,.7); }
</style>

<script>
(function () {
  var root = document.querySelector('.mmdemo');
  if (!root) return;
  var T = [
    'has hitherto been handled on an informal basis.',
    'The ordinary of Newgate is an orthodox, unaffected, Church of England divine,',
    'The old notion always prevailed that Newgate was impregnable, so to speak, from within,',
    "Here they were surprised by the police, headed by a magistrate, and supported by a strong detachment of Her Majesty's Guards.",
    'pale as death, very ill, and in a dreadfully dirty state, the wretches making game of him, and enjoying my distress;'
  ];
  var ICON_PLAY = '<svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 16 16"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';
  var audio = new Audio();
  var cur = null;
  root.querySelectorAll('.mm-btn').forEach(function (b) { b.innerHTML = ICON_PLAY; });
  function setSentence(i) {
    var el = root.querySelector('#mm-trans');
    if (el) el.textContent = T[i] || '';
    root.querySelectorAll('[data-s]').forEach(function (n) {
      n.classList.toggle('mm-hl', n.getAttribute('data-s') === String(i));
    });
  }
  function play(btn) {
    var src = btn.getAttribute('data-src');
    if (cur === btn && !audio.paused) { audio.pause(); return; }
    root.querySelectorAll('.mm-btn.playing').forEach(function (b) { b.classList.remove('playing'); b.innerHTML = ICON_PLAY; });
    audio.src = src;
    audio.play();
    btn.classList.add('playing');
    btn.innerHTML = ICON_PAUSE;
    cur = btn;
  }
  audio.addEventListener('pause', function () { if (cur) { cur.classList.remove('playing'); cur.innerHTML = ICON_PLAY; } });
  audio.addEventListener('ended', function () { if (cur) { cur.classList.remove('playing'); cur.innerHTML = ICON_PLAY; } });
  root.addEventListener('click', function (e) {
    var btn = e.target.closest('.mm-btn');
    if (btn) { play(btn); return; }
    var cell = e.target.closest('[data-s]');
    if (cell) setSentence(cell.getAttribute('data-s'));
  });
  root.addEventListener('mouseover', function (e) {
    var cell = e.target.closest('[data-s]');
    if (cell) setSentence(cell.getAttribute('data-s'));
  });
  setSentence(0);
})();
</script>
