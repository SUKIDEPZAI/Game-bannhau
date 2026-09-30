import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.178.0/build/three.module.js";

const $=id=>document.getElementById(id), scene=new THREE.Scene();
scene.background=new THREE.Color(0x7d9178);scene.fog=new THREE.Fog(0x7d9178,42,110);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.04,140);camera.position.set(0,1.65,13);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$("game").appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xdde9ff,0x263323,2.1));
const sun=new THREE.DirectionalLight(0xfff2d0,2.2);sun.position.set(-20,40,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);

const obstacles=[],bots=[],drops=[],particles=[],keys={};let hp=100,ammo=30,reserve=120,kills=0,ended=false,yaw=0,pitch=0;
const player={get x(){return camera.position.x},get z(){return camera.position.z}};
const memoryKey="adaptive_battlefield_policy_v3";
const base={games:0,policy:{push:.5,flank:.5,hold:.5,cover:.5,retreat:.5},stats:{},insight:"AI đang quan sát trận đầu."};
let memory;try{memory={...base,...JSON.parse(localStorage.getItem(memoryKey)||"{}")};memory.policy={...base.policy,...memory.policy};memory.stats=memory.stats||{}}catch{memory=structuredClone(base)}
const match=memory.games+1,events=[];

function material(c,rough=.9,metal=0){return new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:metal})}
function box(x,y,z,w,h,d,c,rough=.9){let m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(c,rough));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m}
const ground=new THREE.Mesh(new THREE.PlaneGeometry(110,110),material(0x53684a));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
function road(x,z,w,d,rot=0){let m=box(x,.018,z,w,.035,d,0x8a7658);m.rotation.y=rot}
road(0,0,100,6);road(0,0,6,100);
function cover(x,z,w,d,h=2.6,c=0x535b51){box(x,h/2,z,w,h,d,c);obstacles.push({x,z,r:Math.max(w,d)*.55})}
cover(-15,-13,9,3);cover(13,-9,5,9,3);cover(-17,12,4,11);cover(17,15,10,3);cover(0,-21,15,3);cover(0,22,13,4,3);cover(-29,0,3,17,3);cover(29,0,3,17,3);
function ruin(x,z){let h=2+Math.random()*2.5;box(x,h/2,z,1.5+Math.random()*2,h,.8+Math.random()*2,0x4c4c43);box(x+2,h*.35,z+.8,.8,h*.7,1.2,0x45483f)}
for(let i=0;i<22;i++){let x=(Math.random()-.5)*90,z=(Math.random()-.5)*90;if(Math.abs(x)<8||Math.abs(z)<8)continue;ruin(x,z)}
function tree(x,z){let h=3+Math.random()*2;let t=box(x,h/2,z,.45,h,.45,0x4b3828);let c=new THREE.Mesh(new THREE.ConeGeometry(1.5,3,7),material(0x36533a));c.position.set(x,h+1,z);c.castShadow=true;scene.add(c)}
for(let i=0;i<55;i++){let x=(Math.random()-.5)*96,z=(Math.random()-.5)*96;if(Math.abs(x)<8||Math.abs(z)<8)continue;tree(x,z)}
// Smoke columns give the battlefield a more alive silhouette.
for(let i=0;i<9;i++){let x=(Math.random()-.5)*75,z=(Math.random()-.5)*75;let s=new THREE.Mesh(new THREE.SphereGeometry(1.5,10,8),new THREE.MeshBasicMaterial({color:0x4d514b,transparent:true,opacity:.18}));s.position.set(x,3,z);scene.add(s)}

function log(type,data={}){events.push({type,...data,x:player.x,z:player.z,t:performance.now()})}
function clamp(v){return Math.max(0,Math.min(1,v))}
function save(){localStorage.setItem(memoryKey,JSON.stringify(memory))}
function visible(b){let dx=player.x-b.x,dz=player.z-b.z,d=Math.hypot(dx,dz);if(d>b.range)return false;let a=Math.atan2(dz,dx),df=Math.atan2(Math.sin(a-b.heading),Math.cos(a-b.heading));if(Math.abs(df)>b.fov/2)return false;for(let o of obstacles){let vx=dx,vz=dz,t=Math.max(0,Math.min(1,((o.x-b.x)*vx+(o.z-b.z)*vz)/(vx*vx+vz*vz||1)));if(Math.hypot(b.x+vx*t-o.x,b.z+vz*t-o.z)<o.r+.25)return false}return true}
class Bot{
 constructor(i){this.id=i;this.x=(Math.random()-.5)*60;this.z=(Math.random()-.5)*60;this.hp=100;this.heading=Math.random()*6.28;this.range=35;this.fov=Math.PI*1.25;this.cool=0;this.think=0;this.mode="roam";this.mesh=box(this.x,.9,this.z,.72,1.8,.72,0x252b30,.65);this.mesh.add(box(0,.55,0,.38,.9,.3,0x303940,.65))}
 move(dx,dz){let x=this.x+dx,z=this.z+dz;if(Math.abs(x)>48||Math.abs(z)>48)return;for(let o of obstacles)if(Math.hypot(x-o.x,z-o.z)<o.r+.5)return;this.x=x;this.z=z;this.mesh.position.set(x,.9,z)}
 thinkNow(){let p=memory.policy,d=Math.hypot(player.x-this.x,player.z-this.z),seen=visible(this),a=[];if(seen){a.push(["push",p.push+(d<12?.22:0)],["flank",p.flank+(d>15?.22:0)],["cover",p.cover+.04],["hold",p.hold]);if(this.hp<35)a.push(["retreat",p.retreat+.5])}else a=[["roam",.5],["flank",p.flank*.7],["cover",p.cover*.45]];let max=Math.max(...a.map(x=>x[1])),ws=a.map(x=>Math.exp((x[1]-max)*2.2)),r=Math.random()*ws.reduce((a,b)=>a+b,0);for(let i=0;i<a.length;i++){r-=ws[i];if(r<=0){this.mode=a[i][0];break}}this.side=Math.random()<.5?-1:1}
shoot(){if(this.cool>0)return;this.cool=.75+Math.random()*.7;let d=Math.hypot(player.x-this.x,player.z-this.z),chance=.18+.32*memory.policy.push+.04*(memory.stats.combatSkill||0);if(d<27&&Math.random()<chance)hurt(5+Math.random()*6);log("bot_shot")}
update(dt){this.cool=Math.max(0,this.cool-dt);let seen=visible(this);if(seen)this.last={x:player.x,z:player.z};if(this.think<=0){this.think=.7+Math.random()*1.2;this.thinkNow()}this.think-=dt;if(!this.last)return;let dx=this.last.x-this.x,dz=this.last.z-this.z,d=Math.hypot(dx,dz)||1,nx=dx/d,nz=dz/d;
if(this.mode==="push"){this.heading=Math.atan2(dz,dx);if(d>8)this.move(nx*dt*(2.1+memory.policy.push*2),nz*dt*(2.1+memory.policy.push*2));if(seen&&d<26)this.shoot()}
else if(this.mode==="flank"){let sx=-nz*this.side,sz=nx*this.side;this.heading=Math.atan2(dz,dx);this.move((nx*.2+sx)*dt*3,(nz*.2+sz)*dt*3);if(seen&&d<25)this.shoot()}
else if(this.mode==="retreat"){this.move(-nx*dt*3,-nz*dt*3)}
else if(this.mode==="cover"){let best=obstacles.reduce((q,o)=>{let s=(Math.hypot(o.x-this.x,o.z-this.z)<18?1:0)-Math.hypot(o.x-this.x,o.z-this.z)*.03;return !q||s>q.s?{o,s}:q},null);if(best){let ox=best.o.x-this.x,oz=best.o.z-this.z,od=Math.hypot(ox,oz)||1;this.move(ox/od*dt*2,oz/od*dt*2)}if(seen&&d<23)this.shoot()}
else if(this.mode==="hold"){this.heading=Math.atan2(dz,dx);if(seen&&d<27)this.shoot()}
else this.move(Math.sin(performance.now()/900+this.id)*dt,Math.cos(performance.now()/1000+this.id)*dt)}
die(){scene.remove(this.mesh);if(Math.random()<.85)drop(this.x,this.z,["rifle","smg","shotgun","sniper"][Math.floor(Math.random()*4)])}}
for(let i=0;i<11;i++)bots.push(new Bot(i));

function drop(x,z,type){let col={medkit:0x37d36c,food:0xd7a13d,ammo:0xd8d8d2,rifle:0x4c88ad,smg:0x8c6748,shotgun:0x7a5b4d,sniper:0x9ba2a5,diamond:0x55eaff}[type];let m=new THREE.Mesh(new THREE.BoxGeometry(.48,.48,.48),material(col,.6,.15));m.position.set(x,.4,z);m.userData.type=type;scene.add(m);drops.push(m);return m}
for(let i=0;i<22;i++)drop((Math.random()-.5)*80,(Math.random()-.5)*80,Math.random()<.3?"medkit":Math.random()<.5?"food":Math.random()<.72?"ammo":"rifle");
if(Math.random()<.001)drop((Math.random()-.5)*70,(Math.random()-.5)*70,"diamond");

function muzzle(){let p=new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),new THREE.MeshBasicMaterial({color:0xffd27a}));p.position.copy(camera.position);let d=new THREE.Vector3(0,0,-1).applyEuler(camera.rotation);p.position.add(d.multiplyScalar(.8));scene.add(p);particles.push({m:p,t:.07})}
function shoot(){if(ended)return;if(ammo<=0){reload();return}ammo--;log("shot");muzzle();let d=new THREE.Vector3(0,0,-1).applyEuler(camera.rotation),ray=new THREE.Raycaster(camera.position,d,0,60),hit=ray.intersectObjects(bots.map(b=>b.mesh),true)[0];if(hit){let b=bots.find(b=>b.mesh===hit.object||b.mesh===hit.object.parent);if(b){log("hit");b.hp-=34;if(b.hp<=0){log("kill");kills++;b.die();bots.splice(bots.indexOf(b),1);if(!bots.length)finish(true)}}}}
function reload(){let n=Math.min(30-ammo,reserve);ammo+=n;reserve-=n}
function hurt(n){hp=Math.max(0,hp-n);$("damage").classList.remove("hurt");void $("damage").offsetWidth;$("damage").classList.add("hurt");if(hp<=0)finish(false)}
function heal(){if(hp<100){hp=Math.min(100,hp+30);log("heal")}}
function loot(){for(let i=drops.length-1;i>=0;i--){let d=drops[i];if(Math.hypot(d.position.x-player.x,d.position.z-player.z)<2){let t=d.userData.type;log("loot",{item:t});if(t==="medkit")heal();if(t==="food")hp=Math.min(100,hp+10);if(t==="ammo")reserve+=45;if(t==="diamond")msg("💎 KIM CƯƠNG CHÂU PHI XUẤT HIỆN!");if(["rifle","smg","shotgun","sniper"].includes(t))msg("NHẶT SÚNG · "+t.toUpperCase());scene.remove(d);drops.splice(i,1)}}}
function msg(s){$("message").textContent=s;setTimeout(()=>{$("message").textContent=""},2200)}
function learn(){
 let c={};for(let e of events)c[e.type]=(c[e.type]||0)+1;
 let shots=c.shot||0,hits=c.hit||0,killsNow=c.kill||0,moves=c.route||0,accuracy=hits/Math.max(1,shots),aggression=clamp(.3+(shots/Math.max(1,moves))*1.8+killsNow*.08),variety=new Set(events.filter(e=>e.type==="route").map(e=>`${Math.round(e.x/8)},${Math.round(e.z/8)}`)).size;
 let target={push:aggression,flank:clamp(.32+variety/22),hold:clamp(.72-variety/30),cover:clamp(.35+accuracy*.5),retreat:clamp(.35+(hp<65?.3:0))};
 let rate=.2;for(let k in target)memory.policy[k]=clamp(memory.policy[k]+(target[k]-memory.policy[k])*rate);
 memory.games++;memory.stats={accuracy:+accuracy.toFixed(2),combatSkill:Math.min(5,(memory.stats.combatSkill||0)*.82+accuracy*.5+killsNow*.1),variety};memory.insight=`Phân tích trận ${memory.games}: AI đã tái tối ưu policy dựa trên dữ liệu thực tế.`;save()
}
function finish(win){if(ended)return;ended=true;learn();msg(win?"THẮNG · AI ĐÃ TỰ HỌC VÀ TỐI ƯU":"BỊ HẠ · AI ĐÃ PHÂN TÍCH TRẬN");}

addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="KeyR")reload();if(e.code==="KeyH")heal();if(e.code==="KeyN")location.reload()});addEventListener("keyup",e=>keys[e.code]=false);
let drag=false,lx=0,ly=0;renderer.domElement.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"){drag=true;lx=e.clientX;ly=e.clientY}});addEventListener("pointerup",()=>drag=false);addEventListener("pointermove",e=>{if(!drag)return;yaw-=(e.clientX-lx)*.003;pitch-=(e.clientY-ly)*.003;pitch=THREE.MathUtils.clamp(pitch,-1.4,1.4);lx=e.clientX;ly=e.clientY});renderer.domElement.addEventListener("click",e=>{if(e.pointerType==="mouse")shoot()});

// Mobile joystick + right-side look.
let joy=false,joyX=0,joyY=0;const stick=$("stick"),knob=$("knob");
stick.addEventListener("pointerdown",e=>{joy=true;stick.setPointerCapture(e.pointerId)});stick.addEventListener("pointermove",e=>{if(!joy)return;let r=stick.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),len=Math.min(43,Math.hypot(x,y)),a=Math.atan2(y,x);joyX=Math.cos(a)*(len/43);joyY=Math.sin(a)*(len/43);knob.style.transform=`translate(${joyX*35}px,${joyY*35}px)`});stick.addEventListener("pointerup",()=>{joy=false;joyX=joyY=0;knob.style.transform=""});
let look=false,px=0,py=0;$("lookZone").addEventListener("pointerdown",e=>{look=true;px=e.clientX;py=e.clientY});$("lookZone").addEventListener("pointermove",e=>{if(!look)return;yaw-=(e.clientX-px)*.004;pitch-=(e.clientY-py)*.003;pitch=THREE.MathUtils.clamp(pitch,-1.4,1.4);px=e.clientX;py=e.clientY});$("lookZone").addEventListener("pointerup",()=>look=false);
$("fire").onclick=shoot;$("reload").onclick=reload;$("heal").onclick=heal;let sprint=false;$("sprint").onpointerdown=()=>sprint=true;$("sprint").onpointerup=()=>sprint=false;

const map=$("map").getContext("2d");function drawMap(){map.clearRect(0,0,150,150);map.fillStyle="#1b271b";map.fillRect(0,0,150,150);map.strokeStyle="#66725e";map.strokeRect(5,5,140,140);map.fillStyle="#897552";map.fillRect(0,70,150,10);map.fillRect(70,0,10,150);let sx=x=>75+x*1.35,sz=z=>75+z*1.35;map.fillStyle="#5c6358";for(let o of obstacles)map.fillRect(sx(o.x)-5,sz(o.z)-5,10,10);map.fillStyle="#e9e9e9";map.beginPath();map.arc(sx(player.x),sz(player.z),4,0,7);map.fill();map.fillStyle="#e34d4d";for(let b of bots){map.beginPath();map.arc(sx(b.x),sz(b.z),2.5,0,7);map.fill()}}
const clock=new THREE.Clock();function frame(){requestAnimationFrame(frame);let dt=Math.min(clock.getDelta(),.05),f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0);if(joy){f=-joyY;s=joyX}if(!ended){if(f||s){let n=Math.hypot(f,s);f/=n;s/=n;let speed=(keys.ShiftLeft||sprint)?7:4,fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);camera.position.x+=(fx*f+rx*s)*speed*dt;camera.position.z+=(fz*f+rz*s)*speed*dt;camera.position.x=THREE.MathUtils.clamp(camera.position.x,-48,48);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-48,48);log("route")}camera.rotation.set(pitch,yaw,0,"YXZ");loot();for(let b of bots)b.update(dt)}
for(let i=particles.length-1;i>=0;i--){particles[i].t-=dt;if(particles[i].t<=0){scene.remove(particles[i].m);particles.splice(i,1)}}
$("hp").textContent=Math.round(hp);$("ammo").textContent=ammo+" / "+reserve;$("kills").textContent=kills;$("match").textContent=match;let p=memory.policy;$("stats").innerHTML=`Games ${memory.games}<br>Push ${Math.round(p.push*100)}% · Flank ${Math.round(p.flank*100)}%<br>Hold ${Math.round(p.hold*100)}% · Cover ${Math.round(p.cover*100)}%<br>Retreat ${Math.round(p.retreat*100)}%<br><span style="opacity:.65">${memory.insight}</span>`;drawMap();renderer.render(scene,camera)}frame();
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)})
