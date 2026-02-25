// =============================================================================
// AERO STRIKE AR: TITANIUM ULTIMATE SIMULATOR (V5.0)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (MILITARY SIMULATION DIV.)
// STATUS: BODY-DEPTH PITCH, CALIBRATION PHASE, INSTANT AUTO-AIM, TACTICAL SCENERY
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MATEMÁTICA VETORIAL DE ALTA PERFORMANCE (6DOF)
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 800,
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, w, h) => {
            let dx = objX - camX;
            let dy = camY - objY; // Y invertido: Chão é negativo, Céu é positivo no Canvas
            let dz = objZ - camZ;

            // Yaw (Rodar a cabeça)
            let cosY = Math.cos(-yaw), sinY = Math.sin(-yaw);
            let x1 = dx * cosY - dz * sinY;
            let z1 = dx * sinY + dz * cosY;

            // Pitch (Subir/Descer Bico)
            let cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            let y2 = dy * cosP - z1 * sinP;
            let z2 = dy * sinP + z1 * cosP;

            if (z2 < 10) return { visible: false };

            let scale = Math3D.fov / z2;
            return {
                x: (w / 2) + (x1 * scale),
                y: (h / 2) - (y2 * scale),
                s: scale, z: z2, visible: true
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. MOTOR DE ÁUDIO (JATO E ARMAS)
    // -----------------------------------------------------------------
    const AudioEngine = {
        ctx: null, jetNoise: null, jetFilter: null, gain: null, initialized: false,
        init: function() {
            if (this.initialized) return;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination);
                this.gain.gain.value = 0.2; this.initialized = true;
            } catch (e) {}
        },
        startJet: function() {
            if (!this.initialized || this.jetNoise) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            let bufferSize = this.ctx.sampleRate * 2; let buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            let data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            this.jetNoise = this.ctx.createBufferSource(); this.jetNoise.buffer = buffer; this.jetNoise.loop = true;
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 1000;
            this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.gain); this.jetNoise.start();
        },
        fireVulcan: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(500, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
            g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireMissile: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(150, t); osc.frequency.linearRampToValueAtTime(800, t + 0.6);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.5);
        },
        explode: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(60, t); osc.frequency.exponentialRampToValueAtTime(5, t + 1.0);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.0);
        },
        stop: function() { if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; } }
    };

    // -----------------------------------------------------------------
    // 3. LÓGICA CENTRAL DO JOGO
    // -----------------------------------------------------------------
    const Game = {
        state: 'CALIBRATING', // Novo estado inicial
        lastTime: 0,
        calibTimer: 3.0,
        baseShoulderDist: 0, // Referência para Passo Frente/Trás
        
        mission: { targetsDestroyed: 0, targetGoal: 30 },
        
        ship: { hp: 100, speed: 2000, worldX: 0, worldY: 8000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 },
        
        // Manche Flutuante que segue as mãos
        yoke: { x: 0, y: 0, angle: 0, active: false, targetX: 0, targetY: 0 },
        inputAction: "ESTÁVEL", // Texto Feedback
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        combat: { currentTarget: null, isLocked: false, lastVulcanTime: 0, missileCooldown: 0, headTilted: false },
        shake: 0, damageFlash: 0,

        // Multiplayer Refs
        isMultiplayer: false, isHost: false, isReady: false, myUid: null, myName: "PILOT", remotePlayers: {}, sessionRef: null, playersRef: null, syncInterval: null,

        init: function(faseData) {
            this.state = 'CALIBRATING'; this.calibTimer = 4.0;
            this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 2000, worldX: 0, worldY: 8000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            this.combat = { currentTarget: null, isLocked: false, lastVulcanTime: 0, missileCooldown: 0, headTilted: false };
            
            for (let i = 0; i < 40; i++) { this.clouds.push({ x: (Math.random() - 0.5) * 80000, y: 5000 + Math.random() * 10000, z: (Math.random() - 0.5) * 80000, size: 2000 + Math.random() * 5000 }); }

            this.myUid = window.System.playerId || "guest_" + Math.floor(Math.random()*10000);
            this.myName = window.System.playerId ? "PILOT_" + this.myUid.substring(0,4) : "GUEST";

            if (faseData && faseData.mode === 'MULTIPLAYER') {
                this.isMultiplayer = true; this.initMultiplayer();
            } else {
                this.isMultiplayer = false;
                // Vai primeiro para CALIBRATING, o update cuida de passar para PLAYING
            }
        },

        initMultiplayer: function() {
            if (!window.DB) { alert("Firebase offline."); window.System.home(); return; }
            this.state = 'LOBBY'; this.remotePlayers = {};
            this.sessionRef = window.DB.ref('game_sessions/flight_sim');
            this.playersRef = this.sessionRef.child('players');
            this.playersRef.child(this.myUid).onDisconnect().remove();

            this.sessionRef.child('host').once('value').then(snap => {
                if (!snap.val()) { this.isHost = true; this.sessionRef.child('host').set(this.myUid); this.sessionRef.child('gameState').set('LOBBY'); this.playersRef.remove(); }
                this.playersRef.child(this.myUid).set({ name: this.myName, ready: false, hp: 100, x: 0, y: 8000, z: 0, pitch: 0, yaw: 0, roll: 0 });
            });

            this.playersRef.on('value', snap => { this.remotePlayers = snap.val() || {}; });
            this.sessionRef.child('gameState').on('value', snap => { 
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') {
                    this.state = 'CALIBRATING'; // Inicia calibração para todos ao mesmo tempo
                    this.calibTimer = 4.0;
                }
            });
            
            this._lobbyClick = this.handleLobbyClick.bind(this);
            window.System.canvas.addEventListener('pointerdown', this._lobbyClick);
        },

        handleLobbyClick: function(e) {
            if (this.state !== 'LOBBY') return;
            const rect = window.System.canvas.getBoundingClientRect(); const scaleX = window.System.canvas.width / rect.width; const scaleY = window.System.canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX; const y = (e.clientY - rect.top) * scaleY;
            const w = window.System.canvas.width; const h = window.System.canvas.height;
            if (x > w/2 - 160 && x < w/2 + 160 && y > h*0.85 && y < h*0.85 + 60) {
                window.Sfx.click();
                if (this.isHost) { if (Object.keys(this.remotePlayers).length >= 2) this.sessionRef.child('gameState').set('PLAYING'); } 
                else { this.isReady = !this.isReady; this.playersRef.child(this.myUid).update({ ready: this.isReady }); }
            }
        },

        startGame: function() {
            this.state = 'PLAYING';
            this.ship.worldX = (Math.random() - 0.5) * 10000; this.ship.worldZ = (Math.random() - 0.5) * 10000;
            AudioEngine.init(); AudioEngine.startJet();
            
            if (this.isMultiplayer) {
                window.System.msg("DOGFIGHT INICIADO! DESTRUA TUDO.");
                this.syncInterval = setInterval(() => {
                    if (this.state === 'PLAYING') this.playersRef.child(this.myUid).update({ x: this.ship.worldX, y: this.ship.worldY, z: this.ship.worldZ, pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp });
                }, 100);
            } else {
                window.System.msg("MIRA AUTOMÁTICA ATIVA. CAÇE-OS.");
            }
        },

        cleanup: function() { 
            AudioEngine.stop();
            if (this.syncInterval) clearInterval(this.syncInterval);
            if (this._lobbyClick) window.System.canvas.removeEventListener('pointerdown', this._lobbyClick);
            if (this.isMultiplayer && this.playersRef) {
                this.playersRef.off(); this.sessionRef.child('gameState').off(); this.playersRef.child(this.myUid).remove();
                if (this.isHost) this.sessionRef.remove();
            }
        },

        // --- RASTREAMENTO INTELIGENTE (CORPO INTEIRO & LERP) ---
        processTracking: function(pose, w, h, dt) {
            this.yoke.active = false;
            this.combat.headTilted = false;
            this.inputAction = "ESTÁVEL";

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const rs = getKp('right_shoulder'); const ls = getKp('left_shoulder');
                const rEar = getKp('right_ear'); const lEar = getKp('left_ear');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                // 1. MÍSSEIS (Orelha ou Nariz para a direita)
                if (rEar && lEar && rEar.score > 0.4 && lEar.score > 0.4) {
                    if ((rEar.y - lEar.y) > 20) this.combat.headTilted = true;
                }

                // 2. FASE DE CALIBRAÇÃO (Guardar distância dos ombros para saber a profundidade)
                let currentShoulderDist = w * 0.4; // Fallback
                if (rs && ls && rs.score > 0.4 && ls.score > 0.4) {
                    currentShoulderDist = Math.hypot(mapX(rs.x) - mapX(ls.x), mapY(rs.y) - mapY(ls.y));
                }

                if (this.state === 'CALIBRATING') {
                    // Média simples para calibrar
                    this.baseShoulderDist = (this.baseShoulderDist * 0.9) + (currentShoulderDist * 0.1);
                    if (this.baseShoulderDist === 0) this.baseShoulderDist = currentShoulderDist;
                }

                // 3. LEITURA DE JOGABILIDADE
                if (rw && lw && rw.score > 0.3 && lw.score > 0.3) {
                    this.yoke.active = true;

                    let rx = mapX(rw.x), ry = mapY(rw.y);
                    let lx = mapX(lw.x), ly = mapY(lw.y);

                    // O Yoke segue EXATAMENTE o centro das mãos na tela
                    this.yoke.targetX = (rx + lx) / 2;
                    this.yoke.targetY = (ry + ly) / 2;
                    
                    let targetAngle = Math.atan2(ry - ly, rx - lx);

                    // --- FÍSICA APLICADA AO AVIÃO ---
                    
                    // YAW (Virar com as mãos)
                    let normX = (this.yoke.targetX - (w / 2)) / (w / 4); 
                    normX = Math.max(-1.5, Math.min(1.5, normX));
                    this.ship.yaw += normX * 1.8 * dt;

                    // PITCH (Passo à Frente / Passo Atrás)
                    let pitchVel = 0;
                    if (this.state === 'PLAYING') {
                        // Se ombros > base: Jogador deu passo à frente. Avião desce.
                        // Se ombros < base: Jogador deu passo atrás. Avião sobe.
                        let depthRatio = currentShoulderDist / this.baseShoulderDist;
                        
                        if (depthRatio > 1.15) { 
                            pitchVel = -1.5; // Mergulho
                            this.inputAction = "MERGULHANDO ⬇️";
                        } 
                        else if (depthRatio < 0.85) { 
                            pitchVel = 1.5; // Subida
                            this.inputAction = "SUBINDO ⬆️";
                        }
                    }
                    this.ship.pitch += pitchVel * dt;

                    // ROLL (Inclinar)
                    let targetRoll = normX * 1.0 + targetAngle * 0.5;
                    this.ship.roll += (targetRoll - this.ship.roll) * 4 * dt;
                }
            }
            
            // Suavização do Manche Visível (Lerp amanteigado)
            if (this.yoke.active) {
                this.yoke.x += (this.yoke.targetX - this.yoke.x) * 10 * dt;
                this.yoke.y += (this.yoke.targetY - this.yoke.y) * 10 * dt;
            } else {
                this.ship.roll *= 0.95; // Auto-estabiliza
                // Yoke volta para o centro se perder as mãos
                this.yoke.targetX = w/2; this.yoke.targetY = h*0.8;
                this.yoke.x += (this.yoke.targetX - this.yoke.x) * 5 * dt;
                this.yoke.y += (this.yoke.targetY - this.yoke.y) * 5 * dt;
            }

            // Normalizar ângulos infinitos
            this.ship.pitch = this.ship.pitch % (Math.PI * 2);
            this.ship.yaw = this.ship.yaw % (Math.PI * 2);
            if (this.ship.pitch < 0) this.ship.pitch += Math.PI * 2;
            if (this.ship.yaw < 0) this.ship.yaw += Math.PI * 2;
        },

        // --- SISTEMA DE MIRA MAGNÉTICA (INSTANT AUTO-LOCK) ---
        processCombat: function(dt, w, h) {
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP; let forwardY = sinP; let forwardZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch); 
            
            this.combat.currentTarget = null;
            let closestDist = Infinity;
            this.combat.isLocked = false;

            const checkTarget = (obj, isPlayer, uid) => {
                let p = Math3D.project(obj.x, obj.y, obj.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, w, h);
                if (p.visible && p.z > 1000 && p.z < 40000) {
                    // CAIXA DE MIRA ENORME (50% do ecrã) - Facilita no telemóvel
                    if (Math.abs(p.x - w/2) < w * 0.35 && Math.abs(p.y - h/2) < h * 0.35) {
                        if (p.z < closestDist) { 
                            closestDist = p.z; 
                            this.combat.currentTarget = isPlayer ? { ...obj, isPlayer: true, uid: uid } : obj; 
                            this.combat.isLocked = true; // LOCK IMEDIATO!
                        }
                    }
                }
            };

            // Verificar Bots
            for (let e of this.entities) { checkTarget(e, false, null); }
            // Verificar Players
            if (this.isMultiplayer) {
                Object.keys(this.remotePlayers).forEach(uid => {
                    if (uid !== this.myUid && this.remotePlayers[uid].hp > 0) checkTarget(this.remotePlayers[uid], true, uid);
                });
            }

            // AUTO-FIRE VULCAN (Instantâneo ao trancar)
            if (this.combat.isLocked && this.combat.currentTarget) {
                const now = performance.now();
                if (now - this.combat.lastVulcanTime > 80) { // Dispara a cada 80ms
                    this.combat.lastVulcanTime = now;
                    let speed = (this.ship.speed * 25) + 30000; // Bala super rápida
                    
                    // Cálculo perfeito para o alvo
                    let dx = this.combat.currentTarget.x - this.ship.worldX;
                    let dy = this.combat.currentTarget.y - this.ship.worldY;
                    let dz = this.combat.currentTarget.z - this.ship.worldZ;
                    let dist = Math.hypot(dx, dy, dz);
                    
                    let offset = Math.random() > 0.5 ? 60 : -60;
                    let spawnX = this.ship.worldX + (Math.cos(this.ship.yaw) * offset);
                    let spawnZ = this.ship.worldZ - (Math.sin(this.ship.yaw) * offset);

                    this.bullets.push({ x: spawnX, y: this.ship.worldY - 20, z: spawnZ, vx: (dx/dist)*speed, vy: (dy/dist)*speed, vz: (dz/dist)*speed, isEnemy: false, life: 1.5 });
                    AudioEngine.fireVulcan(); this.shake = 2;
                }
            }

            // MÍSSEIS DE CABEÇA
            if (this.combat.missileCooldown > 0) this.combat.missileCooldown -= dt;
            if (this.combat.isLocked && this.combat.headTilted && this.combat.missileCooldown <= 0) {
                this.combat.missileCooldown = 1.0; 
                let speed = this.ship.speed * 25;
                let spawnX1 = this.ship.worldX + (Math.cos(this.ship.yaw) * 120); let spawnZ1 = this.ship.worldZ - (Math.sin(this.ship.yaw) * 120);
                this.missiles.push({ x: spawnX1, y: this.ship.worldY - 50, z: spawnZ1, vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, target: this.combat.currentTarget, life: 6.0 });
                AudioEngine.fireMissile(); this.shake = 10;
            }
        },

        // --- LOOP PRINCIPAL DO JOGO ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'LOBBY') { this.renderLobby(ctx, w, h); return 0; }
            
            this.processTracking(pose, w, h, dt);

            if (this.state === 'CALIBRATING') {
                this.calibTimer -= dt;
                this.renderCalibration(ctx, w, h);
                if (this.calibTimer <= 0) this.startGame();
                return 0;
            }

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderFrame(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 50px 'Russo One'";
                if(this.state === 'VICTORY') { ctx.fillStyle = "#2ecc71"; ctx.fillText("ZONA LIMPA!", w/2, h/2); } 
                else { ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE DESTRUÍDA", w/2, h/2); }
                return this.mission.targetsDestroyed * 100;
            }
            
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP; let forwardY = sinP; let forwardZ = cosY * cosP; 
            let speedUnits = this.ship.speed * 25;
            
            // FÍSICA APLICADA
            this.ship.worldX += speedUnits * forwardX * dt; 
            this.ship.worldY += speedUnits * forwardY * dt; 
            this.ship.worldZ += speedUnits * forwardZ * dt;
            
            if (this.ship.worldY < 500) { this.ship.worldY = 500; this.ship.pitch = Math.max(0, this.ship.pitch); } // Proteção solo
            if (this.ship.worldY > 40000) this.ship.worldY = 40000; // Teto

            this.processCombat(dt, w, h);

            // Spawner Global (Inclui Tanques no chão)
            if (this.entities.length < 12 && Math.random() < 0.05) {
                let spawnDist = 30000 + Math.random() * 10000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*20000; 
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*20000;
                let r = Math.random();
                
                // 30% Tanques no chão (y = 0)
                if (r < 0.3) { 
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 200, yaw: Math.random()*Math.PI*2 }); 
                } 
                // 50% Caças a fugir
                else if (r < 0.8) { 
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, vx: forwardX * speedUnits * 0.9, vy: 0, vz: forwardZ * speedUnits * 0.9, hp: 150, yaw: this.ship.yaw }); 
                } 
                // 20% Caças Kamikaze
                else { 
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, vx: -forwardX * 18000, vy: -forwardY * 18000, vz: -forwardZ * 18000, hp: 150, yaw: this.ship.yaw + Math.PI }); 
                }
            }

            // Atualizar Inimigos AI
            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
                if (e.type === 'jet_flee') { e.vx += Math.sin(now * 0.003) * 1000 * dt; e.x += e.vx * dt; }
                let dx = e.x - this.ship.worldX; let dy = e.y - this.ship.worldY; let dz = e.z - this.ship.worldZ;
                let dist = Math.hypot(dx, dy, dz);
                if (dist > 80000) { e.hp = -1; continue; }

                if (dist > 1000 && dist < 12000 && ((e.type === 'jet_attack' && Math.random() < 0.06) || (e.type === 'tank' && Math.random() < 0.02))) {
                    let eSpeed = e.type === 'tank' ? 8000 : 20000;
                    this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: (-dx/dist)*eSpeed, vy: (-dy/dist)*eSpeed, vz: (-dz/dist)*eSpeed, isEnemy: true, life: 3.0 });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            // Atualizar Balas
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.worldX, b.y - this.ship.worldY, b.z - this.ship.worldZ) < 600) {
                        this.ship.hp -= 10; this.damageFlash = 1.0; this.shake = 15;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER'); b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < 800) {
                            e.hp -= 40; b.life = 0; this.spawnParticles(e.x, e.y, e.z, '#f39c12', 4, 30); 
                            if (e.hp <= 0) this.destroyTarget(e); break;
                        }
                    }
                    if (this.isMultiplayer && b.life > 0) {
                        Object.keys(this.remotePlayers).forEach(uid => {
                            if (uid === this.myUid) return; let rp = this.remotePlayers[uid];
                            if (rp.hp > 0 && Math.hypot(b.x - rp.x, b.y - rp.y, b.z - rp.z) < 1000) {
                                b.life = 0; this.spawnParticles(rp.x, rp.y, rp.z, '#f39c12', 4, 40);
                                window.DB.ref(`game_sessions/flight_sim/players/${uid}/hp`).set(rp.hp - 10);
                                this.mission.targetsDestroyed++;
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this.spawnParticles(b.x, 0, b.z, '#7f8c8d', 3, 40); } 
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            // Atualizar Mísseis
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i]; m.vx += forwardX * 6000 * dt; m.vy += forwardY * 6000 * dt; m.vz += forwardZ * 6000 * dt; 
                if (m.target && (m.target.hp > 0 || m.target.isPlayer)) {
                    let dx = m.target.x - m.x; let dy = m.target.y - m.y; let dz = m.target.z - m.z;
                    let dist = Math.hypot(dx, dy, dz); let turnSpeed = 30000 * dt; 
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    if (dist < 1000) { 
                        if (m.target.isPlayer && this.isMultiplayer) {
                            window.DB.ref(`game_sessions/flight_sim/players/${m.target.uid}/hp`).set(m.target.hp - 50);
                            this.mission.targetsDestroyed += 5; this.spawnParticles(m.target.x, m.target.y, m.target.z, '#ff3300', 30, 250); 
                        } else { m.target.hp -= 400; if (m.target.hp <= 0) this.destroyTarget(m.target); }
                        m.life = 0; 
                    }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, vz: (Math.random()-0.5)*150, life: 1.0, c: 'rgba(200,200,200,0.6)', size: 100 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 60 });
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 15, 150); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
            
            if (this.isMultiplayer && this.ship.hp <= 0 && this.state !== 'GAMEOVER') this.endGame('GAMEOVER');

            this.renderFrame(ctx, w, h);
            return this.mission.targetsDestroyed * 100;
        },

        destroyTarget: function(t) {
            AudioEngine.explode(); this.spawnParticles(t.x, t.y, t.z, '#ff3300', 40, 250); this.spawnParticles(t.x, t.y, t.z, '#2c3e50', 30, 400); 
            this.mission.targetsDestroyed++;
            if (this.mission.targetsDestroyed >= this.mission.targetGoal && !this.isMultiplayer) this.endGame('VICTORY');
        },

        endGame: function(result) {
            this.state = result; AudioEngine.stop();
            setTimeout(() => { 
                if(window.System.gameOver) window.System.gameOver(this.mission.targetsDestroyed * 100, result === 'VICTORY', this.mission.targetsDestroyed * 5); 
                else window.System.home(); 
            }, 4000);
        },

        spawnParticles: function(x, y, z, color, count, baseSize) {
            for(let i=0; i<count; i++) { this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*8000, vy: (Math.random()-0.5)*8000, vz: (Math.random()-0.5)*8000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*150 }); }
        },

        // --- RENDERIZAÇÃO ESTADOS ESPECIAIS ---
        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "rgba(10, 15, 25, 0.95)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'"; ctx.fillText("SALA DE BRIEFING MULTIPLAYER", w/2, h*0.15);
            const players = Object.values(this.remotePlayers);
            ctx.font = "bold 24px 'Chakra Petch'"; ctx.fillStyle = "#fff"; ctx.fillText(`ESQUADRÃO ONLINE: ${players.length}`, w/2, h*0.25);
            let py = h*0.35;
            players.forEach((p) => { ctx.fillStyle = p.ready ? "#2ecc71" : "#e74c3c"; ctx.fillText(`[ ${p.ready ? 'PRONTO' : 'PREPARANDO'} ] - ${p.name}`, w/2, py); py += 40; });
            if (this.isHost) {
                const canStart = players.length >= 2;
                ctx.fillStyle = canStart ? "#c0392b" : "#7f8c8d"; ctx.fillRect(w/2 - 160, h*0.85, 320, 60); ctx.fillStyle = "white"; ctx.font = "bold 22px 'Russo One'"; ctx.fillText(canStart ? "INICIAR MISSÃO" : "AGUARDANDO PILOTOS...", w/2, h*0.85 + 38);
            } else {
                ctx.fillStyle = this.isReady ? "#e67e22" : "#27ae60"; ctx.fillRect(w/2 - 160, h*0.85, 320, 60); ctx.fillStyle = "white"; ctx.font = "bold 22px 'Russo One'"; ctx.fillText(this.isReady ? "AGUARDANDO COMANDANTE" : "MARCAR PRONTO!", w/2, h*0.85 + 38);
            }
        },

        renderCalibration: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.85)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText("CALIBRAÇÃO DE PROFUNDIDADE", w/2, h*0.3);
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Chakra Petch'";
            ctx.fillText("FIQUE PARADO E SEGURE O MANCHE INVISÍVEL", w/2, h*0.4);
            ctx.fillText("Passo à frente = Mergulha | Passo atrás = Sobe", w/2, h*0.5);

            // Progress Bar
            let pct = 1 - (this.calibTimer / 4.0);
            ctx.fillStyle = "#333"; ctx.fillRect(w/2 - 200, h*0.6, 400, 20);
            ctx.fillStyle = "#2ecc71"; ctx.fillRect(w/2 - 200, h*0.6, 400 * pct, 20);

            if (this.yoke.active) {
                ctx.fillStyle = "#00ffcc"; ctx.fillText("✓ Mãos detetadas. Mantenha a posição.", w/2, h*0.7);
            } else {
                ctx.fillStyle = "#e74c3c"; ctx.fillText("❌ Levante as mãos para a câmara!", w/2, h*0.7);
            }
        },

        // --- RENDERIZAÇÃO ESTILO AAA (MOBILE OPTIMIZED) ---
        renderFrame: function(ctx, w, h) {
            ctx.save();
            if (this.shake > 0) { ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake); this.shake *= 0.9; }
            this.renderEnvironment(ctx, w, h);
            this.renderEntities(ctx, w, h);
            this.renderCockpit(ctx, w, h);
            if (this.damageFlash > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${this.damageFlash})`; ctx.fillRect(0,0,w,h); this.damageFlash -= 0.05; }
            ctx.restore();
        },

        renderEnvironment: function(ctx, w, h) {
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll); 
            
            // Loop Visual 360
            let pitchWrap = this.ship.pitch % (Math.PI * 2);
            let isUpsideDown = (pitchWrap > Math.PI/2 && pitchWrap < 3*Math.PI/2);
            let horizonY = Math.sin(pitchWrap) * h * 1.5; 

            if (isUpsideDown) { ctx.rotate(Math.PI); horizonY = -horizonY; }

            // CÉU DE ESTRATOSFERA HD
            let skyGrad = ctx.createLinearGradient(0, -h*4, 0, horizonY);
            skyGrad.addColorStop(0, '#000a1a'); skyGrad.addColorStop(0.5, '#003366'); skyGrad.addColorStop(1, '#3388ff');   
            ctx.fillStyle = skyGrad; ctx.fillRect(-w*3, -h*4, w*6, horizonY + h*4);
            
            // SOL
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 100; ctx.shadowColor = '#ffffcc'; 
            ctx.beginPath(); ctx.arc(w*0.8, horizonY - 150, 80, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

            // CHÃO TOPOGRÁFICO MILITAR
            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h*4);
            groundGrad.addColorStop(0, '#111a11'); groundGrad.addColorStop(1, '#050a05');   
            ctx.fillStyle = groundGrad; ctx.fillRect(-w*3, horizonY, w*6, h*4);

            // GRELHA TÁTICA DO TERRENO (Perspetiva Realista)
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.15)'; ctx.lineWidth = 1.5;
            let step = 8000;
            let sx = Math.floor(this.ship.worldX / step) * step - (step * 10);
            let sz = Math.floor(this.ship.worldZ / step) * step - (step * 10);
            
            ctx.beginPath();
            for(let x = 0; x <= 20; x++) {
                for(let z = 0; z <= 20; z++) {
                    let p = Math3D.project(sx + x*step, 0, sz + z*step, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, w, h);
                    if (p.visible && p.s > 0.01) { ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y); }
                }
            }
            ctx.stroke();

            // LINHA DE HORIZONTE NEON
            ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w*3, horizonY); ctx.lineTo(w*3, horizonY); ctx.stroke();
            ctx.restore();
        },

        renderEntities: function(ctx, w, h) {
            let toDraw = [];
            const addDrawable = (list, type) => {
                list.forEach(obj => {
                    let p = Math3D.project(obj.x, obj.y, obj.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, w, h);
                    if (p.visible) toDraw.push({ p: p, type: type, obj: obj });
                });
            };

            addDrawable(this.clouds, 'cloud'); addDrawable(this.entities, 'entity'); addDrawable(this.bullets, 'bullet'); addDrawable(this.missiles, 'missile'); addDrawable(this.particles, 'particle');
            
            if (this.isMultiplayer) {
                Object.keys(this.remotePlayers).forEach(uid => {
                    if (uid === this.myUid) return; let rp = this.remotePlayers[uid]; if (rp.hp <= 0) return; 
                    let p = Math3D.project(rp.x, rp.y, rp.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, w, h);
                    if (p.visible) toDraw.push({ p: p, type: 'remote_player', obj: rp, uid: uid });
                });
            }

            toDraw.sort((a, b) => b.p.z - a.p.z);

            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll); ctx.translate(-w/2, -h/2);
            toDraw.forEach(d => {
                let p = d.p; let s = p.s; let obj = d.obj;

                if (d.type === 'cloud') { ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill(); }
                else if (d.type === 'entity' || d.type === 'remote_player') {
                    let isRemote = d.type === 'remote_player';
                    if (isRemote || obj.type.startsWith('jet')) { this.drawMilitaryJet(ctx, p, obj.yaw, this.ship.yaw, isRemote); } 
                    else if (obj.type === 'tank') { this.draw3DTank(ctx, p.x, p.y, 400 * s); }
                    
                    if (isRemote) {
                        ctx.fillStyle = '#00ffff'; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(obj.name, p.x, p.y - (300 * s) - 10);
                        ctx.fillStyle = '#e74c3c'; ctx.fillRect(p.x - 20, p.y - (300 * s), 40, 5); ctx.fillStyle = '#2ecc71'; ctx.fillRect(p.x - 20, p.y - (300 * s), 40 * (obj.hp/100), 5);
                    }

                    // SISTEMA DE BRACKETS [ ] MAGNÉTICO
                    let isLocked = false;
                    if (this.combat.currentTarget) {
                        if (isRemote && this.combat.currentTarget.uid === d.uid) isLocked = true;
                        if (!isRemote && this.combat.currentTarget === obj) isLocked = true;
                    }
                    
                    if (isLocked) {
                        let bs = Math.max(40, 150 * s); 
                        ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.moveTo(p.x - bs, p.y - bs + 15); ctx.lineTo(p.x - bs, p.y - bs); ctx.lineTo(p.x - bs + 15, p.y - bs);
                        ctx.moveTo(p.x + bs - 15, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs + 15);
                        ctx.moveTo(p.x - bs, p.y + bs - 15); ctx.lineTo(p.x - bs, p.y + bs); ctx.lineTo(p.x - bs + 15, p.y + bs);
                        ctx.moveTo(p.x + bs - 15, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs - 15);
                        ctx.stroke();
                        
                        ctx.fillStyle = '#ff003c'; ctx.textAlign = 'center'; ctx.font = "bold 18px 'Chakra Petch'"; 
                        ctx.fillText("MIRA TRAVADA", p.x, p.y + bs + 25);
                    } else if (!isRemote && (obj.type.startsWith('jet') || obj.type === 'tank')) {
                        // Inimigo normal não trancado
                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 20, p.y - 20, 40, 40);
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.fillStyle = obj.isEnemy ? '#ff0000' : '#ffff00'; ctx.shadowBlur = 20 * s; ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 5 * s), Math.max(5, 80 * s), 0, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
                }
                else if (d.type === 'missile') { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 10*s, p.y - 10*s, 20*s, 20*s); }
                else if (d.type === 'particle') {
                    ctx.globalAlpha = Math.max(0, obj.life); ctx.fillStyle = obj.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, obj.size * s), 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0;
                }
            });
            ctx.restore();
        },

        drawMilitaryJet: function(ctx, p, enemyYaw, playerYaw, isRemote) {
            let relYaw = enemyYaw - playerYaw; let isRearView = Math.cos(relYaw) > 0; 
            let s = p.s * 400; ctx.save(); ctx.translate(p.x, p.y); 
            let mainColor = isRemote ? '#0a3d62' : '#2c3e50';
            if (isRearView) {
                ctx.fillStyle = mainColor; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, s*0.2); ctx.lineTo(-s*0.8, s*0.4); ctx.lineTo(s*0.8, s*0.4); ctx.lineTo(s, s*0.2); ctx.fill();
                ctx.fillStyle = '#1a252f'; ctx.beginPath(); ctx.moveTo(-s*0.2, s*0.1); ctx.lineTo(-s*0.4, -s*0.6); ctx.lineTo(-s*0.1, -s*0.6); ctx.fill();
                ctx.beginPath(); ctx.moveTo(s*0.2, s*0.1); ctx.lineTo(s*0.4, -s*0.6); ctx.lineTo(s*0.1, -s*0.6); ctx.fill();
                ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = isRemote ? '#ff3300' : '#e67e22'; ctx.shadowBlur = 15; ctx.shadowColor = ctx.fillStyle;
                ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.fill();
            } else {
                ctx.fillStyle = mainColor; ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(-s, s*0.4); ctx.lineTo(-s*0.2, s*0.5); ctx.lineTo(s*0.2, s*0.5); ctx.lineTo(s, s*0.4); ctx.fill();
                ctx.fillStyle = '#34495e'; ctx.beginPath(); ctx.moveTo(0, -s*0.8); ctx.lineTo(-s*0.2, s*0.3); ctx.lineTo(s*0.2, s*0.3); ctx.fill();
                ctx.fillStyle = '#000'; ctx.fillRect(-s*0.3, s*0.2, s*0.15, s*0.2); ctx.fillRect(s*0.15, s*0.2, s*0.15, s*0.2);
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(0, -s*0.4); ctx.lineTo(-s*0.1, 0); ctx.lineTo(s*0.1, 0); ctx.fill();
            }
            ctx.restore();
        },

        draw3DTank: function(ctx, cx, cy, s) {
            ctx.save(); ctx.translate(cx, cy);
            // Desenho limpo de um tanque militar de topo
            ctx.fillStyle = '#3e451b'; ctx.fillRect(-s, -s*0.8, s*2, s*1.6);
            ctx.fillStyle = '#111'; ctx.fillRect(-s*1.2, -s*0.8, s*0.2, s*1.6); ctx.fillRect(s*1.0, -s*0.8, s*0.2, s*1.6); // Lagartas
            ctx.fillStyle = '#4b5320'; ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2); ctx.fill(); // Torreta
            ctx.fillStyle = '#000'; ctx.fillRect(-s*0.1, -s*1.5, s*0.2, s*1.5); // Canhão
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // MIRA FIXA CENTRAL (Crosshair Verde)
            ctx.save();
            ctx.shadowBlur = 10; ctx.shadowColor = '#00ff66'; ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(w/2 - 30, h/2); ctx.lineTo(w/2 - 10, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 + 30, h/2); ctx.lineTo(w/2 + 10, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 - 30); ctx.lineTo(w/2, h/2 - 10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 + 30); ctx.lineTo(w/2, h/2 + 10); ctx.stroke();
            ctx.fillStyle = '#00ff66'; ctx.beginPath(); ctx.arc(w/2, h/2, 3, 0, Math.PI*2); ctx.fill();
            ctx.restore();

            // HUD UI LIMPO
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; ctx.fillRect(0, 0, w, 50);
            ctx.fillStyle = "#00ff66"; ctx.font = "bold 20px 'Chakra Petch'"; 
            ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, 20, 30);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)} FT`, w - 20, 30);

            // RADAR MINI-MAP (Canto Superior Direito)
            const radarX = w - 80; const radarY = 130; const radarR = 60;
            ctx.fillStyle = 'rgba(0, 30, 10, 0.7)'; ctx.beginPath(); ctx.arc(radarX, radarY, radarR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(radarX, radarY - radarR); ctx.lineTo(radarX, radarY + radarR); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(radarX - radarR, radarY); ctx.lineTo(radarX + radarR, radarY); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(radarX, radarY - 6); ctx.lineTo(radarX - 5, radarY + 4); ctx.lineTo(radarX + 5, radarY + 4); ctx.fill();

            // Desenhar Posições no Radar
            let maxRadarDist = 40000;
            const drawBlip = (objX, objZ, color, isSquare) => {
                let dx = objX - this.ship.worldX; let dz = objZ - this.ship.worldZ;
                let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);
                let localX = dx * cosY - dz * sinY; let localZ = dx * sinY + dz * cosY;
                let dist = Math.hypot(localX, localZ);
                if (dist > maxRadarDist) { localX = (localX/dist)*maxRadarDist; localZ = (localZ/dist)*maxRadarDist; }
                let plotX = radarX + (localX / maxRadarDist) * radarR; let plotY = radarY - (localZ / maxRadarDist) * radarR;
                ctx.fillStyle = color; 
                if (isSquare) ctx.fillRect(plotX - 3, plotY - 3, 6, 6);
                else { ctx.beginPath(); ctx.arc(plotX, plotY, 3, 0, Math.PI*2); ctx.fill(); }
            };

            this.entities.forEach(e => { drawBlip(e.x, e.z, e.type === 'tank' ? '#e67e22' : '#ff003c', e.type === 'tank'); });
            if (this.isMultiplayer) {
                Object.keys(this.remotePlayers).forEach(uid => {
                    if (uid !== this.myUid && this.remotePlayers[uid].hp > 0) drawBlip(this.remotePlayers[uid].x, this.remotePlayers[uid].z, '#00ffff', false);
                });
            }

            // O MANCHE FLUTUANTE HD QUE SEGUE AS MÃOS PERFEITAMENTE
            if (this.yoke.active) {
                ctx.save();
                ctx.translate(this.yoke.x, this.yoke.y); // Segue a mão milimetricamente
                
                ctx.fillStyle = 'rgba(10, 10, 10, 0.8)';
                ctx.strokeStyle = '#333'; ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); 
                ctx.moveTo(-100, -30); ctx.lineTo(-120, 40); ctx.lineTo(-50, 60); 
                ctx.lineTo(50, 60); ctx.lineTo(120, 40); ctx.lineTo(100, -30); 
                ctx.lineTo(60, -20); ctx.lineTo(30, 20); ctx.lineTo(-30, 20); ctx.lineTo(-60, -20); 
                ctx.closePath(); ctx.fill(); ctx.stroke();
                
                // Gatilhos
                ctx.fillStyle = (this.combat.missileCooldown <= 0) ? '#ff003c' : '#550000';
                ctx.beginPath(); ctx.arc(-90, -25, 10, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#f1c40f'; 
                ctx.beginPath(); ctx.arc(90, -25, 10, 0, Math.PI*2); ctx.fill();

                // Feedback Ação
                ctx.fillStyle = '#020617'; ctx.fillRect(-40, 5, 80, 25);
                ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 1; ctx.strokeRect(-40, 5, 80, 25);
                ctx.fillStyle = '#00ff66'; ctx.font = "bold 10px Arial"; ctx.textAlign="center";
                ctx.fillText(this.inputAction, 0, 22);

                ctx.restore();
            } else {
                ctx.fillStyle = '#ff003c'; ctx.textAlign="center"; ctx.font="bold clamp(16px, 3vw, 24px) Arial";
                ctx.fillText("COLOQUE AS MÃOS NA TELA PARA ASSUMIR O MANCHE", w/2, h - 50);
            }

            // BARRA DE DANO E SUCESSO
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, h - 50, 220, 40);
            ctx.fillStyle = '#222'; ctx.fillRect(20, h - 30, 200, 10);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(20, h - 30, 200 * (Math.max(0, this.ship.hp)/100), 10);
            ctx.fillStyle = '#fff'; ctx.font = "bold 12px Arial"; ctx.textAlign="left"; ctx.fillText(`INTEGRIDADE: ${Math.floor(this.ship.hp)}%`, 20, h - 35);
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '🚀', Game, {
                camera: 'user', 
                phases: [ 
                    { id: 'mission1', name: 'TITANIUM SIMULATOR', desc: 'Siga a Calibração! Passo à frente = Desce. Passo atrás = Sobe. A Mira atira sozinha. Incline a Cabeça = Míssil!', reqLvl: 1 },
                    { id: 'pvp_dogfight', name: 'MULTIPLAYER PVP', desc: 'Dogfight em tempo real contra outros pilotos! Entre na sala e detone.', mode: 'MULTIPLAYER', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();