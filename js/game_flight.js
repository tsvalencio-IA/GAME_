// =============================================================================
// AERO STRIKE SIMULATOR: BRAZILIAN ARMED FORCES EDITION (V13 - LOCKED ARCHITECT)
// ENGINE: 100% PURE ECS, REAL AERODYNAMICS, TACTICAL MINIMAP, STATE MACHINE AI
// =============================================================================
(function() {
    "use strict";

    // =========================================================================
    // ENGINE
    // =========================================================================
    const Engine3D = {
        fov: 800,
        rotate: (x, y, z, pitch, yaw, roll) => {
            let cr=Math.cos(roll), sr=Math.sin(roll), cp=Math.cos(pitch), sp=Math.sin(pitch), cy=Math.cos(yaw), sy=Math.sin(yaw);
            let x1 = x*cr - y*sr, y1 = x*sr + y*cr;
            let y2 = y1*cp - z*sp, z2 = y1*sp + z*cp;
            return { x: x1*cy + z2*sy, y: y2, z: -x1*sy + z2*cy };
        },
        project: (ox, oy, oz, cx, cy, cz, p, y, r, w, h) => {
            let dx=ox-cx, dy=oy-cy, dz=oz-cz;
            let cyw=Math.cos(-y), syw=Math.sin(-y), cp=Math.cos(-p), sp=Math.sin(-p), cr=Math.cos(r), sr=Math.sin(r);
            let x1=dx*cyw - dz*syw, z1=dx*syw + dz*cyw;
            let y2=dy*cp - z1*sp, z2=dy*sp + z1*cp;
            if (z2 < 10) return { visible: false };
            let fx=x1*cr - y2*sr, fy=x1*sr + y2*cr, s=Engine3D.fov/z2;
            return { x: (w/2) + fx*s, y: (h/2) - fy*s, s: s, z: z2, visible: true };
        }
    };

    const MESHES = {
        jet: {
            v: [{x:0,y:0,z:40}, {x:0,y:15,z:-30}, {x:-35,y:0,z:-10}, {x:35,y:0,z:-10}, {x:0,y:-10,z:-20}, {x:0,y:10,z:10}],
            f: [[0,2,5,'#7f8c8d'], [0,5,3,'#95a5a6'], [0,4,2,'#34495e'], [0,3,4,'#2c3e50'], [5,2,1,'#bdc3c7'], [5,1,3,'#ecf0f1'], [4,1,2,'#2c3e50'], [4,3,1,'#34495e']]
        },
        tank: {
            v: [{x:-20,y:0,z:30}, {x:20,y:0,z:30}, {x:20,y:15,z:30}, {x:-20,y:15,z:30}, {x:-20,y:0,z:-30}, {x:20,y:0,z:-30}, {x:20,y:15,z:-30}, {x:-20,y:15,z:-30}, {x:-10,y:15,z:10}, {x:10,y:15,z:10}, {x:10,y:25,z:-10}, {x:-10,y:25,z:-10}, {x:-2,y:20,z:10}, {x:2,y:20,z:10}, {x:2,y:20,z:50}, {x:-2,y:20,z:50}],
            f: [[0,1,2,3,'#27ae60'], [1,5,6,2,'#2ecc71'], [5,4,7,6,'#1e8449'], [4,0,3,7,'#229954'], [3,2,6,7,'#52be80'], [8,9,10,11,'#117a65'], [12,13,14,15,'#111']]
        },
        boss: {
            v: [{x:0,y:0,z:120}, {x:-80,y:0,z:-40}, {x:80,y:0,z:-40}, {x:0,y:30,z:-20}, {x:0,y:-20,z:-40}, {x:-100,y:5,z:-60}, {x:100,y:5,z:-60}, {x:-40,y:10,z:-50}, {x:40,y:10,z:-50}],
            f: [[0,2,3,'#555'], [0,3,1,'#666'], [0,1,4,'#333'], [0,4,2,'#444'], [1,5,7,'#222'], [2,8,6,'#222'], [3,2,8,'#777'], [3,7,1,'#777']]
        }
    };

    const GameSfx = {
        ctx: null, engineSrc: null, ready: false,
        init: function() { if(this.ready) return; try{ this.ctx=new(window.AudioContext||window.webkitAudioContext)(); this.ready=true; }catch(e){} },
        startEngine: function() {
            if(!this.ready||this.engineSrc||!this.ctx) return;
            if(this.ctx.state==='suspended') this.ctx.resume();
            const buf = this.ctx.createBuffer(1, this.ctx.sampleRate*2, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for(let i=0; i<buf.length; i++) data[i] = (Math.random()*2-1)*0.3;
            this.engineSrc = this.ctx.createBufferSource(); this.engineSrc.buffer=buf; this.engineSrc.loop=true;
            const filter = this.ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=350;
            const gain = this.ctx.createGain(); gain.gain.value=0.2;
            this.engineSrc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
            this.engineSrc.start();
        },
        play: function(type) {
            if(type==='lock') window.Sfx?.play(1200,'square',0.1,0.1);
            else if(type==='vulcan') window.Sfx?.play(150,'sawtooth',0.05,0.2);
            else if(type==='missile') {
                if(this.ctx){
                    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
                    o.type='square'; o.frequency.setValueAtTime(100,t); o.frequency.linearRampToValueAtTime(1000,t+0.8);
                    g.gain.setValueAtTime(0.6,t); g.gain.exponentialRampToValueAtTime(0.01,t+1.5);
                    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+1.5);
                }
            }
            else if(type==='boom') window.Sfx?.play(80,'sawtooth',0.5,0.3);
            else if(type==='alarm') window.Sfx?.play(600,'square',0.2,0.1);
            else if(type==='buy') window.Sfx?.play(1500,'sine',0.1,0.2);
            else if(type==='beep') window.Sfx?.play(800,'sine',0.1,0.1);
        },
        stop: function() { if(this.engineSrc){ try{this.engineSrc.stop();}catch(e){} this.engineSrc=null; } }
    };

    // =========================================================================
    // ECS & CORE LOOP
    // =========================================================================
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE', slowMo: 1.0, slowMoTimer: 0, 
        fpsHistory: [], perfTier: 'HIGH', money: 0,
        upgrades: { engine: 1, radar: 1, missile: 1, boost: 1, thermal: 1 },
        session: { kills: 0, goal: 30 }, cameraShake: 0,
        
        eId: 0, entities: {}, // PURE ECS - NO PARALLEL ARRAYS
        
        ship: { 
            hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0,
            pitchVel: 0, yawVel: 0, rollVel: 0, boost: 100, overheat: 0, gForce: 1.0,
            damage: { lWing: 0, rWing: 0, engine: 0, body: 0 }
        },
        pilot: { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handL: {x:0,y:0}, handR: {x:0,y:0}, isBoosting: false },
        timer: 4.0, hoverTime: 0, hoveredItem: null, radarTimer: 0,
        combat: { targetId: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0, isJammed: false, hitChance: 0 },
        net: { isHost: false, uid: null, sessionRef: null, playersRef: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false, stars: [] },

        _spawn: function(type, comps) {
            let id = type + '_' + this.eId++;
            this.entities[id] = { id: id, type: type, p: comps.p||null, c: comps.c||null, a: comps.a||null, r: comps.r||null, n: comps.n||null };
            return id;
        },

        init: function(faseData) {
            this.lastTime = performance.now(); this.session = { kills: 0, goal: 30 };
            this.fpsHistory = []; this.perfTier = 'HIGH'; this.eId = 0; this.entities = {}; this.radarTimer = 0;
            this.ship = { hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0, pitchVel: 0, yawVel: 0, rollVel: 0, boost: 100, overheat: 0, gForce: 1.0, damage: { lWing: 0, rWing: 0, engine: 0, body: 0 } };
            this.pilot = { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handL: {x:0,y:0}, handR: {x:0,y:0}, isBoosting: false };
            this.combat = { targetId: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0, isJammed: false, hitChance: 0 };
            this.slowMo = 1.0; this.slowMoTimer = 0; this.cameraShake = 0;
            
            this._setupEnvironment();
            for(let i=0; i<60; i++) this._spawn('cloud', { p:{x:(Math.random()-0.5)*120000, y:8000+Math.random()*15000, z:(Math.random()-0.5)*120000}, r:{size:4000+Math.random()*8000} });
            for(let i=0; i<80; i++) {
                let col = this.environment.isNight ? `rgb(${Math.random()*30},${30+Math.random()*40},${Math.random()*30})` : `rgb(${50+Math.random()*50},${60+Math.random()*40},${40+Math.random()*30})`;
                this._spawn('terrain', { p:{x:(Math.random()-0.5)*200000, y:0, z:(Math.random()-0.5)*200000}, r:{w:2000+Math.random()*4000, h:500+Math.random()*3000, color:col} });
            }

            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random()*9999);
            this.mode = faseData?.mode || 'SINGLE';
            if (this.mode !== 'SINGLE' && window.DB) this._initNet(); else this.state = 'HANGAR';
            GameSfx.init();
        },

        _setupEnvironment: function() {
            let hr = new Date().getHours(); this.environment.stars = [];
            if(hr>=6 && hr<17) { this.environment.skyTop='#0a3d62'; this.environment.skyBot='#60a3bc'; this.environment.ground='#386641'; this.environment.isNight=false; }
            else if(hr>=17 && hr<19) { this.environment.skyTop='#2c2c54'; this.environment.skyBot='#ff793f'; this.environment.ground='#2d3436'; this.environment.isNight=false; }
            else { this.environment.skyTop='#000000'; this.environment.skyBot='#111122'; this.environment.ground='#0a0a0a'; this.environment.isNight=true; for(let i=0;i<100;i++) this.environment.stars.push({x:Math.random()*2-1, y:Math.random(), z:Math.random()*2-1, size:Math.random()*2}); }
        },

        update: function(ctx, w, h, pose) {
            let now = performance.now(), realDt = Math.min((now - this.lastTime)/1000, 0.05); this.lastTime = now;
            
            this.fpsHistory.push(realDt); if(this.fpsHistory.length>30) this.fpsHistory.shift();
            let fps = 1 / (this.fpsHistory.reduce((a,b)=>a+b,0) / this.fpsHistory.length);
            let oldT = this.perfTier;
            this.perfTier = fps>=45 ? 'HIGH' : (fps>=25 ? 'MEDIUM' : 'LOW');
            if(oldT !== this.perfTier && this.state === 'PLAYING') this._adjustECS();

            if(this.slowMoTimer>0) { this.slowMoTimer -= realDt; this.slowMo = 0.3; } else this.slowMo = 1.0;
            if(this.cameraShake>0) this.cameraShake *= 0.9;
            let dt = realDt * this.slowMo;

            if(this.state === 'LOBBY') { this._drawLobby(ctx,w,h); return 0; }
            this._readPose(pose,w,h,dt);
            if(this.state === 'HANGAR') { this._drawHangar(ctx,w,h,realDt); return 0; }
            if(this.state === 'CALIBRATION') { this.timer-=realDt; this._drawCalib(ctx,w,h); if(this.timer<=0) this._startMission(); return 0; }
            if(this.state === 'GAMEOVER' || this.state === 'VICTORY') { this._drawEnd(ctx,w,h); return this.money; }

            this._processPhysics(dt);
            this._processCombat(dt,w,h,now);
            this._processAI(dt,now);
            this._processECS(dt); 
            this._updateRadar(dt);

            if(this.ship.hp<=0 && this.state!=='GAMEOVER') this._endGame('GAMEOVER');
            this._draw(ctx,w,h,now);
            return this.money;
        },

        _adjustECS: function() {
            let limC = this.perfTier==='LOW'?20:(this.perfTier==='MEDIUM'?40:60), curC = 0, curT = 0;
            for(let id in this.entities) {
                if(this.entities[id].type==='cloud' && ++curC > limC) delete this.entities[id];
                if(this.entities[id].type==='terrain' && ++curT > limC) delete this.entities[id];
            }
        },

        // =====================================================================
        // NETWORK
        // =====================================================================
        _initNet: function() {
            this.state = 'LOBBY'; this.net.sessionRef = window.DB.ref('br_army_sessions/aero_' + this.mode);
            this.net.playersRef = this.net.sessionRef.child('pilotos'); this.net.playersRef.child(this.net.uid).onDisconnect().remove();
            this.net.sessionRef.child('host').once('value').then(snap => {
                if(!snap.val()) { this.net.isHost=true; this.net.sessionRef.child('host').set(this.net.uid); this.net.sessionRef.child('state').set('LOBBY'); this.net.playersRef.remove(); }
                this.net.playersRef.child(this.net.uid).set({ name: window.Profile?.username||'PILOTO', ready: false, hp: 100, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 });
            });
            this.net.playersRef.on('value', snap => { 
                let data = snap.val()||{};
                for(let uid in data) {
                    if(uid===this.net.uid) continue;
                    let foundId=null; for(let id in this.entities) if(this.entities[id].type==='net_player' && this.entities[id].n.uid===uid) foundId=id;
                    if(!foundId) {
                        this._spawn('net_player', {
                            p:{x:data[uid].x||0, y:data[uid].y||15000, z:data[uid].z||0, pitch:data[uid].pitch||0, yaw:data[uid].yaw||0, roll:data[uid].roll||0, speed:0},
                            c:{hp:data[uid].hp||100, maxHp:100, isEnemy:this.mode==='PVP'}, n:{uid:uid, name:data[uid].name, ready:data[uid].ready, tx:data[uid].x||0, ty:data[uid].y||15000, tz:data[uid].z||0, tpitch:data[uid].pitch||0, tyaw:data[uid].yaw||0, troll:data[uid].roll||0}, r:{radVisible:true}
                        });
                    } else {
                        let e = this.entities[foundId]; e.n.tx=data[uid].x||0; e.n.ty=data[uid].y||15000; e.n.tz=data[uid].z||0; e.n.tpitch=data[uid].pitch||0; e.n.tyaw=data[uid].yaw||0; e.n.troll=data[uid].roll||0; e.c.hp=data[uid].hp; e.n.name=data[uid].name; e.n.ready=data[uid].ready;
                    }
                }
                for(let id in this.entities) if(this.entities[id].type==='net_player' && !data[this.entities[id].n.uid]) delete this.entities[id];
            });
            this.net.sessionRef.child('state').on('value', snap => { if(snap.val()==='PLAYING' && this.state==='LOBBY') this.state='HANGAR'; });
        },

        // =====================================================================
        // PHYSICS
        // =====================================================================
        _processPhysics: function(dt) {
            let wd = (this.ship.damage.rWing - this.ship.damage.lWing) * 0.05, cl = Math.max(0.3, 1.0 - (this.ship.damage.body + this.ship.damage.engine)/200);
            this.ship.rollVel += ((this.pilot.targetRoll - this.ship.roll)*15*cl*dt) + (wd*dt);
            this.ship.pitchVel += (this.pilot.targetPitch - this.ship.pitch)*10*cl*dt;
            this.ship.yawVel += (this.ship.rollVel*0.5)*dt; 
            this.ship.rollVel *= 0.88; this.ship.pitchVel *= 0.90; this.ship.yawVel *= 0.92;
            this.ship.roll += this.ship.rollVel*dt; this.ship.pitch += this.ship.pitchVel*dt; this.ship.yaw += this.ship.yawVel*dt;
            this.ship.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.ship.pitch));
            
            let fX=Math.sin(this.ship.yaw)*Math.cos(this.ship.pitch), fY=Math.sin(this.ship.pitch), fZ=Math.cos(this.ship.yaw)*Math.cos(this.ship.pitch);
            let speedSq = this.ship.speed*this.ship.speed, aoa = Math.abs(this.ship.pitchVel)*10; 
            let lift = 0.00005*speedSq*Math.max(0,1-aoa*0.2), drag = (0.0001+0.005*aoa)*speedSq;
            
            this.ship.gForce = 1 + ((this.ship.pitchVel*this.ship.speed)/600);
            if(Math.abs(this.ship.gForce)>6) { this.cameraShake = Math.max(this.cameraShake, Math.abs(this.ship.gForce)-5); window.Gfx?.shakeScreen(this.cameraShake); }

            let maxSpeed = 3500 + (this.upgrades.engine*500) - (this.ship.damage.engine*20);
            if(this.pilot.isBoosting && this.ship.boost>0) { this.ship.speed+=2500*dt; this.ship.boost-=(50/this.upgrades.boost)*dt; Engine3D.fov+=(1000-Engine3D.fov)*dt*5; } 
            else { this.ship.boost=Math.min(100,this.ship.boost+15*dt); Engine3D.fov+=(800-Engine3D.fov)*dt*5; }
            this.ship.speed = Math.max(600, Math.min(maxSpeed*(this.pilot.isBoosting?1.5:1), this.ship.speed - drag*dt + (fY*-600*dt)));

            if(this.ship.speed>4000 && fY<-0.5 && Math.abs(this.ship.gForce)>7) { this.ship.damage.body+=15*dt; window.Gfx?.shakeScreen(8); if(Math.random()<0.2) GameSfx.play('alarm'); }
            if(this.ship.speed<900 && Math.abs(this.ship.pitch*180/Math.PI)>25) { this.ship.pitchVel-=2.5*dt; window.Gfx?.shakeScreen(4); if(Math.random()<0.1) GameSfx.play('alarm'); }

            let u = this.ship.speed*20;
            this.ship.x += u*fX*dt; this.ship.y += (u*fY*dt) + ((lift - 9.8*60)*dt*0.1); this.ship.z += u*fZ*dt;
            
            let tDmg = this.ship.damage.body + this.ship.damage.engine;
            if(tDmg>30 && this.perfTier!=='LOW') this._spawn('fx', { p:{x:this.ship.x, y:this.ship.y, z:this.ship.z, vx:0, vy:0, vz:0}, r:{life:2.0, color:tDmg>70?(Math.random()>0.5?'#e74c3c':'#333'):'rgba(80,80,80,0.6)', size:tDmg>70?400:200} });
        },

        _readPose: function(pose, w, h, dt) {
            let tR=0, tP=0; this.pilot.active=false; this.pilot.headTilt=false; this.pilot.isBoosting=false;
            if(!pose?.keypoints) return;
            const kp=n=>pose.keypoints.find(k=>k.part===n||k.name===n), rw=kp('right_wrist'), lw=kp('left_wrist'), rs=kp('right_shoulder'), ls=kp('left_shoulder'), rEar=kp('right_ear'), lEar=kp('left_ear');
            const pX=x=>w-((x/640)*w), pY=y=>(y/480)*h;
            if(rEar?.score>0.4 && lEar?.score>0.4 && Math.abs(pY(rEar.y)-pY(lEar.y))>h*0.05) this.pilot.headTilt=true;
            if(rw?.score>0.3 && lw?.score>0.3 && rs?.score>0.3 && ls?.score>0.3) {
                this.pilot.active=true;
                let w1={x:pX(rw.x), y:pY(rw.y)}, w2={x:pX(lw.x), y:pY(lw.y)};
                this.pilot.handR=w1; this.pilot.handL=w2;
                let hands=[w1,w2].sort((a,b)=>a.x-b.x), lH=hands[0], rH=hands[1], dx=rH.x-lH.x;
                tR=Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, Math.atan2(rH.y-lH.y, dx)));
                let dy=((lH.y+rH.y)/2) - ((pY(rs.y)+pY(ls.y))/2), dz=h*0.05;
                if(dy<-dz) tP=1.0; else if(dy>dz) tP=-1.0; else tP=0;
                if(Math.abs(dx)<w*0.15) this.pilot.isBoosting=true;
            }
            this.pilot.targetRoll=tR; this.pilot.targetPitch=tP;
        },

        // =====================================================================
        // AI
        // =====================================================================
        _processAI: function(dt, now) {
            let maxE=this.perfTier==='LOW'?4:8, eC=0, hasBoss=false;
            for(let id in this.entities) { let t=this.entities[id].type; if(t.startsWith('enemy')||t==='boss') { eC++; if(t==='boss') hasBoss=true; } }
            if(eC<maxE && Math.random()<0.02) {
                let d=60000+Math.random()*30000, fX=Math.sin(this.ship.yaw)*Math.cos(this.ship.pitch), fZ=Math.cos(this.ship.yaw)*Math.cos(this.ship.pitch);
                let sx=this.ship.x+fX*d+(Math.random()-0.5)*50000, sz=this.ship.z+fZ*d+(Math.random()-0.5)*50000, r=Math.random();
                if(this.session.kills>10 && r<0.1 && !hasBoss) {
                    this._spawn('boss', { p:{x:sx,y:30000,z:sz,pitch:0,yaw:this.ship.yaw+Math.PI,roll:0,speed:12000,vx:0,vy:0,vz:0}, c:{hp:3000,maxHp:3000,isEnemy:true,weakPoints:{left:800,right:800,core:1400}}, a:{state:'ENGAGE',timer:0,phase:1}, r:{radVisible:true} });
                    if(window.System?.msg) window.System.msg("FORTALEZA VOADORA DETECTADA!");
                } else if(r<0.3) {
                    this._spawn('enemy_squadron_lead', { p:{x:sx,y:this.ship.y,z:sz,pitch:0,yaw:this.ship.yaw+Math.PI,roll:0,speed:20000,vx:0,vy:0,vz:0}, c:{hp:200,maxHp:200,isEnemy:true}, a:{state:'PATROL',timer:0}, r:{radVisible:true} });
                    this._spawn('enemy_squadron_wing', { p:{x:sx+5000,y:this.ship.y+2000,z:sz,pitch:0,yaw:this.ship.yaw+Math.PI,roll:0,speed:22000,vx:0,vy:0,vz:0}, c:{hp:150,maxHp:150,isEnemy:true}, a:{state:'FLANK',timer:0}, r:{radVisible:true} });
                } else if(r<0.6) this._spawn('enemy_interceptor', { p:{x:sx,y:this.ship.y,z:sz,pitch:0,yaw:this.ship.yaw,roll:0,speed:25000,vx:0,vy:0,vz:0}, c:{hp:250,maxHp:250,isEnemy:true}, a:{state:'PATROL',timer:0}, r:{radVisible:true} });
                else if(r<0.8) this._spawn('enemy_evasive', { p:{x:sx,y:this.ship.y,z:sz,pitch:0,yaw:this.ship.yaw+Math.PI,roll:0,speed:28000,vx:0,vy:0,vz:0}, c:{hp:150,maxHp:150,isEnemy:true}, a:{state:'PATROL',timer:0}, r:{radVisible:true} });
                else this._spawn('enemy_tank', { p:{x:sx,y:0,z:sz,pitch:0,yaw:Math.random()*Math.PI*2,roll:0,speed:0,vx:0,vy:0,vz:0}, c:{hp:400,maxHp:400,isEnemy:true}, a:{state:'PATROL',timer:0}, r:{radVisible:true} });
            }

            for(let id in this.entities) {
                let e = this.entities[id]; if(!e.a) continue;
                let p=e.p, c=e.c, a=e.a, dx=this.ship.x-p.x, dy=this.ship.y-p.y, dz=this.ship.z-p.z, dP=Math.hypot(dx,dy,dz);
                if(dP>200000) { delete this.entities[id]; continue; }

                if(e.type==='enemy_tank') {
                    if(dP<40000 && Math.random()<0.04) this._spawn('bullet',{p:{x:p.x,y:p.y,z:p.z,vx:dx/dP*18000,vy:dy/dP*18000,vz:dz/dP*18000},c:{isEnemy:true,life:4.0},r:{color:'#ff3300',size:150,tracer:true}});
                    continue; 
                }

                let incM = false; for(let mid in this.entities) if(this.entities[mid].type==='missile' && this.entities[mid].c.targetId===id) incM=true;
                
                if(e.type!=='boss') {
                    if(p.y+(p.speed*0.5) < 5000) a.state='STALL_RECOVER'; else if(incM) a.state='EVADE'; else if(c.hp<c.maxHp*0.3) a.state='RETREAT'; else if(a.state==='STALL_RECOVER'||a.state==='EVADE') a.state='ENGAGE';
                }

                if(a.state==='STALL_RECOVER') { p.y-=15000*dt; p.speed+=5000*dt; p.x+=Math.sin(p.yaw)*p.speed*dt; p.z+=Math.cos(p.yaw)*p.speed*dt; }
                else if(a.state==='EVADE') { p.yaw+=Math.PI*dt; p.x+=Math.sin(p.yaw)*p.speed*1.5*dt; p.z+=Math.cos(p.yaw)*p.speed*1.5*dt; p.y+=(Math.random()-0.5)*20000*dt; if(Math.random()<0.1&&this.perfTier!=='LOW') this._spawn('fx',{p:{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0},r:{life:1.0,color:'#f1c40f',size:200}}); }
                else if(a.state==='RETREAT') { p.yaw=this.ship.yaw; p.x+=Math.sin(p.yaw)*p.speed*1.2*dt; p.z+=Math.cos(p.yaw)*p.speed*1.2*dt; p.y+=10000*dt; }
                else if(a.state==='FLANK') { p.yaw+=((this.ship.yaw+Math.PI/2)-p.yaw)*dt; p.x+=Math.sin(p.yaw)*p.speed*dt; p.z+=Math.cos(p.yaw)*p.speed*dt; }
                else {
                    if(e.type==='enemy_interceptor') {
                        let eT=dP/p.speed, pX=Math.sin(this.ship.yaw)*Math.cos(this.ship.pitch)*this.ship.speed*20, pZ=Math.cos(this.ship.yaw)*Math.cos(this.ship.pitch)*this.ship.speed*20;
                        p.yaw=Math.atan2((this.ship.x+pX*eT)-p.x, (this.ship.z+pZ*eT)-p.z); p.y+=((this.ship.y+Math.sin(this.ship.pitch)*this.ship.speed*20*eT)-p.y)*0.5*dt;
                    } else p.yaw=Math.atan2(dx,dz);
                    p.x+=Math.sin(p.yaw)*p.speed*dt; p.z+=Math.cos(p.yaw)*p.speed*dt;
                }

                if(e.type==='boss') {
                    if(a.phase===1 && c.hp<c.maxHp*0.66) { a.phase=2; window.System?.msg("BOSS: MODO AGRESSIVO!"); p.speed=18000; }
                    if(a.phase===2 && c.hp<c.maxHp*0.33) { a.phase=3; window.System?.msg("BOSS: NÚCLEO EXPOSTO!"); p.speed=25000; }
                    if(p.y<15000) p.y+=5000*dt;
                    if(a.phase===3) { p.yaw+=(Math.random()-0.5)*3*dt; p.x+=Math.sin(now*0.005)*10000*dt; if(Math.random()<0.15) this._spawn('fx',{p:{x:p.x+(Math.random()-0.5)*300,y:p.y,z:p.z+(Math.random()-0.5)*300,vx:0,vy:0,vz:0},r:{life:1.0,color:'#e74c3c',size:400}}); }
                    a.timer+=dt; let fR = a.phase===3?0.3:(a.phase===2?0.8:1.5);
                    if(a.timer>fR && dP<70000) {
                        a.timer=0; let bS=45000;
                        if(c.weakPoints.left>0) { let cx=p.x+Math.cos(p.yaw)*120,cz=p.z-Math.sin(p.yaw)*120; this._spawn('bullet',{p:{x:cx,y:p.y,z:cz,vx:(this.ship.x-cx)/dP*bS,vy:(this.ship.y-p.y)/dP*bS,vz:(this.ship.z-cz)/dP*bS},c:{isEnemy:true,life:4.0},r:{color:'#ff3300',size:250,tracer:true}}); }
                        if(c.weakPoints.right>0) { let cx=p.x-Math.cos(p.yaw)*120,cz=p.z+Math.sin(p.yaw)*120; this._spawn('bullet',{p:{x:cx,y:p.y,z:cz,vx:(this.ship.x-cx)/dP*bS,vy:(this.ship.y-p.y)/dP*bS,vz:(this.ship.z-cz)/dP*bS},c:{isEnemy:true,life:4.0},r:{color:'#ff3300',size:250,tracer:true}}); }
                        if(a.phase>=2 && c.weakPoints.core>0) this._spawn('bullet',{p:{x:p.x,y:p.y+50,z:p.z,vx:dx/dP*bS,vy:dy/dP*bS,vz:dz/dP*bS},c:{isEnemy:true,life:4.0},r:{color:'#ff3300',size:250,tracer:true}});
                        if(a.phase===3) { for(let i=-1;i<=1;i+=2){ let sy=p.yaw+(i*0.2); this._spawn('bullet',{p:{x:p.x,y:p.y,z:p.z,vx:Math.sin(sy)*bS,vy:dy/dP*bS,vz:Math.cos(sy)*bS},c:{isEnemy:true,life:4.0},r:{color:'#ff3300',size:250,tracer:true}}); } }
                    }
                }
                if(e.type!=='boss' && a.state==='ENGAGE' && dP<40000 && Math.random()<0.05) this._spawn('bullet',{p:{x:p.x,y:p.y,z:p.z,vx:dx/dP*35000,vy:dy/dP*35000,vz:dz/dP*35000},c:{isEnemy:true,life:4.0},r:{color:'#ff3300',size:150,tracer:true}});
            }
        },

        // =====================================================================
        // COMBAT
        // =====================================================================
        _processCombat: function(dt, w, h, now) {
            let rr = 100000+(this.upgrades.radar*20000), cT = this.combat.targetId?this.entities[this.combat.targetId]:null;
            if(cT && cT.c && cT.c.hp<=0) cT=null;

            if(cT) {
                let cp=cT.p, dx=cp.x-this.ship.x, dy=cp.y-this.ship.y, dz=cp.z-this.ship.z, d=Math.hypot(dx,dy,dz);
                let p = Engine3D.project(cp.x,cp.y,cp.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                if(!p.visible || d>rr || Math.abs(p.x-w/2)>w*0.45 || Math.abs(p.y-h/2)>h*0.45) { this.combat.locked=false; this.combat.lockTimer=0; this.combat.targetId=null; cT=null; }
                else this.combat.hitChance = Math.max(0, Math.min(100, 100 - (d/rr)*30 - (Math.abs(p.x-w/2)/(w/2))*30 - Math.abs(this.ship.speed-(cp.speed||0))/1000*10 - Math.abs(this.ship.gForce-1)*5 - ((cT.a&&cT.a.state==='EVADE')?40:0)));
            }

            if(!cT) {
                this.combat.hitChance=0; let cZ=Infinity;
                for(let id in this.entities) {
                    let e=this.entities[id];
                    if(e.type.startsWith('enemy') || e.type==='boss' || e.type==='net_player') {
                        let p = Engine3D.project(e.p.x,e.p.y,e.p.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                        if(p.visible && p.z>500 && p.z<rr && Math.abs(p.x-w/2)<w*0.35 && Math.abs(p.y-h/2)<h*0.35 && p.z<cZ) { cZ=p.z; this.combat.targetId=e.id; cT=e; }
                    }
                }
            }

            if(cT) { this.combat.lockTimer+=dt; if(this.combat.lockTimer>=0.4) { if(!this.combat.locked) GameSfx.play('lock'); this.combat.locked=true; this.combat.lockTimer=0.4; } }
            else { this.combat.lockTimer-=dt*3; if(this.combat.lockTimer<0) this.combat.lockTimer=0; }

            if(this.combat.isJammed) { this.ship.overheat-=30*dt; if(this.ship.overheat<=20) { this.combat.isJammed=false; GameSfx.play('beep'); } }

            if(this.combat.locked && cT && !this.combat.isJammed && now-this.combat.vulcanCd>120) {
                this.combat.vulcanCd=now; this.ship.overheat+=(15/this.upgrades.thermal);
                if(this.ship.overheat>=100) { this.ship.overheat=100; this.combat.isJammed=true; GameSfx.play('alarm'); }
                let spd=this.ship.speed*20+45000, dx=cT.p.x-this.ship.x+(Math.random()-0.5)*1500, dy=cT.p.y-this.ship.y+(Math.random()-0.5)*1500, dz=cT.p.z-this.ship.z, d=Math.hypot(dx,dy,dz);
                this._spawn('bullet', { p:{x:this.ship.x,y:this.ship.y-30,z:this.ship.z,vx:dx/d*spd,vy:dy/d*spd,vz:dz/d*spd}, c:{isEnemy:false,life:2.5}, r:{color:'#ffff00',size:250,tracer:true} });
                GameSfx.play('vulcan'); window.Gfx?.shakeScreen(1);
            } else if(!this.combat.locked && !this.combat.isJammed) this.ship.overheat = Math.max(0, this.ship.overheat-10*dt);

            if(this.combat.missileCd>0) this.combat.missileCd-=dt;
            if(this.combat.locked && this.pilot.headTilt && this.combat.missileCd<=0 && this.combat.targetId) {
                this.combat.missileCd=1.5; let mSpd=this.ship.speed*15+10000, fX=Math.sin(this.ship.yaw)*Math.cos(this.ship.pitch), fY=Math.sin(this.ship.pitch), fZ=Math.cos(this.ship.yaw)*Math.cos(this.ship.pitch);
                this._spawn('missile', { p:{x:this.ship.x,y:this.ship.y-100,z:this.ship.z,vx:fX*mSpd+(Math.random()-0.5)*5000,vy:fY*mSpd-2000,vz:fZ*mSpd+(Math.random()-0.5)*5000,speed:mSpd}, c:{targetId:this.combat.targetId,life:8}, r:{size:40,color:'#fff'} });
                GameSfx.play('missile'); window.Gfx?.shakeScreen(5);
            }
        },

        // =====================================================================
        // CORE ECS SYSTEM & LOOP
        // =====================================================================
        _processECS: function(dt) {
            let bullets = [], targets = [];
            for (let id in this.entities) {
                let e=this.entities[id], p=e.p, c=e.c, r=e.r;
                if(e.type==='cloud' || e.type==='terrain') {
                    if(Math.hypot(p.x-this.ship.x, p.z-this.ship.z)>150000) {
                        let fX=Math.sin(this.ship.yaw)*Math.cos(this.ship.pitch), fZ=Math.cos(this.ship.yaw)*Math.cos(this.ship.pitch);
                        p.z=this.ship.z+fZ*120000+(Math.random()-0.5)*80000; p.x=this.ship.x+fX*120000+(Math.random()-0.5)*80000;
                    }
                } else if(e.type==='floater' || e.type==='fx') {
                    if(p.vx!==undefined) { p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; }
                    r.life-=dt; if(e.type==='floater') p.y+=120*dt;
                    if(r.life<=0) { delete this.entities[id]; continue; }
                } else if(e.type==='bullet') {
                    p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; c.life-=dt;
                    if(c.life<=0 || p.y<0) {
                        if(p.y<0 && this.perfTier!=='LOW') this._spawn('fx', {p:{x:p.x,y:0,z:p.z,vx:0,vy:0,vz:0},r:{life:1.0,color:'#789',size:100}});
                        delete this.entities[id]; continue;
                    } else {
                        bullets.push(e);
                        if(this.perfTier==='HIGH' || Math.random()<0.5) this._spawn('fx', {p:{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0},r:{life:0.1,color:c.isEnemy?'#ff3300':'#ffff00',size:250,tracer:true}});
                    }
                } else if(e.type==='missile') {
                    p.speed += 20000*dt; let at = this.entities[c.targetId];
                    if(!at || !at.c || at.c.hp<=0) {
                        c.life=0; delete this.entities[id];
                        if(this.perfTier!=='LOW') this._spawn('fx',{p:{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0},r:{life:1.5,color:'rgba(100,100,100,0.5)',size:400}});
                        continue;
                    }
                    let dx=at.p.x-p.x, dy=at.p.y-p.y, dz=at.p.z-p.z, d=Math.hypot(dx,dy,dz), turn=(50000+this.upgrades.missile*10000)*dt;
                    p.vx+=(dx/d)*turn; p.vy+=(dy/d)*turn; p.vz+=(dz/d)*turn;
                    let vD=Math.hypot(p.vx,p.vy,p.vz); if(vD>p.speed) { p.vx=(p.vx/vD)*p.speed; p.vy=(p.vy/vD)*p.speed; p.vz=(p.vz/vD)*p.speed; }
                    if(d < (at.type==='boss'?9000:3000)) {
                        if(at.type==='net_player' && this.mode==='PVP') {
                            window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${at.n.uid}/hp`).set(at.c.hp-60);
                            this._spawn('fx',{p:{x:at.p.x,y:at.p.y,z:at.p.z,vx:0,vy:0,vz:0},r:{life:2.0,color:'#f33',size:400}}); this.money+=800;
                        } else if(at.type!=='net_player') this._applyDamageToEnemy(at, 500);
                        delete this.entities[id]; GameSfx.play('boom'); window.Gfx?.shakeScreen(5); continue;
                    }
                    p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; c.life-=dt;
                    if(p.y<0) { delete this.entities[id]; this._spawn('fx',{p:{x:p.x,y:0,z:p.z,vx:0,vy:0,vz:0},r:{life:2.0,color:'#a55',size:200}}); continue; }
                    if(this.perfTier==='HIGH' || Math.random()<0.5) this._spawn('fx',{p:{x:p.x,y:p.y,z:p.z,vx:(Math.random()-0.5)*300,vy:(Math.random()-0.5)*300,vz:(Math.random()-0.5)*300},r:{life:1.5,color:'rgba(220,220,220,0.6)',size:500}});
                    if(c.life<=0) delete this.entities[id];
                }
                if(e.type.startsWith('enemy') || e.type==='boss' || e.type==='net_player') targets.push(e);
            }

            for(let b of bullets) {
                if(!this.entities[b.id]) continue;
                if(b.c.isEnemy) {
                    if(Math.hypot(b.p.x-this.ship.x, b.p.y-this.ship.y, b.p.z-this.ship.z)<1500) { this._takeDamage(10); delete this.entities[b.id]; }
                } else {
                    for(let t of targets) {
                        if(!this.entities[t.id]) continue;
                        if(Math.hypot(b.p.x-t.p.x, b.p.y-t.p.y, b.p.z-t.p.z) < (t.type==='boss'?8000:2500)) {
                            delete this.entities[b.id]; this._spawn('fx',{p:{x:t.p.x,y:t.p.y,z:t.p.z,vx:0,vy:0,vz:0},r:{life:1.0,color:'#f90',size:100}});
                            if(t.type==='net_player' && this.mode==='PVP' && this.net.isHost) window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${t.n.uid}/hp`).set(t.c.hp-10);
                            else if(t.type!=='net_player') this._applyDamageToEnemy(t, 35);
                            break;
                        }
                    }
                }
            }
        },

        _applyDamageToEnemy: function(e, a) {
            if(e.type==='boss') {
                if(e.c.weakPoints.left>0) { e.c.weakPoints.left-=a; this._spawn('fx',{p:{x:e.p.x+100,y:e.p.y,z:e.p.z,vx:0,vy:0,vz:0},r:{life:1.5,color:'#ff3300',size:300}}); }
                else if(e.c.weakPoints.right>0) { e.c.weakPoints.right-=a; this._spawn('fx',{p:{x:e.p.x-100,y:e.p.y,z:e.p.z,vx:0,vy:0,vz:0},r:{life:1.5,color:'#ff3300',size:300}}); }
                else { e.c.weakPoints.core-=a; this._spawn('fx',{p:{x:e.p.x,y:e.p.y,z:e.p.z,vx:0,vy:0,vz:0},r:{life:2.0,color:'#3498db',size:500}}); }
                e.c.hp-=a; 
            } else e.c.hp-=a;
            if(e.c.hp<=0) this._kill(e);
        },

        _takeDamage: function(a) {
            this.ship.hp-=a; this.cameraShake=15; window.Gfx?.shakeScreen(15); 
            this._spawn('fx',{p:{x:this.ship.x,y:this.ship.y,z:this.ship.z+500,vx:0,vy:0,vz:0},r:{life:1.0,color:'#f00',size:200}}); GameSfx.play('boom');
            let pts=['lWing','rWing','engine','body'], hP=pts[Math.floor(Math.random()*pts.length)]; this.ship.damage[hP]+=a*0.5;
            if(this.ship.hp<=0) this._endGame('GAMEOVER');
        },

        _kill: function(e) {
            let iB=e.type==='boss', rew=iB?2500:(e.type==='enemy_tank'?300:200), p=e.p;
            GameSfx.play('boom'); this.cameraShake=iB?40:10; window.Gfx?.shakeScreen(this.cameraShake);
            this._spawn('fx',{p:{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0},r:{life:2.0,color:'#ff3300',size:iB?1500:400}});
            this._spawn('fx',{p:{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0},r:{life:2.5,color:'#f1c40f',size:iB?2000:600}});
            if(iB) {
                let expTimer = setInterval(() => {
                    if(this.state!=='PLAYING') clearInterval(expTimer);
                    this._spawn('fx',{p:{x:p.x+(Math.random()-0.5)*5000,y:p.y+(Math.random()-0.5)*5000,z:p.z+(Math.random()-0.5)*5000,vx:0,vy:0,vz:0},r:{life:2.0,color:'#ff3300',size:800}});
                    GameSfx.play('boom');
                }, 400); setTimeout(() => clearInterval(expTimer), 3500);
            }
            this._spawn('floater',{p:{x:p.x,y:p.y,z:p.z},r:{life:2.5,text:`+ R$${rew}`}});
            this.session.kills++; this.money+=rew; this.slowMoTimer=iB?4.0:1.0; delete this.entities[e.id];
            if(this.session.kills>=this.session.goal && this.mode==='SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state=res; GameSfx.stop();
            setTimeout(() => { if(window.System?.gameOver) window.System.gameOver(this.session.kills*150,res==='VICTORY',this.money); else if(window.System?.home) window.System.home(); }, 4000);
        },

        _startMission: function() {
            this.state='PLAYING'; this.ship.x=(Math.random()-0.5)*10000; this.ship.z=(Math.random()-0.5)*10000; GameSfx.startEngine();
            if(this.mode!=='SINGLE') {
                this.net.loop = setInterval(() => { if(this.state==='PLAYING' && this.net.playersRef) this.net.playersRef.child(this.net.uid).update({x:this.ship.x,y:this.ship.y,z:this.ship.z,pitch:this.ship.pitch,yaw:this.ship.yaw,roll:this.ship.roll,hp:this.ship.hp}); }, 100);
            }
        },

        // =====================================================================
        // RADAR
        // =====================================================================
        _updateRadar: function(dt) {
            this.radarTimer+=dt; let uR=this.perfTier==='LOW'?0.3:0.05;
            if(this.radarTimer>=uR) {
                this.radarTimer=0; let rg=this.perfTier==='LOW'?40000:80000, rgSq=rg*rg, cY=Math.cos(-this.ship.yaw), sY=Math.sin(-this.ship.yaw);
                for(let id in this.entities) {
                    let e=this.entities[id], r=e.r, p=e.p; if(!r) continue;
                    if(e.type==='cloud'||e.type==='terrain'||e.type==='fx'||e.type==='floater'||e.type==='bullet') { r.radVisible=false; continue; }
                    let dx=p.x-this.ship.x, dz=p.z-this.ship.z;
                    if(dx*dx+dz*dz <= rgSq) { r.radVisible=true; r.radX=dx*cY-dz*sY; r.radZ=dx*sY+dz*cY; r.radDy=p.y-this.ship.y; }
                    else r.radVisible=false;
                }
            }
        },

        _drawRadar: function(ctx, w, h, now) {
            let rad=Math.min(w*0.15,70), cx=rad+15, cy=h-rad-45; 
            ctx.fillStyle='rgba(10,30,20,0.6)'; ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle='rgba(0,255,100,0.4)'; ctx.lineWidth=1;
            ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx,cy,rad*0.66,0,Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx,cy,rad*0.33,0,Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx,cy-rad); ctx.lineTo(cx,cy+rad); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx-rad,cy); ctx.lineTo(cx+rad,cy); ctx.stroke();
            let rg=this.perfTier==='LOW'?40000:80000;
            for(let id in this.entities) {
                let e=this.entities[id], r=e.r; if(!r||!r.radVisible) continue;
                let px=cx+(r.radX/rg)*rad, py=cy-(r.radZ/rg)*rad; 
                if(Math.hypot(px-cx,py-cy)>rad) continue;
                let col='#f00', sz=3;
                if(e.type==='boss') { col=(now%500<250)?'#f03':'#fff'; sz=5; }
                else if(e.type==='net_player') { col='#0ff'; sz=4; }
                else if(e.type==='missile') { col='#ff0'; sz=2; }
                ctx.fillStyle=col;
                if(r.radDy>2500) { ctx.beginPath(); ctx.moveTo(px,py-sz); ctx.lineTo(px-sz,py+sz); ctx.lineTo(px+sz,py+sz); ctx.fill(); }
                else if(r.radDy<-2500) { ctx.beginPath(); ctx.moveTo(px,py+sz); ctx.lineTo(px-sz,py-sz); ctx.lineTo(px+sz,py-sz); ctx.fill(); }
                else { ctx.beginPath(); ctx.arc(px,py,sz,0,Math.PI*2); ctx.fill(); }
            }
            ctx.fillStyle='#0f0'; ctx.beginPath(); ctx.moveTo(cx,cy-6); ctx.lineTo(cx-4,cy+4); ctx.lineTo(cx,cy+2); ctx.lineTo(cx+4,cy+4); ctx.fill();
        },

        // =====================================================================
        // HUD / RENDERING
        // =====================================================================
        _draw: function(ctx, w, h, now) {
            ctx.save();
            if(this.cameraShake>0.5) ctx.translate((Math.random()-0.5)*this.cameraShake, (Math.random()-0.5)*this.cameraShake);
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            this._drawYoke(ctx,w,h);
            this._drawHUD(ctx,w,h,now); 
            this._drawRadar(ctx,w,h,now);
            ctx.restore();
            ctx.fillStyle='rgba(0,0,0,0.15)'; for(let i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
            if(this.ship.speed>2500 || this.pilot.isBoosting || this.ship.gForce>5) {
                let vGrad=ctx.createRadialGradient(w/2,h/2,h*0.4,w/2,h/2,h); vGrad.addColorStop(0,'transparent'); 
                vGrad.addColorStop(1,this.ship.gForce>5?'rgba(150,0,0,0.6)':'rgba(0,0,0,0.7)'); ctx.fillStyle=vGrad; ctx.fillRect(0,0,w,h);
            }
        },

        _drawWorld: function(ctx,w,h) {
            ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(-this.ship.roll);
            let hy=Math.sin(this.ship.pitch)*h*1.5, sG=ctx.createLinearGradient(0,-h*4,0,hy);
            sG.addColorStop(0,this.environment.skyTop); sG.addColorStop(1,this.environment.skyBot); ctx.fillStyle=sG; ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
            if(this.environment.isNight) { ctx.fillStyle="rgba(255,255,255,0.8)"; this.environment.stars.forEach((s,idx)=>{ if(this.perfTier==='LOW'&&idx%3!==0)return; ctx.beginPath(); ctx.arc(s.x*w*2,s.y*(-h*4),s.size,0,Math.PI*2); ctx.fill(); }); }
            let gG=ctx.createLinearGradient(0,hy,0,h*4); gG.addColorStop(0,this.environment.isNight?'#050505':'#1e3020'); gG.addColorStop(1,this.environment.ground); ctx.fillStyle=gG; ctx.fillRect(-w*3,hy,w*6,h*4);
            ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-w*3,hy); ctx.lineTo(w*3,hy); ctx.stroke();
            ctx.restore();
        },

        _drawMesh: function(ctx, mesh, e, w, h) {
            let p=e.p, sc=e.type==='boss'?200:(e.type==='enemy_tank'?80:60), pF=[];
            for(let f of mesh.f) {
                let col=f[f.length-1], pts=[], zS=0, vis=true;
                for(let i=0; i<f.length-1; i++) {
                    let v=mesh.v[f[i]], wP=Engine3D.rotate(v.x*sc,v.y*sc,v.z*sc,0,p.yaw,0); wP.x+=p.x; wP.y+=p.y; wP.z+=p.z;
                    let pr=Engine3D.project(wP.x,wP.y,wP.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                    if(!pr.visible) vis=false; pts.push(pr); zS+=pr.z;
                }
                if(vis) pF.push({pts:pts, z:zS/(f.length-1), color:col});
            }
            pF.sort((a,b)=>b.z-a.z);
            for(let f of pF) {
                ctx.fillStyle=f.color; ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1;
                ctx.beginPath(); ctx.moveTo(f.pts[0].x,f.pts[0].y); for(let i=1;i<f.pts.length;i++) ctx.lineTo(f.pts[i].x,f.pts[i].y);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        },

        _drawEntities: function(ctx,w,h) {
            let buf=[];
            for(let id in this.entities) {
                let e=this.entities[id]; if(!e.p) continue;
                let pr=Engine3D.project(e.p.x,e.p.y,e.p.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                if(pr.visible) buf.push({pr, e});
            }
            buf.sort((a,b)=>b.pr.z-a.pr.z);
            buf.forEach(d=>{
                let pr=d.pr, s=pr.s, e=d.e, r=e.r, p=e.p;
                if(e.type==='cloud') { ctx.fillStyle=this.environment.isNight?'rgba(50,50,60,0.08)':'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(pr.x,pr.y,r.size*s,0,Math.PI*2); ctx.fill(); }
                else if(e.type==='terrain') { let pr2=Engine3D.project(p.x,r.h,p.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(pr2.visible) { let tw=r.w*s; ctx.fillStyle=r.color; ctx.fillRect(pr.x-w/2-tw/2,pr2.y-h/2,tw,pr.y-pr2.y); ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.strokeRect(pr.x-w/2-tw/2,pr2.y-h/2,tw,pr.y-pr2.y); } }
                else if(e.type==='floater') { ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(12,2500*s)}px Arial`; ctx.textAlign='center'; ctx.fillText(r.text,pr.x,pr.y,w*0.9); }
                else if(e.type.startsWith('enemy')||e.type==='boss'||e.type==='net_player') {
                    let iN=e.type==='net_player', mT=e.type==='enemy_tank'?MESHES.tank:(e.type==='boss'?MESHES.boss:MESHES.jet);
                    this._drawMesh(ctx,mT,e,w,h);
                    if(iN) { ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText(e.n.name||'ALIADO',pr.x,pr.y-350*s-15,w*0.3); }
                    if(this.combat.targetId===e.id) { ctx.strokeStyle='#f03'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(pr.x,pr.y,Math.max(20,(e.type==='boss'?800:250)*s)*1.2,0,Math.PI*2); ctx.stroke(); ctx.fillStyle='#f03'; ctx.font=`bold ${Math.max(12,w*0.025)}px Arial`; ctx.textAlign='center'; ctx.fillText('TRAVADO',pr.x,pr.y+Math.max(20,(e.type==='boss'?800:250)*s)*1.2+15,w*0.3); } 
                    else if(!iN) { ctx.strokeStyle=e.type==='enemy_tank'?'rgba(243,156,18,0.8)':'rgba(231,76,60,0.6)'; ctx.lineWidth=1; let bs=Math.max(20,(e.type==='boss'?800:250)*s); ctx.strokeRect(pr.x-bs,pr.y-bs,bs*2,bs*2); }
                }
                else if(e.type==='bullet') { if(r.tracer) { ctx.strokeStyle=r.color; ctx.lineWidth=Math.max(1,r.size*s); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(pr.x,pr.y); ctx.lineTo(pr.x-p.vx*0.01*s,pr.y-p.vy*0.01*s); ctx.stroke(); } else { ctx.globalCompositeOperation='lighter'; ctx.fillStyle=r.color; ctx.beginPath(); ctx.arc(pr.x,pr.y,Math.max(2,15*s),0,Math.PI*2); ctx.fill(); ctx.globalCompositeOperation='source-over'; } }
                else if(e.type==='missile') { ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(pr.x,pr.y,Math.max(2,40*s),0,Math.PI*2); ctx.fill(); }
                else if(e.type==='fx') { ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=Math.max(0,r.life); ctx.fillStyle=r.color; ctx.beginPath(); ctx.arc(pr.x,pr.y,Math.max(1,r.size*s),0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; }
            });
        },

        _drawYoke: function(ctx, w, h) {
            ctx.save(); let ys=Math.min(w*0.25,120); ctx.translate(w/2,h); 
            let g=ctx.createLinearGradient(-15,0,15,0); g.addColorStop(0,'#111'); g.addColorStop(0.5,'#444'); g.addColorStop(1,'#111');
            ctx.fillStyle=g; ctx.fillRect(-ys*0.15,-ys*1.5,ys*0.3,ys*1.5); 
            ctx.translate(0,-ys*1.5); ctx.rotate(this.pilot.targetRoll); 
            ctx.fillStyle='#1a1a1a'; ctx.beginPath(); ctx.roundRect(-ys*0.8,-ys*0.2,ys*1.6,ys*0.3,ys*0.1); ctx.fill();
            let gg=ctx.createLinearGradient(-ys,0,-ys*0.7,0); gg.addColorStop(0,'#050505'); gg.addColorStop(0.5,'#222'); gg.addColorStop(1,'#050505');
            ctx.fillStyle=gg; ctx.beginPath(); ctx.roundRect(-ys*0.9,-ys*0.5,ys*0.25,ys*0.7,ys*0.1); ctx.roundRect(ys*0.65,-ys*0.5,ys*0.25,ys*0.7,ys*0.1); ctx.fill();
            ctx.fillStyle=this.combat.locked?'#f33':'#a00'; ctx.beginPath(); ctx.arc(-ys*0.77,-ys*0.4,ys*0.06,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ys*0.77,-ys*0.4,ys*0.06,0,Math.PI*2); ctx.fill();
            ctx.restore();
        },

        _drawHUD: function(ctx, w, h, now){
            let cx=w/2, cy=h/2, fz=Math.max(10,Math.min(w*0.035,16)); 
            ctx.strokeStyle='rgba(0,255,100,0.8)'; ctx.lineWidth=1; ctx.fillStyle='rgba(0,255,100,0.8)'; ctx.font=`bold ${fz}px 'Chakra Petch', sans-serif`;
            ctx.beginPath(); ctx.moveTo(cx-15,cy); ctx.lineTo(cx-5,cy); ctx.moveTo(cx+15,cy); ctx.lineTo(cx+5,cy); ctx.moveTo(cx,cy-15); ctx.lineTo(cx,cy-5); ctx.moveTo(cx,cy+15); ctx.lineTo(cx,cy+5); ctx.stroke(); ctx.beginPath(); ctx.arc(cx,cy,2,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='rgba(0,0,0,0.4)'; let tW=w*0.14, tH=h*0.35, sX=w*0.02, aX=w*0.84;
            ctx.fillRect(sX,cy-tH/2,tW,tH); ctx.strokeRect(sX,cy-tH/2,tW,tH); ctx.fillRect(aX,cy-tH/2,tW,tH); ctx.strokeRect(aX,cy-tH/2,tW,tH);
            ctx.fillStyle='#0f6'; ctx.textAlign='center'; ctx.font=`bold ${fz*1.2}px 'Russo One'`; ctx.fillText(Math.floor(this.ship.speed),sX+tW/2,cy+fz/2,tW*0.9); ctx.fillText(Math.floor(this.ship.y),aX+tW/2,cy+fz/2,tW*0.9);
            ctx.font=`bold ${fz*0.8}px Arial`; ctx.fillStyle='#fff'; ctx.fillText("VEL (KT)",sX+tW/2,cy-tH/2-5,tW*0.9); ctx.fillText("ALT (FT)",aX+tW/2,cy-tH/2-5,tW*0.9);
            let hdg=(this.ship.yaw*180/Math.PI)%360; if(hdg<0) hdg+=360; let cW=w*0.35;
            ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(cx-cW/2,10,cW,25); ctx.strokeRect(cx-cW/2,10,cW,25); ctx.fillStyle='#fff'; ctx.font=`bold ${fz}px 'Russo One'`; ctx.fillText(`RUMO: ${Math.floor(hdg)}°`,cx,28,cW*0.9);
            const dX=sX, dY=cy+tH/2+20; ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(dX,dY,tW,60); ctx.fillStyle='#fff'; ctx.font=`bold ${fz*0.7}px Arial`; ctx.fillText("STATUS",dX+tW/2,dY+12);
            let dC=(val)=>val>20?'#e74c3c':(val>10?'#f39c12':'#2ecc71');
            ctx.fillStyle=dC(this.ship.damage.lWing); ctx.fillRect(dX+5,dY+25,10,10); ctx.fillStyle=dC(this.ship.damage.rWing); ctx.fillRect(dX+tW-15,dY+25,10,10);
            ctx.fillStyle=dC(this.ship.damage.body); ctx.fillRect(dX+tW/2-5,dY+20,10,20); ctx.fillStyle=dC(this.ship.damage.engine); ctx.fillRect(dX+tW/2-5,dY+45,10,10);
            const bX=cx-cW/2, bY=h-60; ctx.fillStyle='#222'; ctx.fillRect(bX,bY,cW,10); ctx.fillRect(bX,bY+15,cW,10);
            ctx.fillStyle='#3498db'; ctx.fillRect(bX,bY,cW*(this.ship.boost/100),10); ctx.fillStyle=this.combat.isJammed?'#e74c3c':'#e67e22'; ctx.fillRect(bX,bY+15,cW*(this.ship.overheat/100),10); 
            ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.font=`bold ${fz*0.8}px Arial`; ctx.fillText("BOOST",bX-45,bY+9); ctx.fillText("CALOR",bX-45,bY+24);
            ctx.fillStyle='#0f6'; ctx.textAlign='right'; ctx.font=`bold ${fz}px Arial`; ctx.fillText(`G-FORCE: ${this.ship.gForce.toFixed(1)}`,aX+tW,cy+tH/2+20);
            if(this.combat.targetId) { ctx.fillStyle=this.combat.hitChance>70?'#2ecc71':'#e74c3c'; ctx.fillText(`ACERTO: ${Math.floor(this.combat.hitChance)}%`,aX+tW,cy+tH/2+40); }
            ctx.fillStyle=this.ship.hp>30?'#2ecc71':'#e74c3c'; ctx.font=`bold ${fz*1.1}px 'Russo One'`; ctx.textAlign='left'; ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`,10,h-15,w*0.3);
            ctx.fillStyle='#f1c40f'; ctx.textAlign='right'; ctx.fillText(`R$: ${this.money}`,w-10,h-15,w*0.3);
            ctx.textAlign='center';
            if(this.combat.targetId && this.combat.locked) { ctx.fillStyle='#f03'; ctx.font=`bold ${fz*1.3}px 'Russo One'`; ctx.fillText("ALVO TRAVADO - FOGO!",cx,h*0.70,w*0.9); if(this.combat.missileCd<=0) { ctx.fillStyle='#0ff'; ctx.font=`bold ${fz*0.9}px Arial`; ctx.fillText("INCLINE CABEÇA P/ MÍSSIL",cx,h*0.75,w*0.9); } }
            if(this.combat.isJammed) { ctx.fillStyle='#f00'; ctx.font=`bold ${fz*1.5}px 'Russo One'`; ctx.fillText("ARMA SOBREAQUECIDA!",cx,h*0.65,w*0.9); }
            if(!this.pilot.active) { ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,cy-20,w,40); ctx.fillStyle='#f00'; ctx.font=`bold ${fz*1.2}px Arial`; ctx.textAlign='center'; ctx.fillText("MÃOS NÃO DETECTADAS!",cx,cy+fz*0.4,w*0.9); }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(5,15,10,0.95)'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='rgba(0,255,100,0.3)'; ctx.lineWidth=2; ctx.strokeRect(w*0.1,h*0.1,w*0.8,h*0.8);
            const fz=Math.min(w*0.045,20); ctx.fillStyle='#0f6'; ctx.textAlign='center'; ctx.font=`bold ${fz*1.5}px "Russo One"`; ctx.fillText('SISTEMAS ONLINE',w/2,h*0.25,w*0.8);
            ctx.fillStyle='#fff'; ctx.font=`bold ${fz}px Arial`; ctx.fillText('JUNTE AS MÃOS NO CENTRO = BOOST',w/2,h*0.45,w*0.8); ctx.fillStyle='#f1c40f'; ctx.fillText('MÃO ACIMA DOS OMBROS = SOBE',w/2,h*0.55,w*0.8); ctx.fillText('MÃO NA BARRIGA = DESCE',w/2,h*0.6,w*0.8);
            let pct=1-this.timer/4; ctx.fillStyle='#111'; ctx.fillRect(w*0.2,h*0.7,w*0.6,15); ctx.fillStyle='#0f6'; ctx.fillRect(w*0.2,h*0.7,(w*0.6)*pct,15);
        },

        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,30,0.98)'; ctx.fillRect(0,0,w,h); const fz=Math.min(w*0.045,22);
            ctx.fillStyle='#2ecc71'; ctx.textAlign='center'; ctx.font=`bold ${fz*1.5}px "Russo One"`; ctx.fillText('FORÇAS ARMADAS BR',w/2,h*0.15,w*0.9);
            let ps=0; for(let id in this.entities) if(this.entities[id].type==='net_player') ps++;
            ctx.font=`bold ${fz}px Arial`; ctx.fillStyle='#fff'; ctx.fillText(`PILOTOS NA BASE: ${ps+1}`,w/2,h*0.25,w*0.9);
            let py=h*0.35; ctx.fillStyle='#2ecc71'; ctx.fillText(`[HOST] EU`,w/2,py,w*0.9); py+=35;
            for(let id in this.entities) { let e=this.entities[id]; if(e.type==='net_player') { ctx.fillStyle=e.n.ready?'#2ecc71':'#e74c3c'; ctx.fillText(`[${e.n.ready?'PRONTO':'ESPERA'}] ${e.n.name}`,w/2,py,w*0.9); py+=35; } }
            let bW=Math.min(280,w*0.8);
            if(this.net.isHost) { let r=ps>=0; ctx.fillStyle=r?'#c0392b':'#34495e'; ctx.fillRect(w/2-bW/2,h*0.80,bW,50); ctx.fillStyle='#fff'; ctx.font=`bold ${fz}px "Russo One"`; ctx.fillText(r?'LANÇAR':'AGUARDANDO...',w/2,h*0.80+32,bW*0.9); }
            else { ctx.fillStyle=this.net.isReady?'#f39c12':'#2980b9'; ctx.fillRect(w/2-bW/2,h*0.80,bW,50); ctx.fillStyle='#fff'; ctx.font=`bold ${fz}px "Russo One"`; ctx.fillText(this.net.isReady?'EM ESPERA':'PRONTO',w/2,h*0.80+32,bW*0.9); }
        },

        _drawEnd: function(ctx,w,h){
            this._draw(ctx,w,h,performance.now()); ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
            const fz=Math.min(w*0.06,35); ctx.textAlign='center'; ctx.font=`bold ${fz}px "Russo One"`; ctx.fillStyle=this.state==='VICTORY'?'#2ecc71':'#e74c3c'; ctx.fillText(this.state==='VICTORY'?'SUCESSO':'DESTRUÍDO',w/2,h/2-fz,w*0.9);
            ctx.fillStyle='#f1c40f'; ctx.font=`bold ${fz*0.6}px Arial`; ctx.fillText(`R$ ${this.money}`,w/2,h/2+fz,w*0.9); ctx.fillStyle='#fff'; ctx.fillText(`ABATES: ${this.session.kills}`,w/2,h/2+fz*2,w*0.9);
        }
    };

    const register = () => {
        if (window.System?.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '🚀', Game, {
                camera: 'user',
                phases: [
                    { id: 'mission1', name: 'TREINO VS. IA', desc: 'Passo Atrás = Sobe. Passo Frente = Desce. Mira Automática Instântanea. Incline a Cabeça = Míssil!', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'SQUADRON CO-OP', desc: 'Junte-se a aliados contra a IA.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Combate aéreo contra outros jogadores reais.', mode: 'PVP', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) { const check = setInterval(() => { if (register()) clearInterval(check); }, 100); }
})();
