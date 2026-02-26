// =============================================================================
// AERO STRIKE SIMULATOR: BRAZILIAN ARMED FORCES EDITION (V4.0 MILITARY)
// ENGINE: Pseudo-3D com HUD F-22 Raptor, Ciclo Dia/Noite e Combate Autônomo.
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (PlayStation/Xbox Standard)
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

    // --- SISTEMA DE ÁUDIO MILITAR ---
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
            else if (type === 'vulcan') window.Sfx?.play(150, 'sawtooth', 0.05, 0.2); // Som de metralhadora pesada
            else if (type === 'missile') {
                if(this.ctx) {
                    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
                    o.type='square'; o.frequency.setValueAtTime(100,t); o.frequency.linearRampToValueAtTime(1000,t+0.8);
                    g.gain.setValueAtTime(0.6,t); g.gain.exponentialRampToValueAtTime(0.01,t+1.5);
                    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+1.5);
                }
            }
            else if (type === 'boom') window.Sfx?.play(80, 'sawtooth', 0.5, 0.3);
            else if (type === 'beep') window.Sfx?.play(800, 'sine', 0.1, 0.1);
        },
        stop: function() { if (this.engineSrc) { try { this.engineSrc.stop(); } catch(e){} this.engineSrc = null; } }
    };

    // --- CORE DO JOGO ---
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30 },
        ship: { hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 },
        pilot: { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false },
        timer: 3.0,
        entities: [], bullets: [], missiles: [], clouds: [], fx: [], floaters: [],
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null, loop: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false, stars: [] },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30 };
            this.ship = { hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 };
            this.pilot = { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.fx = []; this.floaters = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            
            this._setupEnvironment(); // Sincroniza com horário real
            
            for (let i = 0; i < 60; i++) this.clouds.push({ x: (Math.random()-0.5)*120000, y: 8000+Math.random()*15000, z: (Math.random()-0.5)*120000, size: 4000+Math.random()*8000 });
            
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
                // Dia claro
                this.environment.skyTop = '#0a3d62'; this.environment.skyBot = '#60a3bc'; this.environment.ground = '#386641'; this.environment.isNight = false;
            } else if (hour >= 17 && hour < 19) {
                // Pôr do sol
                this.environment.skyTop = '#2c2c54'; this.environment.skyBot = '#ff793f'; this.environment.ground = '#2d3436'; this.environment.isNight = false;
            } else {
                // Noite
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
                this.net.playersRef.child(this.net.uid).set({
                    name: window.Profile?.username || 'PILOTO', ready: false, hp: 100,
                    x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0
                });
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

            // --- FÍSICA DE VOO SIMULADOR ---
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            // A velocidade aumenta se mergulhar, diminui se subir (Gravidade)
            this.ship.speed += (fY * -500 * dt);
            this.ship.speed = Math.max(800, Math.min(3000, this.ship.speed));

            let units = this.ship.speed * 20;
            this.ship.x += units * fX * dt;
            this.ship.y += units * fY * dt;
            this.ship.z += units * fZ * dt;
            
            // Limite de Solo
            if (this.ship.y < 50) { 
                this.ship.y = 50; 
                if(this.ship.pitch < -0.1) {
                    this.ship.hp -= 20; window.Gfx?.shakeScreen(20); GameSfx.play('boom');
                    this.ship.pitch = 0.2; // Quica no chão
                }
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
                this.net.playersRef.off();
                this.net.sessionRef?.child('state')?.off();
                this.net.playersRef.child(this.net.uid)?.remove();
                if (this.net.isHost) this.net.sessionRef?.remove();
            }
        },

        // --- SISTEMA DE CONTROLE DE VOO AVANÇADO ---
        _readPose: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false;
            this.pilot.headTilt = false;
            
            if (pose?.keypoints) {
                const kp = name => pose.keypoints.find(k => k.part === name || k.name === name);
                const rw = kp('right_wrist'), lw = kp('left_wrist');
                const rEar = kp('right_ear'), lEar = kp('left_ear');
                const pX = x => (1 - (x / 640)) * w, pY = y => (y / 480) * h;
                
                // Inclinação da cabeça para disparar míssil
                if (rEar?.score > 0.4 && lEar?.score > 0.4 && Math.abs(rEar.y - lEar.y) > 25) {
                    this.pilot.headTilt = true;
                }
                
                if (rw?.score > 0.3 && lw?.score > 0.3) {
                    inputDetected = true;
                    let rx = pX(rw.x), ry = pY(rw.y), lx = pX(lw.x), ly = pY(lw.y);
                    
                    // Volante (Roll): Diferença de altura entre mãos
                    trgRoll = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, Math.atan2(ry - ly, rx - lx)));
                    
                    // Pitch: Altura média das mãos comparado à calibração
                    let avgY = (ry + ly) / 2;
                    
                    if (this.state === 'CALIBRATION') {
                        this.pilot.baseY = this.pilot.baseY * 0.95 + avgY * 0.05;
                        if (!this.pilot.baseY) this.pilot.baseY = avgY;
                    } else {
                        let deltaY = avgY - this.pilot.baseY;
                        let threshold = h * 0.08; // Sensibilidade do Manche
                        
                        // Mãos sobem na tela (puxou manche) -> Pitch UP. Mãos descem -> Pitch DOWN
                        if (deltaY < -threshold) trgPitch = 1.5 * (Math.abs(deltaY)/h);      
                        else if (deltaY > threshold) trgPitch = -1.5 * (Math.abs(deltaY)/h); 
                        else trgPitch = 0; 
                    }
                }
            }
            
            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 6 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 5 * dt;
                
                if (this.state === 'PLAYING') {
                    // O roll influencia no Yaw (curva natural de avião)
                    this.ship.yaw += this.pilot.targetRoll * 1.5 * dt;
                    this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * 4 * dt;
                    this.ship.pitch += this.pilot.targetPitch * dt;
                    // Limita o pitch para não virar de cabeça para baixo sem querer
                    this.ship.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.ship.pitch));
                }
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll *= 0.9;
                this.pilot.targetPitch *= 0.9;
                this.ship.roll *= 0.95; // Retorna ao eixo central suavemente
            }
            this.ship.pitch %= Math.PI * 2;
            this.ship.yaw %= Math.PI * 2;
        },

        // --- SISTEMA DE COMBATE AUTÔNOMO ---
        _processCombat: function(dt, w, h, now) {
            this.combat.target = null; this.combat.locked = false; let closestZ = Infinity;
            
            // Scanner de Alvos
            const scan = (obj, isPlayer, uid) => {
                let p = Engine3D.project(obj.x, obj.y, obj.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                // Área de trava é grande (45% da tela central) para facilitar a jogabilidade
                if (p.visible && p.z > 500 && p.z < 80000 && Math.abs(p.x - w/2) < w*0.45 && Math.abs(p.y - h/2) < h*0.45 && p.z < closestZ) {
                    closestZ = p.z;
                    this.combat.target = isPlayer ? {...obj, isPlayer: true, uid} : obj;
                }
            };
            
            this.entities.forEach(e => scan(e, false));
            if (this.mode === 'PVP') {
                Object.keys(this.net.players).forEach(id => {
                    if (id !== this.net.uid && this.net.players[id]?.hp > 0) scan(this.net.players[id], true, id);
                });
            }

            // Gerenciador de Trava (Lock-on)
            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.4) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true;
                    this.combat.lockTimer = 0.4;
                }
            } else {
                this.combat.lockTimer -= dt * 3;
                if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }

            // 1. AUTO-VULCAN: Dispara automaticamente quando travado
            if (this.combat.locked && this.combat.target && now - this.combat.vulcanCd > 120) {
                this.combat.vulcanCd = now;
                let spd = this.ship.speed * 20 + 45000;
                let dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                // Adiciona leve variação (spread)
                dx += (Math.random()-0.5)*1500; dy += (Math.random()-0.5)*1500;
                
                this.bullets.push({
                    x: this.ship.x + Math.cos(this.ship.yaw)*100, y: this.ship.y-30, z: this.ship.z - Math.sin(this.ship.yaw)*100,
                    vx: dx/dist*spd, vy: dy/dist*spd, vz: dz/dist*spd,
                    isEnemy: false, life: 2.5
                });
                GameSfx.play('vulcan');
                window.Gfx?.shakeScreen(2);
            }

            // 2. MÍSSIL TELEGUIADO: Dispara com movimento de cabeça
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 1.5; // Recarga de 1.5s
                let mSpd = this.ship.speed * 15 + 10000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                let fY = Math.sin(this.ship.pitch);
                let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                
                // Míssil sai ligeiramente para baixo/lado antes de seguir o alvo
                this.missiles.push({
                    x: this.ship.x, y: this.ship.y-100, z: this.ship.z,
                    vx: fX*mSpd + (Math.random()-0.5)*5000, vy: fY*mSpd - 2000, vz: fZ*mSpd + (Math.random()-0.5)*5000,
                    target: this.combat.target, life: 8, speed: mSpd
                });
                GameSfx.play('missile');
                window.Gfx?.shakeScreen(10);
                this.floaters.push({x: this.ship.x, y: this.ship.y + 200, z: this.ship.z + 1000, text: "MÍSSIL LANÇADO!", life: 1.5});
            }
        },

        _spawnEnemies: function() {
            if (this.entities.length >= 12 || Math.random() > 0.03) return;
            let dist = 50000 + Math.random()*30000, r = Math.random();
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let sx = this.ship.x + fX*dist + (Math.random()-0.5)*40000;
            let sz = this.ship.z + fZ*dist + (Math.random()-0.5)*40000;
            
            if (r < 0.4) {
                // Tanque (No Solo)
                this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, hp: 300, yaw: Math.random()*Math.PI*2 });
            } else if (r < 0.7) {
                // Jato Fuga
                this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.y+(Math.random()-0.5)*10000), z: sz, vx: fX*2500, hp: 150, yaw: this.ship.yaw });
            } else {
                // Jato Ataque (Vem na direção oposta)
                this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.y+(Math.random()-0.5)*10000), z: sz, vx: -fX*28000, vz: -fZ*28000, hp: 150, yaw: this.ship.yaw + Math.PI });
            }
        },

        _updateEntities: function(dt, now) {
            for (let e of this.entities) {
                e.x += (e.vx||0)*dt; e.y += (e.vy||0)*dt; e.z += (e.vz||0)*dt;
                
                // Evita que fujam infinitamente e trava no solo
                if (e.type === 'jet_flee') { e.x += Math.sin(now*0.002)*2000*dt; }
                if (e.type === 'tank') e.y = 0; 
                
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) > 150000) { e.hp = -1; continue; }
                
                // Inimigos atiram de volta
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) < 25000 && ((e.type==='jet_attack' && Math.random()<0.06) || (e.type==='tank' && Math.random()<0.03))) {
                    let bSpd = e.type==='tank' ? 18000 : 35000;
                    let d = Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z);
                    this.bullets.push({
                        x: e.x, y: e.y, z: e.z,
                        vx: -(e.x-this.ship.x)/d*bSpd, vy: -(e.y-this.ship.y)/d*bSpd, vz: -(e.z-this.ship.z)/d*bSpd,
                        isEnemy: true, life: 4.0
                    });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);
        },

        _updateBullets: function(dt) {
            for (let i = this.bullets.length-1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx*dt; b.y += b.vy*dt; b.z += b.vz*dt; b.life -= dt;
                
                // Rastro do tiro (Tracer)
                this.fx.push({x:b.x, y:b.y, z:b.z, vx:0, vy:0, vz:0, life:0.1, c: b.isEnemy?'#ff3300':'#ffff00', size: 150, tracer: true});

                if (b.isEnemy) {
                    if (Math.hypot(b.x-this.ship.x, b.y-this.ship.y, b.z-this.ship.z) < 1200) {
                        this.ship.hp -= 10;
                        window.Gfx?.shakeScreen(15);
                        this._fx(this.ship.x, this.ship.y, this.ship.z + 500, '#f00', 5, 200);
                        GameSfx.play('boom');
                        if (this.ship.hp <= 0) this._endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x-e.x, b.y-e.y, b.z-e.z) < 1800) {
                            e.hp -= 35; b.life = 0;
                            this._fx(e.x,e.y,e.z,'#f90',3,80);
                            if (e.hp <= 0) this._kill(e, e.type==='tank'?300:150);
                            break;
                        }
                    }
                    if (this.mode==='PVP' && b.life>0) {
                        Object.keys(this.net.players).forEach(uid => {
                            if (uid!==this.net.uid && this.net.players[uid]?.hp>0 && Math.hypot(b.x-this.net.players[uid].x, b.y-this.net.players[uid].y, b.z-this.net.players[uid].z)<2000) {
                                b.life=0;
                                this._fx(this.net.players[uid].x,this.net.players[uid].y,this.net.players[uid].z,'#f90',4,100);
                                window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${uid}/hp`).set(this.net.players[uid].hp-10);
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this._fx(b.x,0,b.z,'#789',3,100); } // Bateu na terra
                }
                if (b.life <= 0) this.bullets.splice(i,1);
            }
        },

        _updateMissiles: function(dt, fX, fY, fZ) {
            for (let i = this.missiles.length-1; i >= 0; i--) {
                let m = this.missiles[i];
                
                // Míssil acelera gradualmente
                m.speed += 20000 * dt; 
                
                // Lógica Homing (Perseguição Inteligente)
                if (m.target && (m.target.hp>0 || m.target.isPlayer)) {
                    let dx = m.target.x - m.x, dy = m.target.y - m.y, dz = m.target.z - m.z;
                    let d = Math.hypot(dx,dy,dz);
                    // Curva na direção do alvo
                    let turn = 80000 * dt; 
                    m.vx += (dx/d)*turn; m.vy += (dy/d)*turn; m.vz += (dz/d)*turn;
                    
                    // Limita velocidade máxima
                    let velD = Math.hypot(m.vx, m.vy, m.vz);
                    if(velD > m.speed) { m.vx = (m.vx/velD)*m.speed; m.vy = (m.vy/velD)*m.speed; m.vz = (m.vz/velD)*m.speed; }
                    
                    if (d < 2500) {
                        if (m.target.isPlayer && this.mode==='PVP') {
                            window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${m.target.uid}/hp`).set(m.target.hp-60);
                            this._fx(m.target.x,m.target.y,m.target.z,'#f33',50,400);
                            this.session.cash += 800;
                        } else if (!m.target.isPlayer) {
                            m.target.hp -= 500;
                            if (m.target.hp <= 0) this._kill(m.target, m.target.type==='tank'?500:350);
                        }
                        m.life = 0;
                        GameSfx.play('boom'); window.Gfx?.shakeScreen(5);
                    }
                }
                
                m.x += m.vx*dt; m.y += m.vy*dt; m.z += m.vz*dt; m.life -= dt;
                if(m.y < 0) { m.life = 0; this._fx(m.x,0,m.z,'#a55',10,200); }
                
                // Fumaça volumétrica do míssil
                this.fx.push({x:m.x, y:m.y, z:m.z, vx:(Math.random()-0.5)*300, vy:(Math.random()-0.5)*300, vz:(Math.random()-0.5)*300, life: 1.5, c:'rgba(220,220,220,0.6)', size: 300});
                
                if (m.life <= 0) this.missiles.splice(i,1);
            }
        },

        _cleanupFx: function() {
            for (let c of this.clouds) {
                if (Math.hypot(c.x-this.ship.x, c.z-this.ship.z) > 150000) {
                    let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                    let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                    c.z = this.ship.z + fZ*120000 + (Math.random()-0.5)*80000;
                    c.x = this.ship.x + fX*120000 + (Math.random()-0.5)*80000;
                }
            }
            this.floaters = this.floaters.filter(f => { f.life -= 1/60; f.y -= 120/60; return f.life > 0; });
            this.fx = this.fx.filter(f => { f.x+=f.vx/60; f.y+=f.vy/60; f.z+=f.vz/60; f.life-=1/60; return f.life>0; });
        },

        _kill: function(t, rew) {
            GameSfx.play('boom');
            this._fx(t.x,t.y,t.z,'#ff3300', 50, 400); // Fogo
            this._fx(t.x,t.y,t.z,'#222233', 40, 800); // Fumaça preta
            this.floaters.push({x:t.x,y:t.y,z:t.z,text:`+ R$${rew}`,life:2.5});
            this.session.kills++;
            this.session.cash += rew;
            if (this.session.kills >= this.session.goal && this.mode==='SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res;
            GameSfx.stop();
            setTimeout(() => {
                if (window.System?.gameOver) window.System.gameOver(this.session.kills*150, res==='VICTORY', this.session.cash);
                else if (window.System?.home) window.System.home();
            }, 3000);
        },

        _fx: function(x,y,z,c,n,s) {
            for(let i=0;i<n;i++) this.fx.push({x,y,z,vx:(Math.random()-0.5)*15000,vy:(Math.random()-0.5)*15000,vz:(Math.random()-0.5)*15000,life:1+Math.random(),c,size:s+Math.random()*300});
        },

        _startMission: function() {
            this.state = 'PLAYING';
            this.ship.x = (Math.random()-0.5)*10000;
            this.ship.z = (Math.random()-0.5)*10000;
            GameSfx.startEngine();
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(() => {
                    if (this.state === 'PLAYING' && this.net.playersRef) {
                        this.net.playersRef.child(this.net.uid).update({
                            x: this.ship.x, y: this.ship.y, z: this.ship.z,
                            pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp
                        });
                    }
                }, 100);
            }
        },

        _draw: function(ctx, w, h) {
            ctx.save();
            if (window.Gfx?.shake > 0.5) {
                ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            }
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            this._drawHUD(ctx,w,h); // Novo HUD Estilo Caça
            ctx.restore();
            
            // Scanlines sutis
            ctx.fillStyle='rgba(0,0,0,0.15)';
            for(let i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
        },

        _drawWorld: function(ctx,w,h) {
            ctx.save();
            ctx.translate(w/2,h/2);
            ctx.rotate(-this.ship.roll); // O mundo gira ao redor do HUD
            let hy = Math.sin(this.ship.pitch) * h * 1.5;
            
            // Céu
            let sG = ctx.createLinearGradient(0,-h*4,0,hy);
            sG.addColorStop(0, this.environment.skyTop); sG.addColorStop(1, this.environment.skyBot);
            ctx.fillStyle = sG;
            ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
            
            // Estrelas
            if (this.environment.isNight) {
                ctx.fillStyle = "rgba(255,255,255,0.8)";
                this.environment.stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x*w*2, s.y*(-h*4), s.size, 0, Math.PI*2); ctx.fill(); });
            }

            // Solo (Terra)
            let gG = ctx.createLinearGradient(0,hy,0,h*4);
            gG.addColorStop(0, this.environment.isNight ? '#050505' : '#1e3020'); 
            gG.addColorStop(1, this.environment.ground);
            ctx.fillStyle = gG;
            ctx.fillRect(-w*3,hy,w*6,h*4);
            
            // Renderiza Grid no solo (Só visível se estiver baixo ou perto do horizonte)
            if (this.ship.y < 30000) {
                ctx.strokeStyle = this.environment.isNight ? 'rgba(0, 255, 100, 0.15)' : 'rgba(0,0,0,0.2)'; 
                ctx.lineWidth = 2; ctx.beginPath();
                let st = 12000, sx = Math.floor(this.ship.x/st)*st-st*15, sz = Math.floor(this.ship.z/st)*st-st*15;
                for(let x=0; x<=30; x++) {
                    for(let z=0; z<=30; z++) {
                        let p = Engine3D.project(sx+x*st, 0, sz+z*st, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                        if(p.visible && p.s > 0.005) { ctx.moveTo(p.x-30*p.s, p.y); ctx.lineTo(p.x+30*p.s, p.y); }
                    }
                }
                ctx.stroke();
            }

            // Linha do Horizonte Falsa
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
            
            buf.sort((a,b)=>b.p.z-a.p.z); // Z-Buffer manual
            
            buf.forEach(d=>{
                let p=d.p, s=p.s, o=d.o;
                if(d.t==='c') {
                    ctx.fillStyle = this.environment.isNight ? 'rgba(50,50,60,0.08)' : 'rgba(255,255,255,0.2)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, o.size*s, 0, Math.PI*2); ctx.fill();
                }
                else if(d.t==='x') {
                    ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(18, 2000*s)}px 'Russo One'`; ctx.textAlign='center'; ctx.fillText(o.text,p.x,p.y);
                }
                else if(d.t==='e' || d.t==='p') {
                    let isNet = d.t==='p', isTank = o.type==='tank';
                    
                    if(isNet || o.type?.startsWith('jet')) this._renderJet(ctx, p, o.yaw-this.ship.yaw-this.ship.roll, isNet);
                    else if(isTank) this._renderTank(ctx, p, o.yaw-this.ship.yaw, -this.ship.roll);
                    
                    // UI em cima das naves
                    if(isNet){ ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33'; ctx.font='bold 16px Arial'; ctx.textAlign='center'; ctx.fillText(o.name||'ALIADO',p.x,p.y-350*s-15); }
                    
                    let locked = this.combat.target && (isNet ? this.combat.target.uid===d.id : this.combat.target===o);
                    let bs = Math.max(40, 250*s);
                    
                    if (locked) {
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 4;
                        ctx.beginPath(); ctx.arc(p.x, p.y, bs*1.2, 0, Math.PI*2); ctx.stroke();
                        ctx.fillStyle = '#f03'; ctx.font = `bold ${Math.max(16, h*0.02)}px Arial`; ctx.textAlign = 'center'; 
                        ctx.fillText('TRAVADO', p.x, p.y + bs*1.2 + 25);
                    } else if (!isNet) {
                        ctx.strokeStyle = isTank ? 'rgba(243,156,18,0.8)' : 'rgba(231,76,60,0.6)'; ctx.lineWidth = 2;
                        ctx.strokeRect(p.x-bs, p.y-bs, bs*2, bs*2);
                    }
                }
                else if(d.t==='b') {
                    if (o.tracer) {
                        ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, o.size*s), 0, Math.PI*2); ctx.fill();
                    } else {
                        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = o.isEnemy ? '#ff3300' : '#ffff00';
                        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, 15*s), 0, Math.PI*2); ctx.fill();
                        ctx.globalCompositeOperation = 'source-over';
                    }
                }
                else if(d.t==='m') {
                    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, 40*s), 0, Math.PI*2); ctx.fill();
                }
                else if(d.t==='f') {
                    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, o.life); ctx.fillStyle = o.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, o.size*s), 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                }
            });
        },

        _renderJet: function(ctx,p,ry,net){
            let s=p.s*800; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(ry);
            let mc = net ? (this.mode==='COOP'?'#2980b9':'#8e44ad') : '#4b6584';
            let ec = net ? (this.mode==='COOP'?'#00ffff':'#ff00ff') : '#e74c3c';
            
            // Corpo Principal
            ctx.fillStyle=mc; ctx.beginPath(); ctx.moveTo(0,-s*0.8); ctx.lineTo(-s*0.3, s*0.2); ctx.lineTo(-s, s*0.6); ctx.lineTo(0, s*0.4); ctx.lineTo(s, s*0.6); ctx.lineTo(s*0.3, s*0.2); ctx.fill();
            // Cockpit
            ctx.fillStyle='#111'; ctx.beginPath(); ctx.ellipse(0, -s*0.2, s*0.15, s*0.4, 0, 0, Math.PI*2); ctx.fill();
            // Propulsores
            if(Math.cos(ry) > 0) {
                ctx.fillStyle=ec; ctx.globalCompositeOperation='lighter';
                ctx.beginPath(); ctx.arc(-s*0.2, s*0.4, s*0.15, 0, Math.PI*2); ctx.arc(s*0.2, s*0.4, s*0.15, 0, Math.PI*2); ctx.fill();
                ctx.globalCompositeOperation='source-over';
            }
            ctx.restore();
        },

        _renderTank: function(ctx,p,ry,vRoll){
            let s=p.s*1000; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(vRoll);
            // Corpo
            ctx.fillStyle='#2c3e50'; ctx.fillRect(-s,-s*0.8,s*2,s*1.6);
            // Esteiras
            ctx.fillStyle='#111'; ctx.fillRect(-s*1.2,-s*0.9,s*0.3,s*1.8); ctx.fillRect(s*0.9,-s*0.9,s*0.3,s*1.8);
            // Torreta e Canhão
            ctx.rotate(ry); ctx.fillStyle='#34495e'; ctx.beginPath(); ctx.arc(0,0,s*0.6,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#111'; ctx.fillRect(-s*0.1,-s*1.8,s*0.2,s*1.8);
            ctx.restore();
        },
        
        // NOVO HUD DE CAÇA F-22 (Legível e Moderno)
        _drawHUD: function(ctx, w, h){
            let cx = w/2, cy = h/2;
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
            const fontSize = Math.max(16, h * 0.025);
            ctx.font = `bold ${fontSize}px 'Chakra Petch', sans-serif`;
            
            // Cruz Central (Retícula de Mira)
            ctx.beginPath(); 
            ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 10, cy); 
            ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 10, cy);
            ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 10); 
            ctx.moveTo(cx, cy + 30); ctx.lineTo(cx, cy + 10); 
            ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill();

            // Ladder de Pitch (Horizonte Artificial animado com o Roll/Pitch)
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll);
            ctx.beginPath(); ctx.rect(-200, -200, 400, 400); ctx.clip(); // Corta fora do centro
            let pDeg = this.ship.pitch * 180 / Math.PI;
            let spacing = h * 0.08; 
            for(let i = -90; i <= 90; i += 10) {
                if (i === 0) continue;
                let yo = (pDeg - i) * (spacing / 10);
                let wLine = i < 0 ? 80 : 120; // Linha tracejada se negativo, sólida se positivo
                ctx.beginPath(); 
                if (i < 0) ctx.setLineDash([10, 10]); else ctx.setLineDash([]);
                ctx.moveTo(-wLine, yo); ctx.lineTo(-wLine + 30, yo); ctx.lineTo(-wLine + 30, i < 0 ? yo - 10 : yo + 10);
                ctx.moveTo(wLine, yo); ctx.lineTo(wLine - 30, yo); ctx.lineTo(wLine - 30, i < 0 ? yo - 10 : yo + 10);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.textAlign = 'right'; ctx.fillText(Math.abs(i), -wLine - 5, yo + 5);
                ctx.textAlign = 'left'; ctx.fillText(Math.abs(i), wLine + 5, yo + 5);
            }
            ctx.restore();

            // FITAS LATERAIS (Velocidade e Altitude)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            let tapeW = w * 0.1; let tapeH = h * 0.5;
            let spdX = w * 0.05; let altX = w * 0.85;
            ctx.fillRect(spdX, cy - tapeH/2, tapeW, tapeH); ctx.strokeRect(spdX, cy - tapeH/2, tapeW, tapeH);
            ctx.fillRect(altX, cy - tapeH/2, tapeW, tapeH); ctx.strokeRect(altX, cy - tapeH/2, tapeW, tapeH);
            
            // Valores Atuais (Grandes)
            ctx.fillStyle = '#0f6'; ctx.textAlign = 'center'; ctx.font = `bold ${fontSize * 1.5}px 'Russo One'`;
            ctx.fillText(Math.floor(this.ship.speed), spdX + tapeW/2, cy + fontSize * 0.5);
            ctx.fillText(Math.floor(this.ship.y), altX + tapeW/2, cy + fontSize * 0.5);
            
            ctx.font = `bold ${fontSize}px Arial`; ctx.fillStyle = '#fff';
            ctx.fillText("SPD (KTS)", spdX + tapeW/2, cy - tapeH/2 - 10);
            ctx.fillText("ALT (FT)", altX + tapeW/2, cy - tapeH/2 - 10);

            // Bússola Superior (Heading)
            let hdg = (this.ship.yaw * 180 / Math.PI) % 360; if (hdg < 0) hdg += 360;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(cx - 150, 10, 300, 40); ctx.strokeRect(cx - 150, 10, 300, 40);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${fontSize * 1.2}px 'Russo One'`;
            ctx.fillText(`RUMO: ${Math.floor(hdg)}°`, cx, 38);

            // Radar Miniatura (Topo Direito)
            const rx = w - 80, ry = 80, rr = 60;
            ctx.fillStyle = 'rgba(0, 30, 10, 0.8)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)'; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx, ry - rr); ctx.lineTo(rx, ry + rr); ctx.moveTo(rx - rr, ry); ctx.lineTo(rx + rr, ry); ctx.stroke();
            ctx.fillStyle = '#0f6'; ctx.beginPath(); ctx.moveTo(rx, ry - 6); ctx.lineTo(rx - 5, ry + 4); ctx.lineTo(rx + 5, ry + 4); ctx.fill(); // Jogador
            
            const plotRadar = (tx, tz, col, sq) => {
                let dx = tx - this.ship.x, dz = tz - this.ship.z;
                let cr = Math.cos(this.ship.yaw), sr = Math.sin(this.ship.yaw);
                let lx = dx * cr - dz * sr, lz = dx * sr + dz * cr, d = Math.hypot(lx, lz);
                if (d < 80000) { 
                    let px = rx + (lx / 80000) * rr, py = ry - (lz / 80000) * rr; 
                    ctx.fillStyle = col; 
                    if (sq) ctx.fillRect(px - 3, py - 3, 6, 6); else { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2); ctx.fill(); } 
                }
            };
            this.entities.forEach(e => plotRadar(e.x, e.z, e.type === 'tank' ? '#f39c12' : '#e74c3c', e.type === 'tank'));

            // Mensagens de Status & HP & Cash
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c';
            ctx.font = `bold ${fontSize * 1.5}px 'Russo One'`; ctx.textAlign = 'left';
            ctx.fillText(`INTEGRIDADE: ${Math.floor(this.ship.hp)}%`, 20, h - 30);
            
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'right';
            ctx.fillText(`SALDO: R$ ${this.session.cash.toLocaleString()}`, w - 20, h - 30);
            
            // Indicador de Míssil / Vulcan
            ctx.textAlign = 'center';
            if (this.combat.target && this.combat.locked) {
                ctx.fillStyle = '#f03'; ctx.font = `bold ${fontSize * 2}px 'Russo One'`;
                ctx.fillText("TRAVA CONFIRMADA - ATIRANDO", cx, h * 0.85);
                if (this.combat.missileCd <= 0) {
                    ctx.fillStyle = '#0ff'; ctx.font = `bold ${fontSize * 1.2}px Arial`;
                    ctx.fillText("INCLINE A CABEÇA PARA LANÇAR MÍSSIL", cx, h * 0.90);
                }
            } else {
                ctx.fillStyle = '#0f6'; ctx.font = `bold ${fontSize * 1.2}px Arial`;
                ctx.fillText("ESCANINANDO ALVOS...", cx, h * 0.85);
            }

            // Alerta se não houver pose
            if (!this.pilot.active) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, cy - 40, w, 80);
                ctx.fillStyle = '#f00'; ctx.font = `bold ${fontSize * 2}px Arial`; ctx.textAlign = 'center';
                ctx.fillText("SISTEMA DE MÃOS NÃO DETECTADO!", cx, cy + 10);
            }
        },
        
        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,30,0.98)';ctx.fillRect(0,0,w,h);
            const fontSize = Math.max(16, h * 0.03);
            ctx.fillStyle='#2ecc71';ctx.textAlign='center';ctx.font=`bold ${fontSize * 2}px "Russo One"`;ctx.fillText('SIMULADOR FORÇAS ARMADAS',w/2,h*0.15);
            
            const ps=Object.values(this.net.players);
            ctx.font=`bold ${fontSize * 1.5}px Arial`;ctx.fillStyle='#fff';ctx.fillText(`PILOTOS NA BASE: ${ps.length}`,w/2,h*0.25);
            let py=h*0.35;
            ps.forEach(p=>{
                ctx.fillStyle=p.ready?'#2ecc71':'#e74c3c';
                ctx.fillText(`[${p.ready?'PRONTO':'AGUARDANDO'}] ${p.name}`,w/2,py); py+=40;
            });

            let btnW = Math.min(400, w * 0.8);
            if(this.net.isHost){
                const r=ps.length>=1; // Permite iniciar sozinho para testar, ou exija 2 no futuro
                ctx.fillStyle=r?'#c0392b':'#34495e'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,h*0.1);
                ctx.fillStyle='#fff';ctx.font=`bold ${fontSize * 1.5}px "Russo One"`;ctx.fillText(r?'LANÇAR MISSÃO':'AGUARDANDO...',w/2,h*0.80 + (h*0.06));
            }else{
                ctx.fillStyle=this.net.isReady?'#f39c12':'#2980b9'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,h*0.1);
                ctx.fillStyle='#fff';ctx.font=`bold ${fontSize * 1.5}px "Russo One"`;ctx.fillText(this.net.isReady?'EM ESPERA':'MARCAR PRONTO',w/2,h*0.80 + (h*0.06));
            }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(5,15,10,0.95)';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='rgba(0,255,100,0.3)';ctx.lineWidth=4;ctx.strokeRect(w*0.1, h*0.1, w*0.8, h*0.8);
            
            const fontSize = Math.max(16, h * 0.03);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font=`bold ${fontSize * 2}px "Russo One"`;ctx.fillText('CALIBRAÇÃO DO PILOTO',w/2,h*0.25);
            
            ctx.fillStyle='#fff';ctx.font=`bold ${fontSize * 1.2}px Arial`;ctx.fillText('MANTENHA AS MÃOS NA ALTURA DO PEITO',w/2,h*0.4);
            ctx.fillStyle='#f1c40f';ctx.font=`bold ${fontSize}px Arial`;
            ctx.fillText('LEVANTAR MÃOS = SUBIR BICO | ABAIXAR MÃOS = MERGULHAR',w/2,h*0.5);
            ctx.fillText('INCLINAR CABEÇA = DISPARAR MÍSSIL',w/2,h*0.55);
            
            let pct = 1 - this.timer/4;
            ctx.fillStyle='#111';ctx.fillRect(w*0.2,h*0.65,w*0.6,20);
            ctx.fillStyle='#0f6';ctx.fillRect(w*0.2,h*0.65,(w*0.6)*pct,20);
            
            ctx.fillStyle=this.pilot.active?'#0f6':'#f33';
            ctx.fillText(this.pilot.active?'>> SENSORES ATIVOS':'>> APAREÇA NA CÂMERA',w/2,h*0.75);
        },

        _drawEnd: function(ctx,w,h){
            this._draw(ctx,w,h);
            ctx.fillStyle='rgba(0,0,0,0.9)';ctx.fillRect(0,0,w,h);
            
            const fontSize = Math.max(20, h * 0.04);
            ctx.textAlign='center';ctx.font=`bold ${fontSize * 2.5}px "Russo One"`;
            ctx.fillStyle=this.state==='VICTORY'?'#2ecc71':'#e74c3c';
            ctx.fillText(this.state==='VICTORY'?'MISSÃO CUMPRIDA':'AERONAVE DESTRUÍDA',w/2,h/2 - fontSize);
            
            ctx.fillStyle='#f1c40f';ctx.font=`bold ${fontSize * 1.5}px Arial`;
            ctx.fillText(`PAGAMENTO: R$ ${this.session.cash.toLocaleString()}`,w/2,h/2 + fontSize * 1.5);
            ctx.fillStyle='#fff';ctx.font=`bold ${fontSize}px Arial`;
            ctx.fillText(`ABATES: ${this.session.kills}`,w/2,h/2 + fontSize * 3);
        }
    };

    // --- REGISTRO AUTOMÁTICO NO SISTEMA ---
    const register = () => {
        if (window.System?.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Simulador Militar', '✈️', Game, {
                camera: 'user',
                phases: [
                    { id: 'training', name: 'TREINO BÁSICO', desc: 'Aprenda a pilotar e destrua alvos terrestres.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'ESQUADRÃO CO-OP', desc: 'Junte-se a aliados contra a IA.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Combate aéreo contra outros jogadores reais.', mode: 'PVP', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) {
        const check = setInterval(() => { if (register()) clearInterval(check); }, 100);
    }
})();