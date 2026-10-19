import * as THREE from 'three';
import {CSS3DObject, CSS3DRenderer} from 'three/addons/renderers/CSS3DRenderer.js';

const TAU = Math.PI * 2;
const wrap = value => THREE.MathUtils.euclideanModulo(value + Math.PI, TAU) - Math.PI;

// HTML article faces and WebGL frames share exactly the terrain camera and world units.
export class ArticleOrbit {
  constructor({terrain, host, entries, reduced, schedule}) {
    this.terrain=terrain;this.entries=entries;this.reduced=reduced;this.schedule=schedule;
    this.scene=new THREE.Scene();this.renderer=new CSS3DRenderer();
    this.renderer.domElement.className='article-orbit-renderer';
    // A scroll container would move HTML planes independently when links receive focus.
    this.renderer.domElement.style.overflow='clip';host.classList.add('story-gallery');host.appendChild(this.renderer.domElement);
    this.active=0;this.lifted=false;this.ray=new THREE.Raycaster();this.toSample=new THREE.Vector3();this.sample=new THREE.Vector3();this.lastOcclusion=0;
    this.width=320;this.height=208;this.unit=.026;
    const layout=[[-.85,6],[-2.45,8],[2.35,10],[.85,7]],sideOffsets=[3,-6,7,-5],depthOffsets=[-6,-4,3,5];
    entries.forEach((entry,index)=>{
      const [angle,elevation]=layout[index]||[-Math.PI+TAU*index/entries.length,8+(index%2)*2];
      const cardOffsetX=sideOffsets[index]??(index%2?5:-5),cardOffsetZ=depthOffsets[index]??0;
      const object=new CSS3DObject(entry.anchor);object.position.set(((entry.map.frequency??.5)-.5)*terrain.width+cardOffsetX,elevation,terrain.front-(entry.map.depth??.5)*terrain.depth+cardOffsetZ);
      object.rotation.set(-.06,angle,Math.sin(angle)*-.025);object.scale.setScalar(this.unit);this.scene.add(object);
      const frame=new THREE.Mesh(new THREE.BoxGeometry(this.width*this.unit+.08,this.height*this.unit+.08,.10),new THREE.MeshStandardMaterial({color:0x12342f,roughness:.6,metalness:.4,transparent:true,opacity:.6}));
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(frame.geometry),new THREE.LineBasicMaterial({color:entry.map.color,transparent:true,opacity:.42}));frame.add(edge);terrain.scene.add(frame);
      const tetherPositions=new Float32Array(25*3),tether=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(tetherPositions,3)),new THREE.LineBasicMaterial({color:entry.map.color,transparent:true,opacity:.2,depthWrite:false}));
      tether.frustumCulled=false;terrain.scene.add(tether);
      Object.assign(entry,{orbitObject:object,orbitFrame:frame,orbitEdge:edge,orbitAngle:angle,orbitElevation:elevation,cardOffsetX,cardOffsetZ,tether,tetherPositions,orbitOccluded:false});
      this.bindCard(entry);
    });
    // Keep the full-screen terrain camera and zoom. Only the card planes are smaller.
    if(innerWidth<760)terrain.orbit(entries[0]?.orbitAngle||0,.28);this.resize();
    document.addEventListener('blog:orbit-reset',()=>{this.animation=null;this.lifted=false;this.active=0;this.updateControls();this.schedule();});
  }
  setControls(previous,next,label){this.previous=previous;this.next=next;this.label=label;previous.addEventListener('click',()=>this.step(-1));next.addEventListener('click',()=>this.step(1));this.updateControls();}
  visibleEntries(){return this.entries.filter(entry=>entry.visible);}
  cancelMotion(){this.animation=null;}
  step(direction){
    const visible=this.visibleEntries();if(!visible.length)return;
    const selected=this.entries[this.active],index=visible.indexOf(selected),next=visible[(Math.max(0,index)+direction+visible.length)%visible.length];
    this.bringForward(next);
  }
  bringForward(next){
    if(!next)return;this.active=next.index;this.lifted=true;
    this.onSelect?.(next);
    const point=next.orbitObject.position,angle=Math.atan2(point.x-this.terrain.target.x,point.z-this.terrain.target.z);
    const yaw=this.terrain.yaw,target=yaw+wrap(angle-yaw);
    this.animation={from:yaw,to:target,pitch:this.terrain.pitch,at:performance.now(),duration:this.reduced?0:700};
    this.updateControls();this.schedule();
  }
  updateControls(){
    const visible=this.visibleEntries();if(!this.label)return;
    let selected=this.entries[this.active];if(!selected?.visible){selected=visible[0];if(selected)this.active=selected.index;}
    this.previous.disabled=this.next.disabled=visible.length<2;
    const text=selected?`${String(visible.indexOf(selected)+1).padStart(2,'0')} / ${String(visible.length).padStart(2,'0')} · ${selected.map.label}`:'文章环廊';
    if(this.label.textContent!==text)this.label.textContent=text;
  }
  resize(force=false){if(!force&&this.viewWidth===innerWidth&&this.viewHeight===innerHeight)return;this.viewWidth=innerWidth;this.viewHeight=innerHeight;this.renderer.setSize(innerWidth,innerHeight);}
  bindCard(entry){
    const anchor=entry.anchor;
    anchor.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;this.animation=null;this.terrain.flight=null;this.drag={entry,x:event.clientX,y:event.clientY,yaw:this.terrain.yaw,pitch:this.terrain.pitch,moved:false,id:event.pointerId};anchor.setPointerCapture(event.pointerId);
    });
    anchor.addEventListener('pointermove',event=>{
      const drag=this.drag;if(!drag||drag.entry!==entry)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(Math.hypot(dx,dy)>6)drag.moved=true;
      if(drag.moved){event.preventDefault();anchor.classList.add('is-orbit-dragging');this.terrain.orbit(drag.yaw-dx*.004,drag.pitch+dy*.003);this.schedule();}
    });
    const release=event=>{if(!this.drag||this.drag.entry!==entry)return;if(this.drag.moved)this.lastDrag=performance.now();this.drag=null;anchor.classList.remove('is-orbit-dragging');if(anchor.hasPointerCapture(event.pointerId))anchor.releasePointerCapture(event.pointerId);};
    anchor.addEventListener('pointerup',release);anchor.addEventListener('pointercancel',release);
    anchor.addEventListener('click',event=>{if(performance.now()-(this.lastDrag||-1000)<350){event.preventDefault();event.stopImmediatePropagation();}},true);
  }
  isCovered(entry){
    const object=entry.orbitObject,camera=this.terrain.camera;
    const samples=[[0,0],[-this.width*.33,this.height*.30],[this.width*.33,this.height*.30]];
    let covered=0;
    for(const [x,y]of samples){
      this.sample.set(x,y,0);object.localToWorld(this.sample);this.toSample.subVectors(this.sample,camera.position);const distance=this.toSample.length();
      this.ray.set(camera.position,this.toSample.normalize());this.ray.near=.1;this.ray.far=Math.max(.1,distance-.25);
      if(this.ray.intersectObject(this.terrain.surface,false).some(hit=>hit.point.y>.55))covered++;
    }
    return covered===samples.length;
  }
  update(now,{editing,hovered,current,active=true,showCards=true}){
    this.resize();
    if(this.animation&&!editing&&!current&&active){const animation=this.animation,t=animation.duration?Math.min(1,(now-animation.at)/animation.duration):1,eased=1-(1-t)**3;this.terrain.orbit(animation.from+(animation.to-animation.from)*eased,animation.pitch+(.28-animation.pitch)*eased);if(t===1)this.animation=null;}
    const occlusion=now-this.lastOcclusion>280;if(occlusion)this.lastOcclusion=now;
    const camera=this.terrain.camera,galleryVisible=active&&showCards&&!editing&&!current;
    this.entries.forEach(entry=>{
      const focused=entry.post.slug===hovered,selected=entry.index===this.active,object=entry.orbitObject;
      // The same timeline-to-world mapping moves the actual mountain, article marker and card.
      object.position.x=entry.point.x+entry.cardOffsetX;object.position.z=entry.point.z+entry.cardOffsetZ;
      const u=THREE.MathUtils.clamp(object.position.x/this.terrain.width+.5,0,1),time=this.terrain.windowStart+(this.terrain.front-object.position.z)/this.terrain.depth*this.terrain.windowSize;
      const lift=selected&&this.lifted?1.5:0,targetY=Math.max(entry.orbitElevation,this.terrain.height(time,u)+3.5)+lift+(focused ? .4 : 0);
      object.position.y=this.reduced?targetY:THREE.MathUtils.lerp(object.position.y,targetY,.13);
      const depth=Math.max(1,-this.sample.copy(object.position).applyMatrix4(camera.matrixWorldInverse).z),pixelsPerUnit=innerHeight*.5*camera.projectionMatrix.elements[5]/depth;
      const maxWidth=innerWidth<760?245:360,scale=this.unit*(focused?1.035:1)*Math.min(1,maxWidth/(this.width*this.unit*pixelsPerUnit));
      object.lookAt(camera.position);object.rotateZ(Math.sin(entry.orbitAngle)*.025);object.rotateX(-.035);
      object.scale.setScalar(scale);object.updateMatrixWorld();
      // Explicit face selection also avoids mirrored text bleeding through translucent CSS planes.
      this.sample.copy(camera.position);object.worldToLocal(this.sample);entry.anchor.classList.toggle('is-back-facing',this.sample.z<0);
      const point=object.position.clone().project(camera),inView=point.z>0&&point.z<1&&Math.abs(point.x)<1.4&&Math.abs(point.y)<1.35;
      if(occlusion&&inView&&galleryVisible&&entry.visible&&entry.inFlow)entry.orbitOccluded=this.isCovered(entry);
      const reading=focused||(selected&&this.lifted);
      object.visible=entry.visible&&entry.inFlow&&entry.flowAlpha>.03&&galleryVisible&&inView&&(!entry.orbitOccluded||reading);
      if(!object.visible&&entry.anchor.contains(document.activeElement))this.next?.focus({preventScroll:true});
      entry.anchor.classList.toggle('is-orbit-active',selected);entry.anchor.classList.remove('is-offscreen');
      entry.anchor.setAttribute('aria-hidden',String(!object.visible));entry.anchor.tabIndex=object.visible?0:-1;
      entry.orbitFrame.position.copy(object.position);entry.orbitFrame.quaternion.copy(object.quaternion);entry.orbitFrame.scale.setScalar(scale/this.unit);entry.orbitFrame.visible=object.visible;
      entry.orbitFrame.material.opacity=.6*entry.flowAlpha;entry.orbitEdge.material.opacity=(focused||selected ? .85 : .36)*entry.flowAlpha;
      const distance=camera.position.distanceTo(object.position);entry.anchor.style.setProperty('--depth-light',String(THREE.MathUtils.clamp(1.25-distance/210,.62,1)*entry.flowAlpha));
      entry.tether.visible=object.visible;
      if(entry.tether.visible){
        const start=entry.point.clone().add(new THREE.Vector3(0,entry.markerLift||3.2,0)),end=new THREE.Vector3(0,-this.height*.5,0);object.localToWorld(end);
        entry.tether.material.opacity=(focused ? .7 : .22)*entry.flowAlpha;
        entry.tether.material.depthTest=!focused;entry.tether.renderOrder=focused?7:0;
        const middle=start.clone().lerp(end,.55);middle.y=Math.max(start.y,end.y)+2;
        const curve=new THREE.QuadraticBezierCurve3(start,middle,end);for(let i=0;i<25;i++){const p=curve.getPoint(i/24);entry.tetherPositions.set([p.x,p.y,p.z],i*3);}entry.tether.geometry.attributes.position.needsUpdate=true;
      }
    });
    this.renderer.render(this.scene,camera);this.updateControls();
  }
}
