// =============================================================================
// AERO STRIKE AR: MAXIMUM REALITY (ULTIMATE WARZONE EDITION)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: TRUE YOKE PHYSICS, AUTO-LOCK VULCAN, HEAD-TRACKING MISSILES, HD POLYGONS
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA VETORIAL ABSOLUTA
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 700,
        project: (camX, relY, camZ, w, h, pitch) => {
            let cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            let dy = relY * cosP + camZ * sinP;
            let dz = -relY * sinP + camZ * cosP;

            if (dz < 10) return { visible: false }; 
            
            let scale = Math3D.fov / dz;
            return {
                x: (camX * scale) + (w / 2),
                y: (dy * scale) + (h / 2),
                s: scale, z: dz, visible: true
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
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 1000;
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
        
        // Coordenadas Absolutas do Mundo
        ship: { 
            hp: 100, speed: 600, // Velocidade agressiva e constante
            worldX: 0, worldY: 5000, worldZ: 0,
            pitch: 0, yaw: 0, roll: 0
        },
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        
        // Tracking e Armas
        yoke: { baseX: 0, baseY: 0, yOffset: 0, angle: 0, isHolding: false },
        arms: { left: { x:0, y:0, active:false }, right: { x:0, y:0, active:false } },
        
        combat: {
            currentTarget: null,
            lockTimer: 0,        // Conta até 2.0 segundos
            isLocked: false,
            lastVulcanTime: 0,
            missileCooldown: 0,
            headTilted: false
        },
        
        shake: 0, damageFlash: 0,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 600, worldX: 0, worldY: 5000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            this.combat = { currentTarget: null, lockTimer: 0, isLocked: false, lastVulcanTime: 0, missileCooldown: 0, headTilted: false };
            
            // Gerar Nuvens Volumétricas
            for (let i = 0; i < 40; i++) {
                this.clouds.push({ x: (Math.random() - 0.5) * 60000, y: 3000 + Math.random() * 8000, z: (Math.random() - 0.5) * 60000, size: 2000 + Math.random() * 4000 });
            }

            AudioEngine.init(); AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("MÃOS NO MANCHE! INCLINE A CABEÇA PARA ATIRAR MÍSSEIS!");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- TRACKING & INPUT (MOVENET DUAL-HAND + HEAD TILT) ---
        processTracking: function(pose, w, h, dt) {
            this.yoke.baseX = w / 2; this.yoke.baseY = h * 0.85;
            this.arms.left.active = false; this.arms.right.active = false;
            this.yoke.isHolding = false;
            this.combat.headTilted = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const rEar = getKp('right_ear'); const lEar = getKp('left_ear');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                // 1. RASTREAMENTO DA CABEÇA (MÍSSEIS)
                if (rEar && lEar && rEar.score > 0.4 && lEar.score > 0.4) {
                    // Se a orelha direita descer (y maior) significativamente mais que a esquerda -> Inclinação para a Direita
                    let earDiff = rEar.y - lEar.y; 
                    if (earDiff > 25) {
                        this.combat.headTilted = true;
                    }
                }

                // 2. RASTREAMENTO DOS BRAÇOS (MANCHE INVERTIDO)
                if (rw && rw.score > 0.3) { this.arms.right.active = true; this.arms.right.x = mapX(rw.x); this.arms.right.y = mapY(rw.y); }
                if (lw && lw.score > 0.3) { this.arms.left.active = true; this.arms.left.x = mapX(lw.x); this.arms.left.y = mapY(lw.y); }

                if (this.arms.right.active && this.arms.left.active) {
                    this.yoke.isHolding = true;
                    let midY = (this.arms.right.y + this.arms.left.y) / 2;
                    let dy = this.arms.right.y - this.arms.left.y;
                    let dx = this.arms.right.x - this.arms.left.x;
                    
                    this.yoke.angle = Math.atan2(dy, dx);
                    this.yoke.yOffset = midY - this.yoke.baseY;

                } else if (this.arms.right.active || this.arms.left.active) {
                    this.yoke.isHolding = true;
                    let activeHand = this.arms.right.active ? this.arms.right : this.arms.left;
                    let normX = (activeHand.x - this.yoke.baseX) / (w/3); 
                    this.yoke.angle = normX * (Math.PI / 4);
                    this.yoke.yOffset = activeHand.y - this.yoke.baseY;
                } else {
                    this.yoke.angle *= 0.9; this.yoke.yOffset *= 0.9;
                }

                // APLICAR FÍSICA INVERTIDA DE VOO (YOKE)
                this.yoke.yOffset = Math.max(-150, Math.min(150, this.yoke.yOffset));
                
                let targetRoll = this.yoke.angle;
                // FÍSICA APROVADA: Mãos baixam (yOffset positivo) -> Pitch Positivo (Nariz Sobe)
                let targetPitch = (this.yoke.yOffset / 150) * (Math.PI / 3); 

                this.ship.roll += (targetRoll - this.ship.roll) * 5 * dt;
                this.ship.pitch += (targetPitch - this.ship.pitch) * 3 * dt;
                this.ship.yaw -= this.ship.roll * 1.5 * dt;

            } else {
                this.yoke.angle *= 0.9; this.yoke.yOffset *= 0.9;
                this.ship.roll *= 0.95; this.ship.pitch *= 0.95;
            }
        },

        // --- LÓGICA DE COMBATE E AUTO-LOCK ---
        processCombat: function(dt, w, h) {
            let forwardX = Math.sin(this.ship.yaw); let forwardZ = Math.cos(this.ship.yaw); let forwardY = Math.sin(this.ship.pitch);
            
            // 1. Procurar Alvo Central (Para Lock-On)
            this.combat.currentTarget = null;
            let closestDist = Infinity;
            let targetOnSights = false;

            for (let e of this.entities) {
                let relX = e.x - this.ship.worldX; let relY = this.ship.worldY - e.y; let relZ = e.z - this.ship.worldZ;
                let camX = relX * Math.cos(this.ship.yaw) - relZ * Math.sin(this.ship.yaw);
                let camZ = relX * Math.sin(this.ship.yaw) + relZ * Math.cos(this.ship.yaw);

                // Só processa o que está à frente
                if (camZ > 2000 && camZ < 25000) {
                    // Deteção de Mira Central Rigorosa
                    if (Math.abs(camX) < 1500 && Math.abs(relY) < 1500) {
                        targetOnSights = true;
                        if (camZ < closestDist) { closestDist = camZ; this.combat.currentTarget = e; }
                    }
                }
            }

            // 2. Temporizador de Lock-On
            if (targetOnSights && this.combat.currentTarget) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 2.0) {
                    this.combat.isLocked = true;
                    this.combat.lockTimer = 2.0; // Cap
                }
            } else {
                this.combat.lockTimer -= dt * 2; // Perde o lock 2x mais rápido se sair da mira
                if (this.combat.lockTimer <= 0) {
                    this.combat.lockTimer = 0;
                    this.combat.isLocked = false;
                }
            }

            // 3. Auto-Fire Vulcan
            if (this.combat.isLocked && this.combat.currentTarget) {
                const now = performance.now();
                if (now - this.combat.lastVulcanTime > 80) { // Cadência infernal
                    this.combat.lastVulcanTime = now;
                    let speed = (this.ship.speed * 25) + 15000;
                    
                    // Tiros teleguiados suaves em direção ao alvo trancado
                    let dx = this.combat.currentTarget.x - this.ship.worldX;
                    let dy = this.combat.currentTarget.y - this.ship.worldY;
                    let dz = this.combat.currentTarget.z - this.ship.worldZ;
                    let dist = Math.hypot(dx, dy, dz);
                    
                    let dirX = dx/dist; let dirY = dy/dist; let dirZ = dz/dist;
                    let offset = Math.random() > 0.5 ? 60 : -60;
                    let spawnX = this.ship.worldX + (Math.cos(this.ship.yaw) * offset);
                    let spawnZ = this.ship.worldZ - (Math.sin(this.ship.yaw) * offset);

                    this.bullets.push({ 
                        x: spawnX, y: this.ship.worldY - 20, z: spawnZ, 
                        vx: dirX * speed, vy: dirY * speed, vz: dirZ * speed, 
                        isEnemy: false, life: 2.0 
                    });
                    AudioEngine.fireVulcan(); this.shake = 4;
                }
            }

            // 4. Head-Tracking Missiles
            if (this.combat.missileCooldown > 0) this.combat.missileCooldown -= dt;
            
            if (this.combat.isLocked && this.combat.headTilted && this.combat.missileCooldown <= 0) {
                this.combat.missileCooldown = 1.5; // Recarga de míssil
                let speed = this.ship.speed * 25;
                let spawnX1 = this.ship.worldX + (Math.cos(this.ship.yaw) * 150); let spawnZ1 = this.ship.worldZ - (Math.sin(this.ship.yaw) * 150);
                
                this.missiles.push({ 
                    x: spawnX1, y: this.ship.worldY - 80, z: spawnZ1, 
                    vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, 
                    target: this.combat.currentTarget, life: 8.0 
                });
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
            
            // Movimento do Jogador (Voo Agressivo)
            let speedUnits = this.ship.speed * 25;
            let forwardX = Math.sin(this.ship.yaw); let forwardZ = Math.cos(this.ship.yaw); let forwardY = Math.sin(this.ship.pitch);
            
            this.ship.worldX += speedUnits * forwardX * dt;
            this.ship.worldZ += speedUnits * forwardZ * dt;
            this.ship.worldY += speedUnits * forwardY * dt;
            if (this.ship.worldY < 500) { this.ship.worldY = 500; this.ship.pitch = Math.max(0, this.ship.pitch); } // Ground Collision
            if (this.ship.worldY > 20000) this.ship.worldY = 20000; // Ceiling

            this.processCombat(dt, w, h);

            // Spawner de Inimigos e Terreno
            if (this.entities.length < 8 && Math.random() < 0.04) {
                let spawnDist = 20000 + Math.random() * 10000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*15000;
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*15000;
                
                let r = Math.random();
                if (r < 0.3) {
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 200, rot: Math.random()*Math.PI*2 });
                } else if (r < 0.8) {
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*4000), z: sz, 
                        vx: forwardX * speedUnits * 0.9 + (Math.random()-0.5)*1500, vy: 0, vz: forwardZ * speedUnits * 0.9 + (Math.random()-0.5)*1500, hp: 150, rot: this.ship.yaw });
                } else {
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(2000, this.ship.worldY + (Math.random()-0.5)*4000), z: sz, 
                        vx: -forwardX * 10000, vy: 0, vz: -forwardZ * 10000, hp: 150, rot: this.ship.yaw + Math.PI });
                }
            }

            // Atualização de Entidades
            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;

                if (e.type === 'jet_flee') {
                    e.vx += Math.sin(now * 0.003) * 800 * dt; // Manobra evasiva avançada
                    e.x += e.vx * dt;
                }

                let relX = e.x - this.ship.worldX; let relY = this.ship.worldY - e.y; let relZ = e.z - this.ship.worldZ;
                let camX = relX * Math.cos(this.ship.yaw) - relZ * Math.sin(this.ship.yaw);
                let camZ = relX * Math.sin(this.ship.yaw) + relZ * Math.cos(this.ship.yaw);

                if (camZ < -6000 || Math.hypot(camX, camZ) > 50000) { e.hp = -1; continue; } 

                // Inimigos Atiram
                let distToShip = Math.hypot(relX, relY, relZ);
                if (distToShip > 1000 && distToShip < 10000) {
                    if ((e.type === 'jet_attack' && Math.random() < 0.05) || (e.type === 'tank' && Math.random() < 0.02)) {
                        let eSpeed = e.type === 'tank' ? 6000 : 12000;
                        this.bullets.push({ 
                            x: e.x, y: e.y, z: e.z, 
                            vx: (-relX/distToShip)*eSpeed, vy: (relY/distToShip)*eSpeed, vz: (-relZ/distToShip)*eSpeed, 
                            isEnemy: true, life: 3.5 
                        });
                    }
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            // Atualizar Balas
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                
                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.worldX, b.y - this.ship.worldY, b.z - this.ship.worldZ) < 500) {
                        this.ship.hp -= 10; this.damageFlash = 1.0; this.shake = 20;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < 600) {
                            e.hp -= 25; b.life = 0;
                            this.spawnParticles(e.x, e.y, e.z, '#f39c12', 4, 30); 
                            if (e.hp <= 0) this.destroyTarget(e);
                            break;
                        }
                    }
                    if (b.y < 0) { b.life = 0; this.spawnParticles(b.x, 0, b.z, '#7f8c8d', 3, 40); } // Impacto no chão
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            // Atualizar Mísseis
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.vx += forwardX * 4000 * dt; m.vy += forwardY * 4000 * dt; m.vz += forwardZ * 4000 * dt; 
                
                if (m.target && m.target.hp > 0) {
                    let dx = m.target.x - m.x; let dy = m.target.y - m.y; let dz = m.target.z - m.z;
                    let dist = Math.hypot(dx, dy, dz);
                    let turnSpeed = 16000 * dt; 
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    
                    if (dist < 1000) {
                        m.target.hp -= 300; m.life = 0;
                        if (m.target.hp <= 0) this.destroyTarget(m.target);
                    }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                
                // Rasto de Fumo Denso HD
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, vz: (Math.random()-0.5)*150, life: 1.5, c: 'rgba(220,220,220,0.6)', size: 100 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 80 });
                
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 15, 150); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Ambientes
            for (let c of this.clouds) {
                let relZ = c.z - this.ship.worldZ; let camZ = (c.x - this.ship.worldX) * Math.sin(this.ship.yaw) + relZ * Math.cos(this.ship.yaw);
                if (camZ < -15000) {
                    c.z = this.ship.worldZ + forwardZ * 60000 + (Math.random()-0.5)*30000;
                    c.x = this.ship.worldX + forwardX * 60000 + (Math.random()-0.5)*30000;
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
            this.spawnParticles(t.x, t.y, t.z, '#ff3300', 40, 200); // Núcleo fogo
            this.spawnParticles(t.x, t.y, t.z, '#f1c40f', 30, 100); // Faiscas
            this.spawnParticles(t.x, t.y, t.z, '#2c3e50', 30, 300); // Fumo escuro
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
                this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*5000, vy: (Math.random()-0.5)*5000, vz: (Math.random()-0.5)*5000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*100 });
            }
        },

        // --- MOTOR DE RENDERIZAÇÃO REALISTA (HD CANVAS) ---
        renderFrame: function(ctx, w, h) {
            ctx.save();
            if (this.shake > 0) { ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake); this.shake *= 0.9; }
            this.renderWorld(ctx, w, h);
            this.renderCockpit(ctx, w, h);
            this.renderPilotArms(ctx, w, h);
            if (this.damageFlash > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${this.damageFlash})`; ctx.fillRect(0,0,w,h); this.damageFlash -= 0.05; }
            ctx.restore();
        },

        renderWorld: function(ctx, w, h) {
            ctx.save();
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll);
            let horizonY = this.ship.pitch * 1000; 

            // CÉU REALISTA ATMOSFÉRICO (Estratosfera para Horizonte)
            let skyGrad = ctx.createLinearGradient(0, -h*2, 0, horizonY);
            skyGrad.addColorStop(0, '#020b1f');   // Espaço
            skyGrad.addColorStop(0.5, '#0b397a'); // Azul escuro
            skyGrad.addColorStop(1, '#ff9a44');   // Pôr do sol no horizonte
            ctx.fillStyle = skyGrad; ctx.fillRect(-w, -h*2, w*2, horizonY + h*2);

            // SOL DIRECIONAL
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 100; ctx.shadowColor = '#ffcc00';
            ctx.beginPath(); ctx.arc(w*0.3, horizonY - 200, 80, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

            // TERRENO HD COM NEBLINA (FOG)
            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h*2);
            groundGrad.addColorStop(0, '#ff9a44'); // Blend com o horizonte
            groundGrad.addColorStop(0.1, '#1b2a1a'); // Verde escuro distante
            groundGrad.addColorStop(1, '#090e09');   // Negro perto da câmara
            ctx.fillStyle = groundGrad; ctx.fillRect(-w, horizonY, w*2, h*2);

            // Grelha de Movimento Rápida
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 2;
            ctx.beginPath();
            let gridSpacing = 3000;
            let zOffset = (this.ship.worldZ * Math.cos(this.ship.yaw) + this.ship.worldX * Math.sin(this.ship.yaw)) % gridSpacing;
            for(let i=1; i<30; i++) {
                let pz = i * gridSpacing - zOffset; 
                if (pz > 10) {
                    let scale = Math3D.fov / pz;
                    let dy = this.ship.worldY * Math.cos(this.ship.pitch) + pz * Math.sin(this.ship.pitch);
                    let py = (dy * scale);
                    if(py > horizonY) { ctx.moveTo(-w, py); ctx.lineTo(w, py); }
                }
            }
            ctx.stroke();
            ctx.restore();

            // Z-BUFFER E PROJEÇÃO
            let toDraw = [];
            const addDrawable = (list, type) => {
                list.forEach(obj => {
                    let relX = obj.x - this.ship.worldX;
                    let relY = this.ship.worldY - obj.y; 
                    let relZ = obj.z - this.ship.worldZ;

                    let cosY = Math.cos(this.ship.yaw); let sinY = Math.sin(this.ship.yaw);
                    let camX = relX * cosY - relZ * sinY;
                    let camZ = relX * sinY + relZ * cosY;

                    let p = Math3D.project(camX, relY, camZ, w, h, this.ship.pitch);
                    if (p.visible) toDraw.push({ p: p, type: type, obj: obj, dist: camZ });
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
                    ctx.fillStyle = 'rgba(255, 200, 150, 0.15)'; // Nuvens tingidas pelo pôr do sol
                    ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'entity') {
                    if (obj.type.startsWith('jet')) {
                        let renderRot = obj.rot - this.ship.yaw;
                        this.draw3DF22(ctx, p.x, p.y, 600 * s, renderRot);
                    } else if (obj.type === 'tank') {
                        this.draw3DTank(ctx, p.x, p.y, 400 * s);
                    }
                    
                    // UI Lock-on (Visual Tecnológico)
                    if (obj === this.combat.currentTarget) {
                        let isFullyLocked = this.combat.isLocked;
                        let color = isFullyLocked ? '#ff003c' : '#f1c40f';
                        let size = 80 - (isFullyLocked ? 20 : (this.combat.lockTimer/2.0)*30); // Mira encolhe ao trancar
                        
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

        // --- CAÇA F-22 RAPTOR HD POLÍGONOS ---
        draw3DF22: function(ctx, cx, cy, s, rot) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
            
            // Sombras/Belly
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(s*0.3, -s*0.2); ctx.lineTo(-s*0.3, -s*0.2); ctx.fill();
            
            // Asas Delta Premium
            ctx.fillStyle = '#3a3f44';
            ctx.beginPath(); ctx.moveTo(0, -s*0.1); ctx.lineTo(s*0.8, -s*0.4); ctx.lineTo(s*0.2, -s*0.6); 
            ctx.lineTo(-s*0.2, -s*0.6); ctx.lineTo(-s*0.8, -s*0.4); ctx.fill();
            
            // Caudas Duplas
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.moveTo(s*0.15, -s*0.5); ctx.lineTo(s*0.3, -s*0.9); ctx.lineTo(s*0.1, -s*0.9); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-s*0.15, -s*0.5); ctx.lineTo(-s*0.3, -s*0.9); ctx.lineTo(-s*0.1, -s*0.9); ctx.fill();

            // Fuselagem Gradiente Metálico
            let grd = ctx.createLinearGradient(-s*0.2, 0, s*0.2, 0);
            grd.addColorStop(0, '#4a5560'); grd.addColorStop(0.5, '#7b8a9c'); grd.addColorStop(1, '#4a5560');
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.moveTo(0, s*0.8); ctx.lineTo(s*0.15, s*0.2); ctx.lineTo(s*0.15, -s*0.6); 
            ctx.lineTo(0, -s*0.8); ctx.lineTo(-s*0.15, -s*0.6); ctx.lineTo(-s*0.15, s*0.2); ctx.fill();
            
            // Vidro do Cockpit Dourado (Reflexo de F-22 Real)
            ctx.fillStyle = '#e6b800'; ctx.shadowBlur = 10; ctx.shadowColor = '#000';
            ctx.beginPath(); ctx.moveTo(0, s*0.5); ctx.lineTo(s*0.08, s*0.1); ctx.lineTo(-s*0.08, s*0.1); ctx.fill();
            ctx.shadowBlur = 0;

            // Turbinas com Afterburner Azul Brilhante
            ctx.fillStyle = '#00ffff'; ctx.shadowBlur = 20 * (s/100); ctx.shadowColor = '#00ffff';
            ctx.beginPath(); ctx.arc(s*0.08, -s*0.8, s*0.08, 0, Math.PI*2); ctx.arc(-s*0.08, -s*0.8, s*0.08, 0, Math.PI*2); ctx.fill();
            
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
            // --- HUD MILITAR VERDE ---
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll);
            let hudPitchY = this.ship.pitch * 500; 
            
            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2; ctx.font = "14px 'Chakra Petch'";
            for (let i = -4; i <= 4; i++) {
                if(i === 0) continue; let py = hudPitchY + (i * 120);
                ctx.beginPath(); ctx.moveTo(-80, py); ctx.lineTo(-30, py); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(80, py); ctx.lineTo(30, py); ctx.stroke();
                ctx.fillText(Math.abs(i)*10, -100, py + 5);
            }
            ctx.restore(); 

            // Mira Central (Fixa no vidro)
            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(w/2 - 20, h/2); ctx.lineTo(w/2 - 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 + 20, h/2); ctx.lineTo(w/2 + 5, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 - 20); ctx.lineTo(w/2, h/2 - 5); ctx.stroke();
            ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            // Progress Bar de Lock-on
            if (this.combat.lockTimer > 0 && !this.combat.isLocked) {
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(w/2, h/2, 40, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * (this.combat.lockTimer/2.0))); ctx.stroke();
            }

            // Tapes de Dados
            ctx.font = "bold 22px 'Chakra Petch'"; ctx.textAlign = "left"; 
            ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, w*0.2, h/2);
            ctx.textAlign = "right"; 
            ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)} FT`, w*0.8, h/2);
            
            // Avisos Head-Tracking
            if (this.combat.isLocked) {
                ctx.textAlign = "center"; ctx.fillStyle = "#ff003c"; ctx.font = "bold 28px 'Russo One'";
                ctx.fillText("ALVO TRANCADO! AUTO-FIRE VULCAN!", w/2, h*0.2);
                ctx.fillStyle = "#00ffff"; ctx.font = "bold 20px 'Chakra Petch'";
                ctx.fillText(this.combat.missileCooldown <= 0 ? "INCLINE CABEÇA PARA MÍSSIL" : "RECARREGANDO MÍSSIL...", w/2, h*0.25);
            }

            // --- TABLIER INTERIOR ---
            const panelY = h * 0.8;
            ctx.fillStyle = '#1a1d21'; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, panelY); ctx.lineTo(w, panelY); ctx.lineTo(w, h); ctx.fill();
            ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.stroke();

            // RADAR FÍSICO
            ctx.fillStyle = '#051a05'; ctx.beginPath(); ctx.arc(w*0.85, panelY + 60, 60, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.stroke();
            this.entities.forEach(e => {
                let relX = e.x - this.ship.worldX; let relZ = e.z - this.ship.worldZ;
                let camX = relX * Math.cos(this.ship.yaw) - relZ * Math.sin(this.ship.yaw);
                let camZ = relX * Math.sin(this.ship.yaw) + relZ * Math.cos(this.ship.yaw);
                let rX = camX / 400; let rZ = camZ / 400;
                if(Math.hypot(rX, rZ) < 60) { ctx.fillStyle = e.type.startsWith('jet') ? '#f00' : '#e67e22'; ctx.fillRect(w*0.85 + rX, panelY + 60 - rZ, 5, 5); }
            });

            // Integridade Fofa
            ctx.fillStyle = '#222'; ctx.fillRect(w*0.15, panelY + 40, 150, 20);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(w*0.15, panelY + 40, 150 * (this.ship.hp/100), 20);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(w*0.15, panelY + 40, 150, 20);
            ctx.fillStyle = '#fff'; ctx.font = "14px Arial"; ctx.textAlign="left"; ctx.fillText("CASCO / BLINDAGEM", w*0.15, panelY + 30);

            // --- YOKE DO PILOTO ---
            const yoke = this.yoke; let drawYokeY = yoke.baseY + yoke.yOffset;
            ctx.save(); ctx.translate(yoke.baseX, drawYokeY); ctx.rotate(yoke.angle);

            ctx.fillStyle = '#222'; ctx.fillRect(-30, 0, 60, h); 
            ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(-150, -60); ctx.lineTo(-150, 40); ctx.lineTo(-80, 80); 
            ctx.lineTo(80, 80); ctx.lineTo(150, 40); ctx.lineTo(150, -60); ctx.stroke(); 
            ctx.strokeStyle = '#444'; ctx.lineWidth = 44; 
            ctx.beginPath(); ctx.moveTo(-150, -50); ctx.lineTo(-150, 30); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(150, -50); ctx.lineTo(150, 30); ctx.stroke();
            ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 60, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#555'; ctx.lineWidth = 5; ctx.stroke();
            ctx.restore();
        },

        renderPilotArms: function(ctx, w, h) {
            const drawArm = (wristX, wristY, isRight) => {
                const shoulderX = isRight ? w * 0.9 : w * 0.1;
                const shoulderY = h + 150;
                const elbowX = shoulderX + (wristX - shoulderX) * 0.5 + (isRight ? 100 : -100);
                const elbowY = shoulderY + (wristY - shoulderY) * 0.6 + 80;

                ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.strokeStyle = '#3e451b'; ctx.lineWidth = 60; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(elbowX, elbowY); ctx.stroke();
                ctx.lineWidth = 45; ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.stroke();
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(wristX, wristY, 35, 0, Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
            };

            if (this.arms.right.active) drawArm(this.arms.right.x, this.arms.right.y, true);
            if (this.arms.left.active) drawArm(this.arms.left.x, this.arms.left.y, false);
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '🛩️', Game, {
                camera: 'user',
                phases: [ { id: 'mission1', name: 'ZONA DE COMBATE HD', desc: 'Pilote com 2 mãos (Manche Invertido). Segure o alvo 2s na mira para trancar. Incline a cabeça para lançar mísseis!', reqLvl: 1 } ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
