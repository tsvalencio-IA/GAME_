// =============================================================================
// AERO STRIKE AR: PROJECT "TITANIUM APEX" - MILITARY GRADE SIMULATOR
// ENGINE: AEGIS 6DOF TACTICAL RENDERER
// STATUS: TRUE BANK-TO-TURN PHYSICS, CLIPPED HUD, FIXED COLUMN YOKE
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR MATEMÁTICO 3D (PROJEÇÃO DE MATRIZ DE ROTAÇÃO EXATA)
    // -----------------------------------------------------------------
    const Aegis3D = {
        fov: 800,
        // Converte coordenadas do mundo 3D (x,y,z) para o ecrã 2D do piloto
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            // Vetor de translação (Posição relativa à câmara)
            let dx = objX - camX;
            let dy = objY - camY; // Y sobe positivamente no mundo real
            let dz = objZ - camZ;

            // Rotação YAW (Virar Bico)
            let cy = Math.cos(yaw), sy = Math.sin(yaw);
            let x1 = dx * cy - dz * sy;
            let z1 = dx * sy + dz * cy;

            // Rotação PITCH (Mergulhar/Subir)
            let cp = Math.cos(pitch), sp = Math.sin(pitch);
            let y2 = dy * cp - z1 * sp;
            let z2 = dy * sp + z1 * cp;

            // Z-Clipping: Se estiver atrás do piloto ou demasiado perto, não renderiza
            if (z2 < 10) return { visible: false };

            // Rotação ROLL (Inclinação das Asas)
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let finalX = x1 * cr - y2 * sr;
            let finalY = x1 * sr + y2 * cr;

            // Projeção Perspetiva (Transformação para 2D)
            let scale = Aegis3D.fov / z2;
            return {
                x: (w / 2) + (finalX * scale),
                // Invertemos o Y projetado porque no Canvas o Y cresce para baixo (0 é no topo)
                y: (h / 2) - (finalY * scale), 
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
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 600;
            this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.gain); this.jetNoise.start();
        },
        beep: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator();
            osc.type = 'square'; osc.frequency.value = 900;
            let g = this.ctx.createGain(); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireVulcan: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(400, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
            g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireMissile: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(150, t); osc.frequency.linearRampToValueAtTime(1200, t + 0.5);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.5);
        },
        explode: function(isGround) {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(isGround ? 40 : 80, t); osc.frequency.exponentialRampToValueAtTime(10, t + 1.0);
            g.gain.setValueAtTime(isGround ? 1.0 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.0);
        },
        stop: function() { if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; } }
    };

    // -----------------------------------------------------------------
    // 3. CORE DO SIMULADOR DE COMBATE
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0,
        mission: { kills: 0, moneyEarned: 0, targetGoal: 30 },
        
        // FÍSICA DO CAÇA
        ship: { 
            hp: 100, speed: 2500, // Nós (KTS)
            worldX: 0, worldY: 3000, worldZ: 0, // Inicia a 3000m
            pitch: 0, yaw: 0, roll: 0
        },
        
        // TELEMETRIA DO CORPO DO PILOTO
        telemetry: {
            active: false, baseShoulderDist: 0, calibTimer: 3.0,
            targetRoll: 0, // Volante
            targetPitch: 0, // Subida/Descida
            headTiltRight: false
        },
        
        // MUNDO
        entities: [], bullets: [], missiles: [], clouds: [], floatTexts: [], particles: [],
        combat: { currentTarget: null, isLocked: false, lockTimer: 0, lastVulcanTime: 0, missileCooldown: 0 },
        shake: 0, damageFlash: 0,

        init: function() {
            this.lastTime = performance.now();
            this.mission.kills = 0; this.mission.moneyEarned = 0;
            this.ship = { hp: 100, speed: 2500, worldX: 0, worldY: 3000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            
            this.telemetry = { active: false, baseShoulderDist: 0, calibTimer: 3.0, targetRoll: 0, targetPitch: 0, headTiltRight: false };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.floatTexts = []; this.particles = [];
            this.combat = { currentTarget: null, isLocked: false, lockTimer: 0, lastVulcanTime: 0, missileCooldown: 0 };
            
            // Gerar Nuvems de Alta Altitude
            for (let i = 0; i < 40; i++) {
                this.clouds.push({
                    x: (Math.random() - 0.5) * 100000,
                    y: 6000 + Math.random() * 10000,
                    z: (Math.random() - 0.5) * 100000,
                    size: 3000 + Math.random() * 6000
                });
            }

            this.state = 'CALIBRATING';
            AudioEngine.init();
        },

        startGame: function() {
            this.state = 'PLAYING';
            AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("SISTEMA DE COMBATE ATIVO. DESTRUA TODOS OS ALVOS.");
        },

        cleanup: function() { AudioEngine.stop(); },

        // -----------------------------------------------------------------
        // 4. RASTREAMENTO INTELIGENTE (O SEGREDO DA JOGABILIDADE)
        // -----------------------------------------------------------------
        processTracking: function(pose, w, h, dt) {
            let hasInput = false;
            this.telemetry.headTiltRight = false;
            let currentShoulderDist = w * 0.4; // Fallback

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const rs = getKp('right_shoulder'); const ls = getKp('left_shoulder');
                const rEar = getKp('right_ear'); const lEar = getKp('left_ear');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                // A) DETEÇÃO DE MÍSSIL (CABEÇA P/ DIREITA)
                if (rEar && lEar && rEar.score > 0.5 && lEar.score > 0.5) {
                    if ((rEar.y - lEar.y) > 20) this.telemetry.headTiltRight = true;
                }

                // B) CALIBRAÇÃO DE OMBROS (PROFUNDIDADE)
                if (rs && ls && rs.score > 0.5 && ls.score > 0.5) {
                    currentShoulderDist = Math.hypot(mapX(rs.x) - mapX(ls.x), mapY(rs.y) - mapY(ls.y));
                }

                if (this.state === 'CALIBRATING') {
                    this.telemetry.baseShoulderDist = (this.telemetry.baseShoulderDist * 0.95) + (currentShoulderDist * 0.05);
                    if (this.telemetry.baseShoulderDist === 0) this.telemetry.baseShoulderDist = currentShoulderDist;
                }

                // C) MANCHE (VOLANTE)
                if (rw && lw && rw.score > 0.4 && lw.score > 0.4) {
                    hasInput = true;
                    let rx = mapX(rw.x), ry = mapY(rw.y);
                    let lx = mapX(lw.x), ly = mapY(lw.y);
                    
                    // Rotação Real do Volante: Mão Direita em baixo = Volante vira Direita = Roll Positivo
                    this.telemetry.targetRoll = Math.atan2(ry - ly, rx - lx);
                    // Limite Mecânico de rotação do braço do piloto
                    this.telemetry.targetRoll = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.telemetry.targetRoll));

                    // Pitch (Subir/Descer) - Baseado no passo em relação à câmara
                    let depthRatio = currentShoulderDist / Math.max(1, this.telemetry.baseShoulderDist);
                    if (depthRatio > 1.15) this.telemetry.targetPitch = -1.2; // Ombros perto -> Mergulha
                    else if (depthRatio < 0.85) this.telemetry.targetPitch = 1.2; // Ombros longe -> Sobe
                    else this.telemetry.targetPitch = 0; // Zona morta
                }
            }

            // D) APLICAÇÃO FÍSICA BANK-TO-TURN (A Magia do Voo Real)
            if (hasInput && this.state === 'PLAYING') {
                this.telemetry.active = true;
                
                // 1. O Avião inclina as asas suavemente até ao ângulo do volante
                this.ship.roll += (this.telemetry.targetRoll - this.ship.roll) * 5 * dt;
                
                // 2. A inclinação das asas (Roll) PUXA o avião para o lado (Yaw)
                // Isto faz com que, se o volante está para a direita, a nave curve para a direita.
                this.ship.yaw += Math.sin(this.ship.roll) * 2.0 * dt; 

                // 3. O Avião levanta ou baixa o nariz
                this.ship.pitch += (this.telemetry.targetPitch - this.ship.pitch) * 3 * dt;
                
                // Limites Táticos de Voo (Para não deixar a terra sair da tela e confundir o jogador)
                this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));
                
            } else if (!hasInput && this.state === 'PLAYING') {
                this.telemetry.active = false;
                // Sistema Fly-By-Wire: Nivela o avião sozinho se largar os controlos
                this.ship.roll *= 0.95;
                this.ship.pitch *= 0.98;
                this.telemetry.targetRoll = 0;
                this.telemetry.targetPitch = 0;
            }

            // Manter os ângulos matematicamente limpos num círculo de 360º
            this.ship.pitch = this.ship.pitch % (Math.PI * 2);
            this.ship.yaw = this.ship.yaw % (Math.PI * 2);
        },

        // -----------------------------------------------------------------
        // 5. SISTEMA DE ARMAS E RADAR (MIRA MAGNÉTICA)
        // -----------------------------------------------------------------
        processCombat: function(dt, w, h) {
            // Vetor para onde o nariz do nosso avião aponta no mundo 3D
            let forwardX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch); 
            let forwardY = Math.sin(this.ship.pitch); 
            let forwardZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            this.combat.currentTarget = null;
            this.combat.isLocked = false;
            let closestZ = Infinity;

            // Varredura de Alvos
            for (let e of this.entities) {
                // Projetar a posição do inimigo na tela do nosso HUD
                let p = Aegis3D.project(e.x, e.y, e.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                
                // Se o inimigo está à nossa frente (Z > 0) e ao alcance visual
                if (p.visible && p.z > 200 && p.z < 80000) {
                    // CAIXA DE MIRA GIGANTE (Hitbox visual perdoadora para mobile)
                    let hitBoxRadius = w * 0.35; 
                    if (Math.abs(p.x - w/2) < hitBoxRadius && Math.abs(p.y - h/2) < hitBoxRadius) {
                        if (p.z < closestZ) { 
                            closestZ = p.z; 
                            this.combat.currentTarget = e; 
                        }
                    }
                }
            }

            // Temporizador de Lock-On
            if (this.combat.currentTarget) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.4) { // Trava em 0.4 segundos
                    if (!this.combat.isLocked) AudioEngine.beep(); 
                    this.combat.isLocked = true; 
                    this.combat.lockTimer = 0.4; 
                }
            } else {
                this.combat.lockTimer -= dt * 2.0; 
                if (this.combat.lockTimer <= 0) this.combat.lockTimer = 0; 
            }

            // AUTO-FIRE DA METRALHADORA (VULCAN CANNON)
            if (this.combat.isLocked && this.combat.currentTarget) {
                const now = performance.now();
                if (now - this.combat.lastVulcanTime > 80) { // Cadência de tiro
                    this.combat.lastVulcanTime = now;
                    let bulletSpeed = (this.ship.speed * 25) + 40000; 
                    
                    // Dispara em direção ao alvo
                    let dx = this.combat.currentTarget.x - this.ship.worldX;
                    let dy = this.combat.currentTarget.y - this.ship.worldY;
                    let dz = this.combat.currentTarget.z - this.ship.worldZ;
                    let dist = Math.hypot(dx, dy, dz);
                    
                    // Alterna o canhão das asas direita/esquerda
                    let wingOffset = Math.random() > 0.5 ? 80 : -80;
                    let spawnX = this.ship.worldX + (Math.cos(this.ship.yaw) * wingOffset);
                    let spawnZ = this.ship.worldZ - (Math.sin(this.ship.yaw) * wingOffset);

                    this.bullets.push({ 
                        x: spawnX, y: this.ship.worldY - 20, z: spawnZ, 
                        vx: (dx/dist)*bulletSpeed, vy: (dy/dist)*bulletSpeed, vz: (dz/dist)*bulletSpeed, 
                        isEnemy: false, life: 2.0 
                    });
                    AudioEngine.fireVulcan(); this.shake = 2; // Recuo da arma
                }
            }

            // LANÇAMENTO DE MÍSSEIS (TRACKING DE CABEÇA)
            if (this.combat.missileCooldown > 0) this.combat.missileCooldown -= dt;
            if (this.combat.isLocked && this.telemetry.headTiltRight && this.combat.missileCooldown <= 0) {
                this.combat.missileCooldown = 1.0; // Recarga de 1s
                let missileSpeed = this.ship.speed * 30;
                
                this.missiles.push({ 
                    x: this.ship.worldX, y: this.ship.worldY - 50, z: this.ship.worldZ, 
                    vx: forwardX*missileSpeed, vy: forwardY*missileSpeed, vz: forwardZ*missileSpeed, 
                    target: this.combat.currentTarget, life: 6.0 
                });
                AudioEngine.fireMissile(); this.shake = 10;
            }
        },

        // -----------------------------------------------------------------
        // 6. MOTOR PRINCIPAL DE ATUALIZAÇÃO (TICK)
        // -----------------------------------------------------------------
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            this.processTracking(pose, w, h, dt);

            if (this.state === 'CALIBRATING') {
                this.calibTimer -= dt; this.renderCalibration(ctx, w, h);
                if (this.calibTimer <= 0) this.startGame(); return 0;
            }

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderFrame(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'";
                if(this.state === 'VICTORY') { ctx.fillStyle = "#2ecc71"; ctx.fillText("ÁREA SEGURA. BOM TRABALHO.", w/2, h/2); } 
                else { ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE CRÍTICA. EJETANDO...", w/2, h/2); }
                ctx.fillStyle = "#f1c40f"; ctx.font = "bold 30px Arial"; ctx.fillText(`CONTA BANCÁRIA: R$ ${this.mission.moneyEarned}`, w/2, h/2 + 60);
                return this.mission.moneyEarned;
            }
            
            // ATUALIZAR POSIÇÃO DA NAVE
            let forwardX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch); 
            let forwardY = Math.sin(this.ship.pitch); 
            let forwardZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let globalSpeed = this.ship.speed * 25;
            
            this.ship.worldX += globalSpeed * forwardX * dt; 
            this.ship.worldY += globalSpeed * forwardY * dt; 
            this.ship.worldZ += globalSpeed * forwardZ * dt;
            
            // LIMITE DE ALTITUDE (HARD DECK): 50 Metros! Perfeito para voos rasantes aos tanques.
            if (this.ship.worldY < 50) { 
                this.ship.worldY = 50; 
                this.ship.pitch = Math.max(0, this.ship.pitch); // Impede de escavar o chão
            }
            if (this.ship.worldY > 40000) this.ship.worldY = 40000; // Teto operacional

            this.processCombat(dt, w, h);

            // GESTOR DE SPAWNS INIMIGOS
            if (this.entities.length < 15 && Math.random() < 0.05) {
                let spawnDist = 50000 + Math.random() * 20000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*40000; 
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*40000;
                let r = Math.random();
                
                if (r < 0.4) { 
                    // TANQUE NO CHÃO (y = 0)
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 200, yaw: Math.random()*Math.PI*2 }); 
                } else if (r < 0.8) { 
                    // CAÇA A FUGIR
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(1000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, vx: forwardX * globalSpeed * 0.8, vy: 0, vz: forwardZ * globalSpeed * 0.8, hp: 150, yaw: this.ship.yaw }); 
                } else { 
                    // CAÇA A ATACAR
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(1000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, vx: -forwardX * 25000, vy: -forwardY * 25000, vz: -forwardZ * 25000, hp: 150, yaw: this.ship.yaw + Math.PI }); 
                }
            }

            // ATUALIZAR INIMIGOS E INTELIGÊNCIA ARTIFICIAL
            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
                
                if (e.type === 'jet_flee') { 
                    e.vx += Math.sin(now * 0.002) * 2000 * dt; // Ziguezague evasivo
                    e.x += e.vx * dt; 
                }
                
                let dist = Math.hypot(e.x - this.ship.worldX, e.y - this.ship.worldY, e.z - this.ship.worldZ);
                if (dist > 150000) { e.hp = -1; continue; } // Apaga se ficar para trás

                // Inimigos disparam contra nós
                if (dist > 1000 && dist < 18000 && ((e.type === 'jet_attack' && Math.random() < 0.08) || (e.type === 'tank' && Math.random() < 0.04))) {
                    let eSpeed = e.type === 'tank' ? 12000 : 35000;
                    this.bullets.push({ 
                        x: e.x, y: e.y, z: e.z, 
                        vx: (-(e.x - this.ship.worldX)/dist)*eSpeed, vy: (-(e.y - this.ship.worldY)/dist)*eSpeed, vz: (-(e.z - this.ship.worldZ)/dist)*eSpeed, 
                        isEnemy: true, life: 4.0 
                    });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            // ANIMAR TEXTOS DE DINHEIRO
            for (let i = this.floatTexts.length - 1; i >= 0; i--) {
                let ft = this.floatTexts[i]; ft.life -= dt; ft.y -= 100 * dt; 
                if (ft.life <= 0) this.floatTexts.splice(i, 1);
            }

            // FÍSICA DAS BALAS E COLISÕES
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                
                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.worldX, b.y - this.ship.worldY, b.z - this.ship.worldZ) < 800) {
                        this.ship.hp -= 10; this.damageFlash = 1.0; this.shake = 20;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER'); 
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < 1500) { // Hitbox tolerante
                            e.hp -= 40; b.life = 0; 
                            this.spawnParticles(e.x, e.y, e.z, '#f1c40f', 5, 50); 
                            if (e.hp <= 0) this.destroyTarget(e, e.type === 'tank' ? 200 : 100); 
                            break;
                        }
                    }
                    if (b.y < 0) { b.life = 0; this.spawnParticles(b.x, 0, b.z, '#7f8c8d', 4, 60); } 
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            // FÍSICA DOS MÍSSEIS TELEGUIADOS
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i]; 
                m.vx += forwardX * 8000 * dt; m.vy += forwardY * 8000 * dt; m.vz += forwardZ * 8000 * dt; 
                
                if (m.target && m.target.hp > 0) {
                    let dx = m.target.x - m.x; let dy = m.target.y - m.y; let dz = m.target.z - m.z;
                    let dist = Math.hypot(dx, dy, dz); 
                    let turnSpeed = 50000 * dt; 
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    
                    if (dist < 2000) { 
                        m.target.hp -= 400; 
                        if (m.target.hp <= 0) this.destroyTarget(m.target, m.target.type === 'tank' ? 300 : 250); 
                        m.life = 0; 
                    }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                
                // Rasto de fumo do míssil
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*200, vy: (Math.random()-0.5)*200, vz: (Math.random()-0.5)*200, life: 1.2, c: 'rgba(200,200,200,0.8)', size: 150 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 100 });
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 20, 300); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Gerir Nuvens e Partículas
            for (let c of this.clouds) {
                if (Math.hypot(c.x - this.ship.worldX, c.z - this.ship.worldZ) > 120000) { 
                    c.z = this.ship.worldZ + forwardZ * 90000 + (Math.random()-0.5)*50000; 
                    c.x = this.ship.worldX + forwardX * 90000 + (Math.random()-0.5)*50000; 
                }
            }
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            this.renderFrame(ctx, w, h);
            return this.mission.moneyEarned;
        },

        destroyTarget: function(t, reward) {
            AudioEngine.explode(t.type === 'tank');
            this.spawnParticles(t.x, t.y, t.z, '#ff3300', 50, 400); 
            this.spawnParticles(t.x, t.y, t.z, '#2c3e50', 40, 800); 
            
            this.spawnFloatText(t.x, t.y, t.z, `+ R$ ${reward}`);
            this.mission.kills++;
            this.mission.moneyEarned += reward;
            
            if (this.mission.kills >= this.mission.targetGoal) this.endGame('VICTORY');
        },

        endGame: function(result) {
            this.state = result; AudioEngine.stop();
            setTimeout(() => { 
                if(window.System && window.System.gameOver) window.System.gameOver(this.mission.kills * 100, result === 'VICTORY', this.mission.moneyEarned); 
                else if (window.System) window.System.home(); 
            }, 5000);
        },

        spawnParticles: function(x, y, z, color, count, baseSize) {
            for(let i=0; i<count; i++) { this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*15000, vy: (Math.random()-0.5)*15000, vz: (Math.random()-0.5)*15000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*300 }); }
        },
        spawnFloatText: function(x, y, z, text) {
            this.floatTexts.push({ x: x, y: y, z: z, text: text, life: 2.0 });
        },

        // -----------------------------------------------------------------
        // 7. MOTOR GRÁFICO (RENDERIZAÇÃO PS3 QUALITY)
        // -----------------------------------------------------------------
        renderCalibration: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0, 5, 10, 0.95)"; ctx.fillRect(0, 0, w, h);
            
            // HUD Militar de Calibração
            ctx.strokeStyle = "rgba(0, 255, 100, 0.3)"; ctx.lineWidth = 2;
            ctx.strokeRect(50, 50, w - 100, h - 100);
            ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText("SISTEMA DE TELEMETRIA: INICIALIZANDO", w/2, h*0.3);
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Chakra Petch'";
            ctx.fillText("ALINHE OS OMBROS E SEGURE O MANCHE INVISÍVEL", w/2, h*0.4);
            
            ctx.fillStyle = "#f1c40f"; ctx.font = "bold 16px Arial";
            ctx.fillText("[ TÁTICA ]: PASSO PARA A FRENTE PARA MERGULHAR.", w/2, h*0.5);

            let pct = 1 - (this.calibTimer / 3.0);
            ctx.fillStyle = "#111"; ctx.fillRect(w/2 - 200, h*0.6, 400, 15);
            ctx.fillStyle = "#00ff66"; ctx.fillRect(w/2 - 200, h*0.6, 400 * pct, 15);

            if (this.telemetry.active) { ctx.fillStyle = "#00ffcc"; ctx.fillText(">> BIOMETRIA CAPTURADA. GRAVANDO EIXO Z...", w/2, h*0.7); } 
            else { ctx.fillStyle = "#ff003c"; ctx.fillText(">> AGUARDANDO POSTURA DO PILOTO...", w/2, h*0.7); }
        },

        renderFrame: function(ctx, w, h) {
            ctx.save();
            if (this.shake > 0) { ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake); this.shake *= 0.9; }
            
            // 1. FUNDO E HORIZONTE
            this.renderEnvironment(ctx, w, h);
            
            // 2. MUNDO 3D (Z-BUFFER)
            this.renderEntities(ctx, w, h);
            
            // 3. COCKPIT, MANCHE E HUD FRONTAL
            this.renderCockpit(ctx, w, h);
            
            // PÓS-PROCESSAMENTO (Dano e Scanlines para look militar)
            if (this.damageFlash > 0) { 
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = `rgba(255, 0, 0, ${this.damageFlash})`; ctx.fillRect(0,0,w,h); 
                this.damageFlash -= 0.05; 
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; for(let i = 0; i < h; i+= 4) ctx.fillRect(0, i, w, 1);
            ctx.restore();
        },

        renderEnvironment: function(ctx, w, h) {
            ctx.save(); 
            // O Centro da tela é o nosso eixo de rotação visual
            ctx.translate(w/2, h/2); 
            // Inverter o Roll: Se a nave inclina a direita, o mundo roda para a esquerda visualmente
            ctx.rotate(-this.ship.roll); 
            
            let pitchWrap = this.ship.pitch % (Math.PI * 2);
            let isUpsideDown = (pitchWrap > Math.PI/2 && pitchWrap < 3*Math.PI/2);
            
            // O Horizonte sobe e desce baseado no Pitch da nave (Campo de visão)
            let horizonY = Math.sin(pitchWrap) * h * 1.5; 
            if (isUpsideDown) { ctx.rotate(Math.PI); horizonY = -horizonY; }

            // CÉU COM ATMOSFERA PROFUNDA
            let skyGrad = ctx.createLinearGradient(0, -h*4, 0, horizonY);
            skyGrad.addColorStop(0, '#000a1a'); skyGrad.addColorStop(0.5, '#002244'); skyGrad.addColorStop(1, '#5599ff');   
            ctx.fillStyle = skyGrad; ctx.fillRect(-w*3, -h*4, w*6, horizonY + h*4);
            
            // SOL
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 100; ctx.shadowColor = '#ffffcc'; 
            ctx.beginPath(); ctx.arc(w*0.7, horizonY - 200, 80, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

            // CHÃO TÁTICO MILITAR
            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h*4);
            groundGrad.addColorStop(0, '#081a08'); groundGrad.addColorStop(1, '#020502');   
            ctx.fillStyle = groundGrad; ctx.fillRect(-w*3, horizonY, w*6, h*4);

            // GRELHA DO TERRENO 3D (Ajuda na perceção de altitude e velocidade)
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.15)'; ctx.lineWidth = 1.5;
            let step = 8000;
            let sx = Math.floor(this.ship.worldX / step) * step - (step * 10);
            let sz = Math.floor(this.ship.worldZ / step) * step - (step * 10);
            
            ctx.beginPath();
            for(let x = 0; x <= 20; x++) {
                for(let z = 0; z <= 20; z++) {
                    let p = Aegis3D.project(sx + x*step, 0, sz + z*step, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible && p.s > 0.01) { ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y); }
                }
            }
            ctx.stroke();

            // LINHA NEON DO HORIZONTE
            ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w*3, horizonY); ctx.lineTo(w*3, horizonY); ctx.stroke();
            ctx.restore();
        },

        renderEntities: function(ctx, w, h) {
            let toDraw = [];
            
            // Projetar todos os objetos 3D no ecrã 2D
            const addDrawable = (list, type) => {
                list.forEach(obj => {
                    let p = Aegis3D.project(obj.x, obj.y, obj.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible) toDraw.push({ p: p, type: type, obj: obj });
                });
            };

            addDrawable(this.clouds, 'cloud'); addDrawable(this.entities, 'entity'); addDrawable(this.bullets, 'bullet'); addDrawable(this.missiles, 'missile'); addDrawable(this.particles, 'particle'); addDrawable(this.floatTexts, 'text');
            
            // Z-Buffer: Renderizar do mais distante para o mais próximo
            toDraw.sort((a, b) => b.p.z - a.p.z);

            toDraw.forEach(d => {
                let p = d.p; let s = p.s; let obj = d.obj;

                if (d.type === 'cloud') { 
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill(); 
                }
                else if (d.type === 'text') {
                    ctx.fillStyle = '#2ecc71'; ctx.font = `bold ${Math.max(16, 1200*s)}px 'Russo One'`; ctx.textAlign = "center";
                    ctx.shadowBlur = 10; ctx.shadowColor = '#000'; ctx.fillText(obj.text, p.x, p.y); ctx.shadowBlur = 0;
                }
                else if (d.type === 'entity') {
                    
                    // Desenhar a Geometria do Veículo
                    if (obj.type.startsWith('jet')) { 
                        // Rotaciona visualmente subtraindo o nosso yaw
                        let renderRot = obj.yaw - this.ship.yaw - this.ship.roll; 
                        this.drawMilitaryJet(ctx, p, renderRot); 
                    } else if (obj.type === 'tank') { 
                        // Tanques estão no chão. Compensar o nosso Roll para eles não "descolarem" da terra.
                        this.draw3DTank(ctx, p, obj.yaw - this.ship.yaw, -this.ship.roll); 
                    }
                    
                    // CAIXA DE MIRA TÁTICA (HUD LOCK) - Visível a quilómetros
                    let isLocked = (this.combat.currentTarget === obj);
                    let bs = Math.max(30, 200 * s); // Box Size
                    
                    if (isLocked) {
                        ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.moveTo(p.x - bs, p.y - bs + 15); ctx.lineTo(p.x - bs, p.y - bs); ctx.lineTo(p.x - bs + 15, p.y - bs);
                        ctx.moveTo(p.x + bs - 15, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs + 15);
                        ctx.moveTo(p.x - bs, p.y + bs - 15); ctx.lineTo(p.x - bs, p.y + bs); ctx.lineTo(p.x - bs + 15, p.y + bs);
                        ctx.moveTo(p.x + bs - 15, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs - 15);
                        ctx.stroke();
                        ctx.fillStyle = '#ff003c'; ctx.textAlign = 'center'; ctx.font = "bold 16px 'Chakra Petch'"; 
                        ctx.fillText("LOCKED", p.x, p.y + bs + 25);
                    } else {
                        // Marcação inativa (Identifica inimigo de longe)
                        let isTank = obj.type === 'tank';
                        ctx.strokeStyle = isTank ? 'rgba(255, 100, 0, 0.8)' : 'rgba(255, 0, 0, 0.6)'; 
                        ctx.lineWidth = 2; ctx.strokeRect(p.x - bs, p.y - bs, bs*2, bs*2);
                        if (bs === 30) { // Mostrar texto se estiver muito longe
                            ctx.fillStyle = ctx.strokeStyle; ctx.font="12px Arial"; ctx.textAlign="center"; 
                            ctx.fillText(isTank?"[ TANK ]":"[ JET ]", p.x, p.y+bs+15); 
                        }
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = obj.isEnemy ? '#ff0000' : '#ffff00'; ctx.shadowBlur = 10 * s; ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 5 * s), Math.max(5, 80 * s), 0, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
                    ctx.globalCompositeOperation = 'source-over';
                }
                else if (d.type === 'missile') { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 8*s, p.y - 8*s, 16*s, 16*s); }
                else if (d.type === 'particle') {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = Math.max(0, obj.life); ctx.fillStyle = obj.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, obj.size * s), 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0;
                    ctx.globalCompositeOperation = 'source-over';
                }
            });
        },

        drawMilitaryJet: function(ctx, p, relYaw) {
            let isRearView = Math.cos(relYaw) > 0; 
            let s = p.s * 600; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(relYaw);
            let mainColor = '#2c3e50'; let engineColor = '#e67e22';

            if (isRearView) {
                // TRASEIRA (Fugindo)
                ctx.fillStyle = mainColor; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, s*0.2); ctx.lineTo(-s*0.8, s*0.4); ctx.lineTo(s*0.8, s*0.4); ctx.lineTo(s, s*0.2); ctx.fill();
                ctx.fillStyle = '#1a252f'; ctx.beginPath(); ctx.moveTo(-s*0.2, s*0.1); ctx.lineTo(-s*0.4, -s*0.6); ctx.lineTo(-s*0.1, -s*0.6); ctx.fill(); ctx.beginPath(); ctx.moveTo(s*0.2, s*0.1); ctx.lineTo(s*0.4, -s*0.6); ctx.lineTo(s*0.1, -s*0.6); ctx.fill();
                ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = engineColor; ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 20; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
            } else {
                // FRENTE (Kamikaze)
                ctx.fillStyle = mainColor; ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(-s, s*0.4); ctx.lineTo(-s*0.2, s*0.5); ctx.lineTo(s*0.2, s*0.5); ctx.lineTo(s, s*0.4); ctx.fill();
                ctx.fillStyle = '#34495e'; ctx.beginPath(); ctx.moveTo(0, -s*0.8); ctx.lineTo(-s*0.2, s*0.3); ctx.lineTo(s*0.2, s*0.3); ctx.fill();
                ctx.fillStyle = '#000'; ctx.fillRect(-s*0.3, s*0.2, s*0.15, s*0.2); ctx.fillRect(s*0.15, s*0.2, s*0.15, s*0.2);
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(0, -s*0.4); ctx.lineTo(-s*0.1, 0); ctx.lineTo(s*0.1, 0); ctx.fill();
            }
            ctx.restore();
        },

        draw3DTank: function(ctx, p, relYaw, visualRoll) {
            let s = p.s * 700;
            ctx.save(); ctx.translate(p.x, p.y); 
            ctx.rotate(visualRoll); // Acompanha a curvatura do chão para não flutuar
            
            // Chassis
            ctx.fillStyle = '#4b5320'; ctx.fillRect(-s, -s*0.8, s*2, s*1.6); 
            // Lagartas
            ctx.fillStyle = '#111'; ctx.fillRect(-s*1.2, -s*0.8, s*0.2, s*1.6); ctx.fillRect(s*1.0, -s*0.8, s*0.2, s*1.6);
            
            // Torreta roda com o Yaw dela
            ctx.rotate(relYaw); 
            ctx.fillStyle = '#3e451b'; ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(-s*0.1, -s*1.8, s*0.2, s*1.8);
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            let cx = w/2, cy = h/2;

            // =========================================================
            // HUD CENTRAL (MASK CLIPPING PARA PITCH LADDER NÃO VAZAR)
            // =========================================================
            ctx.save();
            // Cria uma janela no meio da tela onde o HUD pode existir
            ctx.beginPath();
            ctx.rect(cx - 200, cy - 200, 400, 400);
            ctx.clip(); // Corta tudo o que for desenhado a partir daqui fora desta caixa!

            // MIRA CENTRAL (Boresight Cross)
            ctx.shadowBlur = 10; ctx.shadowColor = '#00ff66'; ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 10, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 10, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy + 30); ctx.lineTo(cx, cy + 10); ctx.stroke();
            ctx.fillStyle = '#00ff66'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
            
            // PITCH LADDER (Graus de Subida/Descida)
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll); // Roda o hud com o avião
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.7)'; ctx.fillStyle = 'rgba(0, 255, 100, 0.7)'; ctx.lineWidth = 2; ctx.font = "bold 14px Arial";
            
            let pitchDeg = this.ship.pitch * (180 / Math.PI);
            let pixelsPerDeg = 15; 

            for(let i = -90; i <= 90; i += 10) {
                if (i === 0) continue; 
                let yOffset = (pitchDeg - i) * pixelsPerDeg; // Distância relativa ao centro
                
                // Desenhar Risco
                ctx.beginPath();
                ctx.moveTo(-150, yOffset); ctx.lineTo(-80, yOffset);
                if (i < 0) ctx.lineTo(-80, yOffset - 10); // Descer
                else ctx.lineTo(-80, yOffset + 10); // Subir
                
                ctx.moveTo(150, yOffset); ctx.lineTo(80, yOffset);
                if (i < 0) ctx.lineTo(80, yOffset - 10);
                else ctx.lineTo(80, yOffset + 10);
                ctx.stroke();

                ctx.textAlign = "right"; ctx.fillText(Math.abs(i), -160, yOffset + 5);
                ctx.textAlign = "left"; ctx.fillText(Math.abs(i), 160, yOffset + 5);
            }
            ctx.restore(); // Fecha o clip de máscara

            // =========================================================
            // DADOS LATERAIS E RADAR PERFEITO
            // =========================================================
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; ctx.fillRect(0, 0, w, 50);
            ctx.fillStyle = "#00ff66"; ctx.font = "bold 20px 'Chakra Petch'"; 
            ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, 20, 30);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)} FT`, w - 20, 30);
            
            // Compass no Topo
            let heading = (this.ship.yaw * 180 / Math.PI) % 360; if(heading < 0) heading += 360;
            ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 22px 'Russo One'";
            ctx.fillText(Math.floor(heading) + "°", cx, 35);

            // RADAR MINI-MAP NO CANTO SUPERIOR DIREITO
            const radarX = w - 80; const radarY = 130; const radarR = 60;
            ctx.fillStyle = 'rgba(0, 30, 10, 0.7)'; ctx.beginPath(); ctx.arc(radarX, radarY, radarR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(radarX, radarY - radarR); ctx.lineTo(radarX, radarY + radarR); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(radarX - radarR, radarY); ctx.lineTo(radarX + radarR, radarY); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(radarX, radarY - 6); ctx.lineTo(radarX - 5, radarY + 4); ctx.lineTo(radarX + 5, radarY + 4); ctx.fill(); // Player Icon

            let maxRadarDist = 60000;
            this.entities.forEach(e => { 
                // Matemática de translação para o radar (Posição Relativa)
                let dx = e.x - this.ship.worldX; let dz = e.z - this.ship.worldZ;
                // Rotacionar em função de onde a câmara olha
                let cr = Math.cos(this.ship.yaw); let sr = Math.sin(this.ship.yaw);
                let localX = dx * cr - dz * sr; 
                let localZ = dx * sr + dz * cr; 
                
                let dist = Math.hypot(localX, localZ);
                if (dist < maxRadarDist) { 
                    let plotX = radarX + (localX / maxRadarDist) * radarR; 
                    let plotY = radarY - (localZ / maxRadarDist) * radarR; // -Z porque cima no radar é a frente
                    
                    ctx.fillStyle = e.type === 'tank' ? '#e67e22' : '#ff003c'; 
                    if (e.type === 'tank') ctx.fillRect(plotX - 3, plotY - 3, 6, 6);
                    else { ctx.beginPath(); ctx.arc(plotX, plotY, 3, 0, Math.PI*2); ctx.fill(); }
                }
            });

            // ==============================================================
            // O MANCHE FÍSICO CORRIGIDO (A COLUNA NÃO TOMBA)
            // ==============================================================
            if (this.telemetry.active) {
                ctx.save();
                
                // 1. CHUMBAR COLUNA AO CENTRO DO CHÃO
                ctx.translate(cx, h);
                
                // Profundidade (Encolhe se empurra, Cresce se puxa)
                let depthScale = 1.0;
                if (this.telemetry.targetPitch < 0) depthScale = 0.85; // Mergulho
                if (this.telemetry.targetPitch > 0) depthScale = 1.15; // Subida
                ctx.scale(depthScale, depthScale);

                // Desenhar a Haste (Estática, não roda)
                ctx.fillStyle = '#050505'; ctx.fillRect(-25, -180, 50, 180); 
                
                // 2. SUBIR PARA O TOPO DA HASTE E ROTACIONAR O VOLANTE
                ctx.translate(0, -180); 
                ctx.rotate(this.telemetry.targetRoll); // RODA APENAS O VOLANTE!
                
                // Desenho do Volante
                ctx.fillStyle = 'rgba(20, 20, 20, 0.95)'; ctx.strokeStyle = '#333'; ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(-110, -30); ctx.lineTo(-130, 40); ctx.lineTo(-60, 60); ctx.lineTo(60, 60); ctx.lineTo(130, 40); ctx.lineTo(110, -30); ctx.lineTo(60, -20); ctx.lineTo(30, 20); ctx.lineTo(-30, 20); ctx.lineTo(-60, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
                
                ctx.fillStyle = (this.combat.missileCooldown <= 0) ? '#ff003c' : '#550000'; ctx.beginPath(); ctx.arc(-100, -25, 10, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(100, -25, 10, 0, Math.PI*2); ctx.fill();

                ctx.restore();
            }

            // DANO E ECONOMIA
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, h - 50, 220, 40);
            ctx.fillStyle = '#222'; ctx.fillRect(20, h - 30, 200, 10);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(20, h - 30, 200 * (Math.max(0, this.ship.hp)/100), 10);
            ctx.fillStyle = '#fff'; ctx.font = "bold 12px Arial"; ctx.textAlign="left"; ctx.fillText(`INTEGRIDADE: ${Math.floor(this.ship.hp)}%`, 20, h - 35);
            ctx.fillStyle = '#f1c40f'; ctx.font = "bold 18px 'Russo One'"; ctx.textAlign="right"; ctx.fillText(`DINHEIRO: R$ ${this.mission.moneyEarned}`, w - 10, h - 20);
        }
    };

    // Registar Jogo
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '🚀', Game, {
                camera: 'user', 
                phases: [ 
                    { id: 'mission1', name: 'SIMULAÇÃO TÁTICA', desc: 'Sistemas Online. Fique em pé para calibrar Profundidade. Caçe Jatos e Tanques.', mode: 'SINGLE', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();