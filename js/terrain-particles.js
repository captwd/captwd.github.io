import * as THREE from 'three';

// A bounded point pool, with no images or per-frame DOM elements.
export class TerrainParticles {
  constructor(scene, {mobile = false, reduced = false} = {}) {
    this.reduced = reduced; this.enabled = true; this.count = mobile ? 140 : 300; this.next = 0;
    this.positions = new Float32Array(this.count * 3); this.velocity = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count); this.maxLife = new Float32Array(this.count); this.sizes = new Float32Array(this.count);
    this.colors = new Float32Array(this.count * 3); this.energy = new Float32Array(this.count);
    this.positions.fill(10000);
    this.geometry = new THREE.BufferGeometry();
    for (const [name, array, size] of [['position', this.positions, 3], ['aLife', this.life, 1], ['aSize', this.sizes, 1], ['color', this.colors, 3]]) this.geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: {pixelRatio: {value: Math.min(devicePixelRatio || 1, 1.5)}},
      vertexShader: `attribute float aLife; attribute float aSize; varying float life; varying vec3 tint; uniform float pixelRatio;
        void main(){life=aLife;tint=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*1100./max(1.,-p.z),1.,22.)*pixelRatio;}`,
      fragmentShader: `varying float life; varying vec3 tint;
        void main(){float r=length(gl_PointCoord-.5)*2.;float glow=exp(-r*r*5.);float core=1.-smoothstep(.05,.28,r);gl_FragColor=vec4(tint+core*.45,(glow*.65+core*.35)*life);}`
    });
    this.points = new THREE.Points(this.geometry, material); this.points.frustumCulled = false; this.points.renderOrder = 8; scene.add(this.points);
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.93, 1, 64), new THREE.MeshBasicMaterial({color: 0x9ef8dc, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending}));
      ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 7; scene.add(ring); this.rings.push({mesh: ring, age: 2});
    }
  }
  emit(point, {burst = false, sculpt = false, energy = .5} = {}) {
    if (!point || !this.enabled || this.reduced) return;
    const count = burst ? 38 : sculpt ? 8 : 3;
    for (let n = 0; n < count; n++) {
      const i = this.next++ % this.count, at = i * 3, angle = Math.random() * Math.PI * 2;
      const radius = burst ? Math.random() * .5 : Math.random() * .15, speed = burst ? 2 + Math.random() * 5 : .2 + Math.random() * .8;
      this.positions.set([point.x + Math.cos(angle) * radius, point.y + .08, point.z + Math.sin(angle) * radius], at);
      this.velocity.set([Math.cos(angle) * speed, (burst ? 2 : .5) + Math.random() * (sculpt ? 3 : 1.5), Math.sin(angle) * speed], at);
      this.maxLife[i] = .55 + Math.random() * (burst ? .8 : .65); this.energy[i] = this.maxLife[i]; this.life[i] = 1;
      this.sizes[i] = .08 + Math.random() * .15 + (sculpt ? .05 : 0);
      this.colors.set(sculpt || n % 4 === 0 ? [.72, .54, 1] : [.36 + energy * .3, 1, .82], at);
    }
    if (burst) { const ring = this.rings.find(r => r.age > 1) || this.rings[0]; ring.age = 0; ring.mesh.position.copy(point); ring.mesh.position.y += .12; ring.mesh.visible = true; }
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.energy[i] <= 0) continue;
      this.energy[i] -= dt; this.life[i] = Math.max(0, this.energy[i] / this.maxLife[i]);
      for (let c = 0; c < 3; c++) this.positions[i * 3 + c] += this.velocity[i * 3 + c] * dt;
      this.velocity[i * 3 + 1] -= dt * .7;
    }
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.aLife.needsUpdate = true; this.geometry.attributes.aSize.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true;
    for (const ring of this.rings) {
      ring.age += dt; ring.mesh.visible = this.enabled && ring.age < 1;
      if (ring.mesh.visible) { ring.mesh.scale.setScalar(.3 + ring.age * 5); ring.mesh.material.opacity = (1 - ring.age) * .6; }
    }
    this.points.visible = this.enabled;
  }
}
