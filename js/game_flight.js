// =============================================================================
// AERO STRIKE AR: TITANIUM MASTER (V12.0) - THE REDEMPTION UPDATE
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (DIVISÃO DE SIMULAÇÃO MILITAR)
// STATUS: PERFECT STEERING, RADAR RESTORED, LOW ALTITUDE UNLOCKED (50m)
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D VETORIAL MILITAR (PROJEÇÃO CORRIGIDA)
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 700,
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            let dx = objX - camX;
            let dy = objY - camY; // Y Normal: Cima é positivo
            let dz = objZ - camZ;

            // Yaw (Esquerda/Direita)
            let cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            let x1 = dx * cosY - dz * sinY;
            let z1 = dx * sinY + dz * cosY;

            // Pitch (Subir/Descer)
            let cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            let y2 = dy * cosP - z1 * sinP;
            let z2 = dy * sinP + z1 * cosP;

            // Cortar o que está atrás da câmara
            if (z2 < 10) return { visible: false };

            // Roll (Rotação das asas)
            let cosR = Math.cos(roll), sinR = Math.sin(roll);
            let finalX = x1 * cosR - y2 * sinR;
            let finalY = x1 * sinR + y2 * cosR;

            let scale = Math3D.fov / z2;
            return {
                x: (w / 2) + (finalX * scale),
                y: (h / 2) - (finalY * scale), // Inverte Y final para o ecrã do Canvas
                s: scale, z: z2, visible: true
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. SÍNTESE DE ÁUDIO TÁTICO
    // -----------------------------------------------------------------
    const AudioEngine = {
        ctx: null, jetNoise: null, jetFilter: null, gain: null, initialized: false,
        init: function() {
            if (this.initialized) return;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination);
                this.gain.gain.value = 0.15; this.initialized = true;
            } catch (e) {}
        },
        startJet: function() {
            if (!this.initialized || this.jetNoise) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            let bufferSize = this.ctx.sampleRate * 2; let buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            let data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            this.jetNoise = this.ctx.createBufferSource(); this.jetNoise.buffer = buffer; this.jetNoise.loop = true;
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 800;
            this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.gain); this.jetNoise.start();
        },
        beep: function(freq, duration) {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator();
            osc.type = 'square'; osc.frequency.value = freq;
            let g = this.ctx.createGain(); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.01, t + duration);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + duration);
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
            osc.type = 'square'; osc.frequency.setValueAtTime(200, t); osc.frequency.linearRampToValueAtTime(1000, t + 0.5);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.5);
        },
        explode: function(isHuge) {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(isHuge? 40:80, t); osc.frequency.exponentialRampToValueAtTime(10, t + 1.0);
            g.gain.setValueAtTime(isHuge? 1.0 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.0);
        },
        stop: function() { if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; } }
    };

    // -----------------------------------------------------------------
    // 3. CORE DO JOGO E MULTIPLAYER
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0, gameMode: 'SINGLE',
        
        mission: { targetsDestroyed: 0, moneyEarned: 0, targetGoal: 30 },
        ship: { hp: 100, speed: 2000, worldX: 0, worldY: 3000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 },
        
        baseShoulderDist: 0,
        calibTimer: 3.0,
        input: { active: false, rollAngle: 0, pitchVel: 0, headTilt: false },
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [], floatTexts: [],
        combat: { currentTarget: null, isLocked: false, lockTimer: 0, lastVulcanTime: 0, missileCooldown: 0 },
        shake: 0, damageFlash: 0,

        isHost: false, isReady: false, myUid: null, myName: "PILOT", remotePlayers: {}, sessionRef: null, playersRef: null, syncInterval: null,

        init: function(faseData) {
            this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0; this.mission.moneyEarned = 0;
            this.ship = { hp: 100, speed: 2000, worldX: 0, worldY: 3000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            
            this.input = { active: false, rollAngle: 0, pitchVel: 0, headTilt: false };
            this.baseShoulderDist = 0;
            
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = []; this.floatTexts = [];
            this.combat = { currentTarget: null, isLocked: false, lockTimer: 0, lastVulcanTime: 0, missileCooldown: 0 };
            
            for (let i = 0; i < 40; i++) this.clouds.push({ x: (Math.random() - 0.5) * 80000, y: 5000 + Math.random() * 15000, z: (Math.random() - 0.5) * 80000, size: 2000 + Math.random() * 5000 });

            this.myUid = window.System.playerId || "guest_" + Math.floor(Math.random()*10000);
            this.myName = window.System.playerId ? "PILOT_" + this.myUid.substring(0,4) : "GUEST";
            this.gameMode = faseData ? faseData.mode : 'SINGLE';

            if (this.gameMode !== 'SINGLE') this.initMultiplayer();
            else { this.state = 'CALIBRATING'; this.calibTimer = 3.0; }
        },

        initMultiplayer: function() {
            if (!window.DB) { alert("Erro de Conexão com Firebase."); window.System.home(); return; }
            this.state = 'LOBBY'; this.remotePlayers = {};
            this.sessionRef = window.DB.ref('game_sessions/flight_sim_' + this.gameMode);
            this.playersRef = this.sessionRef.child('players');
            this.playersRef.child(this.myUid).onDisconnect().remove();

            this.sessionRef.child('host').once('value').then(snap => {
                if (!snap.val()) { this.isHost = true; this.sessionRef.child('host').set(this.myUid); this.sessionRef.child('gameState').set('LOBBY'); this.playersRef.remove(); }
                this.playersRef.child(this.myUid).set({ name: this.myName, ready: false, hp: 100, x: 0, y: 3000, z: 0, pitch: 0, yaw: 0, roll: 0 });
            });

            this.playersRef.on('value', snap => { this.remotePlayers = snap.val() || {}; });
            this.sessionRef.child('gameState').on('value', snap => { 
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') { this.state = 'CALIBRATING'; this.calibTimer = 3.0; }
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
                if (this.isHost) { if (Object.keys(this.remotePlayers).length >= 1) this.sessionRef.child('gameState').set('PLAYING'); } 
                else { this.isReady = !this.isReady; this.playersRef.child(this.myUid).update({ ready: this.isReady }); }
            }
        },

        startGame: function() {
            this.state = 'PLAYING';
            this.ship.worldX = (Math.random() - 0.5) * 10000; this.ship.worldZ = (Math.random() - 0.5) * 10000;
            AudioEngine.init(); AudioEngine.startJet();
            if (this.gameMode !== 'SINGLE') {
                window.System.msg("DOGFIGHT ONLINE! RADAR LIGADO.");
                this.syncInterval = setInterval(() => {
                    if (this.state === 'PLAYING') this.playersRef.child(this.myUid).update({ x: this.ship.worldX, y: this.ship.worldY, z: this.ship.worldZ, pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp });
                }, 100);
            } else {
                window.System.msg("MIRA MAGNÉTICA ATIVA. CAÇE OS TANQUES!");
            }
        },

        cleanup: function() { 
            AudioEngine.stop();
            if (this.syncInterval) clearInterval(this.syncInterval);
            if (this._lobbyClick) window.System.canvas.removeEventListener('pointerdown', this._lobbyClick);
            if (this.gameMode !== 'SINGLE' && this.playersRef) {
                this.playersRef.off(); this.sessionRef.child('gameState').off(); this.playersRef.child(this.myUid).remove();
                if (this.isHost) this.sessionRef.remove();
            }
        },

        // --- TRACKING CORPORAL (FRENTE/TRÁS + ROTAÇÃO CORRIGIDA) ---
        processTracking: function(pose, w, h, dt) {
            let targetRollAngle = 0;
            let targetPitchVel = 0;
            let hasInput = false;
            this.input.headTilt = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const rs = getKp('right_shoulder'); const ls = getKp('left_shoulder');
                const rEar = getKp('right_ear'); const lEar = getKp('left_ear');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                // Mísseis (Inclinação da Cabeça)
                if (rEar && lEar && rEar.score > 0.4 && lEar.score > 0.4) {
                    if ((rEar.y - lEar.y) > 20) this.input.headTilt = true;
                }

                let currentShoulderDist = w * 0.4; 
                if (rs && ls && rs.score > 0.4 && ls.score > 0.4) {
                    currentShoulderDist = Math.hypot(mapX(rs.x) - mapX(ls.x), mapY(rs.y) - mapY(ls.y));
                }

                if (this.state === 'CALIBRATING') {
                    this.baseShoulderDist = (this.baseShoulderDist * 0.95) + (currentShoulderDist * 0.05);
                    if (this.baseShoulderDist === 0) this.baseShoulderDist = currentShoulderDist;
                }

                if (rw && lw && rw.score > 0.3 && lw.score > 0.3) {
                    hasInput = true;
                    let rx = mapX(rw.x), ry = mapY(rw.y);
                    let lx = mapX(lw.x), ly = mapY(lw.y);
                    
                    // ROTAÇÃO (Roll): Diferença Y entre as mãos
                    // Se a mão direita vai para baixo (maior Y), ry > ly -> o ângulo é positivo.
                    // Nós queremos que um ângulo positivo VIRE O AVIÃO PARA A DIREITA.
                    targetRollAngle = Math.atan2(ry - ly, rx - lx);
                    targetRollAngle = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, targetRollAngle)); 

                    // PITCH (Aproximação vs Calibração)
                    let depthRatio = currentShoulderDist / Math.max(1, this.baseShoulderDist);
                    // Passou para a frente (ombros maiores) -> Mergulha (pitch negativo)
                    if (depthRatio > 1.15) targetPitchVel = -1.2; 
                    // Passou para trás (ombros pequenos) -> Sobe (pitch positivo)
                    else if (depthRatio < 0.85) targetPitchVel = 1.2; 
                }
            }

            if (hasInput) {
                this.input.active = true;
                // LERP Suave
                this.input.rollAngle += (targetRollAngle - this.input.rollAngle) * 8 * dt;
                this.input.pitchVel += (targetPitchVel - this.input.pitchVel) * 5 * dt;

                if (this.state === 'PLAYING') {
                    // CORREÇÃO CRÍTICA DO YAW: 
                    // Se o rollAngle é positivo (mão direita para baixo), soma ao Yaw = vira à direita!
                    this.ship.yaw += this.input.rollAngle * 2.0 * dt; 
                    
                    // O Roll (inclinação visual das asas do avião) segue o volante
                    this.ship.roll += (this.input.rollAngle - this.ship.roll) * 5 * dt;

                    // O Pitch sobe e desce
                    this.ship.pitch += this.input.pitchVel * dt;
                    // Limitar ângulo
                    this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));
                }
            } else {
                this.input.active = false;
                this.input.rollAngle *= 0.9;
                this.input.pitchVel *= 0.9;
                this.ship.roll *= 0.95; 
            }

            this.ship.pitch = this.ship.pitch % (Math.PI * 2);
            this.ship.yaw = this.ship.yaw % (Math.PI * 2);
        },

        // --- SISTEMA DE COMBATE INSTANTÂNEO ---
        processCombat: function(dt, w, h) {
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);
            
            let forwardX = sinY * cosP; let forwardY = sinP; let forwardZ = cosY * cosP; 
            
            this.combat.currentTarget = null;
            this.combat.isLocked = false;
            let closestDist = Infinity;

            const checkTarget = (obj, isPlayer, uid) => {
                let p = Math3D.project(obj.x, obj.y, obj.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (p.visible && p.z > 100 && p.z < 60000) {
                    // CAIXA DE MIRA ENORME (Fácil de mirar no ecrã)
                    if (Math.abs(p.x - w/2) < w * 0.35 && Math.abs(p.y - h/2) < h * 0.35) {
                        if (p.z < closestDist) { 
                            closestDist = p.z; 
                            this.combat.currentTarget = isPlayer ? { ...obj, isPlayer: true, uid: uid } : obj; 
                        }
                    }
                }
            };

            for (let e of this.entities) checkTarget(e, false, null);
            if (this.gameMode === 'PVP') {
                Object.keys(this.remotePlayers).forEach(uid => {
                    if (uid !== this.myUid && this.remotePlayers[uid].hp > 0) checkTarget(this.remotePlayers[uid], true, uid);
                });
            }

            if (this.combat.currentTarget) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.3) { 
                    if (!this.combat.isLocked) AudioEngine.beep(800, 0.1); 
                    this.combat.isLocked = true; this.combat.lockTimer = 0.3; 
                }
            } else {
                this.combat.lockTimer -= dt * 2.0; 
                if (this.combat.lockTimer <= 0) { this.combat.lockTimer = 0; this.combat.isLocked = false; }
            }

            // AUTO-FIRE
            if (this.combat.isLocked && this.combat.currentTarget) {
                const now = performance.now();
                if (now - this.combat.lastVulcanTime > 80) { 
                    this.combat.lastVulcanTime = now;
                    let speed = (this.ship.speed * 25) + 35000; 
                    let dx = this.combat.currentTarget.x - this.ship.worldX;
                    let dy = this.combat.currentTarget.y - this.ship.worldY;
                    let dz = this.combat.currentTarget.z - this.ship.worldZ;
                    let dist = Math.hypot(dx, dy, dz);
                    let offset = Math.random() > 0.5 ? 60 : -60;
                    let spawnX = this.ship.worldX + (Math.cos(this.ship.yaw) * offset);
                    let spawnZ = this.ship.worldZ - (Math.sin(this.ship.yaw) * offset);

                    this.bullets.push({ x: spawnX, y: this.ship.worldY - 20, z: spawnZ, vx: (dx/dist)*speed, vy: (dy/dist)*speed, vz: (dz/dist)*speed, isEnemy: false, life: 1.5 });
                    AudioEngine.fireVulcan(); this.shake = 3;
                }
            }

            // MÍSSEIS
            if (this.combat.missileCooldown > 0) this.combat.missileCooldown -= dt;
            if (this.combat.isLocked && this.input.headTilt && this.combat.missileCooldown <= 0) {
                this.combat.missileCooldown = 1.0; 
                let speed = this.ship.speed * 25;
                let spawnX1 = this.ship.worldX; let spawnZ1 = this.ship.worldZ;
                this.missiles.push({ x: spawnX1, y: this.ship.worldY - 50, z: spawnZ1, vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, target: this.combat.currentTarget, life: 6.0 });
                AudioEngine.fireMissile(); this.shake = 10;
            }
        },

        // --- UPDATE GERAL ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'LOBBY') { this.renderLobby(ctx, w, h); return 0; }
            this.processTracking(pose, w, h, dt);

            if (this.state === 'CALIBRATING') {
                this.calibTimer -= dt; this.renderCalibration(ctx, w, h);
                if (this.calibTimer <= 0) this.startGame(); return 0;
            }

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderFrame(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 50px 'Russo One'";
                if(this.state === 'VICTORY') { ctx.fillStyle = "#2ecc71"; ctx.fillText("MISSÃO CUMPRIDA!", w/2, h/2); } 
                else { ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE ABATIDA", w/2, h/2); }
                ctx.fillStyle = "#f1c40f"; ctx.font = "bold 30px Arial"; ctx.fillText(`LUCRO: R$ ${this.mission.moneyEarned}`, w/2, h/2 + 60);
                return this.mission.moneyEarned;
            }
            
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP; let forwardY = sinP; let forwardZ = cosY * cosP; 
            let speedUnits = this.ship.speed * 25;
            
            this.ship.worldX += speedUnits * forwardX * dt; 
            this.ship.worldY += speedUnits * forwardY * dt; 
            this.ship.worldZ += speedUnits * forwardZ * dt;
            
            // CORREÇÃO CRÍTICA DA ALTITUDE: O Chão duro (Hard Deck) é agora 50m!
            // Podes mergulhar até aos tanques na boa!
            if (this.ship.worldY < 50) { this.ship.worldY = 50; this.ship.pitch = Math.max(0, this.ship.pitch); }
            if (this.ship.worldY > 40000) this.ship.worldY = 40000; 

            this.processCombat(dt, w, h);

            // Spawner Global
            if (this.entities.length < 15 && Math.random() < 0.05) {
                let spawnDist = 40000 + Math.random() * 20000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*30000; 
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*30000;
                let r = Math.random();
                
                if (r < 0.4) { 
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 200, yaw: Math.random()*Math.PI*2 }); 
                } else if (r < 0.8) { 
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*8000), z: sz, vx: forwardX * speedUnits * 0.8, vy: 0, vz: forwardZ * speedUnits * 0.8, hp: 150, yaw: this.ship.yaw }); 
                } else { 
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*8000), z: sz, vx: -forwardX * 22000, vy: -forwardY * 22000, vz: -forwardZ * 22000, hp: 150, yaw: this.ship.yaw + Math.PI }); 
                }
            }

            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
                if (e.type === 'jet_flee') { e.vx += Math.sin(now * 0.003) * 1200 * dt; e.x += e.vx * dt; }
                let dx = e.x - this.ship.worldX; let dy = e.y - this.ship.worldY; let dz = e.z - this.ship.worldZ;
                let dist = Math.hypot(dx, dy, dz);
                if (dist > 100000) { e.hp = -1; continue; } 

                if (dist > 1000 && dist < 15000 && ((e.type === 'jet_attack' && Math.random() < 0.08) || (e.type === 'tank' && Math.random() < 0.04))) {
                    let eSpeed = e.type === 'tank' ? 10000 : 30000;
                    this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: (-(e.x - this.ship.worldX)/dist)*eSpeed, vy: (-(e.y - this.ship.worldY)/dist)*eSpeed, vz: (-(e.z - this.ship.worldZ)/dist)*eSpeed, isEnemy: true, life: 3.5 });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            for (let i = this.floatTexts.length - 1; i >= 0; i--) {
                let ft = this.floatTexts[i]; ft.life -= dt; ft.y -= 80 * dt; 
                if (ft.life <= 0) this.floatTexts.splice(i, 1);
            }

            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.worldX, b.y - this.ship.worldY, b.z - this.ship.worldZ) < 800) {
                        this.ship.hp -= 8; this.damageFlash = 1.0; this.shake = 15;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER'); b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < 1200) {
                            e.hp -= 40; b.life = 0; this.spawnParticles(e.x, e.y, e.z, '#f39c12', 4, 40); 
                            if (e.hp <= 0) this.destroyTarget(e, e.type === 'tank' ? 200 : 100); break;
                        }
                    }
                    if (this.gameMode === 'PVP' && b.life > 0) {
                        Object.keys(this.remotePlayers).forEach(uid => {
                            if (uid === this.myUid) return; let rp = this.remotePlayers[uid];
                            if (rp.hp > 0 && Math.hypot(b.x - rp.x, b.y - rp.y, b.z - rp.z) < 1500) {
                                b.life = 0; this.spawnParticles(rp.x, rp.y, rp.z, '#f39c12', 4, 50);
                                window.DB.ref(`game_sessions/flight_sim_${this.gameMode}/players/${uid}/hp`).set(rp.hp - 10);
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this.spawnParticles(b.x, 0, b.z, '#7f8c8d', 3, 50); } 
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i]; m.vx += forwardX * 6000 * dt; m.vy += forwardY * 6000 * dt; m.vz += forwardZ * 6000 * dt; 
                if (m.target && (m.target.hp > 0 || m.target.isPlayer)) {
                    let dx = m.target.x - m.x; let dy = m.target.y - m.y; let dz = m.target.z - m.z;
                    let dist = Math.hypot(dx, dy, dz); let turnSpeed = 40000 * dt; 
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    if (dist < 1500) { 
                        if (m.target.isPlayer && this.gameMode === 'PVP') {
                            window.DB.ref(`game_sessions/flight_sim_${this.gameMode}/players/${m.target.uid}/hp`).set(m.target.hp - 50);
                            this.spawnParticles(m.target.x, m.target.y, m.target.z, '#ff3300', 40, 300); 
                            this.spawnFloatText(m.target.x, m.target.y, m.target.z, "+ PVP KILL! R$ 500");
                            this.mission.moneyEarned += 500;
                        } else if (!m.target.isPlayer) { 
                            m.target.hp -= 400; if (m.target.hp <= 0) this.destroyTarget(m.target, m.target.type === 'tank' ? 300 : 200); 
                        }
                        m.life = 0; 
                    }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, vz: (Math.random()-0.5)*150, life: 1.0, c: 'rgba(200,200,200,0.8)', size: 150 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 100 });
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 15, 200); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            for (let c of this.clouds) {
                if (Math.hypot(c.x - this.ship.worldX, c.z - this.ship.worldZ) > 100000) { c.z = this.ship.worldZ + forwardZ * 80000 + (Math.random()-0.5)*40000; c.x = this.ship.worldX + forwardX * 80000 + (Math.random()-0.5)*40000; }
            }
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
            
            if (this.gameMode !== 'SINGLE' && this.ship.hp <= 0 && this.state !== 'GAMEOVER') this.endGame('GAMEOVER');

            this.renderFrame(ctx, w, h);
            return this.mission.moneyEarned;
        },

        destroyTarget: function(t, reward) {
            AudioEngine.explode(t.type === 'tank');
            this.spawnParticles(t.x, t.y, t.z, '#ff3300', 40, 300); this.spawnParticles(t.x, t.y, t.z, '#2c3e50', 30, 600); 
            this.spawnFloatText(t.x, t.y, t.z, `+ R$ ${reward}`);
            this.mission.targetsDestroyed++;
            this.mission.moneyEarned += reward;
            
            if (this.mission.targetsDestroyed >= this.mission.targetGoal && this.gameMode === 'SINGLE') this.endGame('VICTORY');
        },

        endGame: function(result) {
            this.state = result; AudioEngine.stop();
            setTimeout(() => { 
                if(window.System.gameOver) window.System.gameOver(this.mission.targetsDestroyed * 100, result === 'VICTORY', this.mission.moneyEarned); 
                else window.System.home(); 
            }, 5000);
        },

        spawnParticles: function(x, y, z, color, count, baseSize) {
            for(let i=0; i<count; i++) { this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*10000, vy: (Math.random()-0.5)*10000, vz: (Math.random()-0.5)*10000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*200 }); }
        },
        spawnFloatText: function(x, y, z, text) {
            this.floatTexts.push({ x: x, y: y, z: z, text: text, life: 2.0 });
        },

        // --- RENDERIZAÇÃO ESTADOS ESPECIAIS ---
        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "rgba(10, 15, 25, 0.95)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'"; ctx.fillText("BRIEFING MULTIPLAYER", w/2, h*0.15);
            const players = Object.values(this.remotePlayers);
            ctx.font = "bold 24px 'Chakra Petch'"; ctx.fillStyle = "#fff"; ctx.fillText(`ESQUADRÃO ONLINE: ${players.length}`, w/2, h*0.25);
            let py = h*0.35;
            players.forEach((p) => { ctx.fillStyle = p.ready ? "#2ecc71" : "#e74c3c"; ctx.fillText(`[ ${p.ready ? 'PRONTO' : 'PREPARANDO'} ] - ${p.name}`, w/2, py); py += 40; });
            if (this.isHost) {
                const canStart = players.length >= 1;
                ctx.fillStyle = canStart ? "#c0392b" : "#7f8c8d"; ctx.fillRect(w/2 - 160, h*0.85, 320, 60); ctx.fillStyle = "white"; ctx.font = "bold 22px 'Russo One'"; ctx.fillText(canStart ? "INICIAR MISSÃO" : "AGUARDANDO...", w/2, h*0.85 + 38);
            } else {
                ctx.fillStyle = this.isReady ? "#e67e22" : "#27ae60"; ctx.fillRect(w/2 - 160, h*0.85, 320, 60); ctx.fillStyle = "white"; ctx.font = "bold 22px 'Russo One'"; ctx.fillText(this.isReady ? "AGUARDANDO COMANDANTE" : "MARCAR PRONTO!", w/2, h*0.85 + 38);
            }
        },

        renderCalibration: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.9)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText("CALIBRAÇÃO CORPORAL", w/2, h*0.3);
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Chakra Petch'";
            ctx.fillText("FIQUE EM PÉ E SEGURE O MANCHE INVISÍVEL", w/2, h*0.4);
            
            ctx.fillStyle = "#f1c40f"; ctx.font = "bold 18px Arial";
            ctx.fillText("Passo Atrás = Sobe ⬆️  |  Passo Frente = Desce ⬇️", w/2, h*0.5);

            let pct = 1 - (this.calibTimer / 3.0);
            ctx.fillStyle = "#333"; ctx.fillRect(w/2 - 200, h*0.6, 400, 20);
            ctx.fillStyle = "#2ecc71"; ctx.fillRect(w/2 - 200, h*0.6, 400 * pct, 20);

            if (this.input.active) { ctx.fillStyle = "#00ffcc"; ctx.fillText("✓ Piloto detetado. A gravar distância base...", w/2, h*0.7); } 
            else { ctx.fillStyle = "#e74c3c"; ctx.fillText("❌ Levante as mãos para a câmara!", w/2, h*0.7); }
        },

        // --- RENDERIZAÇÃO ESTILO PS3 ---
        renderFrame: function(ctx, w, h) {
            ctx.save();
            if (this.shake > 0) { ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake); this.shake *= 0.9; }
            this.renderEnvironment(ctx, w, h);
            this.renderEntities(ctx, w, h);
            this.renderCockpit(ctx, w, h);
            
            if (this.damageFlash > 0) { 
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = `rgba(255, 0, 0, ${this.damageFlash})`; ctx.fillRect(0,0,w,h); 
                this.damageFlash -= 0.05; 
                ctx.globalCompositeOperation = 'source-over';
            }
            // Efeito Scanlines CRT Militar
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; for(let i = 0; i < h; i+= 4) ctx.fillRect(0, i, w, 1);
            let grad = ctx.createRadialGradient(w/2, h/2, h*0.4, w/2, h/2, h*0.8);
            grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.4)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

            ctx.restore();
        },

        renderEnvironment: function(ctx, w, h) {
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(-this.ship.roll); 
            
            let pitchWrap = this.ship.pitch % (Math.PI * 2);
            let isUpsideDown = (pitchWrap > Math.PI/2 && pitchWrap < 3*Math.PI/2);
            let horizonY = Math.sin(pitchWrap) * h * 1.5; 

            if (isUpsideDown) { ctx.rotate(Math.PI); horizonY = -horizonY; }

            // CÉU COM SOL MASSIVO
            let skyGrad = ctx.createLinearGradient(0, -h*4, 0, horizonY);
            skyGrad.addColorStop(0, '#001a33'); skyGrad.addColorStop(0.5, '#004080'); skyGrad.addColorStop(1, '#66a3ff');   
            ctx.fillStyle = skyGrad; ctx.fillRect(-w*3, -h*4, w*6, horizonY + h*4);
            
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 150; ctx.shadowColor = '#ffffcc'; 
            ctx.beginPath(); ctx.arc(w*0.8, horizonY - 150, 90, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

            // CHÃO TÁTICO
            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h*4);
            groundGrad.addColorStop(0, '#111a11'); groundGrad.addColorStop(1, '#050a05');   
            ctx.fillStyle = groundGrad; ctx.fillRect(-w*3, horizonY, w*6, h*4);

            // GRELHA TÁTICA DO TERRENO 
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.2)'; ctx.lineWidth = 2;
            let step = 8000;
            let sx = Math.floor(this.ship.worldX / step) * step - (step * 10);
            let sz = Math.floor(this.ship.worldZ / step) * step - (step * 10);
            
            ctx.beginPath();
            for(let x = 0; x <= 20; x++) {
                for(let z = 0; z <= 20; z++) {
                    let p = Math3D.project(sx + x*step, 0, sz + z*step, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible && p.s > 0.01) { ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y); }
                }
            }
            ctx.stroke();

            ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w*3, horizonY); ctx.lineTo(w*3, horizonY); ctx.stroke();
            ctx.restore();
        },

        renderEntities: function(ctx, w, h) {
            let toDraw = [];
            const addDrawable = (list, type) => {
                list.forEach(obj => {
                    let p = Math3D.project(obj.x, obj.y, obj.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible) toDraw.push({ p: p, type: type, obj: obj });
                });
            };

            addDrawable(this.clouds, 'cloud'); addDrawable(this.entities, 'entity'); addDrawable(this.bullets, 'bullet'); addDrawable(this.missiles, 'missile'); addDrawable(this.particles, 'particle'); addDrawable(this.floatTexts, 'text');
            
            if (this.gameMode !== 'SINGLE') {
                Object.keys(this.remotePlayers).forEach(uid => {
                    if (uid === this.myUid) return; let rp = this.remotePlayers[uid]; if (rp.hp <= 0) return; 
                    let p = Math3D.project(rp.x, rp.y, rp.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible) toDraw.push({ p: p, type: 'remote_player', obj: rp, uid: uid });
                });
            }

            toDraw.sort((a, b) => b.p.z - a.p.z);

            // NÃO aplicamos Roll global no Contexto aqui. O math3D.project() já calculou a posição x/y final!
            toDraw.forEach(d => {
                let p = d.p; let s = p.s; let obj = d.obj;

                if (d.type === 'cloud') { ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill(); }
                else if (d.type === 'text') {
                    ctx.fillStyle = '#2ecc71'; ctx.font = `bold ${Math.max(16, 1200*s)}px 'Russo One'`; ctx.textAlign = "center";
                    ctx.shadowBlur = 10; ctx.shadowColor = '#000'; ctx.fillText(obj.text, p.x, p.y); ctx.shadowBlur = 0;
                }
                else if (d.type === 'entity' || d.type === 'remote_player') {
                    let isRemote = d.type === 'remote_player';
                    
                    if (isRemote || obj.type.startsWith('jet')) { 
                        // Rotaciona a nave visualmente subtraindo o nosso yaw
                        let renderRot = obj.yaw - this.ship.yaw - this.ship.roll; 
                        this.drawMilitaryJet(ctx, p, renderRot, isRemote, this.gameMode); 
                    } else if (obj.type === 'tank') { 
                        // Tanques rodam consoante o yaw deles e aplicamos o roll inverso para os colar ao chão visualmente
                        this.draw3DTank(ctx, p, obj.yaw - this.ship.yaw, -this.ship.roll); 
                    }
                    
                    if (isRemote) {
                        ctx.fillStyle = this.gameMode === 'COOP' ? '#00ffff' : '#ff3300'; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(obj.name, p.x, p.y - (300 * s) - 10);
                        ctx.fillStyle = '#e74c3c'; ctx.fillRect(p.x - 20, p.y - (300 * s), 40, 5); ctx.fillStyle = '#2ecc71'; ctx.fillRect(p.x - 20, p.y - (300 * s), 40 * (obj.hp/100), 5);
                    }

                    // CAIXA DE MIRA TÁTICA (HUD SQUARE)
                    let isLocked = false;
                    if (this.combat.currentTarget) {
                        if (isRemote && this.combat.currentTarget.uid === d.uid) isLocked = true;
                        if (!isRemote && this.combat.currentTarget === obj) isLocked = true;
                    }
                    
                    let bs = Math.max(30, 200 * s); // Mantém o quadrado visível de longe
                    if (isLocked) {
                        ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.moveTo(p.x - bs, p.y - bs + 15); ctx.lineTo(p.x - bs, p.y - bs); ctx.lineTo(p.x - bs + 15, p.y - bs);
                        ctx.moveTo(p.x + bs - 15, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs + 15);
                        ctx.moveTo(p.x - bs, p.y + bs - 15); ctx.lineTo(p.x - bs, p.y + bs); ctx.lineTo(p.x - bs + 15, p.y + bs);
                        ctx.moveTo(p.x + bs - 15, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs - 15);
                        ctx.stroke();
                        ctx.fillStyle = '#ff003c'; ctx.textAlign = 'center'; ctx.font = "bold 18px 'Chakra Petch'"; 
                        ctx.fillText("LOCKED", p.x, p.y + bs + 25);
                    } else if (!isRemote) {
                        let isTank = obj.type === 'tank';
                        ctx.strokeStyle = isTank ? 'rgba(255, 100, 0, 0.8)' : 'rgba(255, 0, 0, 0.6)'; 
                        ctx.lineWidth = 2; ctx.strokeRect(p.x - bs, p.y - bs, bs*2, bs*2);
                        if (bs === 30) { ctx.fillStyle = ctx.strokeStyle; ctx.font="12px Arial"; ctx.textAlign="center"; ctx.fillText(isTank?"[ TANK ]":"[ JET ]", p.x, p.y+bs+15); }
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = obj.isEnemy ? '#ff0000' : '#ffff00'; ctx.shadowBlur = 20 * s; ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 5 * s), Math.max(5, 80 * s), 0, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
                    ctx.globalCompositeOperation = 'source-over';
                }
                else if (d.type === 'missile') { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 10*s, p.y - 10*s, 20*s, 20*s); }
                else if (d.type === 'particle') {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = Math.max(0, obj.life); ctx.fillStyle = obj.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, obj.size * s), 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0;
                    ctx.globalCompositeOperation = 'source-over';
                }
            });
        },

        drawMilitaryJet: function(ctx, p, relYaw, isRemote, gameMode) {
            let isRearView = Math.cos(relYaw) > 0; 
            let s = p.s * 600; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(relYaw);
            let mainColor = isRemote ? (gameMode === 'COOP' ? '#0a3d62' : '#8e44ad') : '#2c3e50';
            let engineColor = isRemote ? (gameMode === 'COOP' ? '#00ffcc' : '#e74c3c') : '#e67e22';

            if (isRearView) {
                ctx.fillStyle = mainColor; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, s*0.2); ctx.lineTo(-s*0.8, s*0.4); ctx.lineTo(s*0.8, s*0.4); ctx.lineTo(s, s*0.2); ctx.fill();
                ctx.fillStyle = '#1a252f'; ctx.beginPath(); ctx.moveTo(-s*0.2, s*0.1); ctx.lineTo(-s*0.4, -s*0.6); ctx.lineTo(-s*0.1, -s*0.6); ctx.fill(); ctx.beginPath(); ctx.moveTo(s*0.2, s*0.1); ctx.lineTo(s*0.4, -s*0.6); ctx.lineTo(s*0.1, -s*0.6); ctx.fill();
                ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = engineColor; ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 20; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
            } else {
                ctx.fillStyle = mainColor; ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(-s, s*0.4); ctx.lineTo(-s*0.2, s*0.5); ctx.lineTo(s*0.2, s*0.5); ctx.lineTo(s, s*0.4); ctx.fill();
                ctx.fillStyle = '#34495e'; ctx.beginPath(); ctx.moveTo(0, -s*0.8); ctx.lineTo(-s*0.2, s*0.3); ctx.lineTo(s*0.2, s*0.3); ctx.fill();
                ctx.fillStyle = '#000'; ctx.fillRect(-s*0.3, s*0.2, s*0.15, s*0.2); ctx.fillRect(s*0.15, s*0.2, s*0.15, s*0.2);
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(0, -s*0.4); ctx.lineTo(-s*0.1, 0); ctx.lineTo(s*0.1, 0); ctx.fill();
            }
            ctx.restore();
        },

        draw3DTank: function(ctx, p, relYaw, visualRoll) {
            let s = p.s * 600;
            ctx.save(); ctx.translate(p.x, p.y); 
            ctx.rotate(visualRoll); // O Tanque é colado ao chão, então precisa rodar visualmente com a nossa nave
            
            ctx.fillStyle = '#4b5320'; ctx.fillRect(-s, -s*0.8, s*2, s*1.6); // Base
            ctx.fillStyle = '#111'; ctx.fillRect(-s*1.2, -s*0.8, s*0.2, s*1.6); ctx.fillRect(s*1.0, -s*0.8, s*0.2, s*1.6); // Lagartas
            
            ctx.rotate(relYaw); // Torreta aponta para o inimigo/caminho
            ctx.fillStyle = '#3e451b'; ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(-s*0.1, -s*1.6, s*0.2, s*1.6); // Canhão
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // =========================================================
            // HUD DA MARINHA (RESTAURADO: BORESIGHT & PITCH LADDER)
            // =========================================================
            ctx.save();
            let cx = w/2, cy = h/2;
            
            // Mira Central (Sempre Estática no Vidro)
            ctx.shadowBlur = 10; ctx.shadowColor = '#00ff66'; ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 10, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 10, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy + 30); ctx.lineTo(cx, cy + 10); ctx.stroke();
            ctx.fillStyle = '#00ff66'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
            
            // Pitch Ladder (Escada de Inclinação que roda e desce com o Avião)
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll); 
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.7)'; ctx.fillStyle = 'rgba(0, 255, 100, 0.7)'; ctx.lineWidth = 2; ctx.font = "bold 14px Arial";
            
            let pitchDeg = this.ship.pitch * (180 / Math.PI);
            let pixelsPerDeg = 15; 

            for(let i = -90; i <= 90; i += 10) {
                if (i === 0) continue; 
                let yOffset = (pitchDeg - i) * pixelsPerDeg;
                
                // Só desenha se estiver dentro do raio de visão do ecrã
                if (Math.abs(yOffset) < h * 0.4) {
                    ctx.beginPath();
                    ctx.moveTo(-150, yOffset); ctx.lineTo(-80, yOffset);
                    if (i < 0) ctx.lineTo(-80, yOffset - 10); // Dive
                    else ctx.lineTo(-80, yOffset + 10); // Climb
                    
                    ctx.moveTo(150, yOffset); ctx.lineTo(80, yOffset);
                    if (i < 0) ctx.lineTo(80, yOffset - 10);
                    else ctx.lineTo(80, yOffset + 10);
                    ctx.stroke();

                    ctx.textAlign = "right"; ctx.fillText(Math.abs(i), -160, yOffset + 5);
                    ctx.textAlign = "left"; ctx.fillText(Math.abs(i), 160, yOffset + 5);
                }
            }
            ctx.restore();

            // =========================================================
            // HUD DE DADOS & RADAR (RESTAURADO)
            // =========================================================
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; ctx.fillRect(0, 0, w, 50);
            ctx.fillStyle = "#00ff66"; ctx.font = "bold 20px 'Chakra Petch'"; 
            ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, 20, 30);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)} FT`, w - 20, 30);
            
            let heading = (this.ship.yaw * 180 / Math.PI) % 360; if(heading < 0) heading += 360;
            ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 22px 'Russo One'";
            ctx.fillText(Math.floor(heading) + "°", w/2, 35);

            // RADAR MINI-MAP TÁTICO
            const radarX = w - 80; const radarY = 130; const radarR = 60;
            ctx.fillStyle = 'rgba(0, 30, 10, 0.7)'; ctx.beginPath(); ctx.arc(radarX, radarY, radarR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(radarX, radarY - radarR); ctx.lineTo(radarX, radarY + radarR); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(radarX - radarR, radarY); ctx.lineTo(radarX + radarR, radarY); ctx.stroke();
            // A nossa nave a apontar para Cima no radar
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(radarX, radarY - 6); ctx.lineTo(radarX - 5, radarY + 4); ctx.lineTo(radarX + 5, radarY + 4); ctx.fill();

            let maxRadarDist = 60000;
            const drawBlip = (objX, objZ, color, isSquare) => {
                let dx = objX - this.ship.worldX; let dz = objZ - this.ship.worldZ;
                let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);
                let localX = dx * cosY - dz * sinY; let localZ = dx * sinY + dz * cosY; 
                let dist = Math.hypot(localX, localZ);
                if (dist > maxRadarDist) { localX = (localX/dist)*maxRadarDist; localZ = (localZ/dist)*maxRadarDist; }
                let plotX = radarX + (localX / maxRadarDist) * radarR; 
                let plotY = radarY - (localZ / maxRadarDist) * radarR; // -Y porque a frente (+Z local) é pra cima no radar
                
                ctx.fillStyle = color; 
                if (isSquare) ctx.fillRect(plotX - 3, plotY - 3, 6, 6);
                else { ctx.beginPath(); ctx.arc(plotX, plotY, 3, 0, Math.PI*2); ctx.fill(); }
            };

            this.entities.forEach(e => { drawBlip(e.x, e.z, e.type === 'tank' ? '#e67e22' : '#ff003c', e.type === 'tank'); });
            if (this.isMultiplayer) {
                Object.keys(this.remotePlayers).forEach(uid => {
                    if (uid !== this.myUid && this.remotePlayers[uid].hp > 0) {
                        let color = this.gameMode === 'COOP' ? '#00ffff' : '#ff3300'; drawBlip(this.remotePlayers[uid].x, this.remotePlayers[uid].z, color, false);
                    }
                });
            }

            // ==============================================================
            // O MANCHE FÍSICO CHUMBADO À BASE (COLUNA NÃO SE MEXE)
            // ==============================================================
            if (this.input.active) {
                ctx.save();
                
                // 1. A COLUNA: Fica chumbada ao centro da base do telemóvel
                ctx.translate(w/2, h);
                
                // Profundidade: Encolhe/Estica o Manche consoante o passo (PitchVel)
                let depthScale = 1.0;
                if (this.input.pitchVel < -0.5) depthScale = 0.85; // Mergulho
                if (this.input.pitchVel > 0.5) depthScale = 1.15; // Subida
                ctx.scale(depthScale, depthScale);

                // Coluna preta imóvel
                ctx.fillStyle = '#050505'; ctx.fillRect(-25, -160, 50, 160); 
                
                // 2. O VOLANTE: Roda no topo da Coluna
                ctx.translate(0, -160);
                ctx.rotate(this.input.rollAngle); // Roda APENAS O VOLANTE
                
                // Desenho do Volante HD
                ctx.fillStyle = 'rgba(15, 15, 15, 0.95)'; ctx.strokeStyle = '#333'; ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(-110, -30); ctx.lineTo(-130, 40); ctx.lineTo(-60, 60); ctx.lineTo(60, 60); ctx.lineTo(130, 40); ctx.lineTo(110, -30); ctx.lineTo(60, -20); ctx.lineTo(30, 20); ctx.lineTo(-30, 20); ctx.lineTo(-60, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
                
                // Gatilhos Leds
                ctx.fillStyle = (this.combat.missileCooldown <= 0) ? '#ff003c' : '#550000'; ctx.beginPath(); ctx.arc(-100, -25, 10, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(100, -25, 10, 0, Math.PI*2); ctx.fill();

                // Ecrã Central do Volante
                ctx.fillStyle = '#020617'; ctx.fillRect(-45, 5, 90, 25);
                ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2; ctx.strokeRect(-45, 5, 90, 25);
                ctx.fillStyle = '#00ff66'; ctx.font = "bold 12px Arial"; ctx.textAlign="center"; 
                
                let ptTxt = "ESTÁVEL";
                if(this.input.pitchVel < -0.5) ptTxt = "MERGULHANDO";
                if(this.input.pitchVel > 0.5) ptTxt = "SUBINDO";
                ctx.fillText(ptTxt, 0, 22);

                ctx.restore();
            } else {
                ctx.fillStyle = '#ff003c'; ctx.textAlign="center"; ctx.font="bold clamp(16px, 3vw, 24px) Arial";
                ctx.fillText("COLOQUE AS MÃOS NA TELA PARA ASSUMIR O MANCHE", w/2, h - 50);
            }

            // ==============================================================
            // BARRA DE DANO E ECONOMIA
            // ==============================================================
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, h - 50, 220, 40);
            ctx.fillStyle = '#222'; ctx.fillRect(20, h - 30, 200, 10);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(20, h - 30, 200 * (Math.max(0, this.ship.hp)/100), 10);
            ctx.fillStyle = '#fff'; ctx.font = "bold 12px Arial"; ctx.textAlign="left"; ctx.fillText(`INTEGRIDADE: ${Math.floor(this.ship.hp)}%`, 20, h - 35);
            ctx.fillStyle = '#f1c40f'; ctx.font = "bold 18px 'Russo One'"; ctx.textAlign="right"; ctx.fillText(`DINHEIRO: R$ ${this.mission.moneyEarned}`, w - 10, h - 20);
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '🚀', Game, {
                camera: 'user', 
                phases: [ 
                    { id: 'mission1', name: 'TREINO VS. IA', desc: 'Passo Atrás = Sobe. Passo Frente = Desce. Mira Automática Instântanea. Incline a Cabeça = Míssil!', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop_mission', name: 'ESQUADRÃO CO-OP', desc: 'Junte-se online aos seus amigos para destruir a IA e os Tanques!', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp_dogfight', name: 'DOGFIGHT PVP', desc: 'Dogfight em tempo real. Caçe os aviões reais dos outros pilotos para ganhar Dinheiro!', mode: 'PVP', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();