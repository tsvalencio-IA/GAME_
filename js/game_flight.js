// =============================================================================
// AERO STRIKE AR: TITANIUM MASTER EDITION (V3.0)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: ULTRA-SMOOTH LERP, PARALLAX MOUNTAINS, ARCADE PHYSICS, HEAD-MISSILES
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA VETORIAL (ARCADE FLIGHT)
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 800,
        // Projeção sólida sem inversões bizarras (Céu é sempre para cima)
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, w, h) => {
            let dx = objX - camX;
            let dy = camY - objY; // Y invertido para Canvas
            let dz = objZ - camZ;

            // Yaw (Virar)
            let cosY = Math.cos(-yaw), sinY = Math.sin(-yaw);
            let x1 = dx * cosY - dz * sinY;
            let z1 = dx * sinY + dz * cosY;

            // Pitch (Subir/Descer)
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
            let bufferSize = this.ctx.sampleRate * 2; let buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            let data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            this.jetNoise = this.ctx.createBufferSource(); this.jetNoise.buffer = buffer; this.jetNoise.loop = true;
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 1000;
            this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.gain); this.jetNoise.start();
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
            osc.type = 'square'; osc.frequency.setValueAtTime(200, t); osc.frequency.linearRampToValueAtTime(1000, t + 0.5);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.5);
        },
        explode: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(80, t); osc.frequency.exponentialRampToValueAtTime(10, t + 1.0);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.0);
        },
        stop: function() { if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; } }
    };

    // -----------------------------------------------------------------
    // 3. LÓGICA CENTRAL DO JOGO
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0,
        mission: { targetsDestroyed: 0, targetGoal: 30 },
        
        ship: { 
            hp: 100, speed: 1800, // Velocidade incrível de caça
            worldX: 0, worldY: 8000, worldZ: 0,
            pitch: 0, yaw: 0, roll: 0
        },
        
        // Rastreamento Suave (Ultra Smooth LERP)
        input: { x: 0, y: 0, depth: 1.0, angle: 0, active: false, headTiltRight: false },
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        mountains: [], // Cenário Parallax
        
        combat: { currentTarget: null, lockTimer: 0, isLocked: false, lastVulcanTime: 0, missileCooldown: 0 },
        shake: 0, damageFlash: 0,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 1800, worldX: 0, worldY: 8000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            this.input = { x: 0, y: 0, depth: 1.0, angle: 0, active: false, headTiltRight: false };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            
            // Gerar Montanhas 360º para Parallax
            this.mountains = [];
            for(let i=0; i<360; i+= 5) {
                this.mountains.push({
                    angle: i * (Math.PI/180),
                    height: 500 + Math.random() * 2500,
                    width: 10 + Math.random() * 20
                });
            }

            for (let i = 0; i < 40; i++) {
                this.clouds.push({ x: (Math.random() - 0.5) * 80000, y: 4000 + Math.random() * 10000, z: (Math.random() - 0.5) * 80000, size: 2000 + Math.random() * 5000 });
            }

            AudioEngine.init(); AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("SIMULADOR TITANIUM. FOQUE NO INIMIGO PARA ATIRAR.");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- RASTREAMENTO INTELIGENTE E SUAVE (LERP) ---
        processTracking: function(pose, w, h, dt) {
            let targetActive = false;
            let targetX = 0, targetY = 0, targetAngle = 0, targetDepth = 1.0;
            this.input.headTiltRight = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const rEar = getKp('right_ear'); const lEar = getKp('left_ear');
                const nose = getKp('nose');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                // 1. Deteção de Míssil (Orelha direita desce no ecrã -> Inclinação para a direita real)
                if (rEar && lEar && rEar.score > 0.4 && lEar.score > 0.4) {
                    if ((rEar.y - lEar.y) > 20) this.input.headTiltRight = true;
                } else if (nose && nose.score > 0.4) {
                    // Fallback: se o nariz for muito rápido para a direita
                    if (nose.x > 400) this.input.headTiltRight = true;
                }

                // 2. Leitura do Manche (Ambas as mãos)
                if (rw && lw && rw.score > 0.3 && lw.score > 0.3) {
                    targetActive = true;
                    let rx = mapX(rw.x), ry = mapY(rw.y);
                    let lx = mapX(lw.x), ly = mapY(lw.y);

                    // Centro das mãos (Mapeado de -1 a 1 para o ecrã)
                    targetX = (((rx + lx) / 2) - (w / 2)) / (w / 4);
                    targetX = Math.max(-1.5, Math.min(1.5, targetX));
                    
                    targetY = ((ry + ly) / 2); // Apenas visual para o manche

                    // Ângulo (Volante)
                    targetAngle = Math.atan2(ry - ly, rx - lx);

                    // Profundidade (Distância entre os pulsos comparado com a largura do ecrã)
                    // Braços esticados -> Mãos mais juntas na câmara.
                    // Braços encolhidos -> Mãos mais afastadas na câmara.
                    let handDist = Math.hypot(rx - lx, ry - ly);
                    targetDepth = handDist / (w * 0.35); // Normalizado
                    targetDepth = Math.max(0.4, Math.min(1.6, targetDepth));
                }
            }

            // SUAVIZAÇÃO EXTREMA (LERP - O SEGREDO DO GAME FEEL AAA)
            let smooth = 8.0 * dt; 
            if (targetActive) {
                this.input.active = true;
                this.input.x += (targetX - this.input.x) * smooth;
                this.input.y += (targetY - this.input.y) * smooth;
                this.input.angle += (targetAngle - this.input.angle) * smooth;
                this.input.depth += (targetDepth - this.input.depth) * smooth;

                // APLICAR FÍSICA AO AVIÃO
                // Yaw (Vira para onde as mãos vão)
                this.ship.yaw += this.input.x * 1.5 * dt;

                // Pitch (Esticar = Descer / Puxar = Subir)
                let pitchVel = 0;
                if (this.input.depth < 0.85) pitchVel = -1.2; // Empurrou (Desce)
                else if (this.input.depth > 1.15) pitchVel = 1.2; // Puxou (Sobe)
                
                this.ship.pitch += pitchVel * dt;
                
                // Limitar Pitch (Nada de capotar para trás, mantemos a orientação legível - Estilo Arcade)
                this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));

                // Roll (O avião deita para o lado da curva)
                let targetRoll = this.input.x * 1.2 + this.input.angle * 0.5;
                this.ship.roll += (targetRoll - this.ship.roll) * 4 * dt;

            } else {
                this.input.active = false;
                // Auto-estabilizar se soltar o manche
                this.ship.roll += (0 - this.ship.roll) * 3 * dt;
                this.ship.pitch += (0 - this.ship.pitch) * 2 * dt;
                this.input.x *= 0.9;
                this.input.angle *= 0.9;
            }
        },

        // --- SISTEMA DE COMBATE AAA ---
        processCombat: function(dt, w, h) {
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP;
            let forwardY = sinP;
            let forwardZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch); 
            
            this.combat.currentTarget = null;
            let closestDist = Infinity;
            let targetOnSights = false;

            for (let e of this.entities) {
                let p = Math3D.project(e.x, e.y, e.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, w, h);
                if (p.visible && p.z > 1000 && p.z < 40000) {
                    // Caixa de mira gigante no centro do ecrã (Fácil para Mobile)
                    if (Math.abs(p.x - w/2) < w * 0.3 && Math.abs(p.y - h/2) < h * 0.3) {
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
                this.combat.lockTimer -= dt * 2.5; 
                if (this.combat.lockTimer <= 0) { this.combat.lockTimer = 0; this.combat.isLocked = false; }
            }

            // Metralhadora Automática
            if (this.combat.isLocked && this.combat.currentTarget) {
                const now = performance.now();
                if (now - this.combat.lastVulcanTime > 80) {
                    this.combat.lastVulcanTime = now;
                    let speed = (this.ship.speed * 25) + 25000;
                    
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

            // Mísseis via Movimento de Cabeça
            if (this.combat.missileCooldown > 0) this.combat.missileCooldown -= dt;
            
            if (this.combat.isLocked && this.input.headTiltRight && this.combat.missileCooldown <= 0) {
                this.combat.missileCooldown = 1.2; 
                let speed = this.ship.speed * 25;
                let spawnX1 = this.ship.worldX + (Math.cos(this.ship.yaw) * 120); 
                let spawnZ1 = this.ship.worldZ - (Math.sin(this.ship.yaw) * 120);
                
                this.missiles.push({ x: spawnX1, y: this.ship.worldY - 50, z: spawnZ1, vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, target: this.combat.currentTarget, life: 6.0 });
                AudioEngine.fireMissile(); this.shake = 10;
            }
        },

        // --- LOOP PRINCIPAL DO JOGO ---
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
            
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP;
            let forwardY = sinP;
            let forwardZ = cosY * cosP; 
            let speedUnits = this.ship.speed * 25;
            
            this.ship.worldX += speedUnits * forwardX * dt;
            this.ship.worldY += speedUnits * forwardY * dt;
            this.ship.worldZ += speedUnits * forwardZ * dt;
            
            if (this.ship.worldY < 500) { this.ship.worldY = 500; this.ship.pitch = Math.max(0, this.ship.pitch); } // Não deixa bater no chão
            if (this.ship.worldY > 40000) this.ship.worldY = 40000; 

            this.processCombat(dt, w, h);

            // Spawner de Inimigos Dinâmico
            if (this.entities.length < 8 && Math.random() < 0.04) {
                let spawnDist = 30000 + Math.random() * 10000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*20000;
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*20000;
                
                let r = Math.random();
                if (r < 0.2) {
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 200, yaw: Math.random()*Math.PI*2 });
                } else if (r < 0.7) {
                    // Caça a fugir (Vemos a traseira)
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, 
                        vx: forwardX * speedUnits * 0.9 + (Math.random()-0.5)*1500, vy: 0, vz: forwardZ * speedUnits * 0.9 + (Math.random()-0.5)*1500, hp: 150, yaw: this.ship.yaw });
                } else {
                    // Caça Kamikaze (Vemos de Frente)
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, 
                        vx: -forwardX * 18000, vy: -forwardY * 18000, vz: -forwardZ * 18000, hp: 150, yaw: this.ship.yaw + Math.PI });
                }
            }

            // Atualização Inimigos
            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
                if (e.type === 'jet_flee') { e.vx += Math.sin(now * 0.003) * 1000 * dt; e.x += e.vx * dt; }

                let dx = e.x - this.ship.worldX; let dy = e.y - this.ship.worldY; let dz = e.z - this.ship.worldZ;
                let dist = Math.hypot(dx, dy, dz);
                if (dist > 80000) { e.hp = -1; continue; } // Remove se passar longe

                // Inimigos Atiram
                if (dist > 1000 && dist < 12000) {
                    if ((e.type === 'jet_attack' && Math.random() < 0.06) || (e.type === 'tank' && Math.random() < 0.02)) {
                        let eSpeed = e.type === 'tank' ? 8000 : 20000;
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
                    let turnSpeed = 30000 * dt; 
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    
                    if (dist < 1000) { m.target.hp -= 400; m.life = 0; if (m.target.hp <= 0) this.destroyTarget(m.target); }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, vz: (Math.random()-0.5)*150, life: 1.0, c: 'rgba(200,200,200,0.6)', size: 100 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 60 });
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 15, 150); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Nuvens Infinitas
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
            AudioEngine.explode();
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
                this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*8000, vy: (Math.random()-0.5)*8000, vz: (Math.random()-0.5)*8000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*150 });
            }
        },

        // --- MOTOR DE RENDERIZAÇÃO ESTILO AAA (MOBILE OPTIMIZED) ---
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
            ctx.save();
            ctx.translate(w/2, h/2); 
            ctx.rotate(this.ship.roll); // Roll visual direto
            
            // O Horizonte move-se incrivelmente com o Pitch
            let horizonY = this.ship.pitch * (h * 1.2); 

            // CÉU REALISTA ATMOSFÉRICO
            let skyGrad = ctx.createLinearGradient(0, -h*3, 0, horizonY);
            skyGrad.addColorStop(0, '#001a33');   
            skyGrad.addColorStop(0.5, '#004080'); 
            skyGrad.addColorStop(1, '#66a3ff');   
            ctx.fillStyle = skyGrad; ctx.fillRect(-w*3, -h*3, w*6, horizonY + h*3);

            // SOL 
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 100; ctx.shadowColor = '#ffffcc';
            ctx.beginPath(); ctx.arc(w*0.5, horizonY - 150, 70, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

            // CHÃO E MONTANHAS PARALLAX
            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h*3);
            groundGrad.addColorStop(0, '#1a331a'); 
            groundGrad.addColorStop(1, '#050a05');   
            ctx.fillStyle = groundGrad; ctx.fillRect(-w*3, horizonY, w*6, h*3);

            // Desenhar Montanhas no Horizonte com base no Yaw
            ctx.fillStyle = '#112211'; // Cor da montanha distante
            ctx.beginPath();
            ctx.moveTo(-w*3, horizonY);
            
            let viewAngle = this.ship.yaw;
            this.mountains.forEach(m => {
                // Calcular posição X na tela com base no angulo e FOV
                let angleDiff = (m.angle - viewAngle);
                // Normalizar entre -PI e PI
                while(angleDiff <= -Math.PI) angleDiff += Math.PI*2;
                while(angleDiff > Math.PI) angleDiff -= Math.PI*2;

                if (angleDiff > -Math.PI/2 && angleDiff < Math.PI/2) {
                    let mx = (angleDiff / (Math.PI/3)) * (w/2);
                    let my = horizonY - (m.height * (1 - (this.ship.worldY/40000))); // Montanha diminui se formos muito alto
                    ctx.lineTo(mx - m.width*20, horizonY);
                    ctx.lineTo(mx, my);
                    ctx.lineTo(mx + m.width*20, horizonY);
                }
            });
            ctx.lineTo(w*3, horizonY);
            ctx.fill();

            // LINHA DE HORIZONTE HUD
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.5)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-w*3, horizonY); ctx.lineTo(w*3, horizonY); ctx.stroke();

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

            addDrawable(this.clouds, 'cloud');
            addDrawable(this.entities, 'entity');
            addDrawable(this.bullets, 'bullet');
            addDrawable(this.missiles, 'missile');
            addDrawable(this.particles, 'particle');

            toDraw.sort((a, b) => b.p.z - a.p.z);

            ctx.save();
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll); ctx.translate(-w/2, -h/2);

            toDraw.forEach(d => {
                let p = d.p; let s = p.s; let obj = d.obj;

                if (d.type === 'cloud') {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; 
                    ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'entity') {
                    if (obj.type.startsWith('jet')) {
                        this.drawMilitaryJet(ctx, p, obj.yaw, this.ship.yaw);
                    } else if (obj.type === 'tank') {
                        this.draw3DTank(ctx, p.x, p.y, 400 * s);
                    }
                    
                    // UI LOCK-ON (Círculo High-Tech)
                    let isLocked = (obj === this.combat.currentTarget);
                    let isFullyLocked = isLocked && this.combat.isLocked;
                    
                    if (isLocked) {
                        let rad = Math.max(40, 150 * s); 
                        if (!isFullyLocked) rad += (2.0 - this.combat.lockTimer) * 20; // Animação de encolher
                        
                        ctx.strokeStyle = isFullyLocked ? '#ff003c' : '#f1c40f';
                        ctx.lineWidth = isFullyLocked ? 4 : 2;
                        
                        ctx.save();
                        ctx.translate(p.x, p.y);
                        ctx.rotate(this.lastTime * 0.002); // Roda o anel
                        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI*1.5); ctx.stroke();
                        ctx.restore();
                        
                        if (isFullyLocked) {
                            ctx.fillStyle = '#ff003c'; ctx.textAlign = 'center'; ctx.font = "bold 14px 'Chakra Petch'"; 
                            ctx.fillText("LOCKED", p.x, p.y + rad + 20);
                        }
                    } else if (obj.type.startsWith('jet')) {
                        // Marcação inimigo normal
                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)'; ctx.lineWidth = 1;
                        ctx.strokeRect(p.x - 20, p.y - 20, 40, 40);
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.fillStyle = obj.isEnemy ? '#ff0000' : '#ffff00';
                    ctx.shadowBlur = 20 * s; ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 5 * s), Math.max(5, 80 * s), 0, 0, Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
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
            ctx.restore();
        },

        // --- SISTEMA FALSO 3D DO INIMIGO ---
        drawMilitaryJet: function(ctx, p, enemyYaw, playerYaw) {
            let relYaw = enemyYaw - playerYaw;
            let isRearView = Math.cos(relYaw) > 0; 

            let s = p.s * 400; 
            ctx.save(); ctx.translate(p.x, p.y); 

            if (isRearView) {
                // TRASEIRA (Fugindo)
                ctx.fillStyle = '#2c3e50'; 
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, s*0.2); ctx.lineTo(-s*0.8, s*0.4); ctx.lineTo(s*0.8, s*0.4); ctx.lineTo(s, s*0.2); ctx.fill();
                ctx.fillStyle = '#1a252f'; 
                ctx.beginPath(); ctx.moveTo(-s*0.2, s*0.1); ctx.lineTo(-s*0.4, -s*0.6); ctx.lineTo(-s*0.1, -s*0.6); ctx.fill();
                ctx.beginPath(); ctx.moveTo(s*0.2, s*0.1); ctx.lineTo(s*0.4, -s*0.6); ctx.lineTo(s*0.1, -s*0.6); ctx.fill();
                ctx.fillStyle = '#000'; 
                ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#e67e22'; // Fogo Turbina
                ctx.shadowBlur = 15; ctx.shadowColor = '#e67e22';
                ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.fill();
            } else {
                // FRENTE (Atacando - Kamikaze)
                ctx.fillStyle = '#2c3e50'; 
                ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(-s, s*0.4); ctx.lineTo(-s*0.2, s*0.5); ctx.lineTo(s*0.2, s*0.5); ctx.lineTo(s, s*0.4); ctx.fill();
                ctx.fillStyle = '#34495e'; 
                ctx.beginPath(); ctx.moveTo(0, -s*0.8); ctx.lineTo(-s*0.2, s*0.3); ctx.lineTo(s*0.2, s*0.3); ctx.fill();
                ctx.fillStyle = '#000'; 
                ctx.fillRect(-s*0.3, s*0.2, s*0.15, s*0.2); ctx.fillRect(s*0.15, s*0.2, s*0.15, s*0.2);
                ctx.fillStyle = '#f1c40f'; // Cockpit
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
            ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)}`, 20, h/2);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)}`, w - 20, h/2);

            // MIRA CENTRAL
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.5)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(w/2 - 20, h/2); ctx.lineTo(w/2 - 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 + 20, h/2); ctx.lineTo(w/2 + 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 - 20); ctx.lineTo(w/2, h/2 - 5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 + 20); ctx.lineTo(w/2, h/2 + 5); ctx.stroke();
            ctx.fillStyle = 'rgba(0, 255, 100, 0.5)'; ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            // TEXTOS DE AVISO (Centro da Tela)
            ctx.textAlign = "center"; 
            if (this.combat.isLocked) {
                ctx.fillStyle = "#ff003c"; ctx.font = "bold clamp(20px, 5vw, 30px) 'Russo One'";
                ctx.fillText("ALVO TRANCADO! AUTO-FIRE", w/2, h/2 - 50);
                if (this.combat.missileCooldown <= 0) {
                    ctx.fillStyle = "#00ffff"; ctx.font = "bold 14px 'Chakra Petch'";
                    ctx.fillText(">> INCLINE CABEÇA PARA MÍSSIL <<", w/2, h/2 + 50);
                }
            }

            // O MANCHE MILITAR 4K (Renderizado se a IA vir as mãos)
            if (this.input.active) {
                ctx.save();
                
                // Ancorar o manche à base da tela mas permitir movimento suave
                let yokeDrawX = (w/2) + (this.input.x * w/4);
                // Profundidade altera o tamanho visual (Esticar = Pequeno, Encolher = Grande)
                let sc = Math.max(0.6, Math.min(1.4, this.input.depth)); 
                let yokeDrawY = h - (100 * sc); 
                
                ctx.translate(yokeDrawX, yokeDrawY);
                ctx.rotate(this.input.angle); // Roda com as mãos
                ctx.scale(sc, sc);

                // Sombra do Manche
                ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(0,0,0,0.8)';

                // Haste central (Liga ao fundo)
                ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-20, 0, 40, h);
                ctx.fillStyle = '#111'; ctx.fillRect(-15, 0, 10, h); // Detalhe metálico
                
                // Manche Furtivo Premium (Estilo Boeing/Fighter)
                ctx.fillStyle = '#1a1d21'; ctx.strokeStyle = '#050505'; ctx.lineWidth = 10; ctx.lineJoin = 'round';
                ctx.beginPath(); 
                ctx.moveTo(-120, -50); ctx.lineTo(-140, 50); ctx.lineTo(-70, 80); 
                ctx.lineTo(70, 80); ctx.lineTo(140, 50); ctx.lineTo(120, -50); 
                ctx.lineTo(80, -40); ctx.lineTo(40, 30); ctx.lineTo(-40, 30); ctx.lineTo(-80, -40); 
                ctx.closePath(); ctx.fill(); ctx.stroke();
                
                ctx.shadowBlur = 0; // Desliga sombra para detalhes

                // Pegas Laterais Texturizadas (Grip)
                ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 30; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(-130, -30); ctx.lineTo(-100, 40); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(130, -30); ctx.lineTo(100, 40); ctx.stroke();

                // Botões de Gatilho (Aceso = Pronto, Apagado = Cooldown)
                ctx.fillStyle = (this.combat.missileCooldown <= 0) ? '#ff003c' : '#550000';
                ctx.beginPath(); ctx.arc(-110, -45, 12, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#f1c40f'; // Botão Vulcan
                ctx.beginPath(); ctx.arc(110, -45, 12, 0, Math.PI*2); ctx.fill();

                // Ecrã Central Telemetria
                ctx.fillStyle = '#020617'; ctx.fillRect(-40, 20, 80, 40);
                ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2; ctx.strokeRect(-40, 20, 80, 40);
                ctx.fillStyle = '#00ff66'; ctx.font = "bold 14px 'Chakra Petch'"; ctx.textAlign="center";
                let ptTxt = "ESTÁVEL";
                if(this.input.depth < 0.85) ptTxt = "MERGULHO";
                if(this.input.depth > 1.15) ptTxt = "SUBIDA";
                ctx.fillText(ptTxt, 0, 45);

                ctx.restore();
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, h - 80, w, 80);
                ctx.fillStyle = '#00ffcc'; ctx.textAlign="center"; ctx.font="bold clamp(16px, 3vw, 24px) 'Chakra Petch'";
                ctx.fillText("AGARRE O MANCHE COM AS DUAS MÃOS", w/2, h - 35);
            }

            // BARRA DE INTEGRIDADE DA NAVE (Canto Inferior Esquerdo)
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
                    { id: 'mission1', name: 'TITANIUM SIMULATOR', desc: 'Pilote com 2 mãos! Estique para Mergulhar, Encolha para Subir. Mantenha a mira e Incline a Cabeça para disparar Mísseis!', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
