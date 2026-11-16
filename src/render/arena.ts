import { t } from '../i18n';
import * as THREE from 'three';
import type { BattleSnapshot, FrameId, Program, Settings } from '../game/types';
import { sensorOverlay } from './sensors';

const colors = ['#5ddbe6', '#ff8574'];
function texture(width: number, height: number, paint: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d')!);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}
function robotTexture(frame: FrameId, color: string): THREE.CanvasTexture {
  return texture(192, 192, c => {
    c.translate(96, 96); c.strokeStyle = color; c.lineWidth = 2; c.globalAlpha = .42;
    c.beginPath(); c.arc(0, 0, 68, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = .9; c.beginPath(); c.arc(0, 0, 76, -.35, .35); c.stroke();
    c.fillStyle = color; c.beginPath(); c.moveTo(86, 0); c.lineTo(76, -5); c.lineTo(76, 5); c.fill(); c.globalAlpha = 1;
    for (const side of [-1, 1]) {
      c.fillStyle = '#080f18'; c.strokeStyle = '#536270'; c.lineWidth = 2;
      c.fillRect(-30, side * 43 - 12, 69, 24); c.strokeRect(-30, side * 43 - 12, 69, 24);
      c.fillStyle = '#334453'; c.fillRect(-23, side * 43 - 7, 45, 14);
      c.fillStyle = color; c.fillRect(33, side * 43 - 7, 9, 14);
      c.fillStyle = '#101820'; c.fillRect(-35, side * 24 - 7, 32, 14);
      for (let x = -21; x < 12; x += 9) { c.fillStyle = '#758797'; c.fillRect(x, side * 43 - 5, 3, 10); }
    }
    c.beginPath();
    if (frame === 'scout') { c.moveTo(53, 0); c.lineTo(15, -31); c.lineTo(-36, -24); c.lineTo(-48, 0); c.lineTo(-36, 24); c.lineTo(15, 31); }
    else if (frame === 'fortress') { c.moveTo(46, -29); c.lineTo(28, -41); c.lineTo(-37, -41); c.lineTo(-49, -25); c.lineTo(-49, 25); c.lineTo(-37, 41); c.lineTo(28, 41); c.lineTo(46, 29); }
    else { c.moveTo(45, -19); c.lineTo(26, -34); c.lineTo(-35, -30); c.lineTo(-45, -16); c.lineTo(-45, 16); c.lineTo(-35, 30); c.lineTo(26, 34); c.lineTo(45, 19); }
    c.closePath(); c.fillStyle = '#283a49'; c.fill(); c.strokeStyle = '#91a8b7'; c.lineWidth = 2.5; c.stroke();
    c.fillStyle = '#405567'; c.beginPath(); c.moveTo(-33, -22); c.lineTo(17, -26); c.lineTo(33, -12); c.lineTo(-25, -10); c.closePath(); c.fill();
    c.strokeStyle = '#14212e'; c.beginPath(); c.moveTo(-34, 16); c.lineTo(30, 16); c.moveTo(-28, -9); c.lineTo(-28, 25); c.stroke();
    c.fillStyle = '#0a1520'; c.fillRect(-17, -14, 35, 28); c.strokeStyle = color; c.strokeRect(-17, -14, 35, 28);
    c.shadowColor = color; c.shadowBlur = 16; c.fillStyle = color; c.fillRect(-9, -7, 20, 14); c.shadowBlur = 0;
    c.fillStyle = '#e2ffff'; c.fillRect(4, -4, 7, 8);
    c.fillStyle = color; c.fillRect(-36, -24, 3, 8); c.fillRect(-36, 16, 3, 8);
    for (const [x,y] of [[-30,-20],[-30,20],[27,-16],[27,16]]) { c.fillStyle = '#b6c5cd'; c.fillRect(x,y,3,3); }
  });
}

/** Orthographic flat view adapter. Simulation state remains entirely in the engine. */
export class ArenaView {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 960, 640, 0, -10, 10);
  private dynamics = new THREE.Group();
  private bodies: THREE.Sprite[] = [];
  private keys: string[] = [];
  private paths: { x: number; y: number }[][] = [[], []];
  private textures: THREE.Texture[] = [];
  private lastTick = -1;
  private lastDrawSnapshot: BattleSnapshot | null = null;
  private lastDrawFlags = "";
  private resizeObserver: ResizeObserver;
  private fallback: HTMLDivElement;
  private lost = false;
  constructor(private host: HTMLElement, initial: BattleSnapshot) {
    this.fallback = document.createElement('div'); this.fallback.className = 'webgl-fallback'; this.fallback.hidden = true; host.append(this.fallback);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setClearColor('#09131e');
      this.renderer.domElement.setAttribute('aria-label', t("2D自律ロボット対戦アリーナ")); this.renderer.domElement.setAttribute('role', 'img');
      host.prepend(this.renderer.domElement);
      this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
      this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestored);
      this.buildFloor(initial); this.scene.add(this.dynamics); this.camera.position.z = 5; this.resize();
    } catch { this.showFallback(t("WebGLを開始できませんでした。ハードウェアアクセラレーションを有効にして再読み込みしてください。AI編集と機体の保存は利用できます。")); }
  }
  refreshLanguage():void {
    this.renderer?.domElement.setAttribute('aria-label',t('2D自律ロボット対戦アリーナ'));
    if(!this.fallback.hidden)this.showFallback(this.lost?t('描画コンテキストが中断しました。復旧を待っています。'):t('WebGLを開始できませんでした。ハードウェアアクセラレーションを有効にして再読み込みしてください。AI編集と機体の保存は利用できます。'));
  }
  private contextLost = (event: Event): void => { event.preventDefault(); this.lost = true; this.showFallback(t("描画コンテキストが中断しました。復旧を待っています。")); };
  private contextRestored = (): void => { this.lost = false; this.lastDrawSnapshot = null; this.fallback.hidden = true; };
  private showFallback(message: string): void { this.fallback.hidden = false; this.fallback.textContent = message; }
  private buildFloor(snapshot: BattleSnapshot): void {
    const map = texture(1440, 960, c => {
      c.scale(1.5, 1.5); c.fillStyle = '#0a1420'; c.fillRect(0, 0, 960, 640);
      const gradient = c.createRadialGradient(480, 320, 20, 480, 320, 560);
      gradient.addColorStop(0, '#122331'); gradient.addColorStop(1, '#09121c'); c.fillStyle = gradient; c.fillRect(0,0,960,640);
      for (let x = 0; x <= 960; x += 32) { c.strokeStyle = x % 128 ? '#172632' : '#21333f'; c.lineWidth = .7; c.beginPath(); c.moveTo(x,0); c.lineTo(x,640); c.stroke(); }
      for (let y = 0; y <= 640; y += 32) { c.strokeStyle = y % 128 ? '#172632' : '#21333f'; c.lineWidth = .7; c.beginPath(); c.moveTo(0,y); c.lineTo(960,y); c.stroke(); }
      c.strokeStyle = '#46616e'; c.lineWidth = 2; c.strokeRect(18,18,924,604);
      c.setLineDash([5, 9]); c.strokeStyle = '#2b424f'; c.strokeRect(34,34,892,572); c.setLineDash([]);
      c.strokeStyle = '#29434e'; c.beginPath(); c.arc(480,320,97,0,Math.PI*2); c.stroke();
      c.beginPath(); c.moveTo(468,320); c.lineTo(492,320); c.moveTo(480,308); c.lineTo(480,332); c.stroke();
      c.font = '10px monospace'; c.fillStyle = '#57717f';
      for (let x = 128; x < 900; x += 128) c.fillText(String(x).padStart(3,'0'),x,14);
      for (let y = 128; y < 600; y += 128) { c.save(); c.translate(14,y); c.rotate(-Math.PI/2); c.fillText(String(y).padStart(3,'0'),0,0); c.restore(); }
      c.font = 'bold 12px monospace'; c.fillStyle = '#385766'; c.fillText('PROTOSTAR / TEST FIELD 01',53,590);
      c.font = '10px monospace'; c.fillText('960 × 640   //   STATIC COVER',53,606);
      for (const obstacle of snapshot.arena.obstacles) {
        const { x,y,radius:r } = obstacle; c.save(); c.translate(x,y); c.shadowColor = '#000'; c.shadowBlur = 12; c.shadowOffsetY = 5;
        c.fillStyle = '#283845'; c.strokeStyle = '#627683'; c.lineWidth = 2;
        c.beginPath(); for(let i=0;i<8;i++){const a=(i+.5)*Math.PI/4,px=Math.cos(a)*r,py=Math.sin(a)*r; i?c.lineTo(px,py):c.moveTo(px,py);} c.closePath(); c.fill(); c.stroke(); c.shadowBlur = 0; c.shadowOffsetY=0;
        c.strokeStyle = '#3f5563'; c.lineWidth=1; c.strokeRect(-r*.55,-r*.55,r*1.1,r*1.1);
        c.fillStyle='#152632'; for(let i=-1;i<2;i++) c.fillRect(-r*.45,i*8-2,r*.9,3);
        c.fillStyle='#a5a278'; c.fillRect(-r*.53,-r*.52,7,3); c.fillRect(r*.32,r*.42,7,3); c.restore();
      }
      for(const [x,color] of [[180,'#3b7781'],[780,'#80594f']] as const) { c.strokeStyle=color; c.globalAlpha=.45; c.beginPath(); c.arc(x,320,48,0,Math.PI*2); c.stroke(); c.globalAlpha=1; }
    });
    this.textures.push(map);
    const floor = new THREE.Sprite(new THREE.SpriteMaterial({ map })); floor.position.set(480,320,-3); floor.scale.set(960,640,1); this.scene.add(floor);
  }
  private resize(): void { this.lastDrawSnapshot = null; if (!this.renderer) return; const width = this.host.clientWidth, height = this.host.clientHeight; if (width && height) { const fitWidth = Math.min(width, height * 1.5); this.renderer.setSize(fitWidth, fitWidth / 1.5, true); } }
  reset(): void { this.paths = [[],[]]; this.lastTick = -1; this.lastDrawSnapshot = null; }
  draw(snapshot: BattleSnapshot, settings: Settings, programs: [Program, Program]): void {
    if (!this.renderer || this.lost) return;
    const flags = `${settings.showSensors}-${settings.showTrails}`;
    if (this.lastDrawSnapshot === snapshot && this.lastDrawFlags === flags) return;
    this.lastDrawSnapshot = snapshot; this.lastDrawFlags = flags;
    for (const child of [...this.dynamics.children]) { this.dynamics.remove(child); const item=child as THREE.Mesh; item.geometry?.dispose(); if(item.material) (Array.isArray(item.material)?item.material:[item.material]).forEach(m=>m.dispose()); }
    for (const robot of snapshot.robots) {
      const i = robot.slot, key = `${robot.frame}-${i}`;
      if (this.keys[i] !== key) {
        if(this.bodies[i]) { this.scene.remove(this.bodies[i]); this.bodies[i].material.map?.dispose(); this.bodies[i].material.dispose(); }
        const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: robotTexture(robot.frame,colors[i]), transparent: true }));
        body.scale.set(108,108,1); this.bodies[i] = body; this.scene.add(body); this.keys[i]=key;
      }
      const body=this.bodies[i]; body.position.set(robot.x,640-robot.y,1); body.material.rotation=-robot.angle; body.material.opacity=robot.hp>0?1:.25;
      if (snapshot.tick !== this.lastTick) { this.paths[i].push({x:robot.x,y:robot.y}); if(this.paths[i].length>72) this.paths[i].shift(); }
      if (settings.showTrails && this.paths[i].length>1) this.line(this.paths[i].map(p=>new THREE.Vector3(p.x,640-p.y,-.4)),colors[i],.3);
      const sensor = settings.showSensors ? sensorOverlay(robot, programs[i]) : null;
      if (sensor?.kind === 'ObstacleAhead') {
        // The engine intersects this 88px centerline with expanded obstacle/enemy circles.
        this.line([new THREE.Vector3(robot.x,640-robot.y,-1),new THREE.Vector3(robot.x+Math.cos(robot.angle)*88,640-robot.y-Math.sin(robot.angle)*88,-1)],colors[i],.9);
        const enemy = snapshot.robots[1-i];
        for (const obstacle of [...snapshot.arena.obstacles, enemy]) {
          const radius=obstacle.radius+robot.radius+3;
          this.line(Array.from({length:65},(_,j)=>new THREE.Vector3(obstacle.x+Math.cos(j*Math.PI/32)*radius,640-obstacle.y+Math.sin(j*Math.PI/32)*radius,-1)),colors[i],.3);
        }
        const r=robot.radius,w=snapshot.arena.width,h=snapshot.arena.height;
        this.line([[r,r],[w-r,r],[w-r,h-r],[r,h-r],[r,r]].map(([x,y])=>new THREE.Vector3(x,h-y,-1)),colors[i],.3);
      } else if (sensor) {
        const shape = new THREE.Shape(); shape.moveTo(0,0);
        for(let j=0;j<=64;j++){const a=-(robot.angle+sensor.from+(sensor.to-sensor.from)*j/64); shape.lineTo(Math.cos(a)*sensor.range,Math.sin(a)*sensor.range);} shape.lineTo(0,0);
        const wedge = new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:colors[i],transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false})); wedge.position.set(robot.x,640-robot.y,-1); this.dynamics.add(wedge);
      }
    }
    for(const p of snapshot.projectiles) {
      const color=p.weapon==='rail'?'#e8dca4':p.weapon==='scatter'?'#c5b0ff':colors[p.owner], length=p.weapon==='rail'?.026:.014;
      this.line([new THREE.Vector3(p.x-p.vx*length,640-p.y+p.vy*length,.3),new THREE.Vector3(p.x,640-p.y,.3)],color,1); this.dot(p.x,p.y,p.radius+1,color,.9);
    }
    for(const event of snapshot.events) {
      if(event.type!=='hit' && event.type!=='impact') continue;
      const age=(snapshot.tick-event.tick)/60; if(age>.28) continue;
      for(let j=0;j<6;j++){const a=j*Math.PI/3+event.id*.7,r=4+age*65; this.line([new THREE.Vector3(event.x+Math.cos(a)*r*.5,640-event.y+Math.sin(a)*r*.5,2),new THREE.Vector3(event.x+Math.cos(a)*r,640-event.y+Math.sin(a)*r,2)],event.type==='hit'?'#ffe5ab':'#9caebb',1-age/.28);}
    }
    if(snapshot.result?.reason==='destroyed') for(const robot of snapshot.robots) if(robot.hp<=0) this.dot(robot.x,robot.y,23,'#ff916b',.16);
    this.lastTick=snapshot.tick; this.renderer.render(this.scene,this.camera);
  }
  private line(points: THREE.Vector3[],color:string,opacity:number):void { this.dynamics.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}))); }
  private dot(x:number,y:number,radius:number,color:string,opacity:number):void { const dot=new THREE.Mesh(new THREE.CircleGeometry(radius,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false})); dot.position.set(x,640-y,1); this.dynamics.add(dot); }
  dispose():void {
    this.resizeObserver.disconnect(); this.renderer?.domElement.removeEventListener('webglcontextlost',this.contextLost); this.renderer?.domElement.removeEventListener('webglcontextrestored',this.contextRestored);
    this.scene.traverse(object=>{const mesh=object as THREE.Mesh;mesh.geometry?.dispose();if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>m.dispose());});
    this.bodies.forEach(body=>body.material.map?.dispose()); this.textures.forEach(map=>map.dispose()); this.renderer?.dispose();
  }
}
