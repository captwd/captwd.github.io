import * as THREE from 'three';

// A bounded visual essay over the real spectral surface. The audio samples are never changed.
export class TerrainNarrative{
  constructor(terrain,{mobile,reduced}){
    this.terrain=terrain;this.reduced=reduced;this.count=mobile?80:160;this.amount=0;
    this.positions=new Float32Array(this.count*3);this.tails=new Float32Array(this.count*6);this.colors=new Float32Array(this.count*3);
    for(let i=0;i<this.count;i++)this.colors.set(i%3?[.48,1,.81]:[.76,.64,1],i*3);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3));
    this.points=new THREE.Points(geometry,new THREE.PointsMaterial({size:.22,vertexColors:true,transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));this.points.frustumCulled=false;this.points.renderOrder=6;terrain.scene.add(this.points);
    const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.BufferAttribute(this.tails,3).setUsage(THREE.DynamicDrawUsage));
    this.lines=new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:0x9ff4d7,transparent:true,opacity:0,depthWrite:false,depthTest:false}));this.lines.frustumCulled=false;this.lines.renderOrder=6;terrain.scene.add(this.lines);
  }
  set(state){
    if(state){this.lastState=state;if(this.kind!==state.kind){
      this.kind=state.kind;
      for(let i=0;i<this.count;i++)this.colors.set(state.kind==='guidance'&&i%2?[.8,.63,1]:[.48,1,.81],i*3);
      this.points.geometry.attributes.color.needsUpdate=true;
    }}
    this.state=state;
  }
  update(now){
    const {terrain}=this,state=this.state||this.lastState,wanted=this.state&&!terrain.coda?1:0;
    this.amount=this.reduced?wanted:THREE.MathUtils.lerp(this.amount,wanted,.07);
    this.points.visible=this.lines.visible=this.amount>.005;
    const wire=state?.kind==='wire'?this.amount:0;
    terrain.surface.material.opacity=1-wire*.86;terrain.grid.material.opacity=.075+wire*.24;
    if(!this.points.visible||!terrain.spectrum)return;
    const progress=state.progress||0,kind=state.kind,clock=this.reduced?0:now/1000;
    for(let i=0;i<this.count;i++){
      const u=(i%16+.5)/16,depth=.18+Math.floor(i/16)/Math.ceil(this.count/16)*.64;
      const time=terrain.windowStart+depth*terrain.windowSize,x=(u-.5)*terrain.width,z=terrain.front-depth*terrain.depth,y=terrain.height(time,u)+(kind==='flow'||kind==='guidance'?2.8:.4);
      const phase=this.reduced ? .65 : (clock*.15+i*.618)%1,t=phase*phase*(3-2*phase),converge=.2+progress*.65;
      let px=x,py=y,pz=z,tx=x,ty=y,tz=z;
      if(kind==='spectrum'){
        px=tx=x;py=y+phase*7;ty=y+Math.max(0,phase-.16)*7;pz=tz=z;
      }else if(kind==='wire'){
        px=tx=x;py=ty=y;pz=z+Math.sin(clock*.3+i)*.15;tz=pz-.7;
      }else{
        const drift=kind==='guidance'&&i%2?6*(.3+progress):0;
        const noiseX=x+Math.sin(i*12.91)*12,noiseY=5+Math.cos(i*7.13)*6,noiseZ=z+Math.sin(i*4.77)*8;
        const k=converge+(1-converge)*t,tail=Math.max(0,k-.16);
        px=THREE.MathUtils.lerp(noiseX,x+drift,k);py=THREE.MathUtils.lerp(noiseY,y,k)+Math.sin(phase*Math.PI)*2;pz=THREE.MathUtils.lerp(noiseZ,z,k);
        tx=THREE.MathUtils.lerp(noiseX,x+drift,tail);ty=THREE.MathUtils.lerp(noiseY,y,tail)+Math.sin(Math.max(0,phase-.06)*Math.PI)*2;tz=THREE.MathUtils.lerp(noiseZ,z,tail);
      }
      this.positions.set([px,py,pz],i*3);this.tails.set([tx,ty,tz,px,py,pz],i*6);
    }
    this.points.geometry.attributes.position.needsUpdate=true;this.lines.geometry.attributes.position.needsUpdate=true;
    this.points.material.opacity=this.amount*.85;this.lines.material.opacity=this.amount*(kind==='spectrum'?.45:.24);
  }
}
