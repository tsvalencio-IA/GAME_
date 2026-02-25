// =============================================================================
// AERO STRIKE AR: WARZONE EDITION (TRUE 360° 3D ENGINE)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: ABSOLUTE WORLD COORDINATES, GROUND & AIR TARGETS, THUMB-TRIGGERS
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA VETORIAL (ABSOLUTO PARA CÂMARA)
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 600,
        project: (camX, relY, camZ, w, h, pitch) => {
            let cosP = Math.cos(pitch), sinP = Math.sin(pitch);
            // pitch > 0 (nariz para cima) -> objeto desce no ecrã (dy aumenta)
            let dy = relY * cosP + camZ * sinP;
            let dz = -relY * sinP + camZ * cosP;

            if (dz < 10) return { visible: false }; // Atrás da câmara
            
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
                this.gain.gain.value = 0.15; this.initialized = true;
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
            this.jetFilter = this.ctx.createBiquadFilter(); this.jetFilter.type = 'lowpass'; this.jetFilter.frequency.value = 600;
            this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.gain); this.jetNoise.start();
        },
        updateThrottle: function(throttlePct) {
            if (!this.jetFilter) return;
            this.jetFilter.frequency.setTargetAtTime(400 + (throttlePct * 2000), this.ctx.currentTime, 0.2);
        },
        fireVulcan: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
            g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireMissile: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(500, t + 0.6);
            g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.01, t + 2.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 2.0);
        },
        explode: function(isHuge) {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(isHuge ? 50 : 80, t); osc.frequency.exponentialRampToValueAtTime(10, t + (isHuge?1.5:0.8));
            g.gain.setValueAtTime(isHuge ? 1.0 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + (isHuge?1.5:0.8));
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + (isHuge?1.5:0.8));
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
            hp: 100, speed: 400, targetSpeed: 400, throttlePct: 0.5,
            worldX: 0, worldY: 5000, worldZ: 0, // worldY = Altitude (0 é o chão)
            pitch: 0, yaw: 0, roll: 0
        },
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        
        yoke: {
            baseX: 0, baseY: 0, yOffset: 0, angle: 0,           
            isLeftHolding: false, isRightHolding: false,
            leftBtnPressed: false, rightBtnPressed: false 
        },
        
        arms: { left: { x:0, y:0, active:false }, right: { x:0, y:0, active:false } },
        lastVulcanTime: 0, lastMissileTime: 0, shake: 0, damageFlash: 0, currentTarget: null,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 400, targetSpeed: 400, throttlePct: 0.5, worldX: 0, worldY: 5000, worldZ: 0, pitch: 0, yaw: 0, roll: 0 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            
            for (let i = 0; i < 40; i++) {
                this.clouds.push({
                    x: (Math.random() - 0.5) * 40000, y: 3000 + Math.random() * 8000, z: (Math.random() - 0.5) * 40000, size: 1000 + Math.random() * 3000
                });
            }

            AudioEngine.init(); AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("WARZONE ATIVA. DESTRUA ALVOS TERRESTRES E AÉREOS.");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- CONTROLO FÍSICO (YOKE E GATILHOS) ---
        processArmTracking: function(pose, w, h) {
            this.yoke.baseX = w / 2; this.yoke.baseY = h * 0.85;
            this.arms.left.active = false; this.arms.right.active = false;
            this.yoke.isLeftHolding = false; this.yoke.isRightHolding = false;
            this.yoke.leftBtnPressed = false; this.yoke.rightBtnPressed = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');
                const mapX = (x) => (1 - (x / 640)) * w; const mapY = (y) => (y / 480) * h;

                if (rw && rw.score > 0.2) {
                    this.arms.right.active = true; this.arms.right.x = mapX(rw.x); this.arms.right.y = mapY(rw.y);
                    this.yoke.isRightHolding = true;
                }

                if (lw && lw.score > 0.2) {
                    this.arms.left.active = true; this.arms.left.x = mapX(lw.x); this.arms.left.y = mapY(lw.y);
                    this.yoke.isLeftHolding = true;
                }

                if (this.yoke.isRightHolding && this.yoke.isLeftHolding) {
                    let midY = (this.arms.right.y + this.arms.left.y) / 2;
                    let dy = this.arms.right.y - this.arms.left.y;
                    let dx = this.arms.right.x - this.arms.left.x;
                    
                    this.yoke.angle = Math.atan2(dy, dx);
                    this.yoke.yOffset = midY - this.yoke.baseY;

                    let handDist = Math.hypot(dx, dy);
                    this.ship.throttlePct = Math.max(0, Math.min(1, (handDist - 100) / 250));
                    this.ship.targetSpeed = 200 + (this.ship.throttlePct * 800);
                } else if (this.yoke.isRightHolding || this.yoke.isLeftHolding) {
                    let activeHand = this.yoke.isRightHolding ? this.arms.right : this.arms.left;
                    let normX = (activeHand.x - this.yoke.baseX) / (w/3); 
                    this.yoke.angle = normX * (Math.PI / 4);
                    this.yoke.yOffset = activeHand.y - this.yoke.baseY;
                } else {
                    this.yoke.angle *= 0.9; this.yoke.yOffset *= 0.9;
                }

                this.yoke.yOffset = Math.max(-150, Math.min(150, this.yoke.yOffset));
                
                let targetRoll = this.yoke.angle;
                let targetPitch = (this.yoke.yOffset / 150) * (Math.PI / 3);

                // dt dinâmico seria melhor, mas constante pequena funciona bem para input
                this.ship.roll += (targetRoll - this.ship.roll) * 0.1;
                this.ship.pitch += (targetPitch - this.ship.pitch) * 0.08;
                this.ship.yaw -= this.ship.roll * 0.03; // Virar para os lados com o Roll

                // Zonas de Gatilho Virtuais (Para simular os Polegares)
                let drawYokeY = this.yoke.baseY + this.yoke.yOffset;
                let cosA = Math.cos(this.yoke.angle); let sinA = Math.sin(this.yoke.angle);

                let lbx = -80; let lby = -60;
                let absLeftBtnX = this.yoke.baseX + (lbx * cosA - lby * sinA);
                let absLeftBtnY = drawYokeY + (lbx * sinA + lby * cosA);

                let rbx = 80; let rby = -60;
                let absRightBtnX = this.yoke.baseX + (rbx * cosA - rby * sinA);
                let absRightBtnY = drawYokeY + (rbx * sinA + rby * cosA);

                const TRIGGER_RADIUS = 60; // Área tolerante
                if (this.yoke.isLeftHolding && Math.hypot(this.arms.left.x - absLeftBtnX, this.arms.left.y - absLeftBtnY) < TRIGGER_RADIUS) {
                    this.yoke.leftBtnPressed = true; this.fireMissile();
                }
                if (this.yoke.isRightHolding && Math.hypot(this.arms.right.x - absRightBtnX, this.arms.right.y - absRightBtnY) < TRIGGER_RADIUS) {
                    this.yoke.rightBtnPressed = true; this.fireVulcan();
                }
            } else {
                this.yoke.angle *= 0.9; this.yoke.yOffset *= 0.9;
                this.ship.roll *= 0.95; this.ship.pitch *= 0.95;
            }
        },

        // --- ARMAS (Coordenadas Absolutas) ---
        fireVulcan: function() {
            const now = performance.now();
            if (now - this.lastVulcanTime > 60) {
                this.lastVulcanTime = now;
                let forwardX = Math.sin(this.ship.yaw); let forwardZ = Math.cos(this.ship.yaw); let forwardY = Math.sin(this.ship.pitch);
                let speed = (this.ship.speed * 25) + 12000;
                
                // Tiros alternados
                let offset = Math.random() > 0.5 ? 40 : -40;
                // Calcular posição da asa considerando Yaw e Roll para ser mais exato visualmente (Simplificado aqui)
                let spawnX = this.ship.worldX + (Math.cos(this.ship.yaw) * offset);
                let spawnZ = this.ship.worldZ - (Math.sin(this.ship.yaw) * offset);

                this.bullets.push({ 
                    x: spawnX, y: this.ship.worldY - 20, z: spawnZ, 
                    vx: forwardX * speed, vy: forwardY * speed, vz: forwardZ * speed, 
                    isEnemy: false, life: 1.5 
                });
                AudioEngine.fireVulcan(); this.shake = 3;
            }
        },

        fireMissile: function() {
            const now = performance.now();
            if (now - this.lastMissileTime > 1500) {
                this.lastMissileTime = now;
                let forwardX = Math.sin(this.ship.yaw); let forwardZ = Math.cos(this.ship.yaw); let forwardY = Math.sin(this.ship.pitch);
                let speed = this.ship.speed * 25;

                let spawnX1 = this.ship.worldX + (Math.cos(this.ship.yaw) * 100); let spawnZ1 = this.ship.worldZ - (Math.sin(this.ship.yaw) * 100);
                let spawnX2 = this.ship.worldX + (Math.cos(this.ship.yaw) * -100); let spawnZ2 = this.ship.worldZ - (Math.sin(this.ship.yaw) * -100);

                this.missiles.push({ x: spawnX1, y: this.ship.worldY - 50, z: spawnZ1, vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, target: this.currentTarget, life: 6.0 });
                this.missiles.push({ x: spawnX2, y: this.ship.worldY - 50, z: spawnZ2, vx: forwardX*speed, vy: forwardY*speed, vz: forwardZ*speed, target: this.currentTarget, life: 6.0 });
                AudioEngine.fireMissile(); this.shake = 10;
            }
        },

        // --- ATUALIZAÇÃO DO MUNDO (WARZONE) ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderFrame(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 60px 'Russo One'";
                if(this.state === 'VICTORY') { ctx.fillStyle = "#2ecc71"; ctx.fillText("MISSÃO CUMPRIDA!", w/2, h/2); } 
                else { ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE ABATIDA", w/2, h/2); }
                return this.mission.targetsDestroyed * 100;
            }

            this.processArmTracking(pose, w, h);
            
            // FÍSICA DO JOGADOR
            this.ship.speed += (this.ship.targetSpeed - this.ship.speed) * dt;
            AudioEngine.updateThrottle(this.ship.throttlePct);
            
            let speedUnits = this.ship.speed * 25; // nós para unidades de mapa
            let forwardX = Math.sin(this.ship.yaw); let forwardZ = Math.cos(this.ship.yaw); let forwardY = Math.sin(this.ship.pitch);
            
            this.ship.worldX += speedUnits * forwardX * dt;
            this.ship.worldZ += speedUnits * forwardZ * dt;
            this.ship.worldY += speedUnits * forwardY * dt;
            if (this.ship.worldY < 500) { this.ship.worldY = 500; this.ship.pitch = Math.max(0, this.ship.pitch); } // Evitar bater no chão
            if (this.ship.worldY > 15000) this.ship.worldY = 15000; // Teto

            // SPAWNER DE ALVOS (Guerra Total)
            if (this.entities.length < 10 && Math.random() < 0.05) {
                let spawnDist = 15000 + Math.random() * 10000;
                let sx = this.ship.worldX + forwardX * spawnDist + (Math.random()-0.5)*10000;
                let sz = this.ship.worldZ + forwardZ * spawnDist + (Math.random()-0.5)*10000;
                
                let r = Math.random();
                if (r < 0.2) {
                    this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 150, rot: Math.random()*Math.PI*2 });
                } else if (r < 0.4) {
                    this.entities.push({ type: 'building', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 300, rot: 0 });
                } else if (r < 0.7) {
                    this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(1000, this.ship.worldY + (Math.random()-0.5)*3000), z: sz, 
                        vx: forwardX * speedUnits * 0.8 + (Math.random()-0.5)*1000, vy: 0, vz: forwardZ * speedUnits * 0.8 + (Math.random()-0.5)*1000, hp: 100, rot: this.ship.yaw });
                } else {
                    // Jet Attack (Vem de frente a atirar)
                    this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(1000, this.ship.worldY + (Math.random()-0.5)*3000), z: sz, 
                        vx: -forwardX * 8000, vy: 0, vz: -forwardZ * 8000, hp: 100, rot: this.ship.yaw + Math.PI });
                }
            }

            // ATUALIZAÇÃO E IA DOS INIMIGOS
            this.currentTarget = null; let closestDist = Infinity;
            
            for (let e of this.entities) {
                // Mover as entidades
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;

                // IA de Fuga
                if (e.type === 'jet_flee') {
                    e.vx += Math.sin(now * 0.002) * 500 * dt; // Zig-zag
                    e.x += e.vx * dt;
                }

                // Cálculo para o Radar e Trancamento de Míssil (Converter para câmara local)
                let relX = e.x - this.ship.worldX; let relY = this.ship.worldY - e.y; let relZ = e.z - this.ship.worldZ;
                let camX = relX * Math.cos(this.ship.yaw) - relZ * Math.sin(this.ship.yaw);
                let camZ = relX * Math.sin(this.ship.yaw) + relZ * Math.cos(this.ship.yaw);

                // Remover se passou longe para trás
                if (camZ < -5000 || Math.hypot(camX, camZ) > 40000) { e.hp = -1; continue; } 

                // Lógica de Lock-On
                if (camZ > 2000 && camZ < 20000 && Math.abs(camX) < 4000 && Math.abs(relY) < 4000) {
                    if (camZ < closestDist) { closestDist = camZ; this.currentTarget = e; }
                }

                // Inimigos Atiram
                let distToShip = Math.hypot(relX, relY, relZ);
                if (distToShip > 1000 && distToShip < 8000) {
                    if ((e.type === 'jet_attack' && Math.random() < 0.04) || (e.type === 'tank' && Math.random() < 0.015)) {
                        let eSpeed = e.type === 'tank' ? 5000 : 8000;
                        this.bullets.push({ 
                            x: e.x, y: e.y, z: e.z, 
                            vx: (-relX/distToShip)*eSpeed, vy: (relY/distToShip)*eSpeed, vz: (-relZ/distToShip)*eSpeed, 
                            isEnemy: true, life: 3.0 
                        });
                    }
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            // ATUALIZAR BALAS
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                
                if (b.isEnemy) {
                    let dist = Math.hypot(b.x - this.ship.worldX, b.y - this.ship.worldY, b.z - this.ship.worldZ);
                    if (dist < 400) {
                        this.ship.hp -= 8; this.damageFlash = 1.0; this.shake = 15;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        let hitBox = e.type === 'building' ? 800 : 400;
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < hitBox) {
                            e.hp -= 20; b.life = 0;
                            this.spawnParticles(e.x, e.y, e.z, '#f1c40f', 5, 20); 
                            if (e.hp <= 0) this.destroyTarget(e);
                            break;
                        }
                    }
                    if (b.y < 0) b.life = 0; // Bateu no chão
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            // ATUALIZAR MÍSSEIS
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.vx += forwardX * 3000 * dt; m.vy += forwardY * 3000 * dt; m.vz += forwardZ * 3000 * dt; // Motor empurra
                
                if (m.target && m.target.hp > 0) {
                    let dx = m.target.x - m.x; let dy = m.target.y - m.y; let dz = m.target.z - m.z;
                    let dist = Math.hypot(dx, dy, dz);
                    let turnSpeed = 12000 * dt; // Míssil muito ágil
                    m.vx += (dx/dist) * turnSpeed; m.vy += (dy/dist) * turnSpeed; m.vz += (dz/dist) * turnSpeed;
                    
                    if (dist < 800) {
                        m.target.hp -= 200; m.life = 0;
                        if (m.target.hp <= 0) this.destroyTarget(m.target);
                    }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                
                // Rasto de Fumo Realista
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*200, vy: (Math.random()-0.5)*200, vz: (Math.random()-0.5)*200, life: 1.5, c: 'rgba(200,200,200,0.5)', size: 80 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#e67e22', size: 60 });
                
                if (m.y < 0) { m.life = 0; this.spawnParticles(m.x, 0, m.z, '#e74c3c', 10, 100); } // Bateu no chão
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Atualizar Nuvens
            for (let c of this.clouds) {
                let relZ = c.z - this.ship.worldZ; let camZ = (c.x - this.ship.worldX) * Math.sin(this.ship.yaw) + relZ * Math.cos(this.ship.yaw);
                if (camZ < -10000) {
                    c.z = this.ship.worldZ + forwardZ * 40000 + (Math.random()-0.5)*20000;
                    c.x = this.ship.worldX + forwardX * 40000 + (Math.random()-0.5)*20000;
                }
            }

            // Atualizar Partículas
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            this.renderFrame(ctx, w, h);
            return this.mission.targetsDestroyed * 100;
        },

        destroyTarget: function(t) {
            AudioEngine.explode(t.type === 'building');
            this.spawnParticles(t.x, t.y, t.z, '#e74c3c', t.type==='building'?60:30, 150); 
            this.spawnParticles(t.x, t.y, t.z, '#34495e', t.type==='building'?40:20, 200); 
            this.mission.targetsDestroyed++;
            if (this.mission.targetsDestroyed >= this.mission.targetGoal) this.endGame('VICTORY');
        },

        endGame: function(result) {
            this.state = result; AudioEngine.stop();
            setTimeout(() => { 
                if(window.System.gameOver) window.System.gameOver(this.mission.targetsDestroyed * 100, result === 'VICTORY', this.mission.targetsDestroyed * 4); 
                else window.System.home(); 
            }, 4000);
        },

        spawnParticles: function(x, y, z, color, count, baseSize) {
            for(let i=0; i<count; i++) {
                this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*4000, vy: (Math.random()-0.5)*4000, vz: (Math.random()-0.5)*4000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*80 });
            }
        },

        // --- RENDERIZAÇÃO COMPLETA ---
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
            
            // Horizonte dinâmico com base no pitch
            let horizonY = this.ship.pitch * 1000; 

            // Céu
            let skyGrad = ctx.createLinearGradient(0, -h*2, 0, horizonY);
            skyGrad.addColorStop(0, '#00081a'); skyGrad.addColorStop(1, '#6dd5ed');
            ctx.fillStyle = skyGrad; ctx.fillRect(-w, -h*2, w*2, horizonY + h*2);

            // Chão (Oceano/Terreno)
            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h*2);
            groundGrad.addColorStop(0, '#2c3e20'); groundGrad.addColorStop(1, '#0d140a');
            ctx.fillStyle = groundGrad; ctx.fillRect(-w, horizonY, w*2, h*2);

            // Grelha de Movimento para perceção de velocidade no solo
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'; ctx.lineWidth = 2;
            ctx.beginPath();
            let gridSpacing = 2000;
            // Linhas Horizontais
            let zOffset = (this.ship.worldZ * Math.cos(this.ship.yaw) + this.ship.worldX * Math.sin(this.ship.yaw)) % gridSpacing;
            for(let i=1; i<25; i++) {
                let pz = i * gridSpacing - zOffset; 
                if (pz > 10) {
                    let scale = Math3D.fov / pz;
                    // Chão é y = 0, relY = ship.worldY
                    let dy = this.ship.worldY * Math.cos(this.ship.pitch) + pz * Math.sin(this.ship.pitch);
                    let py = (dy * scale);
                    if(py > horizonY) { ctx.moveTo(-w, py); ctx.lineTo(w, py); }
                }
            }
            ctx.stroke();
            ctx.restore();

            // PREPARAÇÃO Z-BUFFER
            let toDraw = [];
            const addDrawable = (list, type) => {
                list.forEach(obj => {
                    let relX = obj.x - this.ship.worldX;
                    let relY = this.ship.worldY - obj.y; // Canvas Y invertido (Positivo = Abaixo do avião)
                    let relZ = obj.z - this.ship.worldZ;

                    // Rodar coordenadas do mundo para a câmara local
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

            // Ordenar de trás para a frente
            toDraw.sort((a, b) => b.p.z - a.p.z);

            ctx.save();
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll); ctx.translate(-w/2, -h/2);

            toDraw.forEach(d => {
                let p = d.p; let s = p.s; let obj = d.obj;

                if (d.type === 'cloud') {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'entity') {
                    if (obj.type.startsWith('jet')) {
                        // O jet roda consoante o nosso yaw para visualmente parecer correto, ou a sua própria rotação
                        let renderRot = obj.rot - this.ship.yaw;
                        this.draw3DJet(ctx, p.x, p.y, 450 * s, renderRot);
                    } else if (obj.type === 'tank') {
                        this.draw3DTank(ctx, p.x, p.y, 300 * s);
                    } else if (obj.type === 'building') {
                        this.draw3DBuilding(ctx, p.x, p.y, 800 * s);
                    }
                    
                    // UI Lock-on
                    if (obj === this.currentTarget) {
                        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 4; let box = 60;
                        ctx.beginPath();
                        ctx.moveTo(p.x - box, p.y - box/2); ctx.lineTo(p.x - box, p.y - box); ctx.lineTo(p.x - box/2, p.y - box);
                        ctx.moveTo(p.x + box, p.y - box/2); ctx.lineTo(p.x + box, p.y - box); ctx.lineTo(p.x + box/2, p.y - box);
                        ctx.moveTo(p.x - box, p.y + box/2); ctx.lineTo(p.x - box, p.y + box); ctx.lineTo(p.x - box/2, p.y + box);
                        ctx.moveTo(p.x + box, p.y + box/2); ctx.lineTo(p.x + box, p.y + box); ctx.lineTo(p.x + box/2, p.y + box);
                        ctx.stroke();
                        ctx.fillStyle = '#e74c3c'; ctx.textAlign = 'center'; ctx.font = "bold 16px Arial"; ctx.fillText("LOCKED", p.x, p.y + box + 20);
                    } else if (obj.type.startsWith('jet')) {
                        ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 1; ctx.strokeRect(p.x - 30, p.y - 30, 60, 60);
                    } else {
                        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 1; ctx.strokeRect(p.x - 40, p.y - 40, 80, 80);
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.fillStyle = obj.isEnemy ? '#ff0000' : '#ffff00';
                    ctx.shadowBlur = 20; ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 10 * s), Math.max(2, 80 * s), 0, 0, Math.PI*2); ctx.fill();
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

        // --- ASSETS 3D DESENHADOS NO CANVAS ---
        draw3DJet: function(ctx, cx, cy, s, rot) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(s*0.3, -s*0.2); ctx.lineTo(-s*0.3, -s*0.2); ctx.fill();
            ctx.fillStyle = '#34495e'; ctx.beginPath(); ctx.moveTo(0, -s*0.1); ctx.lineTo(s*0.9, -s*0.4); ctx.lineTo(-s*0.9, -s*0.4); ctx.fill();
            ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.moveTo(0, -s*0.3); ctx.lineTo(s*0.2, -s*0.8); ctx.lineTo(-s*0.2, -s*0.8); ctx.fill(); // Inimigo Red Tail
            ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.arc(0, -s*0.8, s*0.2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        },
        draw3DTank: function(ctx, cx, cy, s) {
            ctx.save(); ctx.translate(cx, cy);
            // Corpo e Lagartas
            ctx.fillStyle = '#4b5320'; ctx.fillRect(-s, -s*0.6, s*2, s*1.2);
            ctx.fillStyle = '#111'; ctx.fillRect(-s*1.2, -s*0.6, s*0.2, s*1.2); ctx.fillRect(s*1.0, -s*0.6, s*0.2, s*1.2);
            // Torreta apontada ligeiramente para cima
            ctx.fillStyle = '#3e451b'; ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(-s*0.1, -s*1.5, s*0.2, s*1.5);
            ctx.restore();
        },
        draw3DBuilding: function(ctx, cx, cy, s) {
            ctx.save(); ctx.translate(cx, cy);
            // Base ancorada no cy (que é o y=0 projetado), o edifício cresce "para cima" (y negativo no canvas)
            let w = s; let h = s * 4;
            ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-w/2, -h, w, h);
            ctx.fillStyle = '#555'; ctx.fillRect(0, -h, w/2, h); // Sombra lateral
            ctx.fillStyle = '#f1c40f'; // Janelas acesas
            for(let i=1; i<=6; i++) { ctx.fillRect(-w/4, -h + (i*h/7), w/2, s*0.4); }
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // HUD
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll);
            let hudPitchY = this.ship.pitch * 500; 
            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2; ctx.font = "14px 'Chakra Petch'";
            for (let i = -3; i <= 3; i++) {
                if(i === 0) continue; let py = hudPitchY + (i * 100);
                ctx.beginPath(); ctx.moveTo(-60, py); ctx.lineTo(-20, py); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(60, py); ctx.lineTo(20, py); ctx.stroke();
            }
            ctx.restore(); 

            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(w/2, h/2, 20, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            ctx.font = "bold 20px 'Chakra Petch'"; ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, w*0.3, h/2);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.worldY)} FT`, w*0.7, h/2);
            
            ctx.textAlign = "center"; ctx.fillStyle = "#e67e22"; ctx.font = "bold 24px 'Russo One'";
            ctx.fillText(`OBJETIVOS: ${this.mission.targetsDestroyed} / ${this.mission.targetGoal}`, w/2, h*0.1);

            // TABLIER
            const panelY = h * 0.8;
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, panelY); ctx.lineTo(w, panelY); ctx.lineTo(w, h); ctx.fill();
            ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.stroke();

            // RADAR AVANÇADO (Mostra posições com base na rotação do avião)
            ctx.fillStyle = '#051a05'; ctx.beginPath(); ctx.arc(w*0.85, panelY + 60, 60, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.stroke();
            this.entities.forEach(e => {
                let relX = e.x - this.ship.worldX; let relZ = e.z - this.ship.worldZ;
                let camX = relX * Math.cos(this.ship.yaw) - relZ * Math.sin(this.ship.yaw);
                let camZ = relX * Math.sin(this.ship.yaw) + relZ * Math.cos(this.ship.yaw);
                
                let rX = camX / 400; let rZ = camZ / 400;
                if(Math.hypot(rX, rZ) < 60) { 
                    ctx.fillStyle = e.type.startsWith('jet') ? '#f00' : '#e67e22'; 
                    ctx.fillRect(w*0.85 + rX, panelY + 60 - rZ, 5, 5); 
                }
            });

            // Barra de Potência
            ctx.fillStyle = '#222'; ctx.fillRect(w*0.15, panelY + 20, 150, 20);
            ctx.fillStyle = '#3498db'; ctx.fillRect(w*0.15, panelY + 20, 150 * this.ship.throttlePct, 20);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(w*0.15, panelY + 20, 150, 20);
            ctx.fillStyle = '#fff'; ctx.font = "12px Arial"; ctx.fillText("POTÊNCIA (AFASTE AS MÃOS)", w*0.15 + 75, panelY + 15);

            // --- YOKE ---
            const yoke = this.yoke; let drawYokeY = yoke.baseY + yoke.yOffset;
            ctx.save(); ctx.translate(yoke.baseX, drawYokeY); ctx.rotate(yoke.angle);

            ctx.fillStyle = '#222'; ctx.fillRect(-30, 0, 60, h); // Coluna
            
            ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(-150, -60); ctx.lineTo(-150, 40); ctx.lineTo(-80, 80); 
            ctx.lineTo(80, 80); ctx.lineTo(150, 40); ctx.lineTo(150, -60); ctx.stroke(); // Estrutura

            ctx.strokeStyle = '#444'; ctx.lineWidth = 44; // Pegas
            ctx.beginPath(); ctx.moveTo(-150, -50); ctx.lineTo(-150, 30); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(150, -50); ctx.lineTo(150, 30); ctx.stroke();

            // ZONAS DE GATILHO (THUMB ZONES)
            ctx.fillStyle = this.yoke.leftBtnPressed ? '#fff' : '#e74c3c';
            ctx.beginPath(); ctx.arc(-80, -60, 25, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4; ctx.stroke();
            ctx.fillStyle = this.yoke.leftBtnPressed ? '#e74c3c' : '#fff'; 
            ctx.textAlign = 'center'; ctx.font = "bold 12px Arial"; ctx.fillText("MSL", -80, -55);

            ctx.fillStyle = this.yoke.rightBtnPressed ? '#fff' : '#f1c40f';
            ctx.beginPath(); ctx.arc(80, -60, 25, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 4; ctx.stroke();
            ctx.fillStyle = '#000'; ctx.font = "bold 12px Arial"; ctx.fillText("FIRE", 80, -55);

            ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 60, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#555'; ctx.lineWidth = 5; ctx.stroke();
            ctx.restore();
        },

        renderPilotArms: function(ctx, w, h) {
            const drawArm = (wristX, wristY, isRight, isPressing) => {
                const shoulderX = isRight ? w * 0.9 : w * 0.1;
                const shoulderY = h + 150;
                const elbowX = shoulderX + (wristX - shoulderX) * 0.5 + (isRight ? 100 : -100);
                const elbowY = shoulderY + (wristY - shoulderY) * 0.6 + 80;

                ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 60; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(elbowX, elbowY); ctx.stroke();
                ctx.lineWidth = 45; ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.stroke();

                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(wristX, wristY, 35, 0, Math.PI*2); ctx.fill();
                
                // Animação Falsa do Polegar a Esticar para o Gatilho
                if (isPressing) {
                    ctx.strokeStyle = '#111'; ctx.lineWidth = 18; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(wristX, wristY);
                    ctx.lineTo(wristX + (isRight ? -40 : 40), wristY - 20);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            };

            if (this.arms.right.active) drawArm(this.arms.right.x, this.arms.right.y, true, this.yoke.rightBtnPressed);
            if (this.arms.left.active) drawArm(this.arms.left.x, this.arms.left.y, false, this.yoke.leftBtnPressed);
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '💣', Game, {
                camera: 'user',
                phases: [ { id: 'mission1', name: 'WARZONE', desc: 'Deslize o pulso para os botões centrais do volante para atirar (gatilhos). Destrua jatos e tanques!', reqLvl: 1 } ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
