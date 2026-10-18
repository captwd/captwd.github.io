import * as THREE from 'three';
import { AudioLab } from './audio-engine.js';
import { MusicScene } from './music.js';

const lab = new AudioLab();
const base = new URL('../', import.meta.url);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const $ = id => document.getElementById(id);
const format = n => n.toFixed(2);
let view = 'wave', tool = 'select', flow = 1, stage = null, uiAbort = null, dirty = true, raf = 0;
let rotation = { x: 0, y: 0 }, drag = null, recorder = null, recordStream = null, recordTimer = null;
let renderer, scene, camera, root, cloud, ribbon, edges, grid, spectralMesh, highlight, playhead, particles;
let positions, targets, colors, noise, geometry, ribbonPos, ribbonColors, edgePos;
let width = innerWidth, height = innerHeight, cloudCount = 112 * 44, fallback = false;
const vector = new THREE.Vector3(), ray = new THREE.Raycaster(), plane = new THREE.Plane();
const mint = new THREE.Color('#a2ffe0'), violet = new THREE.Color('#8a82c9'), dim = new THREE.Color('#205b59');

function initializeScene() {
  try { renderer = new THREE.WebGLRenderer({ canvas: $('bg'), antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch { fallback = true; document.documentElement.classList.add('no-webgl'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.25 : 1.65));
  scene = new THREE.Scene(); camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 100); camera.position.z = 30;
  root = new THREE.Group(); scene.add(root);
  geometry = new THREE.BufferGeometry(); positions = new Float32Array(cloudCount * 3); targets = new Float32Array(positions.length); colors = new Float32Array(positions.length); noise = new Float32Array(positions.length);
  let seed = 8397; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random());
  for (let i = 0; i < cloudCount; i++) { noise[i * 3] = clamp(gaussian(), -2.8, 2.8) * 3.3; noise[i * 3 + 1] = clamp(gaussian(), -2.8, 2.8); noise[i * 3 + 2] = clamp(gaussian(), -2.8, 2.8) * 1.6; }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  cloud = new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { size: { value: coarse ? 2.2 : 2.7 } },
    vertexShader: 'attribute vec3 color; varying vec3 vColor; uniform float size; void main(){vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size;}',
    fragmentShader: 'varying vec3 vColor; void main(){float d=length(gl_PointCoord-.5);float a=1.-smoothstep(.08,.5,d);if(a<.01)discard;gl_FragColor=vec4(vColor,a*.85);}'
  })); cloud.frustumCulled = false; root.add(cloud);
  const surface = new THREE.BufferGeometry(); surface.setAttribute('position', geometry.attributes.position); surface.setAttribute('color', geometry.attributes.color);
  const lattice = [];
  for (let f = 0; f < 112; f++) for (let b = 0; b < 44; b++) {
    const i = f * 44 + b;
    if (f < 111) lattice.push(i, i + 44);
    if (b < 43) lattice.push(i, i + 1);
  }
  surface.setIndex(lattice); spectralMesh = new THREE.LineSegments(surface, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }));
  spectralMesh.frustumCulled = false; spectralMesh.visible = false; root.add(spectralMesh);
  const bins = 1600;
  ribbonPos = new Float32Array(bins * 6); ribbonColors = new Float32Array(bins * 6);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3)); rg.setAttribute('color', new THREE.BufferAttribute(ribbonColors, 3));
  const index = []; for (let i = 0; i < bins - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  rg.setIndex(index); ribbon = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .28, depthWrite: false, blending: THREE.AdditiveBlending })); ribbon.frustumCulled = false; root.add(ribbon);
  edgePos = new Float32Array((bins - 1) * 12); const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: '#85e8cd', transparent: true, opacity: .58, depthWrite: false })); edges.frustumCulled = false; root.add(edges);
  const gridPoints = [];
  for (let x = -10; x <= 10; x += 2) gridPoints.push(x, -2.9, -1.3, x, 2.9, -1.3);
  for (let y = -2; y <= 2; y++) gridPoints.push(-10, y, -1.3, 10, y, -1.3);
  grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3)), new THREE.LineBasicMaterial({ color: '#61998a', transparent: true, opacity: .10 })); root.add(grid);
  highlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 5.7), new THREE.MeshBasicMaterial({ color: '#7affd1', transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide })); highlight.position.z = -.2; root.add(highlight);
  playhead = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -2.8, .2), new THREE.Vector3(0, 2.8, .2)]), new THREE.LineBasicMaterial({ color: '#e6ffe9', transparent: true, opacity: .9 })); root.add(playhead);
  const dustPositions = new Float32Array((coarse ? 100 : 260) * 3);
  for (let i = 0; i < dustPositions.length; i += 3) { dustPositions[i] = (random() - .5) * 26; dustPositions[i + 1] = (random() - .5) * 20; dustPositions[i + 2] = -5; }
  particles = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dustPositions, 3)), new THREE.PointsMaterial({ color: '#6c9e91', size: .018, transparent: true, opacity: .35 })); scene.add(particles);
  resize();
}
function resize() {
  width = innerWidth; height = innerHeight;
  if (renderer) { renderer.setSize(width, height, false); camera.top = 12 * height / width; camera.bottom = -camera.top; camera.updateProjectionMatrix(); }
  requestRender();
}
function xAt(time) { return -10 + 20 * lab.outputTime(time) / lab.duration; }
function buildGeometry() {
  if (!lab.buffer || !renderer) return;
  const { low, high, peak, bins } = lab.summary, data = lab.buffer.getChannelData(0), amp = 10 ** (lab.db / 20);
  const { values, frames, bands } = lab.spectrum;
  for (let i = 0; i < cloudCount; i++) {
    const frame = Math.floor(i / bands), band = i % bands;
    const unit = view === 'spectrum' ? frame / (frames - 1) : i / (cloudCount - 1), time = unit * lab.buffer.duration;
    const selected = time >= lab.start && time <= lab.end, scale = selected ? amp : 1;
    let x = xAt(time), y, z;
    if (view === 'spectrum') { const power = clamp(values[i] + (selected ? lab.db / 65 : 0), 0, 1); y = power * 5.2 - 1.7; z = (band / (bands - 1) - .5) * 5; }
    else { y = data[Math.min(data.length - 1, Math.floor(unit * data.length))] / peak * 2.55 * scale; z = 0; }
    if (view === 'flow') { x = noise[i * 3] * (1 - flow) + x * flow; y = noise[i * 3 + 1] * (1 - flow) + y * flow; z = noise[i * 3 + 2] * (1 - flow); }
    targets[i * 3] = x; targets[i * 3 + 1] = y; targets[i * 3 + 2] = z;
    const color = selected ? mint.clone().lerp(new THREE.Color('#c1b4fa'), view === 'spectrum' ? 1 - values[i] : Math.min(.7, Math.abs(y) / 4)) : dim.clone().lerp(violet, .35);
    color.multiplyScalar(view === 'spectrum' ? .35 + values[i] * 1.8 : selected ? .85 : .55);
    color.toArray(colors, i * 3);
  }
  geometry.attributes.color.needsUpdate = true;
  for (let i = 0; i < bins; i++) {
    const time = i / (bins - 1) * lab.buffer.duration, selected = time >= lab.start && time <= lab.end, scale = selected ? amp : 1;
    const x = xAt(time), color = selected ? mint : dim;
    ribbonPos.set([x, low[i] / peak * 2.55 * scale, 0, x, high[i] / peak * 2.55 * scale, 0], i * 6);
    color.toArray(ribbonColors, i * 6); color.toArray(ribbonColors, i * 6 + 3);
    if (i < bins - 1) {
      const nx = xAt((i + 1) / (bins - 1) * lab.buffer.duration), ns = ((i + 1) / (bins - 1) * lab.buffer.duration >= lab.start && (i + 1) / (bins - 1) * lab.buffer.duration <= lab.end) ? amp : 1;
      edgePos.set([x, low[i] / peak * 2.55 * scale, 0, nx, low[i + 1] / peak * 2.55 * ns, 0, x, high[i] / peak * 2.55 * scale, 0, nx, high[i + 1] / peak * 2.55 * ns, 0], i * 12);
    }
  }
  ribbon.geometry.attributes.position.needsUpdate = true; ribbon.geometry.attributes.color.needsUpdate = true; edges.geometry.attributes.position.needsUpdate = true;
  ribbon.visible = edges.visible = view === 'wave';
  spectralMesh.visible = view === 'spectrum';
  highlight.scale.x = Math.max(.01, xAt(lab.end) - xAt(lab.start)); highlight.position.x = (xAt(lab.start) + xAt(lab.end)) / 2;
  dirty = true; requestRender();
}
function screenPoint(x, y = 0) {
  root.updateMatrixWorld(); vector.set(x, y, 0); root.localToWorld(vector); vector.project(camera);
  return { x: (vector.x + 1) * width / 2, y: (1 - vector.y) * height / 2 };
}
function pointerUnit(event) {
  const rect = stage.getBoundingClientRect();
  let unit;
  if (fallback) unit = (event.clientX - rect.left - rect.width * .035) / (rect.width * .93);
  else {
    root.updateMatrixWorld(); ray.setFromCamera(new THREE.Vector2(event.clientX / width * 2 - 1, 1 - event.clientY / height * 2), camera);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion); plane.setFromNormalAndCoplanarPoint(normal, root.position);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3()); if (!hit) return 0;
    root.worldToLocal(hit); unit = (hit.x + 10) / 20;
  }
  return clamp(unit, 0, 1);
}
function pointerTime(event) { return clamp(lab.inputTime(pointerUnit(event) * lab.duration), 0, lab.buffer?.duration || 1); }
function positionScene() {
  const rect = stage?.getBoundingClientRect(), home = rect && !document.body.classList.contains('ambient');
  if (!root) return home;
  const px = width / 24;
  if (home) {
    root.position.set((rect.left + rect.width / 2 - width / 2) / px, (height / 2 - rect.top - rect.height / 2) / px, 0);
    root.scale.set(rect.width * .93 / 20 / px, rect.height * .70 / 6 / px, rect.width * .56 / 20 / px);
  } else { root.position.set(0, -1, 0); root.scale.setScalar(1.35); }
  root.rotation.x = rotation.x + (view === 'spectrum' ? .40 : 0); root.rotation.y = rotation.y + (view === 'spectrum' ? -.10 : 0);
  root.updateMatrixWorld(); return home && rect.bottom > 0 && rect.top < height;
}
function updateOverlays() {
  if (!stage || !lab.buffer) return;
  const rect = stage.getBoundingClientRect();
  for (const [part, time] of [['start', lab.start], ['end', lab.end]]) {
    const handle = stage.querySelector(`[data-handle="${part}"]`);
    const x = fallback ? rect.width * (.035 + .93 * lab.outputTime(time) / lab.duration) : screenPoint(xAt(time)).x - rect.left;
    handle.style.left = `${x}px`; handle.hidden = view === 'flow' && flow < .9;
  }
  const progress = (lab.position() - lab.start) / Math.max(.01, lab.end - lab.start);
  const bar = $('play-progress'); if (bar) bar.style.width = `${clamp(progress, 0, 1) * 100}%`;
}
function drawFallback() {
  const canvas = $('wave-fallback'); if (!canvas || !lab.buffer) return;
  const rect = canvas.getBoundingClientRect(); canvas.width = rect.width * 1.5; canvas.height = rect.height * 1.5;
  const ctx = canvas.getContext('2d'); ctx.scale(1.5, 1.5);
  const { low, high, peak, bins } = lab.summary;
  for (let i = 0; i < bins; i++) {
    const t = i / (bins - 1) * lab.buffer.duration, x = rect.width * (.035 + .93 * lab.outputTime(t) / lab.duration), selected = t >= lab.start && t <= lab.end, a = selected ? 10 ** (lab.db / 20) : 1;
    ctx.strokeStyle = selected ? '#9fffe0' : '#335d5b'; ctx.beginPath(); ctx.moveTo(x, rect.height * .5 - high[i] / peak * rect.height * .3 * a); ctx.lineTo(x, rect.height * .5 - low[i] / peak * rect.height * .3 * a); ctx.stroke();
  }
  if (lab.playing) { const x = rect.width * (.035 + .93 * lab.outputTime(lab.position()) / lab.duration); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, 35); ctx.lineTo(x, rect.height - 35); ctx.stroke(); }
}
function render() {
  raf = 0; if (document.hidden) return;
  if (document.body.classList.contains('music-mode')) return;
  const visible = positionScene(); let moving = false;
  if (renderer) {
    if (dirty) {
      for (let i = 0; i < positions.length; i++) {
        const delta = targets[i] - positions[i]; positions[i] += reduced ? delta : delta * .16;
        if (Math.abs(delta) > .005) moving = true;
      }
      geometry.attributes.position.needsUpdate = true; dirty = moving;
    }
    playhead.visible = lab.playing && (view !== 'flow' || flow > .9);
    playhead.position.x = xAt(lab.position());
    renderer.render(scene, camera);
  } else if (visible || stage) drawFallback();
  updateOverlays();
  // The static scene sleeps after a morph; no idle render loop or hidden-tab work.
  if (moving || lab.playing) requestRender();
}
function requestRender() { if (!raf && !document.hidden) raf = requestAnimationFrame(render); }
function status(message) { const el = $('lab-status'); if (el) el.textContent = message; }
function updateUI() {
  if (lab.playing) document.dispatchEvent(new Event('blog:lab-playing'));
  const ready = !!lab.buffer && !lab.loading;
  document.querySelectorAll('#play-button,#download-button').forEach(b => b.disabled = !ready);
  const set = (id, value) => { if ($(id)) $(id).textContent = value; };
  set('clip-title', lab.title); set('selection-readout', `${format(lab.start)} — ${format(lab.end)} s`);
  set('output-duration', `${format((lab.end - lab.start) * lab.ratio)} s`); set('stretch-value', lab.ratio.toFixed(2) + '×'); set('gain-value', `${lab.db > 0 ? '+' : ''}${lab.db} dB`);
  if ($('stretch-slider')) $('stretch-slider').value = lab.ratio;
  if ($('gain-slider')) $('gain-slider').value = lab.db;
  if ($('play-button')) {
    $('play-button').setAttribute('aria-label', lab.playing ? '停止播放' : '播放选段');
    $('play-button').innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="${lab.playing ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l12-7z'}" fill="currentColor"/></svg>`;
  }
  set('sample-info', lab.loading ? '正在读取声音…' : lab.buffer ? `${format(lab.buffer.duration)} s · ${(lab.buffer.sampleRate / 1000).toFixed(1)} kHz · ${lab.buffer.numberOfChannels === 1 ? 'MONO' : 'STEREO'}` : '导入声音，开始探索');
  document.querySelectorAll('[data-source]').forEach(b => { b.classList.toggle('active', b.dataset.source === lab.kind); b.setAttribute('aria-pressed', b.dataset.source === lab.kind); });
  document.querySelectorAll('[data-handle]').forEach(b => { b.setAttribute('aria-valuemax', lab.buffer?.duration || 1); b.setAttribute('aria-valuenow', format(lab[b.dataset.handle])); b.setAttribute('aria-valuetext', `${format(lab[b.dataset.handle])} 秒`); });
  if ($('time-ticks')) $('time-ticks').innerHTML = Array.from({ length: 6 }, (_, i) => `<span>${(lab.duration * i / 5).toFixed(1)}</span>`).join('');
  const compact = $('audio-ui');
  if (compact) { compact.hidden = !document.body.classList.contains('ambient'); compact.innerHTML = `<button type="button" class="compact-play" aria-label="${lab.playing ? '停止' : '播放'}选段">${lab.playing ? 'Ⅱ' : '▷'}</button><div><strong></strong><a href="${base.href}">回到声音实验室 ↗</a></div>`; compact.querySelector('strong').textContent = lab.title; compact.querySelector('button').onclick = () => lab.toggle(); }
  buildGeometry(); requestRender();
}
function setView(mode) {
  view = fallback ? 'wave' : mode;
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-pressed', b.dataset.view === view); if (fallback && b.dataset.view !== 'wave') b.disabled = true; });
  const captions = { wave: ['AMPLITUDE / TIME', '归一化振幅 · 横轴是可试听的声音时间'], spectrum: ['FREQUENCY × TIME × ENERGY', '高度＝能量 · 纵深＝60 Hz → 10 kHz'], flow: ['xₜ = (1 − t) ε + t x', '固定噪声与真实语音采样点之间的空间插值'] };
  if ($('plot-title')) $('plot-title').textContent = captions[view][0];
  if ($('plot-description')) $('plot-description').textContent = captions[view][1];
  const flowUI = document.querySelector('.flow-control'); if (flowUI) flowUI.hidden = view !== 'flow';
  buildGeometry();
}
async function record() {
  if (recorder?.state === 'recording') { recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { status('当前环境不能录音，请导入一段声音。'); return; }
  try {
    lab.stop(); lab.emit(); recordStream = await navigator.mediaDevices.getUserMedia({ audio: true }); const chunks = [];
    recorder = new MediaRecorder(recordStream); recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      clearTimeout(recordTimer); recordStream.getTracks().forEach(t => t.stop()); recordStream = null;
      if ($('record-button')) { $('record-button').textContent = '◉ 录一段'; $('record-button').classList.remove('recording'); }
      lab.load(new Blob(chunks, { type: recorder.mimeType }), '你的声音 · 本地录音', 'recording'); status('录音已就绪。声音只保存在当前页面。');
    };
    recorder.start(); recordTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 12000);
    $('record-button').textContent = '■ 停止录音'; $('record-button').classList.add('recording'); status('正在录音，最长 12 秒。再次点击停止。');
  } catch { status('没有获得麦克风权限，你仍然可以导入声音。'); }
}
function bindUI() {
  uiAbort?.abort(); uiAbort = new AbortController(); const signal = uiAbort.signal;
  stage = $('wave-stage');
  if (stage) stage.dataset.tool = tool;
  document.querySelectorAll('.stage-tools [data-tool]').forEach(b => { b.classList.toggle('active', b.dataset.tool === tool); b.setAttribute('aria-pressed', b.dataset.tool === tool); });
  const on = (el, type, callback) => el?.addEventListener(type, callback, { signal });
  document.querySelectorAll('[data-source]').forEach(b => on(b, 'click', () => lab.load(new URL(`audio/tts-${b.dataset.source}.mp3`, base).href, `Matcha-TTS · ${b.dataset.source === 'happy' ? '喜悦' : '悲伤'}`, b.dataset.source)));
  document.querySelectorAll('[data-view]').forEach(b => on(b, 'click', () => setView(b.dataset.view)));
  document.querySelectorAll('.stage-tools [data-tool]').forEach(b => on(b, 'click', () => {
    tool = b.dataset.tool; document.querySelectorAll('.stage-tools [data-tool]').forEach(t => { t.classList.toggle('active', t === b); t.setAttribute('aria-pressed', t === b); });
    if (stage) stage.dataset.tool = tool; if ($('stage-instruction')) $('stage-instruction').textContent = tool === 'orbit' ? '拖动旋转 · 重置恢复视角' : tool === 'stretch' ? '横向拉伸时间 · 纵向改变振幅' : '点按试听 · 拖动选段';
  }));
  on($('play-button'), 'click', () => lab.toggle()); on($('download-button'), 'click', () => { lab.download(); status('已保存变换后的 WAV 片段。'); });
  on($('stretch-slider'), 'input', e => { lab.setRatio(Number(e.target.value)); status('选中片段的时长已改变，按播放试听。'); });
  on($('gain-slider'), 'input', e => lab.setGain(Number(e.target.value)));
  on($('flow-slider'), 'input', e => { flow = Number(e.target.value); $('flow-value').textContent = `t = ${flow.toFixed(2)}`; buildGeometry(); });
  on($('reset-button'), 'click', () => { rotation = { x: 0, y: 0 }; flow = 1; if ($('flow-slider')) $('flow-slider').value = 1; if ($('flow-value')) $('flow-value').textContent = 't = 1.00'; lab.ratio = 1; lab.db = 0; lab.select(0, Math.min(2.5, lab.buffer?.duration || 1)); status('已恢复原始声音与视角。'); });
  on($('audio-file'), 'change', e => { const file = e.target.files[0]; if (file) { lab.load(file, file.name, 'upload'); status('声音在浏览器本地处理。'); } });
  on($('record-button'), 'click', record);
  on(stage, 'dragover', e => { e.preventDefault(); stage.classList.add('drop-active'); });
  on(stage, 'dragleave', () => stage.classList.remove('drop-active'));
  on(stage, 'drop', e => { e.preventDefault(); stage.classList.remove('drop-active'); const file = e.dataTransfer.files[0]; if (file) lab.load(file, file.name, 'upload'); });
  on(stage, 'pointerdown', event => {
    if (!lab.buffer || lab.loading || event.button !== 0 || event.target.closest('.stage-tools,.flow-control')) return;
    if (view === 'flow' && flow < .9 && tool !== 'orbit') { status('将 t 移到语音端，再选择对应的声音片段。'); return; }
    event.preventDefault(); stage.focus({ preventScroll: true });
    drag = { x: event.clientX, y: event.clientY, time: pointerTime(event), handle: event.target.closest('[data-handle]')?.dataset.handle, start: lab.start, end: lab.end, rx: rotation.x, ry: rotation.y, moved: false, duration: lab.duration, selectionStart: lab.start, selectionEnd: lab.end, ratio: lab.ratio, db: lab.db };
    lab.stop(); lab.emit(); lab.context().resume().catch(() => {}); stage.setPointerCapture(event.pointerId); stage.classList.add('dragging');
  });
  on(stage, 'pointermove', event => {
    if (!lab.buffer) return;
    const time = pointerTime(event);
    if (!drag) {
      const hover = $('hover-time'); hover.hidden = false; hover.textContent = `${format(time)} s`; hover.style.left = `${clamp(event.clientX - stage.getBoundingClientRect().left, 30, stage.clientWidth - 45)}px`; return;
    }
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true;
    if (tool === 'orbit' && !drag.handle) { rotation.y = clamp(drag.ry + (event.clientX - drag.x) * .004, -.7, .7); rotation.x = clamp(drag.rx + (event.clientY - drag.y) * .004, -.7, .7); requestRender(); return; }
    if (tool === 'stretch' && !drag.handle) {
      lab.setRatio(Math.round(clamp(drag.ratio + (event.clientX - drag.x) / stage.clientWidth * 2, .6, 1.8) * 20) / 20);
      lab.setGain(Math.round(clamp(drag.db - (event.clientY - drag.y) / 12, -18, 6))); return;
    }
    // Keep the initial mapping fixed while dragging; changing selection also changes stretched coordinates.
    const unit = pointerUnit(event);
    let mapped = time;
    if (lab.ratio !== 1) {
      const output = unit * drag.duration, edge = drag.selectionStart + (drag.selectionEnd - drag.selectionStart) * drag.ratio;
      mapped = output <= drag.selectionStart ? output : output < edge ? drag.selectionStart + (output - drag.selectionStart) / drag.ratio : output - (drag.selectionEnd - drag.selectionStart) * (drag.ratio - 1);
    }
    if (drag.handle === 'start') lab.select(Math.min(mapped, drag.end - .08), drag.end);
    else if (drag.handle === 'end') lab.select(drag.start, Math.max(mapped, drag.start + .08));
    else if (drag.moved) lab.select(Math.min(drag.time, mapped), Math.max(drag.time, mapped));
  });
  on(stage, 'pointerup', event => {
    if (!drag) return;
    const previous = drag; drag = null; stage.classList.remove('dragging');
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (tool === 'orbit' && !previous.handle) return;
    if (tool === 'stretch' && !previous.handle) { lab.play(); status('正在试听你拉伸后的声音。'); return; }
    if (!previous.moved && !previous.handle) { const start = Math.min(previous.time, lab.buffer.duration - .08); lab.select(start, Math.min(start + 1.6, lab.buffer.duration)); }
    lab.play(); status('正在试听选中的声音片段。');
  });
  on(stage, 'pointercancel', () => { drag = null; stage.classList.remove('dragging'); lab.emit(); });
  on(stage, 'pointerleave', () => { if ($('hover-time')) $('hover-time').hidden = true; });
  on(stage, 'keydown', e => {
    if (!lab.buffer) return;
    if (e.key === ' ') { e.preventDefault(); lab.toggle(); }
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); const delta = e.key === 'ArrowLeft' ? -.05 : .05, part = e.target.dataset.handle;
    if (part === 'start') lab.select(Math.min(lab.start + delta, lab.end - .08), lab.end);
    else if (part === 'end') lab.select(lab.start, lab.end + delta);
    else { const length = lab.end - lab.start, start = clamp(lab.start + delta, 0, lab.buffer.duration - length); lab.select(start, start + length); }
  });
  if ($('flow-slider')) $('flow-slider').value = flow;
  if ($('flow-value')) $('flow-value').textContent = `t = ${flow.toFixed(2)}`;
  setView(view); updateUI();
}

initializeScene();
lab.addEventListener('change', updateUI);
lab.addEventListener('loaded', () => status('点按任意位置试听，或拖动选取一段声音。'));
lab.addEventListener('error', e => status(`无法读取声音：${e.detail}。请换一个文件重试。`));
window.addEventListener('resize', resize); window.addEventListener('scroll', requestRender, { passive: true });
document.addEventListener('blog:navigate', bindUI);
document.addEventListener('blog:mode', event => {
  if (!event.detail.editor && lab.playing) { lab.stop(); lab.emit(); }
  requestRender();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; if (lab.playing) { lab.head = lab.position(); lab.stop(); lab.emit(); } } else requestRender(); });
window.addEventListener('pagehide', () => { lab.stop(); recordStream?.getTracks().forEach(t => t.stop()); clearTimeout(recordTimer); });
// Direct loading of an article still includes the existing journal data on return to home.
if (!window.POSTS) { const script = document.createElement('script'); script.src = new URL('js/posts.js', base).href; script.onload = () => { if (!window.renderCards) { const cards = document.createElement('script'); cards.src = new URL('js/site.js', base).href; document.head.appendChild(cards); } }; document.head.appendChild(script); }
bindUI();
lab.load(new URL('audio/tts-happy.mp3', base).href, 'Matcha-TTS · 喜悦', 'happy');
const musicScene = new MusicScene();

