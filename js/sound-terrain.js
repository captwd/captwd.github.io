import * as THREE from 'three';
import {TerrainParticles} from './terrain-particles.js';
import {TerrainNarrative} from './terrain-narrative.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A real height field: logarithmic frequency on X, music time on Z, FFT energy on Y.
export class SoundTerrain {
  constructor(canvas, {mobile = false, reduced = false} = {}) {
    this.mobile = mobile; this.reduced = reduced;
    this.renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: !mobile, powerPreference: 'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5));
    this.renderer.setClearColor(0x080e14, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x080e14, .0095);
    this.camera = new THREE.PerspectiveCamera(47, 1, .1, 260);
    this.target = new THREE.Vector3(0, 4, -24);
    this.yaw = .28; this.pitch = .28;this.zoom=1;
    this.scene.add(new THREE.HemisphereLight(0xc8f9ef, 0x091121, 2.1));
    const key = new THREE.DirectionalLight(0xc1ffe4, 3.2); key.position.set(-15, 30, 8); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb4a0ff, 2.4); fill.position.set(20, 12, -20); this.scene.add(fill);
    this.columns = mobile ? 49 : 65; this.rows = mobile ? 113 : 177;
    this.width = 82; this.depth = 110; this.front = 26; this.frequencySpan = .84;this.elevation=18.5;
    const count = this.columns * this.rows;
    this.positions = new Float32Array(count * 3); this.colors = new Float32Array(count * 3);
    const indices = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.columns; c++) {
      const i = (r * this.columns + c) * 3;
      this.positions[i] = (c / (this.columns - 1) - .5) * this.width;
      this.positions[i + 2] = this.front - r / (this.rows - 1) * this.depth;
      if (r < this.rows - 1 && c < this.columns - 1) {
        const a = r * this.columns + c, b = a + 1, d = a + this.columns, e = d + 1;
        indices.push(a, b, d, b, e, d);
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(indices);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, -28), 88);
    const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .82, metalness: .14, flatShading: true, side: THREE.DoubleSide, transparent: true});
    // Contour lines follow the actual elevation, including when the audio moves.
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float terrainElevation;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainElevation = position.y;');
      shader.fragmentShader = 'varying float terrainElevation;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float contour = abs(fract(terrainElevation * .72 - .5) - .5) / max(fwidth(terrainElevation * .72), .001);
        float contourInk = 1.0 - smoothstep(.05, 1.1, contour);
        diffuseColor.rgb += vec3(.18, .28, .25) * contourInk * .28;
        diffuseColor.a *= smoothstep(.04, .7, terrainElevation);`);
    };
    this.surface = new THREE.Mesh(this.geometry, material); this.surface.frustumCulled = false; this.scene.add(this.surface);
    this.grid = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({color: 0xa4f7df, wireframe: true, transparent: true, opacity: .075, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1}));
    this.grid.material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float terrainElevation;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainElevation = position.y;');
      shader.fragmentShader = 'varying float terrainElevation;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= smoothstep(.08, .8, terrainElevation);');
    };
    this.grid.frustumCulled = false; this.scene.add(this.grid);
    this.cursorPositions = new Float32Array(this.columns * 3);
    this.scan = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.cursorPositions, 3)), new THREE.LineBasicMaterial({color: 0xe1ffe9, transparent: true, opacity: .8, depthTest: false}));
    this.scan.renderOrder = 4; this.scene.add(this.scan);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(.25, .39, 32), new THREE.MeshBasicMaterial({color: 0xe8fff0, side: THREE.DoubleSide, transparent: true, opacity: .95, depthTest: false}));
    this.marker.renderOrder = 5; this.marker.visible = false; this.scene.add(this.marker);
    this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2(); this.normalZ = new THREE.Vector3(0, 0, 1);
    this.low = new THREE.Color('#102f3b'); this.mid = new THREE.Color('#1d927b'); this.high = new THREE.Color('#c6e8cf'); this.violet = new THREE.Color('#a397cd'); this.shade = new THREE.Color();
    this.selectionColor = new THREE.Color('#d2a4ff');
    this.boundaries = [0, 1].map(() => {
      const positions = new Float32Array(this.columns * 3);
      const line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)), new THREE.LineBasicMaterial({color: 0xd6b6ff, transparent: true, opacity: .9, depthTest: false}));
      line.frustumCulled = false; line.renderOrder = 5; line.visible = false; this.scene.add(line); return {line, positions};
    });
    for (const line of [this.scan, ...this.boundaries.map(boundary => boundary.line)]) {
      line.material.onBeforeCompile = shader => {
        shader.vertexShader='varying float lineElevation;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlineElevation = position.y;');
        shader.fragmentShader='varying float lineElevation;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= smoothstep(.18, .8, lineElevation);');
      };
    }
    this.particles = new TerrainParticles(this.scene, {mobile, reduced});
    this.narrative = new TerrainNarrative(this,{mobile,reduced});
    this.resize();
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    const area=this.viewArea();this.camera.aspect=area.width/area.height;this.camera.updateProjectionMatrix();this.updateCamera();
  }
  viewArea(){return !this.reading?{width:innerWidth,height:innerHeight,y:0}:innerWidth<900?{width:innerWidth,height:Math.min(220,innerHeight*.28),y:innerHeight-Math.min(220,innerHeight*.28)-64}:{width:Math.round(innerWidth*.39),height:innerHeight,y:0};}
  setReading(state){this.reading=!!state;this.narrative.set(state);this.resize();}
  view(){return {yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,target:this.target.clone()};}
  travelTo(view,duration=850){
    if(this.reduced||!duration){this.yaw=view.yaw;this.pitch=view.pitch;this.zoom=view.zoom;this.target.copy(view.target);this.flight=null;this.updateCamera();return;}
    const from=this.view(),yaw=from.yaw+THREE.MathUtils.euclideanModulo(view.yaw-from.yaw+Math.PI,Math.PI*2)-Math.PI;
    this.flight={from,to:{...view,yaw},at:performance.now(),duration};
  }
  tickCamera(now){
    const flight=this.flight;if(!flight)return;
    const t=Math.min(1,(now-flight.at)/flight.duration),ease=t*t*(3-2*t);
    for(const key of ['yaw','pitch','zoom'])this[key]=THREE.MathUtils.lerp(flight.from[key],flight.to[key],ease);
    this.target.copy(flight.from.target).lerp(flight.to.target,ease);this.updateCamera();if(t===1)this.flight=null;
  }
  setCoda(active){this.coda=active?{at:performance.now()}:null;this.codaLevel=active&&this.reduced?1:0;}
  updateCamera() {
    const portrait = this.camera.aspect < 1;
    const distance = (portrait&&!this.reading ? 63 : 49)*this.zoom;
    this.camera.position.set(this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * distance, this.target.y + Math.sin(this.pitch) * distance, this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * distance);
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
  }
  orbit(yaw, pitch) { this.yaw = THREE.MathUtils.euclideanModulo(yaw+Math.PI,Math.PI*2)-Math.PI; this.pitch = clamp(pitch, .15, .7); this.updateCamera(); }
  zoomBy(factor){this.flight=null;this.zoom=clamp(this.zoom*factor,.8,1.65);this.updateCamera();}
  setStoryFocus(map){this.storyFocus=map;if(map){if(!this.storyColor)this.storyColor=new THREE.Color();this.storyColor.set(map.color);}}
  resetView() { this.flight=null;this.target.set(0,this.camera.aspect<1?6:4,-24);this.zoom=1;this.orbit(.28,.28); }
  // Bilinear sampling keeps the terrain moving smoothly between FFT frames.
  energy(time, frequencyUnit) {
    const s = this.spectrum;
    const sourceTime = this.inputTime ? this.inputTime(time) : time;
    const selected = this.selection && sourceTime >= this.selection.start && sourceTime <= this.selection.end;
    time = sourceTime;
    if (!s || time < 0 || time > s.duration) return 0;
    const f = clamp(time / s.duration * (s.frames - 1), 0, s.frames - 1), fi = Math.floor(f), ft = f - fi;
    const b = clamp(frequencyUnit * this.frequencySpan * (s.bands - 1), 0, s.bands - 1), bi = Math.floor(b), bt = b - bi;
    const next = Math.min(s.frames - 1, fi + 1), right = Math.min(s.bands - 1, bi + 1);
    const a = s.values[fi * s.bands + bi] * (1 - bt) + s.values[fi * s.bands + right] * bt;
    const z = s.values[next * s.bands + bi] * (1 - bt) + s.values[next * s.bands + right] * bt;
    return clamp((a * (1 - ft) + z * ft) / 255 + (selected ? this.selection.db / 65 : 0), 0, 1);
  }
  height(time, u) {
    const step = 1 / (this.columns - 1);
    const e = this.energy(time, u) * .66 + this.energy(time, u - step) * .17 + this.energy(time, u + step) * .17;
    return Math.pow(Math.max(0, e - .08) / .92, 1.3) * this.elevation*(1-(this.codaLevel||0)*.92);
  }
  update({spectrum, windowStart, windowSize, cursor, started, selection = null, showSelection = true, inputTime = null, outputTime = null, duration = spectrum?.duration}) {
    if (!spectrum) return;
    if(this.coda){const t=this.reduced?1:Math.min(1,(performance.now()-this.coda.at)/6500);this.codaLevel=t*t*(3-2*t);}
    this.spectrum = spectrum; this.windowStart = windowStart; this.windowSize = windowSize;
    this.started=started;this.cursor=cursor;
    this.selection = selection; this.inputTime = inputTime; this.outputTime = outputTime; this.duration = duration;
    for (let r = 0; r < this.rows; r++) {
      const time = windowStart + r / (this.rows - 1) * windowSize;
      const sourceTime = inputTime ? inputTime(time) : time, selected = selection && sourceTime >= selection.start && sourceTime <= selection.end;
      for (let c = 0; c < this.columns; c++) {
        const u = c / (this.columns - 1), i = (r * this.columns + c) * 3, y = this.height(time, u);
        this.positions[i + 1] = y;
        const normalized = clamp(y / (this.elevation*.69), 0, 1);
        if (normalized < .48) this.shade.copy(this.low).lerp(this.mid, normalized / .48);
        else this.shade.copy(this.mid).lerp(this.high, (normalized - .48) / .52);
        this.shade.lerp(this.violet, Math.max(0, u - .45) * .55 * normalized);
        if (started && time < cursor) this.shade.multiplyScalar(.68);
        if (selection && showSelection) { if (selected) this.shade.lerp(this.selectionColor, .38); else this.shade.multiplyScalar(.78); }
        if(this.storyFocus){const dx=(u-(this.storyFocus.frequency??.5))*3,dz=(r/(this.rows-1)-(this.storyFocus.depth??.5))*2;this.shade.lerp(this.storyColor,Math.exp(-(dx*dx+dz*dz)*22)*.7);}
        this.colors[i] = this.shade.r; this.colors[i + 1] = this.shade.g; this.colors[i + 2] = this.shade.b;
      }
    }
    this.boundaries.forEach((boundary, i) => {
      const time = selection ? outputTime(i ? selection.end : selection.start) : -Infinity;
      const unit = (time - windowStart) / windowSize;
      boundary.line.visible = !!selection && showSelection && unit >= 0 && unit <= 1;
      if (!boundary.line.visible) return;
      for (let c = 0; c < this.columns; c++) { const u = c / (this.columns - 1); boundary.positions.set([(u - .5) * this.width, this.height(time, u) + .12, this.front - unit * this.depth], c * 3); }
      boundary.line.geometry.attributes.position.needsUpdate = true;
    });
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true;
    const t = (cursor - windowStart) / windowSize;
    this.scan.visible = started && t >= 0 && t <= 1;
    if (this.scan.visible) {
      for (let c = 0; c < this.columns; c++) {
        const u = c / (this.columns - 1);
        this.cursorPositions.set([(u - .5) * this.width, this.height(cursor, u) + .07, this.front - t * this.depth], c * 3);
      }
      this.scan.geometry.attributes.position.needsUpdate = true;
    }
  }
  pick(clientX, clientY, mark = true) {
    if (!this.spectrum) return null;
    this.mouse.set(clientX / innerWidth * 2 - 1, 1 - clientY / innerHeight * 2);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObject(this.surface, false).find(intersection => intersection.point.y >= .08);
    if (!hit) { if (mark) this.marker.visible = false; return null; }
    const unit = clamp((hit.point.x / this.width + .5), 0, 1);
    const time = this.windowStart + (this.front - hit.point.z) / this.depth * this.windowSize;
    if (time < 0 || time > this.duration) { if (mark) this.marker.visible = false; return null; }
    if (mark) {
      this.marker.visible = true; this.marker.position.copy(hit.point).addScaledVector(hit.face.normal, .07);
      this.marker.quaternion.setFromUnitVectors(this.normalZ, hit.face.normal);
    }
    return {time, sourceTime: this.inputTime ? this.inputTime(time) : time, point: hit.point.clone(), frequency: this.spectrum.minFrequency * (this.spectrum.maxFrequency / this.spectrum.minFrequency) ** (unit * this.frequencySpan), energy: this.energy(time, unit)};
  }
  // Intersect a fixed-height plane while dragging, so a tall ridge cannot make the selection jump.
  dragTime(clientX, clientY, height = 0) {
    this.mouse.set(clientX / innerWidth * 2 - 1, 1 - clientY / innerHeight * 2); this.raycaster.setFromCamera(this.mouse, this.camera);
    const point = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
    return point ? this.windowStart + (this.front - point.z) / this.depth * this.windowSize : null;
  }
  projectTime(time, u = .43) {
    if (!this.spectrum) return null;
    const t = (time - this.windowStart) / this.windowSize;
    if (t < 0 || t > 1) return null;
    const world = new THREE.Vector3((u - .5) * this.width, this.height(time, u) + .7, this.front - t * this.depth);
    const projected = world.clone().project(this.camera);
    return {x: (projected.x + 1) / 2 * innerWidth, y: (1 - projected.y) / 2 * innerHeight, point: world};
  }
  pointerWorld(clientX, clientY) {
    this.mouse.set(clientX / innerWidth * 2 - 1, 1 - clientY / innerHeight * 2); this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.ray.at(40, new THREE.Vector3());
  }
  clearHover() { this.marker.visible = false; }
  render(now = performance.now()) {
    this.narrative.update(now);this.particles.update(Math.min(.05,Math.max(0,(now-(this.lastRender||now))/1000)));
    this.particles.points.material.uniforms.fade.value=1-(this.codaLevel||0);this.lastRender=now;
    for(const ring of this.particles.rings)ring.mesh.material.opacity*=1-(this.codaLevel||0);
    const area=this.viewArea();this.renderer.setScissorTest(false);this.renderer.clear();this.renderer.setViewport(0,area.y,area.width,area.height);this.renderer.setScissor(0,area.y,area.width,area.height);this.renderer.setScissorTest(true);this.renderer.render(this.scene,this.camera);this.renderer.setScissorTest(false);
  }
}
