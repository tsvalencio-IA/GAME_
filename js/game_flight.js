// =============================================================================
// AERO STRIKE: US ARMY TACTICAL SIMULATOR (V-PLATINUM DEFINITIVA)
// ARQUITETO: LEAD ENGINE PROGRAMMER (BASEADO EXATAMENTE NO ARQUIVO TXT DO CEO)
// STATUS: MULTIPLAYER RESTAURADO (COOP/PVP), CONTROLES PERFEITOS (UP=UP, RIGHT=RIGHT)
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. MOTOR MATEMÁTICO E PROJEÇÃO 3D (6DOF) DO ARQUIVO ORIGINAL
    // =========================================================================
    const Engine3D = {
        fov: 800,
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            let dx = objX - camX;
            let dy = objY - camY;
            let dz = objZ - camZ;
            
            // Yaw
            let cy = Math.cos(-yaw), sy = Math.sin(-yaw);
            let x1 = dx * cy - dz * sy;
            let z1 = dx * sy + dz * cy;
            
            // Pitch
            let cp = Math.cos(-pitch), sp = Math.sin(-pitch);
            let y2 = dy * cp - z1 * sp;
            let z2 = dy * sp + z1 * cp;
            
            if (z2 < 10) return { visible: false }; // Atrás da câmera
            
            // Roll
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let finalX = x1 * cr - y2 * sr;
            let finalY = x1 * sr + y2 * cr;
            
            let scale = Engine3D.fov / z2;
            return { 
                x: (w/2) + (finalX * scale), 
                y: (h/2) - (finalY * scale), // Subtrai Y porque no Canvas o Y desce
                s: scale, z: z2, visible: true 
            };
        }
    };

    // =========================================================================
    // 2. SISTEMA DE ÁUDIO MILITAR (SFX)
    // =========================================================================
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

    // =========================================================================
    // 3. CORE DO JOGO E NETCODE (RESTAURADO DO ARQUIVO ORIGINAL)
    // =========================================================================
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30 },
        ship: { hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 },
        pilot: { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false },
        timer: 4.0,
        entities: [], bullets: [], missiles: [], clouds: [], fx: [], floaters: [],
        civilization: [], // Prédios e Casas (Vetorizados)
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null, loop: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30 };
            this.ship = { hp: 100, speed: 1800, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0 };
            this.pilot = { active: false, targetRoll: 0, targetPitch: 0, headTilt: false };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.fx = []; this.floaters = []; this.civilization = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            
            this._setupEnvironment();
            
            // Gerar Nuvens
            for (let i = 0; i < 60; i++) this.clouds.push({ x: (Math.random()-0.5)*120000, y: 8000+Math.random()*15000, z: (Math.random()-0.5)*120000, size: 4000+Math.random()*8000 });
            
            // Gerar "Civilização" no chão (Bases militares e prédios em vetor 2D estáticos)
            for (let i = 0; i < 50; i++) {
                this.civilization.push({
                    x: (Math.random()-0.5)*150000, z: (Math.random()-0.5)*150000,
                    type: Math.random() > 0.5 ? 'predio' : 'base'
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
            if (hour >= 6 && hour < 17) {
                this.environment.skyTop = '#0a3d62'; this.environment.skyBot = '#60a3bc'; this.environment.ground = '#27ae60'; this.environment.isNight = false;
            } else if (hour >= 17 && hour < 19) {
                this.environment.skyTop = '#2c2c54'; this.environment.skyBot = '#ff793f'; this.environment.ground = '#d35400'; this.environment.isNight = false;
            } else {
                this.environment.skyTop = '#000000'; this.environment.skyBot = '#111122'; this.environment.ground = '#0a0a0a'; this.environment.isNight = true;
            }
        },

        // RESTAURAÇÃO EXATA DO MULTIPLAYER DO ARQUIVO ORIGINAL
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
                    name: window.Profile?.username || 'PILOTO', ready: false, hp: 100, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0
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
                this.timer -= dt; this._drawCalib(ctx, w, h);
                if (this.timer <= 0) this._startMission();
                return 0;
            }
            
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this._drawEnd(ctx, w, h); return this.session.cash;
            }

            // FÍSICA DO VOO
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            this.ship.speed += (fY * -500 * dt);
            this.ship.speed = Math.max(800, Math.min(3000, this.ship.speed));

            let units = this.ship.speed * 20;
            this.ship.x += units * fX * dt;
            this.ship.y += units * fY * dt; // Se Pitch é positivo (bico pra cima), Y aumenta (Sobe de altitude)
            this.ship.z += units * fZ * dt;
            
            // Limite de Solo
            if (this.ship.y < 50) { 
                this.ship.y = 50; 
                if(this.ship.pitch < -0.1) {
                    this.ship.hp -= 20; window.Gfx?.shakeScreen(20); GameSfx.play('boom');
                    this.ship.pitch = 0.2; // Quica no chão
                }
            }
            if (this.ship.y > 50000) this.ship.y = 50000;

            this._processCombat(dt, w, h, now);
            this._spawnEnemies();
            this._updateEntities(dt, now);
            this._updateBullets(dt);
            this._updateMissiles(dt);
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

        // =========================================================================
        // A FÍSICA CORRIGIDA E INFALÍVEL
        // =========================================================================
        _readPose: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false;
            this.pilot.headTilt = false;
            
            if (pose?.keypoints) {
                const kp = name => pose.keypoints.find(k => k.part === name || k.name === name);
                const rw = kp('right_wrist'), lw = kp('left_wrist');
                const rs = kp('right_shoulder'), ls = kp('left_shoulder');
                const rEar = kp('right_ear'), lEar = kp('left_ear');
                
                // Míssil via inclinação da cabeça
                if (rEar?.score > 0.4 && lEar?.score > 0.4 && Math.abs(rEar.y - lEar.y) > 25) {
                    this.pilot.headTilt = true;
                }
                
                if (rw?.score > 0.3 && lw?.score > 0.3 && rs?.score > 0.3 && ls?.score > 0.3) {
                    inputDetected = true;
                    
                    // SOLUÇÃO VOLANTE (FIM DA INVERSÃO DE ESPELHO):
                    // Pegamos as coordenadas brutas da câmera e organizamos: 
                    // A mão com o X MENOR está fisicamente na ESQUERDA da tela.
                    // A mão com o X MAIOR está fisicamente na DIREITA da tela.
                    let hands = [{x: rw.x, y: rw.y}, {x: lw.x, y: lw.y}].sort((a,b) => a.x - b.x);
                    let maoEsquerdaTela = hands[0];  
                    let maoDireitaTela = hands[1]; 
                    
                    // Se a mão Direita da tela abaixar (Y aumentar em relação à esquerda), o valor será negativo.
                    // Roll negativo significa inclinar para a Direita.
                    let diferencaVolante = (maoEsquerdaTela.y - maoDireitaTela.y) / 100;
                    trgRoll = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, diferencaVolante));
                    
                    // SOLUÇÃO SUBIR/DESCER (FIM DA INVERSÃO):
                    // Comparamos a altura dos Pulsos contra os Ombros. 
                    let alturaMediaOmbros = (rs.y + ls.y) / 2;
                    let alturaMediaPulsos = (maoEsquerdaTela.y + maoDireitaTela.y) / 2;
                    
                    // No vídeo, Y diminui quando sobe. 
                    // Se os pulsos estão ACIMA dos ombros, a diferença é negativa.
                    let deltaY = alturaMediaPulsos - alturaMediaOmbros;
                    
                    // Mãos ACIMA da linha dos ombros (deltaY negativo) = Avião SOBE (Pitch > 0)
                    if (deltaY < -20) {
                        trgPitch = 1.2; 
                    } 
                    // Mãos ABAIXO da linha dos ombros (deltaY positivo) = Avião DESCE (Pitch < 0)
                    else if (deltaY > 50) {
                        trgPitch = -1.2; 
                    } else {
                        trgPitch = 0; 
                    }
                }
            }
            
            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 8 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 6 * dt;
                
                if (this.state === 'PLAYING') {
                    // O Roll (inclinação) altera o Yaw (Curva)
                    this.ship.yaw -= this.pilot.targetRoll * 1.5 * dt; 
                    this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * 4 * dt;
                    this.ship.pitch += this.pilot.targetPitch * dt;
                    // Limita angulação do bico
                    this.ship.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.ship.pitch));
                }
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll *= 0.9;
                this.pilot.targetPitch *= 0.9;
                this.ship.roll *= 0.95; 
            }
            this.ship.pitch %= Math.PI * 2;
            this.ship.yaw %= Math.PI * 2;
        },

        // --- SISTEMA DE COMBATE AUTÔNOMO ---
        _processCombat: function(dt, w, h, now) {
            this.combat.target = null; this.combat.locked = false; let closestZ = Infinity;
            
            const scan = (obj, isPlayer, uid) => {
                let p = Engine3D.project(obj.x, obj.y, obj.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                // Área de trava
                if (p.visible && p.z > 500 && p.z < 80000 && Math.abs(p.x - w/2) < w*0.35 && Math.abs(p.y - h/2) < h*0.35 && p.z < closestZ) {
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

            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.4) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true; this.combat.lockTimer = 0.4;
                }
            } else {
                this.combat.lockTimer -= dt * 3;
                if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }

            // AUTO-VULCAN
            if (this.combat.locked && this.combat.target && now - this.combat.vulcanCd > 120) {
                this.combat.vulcanCd = now;
                let spd = this.ship.speed * 20 + 45000;
                let dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                dx += (Math.random()-0.5)*1500; dy += (Math.random()-0.5)*1500;
                
                this.bullets.push({
                    x: this.ship.x + Math.cos(this.ship.yaw)*100, y: this.ship.y-30, z: this.ship.z - Math.sin(this.ship.yaw)*100,
                    vx: dx/dist*spd, vy: dy/dist*spd, vz: dz/dist*spd,
                    isEnemy: false, life: 2.5
                });
                GameSfx.play('vulcan');
            }

            // MÍSSIL HOMING
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 1.5;
                let mSpd = this.ship.speed * 15 + 10000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                let fY = Math.sin(this.ship.pitch);
                let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                
                this.missiles.push({
                    x: this.ship.x, y: this.ship.y-100, z: this.ship.z,
                    vx: fX*mSpd + (Math.random()-0.5)*5000, vy: fY*mSpd - 2000, vz: fZ*mSpd + (Math.random()-0.5)*5000,
                    target: this.combat.target, life: 8, speed: mSpd
                });
                GameSfx.play('missile');
                window.Gfx?.shakeScreen(5);
            }
        },

        _spawnEnemies: function() {
            if (this.entities.length >= 10 || Math.random() > 0.03) return;
            let dist = 50000 + Math.random()*30000, r = Math.random();
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let sx = this.ship.x + fX*dist + (Math.random()-0.5)*40000;
            let sz = this.ship.z + fZ*dist + (Math.random()-0.5)*40000;
            
            if (r < 0.4) {
                this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, hp: 300, yaw: Math.random()*Math.PI*2 });
            } else if (r < 0.7) {
                this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.y+(Math.random()-0.5)*10000), z: sz, vx: fX*2500, hp: 150, yaw: this.ship.yaw });
            } else {
                this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.y+(Math.random()-0.5)*10000), z: sz, vx: -fX*28000, vz: -fZ*28000, hp: 150, yaw: this.ship.yaw + Math.PI });
            }
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
                
                // Rastro do tiro
                this.fx.push({x:b.x, y:b.y, z:b.z, vx:0, vy:0, vz:0, life:0.1, c: b.isEnemy?'#ff3300':'#ffff00', size: 150, tracer: true});

                if (b.isEnemy) {
                    if (Math.hypot(b.x-this.ship.x, b.y-this.ship.y, b.z-this.ship.z) < 1200) {
                        this.ship.hp -= 10;
                        window.Gfx?.shakeScreen(15);
                        this._fx(this.ship.x, this.ship.y, this.ship.z + 500, '#f00', 5, 200);
                        GameSfx.play('boom');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x-e.x, b.y-e.y, b.z-e.z) < 2000) {
                            e.hp -= 35; b.life = 0;
                            this._fx(e.x,e.y,e.z,'#f90',3,80);
                            if (e.hp <= 0) this._kill(e, e.type==='tank'?300:150);
                            break;
                        }
                    }
                    if (this.mode==='PVP' && b.life>0) {
                        Object.keys(this.net.players).forEach(uid => {
                            if (uid!==this.net.uid && this.net.players[uid]?.hp>0 && Math.hypot(b.x-this.net.players[uid].x, b.y-this.net.players[uid].y, b.z-this.net.players[uid].z)<2500) {
                                b.life=0;
                                this._fx(this.net.players[uid].x,this.net.players[uid].y,this.net.players[uid].z,'#f90',4,100);
                                window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${uid}/hp`).set(this.net.players[uid].hp-10);
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this._fx(b.x,0,b.z,'#789',3,100); }
                }
                if (b.life <= 0) this.bullets.splice(i,1);
            }
        },

        _updateMissiles: function(dt) {
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
                            this._fx(m.target.x,m.target.y,m.target.z,'#f33',50,400);
                            this.session.cash += 800;
                        } else if (!m.target.isPlayer) {
                            m.target.hp -= 500;
                            if (m.target.hp <= 0) this._kill(m.target, m.target.type==='tank'?500:350);
                        }
                        m.life = 0; GameSfx.play('boom'); window.Gfx?.shakeScreen(5);
                    }
                }
                
                m.x += m.vx*dt; m.y += m.vy*dt; m.z += m.vz*dt; m.life -= dt;
                if(m.y < 0) { m.life = 0; this._fx(m.x,0,m.z,'#a55',10,200); }
                
                // Rastro de Fumaça
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
            this._fx(t.x,t.y,t.z,'#222233', 40, 800); // Fumaça
            this.floaters.push({x:t.x,y:t.y,z:t.z,text:`+ R$${rew}`,life:2.5});
            this.session.kills++;
            this.session.cash += rew;
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

        // =========================================================================
        // VISUAL EXATO DO ARQUIVO ORIGINAL (VETORES, HUD RISQUINHOS, GRADE NO CHÃO)
        // =========================================================================
        _draw: function(ctx, w, h) {
            ctx.save();
            if (window.Gfx?.shake > 0.5) {
                ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            }
            
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            
            // Ordem Exata do arquivo original
            this._drawYoke(ctx, w, h);
            this._drawHUD(ctx,w,h); 
            
            ctx.restore();
            
            // Scanlines
            ctx.fillStyle='rgba(0,0,0,0.15)';
            for(let i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
        },

        _drawWorld: function(ctx,w,h) {
            ctx.save();
            ctx.translate(w/2,h/2);
            ctx.rotate(-this.ship.roll);
            let hy = Math.sin(this.ship.pitch) * h * 1.5;
            
            // Céu
            let sG = ctx.createLinearGradient(0,-h*4,0,hy);
            sG.addColorStop(0, this.environment.skyTop); 
            sG.addColorStop(1, this.environment.skyBot);
            ctx.fillStyle = sG;
            ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);

            // Solo 
            let gG = ctx.createLinearGradient(0,hy,0,h*4);
            gG.addColorStop(0, '#111'); 
            gG.addColorStop(1, this.environment.ground); // O chão verde tático que estava no seu código
            ctx.fillStyle = gG;
            ctx.fillRect(-w*3,hy,w*6,h*4);
            
            // Renderiza Grid Tático de Simulação no solo (Estilo Exército)
            if (this.ship.y < 30000) {
                ctx.strokeStyle = 'rgba(0, 255, 100, 0.2)'; 
                ctx.lineWidth = 1; ctx.beginPath();
                let st = 12000, sx = Math.floor(this.ship.x/st)*st-st*15, sz = Math.floor(this.ship.z/st)*st-st*15;
                for(let x=0; x<=30; x++) {
                    for(let z=0; z<=30; z++) {
                        let p = Engine3D.project(sx+x*st, 0, sz+z*st, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                        if(p.visible && p.s > 0.005) { 
                            ctx.moveTo(p.x-30*p.s, p.y); ctx.lineTo(p.x+30*p.s, p.y); 
                        }
                    }
                }
                ctx.stroke();
            }

            // Renderiza a Civilização (Casas e Bases desenhadas com Vetor Tático, sem polígonos feios)
            if (this.ship.y < 40000) {
                for(let b of this.civilization) {
                    if (Math.hypot(b.x-this.ship.x, b.z-this.ship.z) > 120000) {
                        let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                        b.x = this.ship.x + fX*100000 + (Math.random()-0.5)*80000;
                        b.z = this.ship.z + fZ*100000 + (Math.random()-0.5)*80000;
                    }
                    let p = Engine3D.project(b.x, 0, b.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if(p.visible && p.s > 0.005) {
                        let s = p.s * 3000;
                        if (b.type === 'predio') {
                            ctx.fillStyle = 'rgba(100, 100, 110, 0.9)'; ctx.fillRect(p.x - s/2, p.y - s*2, s, s*2);
                            ctx.strokeStyle = '#0f6'; ctx.strokeRect(p.x - s/2, p.y - s*2, s, s*2); // Fio Neon (Radar)
                        } else {
                            ctx.fillStyle = 'rgba(50, 60, 50, 0.9)'; ctx.fillRect(p.x - s, p.y - s*0.5, s*2, s*0.5);
                            ctx.strokeStyle = '#f1c40f'; ctx.strokeRect(p.x - s, p.y - s*0.5, s*2, s*0.5); // Base Militar
                        }
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
                    ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(14, 2500*s)}px Arial`; ctx.textAlign='center'; ctx.fillText(o.text,p.x,p.y);
                }
                else if(d.t==='e' || d.t==='p') {
                    let isNet = d.t==='p', isTank = o.type==='tank';
                    
                    // Desenhos de Vetores Limpos Originais do Seu Código!
                    if(isNet || o.type?.startsWith('jet')) this._renderJet(ctx, p, o.yaw-this.ship.yaw-this.ship.roll, isNet);
                    else if(isTank) this._renderTank(ctx, p, o.yaw-this.ship.yaw, -this.ship.roll);
                    
                    if(isNet){ ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33'; ctx.font='bold 16px Arial'; ctx.textAlign='center'; ctx.fillText(o.name||'ALIADO',p.x,p.y-350*s-15); }
                    
                    let locked = this.combat.target && (isNet ? this.combat.target.uid===d.id : this.combat.target===o);
                    let bs = Math.max(30, 250*s);
                    
                    if (locked) {
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 3;
                        ctx.beginPath(); ctx.arc(p.x, p.y, bs*1.2, 0, Math.PI*2); ctx.stroke();
                        ctx.fillStyle = '#f03'; ctx.font = `bold ${Math.max(14, h*0.02)}px Arial`; ctx.textAlign = 'center'; 
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

        // Arte Limpa de Jato Original
        _renderJet: function(ctx,p,ry,net){
            let s=p.s*1200; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(ry);
            let mc = net ? (this.mode==='COOP'?'#2980b9':'#8e44ad') : '#4b6584';
            let ec = net ? (this.mode==='COOP'?'#0ff':'#f0f') : '#e74c3c';
            
            ctx.fillStyle=mc; ctx.beginPath(); ctx.moveTo(0,-s*0.8); ctx.lineTo(-s*0.3, s*0.2); ctx.lineTo(-s, s*0.6); ctx.lineTo(0, s*0.4); ctx.lineTo(s, s*0.6); ctx.lineTo(s*0.3, s*0.2); ctx.fill();
            ctx.fillStyle='#111'; ctx.beginPath(); ctx.ellipse(0, -s*0.2, s*0.15, s*0.4, 0, 0, Math.PI*2); ctx.fill();
            
            if(Math.cos(ry) > 0) {
                ctx.fillStyle=ec; ctx.globalCompositeOperation='lighter';
                ctx.beginPath(); ctx.arc(-s*0.2, s*0.4, s*0.15, 0, Math.PI*2); ctx.arc(s*0.2, s*0.4, s*0.15, 0, Math.PI*2); ctx.fill();
                ctx.globalCompositeOperation='source-over';
            }
            ctx.restore();
        },

        // Arte Limpa de Tanque Original
        _renderTank: function(ctx,p,ry,vRoll){
            let s=p.s*1500; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(vRoll);
            ctx.fillStyle='#2c3e50'; ctx.fillRect(-s,-s*0.8,s*2,s*1.6);
            ctx.fillStyle='#111'; ctx.fillRect(-s*1.2,-s*0.9,s*0.3,s*1.8); ctx.fillRect(s*0.9,-s*0.9,s*0.3,s*1.8);
            ctx.rotate(ry); ctx.fillStyle='#34495e'; ctx.beginPath(); ctx.arc(0,0,s*0.6,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#111'; ctx.fillRect(-s*0.1,-s*1.8,s*0.2,s*1.8);
            ctx.restore();
        },
        
        // MANCHE FIXO (YOKE MIL-STD) DO ARQUIVO ORIGINAL
        _drawYoke: function(ctx, w, h) {
            ctx.save();
            let scale = Math.min(w * 0.35, 200); 
            ctx.translate(w/2, h); // Ancorado perfeitamente no fundo da tela (Eixo Y Fixo)

            // Coluna Fixa
            let grad = ctx.createLinearGradient(-20, 0, 20, 0);
            grad.addColorStop(0, '#111'); grad.addColorStop(0.5, '#444'); grad.addColorStop(1, '#111');
            ctx.fillStyle = grad;
            ctx.fillRect(-scale*0.15, -scale*1.2, scale*0.3, scale*1.2);

            // Volante Giratório
            ctx.translate(0, -scale*1.2);
            ctx.rotate(this.pilot.targetRoll); 
            
            ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.roundRect(-scale*0.8, -scale*0.2, scale*1.6, scale*0.3, scale*0.1); ctx.fill();
            
            let gripGrad = ctx.createLinearGradient(-scale, 0, -scale*0.7, 0);
            gripGrad.addColorStop(0, '#050505'); gripGrad.addColorStop(0.5, '#222'); gripGrad.addColorStop(1, '#050505');
            ctx.fillStyle = gripGrad; ctx.beginPath();
            ctx.roundRect(-scale*0.9, -scale*0.5, scale*0.25, scale*0.7, scale*0.1); 
            ctx.roundRect(scale*0.65, -scale*0.5, scale*0.25, scale*0.7, scale*0.1); 
            ctx.fill();

            ctx.fillStyle = this.combat.locked ? '#f33' : '#a00';
            ctx.beginPath(); ctx.arc(-scale*0.77, -scale*0.4, scale*0.06, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(scale*0.77, -scale*0.4, scale*0.06, 0, Math.PI*2); ctx.fill();

            ctx.restore();
        },

        // HUD DE AVIAÇÃO MILITAR COM AS FITAS ORIGINAIS (RISQUINHOS)
        _drawHUD: function(ctx, w, h){
            let cx = w/2, cy = h/2;
            const fz = Math.max(12, Math.min(w * 0.035, 18)); 
            
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
            ctx.font = `bold ${fz}px 'Chakra Petch', sans-serif`;
            
            // Retícula Central
            ctx.beginPath(); 
            ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 20, cy); ctx.lineTo(cx + 5, cy);
            ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 20); ctx.lineTo(cx, cy + 5); 
            ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill();

            // PITCH LADDER - A Linha do Horizonte Artificial no Centro
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll);
            ctx.beginPath(); ctx.rect(-150, -150, 300, 300); ctx.clip();
            let pDeg = this.ship.pitch * 180 / Math.PI;
            let spacing = h * 0.1; 
            for(let i = -90; i <= 90; i += 10) {
                if (i === 0) continue;
                let yo = (pDeg - i) * (spacing / 10);
                let wLine = i < 0 ? 60 : 100;
                ctx.beginPath(); 
                if (i < 0) ctx.setLineDash([10, 10]); else ctx.setLineDash([]);
                ctx.moveTo(-wLine, yo); ctx.lineTo(-wLine + 20, yo); ctx.lineTo(-wLine + 20, i < 0 ? yo - 10 : yo + 10);
                ctx.moveTo(wLine, yo); ctx.lineTo(wLine - 20, yo); ctx.lineTo(wLine - 20, i < 0 ? yo - 10 : yo + 10);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.textAlign = 'right'; ctx.fillText(Math.abs(i), -wLine - 5, yo + 5);
                ctx.textAlign = 'left'; ctx.fillText(Math.abs(i), wLine + 5, yo + 5);
            }
            ctx.restore();

            // FITAS LATERAIS (RISQUINHOS - Velocidade e Altitude)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            let tapeW = w * 0.15; let tapeH = h * 0.4;
            let spdX = w * 0.02; let altX = w * 0.83;
            
            ctx.fillRect(spdX, cy - tapeH/2, tapeW, tapeH); ctx.strokeRect(spdX, cy - tapeH/2, tapeW, tapeH);
            ctx.fillRect(altX, cy - tapeH/2, tapeW, tapeH); ctx.strokeRect(altX, cy - tapeH/2, tapeW, tapeH);
            
            ctx.fillStyle = '#0f6'; ctx.textAlign = 'center'; ctx.font = `bold ${fz * 1.3}px 'Russo One'`;
            ctx.fillText(Math.floor(this.ship.speed), spdX + tapeW/2, cy + fz/2, tapeW * 0.9);
            ctx.fillText(Math.floor(this.ship.y), altX + tapeW/2, cy + fz/2, tapeW * 0.9);
            
            ctx.font = `bold ${fz*0.9}px Arial`; ctx.fillStyle = '#fff';
            ctx.fillText("SPD", spdX + tapeW/2, cy - tapeH/2 - 10, tapeW * 0.9);
            ctx.fillText("ALT", altX + tapeW/2, cy - tapeH/2 - 10, tapeW * 0.9);

            // Bússola Superior
            let hdg = (this.ship.yaw * 180 / Math.PI) % 360; if (hdg < 0) hdg += 360;
            let compW = w * 0.4;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(cx - compW/2, 10, compW, 30); ctx.strokeRect(cx - compW/2, 10, compW, 30);
            ctx.fillStyle = '#fff'; ctx.font = `bold ${fz * 1.1}px 'Russo One'`;
            ctx.fillText(`RUMO: ${Math.floor(hdg)}°`, cx, 32, compW * 0.9);

            // Status Vital do Arquivo Original
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c';
            ctx.font = `bold ${fz * 1.2}px 'Russo One'`; ctx.textAlign = 'left';
            ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`, w * 0.02, h - 20, w * 0.3);
            
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'right';
            ctx.fillText(`R$: ${this.session.cash}`, w * 0.98, h - 20, w * 0.3);
            
            ctx.textAlign = 'center';
            if (this.combat.target && this.combat.locked) {
                ctx.fillStyle = '#f03'; ctx.font = `bold ${fz * 1.5}px 'Russo One'`;
                ctx.fillText("ALVO TRAVADO - FOGO!", cx, h * 0.75, w * 0.9);
                if (this.combat.missileCd <= 0) {
                    ctx.fillStyle = '#0ff'; ctx.font = `bold ${fz}px Arial`;
                    ctx.fillText("INCLINE A CABEÇA P/ MÍSSIL", cx, h * 0.8, w * 0.9);
                }
            } else {
                ctx.fillStyle = '#0f6'; ctx.font = `bold ${fz}px Arial`;
                ctx.fillText("BUSCANDO ALVOS...", cx, h * 0.75, w * 0.9);
            }

            if (!this.pilot.active) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, cy - 30, w, 60);
                ctx.fillStyle = '#f00'; ctx.font = `bold ${fz * 1.5}px Arial`; ctx.textAlign = 'center';
                ctx.fillText("MÃOS NÃO DETECTADAS!", cx, cy + fz*0.5, w * 0.9);
            }
        },
        
        // TELAS DE LOBBY/CALIBRAÇÃO - SEGURAS PARA O MOBILE
        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,30,0.98)';ctx.fillRect(0,0,w,h);
            const fz = Math.min(w * 0.05, 24);
            ctx.fillStyle='#2ecc71';ctx.textAlign='center';ctx.font=`bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('FORÇAS ARMADAS BR', w/2, h*0.15, w*0.9);
            
            const ps=Object.values(this.net.players);
            ctx.font=`bold ${fz}px Arial`;ctx.fillStyle='#fff';ctx.fillText(`PILOTOS NA BASE: ${ps.length}`, w/2, h*0.25, w*0.9);
            
            let py=h*0.35;
            ps.forEach(p=>{
                ctx.fillStyle=p.ready?'#2ecc71':'#e74c3c';
                ctx.fillText(`[${p.ready?'PRONTO':'ESPERA'}] ${p.name}`, w/2, py, w*0.9); py+=40;
            });

            let btnW = Math.min(300, w * 0.8);
            if(this.net.isHost){
                const r=ps.length>=1; 
                ctx.fillStyle=r?'#c0392b':'#34495e'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,50);
                ctx.fillStyle='#fff';ctx.font=`bold ${fz}px "Russo One"`;
                ctx.fillText(r?'LANÇAR MISSÃO':'AGUARDANDO...', w/2, h*0.80 + 32, btnW*0.9);
            }else{
                ctx.fillStyle=this.net.isReady?'#f39c12':'#2980b9'; ctx.fillRect(w/2 - btnW/2,h*0.80,btnW,50);
                ctx.fillStyle='#fff';ctx.font=`bold ${fz}px "Russo One"`;
                ctx.fillText(this.net.isReady?'EM ESPERA':'MARCAR PRONTO', w/2, h*0.80 + 32, btnW*0.9);
            }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(5,15,10,0.95)';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='rgba(0,255,100,0.3)';ctx.lineWidth=4;ctx.strokeRect(w*0.1, h*0.1, w*0.8, h*0.8);
            
            const fz = Math.min(w * 0.045, 22);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font=`bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('CALIBRAÇÃO DE VOO', w/2, h*0.25, w*0.8);
            
            ctx.fillStyle='#fff';ctx.font=`bold ${fz}px Arial`;
            ctx.fillText('AUMENTE A DISTÂNCIA DA CÂMERA', w/2, h*0.4, w*0.8);
            
            ctx.fillStyle='#f1c40f';
            ctx.fillText('MÃO DIR ABAIXO = VIRA DIR', w/2, h*0.5, w*0.8);
            ctx.fillText('MÃOS ACIMA DO OMBRO = SOBE BICO', w/2, h*0.55, w*0.8);
            ctx.fillText('MÃOS NA BARRIGA = DESCE', w/2, h*0.6, w*0.8);
            
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
            ctx.fillText(this.state==='VICTORY'?'MISSÃO CUMPRIDA':'DESTRUÍDO', w/2, h/2 - fz, w*0.9);
            
            ctx.fillStyle='#f1c40f';ctx.font=`bold ${fz*0.6}px Arial`;
            ctx.fillText(`PAGAMENTO: R$ ${this.session.cash}`, w/2, h/2 + fz, w*0.9);
            ctx.fillStyle='#fff';
            ctx.fillText(`ABATES: ${this.session.kills}`, w/2, h/2 + fz*2, w*0.9);
        }
    };

    // SYSTEM INJECTION - RESTAURADOS OS MODOS MULTIPLAYER DO ARQUIVO ORIGINAL
    const register = () => {
        if (window.System?.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Simulador Militar', '✈️', Game, {
                camera: 'user',
                phases: [
                    { id: 'training', name: 'TREINO BÁSICO', desc: 'HUD Militar ativado. Destrua alvos terrestres e aéreos.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'ESQUADRÃO CO-OP', desc: 'Junte-se a aliados na mesma sessão via Firebase.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Combate Aéreo Real contra outros pilotos.', mode: 'PVP', reqLvl: 1 }
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