// =============================================================================
// AERO STRIKE SIMULATOR: BRAZILIAN ARMED FORCES EDITION (PLATINUM V7.0)
// ENGINE: Yoke Fixo Absolute, Física Ombro-Pulso, HUD Ultra-Responsivo, Auto-Combat
// =============================================================================
(function() {
    "use strict";

    // --- ENGINE MATEMÁTICA 3D ---
    const Engine3D = {
        fov: 800,
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

    // --- SISTEMA DE ÁUDIO ---
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
            this.engineSrc.buffer = buf; this.engineSrc.loop = true;
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
        },
        stop: function() { if (this.engineSrc) { try { this.engineSrc.stop(); } catch(e){} this.engineSrc = null; } }
    };

    // --- CORE DO JOGO ---
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30 },
        ship: { hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 },
        pilot: { active: false, targetRoll: 0, targetPitch: 0, headTilt: false },
        timer: 4.0,
        entities: [], bullets: [], missiles: [], clouds: [], fx: [], floaters: [], terrain: [],
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null, loop: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false, stars: [] },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30 };
            this.ship = { hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 };
            this.pilot = { active: false, targetRoll: 0, targetPitch: 0, headTilt: false };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.fx = []; this.floaters = []; this.terrain = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            
            this._setupEnvironment();
            for (let i = 0; i < 60; i++) this.clouds.push({ x: (Math.random()-0.5)*120000, y: 8000+Math.random()*15000, z: (Math.random()-0.5)*120000, size: 4000+Math.random()*8000 });
            
            for (let i = 0; i < 80; i++) {
                this.terrain.push({
                    x: (Math.random()-0.5)*200000, z: (Math.random()-0.5)*200000, w: 2000 + Math.random()*4000, h: 500 + Math.random()*3000,
                    c: this.environment.isNight ? `rgb(${Math.random()*30},${30+Math.random()*40},${Math.random()*30})` : `rgb(${50+Math.random()*50},${60+Math.random()*40},${40+Math.random()*30})`
                });
            }

            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random()*9999);
            this.mode = faseData?.mode || 'SINGLE';
            
            if (this.mode !== 'SINGLE' && window.DB) this._initNet();
            else { this.state = 'CALIBRATION'; this.timer = 4.0; }
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

        _initNet: function() {
            this.state = 'LOBBY'; this.net.players = {};
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
                this.net.playersRef.child(this.net.uid).set({ name: window.Profile?.username || 'PILOTO', ready: false, hp: 100, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 });
            });
            this.net.playersRef.on('value', snap => { this.net.players = snap.val() || {}; });
            this.net.sessionRef.child('state').on('value', snap => {
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') { this.state = 'CALIBRATION'; this.timer = 4.0; }
            });
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            const dt = Math.min((now - this.lastTime) / 1000, 0.05);
            this.lastTime = now;

            if (this.state === 'LOBBY') { this._drawLobby(ctx, w, h); return 0; }
            
            this._readPose(pose, w, h, dt);
            
            if (this.state === 'CALIBRATION') {
                this.timer -= dt;
                this._drawCalib(ctx, w, h);
                if (this.timer <= 0) this._startMission();
                return 0;
            }
            
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this._drawEnd(ctx, w, h);
                return this.session.cash;
            }

            // FÍSICA E MOVIMENTO
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            this.ship.speed += (fY * -600 * dt);
            this.ship.speed = Math.max(800, Math.min(3500, this.ship.speed));

            let units = this.ship.speed * 20;
            this.ship.x += units * fX * dt; this.ship.y += units * fY * dt; this.ship.z += units * fZ * dt;
            
            if (this.ship.y < 100) { 
                this.ship.y = 100; 
                if(this.ship.pitch < -0.1) { this.ship.hp -= 20; window.Gfx?.shakeScreen(20); GameSfx.play('boom'); this.ship.pitch = 0.2; }
            }
            if (this.ship.y > 40000) this.ship.y = 40000;

            this._processCombat(dt, w, h, now);
            this._spawnEnemies();
            this._updateEntities(dt, now);
            this._updateBullets(dt);
            this._updateMissiles(dt, fX, fY, fZ);
            this._cleanupFx();

            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');

            this._draw(ctx, w, h);
            return this.session.cash + this.session.kills * 10;
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

        // --- LÓGICA DE CONTROLE PLATINUM: OMBROS VS PULSOS (INFALÍVEL) ---
        _readPose: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false;
            this.pilot.headTilt = false;
            
            if (pose?.keypoints) {
                const kp = name => pose.keypoints.find(k => k.part === name || k.name === name);
                const rw = kp('right_wrist'), lw = kp('left_wrist');
                const rs = kp('right_shoulder'), ls = kp('left_shoulder');
                const rEar = kp('right_ear'), lEar = kp('left_ear');
                
                // Conversão resolvendo o espelhamento da câmera: w - (k.x / 640 * w)
                const pX = x => w - ((x / 640) * w); 
                const pY = y => (y / 480) * h;
                
                // Míssil Head Tilt
                if (rEar?.score > 0.4 && lEar?.score > 0.4 && Math.abs(pY(rEar.y) - pY(lEar.y)) > h * 0.05) {
                    this.pilot.headTilt = true;
                }
                
                if (rw?.score > 0.3 && lw?.score > 0.3 && rs?.score > 0.3 && ls?.score > 0.3) {
                    inputDetected = true;
                    
                    let w1 = { x: pX(rw.x), y: pY(rw.y) };
                    let w2 = { x: pX(lw.x), y: pY(lw.y) };
                    
                    // Identifica visualmente qual mão está na Esquerda/Direita da TELA
                    let hands = [w1, w2].sort((a,b) => a.x - b.x);
                    let sLeft = hands[0]; 
                    let sRight = hands[1]; 
                    
                    // 1. ROLL (Giro): Se a mão direita da tela subir (Y menor), vira pra esquerda (Negativo).
                    let dy = sRight.y - sLeft.y;
                    let dx = sRight.x - sLeft.x;
                    // Multiplicado por -1 para que Subir Mão Direita = Curva para Direita.
                    trgRoll = -Math.atan2(dy, dx);
                    // Limite angular realista
                    trgRoll = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, trgRoll));
                    
                    // 2. PITCH (Subir/Descer): Referência Absoluta nos Ombros do Jogador.
                    let avgShoulderY = (pY(rs.y) + pY(ls.y)) / 2;
                    let avgWristY = (sLeft.y + sRight.y) / 2;
                    
                    // Y da tela cresce para baixo. 
                    // Se os pulsos estão ACIMA dos ombros, deltaY é negativo -> Sobe.
                    let deltaY = avgWristY - avgShoulderY;
                    let deadzone = h * 0.05; // Margem de segurança na altura do peito
                    
                    if (deltaY < -deadzone) {
                        trgPitch = 1.0; // Puxa Manche = Sobe
                    } else if (deltaY > deadzone) {
                        trgPitch = -1.0; // Empurra Manche = Desce
                    } else {
                        trgPitch = 0; // Nivelado
                    }
                }
            }
            
            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 10 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 8 * dt;
                
                if (this.state === 'PLAYING') {
                    // Yaw acompanha o giro do Roll suavemente
                    this.ship.yaw += this.pilot.targetRoll * 1.5 * dt;
                    this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * 5 * dt;
                    this.ship.pitch += this.pilot.targetPitch * dt;
                    this.ship.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.ship.pitch));
                }
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll *= 0.9; this.pilot.targetPitch *= 0.9; this.ship.roll *= 0.95; 
            }
            this.ship.pitch %= Math.PI * 2; this.ship.yaw %= Math.PI * 2;
        },

        // --- COMBATE AUTÔNOMO (METRALHADORA + MÍSSIL HOMING) ---
        _processCombat: function(dt, w, h, now) {
            this.combat.target = null; this.combat.locked = false; let closestZ = Infinity;
            
            const scan = (obj, isPlayer, uid) => {
                let p = Engine3D.project(obj.x, obj.y, obj.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                // Área de trava central de 40% da tela
                if (p.visible && p.z > 500 && p.z < 100000 && Math.abs(p.x - w/2) < w*0.35 && Math.abs(p.y - h/2) < h*0.35 && p.z < closestZ) {
                    closestZ = p.z; this.combat.target = isPlayer ? {...obj, isPlayer: true, uid} : obj;
                }
            };
            
            this.entities.forEach(e => scan(e, false));
            if (this.mode === 'PVP') {
                Object.keys(this.net.players).forEach(id => {
                    if (id !== this.net.uid && this.net.players[id]?.hp > 0) scan(this.net.players[id], true, id);
                });
            }

            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.4) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true; this.combat.lockTimer = 0.4;
                }
            } else {
                this.combat.lockTimer -= dt * 3; if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }

            if (this.combat.locked && this.combat.target && now - this.combat.vulcanCd > 120) {
                this.combat.vulcanCd = now;
                let spd = this.ship.speed * 20 + 45000;
                let dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                dx += (Math.random()-0.5)*1500; dy += (Math.random()-0.5)*1500;
                this.bullets.push({ x: this.ship.x, y: this.ship.y-30, z: this.ship.z, vx: dx/dist*spd, vy: dy/dist*spd, vz: dz/dist*spd, isEnemy: false, life: 2.5 });
                GameSfx.play('vulcan'); window.Gfx?.shakeScreen(2);
            }

            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 1.5;
                let mSpd = this.ship.speed * 15 + 10000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fY = Math.sin(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                this.missiles.push({
                    x: this.ship.x, y: this.ship.y-100, z: this.ship.z,
                    vx: fX*mSpd + (Math.random()-0.5)*5000, vy: fY*mSpd - 2000, vz: fZ*mSpd + (Math.random()-0.5)*5000,
                    target: this.combat.target, life: 8, speed: mSpd
                });
                GameSfx.play('missile'); window.Gfx?.shakeScreen(10);
            }
        },

        _spawnEnemies: function() {
            if (this.entities.length >= 12 || Math.random() > 0.03) return;
            let dist = 50000 + Math.random()*30000, r = Math.random();
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let sx = this.ship.x + fX*dist + (Math.random()-0.5)*40000, sz = this.ship.z + fZ*dist + (Math.random()-0.5)*40000;
            
            if (r < 0.4) this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, hp: 300, yaw: Math.random()*Math.PI*2 });
            else if (r < 0.7) this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.y+(Math.random()-0.5)*10000), z: sz, vx: fX*2500, hp: 150, yaw: this.ship.yaw });
            else this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.y+(Math.random()-0.5)*10000), z: sz, vx: -fX*28000, vz: -fZ*28000, hp: 150, yaw: this.ship.yaw + Math.PI });
        },

        _updateEntities: function(dt, now) {
            for (let e of this.entities) {
                e.x += (e.vx||0)*dt; e.y += (e.vy||0)*dt; e.z += (e.vz||0)*dt;
                if (e.type === 'jet_flee') e.x += Math.sin(now*0.002)*2000*dt;
                if (e.type === 'tank') e.y = 0; 
                
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) > 150000) { e.hp = -1; continue; }
                
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) < 25000 && ((e.type==='jet_attack' && Math.random()<0.06) || (e.type==='tank' && Math.random()<0.03))) {
                    let bSpd = e.type==='tank' ? 18000 : 35000;
                    let d = Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z);
                    this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: -(e.x-this.ship.x)/d*bSpd, vy: -(e.y-this.ship.y)/d*bSpd, vz: -(e.z-this.ship.z)/d*bSpd, isEnemy: true, life: 4.0 });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);
        },

        _updateBullets: function(dt) {
            for (let i = this.bullets.length-1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx*dt; b.y += b.vy*dt; b.z += b.vz*dt; b.life -= dt;
                this.fx.push({x:b.x, y:b.y, z:b.z, vx:0, vy:0, vz:0, life:0.1, c: b.isEnemy?'#ff3300':'#ffff00', size: 150, tracer: true});

                if (b.isEnemy) {
                    if (Math.hypot(b.x-this.ship.x, b.y-this.ship.y, b.z-this.ship.z) < 1200) {
                        this.ship.hp -= 10; window.Gfx?.shakeScreen(15); this._fx(this.ship.x, this.ship.y, this.ship.z + 500, '#f00', 5, 200); GameSfx.play('boom');
                        if (this.ship.hp <= 0) this._endGame('GAMEOVER'); b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x-e.x, b.y-e.y, b.z-e.z) < 2000) {
                            e.hp -= 35; b.life = 0; this._fx(e.x,e.y,e.z,'#f90',3,80);
                            if (e.hp <= 0) this._kill(e, e.type==='tank'?300:150); break;
                        }
                    }
                    if (this.mode==='PVP' && b.life>0) {
                        Object.keys(this.net.players).forEach(uid => {
                            if (uid!==this.net.uid && this.net.players[uid]?.hp>0 && Math.hypot(b.x-this.net.players[uid].x, b.y-this.net.players[uid].y, b.z-this.net.players[uid].z)<2500) {
                                b.life=0; this._fx(this.net.players[uid].x,this.net.players[uid].y,this.net.players[uid].z,'#f90',4,100);
                                window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${uid}/hp`).set(this.net.players[uid].hp-10);
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this._fx(b.x,0,b.z,'#789',3,100); }
                }
                if (b.life <= 0) this.bullets.splice(i,1);
            }
        },

        _updateMissiles: function(dt, fX, fY, fZ) {
            for (let i = this.missiles.length-1; i >= 0; i--) {
                let m = this.missiles[i];
                m.speed += 20000 * dt; 
                if (m.target && (m.target.hp>0 || m.target.isPlayer)) {
                    let dx = m.target.x - m.x, dy = m.target.y - m.y, dz = m.target.z - m.z;
                    let d = Math.hypot(dx,dy,dz);
                    let turn = 80000 * dt; 
                    m.vx += (dx/d)*turn; m.vy += (dy/d)*turn; m.vz += (dz/d)*turn;
                    let velD = Math.hypot(m.vx, m.vy, m.vz);
                    if(velD > m.speed) { m.vx = (m.vx/velD)*m.speed; m.vy = (m.vy/velD)*m.speed; m.vz = (m.vz/velD)*m.speed; }
                    
                    if (d < 3000) {
                        if (m.target.isPlayer && this.mode==='PVP') {
                            window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${m.target.uid}/hp`).set(m.target.hp-60);
                            this._fx(m.target.x,m.target.y,m.target.z,'#f33',50,400); this.session.cash += 800;
                        } else if (!m.target.isPlayer) {
                            m.target.hp -= 500; if (m.target.hp <= 0) this._kill(m.target, m.target.type==='tank'?500:350);
                        }
                        m.life = 0; GameSfx.play('boom'); window.Gfx?.shakeScreen(5);
                    }
                }
                m.x += m.vx*dt; m.y += m.vy*dt; m.z += m.vz*dt; m.life -= dt;
                if(m.y < 0) { m.life = 0; this._fx(m.x,0,m.z,'#a55',10,200); }
                this.fx.push({x:m.x, y:m.y, z:m.z, vx:(Math.random()-0.5)*300, vy:(Math.random()-0.5)*300, vz:(Math.random()-0.5)*300, life: 1.5, c:'rgba(220,220,220,0.6)', size: 300});
                if (m.life <= 0) this.missiles.splice(i,1);
            }
        },

        _cleanupFx: function() {
            for (let c of this.clouds) {
                if (Math.hypot(c.x-this.ship.x, c.z-this.ship.z) > 150000) {
                    let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                    c.z = this.ship.z + fZ*120000 + (Math.random()-0.5)*80000; c.x = this.ship.x + fX*120000 + (Math.random()-0.5)*80000;
                }
            }
            this.floaters = this.floaters.filter(f => { f.life -= 1/60; f.y -= 120/60; return f.life > 0; });
            this.fx = this.fx.filter(f => { f.x+=f.vx/60; f.y+=f.vy/60; f.z+=f.vz/60; f.life-=1/60; return f.life>0; });
        },

        _kill: function(t, rew) {
            GameSfx.play('boom');
            this._fx(t.x,t.y,t.z,'#ff3300', 50, 400); this._fx(t.x,t.y,t.z,'#222233', 40, 800);
            this.floaters.push({x:t.x,y:t.y,z:t.z,text:`+ R$${rew}`,life:2.5});
            this.session.kills++; this.session.cash += rew;
            if (this.session.kills >= this.session.goal && this.mode==='SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res; GameSfx.stop();
            setTimeout(() => {
                if (window.System?.gameOver) window.System.gameOver(this.session.kills*150, res==='VICTORY', this.session.cash);
                else if (window.System?.home) window.System.home();
            }, 3000);
        },

        _fx: function(x,y,z,c,n,s) {
            for(let i=0;i<n;i++) this.fx.push({x,y,z,vx:(Math.random()-0.5)*15000,vy:(Math.random()-0.5)*15000,vz:(Math.random()-0.5)*15000,life:1+Math.random(),c,size:s+Math.random()*300});
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
            if (window.Gfx?.shake > 0.5) ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            
            // Renderização Rigorosa: Manche Atrás, HUD de Vidro na Frente
            this._drawYoke(ctx, w, h);
            this._drawHUD(ctx,w,h); 
            ctx.restore();
            
            ctx.fillStyle='rgba(0,0,0,0.15)'; for(let i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
        },

        _drawWorld: function(ctx,w,h) {
            ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(-this.ship.roll);
            let hy = Math.sin(this.ship.pitch) * h * 1.5;
            
            let sG = ctx.createLinearGradient(0,-h*4,0,hy);
            sG.addColorStop(0, this.environment.skyTop); sG.addColorStop(1, this.environment.skyBot);
            ctx.fillStyle = sG; ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
            
            if (this.environment.isNight) {
                ctx.fillStyle = "rgba(255,255,255,0.8)";
                this.environment.stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x*w*2, s.y*(-h*4), s.size, 0, Math.PI*2); ctx.fill(); });
            }

            let gG = ctx.createLinearGradient(0,hy,0,h*4);
            gG.addColorStop(0, this.environment.isNight ? '#050505' : '#1e3020'); gG.addColorStop(1, this.environment.ground);
            ctx.fillStyle = gG; ctx.fillRect(-w*3,hy,w*6,h*4);
            
            if (this.ship.y < 50000) {
                for(let t of this.terrain) {
                    if (Math.hypot(t.x-this.ship.x, t.z-this.ship.z) > 120000) {
                        let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                        t.x = this.ship.x + fX*100000 + (Math.random()-0.5)*80000; t.z = this.ship.z + fZ*100000 + (Math.random()-0.5)*80000;
                    }
                    let p1 = Engine3D.project(t.x, 0, t.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    let p2 = Engine3D.project(t.x, t.h, t.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    
                    if(p1.visible && p1.s > 0.005) {
                        let tw = t.w * p1.s;
                        ctx.fillStyle = t.c; ctx.fillRect(p1.x - w/2 - tw/2, p2.y - h/2, tw, p1.y - p2.y);
                        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(p1.x - w/2 - tw/2, p2.y - h/2, tw, p1.y - p2.y);
                    }
                }
            }

            ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1;
            ctx.beginPath(); ctx.moveTo(-w*3,hy); ctx.lineTo(w*3,hy); ctx.stroke();
            ctx.restore();
        },

        _drawEntities: function(ctx,w,h) {
            let buf=[];
            const add=(list,t)=>list.forEach(o=>{
                let p=Engine3D.project(o.x,o.y,o.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                if(p.visible)buf.push({p,t,o});
            });
            
            add(this.clouds,'c'); add(this.entities,'e'); add(this.bullets,'b'); add(this.missiles,'m'); add(this.fx,'f'); add(this.floaters,'x');
            
            if(this.mode!=='SINGLE') {
                Object.keys(this.net.players).forEach(uid=>{
                    if(uid!==this.net.uid && this.net.players[uid]?.hp>0){
                        let p=Engine3D.project(this.net.players[uid].x,this.net.players[uid].y,this.net.players[uid].z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                        if(p.visible)buf.push({p,t:'p',o:this.net.players[uid],id:uid});
                    }
                });
            }
            
            buf.sort((a,b)=>b.p.z-a.p.z); 
            
            buf.forEach(d=>{
                let p=d.p, s=p.s, o=d.o;
                if(d.t==='c') {
                    ctx.fillStyle = this.environment.isNight ? 'rgba(50,50,60,0.08)' : 'rgba(255,255,255,0.2)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, o.size*s, 0, Math.PI*2); ctx.fill();
                }
                else if(d.t==='x') {
                    ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(12, 2500*s)}px Arial`; ctx.textAlign='center'; 
                    ctx.fillText(o.text, p.x, p.y, w*0.9);
                }
                else if(d.t==='e' || d.t==='p') {
                    let isNet = d.t==='p', isTank = o.type==='tank';
                    
                    if(isNet || o.type?.startsWith('jet')) this._renderJet(ctx, p, o.yaw-this.ship.yaw-this.ship.roll, isNet);
                    else if(isTank) this._renderTank(ctx, p, o.yaw-this.ship.yaw, -this.ship.roll);
                    
                    if(isNet){ ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText(o.name||'ALIADO',p.x,p.y-350*s-15, w*0.3); }
                    
                    let locked = this.combat.target && (isNet ? this.combat.target.uid===d.id : this.combat.target===o);
                    let bs = Math.max(20, 250*s);
                    
                    if (locked) {
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.arc(p.x, p.y, bs*1.2, 0, Math.PI*2); ctx.stroke();
                        ctx.fillStyle = '#f03'; ctx.font = `bold ${Math.max(12, w*0.025)}px Arial`; ctx.textAlign = 'center'; 
                        ctx.fillText('TRAVADO', p.x, p.y + bs*1.2 + 15, w*0.3);
                    } else if (!isNet) {
                        ctx.strokeStyle = isTank ? 'rgba(243,156,18,0.8)' : 'rgba(231,76,60,0.6)'; ctx.lineWidth = 1;
                        ctx.strokeRect(p.x-bs, p.y-bs, bs*2, bs*2);
                    }
                }
                else if(d.t==='b') {
                    if (o.tracer) {
                        ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, o.size*s), 0, Math.PI*2); ctx.fill();
                    } else {
                        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = o.isEnemy ? '#ff3300' : '#ffff00';
                        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 15*s), 0, Math.PI*2); ctx.fill();
                        ctx.globalCompositeOperation = 'source-over';
                    }
                }
                else if(d.t==='m') {
                    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 40*s), 0, Math.PI*2); ctx.fill();
                }
                else if(d.t==='f') {
                    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, o.life); ctx.fillStyle = o.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, o.size*s), 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                }
            });
        },

        _renderJet: function(ctx,p,ry,net){
            let s=p.s*1200; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(ry);
            let mc = net ? (this.mode==='COOP'?'#2980b9':'#8e44ad') : '#4b6584'; let ec = net ? (this.mode==='COOP'?'#00ffff':'#ff00ff') : '#e74c3c';
            ctx.fillStyle=mc; ctx.beginPath(); ctx.moveTo(0,-s*0.8); ctx.lineTo(-s*0.3, s*0.2); ctx.lineTo(-s, s*0.6); ctx.lineTo(0, s*0.4); ctx.lineTo(s, s*0.6); ctx.lineTo(s*0.3, s*0.2); ctx.fill();
            ctx.fillStyle='#111'; ctx.beginPath(); ctx.ellipse(0, -s*0.2, s*0.15, s*0.4, 0, 0, Math.PI*2); ctx.fill();
            if(Math.cos(ry) > 0) { ctx.fillStyle=ec; ctx.globalCompositeOperation='lighter'; ctx.beginPath(); ctx.arc(-s*0.2, s*0.4, s*0.15, 0, Math.PI*2); ctx.arc(s*0.2, s*0.4, s*0.15, 0, Math.PI*2); ctx.fill(); ctx.globalCompositeOperation='source-over'; }
            ctx.restore();
        },

        _renderTank: function(ctx,p,ry,vRoll){
            let s=p.s*1500; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(vRoll);
            ctx.fillStyle='#2c3e50'; ctx.fillRect(-s,-s*0.8,s*2,s*1.6); ctx.fillStyle='#111'; ctx.fillRect(-s*1.2,-s*0.9,s*0.3,s*1.8); ctx.fillRect(s*0.9,-s*0.9,s*0.3,s*1.8);
            ctx.rotate(ry); ctx.fillStyle='#34495e'; ctx.beginPath(); ctx.arc(0,0,s*0.6,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#111'; ctx.fillRect(-s*0.1,-s*1.8,s*0.2,s*1.8);
            ctx.restore();
        },
        
        // MANCHE PLATINUM: BASE 100% PREGADA NO RODAPÉ, APENAS O VOLANTE GIRA.
        _drawYoke: function(ctx, w, h) {
            ctx.save();
            let yokeScale = Math.min(w * 0.25, 120); 
            // Ancorado absolutamente no H (fundo da tela), sem subir com o Pitch.
            ctx.translate(w/2, h); 

            // 1. Coluna do Manche (Eixo Fixo Absoluto)
            let grad = ctx.createLinearGradient(-15, 0, 15, 0);
            grad.addColorStop(0, '#111'); grad.addColorStop(0.5, '#444'); grad.addColorStop(1, '#111');
            ctx.fillStyle = grad;
            ctx.fillRect(-yokeScale*0.15, -yokeScale*1.5, yokeScale*0.3, yokeScale*1.5); 

            // 2. Volante do Manche (No topo da coluna)
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

        // HUD PLATINUM: TEXTOS SEGUROS CONTRA VAZAMENTO NO MOBILE
        _drawHUD: function(ctx, w, h){
            let cx = w/2, cy = h/2;
            const fz = Math.max(10, Math.min(w * 0.035, 16)); 
            
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
            ctx.font = `bold ${fz}px 'Chakra Petch', sans-serif`;
            
            // Mira Central
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

            const rr = Math.min(w * 0.08, 40);
            const rx = altX + tapeW/2, ry = cy - tapeH/2 - rr - 15;
            ctx.fillStyle = 'rgba(0, 30, 10, 0.8)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)'; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx, ry - rr); ctx.lineTo(rx, ry + rr); ctx.moveTo(rx - rr, ry); ctx.lineTo(rx + rr, ry); ctx.stroke();
            ctx.fillStyle = '#0f6'; ctx.beginPath(); ctx.moveTo(rx, ry - 3); ctx.lineTo(rx - 2, ry + 2); ctx.lineTo(rx + 2, ry + 2); ctx.fill(); 
            
            const plotRadar = (tx, tz, col, sq) => {
                let dx = tx - this.ship.x, dz = tz - this.ship.z;
                let cr = Math.cos(this.ship.yaw), sr = Math.sin(this.ship.yaw);
                let lx = dx * cr - dz * sr, lz = dx * sr + dz * cr, d = Math.hypot(lx, lz);
                if (d < 80000) { 
                    let px = rx + (lx / 80000) * rr, py = ry - (lz / 80000) * rr; 
                    ctx.fillStyle = col; 
                    if (sq) ctx.fillRect(px - 1.5, py - 1.5, 3, 3); else { ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI*2); ctx.fill(); } 
                }
            };
            this.entities.forEach(e => plotRadar(e.x, e.z, e.type === 'tank' ? '#f39c12' : '#e74c3c', e.type === 'tank'));

            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c';
            ctx.font = `bold ${fz * 1.1}px 'Russo One'`; ctx.textAlign = 'left';
            ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`, w * 0.02, h - 15, w * 0.3);
            
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'right';
            ctx.fillText(`R$: ${this.session.cash}`, w * 0.98, h - 15, w * 0.3);
            
            ctx.textAlign = 'center';
            if (this.combat.target && this.combat.locked) {
                ctx.fillStyle = '#f03'; ctx.font = `bold ${fz * 1.3}px 'Russo One'`;
                ctx.fillText("ALVO TRAVADO - FOGO!", cx, h * 0.75, w * 0.9);
                if (this.combat.missileCd <= 0) {
                    ctx.fillStyle = '#0ff'; ctx.font = `bold ${fz * 0.9}px Arial`;
                    ctx.fillText("INCLINE CABEÇA P/ MÍSSIL", cx, h * 0.8, w * 0.9);
                }
            } else {
                ctx.fillStyle = '#0f6'; ctx.font = `bold ${fz}px Arial`;
                ctx.fillText("BUSCANDO ALVOS...", cx, h * 0.75, w * 0.9);
            }

            if (!this.pilot.active) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, cy - 20, w, 40);
                ctx.fillStyle = '#f00'; ctx.font = `bold ${fz * 1.2}px Arial`; ctx.textAlign = 'center';
                ctx.fillText("MÃOS NÃO DETECTADAS!", cx, cy + fz*0.4, w * 0.9);
            }
        },
        
        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,30,0.98)';ctx.fillRect(0,0,w,h);
            const fz = Math.min(w * 0.045, 22);
            ctx.fillStyle='#2ecc71';ctx.textAlign='center';ctx.font=`bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('FORÇAS ARMADAS BR', w/2, h*0.15, w*0.9);
            
            const ps=Object.values(this.net.players);
            ctx.font=`bold ${fz}px Arial`;ctx.fillStyle='#fff';ctx.fillText(`PILOTOS NA BASE: ${ps.length}`, w/2, h*0.25, w*0.9);
            
            let py=h*0.35;
            ps.forEach(p=>{
                ctx.fillStyle=p.ready?'#2ecc71':'#e74c3c';
                ctx.fillText(`[${p.ready?'PRONTO':'ESPERA'}] ${p.name}`, w/2, py, w*0.9); py+=35;
            });

            let btnW = Math.min(280, w * 0.8);
            if(this.net.isHost){
                const r=ps.length>=1; 
                ctx.fillStyle=r?'#c0392b':'#34495e'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,50);
                ctx.fillStyle='#fff';ctx.font=`bold ${fz}px "Russo One"`;
                ctx.fillText(r?'LANÇAR':'AGUARDANDO...', w/2, h*0.80 + 32, btnW*0.9);
            }else{
                ctx.fillStyle=this.net.isReady?'#f39c12':'#2980b9'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,50);
                ctx.fillStyle='#fff';ctx.font=`bold ${fz}px "Russo One"`;
                ctx.fillText(this.net.isReady?'EM ESPERA':'PRONTO', w/2, h*0.80 + 32, btnW*0.9);
            }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(5,15,10,0.95)';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='rgba(0,255,100,0.3)';ctx.lineWidth=2;ctx.strokeRect(w*0.1, h*0.1, w*0.8, h*0.8);
            
            const fz = Math.min(w * 0.045, 20);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font=`bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('CALIBRAÇÃO DE VOO', w/2, h*0.25, w*0.8);
            
            ctx.fillStyle='#fff';ctx.font=`bold ${fz}px Arial`;
            ctx.fillText('AUMENTE A DISTÂNCIA DO CELULAR', w/2, h*0.4, w*0.8);
            
            ctx.fillStyle='#f1c40f';
            ctx.fillText('MÃO ACIMA DOS OMBROS = SOBE', w/2, h*0.5, w*0.8);
            ctx.fillText('MÃO NA BARRIGA = DESCE', w/2, h*0.55, w*0.8);
            ctx.fillText('CABEÇA DE LADO = LANÇA MÍSSIL', w/2, h*0.6, w*0.8);
            
            let pct = 1 - this.timer/4;
            ctx.fillStyle='#111';ctx.fillRect(w*0.2,h*0.7,w*0.6,15);
            ctx.fillStyle='#0f6';ctx.fillRect(w*0.2,h*0.7,(w*0.6)*pct,15);
            
            ctx.fillStyle=this.pilot.active?'#0f6':'#f33';
            ctx.fillText(this.pilot.active?'>> SENSOR OK':'>> POSICIONE OS OMBROS NA TELA', w/2, h*0.8, w*0.8);
        },

        _drawEnd: function(ctx,w,h){
            this._draw(ctx,w,h);
            ctx.fillStyle='rgba(0,0,0,0.9)';ctx.fillRect(0,0,w,h);
            
            const fz = Math.min(w * 0.06, 35);
            ctx.textAlign='center';ctx.font=`bold ${fz}px "Russo One"`;
            ctx.fillStyle=this.state==='VICTORY'?'#2ecc71':'#e74c3c';
            ctx.fillText(this.state==='VICTORY'?'SUCESSO':'DESTRUÍDO', w/2, h/2 - fz, w*0.9);
            
            ctx.fillStyle='#f1c40f';ctx.font=`bold ${fz*0.6}px Arial`;
            ctx.fillText(`R$ ${this.session.cash}`, w/2, h/2 + fz, w*0.9);
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
