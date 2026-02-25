// =============================================================================
// AERO STRIKE AR: TITANIUM MILITARY SIMULATOR (V1.0)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: TRUE 6DOF PHYSICS, REAR/FRONT ENEMY RENDERING, CLEAN MOBILE HUD
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA VETORIAL DE VOO (CORRIGIDA)
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 700,
        // Matriz de Rotação Completa (Yaw, Pitch, Roll) - Eixo Y para cima
        projectFull: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            let dx = objX - camX;
            let dy = objY - camY; 
            let dz = objZ - camZ;

            // 1. Yaw (Virar Esquerda/Direita)
            let cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            let x1 = dx * cosY - dz * sinY;
            let z1 = dx * sinY + dz * cosY;

            // 2. Pitch (Mergulhar/Subir)
            let cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            let y2 = dy * cosP - z1 * sinP;
            let z2 = dy * sinP + z1 * cosP;

            // 3. Roll (Rodar a Nave)
            let cosR = Math.cos(roll), sinR = Math.sin(roll);
            let x3 = x1 * cosR - y2 * sinR;
            let y3 = x1 * sinR + y2 * cosR;

            // Clip Behind Camera
            if (z2 < 10) return { visible: false };

            // Projeção (No Canvas, Y aumenta para baixo, logo invertemos o Y projetado)
            let scale = Math3D.fov / z2;
            return {
                x: (w / 2) + (x3 * scale),
                y: (h / 2) - (y3 * scale),
                s: scale, z: z2, visible: true
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. SÍNTESE DE ÁUDIO REALISTA (JET ENGINE)
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
            let bufferSize = this.ctx.sampleRate * 2;
            let buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            let data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            this.jetNoise = this.ctx.createBufferSource(); this.jetNoise.buffer = buffer; this.jetNoise.loop = true;
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 1400;
            this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.gain); this.jetNoise.start();
        },
        fireVulcan: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
            g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireMissile: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(150, t); osc.frequency.linearRampToValueAtTime(800, t + 0.5);
            g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.01, t + 2.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 2.0);
        },
        explode: function(isHuge) {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(isHuge ? 40 : 100, t); osc.frequency.exponentialRampToValueAtTime(5, t + (isHuge?1.5:0.8));
            g.gain.setValueAtTime(isHuge ? 1.0 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + (isHuge?1.5:0.8));
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + (isHuge?1.5:0.8));
        },
        stop: function() { if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; } }
    };

    // -----------------------------------------------------------------
    // 3. LÓGICA CENTRAL DO SIMULADOR MILITAR
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0,
        mission: { targetsDestroyed: 0, targetGoal: 30 },
        
        // Avião do Jogador
        ship: { 
            hp: 100, speed: 1200, // Velocidade constante de Combate Real
            worldX: 0, worldY: 8000, worldZ: 0,
            pitch: 0, yaw: 0, roll: 0
        },
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        
        // Tracking do Manche
        yoke: { x: 0, y: 0, active: false, depthRatio: 1.0, normX: 0 },
        
        combat: { currentTarget: null, lockTimer: 0, isLocked: false, lastVulcanTime: 0, missileCooldown: 0, headTilted: false },
        shake: 0, damageFlash: 0,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 1200, worldX: 0, worldY: 8000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            this.combat = { currentTarget: null, lockTimer: 0, isLocked: false, lastVulcanTime: 0, missileCooldown: 0, headTilted: false };
            
            // Gerar nuvens ambientes
            for (let i = 0; i < 60; i++) {
                this.clouds.push({ x: (Math.random() - 0.5) * 80000, y: 4000 + Math.random() * 15000, z: (Math.random() - 0.5) * 80000, size: 2000 + Math.random() * 5000 });
            }

            AudioEngine.init(); AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("SIMULADOR ONLINE. ACELERAÇÃO FIXA. COMBATE ATIVO.");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- RASTREAMENTO INTELIGENTE (MANCHE VIRTUAL E CABEÇA) ---
        processTracking: function(pose, w, h, dt) {
            this.yoke.active = false;
            this.combat.headTilted = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const rs = getKp('right_shoulder'); const ls = getKp('left_shoulder');
                const rEar = getKp('right_ear'); const lEar = getKp('left_ear');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                // 1. Deteção de Míssil (Inclinação da Cabeça)
                if (rEar && lEar && rEar.score > 0.4 && lEar.score > 0.4) {
                    if ((rEar.y - lEar.y) > 25) this.combat.headTilted = true;
                }

                // 2. Manche Militar (Mãos Juntas no Ecrã)
                if (rw && lw && rw.score > 0.3 && lw.score > 0.3) {
                    this.yoke.active = true;

                    let rx = mapX(rw.x), ry = mapY(rw.y);
                    let lx = mapX(lw.x), ly = mapY(lw.y);

                    this.yoke.x = (rx + lx) / 2;
                    this.yoke.y = (ry + ly) / 2;

                    // Mapeamento Horizontal para Yaw (Virar)
                    this.yoke.normX = (this.yoke.x - (w / 2)) / (w / 4); 
                    this.yoke.normX = Math.max(-1.5, Math.min(1.5, this.yoke.normX));

                    // Mapeamento de Profundidade para Pitch (Subir/Descer)
                    let handDist = Math.hypot(rx - lx, ry - ly);
                    let shoulderDist = w * 0.4; 
                    if (rs && ls && rs.score > 0.3 && ls.score > 0.3) {
                        shoulderDist = Math.hypot(mapX(rs.x) - mapX(ls.x), mapY(rs.y) - mapY(ls.y));
                    }
                    this.yoke.depthRatio = handDist / Math.max(1, shoulderDist);

                    // ==========================================
                    // APLICAÇÃO FÍSICA AERONÁUTICA 
                    // ==========================================
                    
                    // Yaw (Direção): Mãos p/ Direita -> Vira Direita
                    let targetYawVel = this.yoke.normX * 1.5;
                    this.ship.yaw += targetYawVel * dt;

                    // Pitch (Elevação): Empurrar (Braços Esticados) -> Descer | Puxar (Encolhidos) -> Subir
                    let targetPitchVel = 0;
                    if (this.yoke.depthRatio < 0.85) targetPitchVel = -1.5; // Mergulho
                    else if (this.yoke.depthRatio > 1.2) targetPitchVel = 1.5; // Loop/Subida
                    this.ship.pitch += targetPitchVel * dt;

                    // Roll (Inclinação Visual nas Curvas)
                    let targetRoll = targetYawVel * 0.8; // O avião inclina para o lado que vira
                    this.ship.roll += (targetRoll - this.ship.roll) * 5 * dt;
                }
            }
            
            if (!this.yoke.active) {
                this.ship.roll *= 0.95; // Auto estabiliza a asa se largar
            }

            // Normalizar ângulos infinitos para Loops contínuos
            this.ship.pitch = this.ship.pitch % (Math.PI * 2);
            this.ship.yaw = this.ship.yaw % (Math.PI * 2);
            if (this.ship.pitch < 0) this.ship.pitch += Math.PI * 2;
            if (this.ship.yaw < 0) this.ship.yaw += Math.PI * 2;
        },

        // --- SISTEMA DE MIRA, AUTO-FIRE E MÍSSEIS ---
        processCombat: function(dt, w, h) {
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP;
            let forwardY = sinP;
            let forwardZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch); 
            
            this.combat.currentTarget = null;
            let closestDist = Infinity;
            let targetOnSights = false;

            // Hitbox Generosa no Ecrã
            for (let e of this.entities) {
                let p = Math3D.projectFull(e.x, e.y, e.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (p.visible && p.z > 1000 && p.z < 35000) {
                    // Deteção pela posição no Ecrã (40% do centro)
                    if (Math.abs(p.x - w/2) < w * 0.25 && Math.abs(p.y - h/2) < h * 0.25) {
                        targetOnSights = true;
                        if (p.z < closestDist) { closestDist = p.z; this.combat.currentTarget = e; }
                    }
                }
            }

            // Lock-on Timer de 1.5 Segundos
            if (targetOnSights && this.combat.currentTarget) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 1.5) { this.combat.isLocked = true; this.combat.lockTimer = 1.5; }
            } else {
                this.combat.lockTimer -= dt * 2.0; 
                if (this.combat.lockTimer <= 0) { this.combat.lockTimer = 0; this.combat.isLocked = false; }
            }

            // Metralhadora Automática
            if (this.combat.isLocked && this.combat.currentTarget) {
                const now = performance.now();
                if (now - this.combat.lastVulcanTime > 80) {
                    this.combat.lastVulcanTime = now;
                    let speed = (this.ship.speed * 25) + 20000;
                    
                    let dx = this.combat.currentTarget.x - this.ship.worldX;
                    let dy = this.combat.currentTarget.y - this.ship.worldY;
                    let dz = this.combat.currentTarget.z - this.ship.worldZ;
                    let dist = Math.hypot(dx, dy, dz);
                    
                    let offset = Math.random() > 0.5 ? 80 : -80;
                    let spawnX = this.ship.worldX + (Math.cos(this.ship.yaw) * offset);
                    let spawnZ = this.ship.worldZ - (Math.sin(this.ship.yaw) * offset);

                    this.bullets.push({ x: spawnX, y: this.ship.worldY - 20, z: spawnZ, vx: (dx/dist)*speed, vy: (dy/dist)*speed, vz: (dz/dist)*speed, isEnemy: false, life: 2.0 });
                    AudioEngine.fireVulcan(); this.shake = 3;
                }
            }

            // Mísseis via Movimento de Cabeça
            if (this.combat.missileCooldown > 0) this.combat.missileCooldown -= dt;
            
            if (this.combat.isLocked && this.combat.headTilted && this.combat.missileCooldown <= 0) {
                this.combat.missileCooldown = 1.0; // Recarga
                let speed = this.ship.speed * 25;
                let spawnX1 = this.ship.worldX + (Math.cos(this.ship.yaw) * 150); 
                let spawnZ1 = this.ship.worldZ - (Math.sin(this.ship.yaw) * 150);
                
                this.missiles.push({ x: spawnX1, y: this.ship.worldY - 50, z: spawnZ1, vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, target: this.combat.currentTarget, life: 6.0 });
                AudioEngine.fireMissile(); this.shake = 10;
            }
        },

        // --- LOOP PRINCIPAL ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderFrame(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 50px 'Russo One'";
                if(this.state === 'VICTORY') { ctx.fillStyle = "#2ecc71"; ctx.fillText("ZONA LIMPA!", w/2, h/2); } 
                else { ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE DESTRUÍDA", w/2, h/2); }
                return this.mission.targetsDestroyed * 100;
            }

            this.processTracking(pose, w, h, dt);
            
            // FÍSICA VETORIAL ABSOLUTA 3D 
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP;
            let forwardY = sinP;
            let forwardZ = cosY * cosP; 
            let speedUnits = this.ship.speed * 25;
            
            this.ship.worldX += speedUnits * forwardX * dt;
            this.ship.worldY += speedUnits * forwardY * dt;
            this.ship.worldZ += speedUnits * forwardZ * dt;
            
            // Limites de Altitude
            if (this.ship.worldY < 500) { this.ship.worldY = 500; } // Chão 
            if (this.ship.worldY > 60000) this.ship.worldY = 60000; // Teto Global

            this.processCombat(dt, w, h);

            // Spawner de Inimigos Global
            if (this.entities.length < 8 && Math.random() < 0.04) {
                let spawnDist = 30000 + Math.random() * 10000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*20000;
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*20000;
                
                let r = Math.random();
                if (r < 0.3) {
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 200, yaw: Math.random()*Math.PI*2 });
                } else if (r < 0.8) {
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, 
                        vx: forwardX * speedUnits * 0.9 + (Math.random()-0.5)*1500, vy: 0, vz: forwardZ * speedUnits * 0.9 + (Math.random()-0.5)*1500, hp: 150, yaw: this.ship.yaw });
                } else {
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, 
                        vx: -forwardX * 15000, vy: -forwardY * 15000, vz: -forwardZ * 15000, hp: 150, yaw: this.ship.yaw + Math.PI });
                }
            }

            // Atualização de Inteligência Inimiga
            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;

                if (e.type === 'jet_flee') {
                    e.vx += Math.sin(now * 0.003) * 800 * dt; e.x += e.vx * dt; // Ziguezague
                }

                let dx = e.x - this.ship.worldX; let dy = e.y - this.ship.worldY; let dz = e.z - this.ship.worldZ;
                let dist = Math.hypot(dx, dy, dz);

                if (dist > 80000) { e.hp = -1; continue; } // Limpa Lixo muito longe

                // Inimigos Atiram
                if (dist > 1000 && dist < 12000) {
                    if ((e.type === 'jet_attack' && Math.random() < 0.05) || (e.type === 'tank' && Math.random() < 0.02)) {
                        let eSpeed = e.type === 'tank' ? 8000 : 18000;
                        this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: (-dx/dist)*eSpeed, vy: (-dy/dist)*eSpeed, vz: (-dz/dist)*eSpeed, isEnemy: true, life: 3.0 });
                    }
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            // Dinâmica de Balas
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                
                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.worldX, b.y - this.ship.worldY, b.z - this.ship.worldZ) < 600) {
                        this.ship.hp -= 10; this.damageFlash = 1.0; this.shake = 15;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < 800) {
                            e.hp -= 35; b.life = 0;
                            this.spawnParticles(e.x, e.y, e.z, '#f39c12', 4, 30); 
                            if (e.hp <= 0) this.destroyTarget(e);
                            break;
                        }
                    }
                    if (b.y < 0) { b.life = 0; this.spawnParticles(b.x, 0, b.z, '#7f8c8d', 3, 40); } 
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            // Dinâmica de Mísseis
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.vx += forwardX * 6000 * dt; m.vy += forwardY * 6000 * dt; m.vz += forwardZ * 6000 * dt; 
                
                if (m.target && m.target.hp > 0) {
                    let dx = m.target.x - m.x; let dy = m.target.y - m.y; let dz = m.target.z - m.z;
                    let dist = Math.hypot(dx, dy, dz);
                    let turnSpeed = 25000 * dt; 
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    
                    if (dist < 1000) { m.target.hp -= 400; m.life = 0; if (m.target.hp <= 0) this.destroyTarget(m.target); }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, vz: (Math.random()-0.5)*150, life: 1.0, c: 'rgba(200,200,200,0.6)', size: 100 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 60 });
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 15, 150); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Ambientes Contínuos
            for (let c of this.clouds) {
                let dx = c.x - this.ship.worldX; let dz = c.z - this.ship.worldZ;
                let dist = Math.hypot(dx, dz);
                if (dist > 80000) { c.z = this.ship.worldZ + forwardZ * 70000 + (Math.random()-0.5)*40000; c.x = this.ship.worldX + forwardX * 70000 + (Math.random()-0.5)*40000; }
            }
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            this.renderFrame(ctx, w, h);
            return this.mission.targetsDestroyed * 100;
        },

        destroyTarget: function(t) {
            AudioEngine.explode(t.type === 'tank');
            this.spawnParticles(t.x, t.y, t.z, '#ff3300', 30, 250); 
            this.spawnParticles(t.x, t.y, t.z, '#2c3e50', 20, 400); 
            this.mission.targetsDestroyed++;
            if (this.mission.targetsDestroyed >= this.mission.targetGoal) this.endGame('VICTORY');
        },

        endGame: function(result) {
            this.state = result; AudioEngine.stop();
            setTimeout(() => { 
                if(window.System.gameOver) window.System.gameOver(this.mission.targetsDestroyed * 100, result === 'VICTORY', this.mission.targetsDestroyed * 5); 
                else window.System.home(); 
            }, 4000);
        },

        spawnParticles: function(x, y, z, color, count, baseSize) {
            for(let i=0; i<count; i++) {
                this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*6000, vy: (Math.random()-0.5)*6000, vz: (Math.random()-0.5)*6000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*150 });
            }
        },

        // --- MOTOR DE RENDERIZAÇÃO MILITAR (CLEAN UI & 3D FALSO) ---
        renderFrame: function(ctx, w, h) {
            ctx.save();
            if (this.shake > 0) { ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake); this.shake *= 0.9; }
            this.renderWorld(ctx, w, h);
            this.renderCockpit(ctx, w, h);
            if (this.damageFlash > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${this.damageFlash})`; ctx.fillRect(0,0,w,h); this.damageFlash -= 0.05; }
            ctx.restore();
        },

        renderWorld: function(ctx, w, h) {
            ctx.save();
            ctx.translate(w/2, h/2); 
            ctx.rotate(this.ship.roll); // Roll visual direto
            
            // Calculo Dinâmico do Horizonte para 360 Graus
            let pitchWrap = this.ship.pitch % (Math.PI * 2);
            let isUpsideDown = (pitchWrap > Math.PI/2 && pitchWrap < 3*Math.PI/2);
            let horizonOffset = Math.sin(pitchWrap) * h * 1.5; 

            if (isUpsideDown) {
                ctx.rotate(Math.PI); 
                horizonOffset = -horizonOffset; 
            }

            // CÉU MILITAR DE ALTA ALTITUDE
            let skyGrad = ctx.createLinearGradient(0, -h*4, 0, horizonOffset);
            skyGrad.addColorStop(0, '#0f172a');   
            skyGrad.addColorStop(0.5, '#1e293b'); 
            skyGrad.addColorStop(1, '#334155');   
            ctx.fillStyle = skyGrad; ctx.fillRect(-w*3, -h*4, w*6, horizonOffset + h*4);

            // SOL TÁTICO
            ctx.fillStyle = 'rgba(255,255,200,0.8)'; ctx.shadowBlur = 100; ctx.shadowColor = '#fff';
            ctx.beginPath(); ctx.arc(w*0.8, horizonOffset - 250, 80, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

            // CHÃO TÁTICO NEGRO/VERDE
            let groundGrad = ctx.createLinearGradient(0, horizonOffset, 0, h*4);
            groundGrad.addColorStop(0, '#061006'); 
            groundGrad.addColorStop(1, '#020502');   
            ctx.fillStyle = groundGrad; ctx.fillRect(-w*3, horizonOffset, w*6, h*4);

            // LINHA DE HORIZONTE HUD
            ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-w*3, horizonOffset); ctx.lineTo(w*3, horizonOffset); ctx.stroke();

            // GRELHA DE TERRENO 3D E VELOCIDADE
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.1)'; ctx.lineWidth = 1;
            let step = 10000;
            let sx = Math.floor(this.ship.worldX / step) * step - (step * 8);
            let sz = Math.floor(this.ship.worldZ / step) * step - (step * 8);
            
            ctx.beginPath();
            for(let x = 0; x <= 16; x++) {
                for(let z = 0; z <= 16; z++) {
                    let p = Math3D.projectFull(sx + x*step, 0, sz + z*step, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible && p.s > 0.01) { ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y); }
                }
            }
            ctx.stroke();
            ctx.restore();

            // RENDERIZAÇÃO Z-BUFFER
            let toDraw = [];
            const addDrawable = (list, type) => {
                list.forEach(obj => {
                    let p = Math3D.projectFull(obj.x, obj.y, obj.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible) toDraw.push({ p: p, type: type, obj: obj });
                });
            };

            addDrawable(this.clouds, 'cloud');
            addDrawable(this.entities, 'entity');
            addDrawable(this.bullets, 'bullet');
            addDrawable(this.missiles, 'missile');
            addDrawable(this.particles, 'particle');

            toDraw.sort((a, b) => b.p.z - a.p.z);

            // Como as rotações já estão no `projectFull`, os itens já estão na tela correta!
            toDraw.forEach(d => {
                let p = d.p; let s = p.s; let obj = d.obj;

                if (d.type === 'cloud') {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; 
                    ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'entity') {
                    if (obj.type.startsWith('jet')) {
                        this.drawMilitaryJet(ctx, p, obj.yaw, this.ship.yaw);
                    } else if (obj.type === 'tank') {
                        this.draw3DTank(ctx, p.x, p.y, 400 * s);
                    }
                    
                    // BRACKETS TÁTICOS ( [ ] )
                    let isLocked = (obj === this.combat.currentTarget);
                    let isFullyLocked = isLocked && this.combat.isLocked;
                    let bs = Math.max(30, 150 * s); // Box Size
                    
                    ctx.strokeStyle = isFullyLocked ? '#ff003c' : (isLocked ? '#f1c40f' : 'rgba(0, 255, 150, 0.4)');
                    ctx.lineWidth = isFullyLocked ? 4 : 2;
                    ctx.beginPath();
                    // Top Left
                    ctx.moveTo(p.x - bs, p.y - bs + 10); ctx.lineTo(p.x - bs, p.y - bs); ctx.lineTo(p.x - bs + 10, p.y - bs);
                    // Top Right
                    ctx.moveTo(p.x + bs - 10, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs); ctx.lineTo(p.x + bs, p.y - bs + 10);
                    // Bottom Left
                    ctx.moveTo(p.x - bs, p.y + bs - 10); ctx.lineTo(p.x - bs, p.y + bs); ctx.lineTo(p.x - bs + 10, p.y + bs);
                    // Bottom Right
                    ctx.moveTo(p.x + bs - 10, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs); ctx.lineTo(p.x + bs, p.y + bs - 10);
                    ctx.stroke();
                    
                    if (isFullyLocked) {
                        ctx.fillStyle = '#ff003c'; ctx.textAlign = 'center'; ctx.font = "bold 14px 'Chakra Petch'"; 
                        ctx.fillText("LOCKED", p.x, p.y + bs + 20);
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.fillStyle = obj.isEnemy ? '#ff0000' : '#ffff00';
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 5 * s), Math.max(5, 80 * s), 0, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'missile') {
                    ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 10*s, p.y - 10*s, 20*s, 20*s);
                }
                else if (d.type === 'particle') {
                    ctx.globalAlpha = Math.max(0, obj.life); ctx.fillStyle = obj.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, obj.size * s), 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });
        },

        // --- SISTEMA FALSO 3D DO INIMIGO ---
        drawMilitaryJet: function(ctx, p, enemyYaw, playerYaw) {
            let relYaw = enemyYaw - playerYaw;
            let isRearView = Math.cos(relYaw) > 0; // Se aponta para a mesma direção, vemos a traseira

            let s = p.s * 400; 
            ctx.save(); ctx.translate(p.x, p.y); 

            if (isRearView) {
                // TRASEIRA (Fugindo)
                ctx.fillStyle = '#1e293b'; // Asas Delta
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, s*0.2); ctx.lineTo(-s*0.8, s*0.4); ctx.lineTo(s*0.8, s*0.4); ctx.lineTo(s, s*0.2); ctx.fill();
                ctx.fillStyle = '#0f172a'; // Caudas Duplas
                ctx.beginPath(); ctx.moveTo(-s*0.2, s*0.1); ctx.lineTo(-s*0.4, -s*0.6); ctx.lineTo(-s*0.1, -s*0.6); ctx.fill();
                ctx.beginPath(); ctx.moveTo(s*0.2, s*0.1); ctx.lineTo(s*0.4, -s*0.6); ctx.lineTo(s*0.1, -s*0.6); ctx.fill();
                ctx.fillStyle = '#000'; // Motores
                ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#00ffcc'; // Brilho Propulsor
                ctx.shadowBlur = 10; ctx.shadowColor = '#00ffcc';
                ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.fill();
            } else {
                // FRENTE (Atacando)
                ctx.fillStyle = '#1e293b'; // Asas Delta Frontais
                ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(-s, s*0.4); ctx.lineTo(-s*0.2, s*0.5); ctx.lineTo(s*0.2, s*0.5); ctx.lineTo(s, s*0.4); ctx.fill();
                ctx.fillStyle = '#334155'; // Bico/Corpo
                ctx.beginPath(); ctx.moveTo(0, -s*0.8); ctx.lineTo(-s*0.2, s*0.3); ctx.lineTo(s*0.2, s*0.3); ctx.fill();
                ctx.fillStyle = '#000'; // Entradas de Ar
                ctx.fillRect(-s*0.3, s*0.2, s*0.15, s*0.2); ctx.fillRect(s*0.15, s*0.2, s*0.15, s*0.2);
                ctx.fillStyle = '#e6b800'; // Cockpit Dourado
                ctx.beginPath(); ctx.moveTo(0, -s*0.4); ctx.lineTo(-s*0.1, 0); ctx.lineTo(s*0.1, 0); ctx.fill();
            }
            ctx.restore();
        },

        draw3DTank: function(ctx, cx, cy, s) {
            ctx.save(); ctx.translate(cx, cy);
            ctx.fillStyle = '#4b5320'; ctx.fillRect(-s, -s*0.6, s*2, s*1.2);
            ctx.fillStyle = '#111'; ctx.fillRect(-s*1.2, -s*0.6, s*0.2, s*1.2); ctx.fillRect(s*1.0, -s*0.6, s*0.2, s*1.2);
            ctx.fillStyle = '#3e451b'; ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(-s*0.1, -s*1.8, s*0.2, s*1.8);
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // HUD CLEAR MOBILE
            ctx.fillStyle = "#00ff66"; ctx.font = "bold 16px 'Chakra Petch'"; 
            ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, 20, h/2);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)} FT`, w - 20, h/2);

            // MIRA CENTRAL
            ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(w/2 - 20, h/2); ctx.lineTo(w/2 - 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 + 20, h/2); ctx.lineTo(w/2 + 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 - 20); ctx.lineTo(w/2, h/2 - 5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 + 20); ctx.lineTo(w/2, h/2 + 5); ctx.stroke();
            ctx.fillStyle = '#00ff66'; ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            // TEXTOS DE AVISO (Centro da Tela)
            ctx.textAlign = "center"; 
            if (this.combat.isLocked) {
                ctx.fillStyle = "#ff003c"; ctx.font = "bold clamp(20px, 5vw, 30px) 'Russo One'";
                ctx.fillText("ALVO TRANCADO! AUTO-FIRE", w/2, h/2 - 50);
                if (this.combat.missileCooldown <= 0) {
                    ctx.fillStyle = "#00ffff"; ctx.font = "bold 14px 'Chakra Petch'";
                    ctx.fillText(">> INCLINE CABEÇA PARA MÍSSIL <<", w/2, h/2 + 50);
                }
            } else if (this.combat.lockTimer > 0) {
                ctx.fillStyle = "rgba(255, 255, 0, 0.8)"; ctx.font = "bold 16px 'Chakra Petch'";
                ctx.fillText(`TRANCANDO... ${Math.floor(this.combat.lockTimer/1.5 * 100)}%`, w/2, h/2 - 50);
            }

            // O MANCHE DE CAÇA (RENDERIZADO APENAS QUANDO MÃOS SÃO RECONHECIDAS)
            if (this.yoke.active) {
                ctx.save();
                ctx.translate(w/2, h - 80);
                // Vira visualmente o manche
                ctx.rotate(this.yoke.normX * 0.4);
                let sc = Math.max(0.6, Math.min(1.2, this.yoke.depthRatio)); // Aumenta/Diminui ligeiramente
                ctx.scale(sc, sc);

                // Haste
                ctx.fillStyle = '#111'; ctx.fillRect(-15, 0, 30, 200);
                
                // Manche Furtivo
                ctx.strokeStyle = '#222'; ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(-100, -40); ctx.lineTo(-60, 40); ctx.lineTo(60, 40); ctx.lineTo(100, -40); ctx.stroke();
                
                // Pegas de Borracha
                ctx.strokeStyle = '#333'; ctx.lineWidth = 34;
                ctx.beginPath(); ctx.moveTo(-100, -30); ctx.lineTo(-80, 10); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(100, -30); ctx.lineTo(80, 10); ctx.stroke();

                // Gatilhos Vermelhos
                ctx.fillStyle = '#e74c3c';
                ctx.beginPath(); ctx.arc(-100, -45, 12, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(100, -45, 12, 0, Math.PI*2); ctx.fill();

                // Tela Tática Central do Manche
                ctx.fillStyle = '#0f172a'; ctx.fillRect(-35, 10, 70, 30);
                ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2; ctx.strokeRect(-35, 10, 70, 30);
                ctx.fillStyle = '#00ff66'; ctx.font = "bold 12px Arial"; ctx.textAlign="center";
                let ptTxt = "ESTÁVEL";
                if(this.yoke.depthRatio < 0.85) ptTxt = "MERGULHO";
                if(this.yoke.depthRatio > 1.2) ptTxt = "SUBIDA";
                ctx.fillText(ptTxt, 0, 30);

                ctx.restore();
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, h - 60, w, 60);
                ctx.fillStyle = '#fff'; ctx.textAlign="center"; ctx.font="bold clamp(14px, 3vw, 20px) Arial";
                ctx.fillText("LEVANTE AS MÃOS PARA AGARRAR O MANCHE", w/2, h - 25);
            }

            // BARRA DE INTEGRIDADE (NO FUNDO)
            const hpW = Math.min(200, w * 0.4);
            ctx.fillStyle = '#222'; ctx.fillRect(20, h - 30, hpW, 10);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(20, h - 30, hpW * (this.ship.hp/100), 10);
            ctx.fillStyle = '#fff'; ctx.font = "10px Arial"; ctx.textAlign="left"; ctx.fillText("CASCO / BLINDAGEM", 20, h - 35);
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '🛩️', Game, {
                camera: 'user', // Câmara frontal para rastrear braços/cabeça
                phases: [ { id: 'mission1', name: 'TITANIUM SIMULATOR', desc: 'Pilote com as 2 mãos (empurre para descer). Tranque o alvo e incline a cabeça para mísseis!', reqLvl: 1 } ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
