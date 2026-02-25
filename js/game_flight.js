// =============================================================================
// AERO STRIKE AR: 6DOF LOOPING & KART-STYLE TRACKING EDITION
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: FULL 3D LOOPING, DEPTH-PITCH, FLOATING YOKE, HEAD-MISSILES
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA VETORIAL ABSOLUTA (6DOF)
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 700,
        projectFull: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, w, h) => {
            let dx = objX - camX;
            let dy = objY - camY;
            let dz = objZ - camZ;

            // Rotação Yaw (Eixo Y)
            let cosY = Math.cos(yaw), sinY = Math.sin(yaw);
            let x1 = dx * cosY - dz * sinY;
            let z1 = dx * sinY + dz * cosY;

            // Rotação Pitch (Eixo X) - Suporta loops 360º
            let cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            let y2 = dy * cosP + z1 * sinP;
            let z2 = -dy * sinP + z1 * cosP;

            if (z2 < 10) return { visible: false };

            let scale = Math3D.fov / z2;
            return {
                x: (x1 * scale) + (w / 2),
                y: (y2 * scale) + (h / 2),
                s: scale, z: z2, visible: true
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. SÍNTESE DE ÁUDIO REALISTA
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
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 1200;
            this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.gain); this.jetNoise.start();
        },
        fireVulcan: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, t); osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
            g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireMissile: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(600, t + 0.8);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 2.5);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 2.5);
        },
        explode: function(isHuge) {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(isHuge ? 40 : 80, t); osc.frequency.exponentialRampToValueAtTime(5, t + (isHuge?2.0:1.0));
            g.gain.setValueAtTime(isHuge ? 1.0 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + (isHuge?2.0:1.0));
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + (isHuge?2.0:1.0));
        },
        stop: function() { if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; } }
    };

    // -----------------------------------------------------------------
    // 3. MOTOR DE VOO E COMBATE GLOBAL
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0,
        mission: { targetsDestroyed: 0, targetGoal: 30 },
        
        ship: { 
            hp: 100, speed: 800, // Velocidade Fixa Combate
            worldX: 0, worldY: 5000, worldZ: 0,
            pitch: 0, yaw: 0, roll: 0
        },
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        
        // Manche Flutuante (Kart Style)
        yoke: { x: 0, y: 0, scale: 1, angle: 0, isHolding: false, depthRatio: 1.0 },
        
        combat: { currentTarget: null, lockTimer: 0, isLocked: false, lastVulcanTime: 0, missileCooldown: 0, headTilted: false },
        
        shake: 0, damageFlash: 0,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 800, worldX: 0, worldY: 5000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            this.combat = { currentTarget: null, lockTimer: 0, isLocked: false, lastVulcanTime: 0, missileCooldown: 0, headTilted: false };
            
            for (let i = 0; i < 40; i++) {
                this.clouds.push({ x: (Math.random() - 0.5) * 60000, y: 3000 + Math.random() * 8000, z: (Math.random() - 0.5) * 60000, size: 2000 + Math.random() * 4000 });
            }

            AudioEngine.init(); AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("ESTICAR BRAÇOS: DESCE | ENCOLHER: SOBE | CABEÇA: MÍSSIL");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- TRACKING AVANÇADO (PROFUNDIDADE E MIRA FÁCIL) ---
        processTracking: function(pose, w, h, dt) {
            this.yoke.isHolding = false;
            this.combat.headTilted = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const rs = getKp('right_shoulder'); const ls = getKp('left_shoulder');
                const rEar = getKp('right_ear'); const lEar = getKp('left_ear');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                // Tracking de Cabeça (Mísseis) - Inclinar para a Direita
                if (rEar && lEar && rEar.score > 0.4 && lEar.score > 0.4) {
                    if ((rEar.y - lEar.y) > 25) this.combat.headTilted = true;
                }

                // Tracking de Mãos (Manche Flutuante e Profundidade)
                if (rw && lw && rw.score > 0.3 && lw.score > 0.3) {
                    this.yoke.isHolding = true;

                    let rx = mapX(rw.x), ry = mapY(rw.y);
                    let lx = mapX(lw.x), ly = mapY(lw.y);

                    // Posição central do manche
                    this.yoke.x = (rx + lx) / 2;
                    this.yoke.y = (ry + ly) / 2;

                    let dx = rx - lx; let dy = ry - ly;
                    this.yoke.angle = Math.atan2(dy, dx);
                    
                    let handDist = Math.hypot(dx, dy);

                    // Calcular Profundidade (Distância das mãos vs Ombros)
                    let refDist = w * 0.4; // Fallback
                    if (rs && ls && rs.score > 0.3 && ls.score > 0.3) {
                        refDist = Math.hypot(mapX(rs.x) - mapX(ls.x), mapY(rs.y) - mapY(ls.y));
                    }
                    
                    this.yoke.depthRatio = handDist / refDist;
                    // Escala visual do manche
                    this.yoke.scale = Math.max(0.6, Math.min(1.8, this.yoke.depthRatio));

                    // FÍSICA DO AVIÃO
                    // 1. Roll (Inclinação do volante)
                    this.ship.roll += (this.yoke.angle - this.ship.roll) * 5 * dt;

                    // 2. Pitch (Profundidade dos braços)
                    let targetPitchVel = 0;
                    if (this.yoke.depthRatio < 1.0) targetPitchVel = -1.2; // Braços esticados -> Mergulha
                    else if (this.yoke.depthRatio > 1.3) targetPitchVel = 1.2; // Braços encolhidos -> Sobe
                    this.ship.pitch += targetPitchVel * dt;

                    // 3. Yaw (Mirar movendo o volante pelo ecrã)
                    let normX = (this.yoke.x - w/2) / (w/3); // -1 a 1 dependendo da posição X
                    normX = Math.max(-1.5, Math.min(1.5, normX));
                    this.ship.yaw += normX * 1.5 * dt; // Roda para o lado que mover as mãos
                    
                }
            }
            
            if (!this.yoke.isHolding) {
                this.ship.roll *= 0.95; // Auto-estabiliza
            }

            // Normalizar ângulos para evitar overflow matemático num jogo de loops infinitos
            this.ship.pitch = this.ship.pitch % (Math.PI * 2);
            this.ship.yaw = this.ship.yaw % (Math.PI * 2);
            if (this.ship.pitch < 0) this.ship.pitch += Math.PI * 2;
            if (this.ship.yaw < 0) this.ship.yaw += Math.PI * 2;
        },

        // --- LÓGICA DE COMBATE (AUTO-LOCK & HEAD TILT) ---
        processCombat: function(dt, w, h) {
            let cosP = Math.cos(this.ship.pitch); let sinP = Math.sin(this.ship.pitch);
            let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);

            let forwardX = sinY * cosP;
            let forwardY = sinP;
            let forwardZ = cosY * cosP;
            
            // 1. Procurar Alvo
            this.combat.currentTarget = null;
            let closestDist = Infinity;
            let targetOnSights = false;

            for (let e of this.entities) {
                let relX = e.x - this.ship.worldX; let relY = this.ship.worldY - e.y; let relZ = e.z - this.ship.worldZ;
                let camX = relX * cosY - relZ * sinY;
                let camZ = relX * sinY + relZ * cosY;
                let camYProj = relY * cosP + camZ * sinP; // Posição Y vertical relativa

                if (camZ > 1500 && camZ < 25000) {
                    // Caixa de mira BEM GRANDE para facilitar
                    if (Math.abs(camX) < 4000 && Math.abs(camYProj) < 4000) {
                        targetOnSights = true;
                        if (camZ < closestDist) { closestDist = camZ; this.combat.currentTarget = e; }
                    }
                }
            }

            // 2. Temporizador de Lock-On (2 Segundos)
            if (targetOnSights && this.combat.currentTarget) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 2.0) { this.combat.isLocked = true; this.combat.lockTimer = 2.0; }
            } else {
                this.combat.lockTimer -= dt * 3; 
                if (this.combat.lockTimer <= 0) { this.combat.lockTimer = 0; this.combat.isLocked = false; }
            }

            // 3. Auto-Fire Vulcan
            if (this.combat.isLocked && this.combat.currentTarget) {
                const now = performance.now();
                if (now - this.combat.lastVulcanTime > 80) {
                    this.combat.lastVulcanTime = now;
                    let speed = (this.ship.speed * 25) + 15000;
                    
                    let dx = this.combat.currentTarget.x - this.ship.worldX;
                    let dy = this.combat.currentTarget.y - this.ship.worldY;
                    let dz = this.combat.currentTarget.z - this.ship.worldZ;
                    let dist = Math.hypot(dx, dy, dz);
                    let dirX = dx/dist; let dirY = dy/dist; let dirZ = dz/dist;
                    
                    let offset = Math.random() > 0.5 ? 80 : -80;
                    let spawnX = this.ship.worldX + (Math.cos(this.ship.yaw) * offset);
                    let spawnZ = this.ship.worldZ - (Math.sin(this.ship.yaw) * offset);

                    this.bullets.push({ x: spawnX, y: this.ship.worldY - 20, z: spawnZ, vx: dirX * speed, vy: dirY * speed, vz: dirZ * speed, isEnemy: false, life: 2.0 });
                    AudioEngine.fireVulcan(); this.shake = 4;
                }
            }

            // 4. Head-Tracking Missiles
            if (this.combat.missileCooldown > 0) this.combat.missileCooldown -= dt;
            
            if (this.combat.isLocked && this.combat.headTilted && this.combat.missileCooldown <= 0) {
                this.combat.missileCooldown = 1.0; 
                let speed = this.ship.speed * 25;
                let spawnX1 = this.ship.worldX + (Math.cos(this.ship.yaw) * 150); let spawnZ1 = this.ship.worldZ - (Math.sin(this.ship.yaw) * 150);
                
                this.missiles.push({ x: spawnX1, y: this.ship.worldY - 80, z: spawnZ1, vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, target: this.combat.currentTarget, life: 8.0 });
                AudioEngine.fireMissile(); this.shake = 12;
            }
        },

        // --- ATUALIZAÇÃO DO MUNDO ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderFrame(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 60px 'Russo One'";
                if(this.state === 'VICTORY') { ctx.fillStyle = "#2ecc71"; ctx.fillText("ÁREA SEGURA!", w/2, h/2); } 
                else { ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE ABATIDA", w/2, h/2); }
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
            this.ship.worldZ += speedUnits * forwardZ * dt;
            this.ship.worldY += speedUnits * forwardY * dt;
            
            if (this.ship.worldY < 500) { this.ship.worldY = 500; } // Chão de Titânio
            if (this.ship.worldY > 40000) this.ship.worldY = 40000; // Teto

            this.processCombat(dt, w, h);

            // Spawner
            if (this.entities.length < 8 && Math.random() < 0.04) {
                let spawnDist = 25000 + Math.random() * 10000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*20000;
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*20000;
                
                let r = Math.random();
                if (r < 0.3) {
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 200, rot: Math.random()*Math.PI*2 });
                } else if (r < 0.8) {
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, 
                        vx: forwardX * speedUnits * 0.9 + (Math.random()-0.5)*1500, vy: 0, vz: forwardZ * speedUnits * 0.9 + (Math.random()-0.5)*1500, hp: 150, rot: this.ship.yaw });
                } else {
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*5000), z: sz, 
                        vx: -forwardX * 12000, vy: -forwardY * 12000, vz: -forwardZ * 12000, hp: 150, rot: this.ship.yaw + Math.PI });
                }
            }

            // Atualizar Entidades
            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;

                if (e.type === 'jet_flee') {
                    e.vx += Math.sin(now * 0.003) * 800 * dt; e.x += e.vx * dt;
                }

                let relX = e.x - this.ship.worldX; let relY = this.ship.worldY - e.y; let relZ = e.z - this.ship.worldZ;
                let camX = relX * cosY - relZ * sinY;
                let camZ = relX * sinY + relZ * cosY;

                if (camZ < -8000 || Math.hypot(camX, camZ) > 60000) { e.hp = -1; continue; } 

                // Inimigos Atiram
                let distToShip = Math.hypot(relX, relY, relZ);
                if (distToShip > 1000 && distToShip < 12000) {
                    if ((e.type === 'jet_attack' && Math.random() < 0.05) || (e.type === 'tank' && Math.random() < 0.02)) {
                        let eSpeed = e.type === 'tank' ? 8000 : 15000;
                        this.bullets.push({ 
                            x: e.x, y: e.y, z: e.z, 
                            vx: (-relX/distToShip)*eSpeed, vy: (relY/distToShip)*eSpeed, vz: (-relZ/distToShip)*eSpeed, 
                            isEnemy: true, life: 4.0 
                        });
                    }
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            // Balas
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                
                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.worldX, b.y - this.ship.worldY, b.z - this.ship.worldZ) < 600) {
                        this.ship.hp -= 10; this.damageFlash = 1.0; this.shake = 20;
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

            // Mísseis
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.vx += forwardX * 5000 * dt; m.vy += forwardY * 5000 * dt; m.vz += forwardZ * 5000 * dt; 
                
                if (m.target && m.target.hp > 0) {
                    let dx = m.target.x - m.x; let dy = m.target.y - m.y; let dz = m.target.z - m.z;
                    let dist = Math.hypot(dx, dy, dz);
                    let turnSpeed = 20000 * dt; 
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    
                    if (dist < 1000) {
                        m.target.hp -= 400; m.life = 0;
                        if (m.target.hp <= 0) this.destroyTarget(m.target);
                    }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, vz: (Math.random()-0.5)*150, life: 1.5, c: 'rgba(220,220,220,0.6)', size: 100 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 80 });
                
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 15, 150); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Nuvens e Partículas
            for (let c of this.clouds) {
                let relZ = c.z - this.ship.worldZ; let camZ = (c.x - this.ship.worldX) * sinY + relZ * cosY;
                if (camZ < -20000) {
                    c.z = this.ship.worldZ + forwardZ * 70000 + (Math.random()-0.5)*40000;
                    c.x = this.ship.worldX + forwardX * 70000 + (Math.random()-0.5)*40000;
                }
            }
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            this.renderFrame(ctx, w, h);
            return this.mission.targetsDestroyed * 100;
        },

        destroyTarget: function(t) {
            AudioEngine.explode(t.type === 'tank');
            this.spawnParticles(t.x, t.y, t.z, '#ff3300', 40, 250); 
            this.spawnParticles(t.x, t.y, t.z, '#f1c40f', 30, 150); 
            this.spawnParticles(t.x, t.y, t.z, '#2c3e50', 30, 400); 
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

        // --- MOTOR DE RENDERIZAÇÃO 360º LOOPING ---
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
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll);
            
            // O Segredo do Loop: O horizonte move-se e o mundo capota se formos para além de 90º
            let isUpsideDown = Math.cos(this.ship.pitch) < 0;
            let horizonOffset = Math.sin(this.ship.pitch) * h * 1.5; 

            if (isUpsideDown) {
                ctx.rotate(Math.PI); 
                horizonOffset = -horizonOffset; 
            }

            // CÉU REALISTA ATMOSFÉRICO
            let skyGrad = ctx.createLinearGradient(0, -h*3, 0, horizonOffset);
            skyGrad.addColorStop(0, '#020b1f');   
            skyGrad.addColorStop(0.5, '#0b397a'); 
            skyGrad.addColorStop(1, '#ff9a44');   
            ctx.fillStyle = skyGrad; ctx.fillRect(-w*2, -h*3, w*4, horizonOffset + h*3);

            // SOL
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 100; ctx.shadowColor = '#ffcc00';
            ctx.beginPath(); ctx.arc(w*0.3, horizonOffset - 200, 80, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

            // TERRENO
            let groundGrad = ctx.createLinearGradient(0, horizonOffset, 0, h*3);
            groundGrad.addColorStop(0, '#ff9a44'); 
            groundGrad.addColorStop(0.1, '#1b2a1a'); 
            groundGrad.addColorStop(1, '#090e09');   
            ctx.fillStyle = groundGrad; ctx.fillRect(-w*2, horizonOffset, w*4, h*3);

            // PISO TRON 3D INFINITO (Perfeito para evitar clipping visual)
            ctx.fillStyle = 'rgba(0, 255, 100, 0.4)';
            let step = 5000;
            let sx = Math.floor(this.ship.worldX / step) * step - (step * 15);
            let sz = Math.floor(this.ship.worldZ / step) * step - (step * 15);
            
            for(let x = 0; x <= 30; x++) {
                for(let z = 0; z <= 30; z++) {
                    let px = sx + (x * step); let pz = sz + (z * step);
                    let p = Math3D.projectFull(px, 0, pz, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, w, h);
                    if (p.visible && p.s > 0.05) {
                        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, 20 * p.s), 0, Math.PI*2); ctx.fill();
                    }
                }
            }
            ctx.restore();

            // Z-BUFFER 3D
            let toDraw = [];
            const addDrawable = (list, type) => {
                list.forEach(obj => {
                    let p = Math3D.projectFull(obj.x, obj.y, obj.z, this.ship.worldX, this.ship.worldY, this.ship.worldZ, this.ship.pitch, this.ship.yaw, w, h);
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
                    ctx.fillStyle = 'rgba(255, 200, 150, 0.15)'; 
                    ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'entity') {
                    if (obj.type.startsWith('jet')) {
                        let renderRot = obj.rot - this.ship.yaw;
                        this.draw3DF22(ctx, p.x, p.y, 600 * s, renderRot);
                    } else if (obj.type === 'tank') {
                        this.draw3DTank(ctx, p.x, p.y, 400 * s);
                    }
                    
                    if (obj === this.combat.currentTarget) {
                        let isFullyLocked = this.combat.isLocked;
                        let color = isFullyLocked ? '#ff003c' : '#f1c40f';
                        let size = 120 - (isFullyLocked ? 20 : (this.combat.lockTimer/2.0)*40); 
                        
                        ctx.strokeStyle = color; ctx.lineWidth = isFullyLocked ? 4 : 2;
                        ctx.beginPath();
                        ctx.moveTo(p.x - size, p.y - size/2); ctx.lineTo(p.x - size, p.y - size); ctx.lineTo(p.x - size/2, p.y - size);
                        ctx.moveTo(p.x + size, p.y - size/2); ctx.lineTo(p.x + size, p.y - size); ctx.lineTo(p.x + size/2, p.y - size);
                        ctx.moveTo(p.x - size, p.y + size/2); ctx.lineTo(p.x - size, p.y + size); ctx.lineTo(p.x - size/2, p.y + size);
                        ctx.moveTo(p.x + size, p.y + size/2); ctx.lineTo(p.x + size, p.y + size); ctx.lineTo(p.x + size/2, p.y + size);
                        ctx.stroke();
                        
                        if (isFullyLocked) {
                            ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = "bold 16px 'Chakra Petch'"; ctx.fillText("LOCKED", p.x, p.y + size + 20);
                        }
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.fillStyle = obj.isEnemy ? '#ff0000' : '#ffff00';
                    ctx.shadowBlur = 30 * s; ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 10 * s), Math.max(5, 120 * s), 0, 0, Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                }
                else if (d.type === 'missile') {
                    ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 15*s, p.y - 15*s, 30*s, 30*s);
                }
                else if (d.type === 'particle') {
                    ctx.globalAlpha = Math.max(0, obj.life); ctx.fillStyle = obj.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, obj.size * s), 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });
            ctx.restore();
        },

        draw3DF22: function(ctx, cx, cy, s, rot) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(s*0.3, -s*0.2); ctx.lineTo(-s*0.3, -s*0.2); ctx.fill();
            ctx.fillStyle = '#3a3f44'; ctx.beginPath(); ctx.moveTo(0, -s*0.1); ctx.lineTo(s*0.8, -s*0.4); ctx.lineTo(s*0.2, -s*0.6); ctx.lineTo(-s*0.2, -s*0.6); ctx.lineTo(-s*0.8, -s*0.4); ctx.fill();
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.moveTo(s*0.15, -s*0.5); ctx.lineTo(s*0.3, -s*0.9); ctx.lineTo(s*0.1, -s*0.9); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-s*0.15, -s*0.5); ctx.lineTo(-s*0.3, -s*0.9); ctx.lineTo(-s*0.1, -s*0.9); ctx.fill();
            let grd = ctx.createLinearGradient(-s*0.2, 0, s*0.2, 0);
            grd.addColorStop(0, '#4a5560'); grd.addColorStop(0.5, '#7b8a9c'); grd.addColorStop(1, '#4a5560');
            ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(0, s*0.8); ctx.lineTo(s*0.15, s*0.2); ctx.lineTo(s*0.15, -s*0.6); ctx.lineTo(0, -s*0.8); ctx.lineTo(-s*0.15, -s*0.6); ctx.lineTo(-s*0.15, s*0.2); ctx.fill();
            ctx.fillStyle = '#e6b800'; ctx.beginPath(); ctx.moveTo(0, s*0.5); ctx.lineTo(s*0.08, s*0.1); ctx.lineTo(-s*0.08, s*0.1); ctx.fill();
            ctx.fillStyle = '#00ffff'; ctx.shadowBlur = 20 * (s/100); ctx.shadowColor = '#00ffff';
            ctx.beginPath(); ctx.arc(s*0.08, -s*0.8, s*0.08, 0, Math.PI*2); ctx.arc(-s*0.08, -s*0.8, s*0.08, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
            ctx.restore();
        },

        draw3DTank: function(ctx, cx, cy, s) {
            ctx.save(); ctx.translate(cx, cy);
            let grd = ctx.createLinearGradient(0, -s, 0, s);
            grd.addColorStop(0, '#4b5320'); grd.addColorStop(1, '#2c3512');
            ctx.fillStyle = grd; ctx.fillRect(-s, -s*0.6, s*2, s*1.2);
            ctx.fillStyle = '#111'; ctx.fillRect(-s*1.2, -s*0.6, s*0.2, s*1.2); ctx.fillRect(s*1.0, -s*0.6, s*0.2, s*1.2);
            ctx.fillStyle = '#3e451b'; ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(-s*0.1, -s*1.8, s*0.2, s*1.8);
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // HUD e Crosshair
            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(w/2 - 20, h/2); ctx.lineTo(w/2 - 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 + 20, h/2); ctx.lineTo(w/2 + 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 - 20); ctx.lineTo(w/2, h/2 - 5); ctx.stroke();
            ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            if (this.combat.lockTimer > 0 && !this.combat.isLocked) {
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(w/2, h/2, 40, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * (this.combat.lockTimer/2.0))); ctx.stroke();
            }

            ctx.font = "bold 22px 'Chakra Petch'"; ctx.textAlign = "left"; 
            ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, w*0.2, h/2);
            ctx.textAlign = "right"; 
            ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)} FT`, w*0.8, h/2);
            
            if (this.combat.isLocked) {
                ctx.textAlign = "center"; ctx.fillStyle = "#ff003c"; ctx.font = "bold 28px 'Russo One'";
                ctx.fillText("ALVO TRANCADO! AUTO-FIRE VULCAN!", w/2, h*0.2);
                ctx.fillStyle = "#00ffff"; ctx.font = "bold 20px 'Chakra Petch'";
                ctx.fillText(this.combat.missileCooldown <= 0 ? "INCLINE CABEÇA PARA MÍSSIL" : "RECARREGANDO MÍSSIL...", w/2, h*0.25);
            }

            // TABLIER INTERIOR
            const panelY = h * 0.8;
            ctx.fillStyle = '#1a1d21'; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, panelY); ctx.lineTo(w, panelY); ctx.lineTo(w, h); ctx.fill();
            ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.stroke();

            // Integridade Fofa
            ctx.fillStyle = '#222'; ctx.fillRect(w*0.15, panelY + 40, 150, 20);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(w*0.15, panelY + 40, 150 * (this.ship.hp/100), 20);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(w*0.15, panelY + 40, 150, 20);
            ctx.fillStyle = '#fff'; ctx.font = "14px Arial"; ctx.textAlign="left"; ctx.fillText("CASCO / BLINDAGEM", w*0.15, panelY + 30);

            // MANCHE FLUTUANTE (YOKE)
            if (this.yoke.isHolding) {
                ctx.save(); 
                ctx.translate(this.yoke.x, this.yoke.y); 
                ctx.rotate(this.yoke.angle);
                ctx.scale(this.yoke.scale, this.yoke.scale);

                // Desenho Moderno do Yoke
                ctx.strokeStyle = 'rgba(25, 25, 25, 0.9)'; ctx.lineWidth = 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(-150, -60); ctx.lineTo(-150, 40); ctx.lineTo(-80, 80); 
                ctx.lineTo(80, 80); ctx.lineTo(150, 40); ctx.lineTo(150, -60); ctx.stroke(); 
                ctx.strokeStyle = '#444'; ctx.lineWidth = 44; 
                ctx.beginPath(); ctx.moveTo(-150, -50); ctx.lineTo(-150, 30); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(150, -50); ctx.lineTo(150, 30); ctx.stroke();
                
                // Hologramas visuais do Yoke
                ctx.fillStyle = 'rgba(0, 255, 255, 0.2)'; ctx.beginPath(); ctx.arc(0, 60, 50, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 5; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = "bold 14px Arial"; ctx.textAlign="center"; 
                
                // Indicador de Profundidade
                if (this.yoke.depthRatio < 1.0) ctx.fillText("⬇️ MERGULHO", 0, 65);
                else if (this.yoke.depthRatio > 1.3) ctx.fillText("⬆️ SUBIDA", 0, 65);
                else ctx.fillText("ESTÁVEL", 0, 65);

                ctx.restore();
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0,0,w,h);
                ctx.fillStyle = '#fff'; ctx.textAlign="center"; ctx.font="bold 30px Arial";
                ctx.fillText("LEVANTES AS MÃOS PARA AGARRAR O MANCHE", w/2, h/2);
            }
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '🛩️', Game, {
                camera: 'user',
                phases: [ { id: 'mission1', name: 'ZONA DE COMBATE HD', desc: 'Pilote com 2 mãos! Estique os braços para descer. Encolha para subir (Loops). Tranque a mira e incline a cabeça para lançar Mísseis!', reqLvl: 1 } ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
