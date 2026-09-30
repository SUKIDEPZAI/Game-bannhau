import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.178.0/build/three.module.js";

// One-file game prototype. AI learns from observed player behavior and evolves a compact strategy policy.
const $=id=>document.getElementById(id), scene=new THREE.Scene();
scene.background=new THREE.Color(0x87977c);scene.fog=new THREE.Fog(0x87977c,38,100);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,130);camera.position.set(0,1.65,12);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;$("game").appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xdceaff,0x34402d,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(15,35,8);sun.castShadow=true;scene.add(sun);
const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.9}), obstacles=[], bots=[], drops=[];
const box=(x,y,z,sx,sy,sz,c)=>{let m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(c));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m};
const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),mat(0x53694b));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
box(0,.02,0,7,.03,100,0x8a7655);box(0,.02,0,100,.03,6,0x8a7655);
function cover(x,z,w,d,h=2.5,c=0x555b4e){box(x,h/2,z,w,h,d,c);obstacles.push({x,z,r:Math.max(w,d)*.55})}
cover(-14,-12,8,3);cover(13,-8,5,8,3);cover(-17,11,4,10);cover(16,15,9,3);cover(0,-20,14,3);cover(0,21,12,4);cover(-28,0,3,16);cover(28,0,3,16);
for(let i=0;i<50;i++){let x=(Math.random()-.5)*90,z=(Math.random()-.5)*90;if(Math.abs(x)<7||Math.abs(z)<7)continue;let h=2+Math.random()*3;let t=new THREE.Mesh(new THREE.CylinderGeometry(.3,.65,h,7),mat(0x3c5938));t.position.set(x,h/2,z);t.castShadow=true;scene.add(t)}
const STORE="battlefield_adaptive_policy_v2";
const fresh=()=>({games:0,policy:{push:.5,flank:.5,hold:.5,seekCover:.5,retreat:.5},stats:{},lastInsight:"Chưa có dữ liệu — bot đang ở trạng thái cân bằng."});
let memory;try{memory={...fresh(),...JSON.parse(localStorage.getItem(STORE)||"{}")};memory.policy={...fresh().policy,...memory.policy};memory.stats=memory.stats||{}}catch{memory=fresh()}
let gameNo=memory.games+1,hp=100,ammo=30,reserve=120,kills=0,ended=false,yaw=0,pitch=0;const keys={};
const player={get x(){return camera.position.x},get z(){return camera.position.z}};
const events=[],recent=[];
function log(type,weight=1,x=player.x,z=player.z,extra={}){events.push({type,weight,x,z,...extra})}
function clamp(x){return Math.max(0,Math.min(1,x))}
function persist(){localStorage.setItem(STORE,JSON.stringify(memory))}
function randomPolicy(){return memory.policy}
function observeMovement(){let cell=`${Math.round(player.x/8)},${Math.round(player.z/8)}`;log("route",1,player.x,player.z,{cell})}
function lineVisible(b){let dx=player.x-b.x,dz=player.z-b.z,d=Math.hypot(dx,dz);if(d>b.vision)return false;let a=Math.atan2(dz,dx),diff=Math.atan2(Math.sin(a-b.heading),Math.cos(a-b.heading));if(Math.abs(diff)>b.fov/2)return false;for(let o of obstacles){let vx=dx,vz=dz,wx=o.x-b.x,wz=o.z-b.z,t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/(vx*vx+vz*vz||1)));if(Math.hypot(b.x+vx*t-o.x,b.z+vz*t-o.z)<o.r+.3)return false}return true}
class Bot{
 constructor(i){this.id=i;this.hp=100;this.vision=34;this.fov=Math.PI*1.25;this.heading=Math.random()*6.28;this.x=(Math.random()-.5)*58;this.z=(Math.random()-.5)*58;this.mesh=box(this.x,.85,this.z,.8,1.7,.8,0x333b43);this.cool=0;this.mode="roam";this.goal=null;this.think=0;this.lastSeen=null}
 move(dx,dz){let x=this.x+dx,z=this.z+dz;if(Math.abs(x)>47||Math.abs(z)>47)return;for(let o of obstacles)if(Math.hypot(x-o.x,z-o.z)<o.r+.5)return;this.x=x;this.z=z;this.mesh.position.set(x,.85,z)}
 shoot(){if(this.cool>0)return;this.cool=.9+Math.random()*.7;let dist=Math.hypot(player.x-this.x,player.z-this.z);let p=.22+.28*memory.policy.push; // aim quality grows gradually with learned combat feedback
 p+=Math.min(.18,(memory.stats.combatSkill||0)*.03);if(dist<27&&Math.random()<p)hurt(4+Math.random()*7);log("bot_fire",1,this.x,this.z)}
 update(dt){this.cool=Math.max(0,this.cool-dt);let seen=lineVisible(this);if(seen)this.lastSeen={x:player.x,z:player.z};if(this.think<=0){this.think=.7+Math.random()*1.1;this.choose(seen)}this.think-=dt;
 const p=this.lastSeen;if(!p)return;let dx=p.x-this.x,dz=p.z-this.z,d=Math.hypot(dx,dz)||1,nx=dx/d,nz=dz/d,pol=memory.policy;
 if(this.mode==="push"){this.heading=Math.atan2(dz,dx);if(d>8)this.move(nx*dt*(2.3+pol.push*2),nz*dt*(2.3+pol.push*2));if(seen&&d<26)this.shoot()}
 else if(this.mode==="flank"){let side=this.flankSide||1;let sx=-nz*side,sz=nx*side;this.heading=Math.atan2(dz,dx);this.move((nx*.25+sx)*dt*3,(nz*.25+sz)*dt*3);if(seen&&d<24)this.shoot()}
 else if(this.mode==="retreat"){this.move(-nx*dt*3,-nz*dt*3);if(seen&&d>14)this.shoot()}
 else if(this.mode==="hold"){if(seen&&d<26)this.shoot();this.heading=Math.atan2(dz,dx)}
 else if(this.mode==="cover"){let best=null,score=-1;for(let o of obstacles){let dd=Math.hypot(o.x-this.x,o.z-this.z);let toward=Math.hypot(o.x-p.x,o.z-p.z);let sc=(toward<d?2:0)-dd*.03;if(sc>score){score=sc;best=o}}if(best){let ox=best.x-this.x,oz=best.z-this.z,od=Math.hypot(ox,oz)||1;this.move(ox/od*dt*2,oz/od*dt*2)}if(seen&&d<22)this.shoot()}
 else {this.move(Math.sin(performance.now()/900+this.id)*dt,Math.cos(performance.now()/1100+this.id)*dt)}
 }
 choose(seen){let pol=memory.policy,d=Math.hypot(player.x-this.x,player.z-this.z);let choices=[];
 if(seen){choices.push(["push",pol.push+(d<12?.2:0)],["flank",pol.flank+(d>15?.2:0)],["cover",pol.seekCover+.05],["hold",pol.hold]);if(this.hp<40)choices.push(["retreat",pol.retreat+.45])}
 else choices.push(["roam",.5],["flank",pol.flank*.55],["cover",pol.seekCover*.4]);
 // Softmax-like stochastic selection keeps behavior varied while favoring learned options.
 let max=Math.max(...choices.map(c=>c[1])),weights=choices.map(c=>Math.exp((c[1]-max)*2)),sum=weights.reduce((a,b)=>a+b,0),r=Math.random()*sum;
 for(let i=0;i<choices.length;i++){r-=weights[i];if(r<=0){this.mode=choices[i][0];break}}
 this.flankSide=Math.random()<.5?-1:1;
 }
 die(){scene.remove(this.mesh);if(Math.random()<.85)drop(this.x,this.z,["rifle","smg","shotgun","sniper"][Math.floor(Math.random()*4)])}
}
for(let i=0;i<10;i++)bots.push(new Bot(i));
function drop(x,z,type){let colors={medkit:0x38d16a,food:0xd6a13b,ammo:0xe2dfd2,rifle:0x5084a8,smg:0x98704b,shotgun:0x805c4a,sniper:0x9ba4aa,diamond:0x55e9ff};let m=new THREE.Mesh(new THREE.BoxGeometry(.48,.48,.48),mat(colors[type]));m.position.set(x,.35,z);m.userData.type=type;scene.add(m);drops.push(m)}
function seedLoot(){for(let i=0;i<20;i++){let x=(Math.random()-.5)*78,z=(Math.random()-.5)*78;drop(x,z,Math.random()<.28?"medkit":Math.random()<.5?"food":Math.random()<.7?"ammo":"rifle")}if(Math.random()<.001)drop((Math.random()-.5)*70,(Math.random()-.5)*70,"diamond")}seedLoot();
function hurt(n){hp=Math.max(0,hp-n);if(hp<=0)finish(false)}
function shoot(){if(ended)return;if(ammo<=0){reload();return}ammo--;log("player_shot");let dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(pitch,yaw,0,"YXZ")),ray=new THREE.Raycaster(camera.position,dir,0,55),hit=ray.intersectObjects(bots.map(b=>b.mesh))[0];if(hit){let b=bots.find(x=>x.mesh===hit.object);if(b){log("player_hit",1,b.x,b.z);b.hp-=34;if(b.hp<=0){log("player_kill",1,b.x,b.z);kills++;b.die();bots.splice(bots.indexOf(b),1);if(!bots.length)finish(true)}}}}
function reload(){let n=Math.min(30-ammo,reserve);ammo+=n;reserve-=n}
function heal(){if(hp<100){hp=Math.min(100,hp+30);log("heal_pickup")}}
function lootCheck(){for(let i=drops.length-1;i>=0;i--){let d=drops[i];if(Math.hypot(d.position.x-player.x,d.position.z-player.z)<2){let t=d.userData.type;log("loot_pickup",1,d.position.x,d.position.z,{item:t});if(t==="medkit")heal();if(t==="food")hp=Math.min(100,hp+10);if(t==="ammo")reserve+=45;if(t==="diamond")notify("💎 KIM CƯƠNG CHÂU PHI!");if(["rifle","smg","shotgun","sniper"].includes(t))notify("Nhặt súng "+t.toUpperCase());scene.remove(d);drops.splice(i,1)}}}
function notify(s){$("msg").textContent=s;setTimeout(()=>{if($("msg").textContent===s)$("msg").textContent=""},2200)}
function learn(){
 // Analyze aggregated behavior, not predefined action->counter rules.
 const counts={},routes={};for(const e of events){counts[e.type]=(counts[e.type]||0)+e.weight;if(e.cell)routes[e.cell]=(routes[e.cell]||0)+1}
 const shots=counts.player_shot||0,hits=counts.player_hit||0,k=counts.player_kill||0,routeVals=Object.values(routes),routeVariety=Object.keys(routes).length;
 const movement=counts.route||0,loot=counts.loot_pickup||0,heals=counts.heal_pickup||0;
 const combatRate=shots/Math.max(1,movement),accuracy=hits/Math.max(1,shots),killRate=k/Math.max(1,shots);
 const crowded=routeVals.length?Math.max(...routeVals)/Math.max(1,movement):0;
 // Derive latent play-style estimates from match statistics; update policy via bounded gradient-like adaptation.
 const target={push:clamp(.35+combatRate*.22+killRate*.45),flank:clamp(.35+routeVariety/24+(1-crowded)*.18),hold:clamp(.65-routeVariety/30),seekCover:clamp(.35+accuracy*.35+(heals>0?.08:0)),retreat:clamp(.35+(hp<65?.25:0)+(heals>0?.1:0))};
 const rate=.18,old={...memory.policy};for(const key of Object.keys(target))memory.policy[key]=clamp(old[key]+(target[key]-old[key])*rate);
 memory.games++;memory.stats={accuracy:+accuracy.toFixed(3),combatRate:+combatRate.toFixed(3),killRate:+killRate.toFixed(3),routeVariety,loot,combatSkill:Math.min(5,(memory.stats.combatSkill||0)*.85+accuracy*.3+k*.08)};
 memory.lastInsight=`Match ${memory.games}: push ${Math.round(target.push*100)}%, flank ${Math.round(target.flank*100)}%, hold ${Math.round(target.hold*100)}%.`;
 persist();
}
function finish(win){if(ended)return;ended=true;learn();notify(win?"CHIẾN THẮNG · BOT ĐÃ TIẾN HÓA":"BỊ HẠ · BOT ĐÃ PHÂN TÍCH TRẬN");}
addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="KeyR")reload();if(e.code==="KeyH")heal();if(e.code==="KeyN")location.reload()});addEventListener("keyup",e=>keys[e.code]=false);
let drag=false,lx=0,ly=0;renderer.domElement.addEventListener("pointerdown",e=>{drag=true;lx=e.clientX;ly=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener("pointerup",()=>drag=false);renderer.domElement.addEventListener("pointermove",e=>{if(!drag)return;yaw-=(e.clientX-lx)*.003;pitch-=(e.clientY-ly)*.003;pitch=Math.max(-1.4,Math.min(1.4,pitch));lx=e.clientX;ly=e.clientY});renderer.domElement.addEventListener("click",e=>{if(e.pointerType==="mouse")shoot()});
$("fire").onclick=shoot;$("reload").onclick=reload;$("heal").onclick=heal;
const clock=new THREE.Clock();function frame(){requestAnimationFrame(frame);let dt=Math.min(clock.getDelta(),.05);if(!ended){let f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0),speed=keys.ShiftLeft?7:4;if(f||s){let n=Math.hypot(f,s);f/=n;s/=n;let fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);camera.position.x+=(fx*f+rx*s)*speed*dt;camera.position.z+=(fz*f+rz*s)*speed*dt;camera.position.x=THREE.MathUtils.clamp(camera.position.x,-47,47);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-47,47);log("route",1,player.x,player.z,{cell:`${Math.round(player.x/8)},${Math.round(player.z/8)}`})}camera.rotation.set(pitch,yaw,0,"YXZ");lootCheck();for(let b of bots)b.update(dt)}
$("hp").textContent="HP "+Math.round(hp);$("ammo").textContent=ammo+" / "+reserve;$("kills").textContent="KILLS "+kills;$("match").textContent="MATCH "+gameNo;let p=memory.policy;$("stats").innerHTML=`Trận đã phân tích: ${memory.games}<br>Push: ${Math.round(p.push*100)}% · Flank: ${Math.round(p.flank*100)}%<br>Hold: ${Math.round(p.hold*100)}% · Cover: ${Math.round(p.seekCover*100)}%<br>Retreat: ${Math.round(p.retreat*100)}%<br><small>${memory.lastInsight||""}</small>`;renderer.render(scene,camera)}frame();
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
