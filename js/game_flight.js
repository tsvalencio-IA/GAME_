// =============================================================================
// AERO STRIKE SIMULATOR: BRAZILIAN ARMED FORCES EDITION (V11 - PLATINUM MASTER)
// ENGINE: 100% PURE ECS, REAL AERODYNAMIC PHYSICS, DYNAMIC PERFORMANCE TIER
// =============================================================================
(function() {
    "use strict";

    // --- ENGINE MATEMÁTICA E POLIGONAL 3D (NÍVEL CONSOLE) ---
    const Engine3D = {
        fov: 800,
        rotate: (x, y, z, pitch, yaw, roll) => {
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let x1 = x * cr - y * sr, y1 = x * sr + y * cr, z1 = z;
            let cp = Math.cos(pitch), sp = Math.sin(pitch);
            let x2 = x1, y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;
            let cy = Math.cos(yaw), sy = Math.sin(yaw);
            return { x: x2 * cy + z2 * sy, y: y2, z: -x2 * sy + z2 * cy };
        },
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            let dx = objX - camX, dy = objY - camY, dz = objZ - camZ;
            let cy = Math.cos(-yaw), sy = Math.sin(-yaw);
            let x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
            let cp = Math.cos(-pitch), sp = Math.sin(-pitch);
            let y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            if (z2 < 10) return { visible: false };
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let finalX = x1 * cr - y2 * sr, finalY = x1 * sr + y2 * cr;
            let scale = Engine3D.fov / z2;
            return { x: (w/2) + (finalX * scale), y: (h/2) - (finalY * scale), s: scale, z: z2, visible: true };
        }
    };

    // --- MODELOS 3D DOS INIMIGOS ---
    const MESHES = {
        jet: {
            v: [{x: 0, y: 0, z: 40}, {x: 0, y: 15, z: -30}, {x: -35, y: 0, z: -10}, {x: 35, y: 0, z: -10}, {x: 0, y: -10, z: -20}, {x: 0, y: 10, z: 10}],
            f: [[0, 2, 5, '#7f8c8d'], [0, 5, 3, '#95a5a6'], [0, 4, 2, '#34495e'], [0, 3, 4, '#2c3e50'], [5, 2, 1, '#bdc3c7'], [5, 1, 3, '#ecf0f1'], [4, 1, 2, '#2c3e50'], [4, 3, 1, '#34495e']]
        },
        tank: {
            v: [{x: -20, y: 0, z: 30}, {x: 20, y: 0, z: 30}, {x: 20, y: 15, z: 30}, {x: -20, y: 15, z: 30}, {x: -20, y: 0, z: -30}, {x: 20, y: 0, z: -30}, {x: 20, y: 15, z: -30}, {x: -20, y: 15, z: -30}, {x: -10, y: 15, z: 10}, {x: 10, y: 15, z: 10}, {x: 10, y: 25, z: -10}, {x: -10, y: 25, z: -10}, {x: -2, y: 20, z: 10}, {x: 2, y: 20, z: 10}, {x: 2, y: 20, z: 50}, {x: -2, y: 20, z: 50}],
            f: [[0, 1, 2, 3, '#27ae60'], [1, 5, 6, 2, '#2ecc71'], [5, 4, 7, 6, '#1e8449'], [4, 0, 3, 7, '#229954'], [3, 2, 6, 7, '#52be80'], [8, 9, 10, 11, '#117a65'], [12, 13, 14, 15, '#111']]
        },
        boss: {
            v: [{x:0, y:0, z:120}, {x:-80, y:0, z:-40}, {x:80, y:0, z:-40}, {x:0, y:30, z:-20}, {x:0, y:-20, z:-40}, {x:-100, y:5, z:-60}, {x:100, y:5, z:-60}, {x:-40, y:10, z:-50}, {x:40, y:10, z:-50}],
            f: [[0,2,3,'#555'], [0,3,1,'#666'], [0,1,4,'#333'], [0,4,2,'#444'], [1,5,7,'#222'], [2,8,6,'#222'], [3,2,8,'#777'], [3,7,1,'#777']]
        }
    };

    // --- SISTEMA DE ÁUDIO ---
    const GameSfx = {
        ctx: null, engineSrc: null, ready: false,
        init: function() { if (this.ready) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.ready = true; } catch(e) {} },
        startEngine: function() {
            if (!this.ready || this.engineSrc || !this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < buf.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
            this.engineSrc = this.ctx.createBufferSource(); this.engineSrc.buffer = buf; this.engineSrc.loop = true;
            const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 350;
            const gain = this.ctx.createGain(); gain.gain.value = 0.2;
            this.engineSrc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
            this.engineSrc.start();
        },
        play: function(type) {
            if (type === 'lock') window.Sfx?.play(1200, 'square', 0.1, 0.1);
            else if (type === 'vulcan') window.Sfx?.play(150, 'sawtooth', 0.05, 0.2);
            else if (type === 'missile') {
                if(this.ctx) {
                    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
                    o.type='square'; o.frequency.setValueAtTime(100,t); o.frequency.linearRampToValueAtTime(1000,t+0.8);
                    g.gain.setValueAtTime(0.6,t); g.gain.exponentialRampToValueAtTime(0.01,t+1.5);
                    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+1.5);
                }
            }
            else if (type === 'boom') window.Sfx?.play(80, 'sawtooth', 0.5, 0.3);
            else if (type === 'alarm') window.Sfx?.play(600, 'square', 0.2, 0.1);
            else if (type === 'buy') window.Sfx?.play(1500, 'sine', 0.1, 0.2);
        },
        stop: function() { if (this.engineSrc) { try { this.engineSrc.stop(); } catch(e){} this.engineSrc = null; } }
    };

    // --- CORE DO JOGO V11 ---
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE', slowMo: 1.0, slowMoTimer: 0, 
        fpsHistory: [], perfTier: 'HIGH',
        money: 0,
        upgrades: { engine: 1, radar: 1, missile: 1, boost: 1, thermal: 1 },
        session: { kills: 0, goal: 30 },
        
        // --- 100% PURE ECS (ENTITY COMPONENT SYSTEM) ---
        entityIdCounter: 0,
        entities: {}, // NENHUM array paralelo. Tudo vive aqui.
        
        ship: { 
            hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0,
            pitchVel: 0, yawVel: 0, rollVel: 0, boost: 100, overheat: 0, gForce: 1.0,
            damage: { lWing: 0, rWing: 0, engine: 0, body: 0 }
        },
        pilot: { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handL: {x:0,y:0}, handR: {x:0,y:0}, isBoosting: false },
        timer: 4.0, hoverTime: 0, hoveredItem: null,
        
        combat: { targetId: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0, isJammed: false, hitChance: 0 },
        net: { isHost: false, uid: null, sessionRef: null, playersRef: null, loop: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false, stars: [] },
        cameraShake: 0,

        _spawn: function(type, components) {
            let id = type + '_' + this.entityIdCounter++;
            this.entities[id] = Object.assign({ id: id, type: type }, components);
            return id;
        },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, goal: 30 };
            this.fpsHistory = [];
            this.perfTier = 'HIGH';
            this.entityIdCounter = 0;
            this.entities = {}; 
            
            this.ship = { 
                hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0,
                pitchVel: 0, yawVel: 0, rollVel: 0, boost: 100, overheat: 0, gForce: 1.0,
                damage: { lWing: 0, rWing: 0, engine: 0, body: 0 }
            };
            this.pilot = { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handL: {x:0,y:0}, handR: {x:0,y:0}, isBoosting: false };
            this.combat = { targetId: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0, isJammed: false, hitChance: 0 };
            this.slowMo = 1.0; this.slowMoTimer = 0; this.cameraShake = 0;
            
            this._setupEnvironment();
            this._populateWorld();

            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random()*9999);
            this.mode = faseData?.mode || 'SINGLE';
            
            if (this.mode !== 'SINGLE' && window.DB) this._initNet();
            else { this.state = 'HANGAR'; } 
            GameSfx.init();
        },

        _setupEnvironment: function() {
            const hour = new Date().getHours();
            this.environment.stars = [];
            if (hour >= 6 && hour < 17) {
                this.environment.skyTop = '#0a3d62'; this.environment.skyBot = '#60a3bc'; this.environment.ground = '#386641'; this.environment.isNight = false;
            } else if (hour >= 17 && hour < 19) {
                this.environment.skyTop = '#2c2c54'; this.environment.skyBot = '#ff793f'; this.environment.ground = '#2d3436'; this.environment.isNight = false;
            } else {
                this.environment.skyTop = '#000000'; this.environment.skyBot = '#111122'; this.environment.ground = '#0a0a0a'; this.environment.isNight = true;
                for(let i=0; i<100; i++) this.environment.stars.push({x: Math.random()*2-1, y: Math.random(), z: Math.random()*2-1, size: Math.random()*2});
            }
        },

        _populateWorld: function() {
            let cloudCount = this.perfTier === 'LOW' ? 20 : (this.perfTier === 'MEDIUM' ? 40 : 60);
            for (let i = 0; i < cloudCount; i++) {
                this._spawn('cloud', { x: (Math.random()-0.5)*120000, y: 8000+Math.random()*15000, z: (Math.random()-0.5)*120000, size: 4000+Math.random()*8000 });
            }
            let terrainCount = this.perfTier === 'LOW' ? 30 : (this.perfTier === 'MEDIUM' ? 50 : 80);
            for (let i = 0; i < terrainCount; i++) {
                let c = this.environment.isNight ? `rgb(${Math.random()*30},${30+Math.random()*40},${Math.random()*30})` : `rgb(${50+Math.random()*50},${60+Math.random()*40},${40+Math.random()*30})`;
                this._spawn('terrain', { x: (Math.random()-0.5)*200000, z: (Math.random()-0.5)*200000, w: 2000 + Math.random()*4000, h: 500 + Math.random()*3000, c: c });
            }
        },

        _initNet: function() {
            this.state = 'LOBBY';
            this.net.sessionRef = window.DB.ref('br_army_sessions/aero_' + this.mode);
            this.net.playersRef = this.net.sessionRef.child('pilotos');
            this.net.playersRef.child(this.net.uid).onDisconnect().remove();
            
            this.net.sessionRef.child('host').once('value').then(snap => {
                if (!snap.val()) {
                    this.net.isHost = true; this.net.sessionRef.child('host').set(this.net.uid);
                    this.net.sessionRef.child('state').set('LOBBY'); this.net.playersRef.remove();
                }
                this.net.playersRef.child(this.net.uid).set({ name: window.Profile?.username || 'PILOTO', ready: false, hp: 100, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 });
            });
            
            // LERP SUAVE VIA ECS
            this.net.playersRef.on('value', snap => { 
                const data = snap.val() || {};
                for (let uid in data) {
                    if (uid === this.net.uid) continue;
                    let entId = 'net_' + uid;
                    if (!this.entities[entId]) {
                        this._spawn('net_player', { id: entId, uid: uid, ...data[uid], tx: data[uid].x, ty: data[uid].y, tz: data[uid].z, tpitch: data[uid].pitch, tyaw: data[uid].yaw, troll: data[uid].roll });
                    } else {
                        let p = this.entities[entId];
                        p.tx = data[uid].x; p.ty = data[uid].y; p.tz = data[uid].z;
                        p.tpitch = data[uid].pitch; p.tyaw = data[uid].yaw; p.troll = data[uid].roll;
                        p.hp = data[uid].hp; p.name = data[uid].name; p.ready = data[uid].ready;
                    }
                }
                for (let id in this.entities) {
                    if (this.entities[id].type === 'net_player' && !data[this.entities[id].uid]) delete this.entities[id];
                }
            });
            
            this.net.sessionRef.child('state').on('value', snap => {
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') { this.state = 'HANGAR'; }
            });
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let realDt = Math.min((now - this.lastTime) / 1000, 0.05);
            this.lastTime = now;
            
            this.fpsHistory.push(realDt);
            if(this.fpsHistory.length > 30) this.fpsHistory.shift();
            let avgDt = this.fpsHistory.reduce((a,b)=>a+b,0) / this.fpsHistory.length;
            let fps = 1 / avgDt;
            
            let oldTier = this.perfTier;
            if (fps >= 45) this.perfTier = 'HIGH'; else if (fps >= 25) this.perfTier = 'MEDIUM'; else this.perfTier = 'LOW';
            if (oldTier !== this.perfTier && this.state === 'PLAYING') this._adjustECSForTier();

            if(this.slowMoTimer > 0) { this.slowMoTimer -= realDt; this.slowMo = 0.3; } 
            else { this.slowMo = 1.0; }
            if (this.cameraShake > 0) this.cameraShake *= 0.9;
            
            const dt = realDt * this.slowMo;

            if (this.state === 'LOBBY') { this._drawLobby(ctx, w, h); return 0; }
            
            this._readPose(pose, w, h, dt);
            
            if (this.state === 'HANGAR') { this._drawHangar(ctx, w, h, realDt); return 0; }

            if (this.state === 'CALIBRATION') {
                this.timer -= realDt; this._drawCalib(ctx, w, h);
                if (this.timer <= 0) this._startMission(); return 0;
            }
            
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') { this._drawEnd(ctx, w, h); return this.money; }

            this._processPhysics(dt);
            this._processCombat(dt, w, h, now);
            this._processECS(dt, now); 

            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');

            this._draw(ctx, w, h);
            return this.money;
        },

        cleanup: function() {
            GameSfx.stop();
            if (this.net.loop) clearInterval(this.net.loop);
            if (this.mode !== 'SINGLE' && this.net.playersRef) {
                this.net.playersRef.off(); this.net.sessionRef?.child('state')?.off();
                this.net.playersRef.child(this.net.uid)?.remove();
                if (this.net.isHost) this.net.sessionRef?.remove();
            }
        },

        _adjustECSForTier: function() {
            let limit = this.perfTier === 'LOW' ? 20 : (this.perfTier === 'MEDIUM' ? 40 : 60);
            let current = 0;
            for(let id in this.entities) {
                if (this.entities[id].type === 'cloud' || this.entities[id].type === 'terrain') {
                    current++;
                    if (current > limit) delete this.entities[id];
                }
            }
        },

        _drawHangar: function(ctx, w, h, dt) {
            ctx.fillStyle = 'rgba(15, 20, 25, 0.98)'; ctx.fillRect(0, 0, w, h);
            const fz = Math.min(w * 0.04, 20);
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'center'; ctx.font = `bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('HANGAR - UPGRADES', w/2, h*0.1);
            ctx.fillStyle = '#2ecc71'; ctx.fillText(`SALDO: R$ ${this.money}`, w/2, h*0.18);

            const items = [
                { id: 'engine', name: 'MOTOR TURBO', cost: this.upgrades.engine * 500, lvl: this.upgrades.engine, max: 5, y: h*0.3 },
                { id: 'radar', name: 'RADAR LOCK', cost: this.upgrades.radar * 400, lvl: this.upgrades.radar, max: 5, y: h*0.42 },
                { id: 'missile', name: 'MÍSSIL AGIL', cost: this.upgrades.missile * 600, lvl: this.upgrades.missile, max: 5, y: h*0.54 },
                { id: 'thermal', name: 'RESIST. TÉRMICA', cost: this.upgrades.thermal * 300, lvl: this.upgrades.thermal, max: 5, y: h*0.66 },
                { id: 'start', name: '>> INICIAR MISSÃO <<', cost: 0, lvl: 0, max: 0, y: h*0.85, isBtn: true }
            ];

            let isHoveringAny = false;

            items.forEach(item => {
                let rect = { x: w*0.1, y: item.y - h*0.04, w: w*0.8, h: h*0.08 };
                ctx.fillStyle = '#2c3e50'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
                
                let hx = this.pilot.handR.x, hy = this.pilot.handR.y;
                if (this.pilot.active && hx > rect.x && hx < rect.x + rect.w && hy > rect.y && hy < rect.y + rect.h) {
                    ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 3; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
                    isHoveringAny = true;
                    if (this.hoveredItem !== item.id) { this.hoveredItem = item.id; this.hoverTime = 0; }
                    this.hoverTime += dt;

                    ctx.fillStyle = 'rgba(0, 255, 204, 0.3)';
                    ctx.fillRect(rect.x, rect.y, rect.w * Math.min(1, this.hoverTime / 1.5), rect.h);

                    if (this.hoverTime >= 1.5) {
                        if (item.isBtn) { this.state = 'CALIBRATION'; this.timer = 4.0; GameSfx.play('buy'); }
                        else if (this.money >= item.cost && this.upgrades[item.id] < item.max) {
                            this.money -= item.cost;
                            this.upgrades[item.id]++; GameSfx.play('buy'); this.hoverTime = 0; 
                        } else {
                            GameSfx.play('alarm'); this.hoverTime = 0;
                        }
                    }
                }

                ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `bold ${fz}px Arial`;
                if (item.isBtn) {
                    ctx.textAlign = 'center'; ctx.fillStyle = '#e74c3c';
                    ctx.fillText(item.name, w/2, item.y + fz*0.3);
                } else {
                    ctx.fillText(`${item.name} (LVL ${item.lvl}/${item.max})`, rect.x + 20, item.y + fz*0.3);
                    ctx.textAlign = 'right';
                    ctx.fillStyle = (this.money >= item.cost && item.lvl < item.max) ? '#f1c40f' : '#7f8c8d';
                    ctx.fillText(item.lvl >= item.max ? 'MÁXIMO' : `R$ ${item.cost}`, rect.x + rect.w - 20, item.y + fz*0.3);
                }
            });

            if (!isHoveringAny) this.hoverTime = 0;

            if (this.pilot.active) {
                ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(this.pilot.handR.x, this.pilot.handR.y, 15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `bold 12px Arial`; ctx.fillText("CURSOR", this.pilot.handR.x, this.pilot.handR.y - 20);
            }
        },

        // --- FÍSICA AERODINÂMICA REAL (AOA, LIFT QUADRÁTICO, DRAG) ---
        _processPhysics: function(dt) {
            let yawDamping = 0.92, pitchDamping = 0.90, rollDamping = 0.88;
            let wingDmgRatio = (this.ship.damage.rWing - this.ship.damage.lWing) * 0.05;
            let controlLoss = Math.max(0.3, 1.0 - (this.ship.damage.body + this.ship.damage.engine) / 200);
            
            this.ship.rollVel += ((this.pilot.targetRoll - this.ship.roll) * 15 * controlLoss * dt) + (wingDmgRatio * dt);
            this.ship.pitchVel += (this.pilot.targetPitch - this.ship.pitch) * 10 * controlLoss * dt;
            this.ship.yawVel += (this.ship.rollVel * 0.5) * dt; 

            this.ship.rollVel *= rollDamping;
            this.ship.pitchVel *= pitchDamping;
            this.ship.yawVel *= yawDamping;

            this.ship.roll += this.ship.rollVel * dt;
            this.ship.pitch += this.ship.pitchVel * dt;
            this.ship.yaw += this.ship.yawVel * dt;
            this.ship.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.ship.pitch));
            
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            // FÍSICA REAL: Velocidade, AoA, Lift e Drag
            let speedSq = this.ship.speed * this.ship.speed;
            let aoa = Math.abs(this.ship.pitchVel) * 10; 
            
            // Lift = k * v^2 * (fator de ângulo de ataque)
            let lift = 0.00005 * speedSq * Math.max(0, 1 - aoa * 0.2);
            // Drag dependente de AoA
            let drag = (0.0001 + 0.005 * aoa) * speedSq;
            
            // G-Force baseada em variação angular real e velocidade
            this.ship.gForce = 1 + ((this.ship.pitchVel * this.ship.speed) / 600);
            if (Math.abs(this.ship.gForce) > 6) {
                this.cameraShake = Math.max(this.cameraShake, Math.abs(this.ship.gForce) - 5);
                window.Gfx?.shakeScreen(this.cameraShake);
            }

            let maxSpeed = 3500 + (this.upgrades.engine * 500) - (this.ship.damage.engine * 20);
            
            this.ship.speed += (fY * -600 * dt); // Gravidade puxa em mergulho
            
            if (this.pilot.isBoosting && this.ship.boost > 0) {
                this.ship.speed += 2500 * dt;
                this.ship.boost -= (50 / this.upgrades.boost) * dt;
                Engine3D.fov += (1000 - Engine3D.fov) * dt * 5; 
            } else {
                this.ship.boost = Math.min(100, this.ship.boost + 15 * dt);
                Engine3D.fov += (800 - Engine3D.fov) * dt * 5;
            }

            this.ship.speed -= drag * dt;
            this.ship.speed = Math.max(600, Math.min(maxSpeed * (this.pilot.isBoosting? 1.5 : 1), this.ship.speed));

            // Dano Estrutural: Velocidade alta + mergulho extremo + G excessivo
            if (this.ship.speed > 4000 && fY < -0.5 && Math.abs(this.ship.gForce) > 7) {
                this.ship.damage.body += 15 * dt;
                window.Gfx?.shakeScreen(8);
                if (Math.random() < 0.2) GameSfx.play('alarm');
            }

            // Perda de sustentação progressiva (Stall)
            let pitchDeg = Math.abs(this.ship.pitch * 180 / Math.PI);
            if (this.ship.speed < 900 && pitchDeg > 25) {
                this.ship.pitchVel -= 2.5 * dt; 
                window.Gfx?.shakeScreen(4);
                if (Math.random() < 0.1) GameSfx.play('alarm');
            }

            let units = this.ship.speed * 20;
            this.ship.x += units * fX * dt; this.ship.y += units * fY * dt; this.ship.z += units * fZ * dt;
            
            // Fumaça Progressiva
            let totalDmg = this.ship.damage.body + this.ship.damage.engine;
            if (totalDmg > 30 && this.perfTier !== 'LOW') {
                let sCol = totalDmg > 70 ? (Math.random()>0.5?'#e74c3c':'#333') : 'rgba(80,80,80,0.6)';
                let sSize = totalDmg > 70 ? 400 : 200;
                this._spawn('fx', {x: this.ship.x, y: this.ship.y, z: this.ship.z, vx: 0, vy: 0, vz: 0, life: 2.0, c: sCol, size: sSize});
            }
        },

        _readPose: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false;
            this.pilot.headTilt = false; this.pilot.isBoosting = false;
            
            if (pose?.keypoints) {
                const kp = name => pose.keypoints.find(k => k.part === name || k.name === name);
                const rw = kp('right_wrist'), lw = kp('left_wrist');
                const rs = kp('right_shoulder'), ls = kp('left_shoulder');
                const rEar = kp('right_ear'), lEar = kp('left_ear');
                
                const pX = x => w - ((x / 640) * w); 
                const pY = y => (y / 480) * h;
                
                if (rEar?.score > 0.4 && lEar?.score > 0.4 && Math.abs(pY(rEar.y) - pY(lEar.y)) > h * 0.05) {
                    this.pilot.headTilt = true;
                }
                
                if (rw?.score > 0.3 && lw?.score > 0.3 && rs?.score > 0.3 && ls?.score > 0.3) {
                    inputDetected = true;
                    
                    let w1 = { x: pX(rw.x), y: pY(rw.y) }; let w2 = { x: pX(lw.x), y: pY(lw.y) };
                    this.pilot.handR = { x: pX(rw.x), y: pY(rw.y) }; 
                    this.pilot.handL = { x: pX(lw.x), y: pY(lw.y) };
                    
                    let hands = [w1, w2].sort((a,b) => a.x - b.x);
                    let imgLeftHand = hands[0]; let imgRightHand = hands[1]; 
                    
                    let dy = imgRightHand.y - imgLeftHand.y; 
                    let dx = imgRightHand.x - imgLeftHand.x;
                    trgRoll = Math.atan2(dy, dx);
                    trgRoll = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, trgRoll));
                    
                    let avgShoulderY = (pY(rs.y) + pY(ls.y)) / 2;
                    let avgWristY = (imgLeftHand.y + imgRightHand.y) / 2;
                    
                    let deltaY = avgWristY - avgShoulderY;
                    let deadzone = h * 0.05; 
                    
                    if (deltaY < -deadzone) trgPitch = 1.0; 
                    else if (deltaY > deadzone) trgPitch = -1.0; 
                    else trgPitch = 0; 
                    
                    if (Math.abs(dx) < w * 0.15) this.pilot.isBoosting = true;
                }
            }
            
            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll = trgRoll;
                this.pilot.targetPitch = trgPitch;
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll = 0; this.pilot.targetPitch = 0;
            }
        },

        // --- LOCK-ON AVANÇADO MULTIFATORIAL ---
        _processCombat: function(dt, w, h, now) {
            let radarRange = 100000 + (this.upgrades.radar * 20000);
            
            let currentTarget = this.combat.targetId ? this.entities[this.combat.targetId] : null;
            if (currentTarget && currentTarget.hp <= 0) currentTarget = null;

            if (currentTarget) {
                let dx = currentTarget.x - this.ship.x, dy = currentTarget.y - this.ship.y, dz = currentTarget.z - this.ship.z;
                let dist = Math.hypot(dx, dy, dz);
                let p = Engine3D.project(currentTarget.x, currentTarget.y, currentTarget.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                
                if (!p.visible || dist > radarRange || Math.abs(p.x - w/2) > w*0.45 || Math.abs(p.y - h/2) > h*0.45) {
                    this.combat.locked = false; this.combat.lockTimer = 0; this.combat.targetId = null; currentTarget = null;
                } else {
                    // Cálculo Probabilístico de Chance de Acerto
                    let distPenalty = (dist / radarRange) * 30;
                    let anglePenalty = (Math.abs(p.x - w/2) / (w/2)) * 30;
                    let relSpeedPenalty = Math.abs(this.ship.speed - (currentTarget.speed || 0)) / 1000 * 10;
                    let gForcePenalty = Math.abs(this.ship.gForce - 1) * 5;
                    let evadePenalty = (currentTarget.aiState === 'EVADE') ? 40 : 0;
                    
                    this.combat.hitChance = Math.max(0, Math.min(100, 100 - distPenalty - anglePenalty - relSpeedPenalty - gForcePenalty - evadePenalty));
                }
            }

            if (!currentTarget) {
                this.combat.hitChance = 0;
                let closestZ = Infinity;
                for (let id in this.entities) {
                    let e = this.entities[id];
                    if (e.type.startsWith('enemy') || e.type === 'boss' || e.type === 'net_player') {
                        let p = Engine3D.project(e.x, e.y, e.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                        if (p.visible && p.z > 500 && p.z < radarRange && Math.abs(p.x - w/2) < w*0.35 && Math.abs(p.y - h/2) < h*0.35 && p.z < closestZ) {
                            closestZ = p.z; this.combat.targetId = e.id; currentTarget = e;
                        }
                    }
                }
            }

            if (currentTarget) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.4) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true; this.combat.lockTimer = 0.4;
                }
            } else {
                this.combat.lockTimer -= dt * 3; if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }

            if (this.combat.isJammed) {
                this.ship.overheat -= 30 * dt;
                if (this.ship.overheat <= 20) { this.combat.isJammed = false; GameSfx.play('beep'); }
            }

            if (this.combat.locked && currentTarget && !this.combat.isJammed && now - this.combat.vulcanCd > 120) {
                this.combat.vulcanCd = now;
                this.ship.overheat += (15 / this.upgrades.thermal);
                if (this.ship.overheat >= 100) { this.ship.overheat = 100; this.combat.isJammed = true; GameSfx.play('alarm'); }

                let spd = this.ship.speed * 20 + 45000;
                let dx = currentTarget.x - this.ship.x, dy = currentTarget.y - this.ship.y, dz = currentTarget.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                dx += (Math.random()-0.5)*1500; dy += (Math.random()-0.5)*1500;
                
                this._spawn('bullet', { x: this.ship.x, y: this.ship.y-30, z: this.ship.z, vx: dx/dist*spd, vy: dy/dist*spd, vz: dz/dist*spd, isEnemy: false, life: 2.5, c: '#ffff00', size: 250, tracer: true });
                GameSfx.play('vulcan'); window.Gfx?.shakeScreen(1);
            } else if (!this.combat.locked && !this.combat.isJammed) {
                this.ship.overheat = Math.max(0, this.ship.overheat - 10 * dt);
            }

            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0 && this.combat.targetId) {
                this.combat.missileCd = 1.5;
                let mSpd = this.ship.speed * 15 + 10000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fY = Math.sin(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                
                this._spawn('missile', {
                    x: this.ship.x, y: this.ship.y-100, z: this.ship.z,
                    vx: fX*mSpd + (Math.random()-0.5)*5000, vy: fY*mSpd - 2000, vz: fZ*mSpd + (Math.random()-0.5)*5000,
                    targetId: this.combat.targetId,
                    isPlayer: currentTarget.type === 'net_player',
                    life: 8, speed: mSpd
                });
                GameSfx.play('missile'); window.Gfx?.shakeScreen(5);
            }
        },

        // --- CORE ECS LOOP ---
        _processECS: function(dt, now) {
            // Spawn dinâmico de inimigos
            let enemyCount = 0;
            for(let id in this.entities) if(this.entities[id].type.startsWith('enemy') || this.entities[id].type === 'boss') enemyCount++;
            let maxEnemies = this.perfTier === 'LOW' ? 4 : 8;
            
            if (enemyCount < maxEnemies && Math.random() < 0.02) {
                let dist = 60000 + Math.random()*30000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                let sx = this.ship.x + fX*dist + (Math.random()-0.5)*50000, sz = this.ship.z + fZ*dist + (Math.random()-0.5)*50000;
                
                let r = Math.random();
                if (this.session.kills > 10 && r < 0.1 && !Object.values(this.entities).find(e => e.type === 'boss')) {
                    this._spawn('boss', { x: sx, y: 30000, z: sz, speed: 12000, hp: 3000, maxHp: 3000, yaw: this.ship.yaw + Math.PI, aiState: 'ENGAGE', phase: 1, timer: 0, weakPoints: { left: 800, right: 800, core: 1400 } });
                    window.System?.msg("FORTALEZA VOADORA DETECTADA!");
                } else if (r < 0.3) {
                    this._spawn('enemy_squadron_lead', { x: sx, y: this.ship.y, z: sz, hp: 200, maxHp: 200, yaw: this.ship.yaw + Math.PI, aiState: 'PATROL', timer: 0, speed: 20000 });
                    this._spawn('enemy_squadron_wing', { x: sx+5000, y: this.ship.y+2000, z: sz, hp: 150, maxHp: 150, yaw: this.ship.yaw + Math.PI, aiState: 'FLANK', timer: 0, speed: 22000 });
                } else if (r < 0.6) {
                    this._spawn('enemy_interceptor', { x: sx, y: this.ship.y, z: sz, hp: 250, maxHp: 250, yaw: this.ship.yaw, aiState: 'PATROL', timer: 0, speed: 25000 });
                } else if (r < 0.8) {
                    this._spawn('enemy_evasive', { x: sx, y: this.ship.y, z: sz, hp: 150, maxHp: 150, yaw: this.ship.yaw + Math.PI, aiState: 'PATROL', timer: 0, speed: 28000 });
                } else {
                    this._spawn('enemy_tank', { x: sx, y: 0, z: sz, hp: 400, maxHp: 400, yaw: Math.random()*Math.PI*2, aiState: 'PATROL', timer: 0, speed: 0 });
                }
            }

            // Listas para colisão
            let bullets = []; let targets = [];
            
            // Loop Único do ECS
            for (let id in this.entities) {
                let e = this.entities[id];
                
                if (e.type === 'cloud' || e.type === 'terrain') {
                    if (Math.hypot(e.x-this.ship.x, e.z-this.ship.z) > 150000) {
                        let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                        e.z = this.ship.z + fZ*120000 + (Math.random()-0.5)*80000; e.x = this.ship.x + fX*120000 + (Math.random()-0.5)*80000;
                    }
                }
                else if (e.type === 'floater') {
                    e.life -= dt; e.y -= 120*dt;
                    if(e.life <= 0) delete this.entities[id];
                }
                else if (e.type === 'fx') {
                    e.x += e.vx*dt; e.y += e.vy*dt; e.z += e.vz*dt; e.life -= dt;
                    if(e.life <= 0) delete this.entities[id];
                }
                else if (e.type === 'net_player') {
                    if (e.tx !== undefined) {
                        e.x += (e.tx - e.x) * dt * 10; e.y += (e.ty - e.y) * dt * 10; e.z += (e.tz - e.z) * dt * 10;
                        e.pitch += (e.tpitch - e.pitch) * dt * 10; e.yaw += (e.tyaw - e.yaw) * dt * 10; e.roll += (e.troll - e.roll) * dt * 10;
                    }
                    targets.push(e);
                }
                else if (e.type === 'bullet') {
                    e.x += e.vx*dt; e.y += e.vy*dt; e.z += e.vz*dt; e.life -= dt;
                    if (e.life <= 0 || e.y < 0) { 
                        if(e.y < 0 && this.perfTier !== 'LOW') this._spawn('fx', {x:e.x, y:0, z:e.z, vx:0, vy:0, vz:0, life:1.0, c:'#789', size:100});
                        delete this.entities[id]; 
                    } else {
                        bullets.push(e);
                        if (this.perfTier === 'HIGH' || Math.random() < 0.5) this._spawn('fx', {x:e.x, y:e.y, z:e.z, vx:0, vy:0, vz:0, life:0.1, c: e.isEnemy?'#ff3300':'#ffff00', size: 250, tracer: true});
                    }
                }
                else if (e.type === 'missile') {
                    e.speed += 20000 * dt; 
                    let activeTarget = this.entities[e.targetId];
                    if (!activeTarget || activeTarget.hp <= 0) {
                        e.life = 0; delete this.entities[id];
                        if(this.perfTier !== 'LOW') this._spawn('fx', {x:e.x, y:e.y, z:e.z, vx:0, vy:0, vz:0, life:1.5, c:'rgba(100,100,100,0.5)', size: 400});
                        continue;
                    }
                    let dx = activeTarget.x - e.x, dy = activeTarget.y - e.y, dz = activeTarget.z - e.z;
                    let d = Math.hypot(dx,dy,dz);
                    let turn = (50000 + (this.upgrades.missile * 10000)) * dt; 
                    e.vx += (dx/d)*turn; e.vy += (dy/d)*turn; e.vz += (dz/d)*turn;
                    let velD = Math.hypot(e.vx, e.vy, e.vz);
                    if(velD > e.speed) { e.vx = (e.vx/velD)*e.speed; e.vy = (e.vy/velD)*e.speed; e.vz = (e.vz/velD)*e.speed; }
                    
                    let hitbox = activeTarget.type === 'boss' ? 9000 : 3000;
                    if (d < hitbox) {
                        if (activeTarget.type === 'net_player' && this.mode === 'PVP') {
                            window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${activeTarget.uid}/hp`).set(activeTarget.hp-60);
                            this._spawn('fx', {x:activeTarget.x, y:activeTarget.y, z:activeTarget.z, vx:0, vy:0, vz:0, life:2.0, c:'#f33', size:400}); this.money += 800;
                        } else if (activeTarget.type !== 'net_player') {
                            this._applyDamageToEnemy(activeTarget, 500);
                        }
                        e.life = 0; delete this.entities[id]; GameSfx.play('boom'); window.Gfx?.shakeScreen(5);
                        continue;
                    }
                    e.x += e.vx*dt; e.y += e.vy*dt; e.z += e.vz*dt; e.life -= dt;
                    if(e.y < 0) { e.life = 0; delete this.entities[id]; this._spawn('fx', {x:e.x, y:0, z:e.z, vx:0, vy:0, vz:0, life:2.0, c:'#a55', size:200}); continue; }
                    if (this.perfTier === 'HIGH' || Math.random() < 0.5) this._spawn('fx', {x:e.x, y:e.y, z:e.z, vx:(Math.random()-0.5)*300, vy:(Math.random()-0.5)*300, vz:(Math.random()-0.5)*300, life: 1.5, c:'rgba(220,220,220,0.6)', size: 500}); 
                }
                else if (e.type.startsWith('enemy') || e.type === 'boss') {
                    targets.push(e);
                    let dx = this.ship.x - e.x, dy = this.ship.y - e.y, dz = this.ship.z - e.z;
                    let distToPlayer = Math.hypot(dx, dy, dz);
                    
                    if (distToPlayer > 200000) { delete this.entities[id]; continue; }

                    if (e.type === 'enemy_tank') {
                        if (distToPlayer < 40000 && Math.random() < 0.04) {
                            this._spawn('bullet', { x: e.x, y: e.y, z: e.z, vx: (dx)/distToPlayer*18000, vy: (dy)/distToPlayer*18000, vz: (dz)/distToPlayer*18000, isEnemy: true, life: 4.0 });
                        }
                        continue; 
                    }

                    // AI de Energia
                    let energy = e.y + (e.speed * 0.5);
                    let incomingMissile = false; // Busca se há missil vindo
                    for(let mid in this.entities) if(this.entities[mid].type === 'missile' && this.entities[mid].targetId === id) incomingMissile = true;
                    
                    if (e.type !== 'boss') {
                        if (energy < 5000) e.aiState = 'STALL_RECOVER';
                        else if (incomingMissile) e.aiState = 'EVADE';
                        else if (e.hp < e.maxHp * 0.3) e.aiState = 'RETREAT';
                        else if (e.aiState === 'STALL_RECOVER' || e.aiState === 'EVADE') e.aiState = 'ENGAGE';
                    }

                    if (e.aiState === 'STALL_RECOVER') {
                        e.y -= 15000 * dt; e.speed += 5000 * dt;
                        e.x += Math.sin(e.yaw) * e.speed * dt; e.z += Math.cos(e.yaw) * e.speed * dt;
                    }
                    else if (e.aiState === 'EVADE') {
                        e.yaw += Math.PI * dt; e.x += Math.sin(e.yaw) * e.speed * 1.5 * dt; e.z += Math.cos(e.yaw) * e.speed * 1.5 * dt; e.y += (Math.random() - 0.5) * 20000 * dt;
                        if (Math.random() < 0.1 && this.perfTier !== 'LOW') this._spawn('fx', {x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, life: 1.0, c: '#f1c40f', size: 200});
                    }
                    else if (e.aiState === 'RETREAT') {
                        e.yaw = this.ship.yaw; e.x += Math.sin(e.yaw) * e.speed * 1.2 * dt; e.z += Math.cos(e.yaw) * e.speed * 1.2 * dt; e.y += 10000 * dt;
                    }
                    else if (e.aiState === 'FLANK') {
                        e.yaw += ((this.ship.yaw + Math.PI/2) - e.yaw) * dt;
                        e.x += Math.sin(e.yaw) * e.speed * dt; e.z += Math.cos(e.yaw) * e.speed * dt;
                    }
                    else {
                        if (e.type === 'enemy_interceptor') {
                            let estTime = distToPlayer / e.speed; 
                            let pVelX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch) * this.ship.speed * 20;
                            let pVelZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch) * this.ship.speed * 20;
                            e.yaw = Math.atan2((this.ship.x + pVelX * estTime) - e.x, (this.ship.z + pVelZ * estTime) - e.z);
                            e.y += ((this.ship.y + Math.sin(this.ship.pitch) * this.ship.speed * 20 * estTime) - e.y) * 0.5 * dt;
                        } else if (e.type === 'boss') {
                            e.yaw = Math.atan2(dx, dz);
                        } else {
                            e.yaw = Math.atan2(dx, dz);
                        }
                        e.x += Math.sin(e.yaw) * e.speed * dt; e.z += Math.cos(e.yaw) * e.speed * dt;
                    }

                    if (e.type === 'boss') {
                        if (e.phase === 1 && e.hp < e.maxHp * 0.66) { e.phase = 2; window.System?.msg("BOSS: MODO AGRESSIVO!"); e.speed = 18000; }
                        if (e.phase === 2 && e.hp < e.maxHp * 0.33) { e.phase = 3; window.System?.msg("BOSS: NÚCLEO EXPOSTO!"); e.speed = 25000; }

                        if(e.y < 15000) e.y += 5000*dt;
                        
                        if (e.phase === 3) {
                            e.yaw += (Math.random() - 0.5) * 3 * dt; 
                            e.x += Math.sin(now * 0.005) * 10000 * dt; 
                            if (Math.random() < 0.1) this._spawn('fx', {x: e.x + (Math.random()-0.5)*200, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, life: 1.0, c: '#e74c3c', size: 300});
                        }

                        e.timer += dt;
                        let fireRate = e.phase === 3 ? 0.3 : (e.phase === 2 ? 0.8 : 1.5);
                        if (e.timer > fireRate && distToPlayer < 70000) {
                            e.timer = 0; let bSpd = 45000;
                            if (e.weakPoints.left > 0) {
                                let cx = e.x + Math.cos(e.yaw) * 120, cz = e.z - Math.sin(e.yaw) * 120;
                                this._spawn('bullet', { x: cx, y: e.y, z: cz, vx: (this.ship.x - cx)/distToPlayer*bSpd, vy: (this.ship.y - e.y)/distToPlayer*bSpd, vz: (this.ship.z - cz)/distToPlayer*bSpd, isEnemy: true, life: 4.0 });
                            }
                            if (e.weakPoints.right > 0) {
                                let cx = e.x - Math.cos(e.yaw) * 120, cz = e.z + Math.sin(e.yaw) * 120;
                                this._spawn('bullet', { x: cx, y: e.y, z: cz, vx: (this.ship.x - cx)/distToPlayer*bSpd, vy: (this.ship.y - e.y)/distToPlayer*bSpd, vz: (this.ship.z - cz)/distToPlayer*bSpd, isEnemy: true, life: 4.0 });
                            }
                            if (e.phase >= 2 && e.weakPoints.core > 0) {
                                this._spawn('bullet', { x: e.x, y: e.y+50, z: e.z, vx: dx/distToPlayer*bSpd, vy: dy/distToPlayer*bSpd, vz: dz/distToPlayer*bSpd, isEnemy: true, life: 4.0 });
                            }
                        }
                    }

                    if (e.type !== 'boss' && e.aiState === 'ENGAGE' && distToPlayer < 40000 && Math.random() < 0.05) {
                        this._spawn('bullet', { x: e.x, y: e.y, z: e.z, vx: dx/distToPlayer*35000, vy: dy/distToPlayer*35000, vz: dz/distToPlayer*35000, isEnemy: true, life: 4.0 });
                    }
                }
            }

            // Colisões Bullet x Player/Enemies
            for (let b of bullets) {
                if (!this.entities[b.id]) continue; 
                if (b.isEnemy) {
                    if (Math.hypot(b.x-this.ship.x, b.y-this.ship.y, b.z-this.ship.z) < 1500) {
                        this._takeDamage(10); delete this.entities[b.id];
                    }
                } else {
                    for (let t of targets) {
                        let hitbox = t.type === 'boss' ? 8000 : 2500;
                        if (Math.hypot(b.x-t.x, b.y-t.y, b.z-t.z) < hitbox) { 
                            delete this.entities[b.id]; this._spawn('fx', {x:t.x,y:t.y,z:t.z,vx:0,vy:0,vz:0,life:1.0,c:'#f90',size:100});
                            if (t.type === 'net_player' && this.mode === 'PVP' && this.net.isHost) {
                                window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${t.uid}/hp`).set(t.hp-10);
                            } else if (t.type !== 'net_player') {
                                this._applyDamageToEnemy(t, 35);
                            }
                            break;
                        }
                    }
                }
            }
        },

        _applyDamageToEnemy: function(e, amount) {
            if (e.type === 'boss') {
                if (e.weakPoints.left > 0) { e.weakPoints.left -= amount; this._spawn('fx', {x:e.x+100, y:e.y, z:e.z, vx:0, vy:0, vz:0, life:1.5, c:'#ff3300', size:300}); }
                else if (e.weakPoints.right > 0) { e.weakPoints.right -= amount; this._spawn('fx', {x:e.x-100, y:e.y, z:e.z, vx:0, vy:0, vz:0, life:1.5, c:'#ff3300', size:300}); }
                else { e.weakPoints.core -= amount; this._spawn('fx', {x:e.x, y:e.y, z:e.z, vx:0, vy:0, vz:0, life:2.0, c:'#3498db', size:500}); }
                e.hp -= amount; 
            } else {
                e.hp -= amount;
            }
            if (e.hp <= 0) this._kill(e);
        },

        _kill: function(t) {
            let isBoss = t.type === 'boss';
            let rew = isBoss ? 2500 : (t.type === 'enemy_tank' ? 300 : 200);
            
            GameSfx.play('boom');
            this.cameraShake = isBoss ? 40 : 10;
            window.Gfx?.shakeScreen(this.cameraShake);
            
            this._spawn('fx', {x:t.x,y:t.y,z:t.z,vx:0,vy:0,vz:0,life:2.0,c:'#ff3300',size:isBoss?1500:400});
            this._spawn('fx', {x:t.x,y:t.y,z:t.z,vx:0,vy:0,vz:0,life:2.5,c:'#f1c40f',size:isBoss?2000:600});
            
            if (isBoss) {
                let expTimer = setInterval(() => {
                    if(this.state !== 'PLAYING') clearInterval(expTimer);
                    this._spawn('fx', {x:t.x + (Math.random()-0.5)*5000, y:t.y + (Math.random()-0.5)*5000, z:t.z + (Math.random()-0.5)*5000, vx:0,vy:0,vz:0,life:2.0,c:'#ff3300',size:800});
                    GameSfx.play('boom');
                }, 400);
                setTimeout(() => clearInterval(expTimer), 3500);
            }

            this._spawn('floater', {x:t.x,y:t.y,z:t.z,text:`+ R$${rew}`,life:2.5});
            this.session.kills++; this.money += rew;
            this.slowMoTimer = isBoss ? 4.0 : 1.0;
            delete this.entities[t.id];

            if (this.session.kills >= this.session.goal && this.mode==='SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res; GameSfx.stop();
            setTimeout(() => {
                if (window.System?.gameOver) window.System.gameOver(this.session.kills*150, res==='VICTORY', this.money);
                else if (window.System?.home) window.System.home();
            }, 4000);
        },

        _startMission: function() {
            this.state = 'PLAYING'; this.ship.x = (Math.random()-0.5)*10000; this.ship.z = (Math.random()-0.5)*10000;
            GameSfx.startEngine();
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(() => {
                    if (this.state === 'PLAYING' && this.net.playersRef) {
                        this.net.playersRef.child(this.net.uid).update({ x: this.ship.x, y: this.ship.y, z: this.ship.z, pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp });
                    }
                }, 100);
            }
        },

        _draw: function(ctx, w, h) {
            ctx.save();
            if (this.cameraShake > 0.5) ctx.translate((Math.random()-0.5)*this.cameraShake, (Math.random()-0.5)*this.cameraShake);
            
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            
            this._drawYoke(ctx, w, h);
            this._drawHUD(ctx,w,h); 
            ctx.restore();
            
            ctx.fillStyle='rgba(0,0,0,0.15)'; for(let i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
            
            if (this.ship.speed > 2500 || this.pilot.isBoosting || this.ship.gForce > 5) {
                let vGrad = ctx.createRadialGradient(w/2, h/2, h*0.4, w/2, h/2, h);
                vGrad.addColorStop(0, 'transparent'); 
                vGrad.addColorStop(1, this.ship.gForce > 5 ? 'rgba(150,0,0,0.6)' : 'rgba(0,0,0,0.7)'); 
                ctx.fillStyle = vGrad; ctx.fillRect(0,0,w,h);
            }
        },

        _drawWorld: function(ctx,w,h) {
            ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(-this.ship.roll);
            let hy = Math.sin(this.ship.pitch) * h * 1.5;
            
            let sG = ctx.createLinearGradient(0,-h*4,0,hy);
            sG.addColorStop(0, this.environment.skyTop); sG.addColorStop(1, this.environment.skyBot);
            ctx.fillStyle = sG; ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
            
            if (this.environment.isNight) {
                ctx.fillStyle = "rgba(255,255,255,0.8)";
                this.environment.stars.forEach((s, idx) => { 
                    if(this.perfTier === 'LOW' && idx % 3 !== 0) return;
                    ctx.beginPath(); ctx.arc(s.x*w*2, s.y*(-h*4), s.size, 0, Math.PI*2); ctx.fill(); 
                });
            }

            let gG = ctx.createLinearGradient(0,hy,0,h*4);
            gG.addColorStop(0, this.environment.isNight ? '#050505' : '#1e3020'); gG.addColorStop(1, this.environment.ground);
            ctx.fillStyle = gG; ctx.fillRect(-w*3,hy,w*6,h*4);
            ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1;
            ctx.beginPath(); ctx.moveTo(-w*3,hy); ctx.lineTo(w*3,hy); ctx.stroke();
            ctx.restore();
        },

        _drawMesh: function(ctx, meshData, obj, w, h) {
            let scale = obj.type === 'boss' ? 200 : (obj.type === 'enemy_tank' ? 80 : 60); 
            let projectedFaces = [];

            for (let face of meshData.f) {
                let color = face[face.length - 1]; 
                let pts = []; let zSum = 0; let visible = true;

                for (let i = 0; i < face.length - 1; i++) {
                    let v = meshData.v[face[i]];
                    let wPos = Engine3D.rotate(v.x * scale, v.y * scale, v.z * scale, 0, obj.yaw, 0);
                    wPos.x += obj.x; wPos.y += obj.y; wPos.z += obj.z;
                    
                    let p = Engine3D.project(wPos.x, wPos.y, wPos.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (!p.visible) visible = false;
                    pts.push(p); zSum += p.z;
                }

                if (visible) projectedFaces.push({ pts: pts, z: zSum / (face.length - 1), color: color });
            }

            projectedFaces.sort((a, b) => b.z - a.z);

            for (let pf of projectedFaces) {
                ctx.fillStyle = pf.color; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(pf.pts[0].x, pf.pts[0].y);
                for (let i = 1; i < pf.pts.length; i++) ctx.lineTo(pf.pts[i].x, pf.pts[i].y);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }

            if (obj.hp < obj.maxHp * 0.5 && this.perfTier !== 'LOW') {
                let sCol = obj.hp < obj.maxHp * 0.2 ? '#e74c3c' : 'rgba(80,80,80,0.6)';
                this._spawn('fx', {x: obj.x, y: obj.y, z: obj.z, vx: 0, vy: 0, vz: 0, life: 0.5, c: sCol, size: scale*3});
            }
        },

        _drawEntities: function(ctx,w,h) {
            let buf=[];
            
            for(let id in this.entities) {
                let o = this.entities[id];
                let p = Engine3D.project(o.x, o.y, o.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if(p.visible) buf.push({p, o});
            }
            
            buf.sort((a,b)=>b.p.z-a.p.z); 
            
            buf.forEach(d=>{
                let p=d.p, s=p.s, o=d.o;
                if(o.type==='cloud') {
                    ctx.fillStyle = this.environment.isNight ? 'rgba(50,50,60,0.08)' : 'rgba(255,255,255,0.2)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, o.size*s, 0, Math.PI*2); ctx.fill();
                }
                else if (o.type === 'terrain') {
                    let p2 = Engine3D.project(o.x, o.h, o.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if(p2.visible) {
                        let tw = o.w * s; ctx.fillStyle = o.c; ctx.fillRect(p.x - w/2 - tw/2, p2.y - h/2, tw, p.y - p2.y);
                        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(p.x - w/2 - tw/2, p2.y - h/2, tw, p.y - p2.y);
                    }
                }
                else if(o.type==='floater') {
                    ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(12, 2500*s)}px Arial`; ctx.textAlign='center'; 
                    ctx.fillText(o.text, p.x, p.y, w*0.9);
                }
                else if(o.type.startsWith('enemy') || o.type==='boss' || o.type==='net_player') {
                    let isNet = o.type==='net_player';
                    let meshType = o.type === 'enemy_tank' ? MESHES.tank : (o.type === 'boss' ? MESHES.boss : MESHES.jet);
                    this._drawMesh(ctx, meshType, o, w, h);
                    
                    if(isNet){ ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText(o.name||'ALIADO',p.x,p.y-350*s-15, w*0.3); }
                    
                    let locked = this.combat.targetId === o.id;
                    let bs = Math.max(20, (o.type==='boss'? 800 : 250)*s);
                    
                    if (locked) {
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, bs*1.2, 0, Math.PI*2); ctx.stroke();
                        ctx.fillStyle = '#f03'; ctx.font = `bold ${Math.max(12, w*0.025)}px Arial`; ctx.textAlign = 'center'; 
                        ctx.fillText('TRAVADO', p.x, p.y + bs*1.2 + 15, w*0.3);
                    } else if (!isNet) {
                        ctx.strokeStyle = o.type==='enemy_tank' ? 'rgba(243,156,18,0.8)' : 'rgba(231,76,60,0.6)'; ctx.lineWidth = 1;
                        ctx.strokeRect(p.x-bs, p.y-bs, bs*2, bs*2);
                    }
                }
                else if(o.type==='bullet') {
                    if (o.tracer) { 
                        ctx.strokeStyle = o.c; ctx.lineWidth = Math.max(1, o.size*s); ctx.lineCap='round';
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - o.vx*0.01*s, p.y - o.vy*0.01*s); ctx.stroke();
                    } else {
                        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = o.isEnemy ? '#ff3300' : '#ffff00';
                        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 15*s), 0, Math.PI*2); ctx.fill();
                        ctx.globalCompositeOperation = 'source-over';
                    }
                }
                else if(o.type==='missile') { ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 40*s), 0, Math.PI*2); ctx.fill(); }
                else if(o.type==='fx') { 
                    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, o.life); ctx.fillStyle = o.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, o.size*s), 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                }
            });
        },

        _drawYoke: function(ctx, w, h) {
            ctx.save();
            let yokeScale = Math.min(w * 0.25, 120); 
            ctx.translate(w/2, h); 

            let grad = ctx.createLinearGradient(-15, 0, 15, 0);
            grad.addColorStop(0, '#111'); grad.addColorStop(0.5, '#444'); grad.addColorStop(1, '#111');
            ctx.fillStyle = grad;
            ctx.fillRect(-yokeScale*0.15, -yokeScale*1.5, yokeScale*0.3, yokeScale*1.5); 

            ctx.translate(0, -yokeScale*1.5);
            ctx.rotate(this.pilot.targetRoll); 
            
            ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.roundRect(-yokeScale*0.8, -yokeScale*0.2, yokeScale*1.6, yokeScale*0.3, yokeScale*0.1); ctx.fill();
            
            let gripGrad = ctx.createLinearGradient(-yokeScale, 0, -yokeScale*0.7, 0);
            gripGrad.addColorStop(0, '#050505'); gripGrad.addColorStop(0.5, '#222'); gripGrad.addColorStop(1, '#050505');
            ctx.fillStyle = gripGrad; ctx.beginPath();
            ctx.roundRect(-yokeScale*0.9, -yokeScale*0.5, yokeScale*0.25, yokeScale*0.7, yokeScale*0.1); 
            ctx.roundRect(yokeScale*0.65, -yokeScale*0.5, yokeScale*0.25, yokeScale*0.7, yokeScale*0.1); 
            ctx.fill();

            ctx.fillStyle = this.combat.locked ? '#f33' : '#a00';
            ctx.beginPath(); ctx.arc(-yokeScale*0.77, -yokeScale*0.4, yokeScale*0.06, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(yokeScale*0.77, -yokeScale*0.4, yokeScale*0.06, 0, Math.PI*2); ctx.fill();

            ctx.restore();
        },

        _drawHUD: function(ctx, w, h){
            let cx = w/2, cy = h/2;
            const fz = Math.max(10, Math.min(w * 0.035, 16)); 
            
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
            ctx.font = `bold ${fz}px 'Chakra Petch', sans-serif`;
            
            ctx.beginPath(); 
            ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 15, cy); ctx.lineTo(cx + 5, cy);
            ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 15); ctx.lineTo(cx, cy + 5); 
            ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill();

            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            let tapeW = w * 0.14; let tapeH = h * 0.35;
            let spdX = w * 0.02; let altX = w * 0.84;
            
            ctx.fillRect(spdX, cy - tapeH/2, tapeW, tapeH); ctx.strokeRect(spdX, cy - tapeH/2, tapeW, tapeH);
            ctx.fillRect(altX, cy - tapeH/2, tapeW, tapeH); ctx.strokeRect(altX, cy - tapeH/2, tapeW, tapeH);
            
            ctx.fillStyle = '#0f6'; ctx.textAlign = 'center'; ctx.font = `bold ${fz * 1.2}px 'Russo One'`;
            ctx.fillText(Math.floor(this.ship.speed), spdX + tapeW/2, cy + fz/2, tapeW * 0.9);
            ctx.fillText(Math.floor(this.ship.y), altX + tapeW/2, cy + fz/2, tapeW * 0.9);
            
            ctx.font = `bold ${fz*0.8}px Arial`; ctx.fillStyle = '#fff';
            ctx.fillText("VEL (KT)", spdX + tapeW/2, cy - tapeH/2 - 5, tapeW * 0.9);
            ctx.fillText("ALT (FT)", altX + tapeW/2, cy - tapeH/2 - 5, tapeW * 0.9);

            let hdg = (this.ship.yaw * 180 / Math.PI) % 360; if (hdg < 0) hdg += 360;
            let compW = w * 0.35;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(cx - compW/2, 10, compW, 25); ctx.strokeRect(cx - compW/2, 10, compW, 25);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${fz}px 'Russo One'`;
            ctx.fillText(`RUMO: ${Math.floor(hdg)}°`, cx, 28, compW * 0.9);

            const dmgX = spdX, dmgY = cy + tapeH/2 + 20;
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(dmgX, dmgY, tapeW, 60);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${fz*0.7}px Arial`; ctx.fillText("STATUS", dmgX + tapeW/2, dmgY + 12);
            let dmgColor = (val) => val > 20 ? '#e74c3c' : (val > 10 ? '#f39c12' : '#2ecc71');
            ctx.fillStyle = dmgColor(this.ship.damage.lWing); ctx.fillRect(dmgX + 5, dmgY + 25, 10, 10);
            ctx.fillStyle = dmgColor(this.ship.damage.rWing); ctx.fillRect(dmgX + tapeW - 15, dmgY + 25, 10, 10);
            ctx.fillStyle = dmgColor(this.ship.damage.body); ctx.fillRect(dmgX + tapeW/2 - 5, dmgY + 20, 10, 20);
            ctx.fillStyle = dmgColor(this.ship.damage.engine); ctx.fillRect(dmgX + tapeW/2 - 5, dmgY + 45, 10, 10);

            const bX = cx - compW/2, bY = h - 60;
            ctx.fillStyle = '#222'; ctx.fillRect(bX, bY, compW, 10); ctx.fillRect(bX, bY + 15, compW, 10);
            ctx.fillStyle = '#3498db'; ctx.fillRect(bX, bY, compW * (this.ship.boost/100), 10); 
            ctx.fillStyle = this.combat.isJammed ? '#e74c3c' : '#e67e22'; ctx.fillRect(bX, bY + 15, compW * (this.ship.overheat/100), 10); 
            ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `bold ${fz*0.8}px Arial`;
            ctx.fillText("BOOST", bX - 45, bY + 9); ctx.fillText("CALOR", bX - 45, bY + 24);

            ctx.fillStyle = '#0f6'; ctx.textAlign = 'right'; ctx.font = `bold ${fz}px Arial`;
            ctx.fillText(`G-FORCE: ${this.ship.gForce.toFixed(1)}`, altX + tapeW, cy + tapeH/2 + 20);
            if (this.combat.targetId) {
                ctx.fillStyle = this.combat.hitChance > 70 ? '#2ecc71' : '#e74c3c';
                ctx.fillText(`ACERTO: ${Math.floor(this.combat.hitChance)}%`, altX + tapeW, cy + tapeH/2 + 40);
            }

            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c';
            ctx.font = `bold ${fz * 1.1}px 'Russo One'`; ctx.textAlign = 'left';
            ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`, 10, h - 15, w * 0.3);
            
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'right';
            ctx.fillText(`R$: ${this.money}`, w - 10, h - 15, w * 0.3);
            
            ctx.textAlign = 'center';
            if (this.combat.targetId && this.combat.locked) {
                ctx.fillStyle = '#f03'; ctx.font = `bold ${fz * 1.3}px 'Russo One'`;
                ctx.fillText("ALVO TRAVADO - FOGO!", cx, h * 0.70, w * 0.9);
                if (this.combat.missileCd <= 0) {
                    ctx.fillStyle = '#0ff'; ctx.font = `bold ${fz * 0.9}px Arial`;
                    ctx.fillText("INCLINE CABEÇA P/ MÍSSIL", cx, h * 0.75, w * 0.9);
                }
            }

            if (this.combat.isJammed) {
                ctx.fillStyle = '#f00'; ctx.font = `bold ${fz * 1.5}px 'Russo One'`;
                ctx.fillText("ARMA SOBREAQUECIDA!", cx, h * 0.65, w * 0.9);
            }

            if (!this.pilot.active) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, cy - 20, w, 40);
                ctx.fillStyle = '#f00'; ctx.font = `bold ${fz * 1.2}px Arial`; ctx.textAlign = 'center';
                ctx.fillText("MÃOS NÃO DETECTADAS!", cx, cy + fz*0.4, w * 0.9);
            }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(5,15,10,0.95)';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='rgba(0,255,100,0.3)';ctx.lineWidth=2;ctx.strokeRect(w*0.1, h*0.1, w*0.8, h*0.8);
            
            const fz = Math.min(w * 0.045, 20);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font=`bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('SISTEMAS ONLINE', w/2, h*0.25, w*0.8);
            
            ctx.fillStyle='#fff';ctx.font=`bold ${fz}px Arial`;
            ctx.fillText('JUNTE AS MÃOS NO CENTRO = BOOST', w/2, h*0.45, w*0.8);
            ctx.fillStyle='#f1c40f';
            ctx.fillText('MÃO ACIMA DOS OMBROS = SOBE', w/2, h*0.55, w*0.8);
            ctx.fillText('MÃO NA BARRIGA = DESCE', w/2, h*0.6, w*0.8);
            
            let pct = 1 - this.timer/4;
            ctx.fillStyle='#111';ctx.fillRect(w*0.2,h*0.7,w*0.6,15);
            ctx.fillStyle='#0f6';ctx.fillRect(w*0.2,h*0.7,(w*0.6)*pct,15);
        },

        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,30,0.98)';ctx.fillRect(0,0,w,h);
            const fz = Math.min(w * 0.045, 22);
            ctx.fillStyle='#2ecc71';ctx.textAlign='center';ctx.font=`bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('FORÇAS ARMADAS BR', w/2, h*0.15, w*0.9);
            
            let psCount = 0;
            for(let id in this.entities) if (this.entities[id].type === 'net_player') psCount++;
            ctx.font=`bold ${fz}px Arial`;ctx.fillStyle='#fff';ctx.fillText(`PILOTOS NA BASE: ${psCount+1}`, w/2, h*0.25, w*0.9);
            
            let py=h*0.35;
            ctx.fillStyle='#2ecc71'; ctx.fillText(`[HOST] EU`, w/2, py, w*0.9); py+=35;
            for(let id in this.entities) {
                if (this.entities[id].type === 'net_player') {
                    let p = this.entities[id];
                    ctx.fillStyle=p.ready?'#2ecc71':'#e74c3c';
                    ctx.fillText(`[${p.ready?'PRONTO':'ESPERA'}] ${p.name}`, w/2, py, w*0.9); py+=35;
                }
            }

            let btnW = Math.min(280, w * 0.8);
            if(this.net.isHost){
                const r=psCount>=0; 
                ctx.fillStyle=r?'#c0392b':'#34495e'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,50);
                ctx.fillStyle='#fff';ctx.font=`bold ${fz}px "Russo One"`;
                ctx.fillText(r?'LANÇAR':'AGUARDANDO...', w/2, h*0.80 + 32, btnW*0.9);
            }else{
                ctx.fillStyle=this.net.isReady?'#f39c12':'#2980b9'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,50);
                ctx.fillStyle='#fff';ctx.font=`bold ${fz}px "Russo One"`;
                ctx.fillText(this.net.isReady?'EM ESPERA':'PRONTO', w/2, h*0.80 + 32, btnW*0.9);
            }
        },

        _drawEnd: function(ctx,w,h){
            this._draw(ctx,w,h);
            ctx.fillStyle='rgba(0,0,0,0.9)';ctx.fillRect(0,0,w,h);
            
            const fz = Math.min(w * 0.06, 35);
            ctx.textAlign='center';ctx.font=`bold ${fz}px "Russo One"`;
            ctx.fillStyle=this.state==='VICTORY'?'#2ecc71':'#e74c3c';
            ctx.fillText(this.state==='VICTORY'?'SUCESSO':'DESTRUÍDO', w/2, h/2 - fz, w*0.9);
            
            ctx.fillStyle='#f1c40f';ctx.font=`bold ${fz*0.6}px Arial`;
            ctx.fillText(`R$ ${this.money}`, w/2, h/2 + fz, w*0.9);
            ctx.fillStyle='#fff';
            ctx.fillText(`ABATES: ${this.session.kills}`, w/2, h/2 + fz*2, w*0.9);
        }
    };

    const register = () => {
        if (window.System?.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Simulador Militar', '✈️', Game, {
                camera: 'user',
                phases: [
                    { id: 'training', name: 'TREINO', desc: 'Destrua alvos.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'ESQUADRÃO', desc: 'Junte-se.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'DOGFIGHT', desc: 'Combate aéreo.', mode: 'PVP', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) { const check = setInterval(() => { if (register()) clearInterval(check); }, 100); }
})();
