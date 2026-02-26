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

    // =========================================================================
    // GAME LOOP & CORE
    // =========================================================================
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE', slowMo: 1.0, slowMoTimer: 0, 
        fpsHistory: [], perfTier: 'HIGH',
        money: 0,
        upgrades: { engine: 1, radar: 1, missile: 1, boost: 1, thermal: 1 },
        session: { kills: 0, goal: 30 },
        cameraShake: 0,
        
        // =====================================================================
        // ECS - ENTITY COMPONENT SYSTEM (100% PURE)
        // =====================================================================
        entityIdCounter: 0,
        entities: {}, 

        ship: { 
            hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0,
            pitchVel: 0, yawVel: 0, rollVel: 0, boost: 100, overheat: 0, gForce: 1.0,
            damage: { lWing: 0, rWing: 0, engine: 0, body: 0 }
        },
        pilot: { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handL: {x:0,y:0}, handR: {x:0,y:0}, isBoosting: false },
        timer: 4.0, hoverTime: 0, hoveredItem: null, radarTimer: 0,
        
        combat: { targetId: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0, isJammed: false, hitChance: 0 },
        net: { isHost: false, uid: null, sessionRef: null, playersRef: null, loop: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false, stars: [] },

        _spawn: function(type, compData) {
            let id = type + '_' + this.entityIdCounter++;
            this.entities[id] = {
                id: id,
                type: type,
                components: {
                    physics: compData.physics || null,
                    combat: compData.combat || null,
                    ai: compData.ai || null,
                    render: compData.render || null,
                    network: compData.network || null
                }
            };
            return id;
        },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, goal: 30 };
            this.fpsHistory = [];
            this.perfTier = 'HIGH';
            this.entityIdCounter = 0;
            this.entities = {}; 
            this.radarTimer = 0;
            
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
            for (let i = 0; i < 60; i++) {
                this._spawn('cloud', {
                    physics: { x: (Math.random()-0.5)*120000, y: 8000+Math.random()*15000, z: (Math.random()-0.5)*120000 },
                    render: { size: 4000+Math.random()*8000 }
                });
            }
            for (let i = 0; i < 80; i++) {
                let c = this.environment.isNight ? `rgb(${Math.random()*30},${30+Math.random()*40},${Math.random()*30})` : `rgb(${50+Math.random()*50},${60+Math.random()*40},${40+Math.random()*30})`;
                this._spawn('terrain', {
                    physics: { x: (Math.random()-0.5)*200000, y: 0, z: (Math.random()-0.5)*200000 },
                    render: { w: 2000 + Math.random()*4000, h: 500 + Math.random()*3000, color: c }
                });
            }
        },

        // =====================================================================
        // NETWORK
        // =====================================================================
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
            
            this.net.playersRef.on('value', snap => { 
                const data = snap.val() || {};
                for (let uid in data) {
                    if (uid === this.net.uid) continue;
                    
                    let foundId = null;
                    for(let id in this.entities) {
                        if(this.entities[id].type === 'net_player' && this.entities[id].components.network.uid === uid) foundId = id;
                    }

                    if (!foundId) {
                        this._spawn('net_player', {
                            physics: { x: data[uid].x, y: data[uid].y, z: data[uid].z, pitch: data[uid].pitch, yaw: data[uid].yaw, roll: data[uid].roll, speed: 0 },
                            combat: { hp: data[uid].hp, maxHp: 100, isEnemy: this.mode === 'PVP' },
                            network: { uid: uid, name: data[uid].name, ready: data[uid].ready, tx: data[uid].x, ty: data[uid].y, tz: data[uid].z, tpitch: data[uid].pitch, tyaw: data[uid].yaw, troll: data[uid].roll },
                            render: {}
                        });
                    } else {
                        let netC = this.entities[foundId].components.network;
                        let comC = this.entities[foundId].components.combat;
                        netC.tx = data[uid].x; netC.ty = data[uid].y; netC.tz = data[uid].z;
                        netC.tpitch = data[uid].pitch; netC.tyaw = data[uid].yaw; netC.troll = data[uid].roll;
                        comC.hp = data[uid].hp; netC.name = data[uid].name; netC.ready = data[uid].ready;
                    }
                }
                for (let id in this.entities) {
                    let e = this.entities[id];
                    if (e.type === 'net_player' && !data[e.components.network.uid]) delete this.entities[id];
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
            this._processAI(dt, now);
            this._processECS(dt); 
            this._updateRadar(dt);

            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');

            this._draw(ctx, w, h);
            return this.money;
        },

        _adjustECSForTier: function() {
            let limit = this.perfTier === 'LOW' ? 20 : (this.perfTier === 'MEDIUM' ? 40 : 60);
            let currentC = 0, currentT = 0;
            for(let id in this.entities) {
                let e = this.entities[id];
                if (e.type === 'cloud') { currentC++; if (currentC > limit) delete this.entities[id]; }
                if (e.type === 'terrain') { currentT++; if (currentT > limit) delete this.entities[id]; }
            }
        },

        // =====================================================================
        // PHYSICS - AERODINÂMICA REAL
        // =====================================================================
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
            
            // FÍSICA REAL: Lift Quadrático e Drag por Ângulo de Ataque
            let speedSq = this.ship.speed * this.ship.speed;
            let pitchDeg = this.ship.pitch * 180 / Math.PI;
            let aoa = Math.abs(this.ship.pitchVel) * 10; 
            
            let liftK = 0.00005;
            let lift = liftK * speedSq * Math.max(0, 1 - aoa * 0.2);
            let drag = (0.0001 + 0.005 * aoa) * speedSq;
            
            this.ship.gForce = 1 + ((this.ship.pitchVel * this.ship.speed) / 600);
            if (Math.abs(this.ship.gForce) > 6) {
                this.cameraShake = Math.max(this.cameraShake, Math.abs(this.ship.gForce) - 5);
                window.Gfx?.shakeScreen(this.cameraShake);
            }

            let maxSpeed = 3500 + (this.upgrades.engine * 500) - (this.ship.damage.engine * 20);
            
            let gravity = 9.8 * 60;
            let verticalForce = lift - gravity;
            
            if (this.pilot.isBoosting && this.ship.boost > 0) {
                this.ship.speed += 2500 * dt;
                this.ship.boost -= (50 / this.upgrades.boost) * dt;
                Engine3D.fov += (1000 - Engine3D.fov) * dt * 5; 
            } else {
                this.ship.boost = Math.min(100, this.ship.boost + 15 * dt);
                Engine3D.fov += (800 - Engine3D.fov) * dt * 5;
            }

            this.ship.speed -= drag * dt;
            this.ship.speed += (fY * -600 * dt); // Gravidade mergulho
            this.ship.speed = Math.max(600, Math.min(maxSpeed * (this.pilot.isBoosting? 1.5 : 1), this.ship.speed));

            if (this.ship.speed > 4000 && fY < -0.5 && Math.abs(this.ship.gForce) > 7) {
                this.ship.damage.body += 15 * dt;
                window.Gfx?.shakeScreen(8);
                if (Math.random() < 0.2) GameSfx.play('alarm');
            }

            if (this.ship.speed < 900 && Math.abs(pitchDeg) > 25) {
                this.ship.pitchVel -= 2.5 * dt; 
                window.Gfx?.shakeScreen(4);
                if (Math.random() < 0.1) GameSfx.play('alarm');
            }

            let units = this.ship.speed * 20;
            this.ship.x += units * fX * dt; 
            this.ship.y += (units * fY * dt) + (verticalForce * dt * 0.1); 
            this.ship.z += units * fZ * dt;
            
            let totalDmg = this.ship.damage.body + this.ship.damage.engine;
            if (totalDmg > 30 && this.perfTier !== 'LOW') {
                let sCol = totalDmg > 70 ? (Math.random()>0.5?'#e74c3c':'#333') : 'rgba(80,80,80,0.6)';
                let sSize = totalDmg > 70 ? 400 : 200;
                this._spawn('fx', {
                    physics: {x: this.ship.x, y: this.ship.y, z: this.ship.z, vx: 0, vy: 0, vz: 0},
                    render: {life: 2.0, color: sCol, size: sSize}
                });
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
                this.pilot.targetRoll = 0;
                this.pilot.targetPitch = 0;
            }
        },

        // =====================================================================
        // AI - STATE MACHINE & MULTIPHASE BOSS
        // =====================================================================
        _processAI: function(dt, now) {
            let maxEnemies = this.perfTier === 'LOW' ? 4 : 8;
            let enemyCount = 0;
            for(let id in this.entities) {
                let type = this.entities[id].type;
                if(type.startsWith('enemy') || type === 'boss') enemyCount++;
            }

            if (enemyCount < maxEnemies && Math.random() < 0.02) {
                let dist = 60000 + Math.random()*30000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                let sx = this.ship.x + fX*dist + (Math.random()-0.5)*50000, sz = this.ship.z + fZ*dist + (Math.random()-0.5)*50000;
                
                let r = Math.random();
                let hasBoss = false;
                for(let id in this.entities) if (this.entities[id].type === 'boss') hasBoss = true;

                if (this.session.kills > 10 && r < 0.1 && !hasBoss) {
                    this._spawn('boss', { 
                        physics: { x: sx, y: 30000, z: sz, pitch: 0, yaw: this.ship.yaw + Math.PI, roll: 0, speed: 12000, vx:0, vy:0, vz:0 },
                        combat: { hp: 3000, maxHp: 3000, isEnemy: true, weakPoints: { left: 800, right: 800, core: 1400 } },
                        ai: { state: 'ENGAGE', timer: 0, phase: 1 },
                        render: {}
                    });
                    window.System?.msg("FORTALEZA VOADORA DETECTADA!");
                } else if (r < 0.3) {
                    this._spawn('enemy_squadron_lead', {
                        physics: { x: sx, y: this.ship.y, z: sz, pitch: 0, yaw: this.ship.yaw + Math.PI, roll: 0, speed: 20000, vx:0, vy:0, vz:0 },
                        combat: { hp: 200, maxHp: 200, isEnemy: true }, ai: { state: 'PATROL', timer: 0 }, render: {}
                    });
                    this._spawn('enemy_squadron_wing', {
                        physics: { x: sx+5000, y: this.ship.y+2000, z: sz, pitch: 0, yaw: this.ship.yaw + Math.PI, roll: 0, speed: 22000, vx:0, vy:0, vz:0 },
                        combat: { hp: 150, maxHp: 150, isEnemy: true }, ai: { state: 'FLANK', timer: 0 }, render: {}
                    });
                } else if (r < 0.6) {
                    this._spawn('enemy_interceptor', {
                        physics: { x: sx, y: this.ship.y, z: sz, pitch: 0, yaw: this.ship.yaw, roll: 0, speed: 25000, vx:0, vy:0, vz:0 },
                        combat: { hp: 250, maxHp: 250, isEnemy: true }, ai: { state: 'PATROL', timer: 0 }, render: {}
                    });
                } else if (r < 0.8) {
                    this._spawn('enemy_evasive', {
                        physics: { x: sx, y: this.ship.y, z: sz, pitch: 0, yaw: this.ship.yaw + Math.PI, roll: 0, speed: 28000, vx:0, vy:0, vz:0 },
                        combat: { hp: 150, maxHp: 150, isEnemy: true }, ai: { state: 'PATROL', timer: 0 }, render: {}
                    });
                } else {
                    this._spawn('enemy_tank', {
                        physics: { x: sx, y: 0, z: sz, pitch: 0, yaw: Math.random()*Math.PI*2, roll: 0, speed: 0, vx:0, vy:0, vz:0 },
                        combat: { hp: 400, maxHp: 400, isEnemy: true }, ai: { state: 'PATROL', timer: 0 }, render: {}
                    });
                }
            }

            for (let id in this.entities) {
                let e = this.entities[id];
                if (!e.components.ai) continue;
                
                let p = e.components.physics;
                let c = e.components.combat;
                let a = e.components.ai;

                let dx = this.ship.x - p.x, dy = this.ship.y - p.y, dz = this.ship.z - p.z;
                let distToPlayer = Math.hypot(dx, dy, dz);
                
                if (distToPlayer > 200000) { delete this.entities[id]; continue; }

                if (e.type === 'enemy_tank') {
                    if (distToPlayer < 40000 && Math.random() < 0.04) {
                        this._spawn('bullet', { 
                            physics: { x: p.x, y: p.y, z: p.z, vx: (dx)/distToPlayer*18000, vy: (dy)/distToPlayer*18000, vz: (dz)/distToPlayer*18000 },
                            combat: { isEnemy: true, life: 4.0 },
                            render: { color: '#ff3300', size: 150, tracer: true }
                        });
                    }
                    continue; 
                }

                let energy = p.y + (p.speed * 0.5);
                let incomingMissile = false; 
                for(let mid in this.entities) if(this.entities[mid].type === 'missile' && this.entities[mid].components.combat.targetId === id) incomingMissile = true;
                
                if (e.type !== 'boss') {
                    if (energy < 5000) a.state = 'STALL_RECOVER';
                    else if (incomingMissile) a.state = 'EVADE';
                    else if (c.hp < c.maxHp * 0.3) a.state = 'RETREAT';
                    else if (a.state === 'STALL_RECOVER' || a.state === 'EVADE') a.state = 'ENGAGE';
                }

                if (a.state === 'STALL_RECOVER') {
                    p.y -= 15000 * dt; p.speed += 5000 * dt;
                    p.x += Math.sin(p.yaw) * p.speed * dt; p.z += Math.cos(p.yaw) * p.speed * dt;
                }
                else if (a.state === 'EVADE') {
                    p.yaw += Math.PI * dt; p.x += Math.sin(p.yaw) * p.speed * 1.5 * dt; p.z += Math.cos(p.yaw) * p.speed * 1.5 * dt; p.y += (Math.random() - 0.5) * 20000 * dt;
                    if (Math.random() < 0.1 && this.perfTier !== 'LOW') {
                        this._spawn('fx', { physics: { x: p.x, y: p.y, z: p.z, vx:0, vy:0, vz:0 }, render: { life: 1.0, color: '#f1c40f', size: 200 } });
                    }
                }
                else if (a.state === 'RETREAT') {
                    p.yaw = this.ship.yaw; p.x += Math.sin(p.yaw) * p.speed * 1.2 * dt; p.z += Math.cos(p.yaw) * p.speed * 1.2 * dt; p.y += 10000 * dt;
                }
                else if (a.state === 'FLANK') {
                    p.yaw += ((this.ship.yaw + Math.PI/2) - p.yaw) * dt;
                    p.x += Math.sin(p.yaw) * p.speed * dt; p.z += Math.cos(p.yaw) * p.speed * dt;
                }
                else {
                    if (e.type === 'enemy_interceptor') {
                        let estTime = distToPlayer / p.speed; 
                        let pVelX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch) * this.ship.speed * 20;
                        let pVelZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch) * this.ship.speed * 20;
                        p.yaw = Math.atan2((this.ship.x + pVelX * estTime) - p.x, (this.ship.z + pVelZ * estTime) - p.z);
                        p.y += ((this.ship.y + Math.sin(this.ship.pitch) * this.ship.speed * 20 * estTime) - p.y) * 0.5 * dt;
                    } else {
                        p.yaw = Math.atan2(dx, dz);
                    }
                    p.x += Math.sin(p.yaw) * p.speed * dt; p.z += Math.cos(p.yaw) * p.speed * dt;
                }

                // BOSS MULTIFASE CAÓTICA
                if (e.type === 'boss') {
                    if (a.phase === 1 && c.hp < c.maxHp * 0.66) { a.phase = 2; window.System?.msg("BOSS: MODO AGRESSIVO!"); p.speed = 18000; }
                    if (a.phase === 2 && c.hp < c.maxHp * 0.33) { a.phase = 3; window.System?.msg("BOSS: NÚCLEO EXPOSTO!"); p.speed = 25000; }

                    if(p.y < 15000) p.y += 5000*dt;
                    
                    if (a.phase === 3) {
                        p.yaw += (Math.random() - 0.5) * 3 * dt; 
                        p.x += Math.sin(now * 0.005) * 10000 * dt; 
                        if (Math.random() < 0.15) {
                            this._spawn('fx', { physics: { x: p.x + (Math.random()-0.5)*300, y: p.y, z: p.z + (Math.random()-0.5)*300, vx:0, vy:0, vz:0 }, render: { life: 1.0, color: '#e74c3c', size: 400 }});
                        }
                    }

                    a.timer += dt;
                    let fireRate = a.phase === 3 ? 0.3 : (a.phase === 2 ? 0.8 : 1.5);
                    if (a.timer > fireRate && distToPlayer < 70000) {
                        a.timer = 0; let bSpd = 45000;
                        if (c.weakPoints.left > 0) {
                            let cx = p.x + Math.cos(p.yaw) * 120, cz = p.z - Math.sin(p.yaw) * 120;
                            this._spawn('bullet', { physics: { x: cx, y: p.y, z: cz, vx: (this.ship.x - cx)/distToPlayer*bSpd, vy: (this.ship.y - p.y)/distToPlayer*bSpd, vz: (this.ship.z - cz)/distToPlayer*bSpd }, combat: { isEnemy: true, life: 4.0 }, render: { color: '#ff3300', size: 250, tracer: true }});
                        }
                        if (c.weakPoints.right > 0) {
                            let cx = p.x - Math.cos(p.yaw) * 120, cz = p.z + Math.sin(p.yaw) * 120;
                            this._spawn('bullet', { physics: { x: cx, y: p.y, z: cz, vx: (this.ship.x - cx)/distToPlayer*bSpd, vy: (this.ship.y - p.y)/distToPlayer*bSpd, vz: (this.ship.z - cz)/distToPlayer*bSpd }, combat: { isEnemy: true, life: 4.0 }, render: { color: '#ff3300', size: 250, tracer: true }});
                        }
                        if (a.phase >= 2 && c.weakPoints.core > 0) {
                            this._spawn('bullet', { physics: { x: p.x, y: p.y+50, z: p.z, vx: dx/distToPlayer*bSpd, vy: dy/distToPlayer*bSpd, vz: dz/distToPlayer*bSpd }, combat: { isEnemy: true, life: 4.0 }, render: { color: '#ff3300', size: 250, tracer: true }});
                        }
                        if (a.phase === 3) {
                            for (let i = -1; i <= 1; i+=2) {
                                let sy = p.yaw + (i * 0.2);
                                this._spawn('bullet', { physics: { x: p.x, y: p.y, z: p.z, vx: Math.sin(sy)*bSpd, vy: dy/distToPlayer*bSpd, vz: Math.cos(sy)*bSpd }, combat: { isEnemy: true, life: 4.0 }, render: { color: '#ff3300', size: 250, tracer: true }});
                            }
                        }
                    }
                }

                if (e.type !== 'boss' && a.state === 'ENGAGE' && distToPlayer < 40000 && Math.random() < 0.05) {
                    this._spawn('bullet', { physics: { x: p.x, y: p.y, z: p.z, vx: dx/distToPlayer*35000, vy: dy/distToPlayer*35000, vz: dz/distToPlayer*35000 }, combat: { isEnemy: true, life: 4.0 }, render: { color: '#ff3300', size: 150, tracer: true }});
                }
            }
        },

        // =====================================================================
        // COMBAT
        // =====================================================================
        _processCombat: function(dt, w, h, now) {
            let radarRange = 100000 + (this.upgrades.radar * 20000);
            
            let currentTarget = this.combat.targetId ? this.entities[this.combat.targetId] : null;
            if (currentTarget && currentTarget.components.combat && currentTarget.components.combat.hp <= 0) currentTarget = null;

            if (currentTarget) {
                let cp = currentTarget.components.physics;
                let dx = cp.x - this.ship.x, dy = cp.y - this.ship.y, dz = cp.z - this.ship.z;
                let dist = Math.hypot(dx, dy, dz);
                let p = Engine3D.project(cp.x, cp.y, cp.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                
                if (!p.visible || dist > radarRange || Math.abs(p.x - w/2) > w*0.45 || Math.abs(p.y - h/2) > h*0.45) {
                    this.combat.locked = false; this.combat.lockTimer = 0; this.combat.targetId = null; currentTarget = null;
                } else {
                    let distPenalty = (dist / radarRange) * 30;
                    let anglePenalty = (Math.abs(p.x - w/2) / (w/2)) * 30;
                    let relSpeedPenalty = Math.abs(this.ship.speed - (cp.speed || 0)) / 1000 * 10;
                    let gForcePenalty = Math.abs(this.ship.gForce - 1) * 5;
                    let evadePenalty = (currentTarget.components.ai && currentTarget.components.ai.state === 'EVADE') ? 40 : 0;
                    
                    this.combat.hitChance = Math.max(0, Math.min(100, 100 - distPenalty - anglePenalty - relSpeedPenalty - gForcePenalty - evadePenalty));
                }
            }

            if (!currentTarget) {
                this.combat.hitChance = 0;
                let closestZ = Infinity;
                for (let id in this.entities) {
                    let e = this.entities[id];
                    if (e.type.startsWith('enemy') || e.type === 'boss' || e.type === 'net_player') {
                        let cp = e.components.physics;
                        let p = Engine3D.project(cp.x, cp.y, cp.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
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
                let cp = currentTarget.components.physics;
                let dx = cp.x - this.ship.x, dy = cp.y - this.ship.y, dz = cp.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                dx += (Math.random()-0.5)*1500; dy += (Math.random()-0.5)*1500;
                
                this._spawn('bullet', { 
                    physics: { x: this.ship.x, y: this.ship.y-30, z: this.ship.z, vx: dx/dist*spd, vy: dy/dist*spd, vz: dz/dist*spd },
                    combat: { isEnemy: false, life: 2.5 },
                    render: { color: '#ffff00', size: 250, tracer: true }
                });
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
                    physics: { x: this.ship.x, y: this.ship.y-100, z: this.ship.z, vx: fX*mSpd + (Math.random()-0.5)*5000, vy: fY*mSpd - 2000, vz: fZ*mSpd + (Math.random()-0.5)*5000, speed: mSpd },
                    combat: { targetId: this.combat.targetId, life: 8 },
                    render: { size: 40, color: '#fff' }
                });
                GameSfx.play('missile'); window.Gfx?.shakeScreen(5);
            }
        },

        // =====================================================================
        // CORE ECS PROCESSING & COLLISIONS
        // =====================================================================
        _processECS: function(dt) {
            let bullets = []; let targets = [];
            
            for (let id in this.entities) {
                let e = this.entities[id];
                let p = e.components.physics;
                let c = e.components.combat;
                let r = e.components.render;

                if (e.type === 'cloud' || e.type === 'terrain') {
                    if (Math.hypot(p.x-this.ship.x, p.z-this.ship.z) > 150000) {
                        let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                        p.z = this.ship.z + fZ*120000 + (Math.random()-0.5)*80000; p.x = this.ship.x + fX*120000 + (Math.random()-0.5)*80000;
                    }
                }
                else if (e.type === 'floater' || e.type === 'fx') {
                    if(p.vx !== undefined) { p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; }
                    r.life -= dt;
                    if (e.type === 'floater') p.y -= 120*dt;
                    if(r.life <= 0) delete this.entities[id];
                }
                else if (e.type === 'bullet') {
                    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; c.life -= dt;
                    if (c.life <= 0 || p.y < 0) { 
                        if(p.y < 0 && this.perfTier !== 'LOW') this._spawn('fx', { physics: {x:p.x, y:0, z:p.z, vx:0, vy:0, vz:0}, render: {life:1.0, color:'#789', size:100} });
                        delete this.entities[id]; 
                    } else {
                        bullets.push(e);
                        if (this.perfTier === 'HIGH' || Math.random() < 0.5) {
                            this._spawn('fx', { physics: {x:p.x, y:p.y, z:p.z, vx:0, vy:0, vz:0}, render: {life:0.1, color: c.isEnemy?'#ff3300':'#ffff00', size: 250, tracer: true} });
                        }
                    }
                }
                else if (e.type === 'missile') {
                    p.speed += 20000 * dt; 
                    let activeTarget = this.entities[c.targetId];
                    if (!activeTarget || (activeTarget.components.combat && activeTarget.components.combat.hp <= 0)) {
                        c.life = 0; delete this.entities[id];
                        if(this.perfTier !== 'LOW') this._spawn('fx', { physics: {x:p.x, y:p.y, z:p.z, vx:0, vy:0, vz:0}, render: {life:1.5, color:'rgba(100,100,100,0.5)', size: 400} });
                        continue;
                    }
                    let tp = activeTarget.components.physics;
                    let dx = tp.x - p.x, dy = tp.y - p.y, dz = tp.z - p.z;
                    let d = Math.hypot(dx,dy,dz);
                    let turn = (50000 + (this.upgrades.missile * 10000)) * dt; 
                    p.vx += (dx/d)*turn; p.vy += (dy/d)*turn; p.vz += (dz/d)*turn;
                    let velD = Math.hypot(p.vx, p.vy, p.vz);
                    if(velD > p.speed) { p.vx = (p.vx/velD)*p.speed; p.vy = (p.vy/velD)*p.speed; p.vz = (p.vz/velD)*p.speed; }
                    
                    let hitbox = activeTarget.type === 'boss' ? 9000 : 3000;
                    if (d < hitbox) {
                        if (activeTarget.type === 'net_player' && this.mode === 'PVP') {
                            window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${activeTarget.components.network.uid}/hp`).set(activeTarget.components.combat.hp-60);
                            this._spawn('fx', { physics: {x:tp.x, y:tp.y, z:tp.z, vx:0, vy:0, vz:0}, render: {life:2.0, color:'#f33', size:400} }); this.money += 800;
                        } else if (activeTarget.type !== 'net_player') {
                            this._applyDamageToEnemy(activeTarget, 500);
                        }
                        c.life = 0; delete this.entities[id]; GameSfx.play('boom'); window.Gfx?.shakeScreen(5);
                        continue;
                    }
                    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; c.life -= dt;
                    if(p.y < 0) { c.life = 0; delete this.entities[id]; this._spawn('fx', { physics: {x:p.x, y:0, z:p.z, vx:0, vy:0, vz:0}, render: {life:2.0, color:'#a55', size:200} }); continue; }
                    if (this.perfTier === 'HIGH' || Math.random() < 0.5) {
                        this._spawn('fx', { physics: {x:p.x, y:p.y, z:p.z, vx:(Math.random()-0.5)*300, vy:(Math.random()-0.5)*300, vz:(Math.random()-0.5)*300}, render: {life: 1.5, color:'rgba(220,220,220,0.6)', size: 500} });
                    }
                    if (c.life <= 0) delete this.entities[id];
                }
                
                if (e.type.startsWith('enemy') || e.type === 'boss' || e.type === 'net_player') {
                    targets.push(e);
                }
            }

            for (let b of bullets) {
                if (!this.entities[b.id]) continue; 
                let bp = b.components.physics;
                if (b.components.combat.isEnemy) {
                    if (Math.hypot(bp.x-this.ship.x, bp.y-this.ship.y, bp.z-this.ship.z) < 1500) {
                        this._takeDamage(10); delete this.entities[b.id];
                    }
                } else {
                    for (let t of targets) {
                        let tp = t.components.physics;
                        let tc = t.components.combat;
                        let hitbox = t.type === 'boss' ? 8000 : 2500;
                        if (Math.hypot(bp.x-tp.x, bp.y-tp.y, bp.z-tp.z) < hitbox) { 
                            delete this.entities[b.id]; 
                            this._spawn('fx', { physics: {x:tp.x, y:tp.y, z:tp.z, vx:0, vy:0, vz:0}, render: {life:1.0, color:'#f90', size:100} });
                            if (t.type === 'net_player' && this.mode === 'PVP' && this.net.isHost) {
                                window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${t.components.network.uid}/hp`).set(tc.hp-10);
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
            let p = e.components.physics;
            let c = e.components.combat;
            if (e.type === 'boss') {
                if (c.weakPoints.left > 0) { c.weakPoints.left -= amount; this._spawn('fx', { physics:{x:p.x+100, y:p.y, z:p.z, vx:0, vy:0, vz:0}, render:{life:1.5, color:'#ff3300', size:300} }); }
                else if (c.weakPoints.right > 0) { c.weakPoints.right -= amount; this._spawn('fx', { physics:{x:p.x-100, y:p.y, z:p.z, vx:0, vy:0, vz:0}, render:{life:1.5, color:'#ff3300', size:300} }); }
                else { c.weakPoints.core -= amount; this._spawn('fx', { physics:{x:p.x, y:p.y, z:p.z, vx:0, vy:0, vz:0}, render:{life:2.0, color:'#3498db', size:500} }); }
                c.hp -= amount; 
            } else {
                c.hp -= amount;
            }
            if (c.hp <= 0) this._kill(e);
        },

        _takeDamage: function(amount) {
            this.ship.hp -= amount;
            this.cameraShake = 15;
            window.Gfx?.shakeScreen(15); 
            this._spawn('fx', { physics:{x:this.ship.x, y:this.ship.y, z:this.ship.z+500, vx:0,vy:0,vz:0}, render:{life:1.0, color:'#f00', size:200} }); 
            GameSfx.play('boom');
            
            let parts = ['lWing', 'rWing', 'engine', 'body'];
            let hitPart = parts[Math.floor(Math.random() * parts.length)];
            this.ship.damage[hitPart] += amount * 0.5;
            
            if (this.ship.hp <= 0) this._endGame('GAMEOVER');
        },

        _kill: function(e) {
            let isBoss = e.type === 'boss';
            let rew = isBoss ? 2500 : (e.type === 'enemy_tank' ? 300 : 200);
            let p = e.components.physics;
            
            GameSfx.play('boom');
            this.cameraShake = isBoss ? 40 : 10;
            window.Gfx?.shakeScreen(this.cameraShake);
            
            this._spawn('fx', { physics:{x:p.x, y:p.y, z:p.z, vx:0,vy:0,vz:0}, render:{life:2.0, color:'#ff3300', size:isBoss?1500:400} });
            this._spawn('fx', { physics:{x:p.x, y:p.y, z:p.z, vx:0,vy:0,vz:0}, render:{life:2.5, color:'#f1c40f', size:isBoss?2000:600} });
            
            if (isBoss) {
                let expTimer = setInterval(() => {
                    if(this.state !== 'PLAYING') clearInterval(expTimer);
                    this._spawn('fx', { physics:{x:p.x + (Math.random()-0.5)*5000, y:p.y + (Math.random()-0.5)*5000, z:p.z + (Math.random()-0.5)*5000, vx:0,vy:0,vz:0}, render:{life:2.0, color:'#ff3300', size:800} });
                    GameSfx.play('boom');
                }, 400);
                setTimeout(() => clearInterval(expTimer), 3500);
            }

            this._spawn('floater', { physics:{x:p.x, y:p.y, z:p.z}, render:{life:2.5, text:`+ R$${rew}`} });
            this.session.kills++; this.money += rew;
            this.slowMoTimer = isBoss ? 4.0 : 1.0;
            delete this.entities[e.id];

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

        // =====================================================================
        // RADAR - MINIMAP TÁTICO AAA
        // =====================================================================
        _updateRadar: function(dt) {
            this.radarTimer += dt;
            let updateRate = this.perfTier === 'LOW' ? 0.3 : 0.05;
            
            if (this.radarTimer >= updateRate) {
                this.radarTimer = 0;
                let range = this.perfTier === 'LOW' ? 40000 : 80000;
                let rangeSq = range * range;
                let cosY = Math.cos(-this.ship.yaw), sinY = Math.sin(-this.ship.yaw);

                for (let id in this.entities) {
                    let e = this.entities[id];
                    if (!e.components.render) continue;
                    let r = e.components.render;
                    let p = e.components.physics;
                    
                    if (e.type === 'cloud' || e.type === 'terrain' || e.type === 'fx' || e.type === 'floater' || e.type === 'bullet') {
                        r.radVisible = false;
                        continue;
                    }
                    
                    let dx = p.x - this.ship.x;
                    let dz = p.z - this.ship.z;
                    let distSq = dx*dx + dz*dz;
                    
                    if (distSq <= rangeSq) {
                        r.radVisible = true;
                        r.radX = dx * cosY - dz * sinY;
                        r.radZ = dx * sinY + dz * cosY;
                        r.radDy = p.y - this.ship.y;
                    } else {
                        r.radVisible = false;
                    }
                }
            }
        },

        _drawRadar: function(ctx, w, h, now) {
            let radius = Math.min(w * 0.15, 70);
            let cx = radius + 15;
            let cy = h - radius - 45; 
            
            ctx.fillStyle = 'rgba(10, 30, 20, 0.6)';
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.fill();
            
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, radius * 0.66, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, radius * 0.33, 0, Math.PI*2); ctx.stroke();
            
            ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.stroke();

            let range = this.perfTier === 'LOW' ? 40000 : 80000;

            for (let id in this.entities) {
                let e = this.entities[id];
                let r = e.components.render;
                if (!r || !r.radVisible) continue;
                
                let px = cx + (r.radX / range) * radius;
                let py = cy - (r.radZ / range) * radius; 
                
                if (Math.hypot(px - cx, py - cy) > radius) continue;

                let color = '#f00'; let size = 3;
                if (e.type === 'boss') { color = (now % 500 < 250) ? '#f03' : '#fff'; size = 5; }
                else if (e.type === 'net_player') { color = '#0ff'; size = 4; }
                else if (e.type === 'missile') { color = '#ff0'; size = 2; }
                else if (e.type.startsWith('enemy')) { color = '#f00'; size = 3; }

                ctx.fillStyle = color;
                if (r.radDy > 2500) {
                    ctx.beginPath(); ctx.moveTo(px, py-size); ctx.lineTo(px-size, py+size); ctx.lineTo(px+size, py+size); ctx.fill();
                } else if (r.radDy < -2500) {
                    ctx.beginPath(); ctx.moveTo(px, py+size); ctx.lineTo(px-size, py-size); ctx.lineTo(px+size, py-size); ctx.fill();
                } else {
                    ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI*2); ctx.fill();
                }
            }

            ctx.fillStyle = '#0f0';
            ctx.beginPath(); ctx.moveTo(cx, cy-6); ctx.lineTo(cx-4, cy+4); ctx.lineTo(cx, cy+2); ctx.lineTo(cx+4, cy+4); ctx.fill();
        },

        // =====================================================================
        // HUD / RENDERING
        // =====================================================================
        _draw: function(ctx, w, h) {
            ctx.save();
            if (this.cameraShake > 0.5) ctx.translate((Math.random()-0.5)*this.cameraShake, (Math.random()-0.5)*this.cameraShake);
            
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            
            this._drawYoke(ctx, w, h);
            this._drawHUD(ctx,w,h); 
            this._drawRadar(ctx, w, h, performance.now());
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

        _drawMesh: function(ctx, meshData, obj, w, h, pcomp) {
            let scale = obj.type === 'boss' ? 200 : (obj.type === 'enemy_tank' ? 80 : 60); 
            let projectedFaces = [];

            for (let face of meshData.f) {
                let color = face[face.length - 1]; 
                let pts = []; let zSum = 0; let visible = true;

                for (let i = 0; i < face.length - 1; i++) {
                    let v = meshData.v[face[i]];
                    let wPos = Engine3D.rotate(v.x * scale, v.y * scale, v.z * scale, 0, pcomp.yaw, 0);
                    wPos.x += pcomp.x; wPos.y += pcomp.y; wPos.z += pcomp.z;
                    
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

            let c = obj.components.combat;
            if (c && c.hp < c.maxHp * 0.5 && this.perfTier !== 'LOW') {
                let sCol = c.hp < c.maxHp * 0.2 ? '#e74c3c' : 'rgba(80,80,80,0.6)';
                this._spawn('fx', { physics: {x: pcomp.x, y: pcomp.y, z: pcomp.z, vx: 0, vy: 0, vz: 0}, render: {life: 0.5, color: sCol, size: scale*3}});
            }
        },

        _drawEntities: function(ctx,w,h) {
            let buf=[];
            
            for(let id in this.entities) {
                let e = this.entities[id];
                let pcomp = e.components.physics;
                if (!pcomp) continue;
                let p = Engine3D.project(pcomp.x, pcomp.y, pcomp.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if(p.visible) buf.push({p, e});
            }
            
            buf.sort((a,b)=>b.p.z-a.p.z); 
            
            buf.forEach(d=>{
                let p=d.p, s=p.s, e=d.e;
                let r = e.components.render;
                let pcomp = e.components.physics;

                if(e.type==='cloud') {
                    ctx.fillStyle = this.environment.isNight ? 'rgba(50,50,60,0.08)' : 'rgba(255,255,255,0.2)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, r.size*s, 0, Math.PI*2); ctx.fill();
                }
                else if (e.type === 'terrain') {
                    let p2 = Engine3D.project(pcomp.x, r.h, pcomp.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if(p2.visible) {
                        let tw = r.w * s; ctx.fillStyle = r.color; ctx.fillRect(p.x - w/2 - tw/2, p2.y - h/2, tw, p.y - p2.y);
                        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(p.x - w/2 - tw/2, p2.y - h/2, tw, p.y - p2.y);
                    }
                }
                else if(e.type==='floater') {
                    ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(12, 2500*s)}px Arial`; ctx.textAlign='center'; 
                    ctx.fillText(r.text, p.x, p.y, w*0.9);
                }
                else if(e.type.startsWith('enemy') || e.type==='boss' || e.type==='net_player') {
                    let isNet = e.type==='net_player';
                    let meshType = e.type === 'enemy_tank' ? MESHES.tank : (e.type === 'boss' ? MESHES.boss : MESHES.jet);
                    this._drawMesh(ctx, meshType, e, w, h, pcomp);
                    
                    if(isNet){ ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText(e.components.network.name||'ALIADO',p.x,p.y-350*s-15, w*0.3); }
                    
                    let locked = this.combat.targetId === e.id;
                    let bs = Math.max(20, (e.type==='boss'? 800 : 250)*s);
                    
                    if (locked) {
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, bs*1.2, 0, Math.PI*2); ctx.stroke();
                        ctx.fillStyle = '#f03'; ctx.font = `bold ${Math.max(12, w*0.025)}px Arial`; ctx.textAlign = 'center'; 
                        ctx.fillText('TRAVADO', p.x, p.y + bs*1.2 + 15, w*0.3);
                    } else if (!isNet) {
                        ctx.strokeStyle = e.type==='enemy_tank' ? 'rgba(243,156,18,0.8)' : 'rgba(231,76,60,0.6)'; ctx.lineWidth = 1;
                        ctx.strokeRect(p.x-bs, p.y-bs, bs*2, bs*2);
                    }
                }
                else if(e.type==='bullet') {
                    if (r.tracer) { 
                        ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(1, r.size*s); ctx.lineCap='round';
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - pcomp.vx*0.01*s, p.y - pcomp.vy*0.01*s); ctx.stroke();
                    } else {
                        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = r.color;
                        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 15*s), 0, Math.PI*2); ctx.fill();
                        ctx.globalCompositeOperation = 'source-over';
                    }
                }
                else if(e.type==='missile') { ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 40*s), 0, Math.PI*2); ctx.fill(); }
                else if(e.type==='fx') { 
                    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, r.life); ctx.fillStyle = r.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, r.size*s), 0, Math.PI*2); ctx.fill();
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
                    ctx.fillStyle=p.components.network.ready?'#2ecc71':'#e74c3c';
                    ctx.fillText(`[${p.components.network.ready?'PRONTO':'ESPERA'}] ${p.components.network.name}`, w/2, py, w*0.9); py+=35;
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
