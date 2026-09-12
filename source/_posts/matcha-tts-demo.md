---
title: 试听 Demo：Matcha-TTS 复现与改进
date: 2026-09-12 12:00:00
tags: [Matcha-TTS, TTS, Demo]
categories: [Matcha-TTS]
description: 架构、试听矩阵、客观指标与 MCD 震荡专题——本项目的一个汇总页。
---

这是本项目的汇总页：几组模型的试听对比、客观指标，以及关于 checkpoint 质量震荡的一个小专题。所有音频都是本地模型合成的，点 ▶ 播放即可；想用不受主题样式影响的原版页面，可以看[独立版 Demo](/demo/)。

<div class="mmdemo">
<h3>模型架构</h3>
<div class="mm-pipeline">
<div class="mm-pnode"><b>文本</b><span>Text</span></div>
<div class="mm-parrow">→</div>
<div class="mm-pnode"><b>音素化</b><span>G2P · english_cleaners2</span></div>
<div class="mm-parrow">→</div>
<div class="mm-pnode"><b>TextEncoder</b><span>RoPE 注意力 + 时长预测器</span></div>
<div class="mm-parrow">→</div>
<div class="mm-pnode"><b>MAS 对齐</b><span>单调对齐搜索</span></div>
<div class="mm-parrow">→</div>
<div class="mm-pnode mm-hl"><b>CFM 解码器</b><span>U-Net estimator · 10 步 ODE</span></div>
<div class="mm-parrow">→</div>
<div class="mm-pnode mm-hl"><b>声码器</b><span>BigVGAN / HiFi-GAN</span></div>
<div class="mm-parrow">→</div>
<div class="mm-pnode"><b>波形</b><span>22050 Hz</span></div>
</div>
<p class="mm-note">训练时同时优化时长损失、先验损失和流匹配损失；推理时从噪声出发做 10 步 ODE 积分得到梅尔频谱，再经声码器转成波形。图中高亮的两块是这次改动的位置。</p>
<div class="mm-specs">
<span class="mm-chip">采样率 <b>22050 Hz</b></span>
<span class="mm-chip">梅尔 <b>80 维 · hop 256</b></span>
<span class="mm-chip">数据 <b>LJSpeech 全量 13000 句</b></span>
<span class="mm-chip">训练 <b>140 epoch · batch 64</b></span>
<span class="mm-chip">ODE 步数 <b>10</b></span>
</div>
<h3>做了哪些事</h3>
<div class="mm-cards">
<div class="mm-card"><b>① 基线复现</b><p>用官方配置在 LJSpeech 全量上训练 140 epoch，从头训和断点续训都跑过，确认损失收敛和官方描述一致，作为后续对比的参照。</p></div>
<div class="mm-card"><b>② 声码器适配层</b><p>把推理侧的声码器加载重写成注册表，接一个 BigVGAN 适配器：mel 规格对齐后即插即用，不用重训声学模型，和 HiFi-GAN 可以随时切换。</p></div>
<div class="mm-card"><b>③ 评估管线</b><p>写了批量评估脚本，一次跑完合成、DTW-MCD、wav2vec2 转写算 WER/CER，并做声码器往返校准；训练时也记录每轮的 val MCD 曲线。</p></div>
<div class="mm-card"><b>④ 质量诊断</b><p>一开始 MCD 数值偏大，做了往返校准、跨语句对照和人工听写交叉验证，确认是"能听懂但细节偏糊"，属于少步 ODE 采样的常见现象，并给出了量化标定。</p></div>
<div class="mm-card"><b>⑤ 骨干替换</b><p>把 U-Net 的全局混合器（自注意力）换成双向 Mamba2，局部算子换成 ConvNeXt V2 单元。两者都走配置开关，同一份代码跑全部变体；Mamba 版把 WER 压到 8.7%，是这几组里最好的。</p></div>
</div>
<h3>试听</h3>
<div class="mm-trans"><span>Transcription：</span><em id="mm-trans"></em>　<span class="mm-tip">（鼠标移到某一列切换句子）</span></div>
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
<tr class="mm-best"><td>ConvNeXt V2 + LR 衰减 + BigVGAN（ep135）</td><td>10.1%</td><td>2.9%</td><td>7.6%</td><td>51.0 ± 16.8</td></tr>
<tr><td>Mamba2 双向 + HiFi-GAN（ep139）</td><td>8.7%</td><td>2.3%</td><td>7.6%</td><td>51.7 ± 17.4</td></tr>
<tr><td>本复现 140ep + HiFi-GAN</td><td>9.3%</td><td>2.5%</td><td>7.6%</td><td>52.9 ± 17.2</td></tr>
<tr><td>声码器往返校准（下限）</td><td>—</td><td>—</td><td>—</td><td>3.6</td></tr>
</tbody>
</table>
<p class="mm-note">WER/CER 用 wav2vec2（960h）转写计算；MCD 是本仓库自写提取器（log-mel 80 + DCT + DTW）的值，只在同一提取器内比较。评估统一挂 Denoiser。Mamba 那组的 WER 是这几组里最好的，MCD 与衰减 ConvNeXt 打平（p=0.23）。</p>
<h3>专题：checkpoint 的质量震荡</h3>
<p class="mm-note">相邻 checkpoint（间隔 5 epoch）的 DTW-MCD 能差出 ±2~4dB，比骨干之间的差距（约 1dB）大得多。两种声码器在每个 checkpoint 上给出的读数几乎一样（差 &lt;0.3dB），说明这是模型自身的性质，跟声码器、去噪器没关系。</p>
<div class="mm-fig"><svg viewBox="0 0 940 380" xmlns="http://www.w3.org/2000/svg">
<g stroke="#d5ddd9" stroke-width="1"><line x1="60" y1="40" x2="900" y2="40"/><line x1="60" y1="110" x2="900" y2="110"/><line x1="60" y1="180" x2="900" y2="180"/><line x1="60" y1="250" x2="900" y2="250"/><line x1="60" y1="320" x2="900" y2="320"/></g>
<g font-size="11" fill="#444"><text x="52" y="44" text-anchor="end">58</text><text x="52" y="114" text-anchor="end">56</text><text x="52" y="184" text-anchor="end">54</text><text x="52" y="254" text-anchor="end">52</text><text x="52" y="324" text-anchor="end">50</text><text x="60" y="348" text-anchor="middle">ep90</text><text x="210" y="348" text-anchor="middle">ep95</text><text x="360" y="348" text-anchor="middle">ep100</text><text x="510" y="348" text-anchor="middle">ep130</text><text x="660" y="348" text-anchor="middle">ep135</text><text x="810" y="348" text-anchor="middle">ep140</text><text x="470" y="372" text-anchor="middle" fill="#555">（ep100→130 之间的 110/120 未存档；横轴类别间距非等比）</text></g>
<polyline points="60,93 210,236 360,172 510,286 660,171 810,98" fill="none" stroke="#1e7a55" stroke-width="2.5"/>
<g fill="#1e7a55"><circle cx="60" cy="93" r="5"/><circle cx="210" cy="236" r="5"/><circle cx="360" cy="172" r="5"/><circle cx="510" cy="286" r="5"/><circle cx="660" cy="171" r="5"/><circle cx="810" cy="98" r="5"/></g>
<polyline points="510,114 660,151 810,231" fill="none" stroke="#2563ab" stroke-width="2.5" stroke-dasharray="7 4"/>
<g fill="#2563ab"><circle cx="510" cy="114" r="5"/><circle cx="660" cy="151" r="5"/><circle cx="810" cy="231" r="5"/></g>
<polyline points="385,184 410,170 435,186 460,270 485,279 510,286 660,284 810,230" fill="none" stroke="#b7791f" stroke-width="2.5"/>
<g fill="#b7791f"><circle cx="385" cy="184" r="5"/><circle cx="410" cy="170" r="5"/><circle cx="435" cy="186" r="5"/><circle cx="460" cy="270" r="5"/><circle cx="485" cy="279" r="5"/><circle cx="510" cy="286" r="5"/><circle cx="660" cy="284" r="5"/><circle cx="810" cy="230" r="5"/></g>
<text x="90" y="82" font-size="12" fill="#1e7a55">56.7</text><text x="215" y="255" font-size="12" fill="#1e7a55">52.5</text><text x="362" y="192" font-size="12" fill="#1e7a55">54.4</text><text x="516" y="306" font-size="12" fill="#1e7a55" font-weight="bold">51.8 最佳</text><text x="662" y="191" font-size="12" fill="#1e7a55">54.4</text><text x="818" y="92" font-size="12" fill="#1e7a55">56.3</text><text x="540" y="108" font-size="12" fill="#2563ab">56.0</text><text x="668" y="146" font-size="12" fill="#2563ab">55.2</text><text x="818" y="246" font-size="12" fill="#2563ab">52.9</text>
<g font-size="12"><line x1="540" y1="20" x2="570" y2="20" stroke="#1e7a55" stroke-width="2.5"/><text x="576" y="24" fill="#1e7a55">ConvNeXt 恒定 LR</text><line x1="690" y1="20" x2="720" y2="20" stroke="#2563ab" stroke-width="2.5" stroke-dasharray="7 4"/><text x="726" y="40" fill="#2563ab">U-Net 基线</text><line x1="540" y1="36" x2="570" y2="36" stroke="#b7791f" stroke-width="2.5"/><text x="576" y="40" fill="#b7791f" font-weight="bold">ConvNeXt + LR 衰减</text></g>
</svg></div>
<p class="mm-note">DTW-MCD 随 checkpoint 的波动（val 全量 100 句）。两条曲线的震荡幅度都远大于它们最优状态之间的差距。</p>
<table class="mm-plain">
<thead><tr><th>候选原因</th><th>验证方法</th><th>结论</th></tr></thead>
<tbody>
<tr><td>去噪器 / 声码器差异</td><td>同一 checkpoint × 挂/不挂 Denoiser × HiFi/BigVGAN（2×2 矩阵 + 声码器 A/B）</td><td>排除：各设置下曲线完全同步（差 &lt;0.3dB），6 组配对检验都不显著</td></tr>
<tr><td>时长预测漂移（DTW 对齐变难）</td><td>各 checkpoint 的 gen_len/ref_len 比</td><td>排除：比值稳定在 0.98~1.03，没有趋势</td></tr>
<tr><td>评估采样随机性</td><td>两种声码器各自独立随机采样后对比</td><td>排除：两条曲线几乎重合，读数来自模型本身</td></tr>
<tr><td>恒定学习率扰动</td><td>checkpoint 实测 lr=1e-4 全程无衰减；再从同一 ep100 出发做衰减/恒定对照</td><td>成立：临近收敛时步长偏大，权重在损失盆内来回跳，ODE 轨迹落进不同的"质量口袋"；val loss（MSE）对此不敏感</td></tr>
</tbody>
</table>
<p class="mm-note"><b>验证</b>：从同一个 ep100 checkpoint 出发再训 40 epoch，唯一变量是"ep105 起 LR 阶梯衰减（1e-4 → 6.25e-6）"。衰减的那条在 ep120 之后稳定在 51~52.6dB，恒定 LR 那条同期抖到 56.3；逐句配对比较，ep130 差 −0.62（p=0.036）、ep135 差 −3.37（p&lt;0.0001）、ep140 差 −3.78（p&lt;0.0001），LR 越低差距越大；WER 全程没有变化（p&gt;0.59）。修好之后 ConvNeXt 最好的一组（ep135，51.0dB）明显好于基线（52.9dB，p=0.0024），WER 打平。</p>
</div>

<style>
.mmdemo { color: inherit; font-size: .95rem; line-height: 1.7; }
.mmdemo h3 { margin: 1.8rem 0 .7rem; font-size: 1.08rem; }
.mmdemo .mm-note { font-size: .86rem; opacity: .85; margin: .5rem 0 .9rem; }
.mmdemo .mm-trans { font-size: .9rem; opacity: .9; margin: .3rem 0 .8rem; }
.mmdemo .mm-trans em { font-style: italic; }
.mmdemo .mm-tip { font-size: .82rem; opacity: .7; }
.mmdemo .mm-pipeline { display: flex; flex-wrap: wrap; align-items: stretch; gap: 0; margin: .6rem 0; }
.mmdemo .mm-pnode { border: 1.5px solid #1e7a55; border-radius: 8px; padding: 8px 12px; background: rgba(30,122,85,.10); min-width: 104px; text-align: center; }
.mmdemo .mm-pnode b { display: block; font-size: .86rem; color: #1e7a55; }
.mmdemo .mm-pnode span { font-size: .74rem; opacity: .8; }
.mmdemo .mm-pnode.mm-hl { background: #1e7a55; }
.mmdemo .mm-pnode.mm-hl b, .mmdemo .mm-pnode.mm-hl span { color: #fff; }
.mmdemo .mm-parrow { display: flex; align-items: center; padding: 0 6px; color: #1e7a55; }
.mmdemo .mm-specs { display: flex; flex-wrap: wrap; gap: 8px; margin: .4rem 0 .6rem; }
.mmdemo .mm-chip { border: 1px solid rgba(127,127,127,.35); border-radius: 999px; padding: 2px 11px; font-size: .8rem; opacity: .9; }
.mmdemo .mm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: .4rem 0 .6rem; }
.mmdemo .mm-card { border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 12px 14px; background: rgba(127,127,127,.05); }
.mmdemo .mm-card b { display: block; margin-bottom: 4px; color: #1e7a55; font-size: .9rem; }
.mmdemo .mm-card p { margin: 0; font-size: .85rem; }
.mmdemo table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: .86rem; }
.mmdemo th, .mmdemo td { border: 1px solid rgba(127,127,127,.35); padding: 6px 4px; text-align: center; }
.mmdemo thead th { background: #1e7a55; color: #fff; font-weight: 600; }
.mmdemo td.mm-sys { background: #1e7a55; color: #fff; font-weight: 600; }
.mmdemo td.mm-cond { background: #2c8f66; color: #fff; }
.mmdemo td.mm-play { background: rgba(127,127,127,.06); }
.mmdemo tr:hover td.mm-play { background: rgba(30,122,85,.12); }
.mmdemo td.mm-hl, .mmdemo th.mm-hl { outline: 2px solid rgba(30,122,85,.6); outline-offset: -2px; }
.mmdemo .mm-btn { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #1e7a55; background: transparent; color: #1e7a55; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.mmdemo .mm-btn:hover { background: rgba(30,122,85,.12); }
.mmdemo .mm-btn svg { width: 13px; height: 13px; fill: currentColor; }
.mmdemo .mm-btn.playing { background: #1e7a55; color: #fff; }
.mmdemo tr.mm-best td { background: rgba(30,122,85,.12); }
.mmdemo table.mm-plain th, .mmdemo table.mm-plain td { text-align: left; vertical-align: top; }
.mmdemo .mm-fig { background: #fff; border: 1px solid rgba(127,127,127,.35); border-radius: 8px; padding: 8px; margin: .4rem 0; }
.mmdemo .mm-fig svg { width: 100%; height: auto; display: block; }
[data-theme="dark"] .mmdemo .mm-btn { border-color: #4cc38a; color: #4cc38a; }
[data-theme="dark"] .mmdemo .mm-btn.playing { background: #4cc38a; color: #0d0d0d; }
[data-theme="dark"] .mmdemo .mm-pnode { border-color: #4cc38a; }
[data-theme="dark"] .mmdemo .mm-pnode b { color: #4cc38a; }
[data-theme="dark"] .mmdemo .mm-card b { color: #4cc38a; }
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
