// =============================================================================
// AERO STRIKE SIMULATOR: BRAZILIAN ARMED FORCES EDITION (V-FINAL ABSOLUTE)
// ENGINE: PROJEÇÃO 3D VETORIAL, MULTIPLAYER FIREBASE NATIVO, HUD CLEAN
// STATUS: 100% COMPLETO, LOBBY/HANGAR FUNCIONANDO, FÍSICA SUAVIZADA, ARMAS OK
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D CORE
    // -----------------------------------------------------------------
    const Engine3D = {
        fov: 800,
        rotate: (x, y, z, pitch, yaw, roll) => {
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let cp = Math.cos(pitch), sp = Math.sin(pitch);
            let cy = Math.cos(yaw), sy = Math.sin(yaw);

            let x1 = x * cr - y * sr;
            let y1 = x * sr + y * cr;
            let y2 = y1 * cp - z * sp;
            let z2 = y1 * sp + z * cp;

            return { x: x1 * cy + z2 * sy, y: y2, z: -x1 * sy + z2 * cy };
        },
        project: (ox, oy, oz, cx, cy, cz, p, y, r, w, h) => {
            let dx = ox - cx, dy = oy - cy, dz = oz - cz;
            let cyw = Math.cos(-y), syw = Math.sin(-y);
            let cp = Math.cos(-p), sp = Math.sin(-p);
            let cr = Math.cos(r), sr = Math.sin(r);

            let x1 = dx * cyw - dz * syw;
            let z1 = dx * syw + dz * cyw;
            let y2 = dy * cp - z1 * sp;
            let z2 = dy * sp + z1 * cp;

            if (z2 < 10) return { visible: false };

            let fx = x1 * cr - y2 * sr;
            let fy = x1 * sr + y2 * cr;
            let scale = Engine3D.fov / z2;

            return { 
                x: (w / 2) + fx * scale, 
                y: (h / 2) - fy * scale, 
                s: scale, 
                z: z2, 
                visible: true 
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. MODELOS VETORIAIS
    // -----------------------------------------------------------------
    const MESHES = {
        jet: {
            v: [{x:0,y:0,z:40}, {x:0,y:15,z:-30}, {x:-35,y:0,z:-10}, {x:35,y:0,z:-10}, {x:0,y:-10,z:-20}, {x:0,y:10,z:10}],
            f: [[0,2,5,'#7f8c8d'], [0,5,3,'#95a5a6'], [0,4,2,'#34495e'], [0,3,4,'#2c3e50'], [5,2,1,'#bdc3c7'], [5,1,3,'#ecf0f1'], [4,1,2,'#2c3e50'], [4,3,1,'#34495e']]
        },
        tank: {
            v: [{x:-20,y:0,z:30}, {x:20,y:0,z:30}, {x:20,y:15,z:30}, {x:-20,y:15,z:30}, {x:-20,y:0,z:-30}, {x:20,y:0,z:-30}, {x:20,y:15,z:-30}, {x:-20,y:15,z:-30}, {x:-10,y:15,z:10}, {x:10,y:15,z:10}, {x:10,y:25,z:-10}, {x:-10,y:25,z:-10}, {x:-2,y:20,z:10}, {x:2,y:20,z:10}, {x:2,y:20,z:50}, {x:-2,y:20,z:50}],
            f: [[0,1,2,3,'#4a5d23'], [1,5,6,2,'#5c752b'], [5,4,7,6,'#3d4d1d'], [4,0,3,7,'#4a5d23'], [3,2,6,7,'#6e8c33'], [8,9,10,11,'#117a65'], [12,13,14,15,'#111']]
        },
        boss: {
            v: [{x:0,y:0,z:150}, {x:-100,y:0,z:-50}, {x:100,y:0,z:-50}, {x:0,y:40,z:-30}, {x:0,y:-30,z:-50}, {x:-120,y:10,z:-70}, {x:120,y:10,z:-70}, {x:-50,y:15,z:-60}, {x:50,y:15,z:-60}],
            f: [[0,2,3,'#555'], [0,3,1,'#777'], [0,1,4,'#333'], [0,4,2,'#444'], [1,5,7,'#222'], [2,8,6,'#222'], [3,2,8,'#999'], [3,7,1,'#999']]
        }
    };

    // -----------------------------------------------------------------
    // 3. ÁUDIO SFX
    // -----------------------------------------------------------------
    const GameSfx = {
        ctx: null, engineSrc: null, ready: false,
        init: function() { 
            if (this.ready) return; 
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.ready = true; } catch(e) {} 
        },
        startEngine: function() {
            if (!this.ready || this.engineSrc || !this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < buf.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
            this.engineSrc = this.ctx.createBufferSource(); 
            this.engineSrc.buffer = buf; 
            this.engineSrc.loop = true;
            const filter = this.ctx.createBiquadFilter(); 
            filter.type = 'lowpass'; 
            filter.frequency.value = 350;
            const gain = this.ctx.createGain(); 
            gain.gain.value = 0.2;
            this.engineSrc.connect(filter); 
            filter.connect(gain); 
            gain.connect(this.ctx.destination);
            this.engineSrc.start();
        },
        play: function(type) {
            if (!this.ctx) return;
            try {
                if (type === 'lock') window.Sfx?.play(1200, 'square', 0.1, 0.1);
                else if (type === 'vulcan') window.Sfx?.play(150, 'sawtooth', 0.05, 0.2);
                else if (type === 'missile') {
                    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
                    o.type = 'square'; o.frequency.setValueAtTime(100, t); o.frequency.linearRampToValueAtTime(1000, t + 0.8);
                    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
                    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 1.5);
                }
                else if (type === 'boom') window.Sfx?.play(80, 'sawtooth', 0.5, 0.3);
                else if (type === 'alarm') window.Sfx?.play(600, 'square', 0.2, 0.1);
                else if (type === 'buy') window.Sfx?.play(1500, 'sine', 0.1, 0.2);
            } catch(e) {}
        },
        stop: function() { 
            if (this.engineSrc) { try { this.engineSrc.stop(); } catch(e) {} this.engineSrc = null; } 
        }
    };

    // -----------------------------------------------------------------
    // 4. LÓGICA DO JOGO (GAME CORE)
    // -----------------------------------------------------------------
    const Game = {
        state: 'INIT', 
        lastTime: 0, 
        mode: 'SINGLE', 
        
        // Arrays Estáveis
        entities: [], 
        bullets: [], 
        missiles: [], 
        fx: [], 
        clouds: [], 
        floaters: [],
        
        // Economia
        money: 0, 
        sessionMoney: 0,
        upgrades: { engine: 1, radar: 1, missile: 1, thermal: 1, boost: 1 },
        session: { kills: 0, goal: 30 },
        
        // Estado do Jogador
        ship: { 
            hp: 100, speed: 1200, x: 0, y: 15000, z: 0, 
            pitch: 0, yaw: 0, roll: 0, 
            pitchVel: 0, rollVel: 0, yawVel: 0,
            boost: 100, overheat: 0, gForce: 1.0, damage: { body: 0, engine: 0 }
        },
        
        // Controles de Câmera e Miras
        pilot: { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handR: {x: 0, y: 0}, handL: {x: 0, y: 0}, isBoosting: false },
        timer: 4.0, hoverTime: 0, cameraShake: 0, radarTimer: 0,
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0, isJammed: false, hitChance: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false, stars: [] },

        init: function(faseData) {
            this.lastTime = performance.now();
            
            // Puxa o saldo real global do usuário
            this.money = (window.Profile && window.Profile.coins !== undefined) ? window.Profile.coins : 0;
            this.sessionMoney = 0;
            this.session = { kills: 0, goal: 30 };
            
            this.entities = []; this.bullets = []; this.missiles = []; this.fx = []; this.clouds = []; this.floaters = [];
            this.ship = { hp: 100, speed: 1200, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0, pitchVel: 0, rollVel: 0, yawVel: 0, boost: 100, overheat: 0, gForce: 1.0, damage: { body: 0, engine: 0 } };
            this.pilot = { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handR: {x:0,y:0}, handL: {x:0,y:0}, isBoosting: false };
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0, isJammed: false, hitChance: 0 };
            this.cameraShake = 0;
            
            this._setupEnvironment();

            // Nuvens e Terreno Local
            for (let i = 0; i < 50; i++) {
                this.clouds.push({ x: (Math.random() - 0.5) * 150000, y: 8000 + Math.random() * 15000, z: (Math.random() - 0.5) * 150000, size: 4000 + Math.random() * 8000 });
            }

            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random() * 9999);
            this.mode = faseData?.mode || 'SINGLE';
            
            if (this.mode !== 'SINGLE' && window.DB) {
                this._initNet();
            } else {
                this.state = 'HANGAR'; // Começa no Hangar
            }
            GameSfx.init();
        },

        _setupEnvironment: function() {
            let hr = new Date().getHours(); 
            this.environment.stars = [];
            if (hr >= 6 && hr < 17) { 
                this.environment.skyTop = '#0a3d62'; this.environment.skyBot = '#60a3bc'; this.environment.ground = '#2d452b'; this.environment.isNight = false; 
            } else if (hr >= 17 && hr < 19) { 
                this.environment.skyTop = '#2c2c54'; this.environment.skyBot = '#ff793f'; this.environment.ground = '#3e2723'; this.environment.isNight = false; 
            } else { 
                this.environment.skyTop = '#000000'; this.environment.skyBot = '#111122'; this.environment.ground = '#0a0a0a'; this.environment.isNight = true; 
                for (let i = 0; i < 80; i++) this.environment.stars.push({x: Math.random()*2-1, y: Math.random(), z: Math.random()*2-1, size: Math.random()*2}); 
            }
        },

        _initNet: function() {
            this.state = 'LOBBY'; 
            this.net.sessionRef = window.DB.ref('br_army_sessions/aero_' + this.mode);
            this.net.playersRef = this.net.sessionRef.child('pilotos'); 
            
            this.net.playersRef.child(this.net.uid).onDisconnect().remove();
            
            this.net.sessionRef.child('host').once('value').then(snap => {
                if (!snap.val()) { 
                    this.net.isHost = true; 
                    this.net.sessionRef.child('host').set(this.net.uid); 
                    this.net.sessionRef.child('state').set('LOBBY'); 
                    this.net.playersRef.remove(); 
                }
                this.net.playersRef.child(this.net.uid).set({ 
                    name: window.Profile?.username || 'PILOTO', 
                    ready: false, hp: 100, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 
                });
            });
            
            this.net.playersRef.on('value', snap => { 
                this.net.players = snap.val() || {};
            });
            
            this.net.sessionRef.child('state').on('value', snap => { 
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') {
                    this.state = 'HANGAR'; // Host mandou começar, vai pro Hangar se equipar
                }
            });
        },

        update: function(ctx, w, h, pose) {
            let now = performance.now();
            let dt = Math.min((now - this.lastTime) / 1000, 0.05); 
            this.lastTime = now;
            
            if (this.cameraShake > 0) this.cameraShake *= 0.9;

            this._readPose(pose, w, h);

            if (this.state === 'LOBBY') { this._drawLobby(ctx, w, h, dt); return 0; }
            if (this.state === 'HANGAR') { this._drawHangar(ctx, w, h, dt); return 0; }
            if (this.state === 'CALIBRATION') { 
                this.timer -= dt; this._drawCalib(ctx, w, h); 
                if (this.timer <= 0) this._startMission(); 
                return 0; 
            }
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') { 
                this._drawEnd(ctx, w, h); 
                return this.sessionMoney; 
            }

            this._processPhysics(dt);
            this._processCombat(dt, w, h, now);
            this._processAI(dt, now);
            this._updateEntities(dt);
            this._updateRadar(dt);

            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');
            
            this._draw(ctx, w, h, now);
            
            return this.sessionMoney;
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

        // -----------------------------------------------------------------
        // 5. CONTROLES DO JOGADOR SUAVIZADOS
        // -----------------------------------------------------------------
        _readPose: function(pose, w, h) {
            let tR = 0, tP = 0; 
            this.pilot.active = false; this.pilot.headTilt = false; this.pilot.isBoosting = false;
            
            if (!pose?.keypoints) return;
            
            const kp = n => pose.keypoints.find(k => k.part === n || k.name === n);
            const rw = kp('right_wrist'), lw = kp('left_wrist');
            const rs = kp('right_shoulder'), ls = kp('left_shoulder');
            const rEar = kp('right_ear'), lEar = kp('left_ear');
            
            const pX = x => w - ((x / 640) * w); 
            const pY = y => (y / 480) * h;
            
            // Head tilt para Míssil
            if (rEar?.score > 0.4 && lEar?.score > 0.4 && Math.abs(pY(rEar.y) - pY(lEar.y)) > h * 0.05) {
                this.pilot.headTilt = true;
            }
            
            if (rw?.score > 0.3 && lw?.score > 0.3 && rs?.score > 0.3 && ls?.score > 0.3) {
                this.pilot.active = true;
                let w1 = { x: pX(rw.x), y: pY(rw.y) }; 
                let w2 = { x: pX(lw.x), y: pY(lw.y) };
                
                this.pilot.handR = w1; this.pilot.handL = w2;
                
                let hands = [w1, w2].sort((a, b) => a.x - b.x);
                let lH = hands[0]; let rH = hands[1]; let dx = rH.x - lH.x;
                
                // Roll (Virar)
                tR = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, Math.atan2(rH.y - lH.y, dx)));
                
                // Pitch (Subir/Descer) - SUAVIZADO
                let avgShoulderY = (pY(rs.y) + pY(ls.y)) / 2;
                let avgWristY = (lH.y + rH.y) / 2;
                let dy = avgWristY - avgShoulderY;
                
                let deadzone = h * 0.08; // Área morta confortável
                if (dy < -deadzone) {
                    tP = Math.min(1, Math.abs(dy + deadzone) / (h * 0.2)); // Sobe suave
                } else if (dy > deadzone) {
                    tP = -Math.min(1, Math.abs(dy - deadzone) / (h * 0.2)); // Desce suave
                } else {
                    tP = 0;
                }
                
                if (Math.abs(dx) < w * 0.15) this.pilot.isBoosting = true;
            }
            this.pilot.targetRoll = tR; this.pilot.targetPitch = tP;
        },

        _processPhysics: function(dt) {
            let wd = (this.ship.damage.rWing - this.ship.damage.lWing) * 0.05;
            let cl = Math.max(0.3, 1.0 - (this.ship.damage.body + this.ship.damage.engine) / 200);
            
            // Física macia para não girar/subir loucamente
            this.ship.rollVel += (this.pilot.targetRoll - this.ship.rollVel) * 3.0 * cl * dt;
            this.ship.pitchVel += (this.pilot.targetPitch - this.ship.pitchVel) * 2.5 * cl * dt;
            
            this.ship.roll = this.ship.rollVel;
            this.ship.pitch = this.ship.pitchVel;
            this.ship.yaw += this.ship.rollVel * 1.5 * dt; 
            
            this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));
            
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            let speedSq = this.ship.speed * this.ship.speed;
            let aoa = Math.abs(this.ship.pitchVel) * 10; 
            let lift = 0.00005 * speedSq * Math.max(0, 1 - aoa * 0.2);
            let drag = (0.0001 + 0.005 * aoa) * speedSq;
            
            this.ship.gForce = 1 + ((this.ship.pitchVel * this.ship.speed) / 600);
            if (Math.abs(this.ship.gForce) > 6) { 
                this.cameraShake = Math.max(this.cameraShake, Math.abs(this.ship.gForce) - 5); 
                window.Gfx?.shakeScreen(this.cameraShake); 
            }

            let maxSpeed = 3500 + (this.upgrades.engine * 500) - (this.ship.damage.engine * 20);
            if (this.pilot.isBoosting && this.ship.boost > 0) { 
                this.ship.speed += 2500 * dt; 
                this.ship.boost -= (50 / this.upgrades.boost) * dt; 
                Engine3D.fov += (1000 - Engine3D.fov) * dt * 5; 
            } else { 
                this.ship.boost = Math.min(100, this.ship.boost + 15 * dt); 
                Engine3D.fov += (800 - Engine3D.fov) * dt * 5; 
            }
            this.ship.speed = Math.max(600, Math.min(maxSpeed * (this.pilot.isBoosting ? 1.5 : 1), this.ship.speed - drag * dt + (fY * -600 * dt)));

            if (this.ship.speed > 4000 && fY < -0.5 && Math.abs(this.ship.gForce) > 7) { 
                this.ship.damage.body += 15 * dt; window.Gfx?.shakeScreen(8); if (Math.random() < 0.2) GameSfx.play('alarm'); 
            }

            let u = this.ship.speed * 20;
            this.ship.x += u * fX * dt; 
            this.ship.y += (u * fY * dt) + ((lift - 9.8 * 60) * dt * 0.1); 
            this.ship.z += u * fZ * dt;
            
            // RECUPERAÇÃO DE CHÃO (BOUNCE SUAVE)
            if (this.ship.y < 100) { 
                this.ship.y = 100; 
                if (this.ship.pitch < -0.1) {
                    this._takeDamage(15);
                    this.ship.pitchVel = 0.5; // Puxa o bico pra cima
                }
            }
            if (this.ship.y > 60000) this.ship.y = 60000;
        },

        // -----------------------------------------------------------------
        // 6. INTELIGÊNCIA ARTIFICIAL E COMBATE
        // -----------------------------------------------------------------
        _processAI: function(dt, now) {
            let maxE = this.perfTier === 'LOW' ? 4 : 8;
            let eC = this.entities.filter(e => e.hp > 0).length;
            let hasBoss = this.entities.find(e => e.type === 'boss');
            
            if (eC < maxE && Math.random() < 0.02) {
                let dist = 50000 + Math.random() * 30000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                let sx = this.ship.x + fX * dist + (Math.random() - 0.5) * 40000;
                let sz = this.ship.z + fZ * dist + (Math.random() - 0.5) * 40000;
                let r = Math.random();
                
                if (this.session.kills > 10 && r < 0.1 && !hasBoss) {
                    this.entities.push({ id: 'boss_'+now, type: 'boss', x: sx, y: 30000, z: sz, hp: 3000, maxHp: 3000, yaw: this.ship.yaw+Math.PI, phase: 1, timer: 0 });
                    if (window.System?.msg) window.System.msg("FORTALEZA VOADORA DETECTADA!");
                } else if (r < 0.4) {
                    this.entities.push({ id: 'e_'+now, type: 'tank', x: sx, y: 0, z: sz, hp: 300, yaw: Math.random()*Math.PI*2, timer: 0 });
                } else {
                    this.entities.push({ id: 'e_'+now, type: 'jet', x: sx, y: Math.max(2000, this.ship.y + (Math.random()-0.5)*10000), z: sz, hp: 150, yaw: this.ship.yaw+Math.PI, timer: 0 });
                }
            }

            for (let e of this.entities) {
                if (e.hp <= 0) continue;
                let dx = this.ship.x - e.x, dy = this.ship.y - e.y, dz = this.ship.z - e.z;
                let dP = Math.hypot(dx, dy, dz);
                
                if (dP > 200000) { e.hp = -1; continue; }

                if (e.type === 'tank') {
                    if (dP < 40000 && Math.random() < 0.04) {
                        this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: dx/dP*18000, vy: dy/dP*18000, vz: dz/dP*18000, isEnemy: true, life: 4.0 });
                    }
                    continue; 
                }

                if (e.type === 'jet') {
                    e.yaw = Math.atan2(dx, dz);
                    e.x += Math.sin(e.yaw) * 20000 * dt; 
                    e.z += Math.cos(e.yaw) * 20000 * dt;
                    if (dP < 40000 && Math.random() < 0.05) {
                        this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: dx/dP*35000, vy: dy/dP*35000, vz: dz/dP*35000, isEnemy: true, life: 4.0 });
                    }
                }

                if (e.type === 'boss') {
                    if (e.phase === 1 && e.hp < 2000) { e.phase = 2; if (window.System?.msg) window.System.msg("BOSS: MODO AGRESSIVO!"); }
                    if (e.phase === 2 && e.hp < 1000) { e.phase = 3; if (window.System?.msg) window.System.msg("BOSS: NÚCLEO EXPOSTO!"); }
                    
                    e.yaw = Math.atan2(dx, dz);
                    if (e.y < 15000) e.y += 5000 * dt;
                    if (e.phase === 3) e.x += Math.sin(now * 0.005) * 10000 * dt; 
                    
                    e.timer += dt; 
                    let fR = e.phase === 3 ? 0.3 : (e.phase === 2 ? 0.8 : 1.5);
                    if (e.timer > fR && dP < 70000) {
                        e.timer = 0; let bS = 45000;
                        this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: dx/dP*bS, vy: dy/dP*bS, vz: dz/dP*bS, isEnemy: true, life: 4.0 });
                        if(e.phase >= 2) {
                            let cx1 = e.x + Math.cos(e.yaw)*120, cz1 = e.z - Math.sin(e.yaw)*120;
                            let cx2 = e.x - Math.cos(e.yaw)*120, cz2 = e.z + Math.sin(e.yaw)*120;
                            this.bullets.push({ x: cx1, y: e.y, z: cz1, vx: (this.ship.x-cx1)/dP*bS, vy: dy/dP*bS, vz: (this.ship.z-cz1)/dP*bS, isEnemy: true, life: 4.0 });
                            this.bullets.push({ x: cx2, y: e.y, z: cz2, vx: (this.ship.x-cx2)/dP*bS, vy: dy/dP*bS, vz: (this.ship.z-cz2)/dP*bS, isEnemy: true, life: 4.0 });
                        }
                    }
                }
            }
        },

        _processCombat: function(dt, w, h, now) {
            this.combat.target = null;
            let rr = 100000 + (this.upgrades.radar * 20000);
            let closestZ = Infinity;

            // Busca Local Generosa
            for (let e of this.entities) {
                if (e.hp <= 0) continue;
                let p = Engine3D.project(e.x, e.y, e.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                let distToCenter = Math.hypot(p.x - w/2, p.y - h/2);
                
                // MIRA HOLOGRÁFICA: Aceita inimigos dentro de um círculo equivalente a 40% da tela
                if (p.visible && p.z > 500 && p.z < rr && distToCenter < w*0.4 && p.z < closestZ) {
                    closestZ = p.z; 
                    this.combat.target = e;
                }
            }

            // Busca Multiplayer Generosa
            if (this.mode === 'PVP') {
                for (let uid in this.net.players) {
                    if (uid === this.net.uid) continue;
                    let pD = this.net.players[uid];
                    if (pD.hp <= 0) continue;
                    let p = Engine3D.project(pD.x, pD.y, pD.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    let distToCenter = Math.hypot(p.x - w/2, p.y - h/2);
                    if (p.visible && p.z > 500 && p.z < rr && distToCenter < w*0.4 && p.z < closestZ) {
                        closestZ = p.z; 
                        this.combat.target = { isPlayer: true, uid: uid, x: pD.x, y: pD.y, z: pD.z, hp: pD.hp };
                    }
                }
            }

            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.3) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true; 
                    this.combat.lockTimer = 0.3;
                }
            } else {
                this.combat.locked = false; 
                this.combat.lockTimer = 0;
            }

            if (this.combat.isJammed) { 
                this.ship.overheat -= 30 * dt; 
                if (this.ship.overheat <= 20) { this.combat.isJammed = false; GameSfx.play('beep'); } 
            }

            // TIRO METRALHADORA (AUTOMÁTICO)
            if (this.combat.locked && this.combat.target && !this.combat.isJammed && now - this.combat.vulcanCd > 120) {
                this.combat.vulcanCd = now; 
                this.ship.overheat += (15 / this.upgrades.thermal);
                if (this.ship.overheat >= 100) { this.ship.overheat = 100; this.combat.isJammed = true; GameSfx.play('alarm'); }
                
                let spd = this.ship.speed * 20 + 45000;
                let dx = this.combat.target.x - this.ship.x + (Math.random() - 0.5) * 1500;
                let dy = this.combat.target.y - this.ship.y + (Math.random() - 0.5) * 1500;
                let dz = this.combat.target.z - this.ship.z;
                let d = Math.hypot(dx, dy, dz);
                
                this.bullets.push({ 
                    x: this.ship.x, y: this.ship.y - 30, z: this.ship.z, 
                    vx: dx/d*spd, vy: dy/d*spd, vz: dz/d*spd, 
                    isEnemy: false, life: 2.5 
                });
                GameSfx.play('vulcan'); window.Gfx?.shakeScreen(1);
            } else if (!this.combat.locked && !this.combat.isJammed) {
                this.ship.overheat = Math.max(0, this.ship.overheat - 10 * dt);
            }

            // TIRO MÍSSIL (CABEÇA)
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0 && this.combat.target) {
                this.combat.missileCd = 1.5; 
                let mSpd = this.ship.speed * 15 + 10000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fY = Math.sin(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                
                this.missiles.push({ 
                    x: this.ship.x, y: this.ship.y - 100, z: this.ship.z, 
                    vx: fX*mSpd + (Math.random()-0.5)*5000, vy: fY*mSpd - 2000, vz: fZ*mSpd + (Math.random()-0.5)*5000, 
                    speed: mSpd, target: this.combat.target, life: 8.0 
                });
                GameSfx.play('missile'); window.Gfx?.shakeScreen(5);
            }
        },

        _updateEntities: function(dt) {
            // Update Bullets
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                
                if (b.life <= 0 || b.y < 0) {
                    if(b.y < 0 && this.perfTier !== 'LOW') this.fx.push({x:b.x, y:0, z:b.z, life:1.0, c:'#789', s:100});
                    this.bullets.splice(i, 1); continue;
                }

                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.x, b.y - this.ship.y, b.z - this.ship.z) < 1500) {
                        this._takeDamage(10); this.bullets.splice(i, 1); continue;
                    }
                } else {
                    let hit = false;
                    for (let e of this.entities) {
                        if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < (e.type === 'boss' ? 8000 : 2500)) {
                            this._applyDamageToEnemy(e, 35);
                            this.fx.push({x: e.x, y: e.y, z: e.z, life: 1.0, c: '#f90', s: 100});
                            hit = true; break;
                        }
                    }
                    if (!hit && this.mode === 'PVP' && this.net.isHost) {
                        for (let uid in this.net.players) {
                            if (uid === this.net.uid) continue;
                            let p = this.net.players[uid];
                            if (p.hp > 0 && Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < 2500) {
                                window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${uid}/hp`).set(p.hp - 10);
                                this.fx.push({x: p.x, y: p.y, z: p.z, life: 1.0, c: '#f90', s: 100});
                                hit = true; break;
                            }
                        }
                    }
                    if (hit) { this.bullets.splice(i, 1); continue; }
                }
            }

            // Update Missiles
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.speed += 20000 * dt;
                
                if (m.target) {
                    // Check if player target is alive via network cache
                    if (m.target.isPlayer) {
                        let netP = this.net.players[m.target.uid];
                        if (!netP || netP.hp <= 0) m.target = null;
                        else { m.target.x = netP.x; m.target.y = netP.y; m.target.z = netP.z; m.target.hp = netP.hp; }
                    } else if (m.target.hp <= 0) m.target = null;
                }

                if (m.target) {
                    let dx = m.target.x - m.x, dy = m.target.y - m.y, dz = m.target.z - m.z;
                    let d = Math.hypot(dx, dy, dz);
                    let turn = (50000 + this.upgrades.missile * 10000) * dt;
                    m.vx += (dx/d)*turn; m.vy += (dy/d)*turn; m.vz += (dz/d)*turn;
                    let vD = Math.hypot(m.vx, m.vy, m.vz);
                    if (vD > m.speed) { m.vx = (m.vx/vD)*m.speed; m.vy = (m.vy/vD)*m.speed; m.vz = (m.vz/vD)*m.speed; }
                    
                    if (d < 3000) {
                        if (m.target.isPlayer) {
                            window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${m.target.uid}/hp`).set(m.target.hp - 60);
                            this.fx.push({x: m.target.x, y: m.target.y, z: m.target.z, life: 2.0, c: '#f33', s: 400});
                            this.money += 800; this.sessionMoney += 800;
                            if (window.Profile && window.DB && window.System?.playerId) { window.Profile.coins = this.money; window.DB.ref('users/' + window.System.playerId + '/coins').set(this.money); }
                        } else {
                            this._applyDamageToEnemy(m.target, 500);
                        }
                        this.missiles.splice(i, 1); GameSfx.play('boom'); window.Gfx?.shakeScreen(5); continue;
                    }
                }
                
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                
                if (m.y < 0) { this.missiles.splice(i, 1); this.fx.push({x: m.x, y: 0, z: m.z, life: 2.0, c: '#a55', s: 200}); continue; }
                if (this.perfTier === 'HIGH' || Math.random() < 0.5) this.fx.push({x: m.x, y: m.y, z: m.z, life: 1.5, c: 'rgba(220,220,220,0.6)', s: 500});
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Cleanup Fx/Floaters/Dead Enemies
            for (let i = this.fx.length - 1; i >= 0; i--) {
                this.fx[i].life -= dt; if (this.fx[i].life <= 0) this.fx.splice(i, 1);
            }
            for (let i = this.floaters.length - 1; i >= 0; i--) {
                this.floaters[i].life -= dt; this.floaters[i].y += 100*dt; if (this.floaters[i].life <= 0) this.floaters.splice(i, 1);
            }
            this.entities = this.entities.filter(e => e.hp > 0);
        },

        _applyDamageToEnemy: function(e, amount) {
            e.hp -= amount;
            if (e.hp <= 0) this._kill(e);
        },

        _takeDamage: function(amount) {
            this.ship.hp -= amount; this.cameraShake = 15; window.Gfx?.shakeScreen(15); 
            this.fx.push({x: this.ship.x, y: this.ship.y, z: this.ship.z + 500, life: 1.0, c: '#f00', s: 200}); GameSfx.play('boom');
            let pts = ['lWing', 'rWing', 'engine', 'body'], hP = pts[Math.floor(Math.random() * pts.length)]; this.ship.damage[hP] += amount * 0.5;
            if (this.ship.hp <= 0) this._endGame('GAMEOVER');
        },

        _kill: function(e) {
            let iB = e.type === 'boss', rew = iB ? 2500 : (e.type === 'tank' ? 300 : 200);
            GameSfx.play('boom'); this.cameraShake = iB ? 40 : 10; window.Gfx?.shakeScreen(this.cameraShake);
            this.fx.push({x: e.x, y: e.y, z: e.z, life: 2.0, c: '#ff3300', s: iB ? 1500 : 400});
            this.fx.push({x: e.x, y: e.y, z: e.z, life: 2.5, c: '#f1c40f', s: iB ? 2000 : 600});
            
            if (iB) {
                let expTimer = setInterval(() => {
                    if (this.state !== 'PLAYING') clearInterval(expTimer);
                    this.fx.push({x: e.x + (Math.random()-0.5)*5000, y: e.y + (Math.random()-0.5)*5000, z: e.z + (Math.random()-0.5)*5000, life: 2.0, c: '#ff3300', s: 800});
                    GameSfx.play('boom');
                }, 400); setTimeout(() => clearInterval(expTimer), 3500);
            }
            
            this.floaters.push({x: e.x, y: e.y, z: e.z, life: 2.5, text: `+ R$${rew}`});
            this.session.kills++; this.money += rew; this.sessionMoney += rew; this.slowMoTimer = iB ? 4.0 : 1.0;
            
            if (window.Profile && window.DB && window.System?.playerId) { 
                window.Profile.coins = this.money; window.DB.ref('users/' + window.System.playerId + '/coins').set(this.money); 
            }
            
            if (this.session.kills >= this.session.goal && this.mode === 'SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res; GameSfx.stop();
            setTimeout(() => { 
                if (window.System?.gameOver) window.System.gameOver(this.session.kills * 150, res === 'VICTORY', this.sessionMoney); 
                else if (window.System?.home) window.System.home(); 
            }, 4000);
        },

        _startMission: function() {
            this.state = 'PLAYING'; this.ship.x = (Math.random() - 0.5) * 10000; this.ship.z = (Math.random() - 0.5) * 10000; GameSfx.startEngine();
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(() => { 
                    if (this.state === 'PLAYING' && this.net.playersRef) {
                        this.net.playersRef.child(this.net.uid).update({x: this.ship.x, y: this.ship.y, z: this.ship.z, pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp});
                    }
                }, 100);
            }
        },

        // -----------------------------------------------------------------
        // 7. RADAR TÁTICO
        // -----------------------------------------------------------------
        _updateRadar: function(dt) {
            this.radarTimer += dt; let uR = this.perfTier === 'LOW' ? 0.3 : 0.05;
            if (this.radarTimer >= uR) {
                this.radarTimer = 0; let rg = this.perfTier === 'LOW' ? 40000 : 80000, rgSq = rg * rg, cY = Math.cos(-this.ship.yaw), sY = Math.sin(-this.ship.yaw);
                
                let processRadar = (arr) => {
                    for(let e of arr) {
                        let dx = e.x - this.ship.x, dz = e.z - this.ship.z;
                        if(dx*dx+dz*dz <= rgSq) { e.radVisible = true; e.radX = dx*cY - dz*sY; e.radZ = dx*sY + dz*cY; e.radDy = e.y - this.ship.y; }
                        else e.radVisible = false;
                    }
                };
                
                processRadar(this.entities);
                processRadar(this.missiles);
                if (this.mode === 'PVP' || this.mode === 'COOP') {
                    for(let uid in this.net.players) {
                        if(uid === this.net.uid) continue;
                        let p = this.net.players[uid];
                        let dx = p.x - this.ship.x, dz = p.z - this.ship.z;
                        if(dx*dx+dz*dz <= rgSq) { p.radVisible = true; p.radX = dx*cY - dz*sY; p.radZ = dx*sY + dz*cY; p.radDy = p.y - this.ship.y; }
                        else p.radVisible = false;
                    }
                }
            }
        },

        _drawRadar: function(ctx, w, h, now) {
            let rad = Math.min(w * 0.15, 70), cx = rad + 15, cy = h - rad - 45; 
            ctx.fillStyle = 'rgba(10,30,20,0.6)'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(0,255,100,0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, rad * 0.66, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, rad * 0.33, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.stroke();
            
            let rg = this.perfTier === 'LOW' ? 40000 : 80000;
            
            let drawDot = (e, col, sz) => {
                if(!e.radVisible) return;
                let px = cx + (e.radX / rg) * rad, py = cy - (e.radZ / rg) * rad; 
                if(Math.hypot(px - cx, py - cy) > rad) return;
                ctx.fillStyle = col;
                if(e.radDy > 2500) { ctx.beginPath(); ctx.moveTo(px, py - sz); ctx.lineTo(px - sz, py + sz); ctx.lineTo(px + sz, py + sz); ctx.fill(); }
                else if(e.radDy < -2500) { ctx.beginPath(); ctx.moveTo(px, py + sz); ctx.lineTo(px - sz, py - sz); ctx.lineTo(px + sz, py - sz); ctx.fill(); }
                else { ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill(); }
            };

            for(let e of this.entities) drawDot(e, e.type==='boss'?(now%500<250?'#f03':'#fff'):'#f00', e.type==='boss'?5:3);
            for(let m of this.missiles) drawDot(m, '#ff0', 2);
            if (this.mode !== 'SINGLE') {
                for(let uid in this.net.players) {
                    if(uid !== this.net.uid && this.net.players[uid].hp > 0) drawDot(this.net.players[uid], this.mode==='PVP'?'#f00':'#0ff', 4);
                }
            }
            
            ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx + 4, cy + 4); ctx.fill();
        },

        // -----------------------------------------------------------------
        // 8. RENDERIZAÇÃO GERAL E MENUS
        // -----------------------------------------------------------------
        _drawHangar: function(ctx, w, h, dt) {
            ctx.fillStyle = 'rgba(15, 20, 25, 0.98)'; ctx.fillRect(0, 0, w, h);
            const fz = Math.min(w * 0.04, 20);
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'center'; ctx.font = `bold ${fz*1.5}px "Russo One"`; ctx.fillText('HANGAR - UPGRADES', w/2, h*0.1);
            ctx.fillStyle = '#2ecc71'; ctx.fillText(`SALDO GLOBAL: R$ ${this.money}`, w/2, h*0.18);
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
                    isHoveringAny = true; if (this.hoveredItem !== item.id) { this.hoveredItem = item.id; this.hoverTime = 0; }
                    this.hoverTime += dt; ctx.fillStyle = 'rgba(0, 255, 204, 0.3)'; ctx.fillRect(rect.x, rect.y, rect.w * Math.min(1, this.hoverTime / 1.5), rect.h);
                    if (this.hoverTime >= 1.5) {
                        if (item.isBtn) { 
                            if(this.mode === 'SINGLE') { this.state = 'CALIBRATION'; this.timer = 4.0; }
                            else { this._initNet(); }
                            GameSfx.play('buy'); 
                        }
                        else if (this.money >= item.cost && this.upgrades[item.id] < item.max) { 
                            this.money -= item.cost; 
                            if (window.Profile && window.DB && window.System?.playerId) { window.Profile.coins = this.money; window.DB.ref('users/' + window.System.playerId + '/coins').set(this.money); }
                            this.upgrades[item.id]++; GameSfx.play('buy'); this.hoverTime = 0; 
                        } 
                        else { GameSfx.play('alarm'); this.hoverTime = 0; }
                    }
                }
                ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `bold ${fz}px Arial`;
                if (item.isBtn) { ctx.textAlign = 'center'; ctx.fillStyle = '#e74c3c'; ctx.fillText(item.name, w/2, item.y + fz*0.3); } 
                else { ctx.fillText(`${item.name} (LVL ${item.lvl}/${item.max})`, rect.x + 20, item.y + fz*0.3); ctx.textAlign = 'right'; ctx.fillStyle = (this.money >= item.cost && item.lvl < item.max) ? '#f1c40f' : '#7f8c8d'; ctx.fillText(item.lvl >= item.max ? 'MÁXIMO' : `R$ ${item.cost}`, rect.x + rect.w - 20, item.y + fz*0.3); }
            });
            if (!isHoveringAny) this.hoverTime = 0;
            if (this.pilot.active) { ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(this.pilot.handR.x, this.pilot.handR.y, 15, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `bold 12px Arial`; ctx.fillText("CURSOR", this.pilot.handR.x, this.pilot.handR.y - 20); }
        },

        _drawLobby: function(ctx, w, h, dt) {
            ctx.fillStyle = 'rgba(10, 20, 30, 0.98)'; ctx.fillRect(0, 0, w, h); const fz = Math.min(w * 0.045, 22);
            ctx.fillStyle = '#2ecc71'; ctx.textAlign = 'center'; ctx.font = `bold ${fz * 1.5}px "Russo One"`; ctx.fillText('FORÇAS ARMADAS BR', w / 2, h * 0.15);
            
            let psCount = Object.keys(this.net.players).length;
            ctx.font = `bold ${fz}px Arial`; ctx.fillStyle = '#fff'; ctx.fillText(`PILOTOS NA BASE: ${psCount + 1}`, w / 2, h * 0.25);
            
            let py = h * 0.35; ctx.fillStyle = '#2ecc71'; ctx.fillText(`[HOST] EU`, w / 2, py); py += 35;
            for (let uid in this.net.players) { 
                let p = this.net.players[uid]; 
                ctx.fillStyle = p.ready ? '#2ecc71' : '#e74c3c'; 
                ctx.fillText(`[${p.ready ? 'PRONTO' : 'ESPERA'}] ${p.name}`, w / 2, py); py += 35; 
            }
            
            // BOTÃO DO LOBBY COM CURSOR
            let btnW = Math.min(300, w * 0.8), btnH = 60, btnX = w / 2 - btnW / 2, btnY = h * 0.80;
            let amIReady = this.net.players[this.net.uid]?.ready;
            
            ctx.fillStyle = this.net.isHost ? (psCount >= 0 ? '#c0392b' : '#34495e') : (amIReady ? '#f39c12' : '#2980b9'); 
            ctx.fillRect(btnX, btnY, btnW, btnH);
            
            let hx = this.pilot.handR.x, hy = this.pilot.handR.y;
            if (this.pilot.active && hx > btnX && hx < btnX + btnW && hy > btnY && hy < btnY + btnH) {
                ctx.strokeStyle = '#0f6'; ctx.lineWidth = 4; ctx.strokeRect(btnX, btnY, btnW, btnH);
                this.hoverTime += dt;
                ctx.fillStyle = 'rgba(0, 255, 100, 0.3)'; ctx.fillRect(btnX, btnY, btnW * Math.min(1, this.hoverTime / 1.5), btnH);
                if (this.hoverTime >= 1.5) {
                    GameSfx.play('buy'); this.hoverTime = 0;
                    if (this.net.isHost) {
                        this.net.sessionRef.child('state').set('PLAYING');
                    } else {
                        this.net.playersRef.child(this.net.uid).update({ ready: true });
                    }
                }
            } else {
                this.hoverTime = 0;
            }

            ctx.fillStyle = '#fff'; ctx.font = `bold ${fz}px "Russo One"`; 
            let txt = this.net.isHost ? 'LANÇAR MISSÃO' : (amIReady ? 'AGUARDANDO HOST' : 'MARCAR PRONTO');
            ctx.fillText(txt, w / 2, btnY + 38);

            // DESENHAR CURSOR
            if (this.pilot.active) { 
                ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI*2); ctx.fill(); 
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `bold 12px Arial`; ctx.fillText("CURSOR", hx, hy - 20); 
            }
        },

        _drawCalib: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(5, 15, 10, 0.95)'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(0, 255, 100, 0.3)'; ctx.lineWidth = 2; ctx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
            const fz = Math.min(w * 0.045, 20); ctx.fillStyle = '#0f6'; ctx.textAlign = 'center'; ctx.font = `bold ${fz * 1.5}px "Russo One"`; ctx.fillText('SISTEMAS ONLINE', w / 2, h * 0.25);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${fz}px Arial`; ctx.fillText('JUNTE AS MÃOS NO CENTRO = BOOST', w / 2, h * 0.45); ctx.fillStyle = '#f1c40f'; ctx.fillText('MÃO ACIMA DOS OMBROS = SOBE', w / 2, h * 0.55); ctx.fillText('MÃO NA BARRIGA = DESCE', w / 2, h * 0.6);
            let pct = 1 - this.timer / 4; ctx.fillStyle = '#111'; ctx.fillRect(w * 0.2, h * 0.7, w * 0.6, 15); ctx.fillStyle = '#0f6'; ctx.fillRect(w * 0.2, h * 0.7, (w * 0.6) * pct, 15);
        },

        _draw: function(ctx, w, h, now) {
            ctx.save();
            if(this.cameraShake>0.5) ctx.translate((Math.random()-0.5)*this.cameraShake, (Math.random()-0.5)*this.cameraShake);
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            this._drawVectorHUD(ctx,w,h,now); 
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
            
            // CHÃO 3D RÁPIDO
            if (this.ship.y < 60000 && this.perfTier !== 'LOW') {
                ctx.strokeStyle = 'rgba(0, 255, 100, 0.1)'; ctx.beginPath();
                let st = 8000, sx = Math.floor(this.ship.x/st)*st - st*10, sz = Math.floor(this.ship.z/st)*st - st*10;
                for(let x=0; x<=20; x++) {
                    for(let z=0; z<=20; z++) {
                        let p = Engine3D.project(sx+x*st, 0, sz+z*st, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                        if(p.visible && p.s > 0.005) { 
                            ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y); ctx.moveTo(p.x, p.y - 20*p.s); ctx.lineTo(p.x, p.y + 20*p.s);
                        }
                    }
                }
                ctx.stroke();
            }
            ctx.restore();
        },

        _drawMesh: function(ctx, mesh, e, w, h) {
            let sc = e.type==='boss'?200:(e.type==='tank'?80:60), pF = [];
            for(let f of mesh.f) {
                let col=f[f.length-1], pts=[], zS=0, vis=true;
                for(let i=0; i<f.length-1; i++) {
                    let v=mesh.v[f[i]], wP=Engine3D.rotate(v.x*sc,v.y*sc,v.z*sc,0,e.yaw,0); wP.x+=e.x; wP.y+=e.y; wP.z+=e.z;
                    let pr=Engine3D.project(wP.x,wP.y,wP.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                    if(!pr.visible) vis=false; pts.push(pr); zS+=pr.z;
                }
                if(vis) pF.push({pts:pts, z:zS/(f.length-1), color:col});
            }
            pF.sort((a,b)=>b.z-a.z);
            for(let f of pF) {
                ctx.fillStyle=f.color; ctx.strokeStyle='rgba(0,255,100,0.5)'; ctx.lineWidth=1;
                ctx.beginPath(); ctx.moveTo(f.pts[0].x,f.pts[0].y); for(let i=1;i<f.pts.length;i++) ctx.lineTo(f.pts[i].x,f.pts[i].y);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        },

        _drawEntities: function(ctx,w,h) {
            let buf=[];
            for(let e of this.entities) { let p = Engine3D.project(e.x,e.y,e.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(p.visible) buf.push({ p: p, t: 'e', o: e }); }
            if (this.mode !== 'SINGLE') { for(let uid in this.net.players) { if (uid===this.net.uid) continue; let e = this.net.players[uid]; if(e.hp<=0)continue; let p = Engine3D.project(e.x,e.y,e.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(p.visible) buf.push({ p: p, t: 'p', o: e, id: uid }); } }
            for(let b of this.bullets) { let p = Engine3D.project(b.x,b.y,b.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(p.visible) buf.push({ p: p, t: 'b', o: b }); }
            for(let m of this.missiles) { let p = Engine3D.project(m.x,m.y,m.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(p.visible) buf.push({ p: p, t: 'm', o: m }); }
            for(let f of this.fx) { let p = Engine3D.project(f.x,f.y,f.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(p.visible) buf.push({ p: p, t: 'f', o: f }); }
            for(let c of this.clouds) { let p = Engine3D.project(c.x,c.y,c.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(p.visible) buf.push({ p: p, t: 'c', o: c }); }
            
            buf.sort((a,b)=>b.p.z-a.p.z);
            
            buf.forEach(d=>{
                let pr=d.p, s=pr.s, e=d.o;
                if(d.t==='c') { ctx.fillStyle=this.environment.isNight?'rgba(50,50,60,0.08)':'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(pr.x,pr.y,e.size*s,0,Math.PI*2); ctx.fill(); }
                else if(d.t==='e' || d.t==='p') {
                    let mesh = e.type==='tank'?MESHES.tank:(e.type==='boss'?MESHES.boss:MESHES.jet);
                    this._drawMesh(ctx,mesh,e,w,h);
                    
                    if(d.t==='p') { ctx.fillStyle='#0ff'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText(e.name||'ALIADO',pr.x,pr.y-150*s-10); }
                    
                    let isLocked = this.combat.target && (d.t==='p' ? this.combat.target.uid === d.id : this.combat.target.id === e.id);
                    let bs = Math.max(20, (e.type==='boss'?800:250)*s);
                    
                    // MIRA HOLOGRÁFICA NO ALVO
                    if (isLocked) {
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 3; let b = bs*1.2; ctx.beginPath();
                        ctx.moveTo(pr.x - b, pr.y - b + 10); ctx.lineTo(pr.x - b, pr.y - b); ctx.lineTo(pr.x - b + 10, pr.y - b);
                        ctx.moveTo(pr.x + b - 10, pr.y - b); ctx.lineTo(pr.x + b, pr.y - b); ctx.lineTo(pr.x + b, pr.y - b + 10);
                        ctx.moveTo(pr.x - b, pr.y + b - 10); ctx.lineTo(pr.x - b, pr.y + b); ctx.lineTo(pr.x - b + 10, pr.y + b);
                        ctx.moveTo(pr.x + b - 10, pr.y + b); ctx.lineTo(pr.x + b, pr.y + b); ctx.lineTo(pr.x + b, pr.y + b - 10);
                        ctx.stroke(); ctx.fillStyle='#f03'; ctx.font=`bold ${Math.max(12,w*0.025)}px Arial`; ctx.textAlign='center'; ctx.fillText('LOCK',pr.x,pr.y+b+15); 
                    } else if(d.t==='e') { ctx.strokeStyle=e.type==='tank'?'rgba(243,156,18,0.8)':'rgba(231,76,60,0.6)'; ctx.lineWidth=1; ctx.strokeRect(pr.x-bs,pr.y-bs,bs*2,bs*2); }
                }
                else if(d.t==='b') { if(e.tracer) { ctx.strokeStyle=e.c; ctx.lineWidth=Math.max(1,e.s*s); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(pr.x,pr.y); ctx.lineTo(pr.x-e.vx*0.01*s,pr.y-e.vy*0.01*s); ctx.stroke(); } else { ctx.globalCompositeOperation='lighter'; ctx.fillStyle=e.isEnemy?'#f00':'#ff0'; ctx.beginPath(); ctx.arc(pr.x,pr.y,Math.max(2,10*s),0,Math.PI*2); ctx.fill(); ctx.globalCompositeOperation='source-over'; } }
                else if(d.t==='m') { ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(pr.x,pr.y,Math.max(3,30*s),0,Math.PI*2); ctx.fill(); }
                else if(d.t==='f') { ctx.globalAlpha=Math.max(0,e.life); ctx.fillStyle=e.c; ctx.beginPath(); ctx.arc(pr.x,pr.y,Math.max(1,e.s*s),0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }
            });
            for(let f of this.floaters) { let pr = Engine3D.project(f.x,f.y,f.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h); if(pr.visible) { ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(14,2000*pr.s)}px Arial`; ctx.textAlign='center'; ctx.fillText(f.text,pr.x,pr.y); } }
        },

        _drawVectorHUD: function(ctx, w, h, now){
            let cx=w/2, cy=h/2;
            
            // 1. MIRA CENTRAL ESTILO COLCHETES [  ]
            ctx.strokeStyle='rgba(0,255,100,0.8)'; ctx.lineWidth=2;
            ctx.beginPath(); 
            ctx.moveTo(cx - 30, cy - 10); ctx.lineTo(cx - 30, cy + 10); 
            ctx.moveTo(cx - 30, cy - 10); ctx.lineTo(cx - 15, cy - 10);
            ctx.moveTo(cx - 30, cy + 10); ctx.lineTo(cx - 15, cy + 10);
            ctx.moveTo(cx + 30, cy - 10); ctx.lineTo(cx + 30, cy + 10); 
            ctx.moveTo(cx + 30, cy - 10); ctx.lineTo(cx + 15, cy - 10);
            ctx.moveTo(cx + 30, cy + 10); ctx.lineTo(cx + 15, cy + 10);
            ctx.stroke(); 
            ctx.fillStyle = 'rgba(0, 255, 100, 0.8)'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill();

            // 2. RISQUINHOS LATERAIS (-)
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll); ctx.beginPath(); ctx.rect(-w/2, -h/2, w, h); ctx.clip();
            let pDeg = this.ship.pitch * 180 / Math.PI, spacing = h * 0.1; 
            for(let i = -90; i <= 90; i += 10) {
                if (i === 0) continue;
                let yo = (pDeg - i) * (spacing / 10), rw = w * 0.2; 
                ctx.beginPath(); if (i < 0) ctx.setLineDash([10, 10]); else ctx.setLineDash([]);
                ctx.moveTo(-cx + 20, yo); ctx.lineTo(-cx + 20 + rw, yo); ctx.moveTo(cx - 20, yo); ctx.lineTo(cx - 20 - rw, yo); ctx.stroke();
                ctx.setLineDash([]); ctx.font = `bold 12px 'Chakra Petch'`; ctx.fillStyle = 'rgba(0,255,100,0.8)';
                ctx.textAlign = 'left'; ctx.fillText(Math.abs(i), -cx + 25 + rw, yo + 4); ctx.textAlign = 'right'; ctx.fillText(Math.abs(i), cx - 25 - rw, yo + 4);
            }
            ctx.restore();

            // 3. MANCHE INFERIOR I____I (YOKE REAL)
            ctx.save();
            let yokeScale = Math.min(w * 0.2, 100); 
            ctx.translate(cx, h - 50 + (this.pilot.targetPitch * 30)); 
            ctx.rotate(this.pilot.targetRoll); 
            ctx.strokeStyle = '#0f6'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, 50); // Coluna
            ctx.moveTo(-yokeScale, 0); ctx.lineTo(yokeScale, 0); // Barra base
            ctx.moveTo(-yokeScale, 0); ctx.lineTo(-yokeScale, -yokeScale*0.5); // Chifre Esq
            ctx.moveTo(yokeScale, 0); ctx.lineTo(yokeScale, -yokeScale*0.5); // Chifre Dir
            ctx.stroke();
            ctx.restore();

            // 4. TEXTOS DE VELOCIDADE E ALTITUDE
            ctx.fillStyle = '#0f6'; ctx.textAlign = 'left'; ctx.font = `bold 16px 'Russo One'`;
            ctx.fillText(`VEL: ${Math.floor(this.ship.speed)} KT`, 15, 30);
            ctx.fillText(`ALT: ${Math.floor(this.ship.y)} FT`, 15, 50);
            let hdg=(this.ship.yaw*180/Math.PI)%360; if(hdg<0) hdg+=360; ctx.fillText(`RUMO: ${Math.floor(hdg)}°`, 15, 70);

            // BARRAS: Boost & Overheat
            const bX = cx + 50, bY = h - 60, cW = w * 0.3; 
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bX, bY, cW, 10); ctx.fillRect(bX, bY + 15, cW, 10);
            ctx.fillStyle = '#3498db'; ctx.fillRect(bX, bY, cW * (this.ship.boost/100), 10); 
            ctx.fillStyle = this.combat.isJammed ? '#e74c3c' : '#e67e22'; ctx.fillRect(bX, bY + 15, cW * (this.ship.overheat/100), 10); 
            ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `bold 10px Arial`;
            ctx.fillText("BOOST", bX - 45, bY + 9); ctx.fillText("CALOR", bX - 45, bY + 24);

            // G-Force & Dano
            ctx.fillStyle = '#0f6'; ctx.textAlign = 'right'; ctx.font = `bold 14px Arial`;
            ctx.fillText(`G-FORCE: ${this.ship.gForce.toFixed(1)}`, w - 15, 30);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`, w - 15, 50);
            ctx.fillStyle = '#f1c40f'; ctx.fillText(`R$: ${this.money}`, w - 15, 70);
            
            // AVISOS CENTRAIS
            ctx.textAlign='center';
            if(this.combat.target && this.combat.locked) { 
                ctx.fillStyle='#f03'; ctx.font=`bold 20px 'Russo One'`; ctx.fillText("FOGO AUTORIZADO!",cx,h*0.70); 
                if(this.combat.missileCd<=0) { ctx.fillStyle='#0ff'; ctx.font=`bold 12px Arial`; ctx.fillText("INCLINE CABEÇA P/ MÍSSIL",cx,h*0.75); } 
            }
            if(this.combat.isJammed) { ctx.fillStyle='#f00'; ctx.font=`bold 24px 'Russo One'`; ctx.fillText("ARMA SOBREAQUECIDA!",cx,h*0.65); }
            if(!this.pilot.active) { ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,cy-20,w,40); ctx.fillStyle='#f00'; ctx.font=`bold 16px Arial`; ctx.textAlign='center'; ctx.fillText("MÃOS NÃO DETECTADAS!",cx,cy+5); }
        },

        _drawEnd: function(ctx,w,h){
            this._draw(ctx,w,h,performance.now()); ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
            const fz=Math.min(w*0.06,35); ctx.textAlign='center'; ctx.font=`bold ${fz}px "Russo One"`; ctx.fillStyle=this.state==='VICTORY'?'#2ecc71':'#e74c3c'; ctx.fillText(this.state==='VICTORY'?'SUCESSO':'DESTRUÍDO',w/2,h/2-fz,w*0.9);
            ctx.fillStyle='#f1c40f'; ctx.font=`bold ${fz*0.6}px Arial`; ctx.fillText(`GANHO: + R$ ${this.sessionMoney}`,w/2,h/2+fz,w*0.9); ctx.fillStyle='#fff'; ctx.fillText(`ABATES: ${this.session.kills}`,w/2,h/2+fz*2,w*0.9);
        }
    };

    const register = () => {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '🚀', Game, {
                camera: 'user',
                phases: [
                    { id: 'mission1', name: 'TREINO VS. IA', desc: 'Mão Acima = Sobe. Na Barriga = Desce. Metralhadora Automática.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'SQUADRON CO-OP', desc: 'Junte-se a aliados contra a IA.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Combate aéreo multiplayer.', mode: 'PVP', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) { const check = setInterval(() => { if (register()) clearInterval(check); }, 100); }
})();