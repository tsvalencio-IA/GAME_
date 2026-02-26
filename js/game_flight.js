// =============================================================================
// AERO STRIKE SIMULATOR: BRAZILIAN ARMED FORCES EDITION (V-FINAL ABSOLUTE)
// ENGINE: PROJEÇÃO 3D VETORIAL, MULTIPLAYER FIREBASE NATIVO, HUD CLEAN
// STATUS: LOBBY FUNCIONAL, FÍSICA SUAVIZADA, SALDO GLOBAL INTEGRADO
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D (Core Estável)
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
        }
    };

    // -----------------------------------------------------------------
    // 3. ÁUDIO
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
            } catch(e) {}
        },
        stop: function() { 
            if (this.engineSrc) { 
                try { this.engineSrc.stop(); } catch(e) {} 
                this.engineSrc = null; 
            } 
        }
    };

    // -----------------------------------------------------------------
    // 4. LÓGICA DO JOGO (GAME CORE)
    // -----------------------------------------------------------------
    const Game = {
        state: 'INIT', 
        lastTime: 0, 
        mode: 'SINGLE', 
        
        // Economia Global
        money: 0, 
        sessionMoney: 0,
        
        // Arrays Nativos (Estáveis para lógica simples)
        entities: [], 
        bullets: [], 
        missiles: [], 
        fx: [], 
        clouds: [], 
        floaters: [],
        
        // Estado do Jogador
        ship: { 
            hp: 100, speed: 1200, x: 0, y: 15000, z: 0, 
            pitch: 0, yaw: 0, roll: 0, 
            pitchVel: 0, rollVel: 0 
        },
        
        // Controle de Pose
        pilot: { 
            active: false, targetRoll: 0, targetPitch: 0, headTilt: false, 
            handR: {x: 0, y: 0}, handL: {x: 0, y: 0} 
        },
        
        // Sistemas Extras
        timer: 4.0, 
        hoverTime: 0, 
        cameraShake: 0,
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null },
        environment: { skyTop: '', skyBot: '', ground: '', isNight: false, stars: [] },

        init: function(faseData) {
            this.lastTime = performance.now();
            
            // Sincroniza saldo global
            this.money = (window.Profile && window.Profile.coins) ? window.Profile.coins : 0;
            this.sessionMoney = 0;
            this.session = { kills: 0, goal: 30 };
            
            // Reseta Arrays
            this.entities = []; this.bullets = []; this.missiles = []; this.fx = []; this.clouds = []; this.floaters = [];
            
            this.ship = { hp: 100, speed: 1200, x: 0, y: 15000, z: 0, pitch: 0, yaw: 0, roll: 0, pitchVel: 0, rollVel: 0 };
            this.pilot = { active: false, targetRoll: 0, targetPitch: 0, headTilt: false, handR: {x:0,y:0}, handL: {x:0,y:0} };
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            this.cameraShake = 0;
            
            this._setupEnvironment();
            for (let i = 0; i < 50; i++) {
                this.clouds.push({
                    x: (Math.random() - 0.5) * 100000, 
                    y: 8000 + Math.random() * 10000, 
                    z: (Math.random() - 0.5) * 100000, 
                    size: 3000 + Math.random() * 5000
                });
            }

            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random() * 9999);
            this.mode = faseData?.mode || 'SINGLE';
            
            if (this.mode !== 'SINGLE' && window.DB) {
                this._initNet();
            } else {
                this.state = 'CALIBRATION';
                this.timer = 4.0;
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
            
            // Limpa o jogador ao sair
            this.net.playersRef.child(this.net.uid).onDisconnect().remove();
            
            // Verifica se é o Host
            this.net.sessionRef.child('host').once('value').then(snap => {
                if (!snap.val()) { 
                    this.net.isHost = true; 
                    this.net.sessionRef.child('host').set(this.net.uid); 
                    this.net.sessionRef.child('state').set('LOBBY'); 
                    this.net.playersRef.remove(); 
                }
                // Cria jogador na sala
                this.net.playersRef.child(this.net.uid).set({ 
                    name: window.Profile?.username || 'PILOTO', 
                    ready: false, 
                    hp: 100, 
                    x: 0, y: 15000, z: 0, 
                    pitch: 0, yaw: 0, roll: 0 
                });
            });
            
            // Escuta atualizações dos outros jogadores
            this.net.playersRef.on('value', snap => { 
                this.net.players = snap.val() || {};
            });
            
            // Inicia o jogo se o host mandar
            this.net.sessionRef.child('state').on('value', snap => { 
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') {
                    this.state = 'CALIBRATION';
                    this.timer = 4.0;
                }
            });
        },

        update: function(ctx, w, h, pose) {
            let now = performance.now();
            let dt = Math.min((now - this.lastTime) / 1000, 0.05); 
            this.lastTime = now;
            
            if (this.cameraShake > 0) this.cameraShake *= 0.9;

            this._readPose(pose, w, h);

            if (this.state === 'LOBBY') { 
                this._drawLobby(ctx, w, h, dt); 
                return 0; 
            }
            if (this.state === 'CALIBRATION') { 
                this.timer -= dt; 
                this._drawCalib(ctx, w, h); 
                if (this.timer <= 0) this._startMission(); 
                return 0; 
            }
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') { 
                this._drawEnd(ctx, w, h); 
                return this.sessionMoney; 
            }

            this._processPhysics(dt);
            this._processCombat(dt, w, h, now);
            this._processAI(dt);
            this._updateEntities(dt);
            this._updateBullets(dt);
            this._updateMissiles(dt);
            this._cleanupFx(dt);

            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');
            
            this._draw(ctx, w, h, now);
            
            // Retorna o dinheiro ganho na sessão para o System
            return this.sessionMoney;
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

        // -----------------------------------------------------------------
        // CONTROLES SUAVIZADOS
        // -----------------------------------------------------------------
        _readPose: function(pose, w, h) {
            let tR = 0, tP = 0; 
            this.pilot.active = false; 
            this.pilot.headTilt = false; 
            
            if (!pose?.keypoints) return;
            
            const kp = n => pose.keypoints.find(k => k.part === n || k.name === n);
            const rw = kp('right_wrist'), lw = kp('left_wrist');
            const rs = kp('right_shoulder'), ls = kp('left_shoulder');
            const rEar = kp('right_ear'), lEar = kp('left_ear');
            
            // Resolução de Espelhamento
            const pX = x => w - ((x / 640) * w); 
            const pY = y => (y / 480) * h;
            
            // Inclinação da Cabeça (Míssil)
            if (rEar?.score > 0.4 && lEar?.score > 0.4 && Math.abs(pY(rEar.y) - pY(lEar.y)) > h * 0.05) {
                this.pilot.headTilt = true;
            }
            
            if (rw?.score > 0.3 && lw?.score > 0.3 && rs?.score > 0.3 && ls?.score > 0.3) {
                this.pilot.active = true;
                let w1 = { x: pX(rw.x), y: pY(rw.y) }; 
                let w2 = { x: pX(lw.x), y: pY(lw.y) };
                
                // Salva posições para cursor do lobby
                this.pilot.handR = w1; 
                this.pilot.handL = w2;
                
                let hands = [w1, w2].sort((a, b) => a.x - b.x);
                let lH = hands[0]; 
                let rH = hands[1]; 
                let dx = rH.x - lH.x;
                
                // Roll (Virar)
                tR = Math.max(-Math.PI/3, Math.min(Math.PI/3, Math.atan2(rH.y - lH.y, dx)));
                
                // Pitch Suavizado (Subir/Descer) Baseado nos ombros
                let avgShoulderY = (pY(rs.y) + pY(ls.y)) / 2;
                let avgWristY = (lH.y + rH.y) / 2;
                let dy = avgWristY - avgShoulderY;
                
                // ZONA MORTA MAIOR PARA NÃO FICAR "DOIDO"
                let deadzone = h * 0.08; 
                
                if (dy < -deadzone) {
                    tP = 0.8 * Math.min(1, Math.abs(dy) / (h * 0.3)); // Sobe macio
                } else if (dy > deadzone) {
                    tP = -0.8 * Math.min(1, Math.abs(dy) / (h * 0.3)); // Desce macio
                } else {
                    tP = 0;
                }
            }
            
            this.pilot.targetRoll = tR; 
            this.pilot.targetPitch = tP;
        },

        _processPhysics: function(dt) {
            // Suavização do movimento
            this.ship.rollVel += (this.pilot.targetRoll - this.ship.rollVel) * 5 * dt;
            this.ship.pitchVel += (this.pilot.targetPitch - this.ship.pitchVel) * 5 * dt;
            
            // Aplica
            this.ship.roll = this.ship.rollVel;
            this.ship.pitch = this.ship.pitchVel;
            // Yaw acompanha o roll naturalmente
            this.ship.yaw += this.ship.roll * 1.5 * dt;
            
            // Limites de Cabine
            this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));
            
            // Direção do Movimento
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            // Gravidade Simples
            this.ship.speed += (fY * -400 * dt);
            this.ship.speed = Math.max(800, Math.min(2500, this.ship.speed));

            let u = this.ship.speed * 20;
            this.ship.x += u * fX * dt; 
            this.ship.y += u * fY * dt; 
            this.ship.z += u * fZ * dt;
            
            // CHÃO: Bateu no chão, perde vida mas não explode instantaneamente
            if (this.ship.y < 100) { 
                this.ship.y = 100; 
                if (this.ship.pitch < -0.1) {
                    this._takeDamage(15);
                    this.ship.pitchVel = 0.5; // Joga o nariz pra cima (Bounce)
                }
            }
            
            // Teto
            if (this.ship.y > 60000) this.ship.y = 60000;
        },

        // -----------------------------------------------------------------
        // IA E ENTIDADES
        // -----------------------------------------------------------------
        _processAI: function(dt) {
            if (this.entities.length < 8 && Math.random() < 0.02) {
                let dist = 50000 + Math.random() * 30000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                let sx = this.ship.x + fX * dist + (Math.random() - 0.5) * 40000;
                let sz = this.ship.z + fZ * dist + (Math.random() - 0.5) * 40000;
                
                let r = Math.random();
                if (r < 0.4) {
                    this.entities.push({ id: 'e'+Math.random(), type: 'tank', x: sx, y: 0, z: sz, hp: 300, yaw: Math.random()*Math.PI*2 });
                } else {
                    this.entities.push({ id: 'e'+Math.random(), type: 'jet', x: sx, y: Math.max(2000, this.ship.y + (Math.random()-0.5)*10000), z: sz, hp: 150, yaw: this.ship.yaw + Math.PI });
                }
            }
        },

        _updateEntities: function(dt) {
            for (let e of this.entities) {
                if (e.type === 'jet') {
                    // IA Simples Jato: Voa na sua direção
                    e.yaw = Math.atan2(this.ship.x - e.x, this.ship.z - e.z);
                    e.x += Math.sin(e.yaw) * 18000 * dt; 
                    e.z += Math.cos(e.yaw) * 18000 * dt;
                }
                
                let dx = this.ship.x - e.x, dy = this.ship.y - e.y, dz = this.ship.z - e.z;
                let dist = Math.hypot(dx, dy, dz);
                
                if (dist > 150000) { e.hp = -1; continue; }
                
                // Inimigos Atiram
                if (dist < 30000 && Math.random() < 0.03) {
                    let bSpd = e.type === 'tank' ? 15000 : 25000;
                    this.bullets.push({ 
                        x: e.x, y: e.y, z: e.z, 
                        vx: dx / dist * bSpd, vy: dy / dist * bSpd, vz: dz / dist * bSpd, 
                        isEnemy: true, life: 4.0 
                    });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);
        },

        _processCombat: function(dt, w, h, now) {
            this.combat.target = null;
            let closestZ = Infinity;
            
            // Busca Local (Inimigos)
            for (let e of this.entities) {
                let p = Engine3D.project(e.x, e.y, e.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                // Box de trava generosa: 40% da tela central
                if (p.visible && p.z > 500 && p.z < 80000 && Math.abs(p.x - w/2) < w*0.4 && Math.abs(p.y - h/2) < h*0.4 && p.z < closestZ) {
                    closestZ = p.z; 
                    this.combat.target = e;
                }
            }
            
            // Busca Multiplayer (Players)
            if (this.mode === 'PVP') {
                for (let uid in this.net.players) {
                    if (uid === this.net.uid) continue;
                    let pData = this.net.players[uid];
                    if (pData.hp <= 0) continue;
                    let p = Engine3D.project(pData.x, pData.y, pData.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible && p.z > 500 && p.z < 80000 && Math.abs(p.x - w/2) < w*0.4 && Math.abs(p.y - h/2) < h*0.4 && p.z < closestZ) {
                        closestZ = p.z; 
                        this.combat.target = { isPlayer: true, uid: uid, x: pData.x, y: pData.y, z: pData.z, hp: pData.hp };
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

            // Tiro Metralhadora (Automático)
            if (this.combat.locked && this.combat.target && now - this.combat.vulcanCd > 150) {
                this.combat.vulcanCd = now;
                let spd = this.ship.speed * 20 + 35000;
                let dx = this.combat.target.x - this.ship.x + (Math.random()-0.5)*1000;
                let dy = this.combat.target.y - this.ship.y + (Math.random()-0.5)*1000;
                let dz = this.combat.target.z - this.ship.z;
                let dist = Math.hypot(dx, dy, dz);
                
                this.bullets.push({ 
                    x: this.ship.x, y: this.ship.y - 20, z: this.ship.z, 
                    vx: dx/dist*spd, vy: dy/dist*spd, vz: dz/dist*spd, 
                    isEnemy: false, life: 2.0 
                });
                GameSfx.play('vulcan');
            }

            // Tiro Míssil (Head Tilt)
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 2.0; // 2 segundos recarga
                let mSpd = this.ship.speed * 15 + 10000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                let fY = Math.sin(this.ship.pitch);
                let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                
                this.missiles.push({ 
                    x: this.ship.x, y: this.ship.y - 100, z: this.ship.z, 
                    vx: fX*mSpd, vy: fY*mSpd - 2000, vz: fZ*mSpd, 
                    speed: mSpd, target: this.combat.target, life: 8.0 
                });
                GameSfx.play('missile'); window.Gfx?.shakeScreen(5);
            }
        },

        _updateBullets: function(dt) {
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                
                // Rastro Traçante
                if (Math.random() < 0.5) this.fx.push({x: b.x, y: b.y, z: b.z, life: 0.1, c: b.isEnemy ? '#f00' : '#ff0', s: 150});

                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.x, b.y - this.ship.y, b.z - this.ship.z) < 1200) {
                        this._takeDamage(10);
                        b.life = 0;
                    }
                } else {
                    // Colisão com Inimigos Locais
                    for (let e of this.entities) {
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < 2000) {
                            e.hp -= 35;
                            b.life = 0;
                            this.fx.push({x: e.x, y: e.y, z: e.z, life: 0.5, c: '#f90', s: 100});
                            if (e.hp <= 0) this._kill(e);
                            break;
                        }
                    }
                    // Colisão com Players na Rede
                    if (this.mode === 'PVP' && b.life > 0) {
                        for (let uid in this.net.players) {
                            if (uid === this.net.uid) continue;
                            let p = this.net.players[uid];
                            if (p.hp > 0 && Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < 2500) {
                                b.life = 0;
                                this.fx.push({x: p.x, y: p.y, z: p.z, life: 0.5, c: '#f90', s: 100});
                                window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${uid}/hp`).set(p.hp - 10);
                            }
                        }
                    }
                }
                if (b.life <= 0 || b.y < 0) this.bullets.splice(i, 1);
            }
        },

        _updateMissiles: function(dt) {
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.speed += 15000 * dt;
                
                if (m.target && m.target.hp > 0) {
                    // Homing Logic
                    let dx = m.target.x - m.x, dy = m.target.y - m.y, dz = m.target.z - m.z;
                    let d = Math.hypot(dx, dy, dz);
                    let turn = 40000 * dt;
                    m.vx += (dx/d) * turn; m.vy += (dy/d) * turn; m.vz += (dz/d) * turn;
                    
                    let vD = Math.hypot(m.vx, m.vy, m.vz);
                    if (vD > m.speed) { m.vx = (m.vx/vD)*m.speed; m.vy = (m.vy/vD)*m.speed; m.vz = (m.vz/vD)*m.speed; }
                    
                    if (d < 3000) {
                        if (m.target.isPlayer) {
                            window.DB?.ref(`br_army_sessions/aero_${this.mode}/pilotos/${m.target.uid}/hp`).set(m.target.hp - 60);
                            this.fx.push({x: m.target.x, y: m.target.y, z: m.target.z, life: 2.0, c: '#f00', s: 400});
                            this.money += 500; this.sessionMoney += 500;
                        } else {
                            m.target.hp -= 300;
                            if (m.target.hp <= 0) this._kill(m.target);
                        }
                        m.life = 0; GameSfx.play('boom'); window.Gfx?.shakeScreen(8);
                    }
                }
                
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                this.fx.push({x: m.x, y: m.y, z: m.z, life: 1.5, c: 'rgba(200,200,200,0.6)', s: 300}); // Fumaça
                
                if (m.y < 0) { m.life = 0; this.fx.push({x: m.x, y: 0, z: m.z, life: 1.5, c: '#a55', s: 200}); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }
        },

        _cleanupFx: function(dt) {
            for (let i = this.fx.length - 1; i >= 0; i--) {
                let f = this.fx[i]; f.life -= dt;
                if (f.life <= 0) this.fx.splice(i, 1);
            }
            for (let i = this.floaters.length - 1; i >= 0; i--) {
                let f = this.floaters[i]; f.life -= dt; f.y += 100 * dt;
                if (f.life <= 0) this.floaters.splice(i, 1);
            }
            for (let c of this.clouds) {
                if (Math.hypot(c.x - this.ship.x, c.z - this.ship.z) > 120000) {
                    let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                    c.x = this.ship.x + fX * 100000 + (Math.random()-0.5)*50000;
                    c.z = this.ship.z + fZ * 100000 + (Math.random()-0.5)*50000;
                }
            }
        },

        _takeDamage: function(amount) {
            this.ship.hp -= amount;
            this.cameraShake = 15;
            window.Gfx?.shakeScreen(15);
            GameSfx.play('boom');
            if (this.ship.hp <= 0) this._endGame('GAMEOVER');
        },

        _kill: function(e) {
            let rew = e.type === 'tank' ? 200 : 150;
            GameSfx.play('boom');
            this.fx.push({x: e.x, y: e.y, z: e.z, life: 1.5, c: '#f00', s: 800});
            this.fx.push({x: e.x, y: e.y, z: e.z, life: 2.0, c: '#333', s: 1000});
            this.floaters.push({x: e.x, y: e.y, z: e.z, life: 2.0, text: `+ R$${rew}`});
            
            this.session.kills++; 
            this.money += rew; 
            this.sessionMoney += rew;
            
            // Salva no banco de dados imediatamente
            if (window.Profile && window.DB && window.System?.playerId) { 
                window.Profile.coins = this.money; 
                window.DB.ref('users/' + window.System.playerId + '/coins').set(this.money); 
            }
            
            if (this.session.kills >= this.session.goal && this.mode === 'SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res; 
            GameSfx.stop();
            setTimeout(() => { 
                if (window.System?.gameOver) window.System.gameOver(this.session.kills * 150, res === 'VICTORY', this.sessionMoney); 
                else window.System?.home(); 
            }, 3000);
        },

        _startMission: function() {
            this.state = 'PLAYING'; 
            this.ship.x = (Math.random() - 0.5) * 10000; 
            this.ship.z = (Math.random() - 0.5) * 10000; 
            GameSfx.startEngine();
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(() => { 
                    if (this.state === 'PLAYING' && this.net.playersRef) {
                        this.net.playersRef.child(this.net.uid).update({
                            x: this.ship.x, y: this.ship.y, z: this.ship.z, 
                            pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, 
                            hp: this.ship.hp
                        });
                    }
                }, 100);
            }
        },

        // -----------------------------------------------------------------
        // RENDERIZAÇÃO
        // -----------------------------------------------------------------
        _drawLobby: function(ctx, w, h, dt) {
            ctx.fillStyle = 'rgba(10, 20, 30, 0.98)'; ctx.fillRect(0, 0, w, h); 
            
            ctx.fillStyle = '#2ecc71'; ctx.textAlign = 'center'; ctx.font = `bold 32px "Russo One"`; 
            ctx.fillText('SALA DE OPERAÇÕES', w/2, h*0.15);
            
            let psCount = Object.keys(this.net.players).length;
            ctx.font = `bold 20px Arial`; ctx.fillStyle = '#fff'; 
            ctx.fillText(`PILOTOS CONECTADOS: ${psCount + 1}`, w/2, h*0.25);
            
            let py = h*0.35; 
            ctx.fillStyle = '#2ecc71'; ctx.fillText(`[VOCÊ] - PRONTO`, w/2, py); py += 40;
            
            for (let uid in this.net.players) { 
                let p = this.net.players[uid];
                ctx.fillStyle = p.ready ? '#2ecc71' : '#e74c3c'; 
                ctx.fillText(`[${p.ready ? 'PRONTO' : 'ESPERA'}] ${p.name}`, w/2, py); py += 40; 
            }

            // BOTÃO PRONTO (INTERAÇÃO COM A MÃO)
            let btnW = 300, btnH = 60, btnX = w/2 - btnW/2, btnY = h*0.80;
            ctx.fillStyle = this.net.isHost ? (psCount > 0 ? '#c0392b' : '#34495e') : (this.net.players[this.net.uid]?.ready ? '#f39c12' : '#2980b9');
            ctx.fillRect(btnX, btnY, btnW, btnH);
            
            // Interação
            let hx = this.pilot.handR.x, hy = this.pilot.handR.y;
            if (this.pilot.active && hx > btnX && hx < btnX + btnW && hy > btnY && hy < btnY + btnH) {
                ctx.strokeStyle = '#0f6'; ctx.lineWidth = 4; ctx.strokeRect(btnX, btnY, btnW, btnH);
                this.hoverTime += dt;
                ctx.fillStyle = 'rgba(0, 255, 100, 0.3)'; ctx.fillRect(btnX, btnY, btnW * Math.min(1, this.hoverTime / 1.5), btnH);
                if (this.hoverTime >= 1.5) {
                    GameSfx.play('buy');
                    this.hoverTime = 0;
                    if (this.net.isHost && psCount >= 0) { // Permite testar sozinho mudando pra >= 0
                        this.net.sessionRef.child('state').set('PLAYING');
                    } else if (!this.net.isHost) {
                        this.net.playersRef.child(this.net.uid).update({ ready: true });
                    }
                }
            } else {
                this.hoverTime = 0;
            }

            ctx.fillStyle = '#fff'; ctx.font = `bold 22px "Russo One"`; 
            let txt = this.net.isHost ? (psCount >= 0 ? 'LANÇAR MISSÃO' : 'AGUARDANDO...') : 'MARCAR PRONTO';
            ctx.fillText(txt, w/2, btnY + 38);

            // CURSOR DA MÃO
            if (this.pilot.active) { 
                ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI*2); ctx.fill(); 
            }
        },

        _drawCalib: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(5, 15, 10, 0.95)'; ctx.fillRect(0, 0, w, h); 
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.3)'; ctx.lineWidth = 2; ctx.strokeRect(w*0.1, h*0.1, w*0.8, h*0.8);
            
            ctx.fillStyle = '#0f6'; ctx.textAlign = 'center'; ctx.font = `bold 30px "Russo One"`; 
            ctx.fillText('SISTEMAS ONLINE', w/2, h*0.3);
            
            ctx.fillStyle = '#fff'; ctx.font = `bold 18px Arial`; 
            ctx.fillText('CALIBRANDO GIROSCÓPIO...', w/2, h*0.5); 
            
            let pct = 1 - this.timer / 4; 
            ctx.fillStyle = '#111'; ctx.fillRect(w*0.2, h*0.6, w*0.6, 20); 
            ctx.fillStyle = '#0f6'; ctx.fillRect(w*0.2, h*0.6, (w*0.6) * pct, 20);
        },

        _draw: function(ctx, w, h, now) {
            ctx.save();
            if (this.cameraShake > 0.5) ctx.translate((Math.random()-0.5)*this.cameraShake, (Math.random()-0.5)*this.cameraShake);
            
            this._drawWorld(ctx, w, h);
            this._drawGrid(ctx, w, h);
            this._drawEntities(ctx, w, h);
            this._drawVectorHUD(ctx, w, h);
            
            ctx.restore();
        },

        _drawWorld: function(ctx, w, h) {
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(-this.ship.roll);
            let hy = Math.sin(this.ship.pitch) * h * 1.5;
            
            let sG = ctx.createLinearGradient(0, -h*4, 0, hy);
            sG.addColorStop(0, this.environment.skyTop); sG.addColorStop(1, this.environment.skyBot); 
            ctx.fillStyle = sG; ctx.fillRect(-w*3, -h*4, w*6, hy + h*4);
            
            if (this.environment.isNight) { 
                ctx.fillStyle = "rgba(255,255,255,0.8)"; 
                for (let s of this.environment.stars) { ctx.beginPath(); ctx.arc(s.x*w*2, s.y*(-h*4), s.size, 0, Math.PI*2); ctx.fill(); }
            }
            
            let gG = ctx.createLinearGradient(0, hy, 0, h*4); 
            gG.addColorStop(0, this.environment.isNight ? '#050505' : '#1e3020'); gG.addColorStop(1, this.environment.ground); 
            ctx.fillStyle = gG; ctx.fillRect(-w*3, hy, w*6, h*4);
            
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; 
            ctx.beginPath(); ctx.moveTo(-w*3, hy); ctx.lineTo(w*3, hy); ctx.stroke();
            ctx.restore();
        },

        _drawGrid: function(ctx, w, h) {
            if (this.ship.y > 40000) return;
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.2)'; ctx.lineWidth = 1; ctx.beginPath();
            let st = 8000, sx = Math.floor(this.ship.x/st)*st - st*15, sz = Math.floor(this.ship.z/st)*st - st*15;
            for(let x=0; x<=30; x++) {
                for(let z=0; z<=30; z++) {
                    let p = Engine3D.project(sx+x*st, 0, sz+z*st, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if(p.visible && p.s > 0.002) { 
                        ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y);
                        ctx.moveTo(p.x, p.y - 20*p.s); ctx.lineTo(p.x, p.y + 20*p.s);
                    }
                }
            }
            ctx.stroke();
        },

        _drawMesh: function(ctx, mesh, e, w, h) {
            let sc = e.type === 'tank' ? 80 : 60, pF = [];
            for (let f of mesh.f) {
                let col = f[f.length - 1], pts = [], zS = 0, vis = true;
                for (let i = 0; i < f.length - 1; i++) {
                    let v = mesh.v[f[i]];
                    let wP = Engine3D.rotate(v.x*sc, v.y*sc, v.z*sc, 0, e.yaw, 0); 
                    wP.x += e.x; wP.y += e.y; wP.z += e.z;
                    let pr = Engine3D.project(wP.x, wP.y, wP.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (!pr.visible) vis = false; pts.push(pr); zS += pr.z;
                }
                if (vis) pF.push({pts: pts, z: zS / (f.length - 1), color: col});
            }
            pF.sort((a, b) => b.z - a.z);
            for (let f of pF) {
                ctx.fillStyle = f.color; ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(f.pts[0].x, f.pts[0].y); 
                for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        },

        _drawEntities: function(ctx, w, h) {
            let buf = [];
            
            // Inimigos
            for (let e of this.entities) {
                let p = Engine3D.project(e.x, e.y, e.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (p.visible) buf.push({ p: p, t: 'e', o: e });
            }
            // Players
            for (let uid in this.net.players) {
                if (uid === this.net.uid) continue;
                let e = this.net.players[uid];
                let p = Engine3D.project(e.x, e.y, e.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (p.visible) buf.push({ p: p, t: 'p', o: e, id: uid });
            }
            // Balas, Mísseis, FX
            for (let b of this.bullets) { let p = Engine3D.project(b.x, b.y, b.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h); if (p.visible) buf.push({ p: p, t: 'b', o: b }); }
            for (let m of this.missiles) { let p = Engine3D.project(m.x, m.y, m.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h); if (p.visible) buf.push({ p: p, t: 'm', o: m }); }
            for (let f of this.fx) { let p = Engine3D.project(f.x, f.y, f.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h); if (p.visible) buf.push({ p: p, t: 'f', o: f }); }
            for (let c of this.clouds) { let p = Engine3D.project(c.x, c.y, c.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h); if (p.visible) buf.push({ p: p, t: 'c', o: c }); }
            
            buf.sort((a, b) => b.p.z - a.p.z);
            
            buf.forEach(d => {
                let pr = d.p, s = pr.s, e = d.o;
                if (d.t === 'c') { 
                    ctx.fillStyle = this.environment.isNight ? 'rgba(50,50,60,0.08)' : 'rgba(255,255,255,0.2)'; 
                    ctx.beginPath(); ctx.arc(pr.x, pr.y, e.size * s, 0, Math.PI * 2); ctx.fill(); 
                }
                else if (d.t === 'e' || d.t === 'p') {
                    let mesh = (e.type === 'tank') ? MESHES.tank : MESHES.jet;
                    this._drawMesh(ctx, mesh, e, w, h);
                    
                    if (d.t === 'p') {
                        ctx.fillStyle = '#0ff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; 
                        ctx.fillText(e.name || 'ALIADO', pr.x, pr.y - 150 * s - 10);
                    }
                    
                    let isLocked = this.combat.target && (d.t === 'p' ? this.combat.target.uid === d.id : this.combat.target === e);
                    let bs = Math.max(20, 200 * s);
                    
                    if (isLocked) {
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 3; 
                        let b = bs * 1.5;
                        ctx.beginPath();
                        ctx.moveTo(pr.x - b, pr.y - b + 10); ctx.lineTo(pr.x - b, pr.y - b); ctx.lineTo(pr.x - b + 10, pr.y - b);
                        ctx.moveTo(pr.x + b - 10, pr.y - b); ctx.lineTo(pr.x + b, pr.y - b); ctx.lineTo(pr.x + b, pr.y - b + 10);
                        ctx.moveTo(pr.x - b, pr.y + b - 10); ctx.lineTo(pr.x - b, pr.y + b); ctx.lineTo(pr.x - b + 10, pr.y + b);
                        ctx.moveTo(pr.x + b - 10, pr.y + b); ctx.lineTo(pr.x + b, pr.y + b); ctx.lineTo(pr.x + b, pr.y + b - 10);
                        ctx.stroke();
                        ctx.fillStyle = '#f03'; ctx.font = `bold 12px Arial`; ctx.textAlign = 'center'; ctx.fillText('LOCK', pr.x, pr.y + b + 15);
                    }
                }
                else if (d.t === 'b') { 
                    ctx.fillStyle = e.isEnemy ? '#f00' : '#ff0'; ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(2, 10 * s), 0, Math.PI * 2); ctx.fill(); 
                }
                else if (d.t === 'm') { 
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(3, 30 * s), 0, Math.PI * 2); ctx.fill(); 
                }
                else if (d.t === 'f') { 
                    ctx.globalAlpha = Math.max(0, e.life); ctx.fillStyle = e.c; ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(1, e.s * s), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; 
                }
            });
            
            for (let f of this.floaters) {
                let pr = Engine3D.project(f.x, f.y, f.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (pr.visible) { ctx.fillStyle = '#f1c40f'; ctx.font = `bold ${Math.max(14, 2000 * pr.s)}px Arial`; ctx.textAlign = 'center'; ctx.fillText(f.text, pr.x, pr.y); }
            }
        },

        // EXATAMENTE O HUD VETORIAL SOLICITADO
        _drawVectorHUD: function(ctx, w, h) {
            let cx = w / 2, cy = h / 2;
            
            // 1. MIRA [ ]
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; ctx.lineWidth = 2;
            let s = 30;
            ctx.beginPath();
            ctx.moveTo(cx - s, cy - s/2); ctx.lineTo(cx - s, cy + s/2); 
            ctx.moveTo(cx - s, cy - s/2); ctx.lineTo(cx - s/2, cy - s/2);
            ctx.moveTo(cx - s, cy + s/2); ctx.lineTo(cx - s/2, cy + s/2);
            
            ctx.moveTo(cx + s, cy - s/2); ctx.lineTo(cx + s, cy + s/2); 
            ctx.moveTo(cx + s, cy - s/2); ctx.lineTo(cx + s/2, cy - s/2);
            ctx.moveTo(cx + s, cy + s/2); ctx.lineTo(cx + s/2, cy + s/2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 255, 100, 0.8)'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill();

            // 2. TRACEJADOS DE ALTITUDE E PITCH (-)
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll); ctx.beginPath(); ctx.rect(-w/2, -h/2, w, h); ctx.clip();
            let pDeg = this.ship.pitch * 180 / Math.PI;
            let spacing = h * 0.1;
            for (let i = -90; i <= 90; i += 10) {
                if (i === 0) continue;
                let yo = (pDeg - i) * (spacing / 10);
                if (Math.abs(yo) > h * 0.4) continue;
                
                let rw = w * 0.15;
                ctx.beginPath(); if (i < 0) ctx.setLineDash([10, 10]); else ctx.setLineDash([]);
                ctx.moveTo(-w*0.3, yo); ctx.lineTo(-w*0.3 + rw, yo);
                ctx.moveTo(w*0.3, yo); ctx.lineTo(w*0.3 - rw, yo);
                ctx.stroke();
                
                ctx.setLineDash([]); ctx.font = `bold 14px Arial`; ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
                ctx.textAlign = 'left'; ctx.fillText(Math.abs(i), -w*0.3 + rw + 5, yo + 4);
                ctx.textAlign = 'right'; ctx.fillText(Math.abs(i), w*0.3 - rw - 5, yo + 4);
            }
            ctx.restore();

            // 3. MANCHE INFERIOR I____I
            ctx.save();
            let yokeScale = 80;
            ctx.translate(cx, h - 60 + (this.pilot.targetPitch * 40)); 
            ctx.rotate(this.pilot.targetRoll);
            
            ctx.strokeStyle = '#0f6'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, 50); // Haste central I
            ctx.moveTo(-yokeScale, 0); ctx.lineTo(yokeScale, 0); // Barra ____
            ctx.moveTo(-yokeScale, 0); ctx.lineTo(-yokeScale, -yokeScale*0.6); // Esquerda I
            ctx.moveTo(yokeScale, 0); ctx.lineTo(yokeScale, -yokeScale*0.6); // Direita I
            ctx.stroke();
            ctx.restore();

            // 4. TEXTOS
            ctx.fillStyle = '#0f6'; ctx.textAlign = 'left'; ctx.font = `bold 18px 'Russo One', Arial`;
            ctx.fillText(`VEL: ${Math.floor(this.ship.speed)}`, 20, 30);
            ctx.fillText(`ALT: ${Math.floor(this.ship.y)}`, 20, 55);
            
            ctx.textAlign = 'right';
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c';
            ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`, w - 20, 30);
            ctx.fillStyle = '#f1c40f';
            ctx.fillText(`R$: ${this.money}`, w - 20, 55);

            // AVISOS
            ctx.textAlign = 'center';
            if (this.combat.target && this.combat.locked) {
                ctx.fillStyle = '#f03'; ctx.font = `bold 22px 'Russo One'`; ctx.fillText("TRAVADO - FOGO!", cx, h * 0.70);
            }
            if (!this.pilot.active) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, cy - 20, w, 40);
                ctx.fillStyle = '#f00'; ctx.font = `bold 16px Arial`; ctx.fillText("MÃOS NÃO DETECTADAS!", cx, cy + 5);
            }
        },

        _drawEnd: function(ctx, w, h) {
            this._draw(ctx, w, h, performance.now());
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; ctx.fillRect(0, 0, w, h);
            ctx.textAlign = 'center'; ctx.font = `bold 40px "Russo One"`;
            ctx.fillStyle = this.state === 'VICTORY' ? '#2ecc71' : '#e74c3c';
            ctx.fillText(this.state === 'VICTORY' ? 'SUCESSO' : 'DESTRUÍDO', w / 2, h / 2 - 40);
            ctx.fillStyle = '#f1c40f'; ctx.font = `bold 24px Arial`;
            ctx.fillText(`+ R$ ${this.sessionMoney}`, w / 2, h / 2 + 30);
        }
    };

    // =========================================================================
    // INJEÇÃO NO SISTEMA CORE
    // =========================================================================
    const register = () => {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '🚀', Game, {
                camera: 'user',
                phases: [
                    { id: 'training', name: 'TREINO VS. IA', desc: 'Mão Acima = Sobe. Na Barriga = Desce. Mira Automática.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Combate aéreo multiplayer.', mode: 'PVP', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) { const check = setInterval(() => { if (register()) clearInterval(check); }, 100); }
})();