// =============================================================================
// AERO STRIKE AR: FULL YOKE COMBAT SIMULATOR
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: TRUE ATMOSPHERIC 3D, DUAL-HAND YOKE, THUMB-TRIGGER ZONES, HOTAS
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA VETORIAL
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 600,
        project: (x, y, z, w, h, camPitch, camYaw) => {
            let cosY = Math.cos(camYaw), sinY = Math.sin(camYaw);
            let dx = x * cosY + z * sinY;
            let dz = -x * sinY + z * cosY;
            
            let cosP = Math.cos(camPitch), sinP = Math.sin(camPitch);
            let dy = y * cosP - dz * sinP;
            dz = y * sinP + dz * cosP;

            if (dz < 10) return { visible: false };
            
            let scale = Math3D.fov / dz;
            return {
                x: (dx * scale) + (w / 2),
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
            g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireMissile: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(150, t); osc.frequency.linearRampToValueAtTime(600, t + 0.6);
            g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 2.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 2.0);
        },
        explode: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(80, t); osc.frequency.exponentialRampToValueAtTime(10, t + 1.0);
            g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.0);
        },
        stop: function() { if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; } }
    };

    // -----------------------------------------------------------------
    // 3. MOTOR DE VOO E COMBATE
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0,
        mission: { targetsDestroyed: 0, targetGoal: 15 },
        
        ship: { 
            hp: 100, speed: 400, targetSpeed: 400, altitude: 6000, heading: 0, 
            pitch: 0, yaw: 0, roll: 0, worldX: 0, worldZ: 0, throttlePct: 0.5
        },
        
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        
        // Manche Central (Yoke) com Gatilhos de Dedão Integrados
        yoke: {
            baseX: 0, baseY: 0, 
            yOffset: 0,         
            angle: 0,           
            isLeftHolding: false, isRightHolding: false,
            leftBtnPressed: false, rightBtnPressed: false // Os botões de dedão
        },
        
        arms: { left: { x:0, y:0, active:false }, right: { x:0, y:0, active:false } },
        
        lastVulcanTime: 0, lastMissileTime: 0, shake: 0, damageFlash: 0, currentTarget: null,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 400, targetSpeed: 400, altitude: 6000, heading: 0, pitch: 0, yaw: 0, roll: 0, worldX: 0, worldZ: 0, throttlePct: 0.5 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            
            for (let i = 0; i < 50; i++) {
                this.clouds.push({
                    x: (Math.random() - 0.5) * 30000, y: 3000 + Math.random() * 5000,
                    z: (Math.random() - 0.5) * 30000, size: 1000 + Math.random() * 2000
                });
            }

            AudioEngine.init(); AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("MÃOS NO VOLANTE. DESLIZE OS PULSOS PARA OS BOTÕES PARA ATIRAR.");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- TRACKING & INPUT (MOVENET DUAL-HAND YOKE) ---
        processArmTracking: function(pose, w, h) {
            // Posicionar UI Base do Manche
            this.yoke.baseX = w / 2;
            this.yoke.baseY = h * 0.85;

            this.arms.left.active = false; this.arms.right.active = false;
            this.yoke.isLeftHolding = false; this.yoke.isRightHolding = false;
            this.yoke.leftBtnPressed = false; this.yoke.rightBtnPressed = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');

                const mapX = (x) => (1 - (x / 640)) * w;
                const mapY = (y) => (y / 480) * h;

                if (rw && rw.score > 0.2) {
                    this.arms.right.active = true;
                    this.arms.right.x = mapX(rw.x); this.arms.right.y = mapY(rw.y);
                    this.yoke.isRightHolding = true;
                }

                if (lw && lw.score > 0.2) {
                    this.arms.left.active = true;
                    this.arms.left.x = mapX(lw.x); this.arms.left.y = mapY(lw.y);
                    this.yoke.isLeftHolding = true;
                }

                // --- FÍSICA E CONTROLOS DO MANCHE (YOKE) ---
                if (this.yoke.isRightHolding && this.yoke.isLeftHolding) {
                    // 1. DINÂMICA DE VOO (Inclinação e Rotação)
                    let midY = (this.arms.right.y + this.arms.left.y) / 2;
                    let dy = this.arms.right.y - this.arms.left.y;
                    let dx = this.arms.right.x - this.arms.left.x;
                    
                    this.yoke.angle = Math.atan2(dy, dx);
                    this.yoke.yOffset = midY - this.yoke.baseY;

                    // 2. CONTROLO DE ACELERAÇÃO (Afastar/Aproximar as mãos)
                    let handDist = Math.hypot(dx, dy);
                    // Distância entre 100px (Travagem) e 350px (Turbo)
                    this.ship.throttlePct = Math.max(0, Math.min(1, (handDist - 100) / 250));
                    this.ship.targetSpeed = 300 + (this.ship.throttlePct * 700);

                } else if (this.yoke.isRightHolding || this.yoke.isLeftHolding) {
                    // Controlo com uma mão (Emergência/Auto-estabiliza parcial)
                    let activeHand = this.yoke.isRightHolding ? this.arms.right : this.arms.left;
                    let normX = (activeHand.x - this.yoke.baseX) / (w/3); 
                    this.yoke.angle = normX * (Math.PI / 4);
                    this.yoke.yOffset = activeHand.y - this.yoke.baseY;
                } else {
                    // NENHUMA MÃO: Retorno ao centro
                    this.yoke.angle *= 0.9;
                    this.yoke.yOffset *= 0.9;
                }

                // Limitar curso do manche
                this.yoke.yOffset = Math.max(-150, Math.min(150, this.yoke.yOffset));
                
                // Converter Yoke -> Aeronave
                let targetRoll = this.yoke.angle;
                let targetPitch = (this.yoke.yOffset / 150) * (Math.PI / 3);

                this.ship.roll += (targetRoll - this.ship.roll) * 0.1;
                this.ship.pitch += (targetPitch - this.ship.pitch) * 0.05;
                this.ship.yaw -= this.ship.roll * 0.02;

                // --- 3. GATILHOS DE DEDÃO (THUMB TRIGGERS) ---
                // Calcular posição exata (absoluta) dos botões no ecrã com a rotação do manche
                let drawYokeY = this.yoke.baseY + this.yoke.yOffset;
                let cosA = Math.cos(this.yoke.angle);
                let sinA = Math.sin(this.yoke.angle);

                // Posição local do botão Esquerdo (Missil) no volante
                let lbx = -100; let lby = -50;
                let absLeftBtnX = this.yoke.baseX + (lbx * cosA - lby * sinA);
                let absLeftBtnY = drawYokeY + (lbx * sinA + lby * cosA);

                // Posição local do botão Direito (Vulcan) no volante
                let rbx = 100; let rby = -50;
                let absRightBtnX = this.yoke.baseX + (rbx * cosA - rby * sinA);
                let absRightBtnY = drawYokeY + (rbx * sinA + rby * cosA);

                // Verificar colisão do pulso com o botão virtual para disparar
                const TRIGGER_RADIUS = 60;

                if (this.yoke.isLeftHolding && Math.hypot(this.arms.left.x - absLeftBtnX, this.arms.left.y - absLeftBtnY) < TRIGGER_RADIUS) {
                    this.yoke.leftBtnPressed = true;
                    this.fireMissile();
                }

                if (this.yoke.isRightHolding && Math.hypot(this.arms.right.x - absRightBtnX, this.arms.right.y - absRightBtnY) < TRIGGER_RADIUS) {
                    this.yoke.rightBtnPressed = true;
                    this.fireVulcan();
                }

            } else {
                this.yoke.angle *= 0.9; this.yoke.yOffset *= 0.9;
                this.ship.roll *= 0.95; this.ship.pitch *= 0.95;
            }
        },

        // --- SISTEMAS DE ARMAS ---
        fireVulcan: function() {
            const now = performance.now();
            if (now - this.lastVulcanTime > 60) {
                this.lastVulcanTime = now;
                // Dispara canhões duplos do nariz
                this.bullets.push({ x: -40, y: 20, z: 0, vz: 6000, life: 1.5 });
                this.bullets.push({ x:  40, y: 20, z: 0, vz: 6000, life: 1.5 });
                AudioEngine.fireVulcan();
                this.shake = 4;
            }
        },

        fireMissile: function() {
            const now = performance.now();
            if (now - this.lastMissileTime > 1500) {
                this.lastMissileTime = now;
                // Se houver um alvo trancado, persegue
                this.missiles.push({ x: -150, y: 50, z: 0, vz: 1500, target: this.currentTarget, life: 6.0 });
                this.missiles.push({ x:  150, y: 50, z: 0, vz: 1500, target: this.currentTarget, life: 6.0 });
                AudioEngine.fireMissile();
                this.shake = 10;
            }
        },

        // --- ATUALIZAÇÃO DO MUNDO 3D ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderWorld(ctx, w, h); this.renderCockpit(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 60px 'Russo One'";
                if(this.state === 'VICTORY') {
                    ctx.fillStyle = "#2ecc71"; ctx.fillText("ÁREA LIMPA. BOM TRABALHO!", w/2, h/2);
                } else {
                    ctx.fillStyle = "#e74c3c"; ctx.fillText("SISTEMAS DESTRUÍDOS", w/2, h/2);
                }
                return this.mission.targetsDestroyed * 100;
            }

            this.processArmTracking(pose, w, h);
            
            // Física Básica e Áudio
            this.ship.speed += (this.ship.targetSpeed - this.ship.speed) * dt;
            AudioEngine.updateThrottle(this.ship.throttlePct);
            
            let speedZ = this.ship.speed * dt * 25;
            this.ship.worldZ += speedZ * Math.cos(this.ship.yaw);
            this.ship.worldX += speedZ * Math.sin(this.ship.yaw);
            this.ship.altitude += this.ship.pitch * speedZ * 0.8; 
            this.ship.heading = (this.ship.yaw * 180 / Math.PI) % 360;

            // Spawner
            if (this.entities.length < 6 && Math.random() < 0.03) {
                this.entities.push({
                    type: 'jet', hp: 100,
                    x: this.ship.worldX + (Math.random() - 0.5) * 8000,
                    y: this.ship.altitude + (Math.random() - 0.5) * 3000,
                    z: this.ship.worldZ + 12000 + Math.random() * 5000,
                    vx: (Math.random() - 0.5) * 1500,
                    vz: -300 - Math.random() * 800,
                    rotZ: Math.random() > 0.5 ? 0.4 : -0.4
                });
            }

            // Sistema de Trancamento de Alvo (Radar Lock-on)
            this.currentTarget = null;
            let closestDist = Infinity;
            for (let e of this.entities) {
                let relZ = e.z - this.ship.worldZ; let relX = e.x - this.ship.worldX; let relY = e.y - this.ship.altitude;
                
                if (relZ > 2000 && relZ < 15000 && Math.abs(relX) < 2000 && Math.abs(relY) < 2000) {
                    if (relZ < closestDist) { closestDist = relZ; this.currentTarget = e; }
                }
                
                e.x += e.vx * dt; e.z += e.vz * dt;
                if (e.x > this.ship.worldX + 5000) e.vx -= 800 * dt;
                if (e.x < this.ship.worldX - 5000) e.vx += 800 * dt;

                if (relZ < -2000) { e.hp = -1; continue; } 

                if (Math.random() < 0.015 && relZ > 1000 && relZ < 6000 && Math.abs(relX) < 1500) {
                     this.bullets.push({ x: relX, y: relY, z: relZ, vz: -4000, isEnemy: true, life: 2.5 });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);

            // Balas (Metralhadora Vulcan)
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i];
                b.z += b.vz * dt; b.life -= dt;
                
                if (b.isEnemy) {
                    if (b.z < 100 && b.z > -200 && Math.abs(b.x) < 300 && Math.abs(b.y) < 300) {
                        this.ship.hp -= 5; this.damageFlash = 1.0; this.shake = 15;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        let relZ = e.z - this.ship.worldZ; let relX = e.x - this.ship.worldX; let relY = e.y - this.ship.altitude;
                        if (Math.abs(b.z - relZ) < 500 && Math.abs(b.x - relX) < 400 && Math.abs(b.y - relY) < 400) {
                            e.hp -= 15; b.life = 0;
                            this.spawnParticles(relX, relY, relZ, '#f1c40f', 5, 20); // Faiscas
                            if (e.hp <= 0) this.destroyTarget(e, relX, relY, relZ);
                            break;
                        }
                    }
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            // Mísseis
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.vz += 1500 * dt; 
                m.z += m.vz * dt; m.life -= dt;
                
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*100, vy: (Math.random()-0.5)*100, vz: -m.vz*0.2, life: 1.0, c: 'rgba(200,200,200,0.6)', size: 60 });
                this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: -m.vz*0.1, life: 0.2, c: '#e67e22', size: 40 });

                if (m.target && m.target.hp > 0) {
                    let relX = m.target.x - this.ship.worldX; let relY = m.target.y - this.ship.altitude; let relZ = m.target.z - this.ship.worldZ;
                    m.x += (relX - m.x) * 6 * dt; m.y += (relY - m.y) * 6 * dt; // Perseguição
                    
                    if (Math.abs(m.z - relZ) < 600 && Math.abs(m.x - relX) < 500) {
                        m.target.hp -= 150; m.life = 0;
                        if (m.target.hp <= 0) this.destroyTarget(m.target, relX, relY, relZ);
                    }
                }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            for (let c of this.clouds) {
                if (c.z - this.ship.worldZ < -5000) { c.z += 35000; c.x = this.ship.worldX + (Math.random()-0.5)*30000; }
            }

            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            ctx.save();
            if (this.shake > 0) { ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake); this.shake *= 0.9; }
            this.renderWorld(ctx, w, h);
            this.renderCockpit(ctx, w, h);
            this.renderPilotArms(ctx, w, h);
            if (this.damageFlash > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${this.damageFlash})`; ctx.fillRect(0,0,w,h); this.damageFlash -= dt * 2; }
            ctx.restore();

            return this.mission.targetsDestroyed * 100;
        },

        destroyTarget: function(target, rx, ry, rz) {
            AudioEngine.explode();
            this.spawnParticles(rx, ry, rz, '#e74c3c', 30, 100); 
            this.spawnParticles(rx, ry, rz, '#34495e', 20, 150); 
            this.mission.targetsDestroyed++;
            if (this.mission.targetsDestroyed >= this.mission.targetGoal) this.endGame('VICTORY');
        },

        endGame: function(result) {
            this.state = result; AudioEngine.stop();
            setTimeout(() => { 
                if(window.System.gameOver) window.System.gameOver(this.mission.targetsDestroyed * 100, result === 'VICTORY', this.mission.targetsDestroyed * 3); 
                else window.System.home(); 
            }, 4000);
        },

        spawnParticles: function(x, y, z, color, count, baseSize) {
            for(let i=0; i<count; i++) {
                this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*3000, vy: (Math.random()-0.5)*3000, vz: (Math.random()-0.5)*3000, life: 1.0 + Math.random(), c: color, size: baseSize + Math.random()*50 });
            }
        },

        // --- RENDERIZADORES ---
        renderWorld: function(ctx, w, h) {
            ctx.save();
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll);
            let horizonY = this.ship.pitch * 1000; 

            let skyGrad = ctx.createLinearGradient(0, -h, 0, horizonY);
            skyGrad.addColorStop(0, '#00081a'); skyGrad.addColorStop(1, '#4facfe');
            ctx.fillStyle = skyGrad; ctx.fillRect(-w, -h*2, w*2, horizonY + h*2);

            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
            groundGrad.addColorStop(0, '#1e2c1a'); groundGrad.addColorStop(1, '#0d140a');
            ctx.fillStyle = groundGrad; ctx.fillRect(-w, horizonY, w*2, h*2);

            ctx.strokeStyle = 'rgba(0, 255, 100, 0.1)'; ctx.lineWidth = 2;
            ctx.beginPath();
            let zOffset = (this.ship.worldZ % 2000);
            for(let i=1; i<20; i++) {
                let pz = i * 2000 - zOffset; let scale = Math3D.fov / pz;
                let py = ((-this.ship.altitude) * scale) + horizonY;
                if(py > horizonY) { ctx.moveTo(-w, py); ctx.lineTo(w, py); }
            }
            ctx.stroke();
            ctx.restore();

            let drawables = [];
            this.clouds.forEach(c => drawables.push({ type: 'cloud', obj: c, x: c.x - this.ship.worldX, y: c.y - this.ship.altitude, z: c.z - this.ship.worldZ }));
            this.entities.forEach(e => drawables.push({ type: 'jet', obj: e, x: e.x - this.ship.worldX, y: e.y - this.ship.altitude, z: e.z - this.ship.worldZ }));
            this.bullets.forEach(b => drawables.push({ type: 'bullet', obj: b, x: b.x, y: b.y, z: b.z }));
            this.missiles.forEach(m => drawables.push({ type: 'missile', obj: m, x: m.x, y: m.y, z: m.z }));
            this.particles.forEach(p => drawables.push({ type: 'particle', obj: p, x: p.x, y: p.y, z: p.z }));

            drawables.sort((a, b) => b.z - a.z);

            ctx.save();
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll); ctx.translate(-w/2, -h/2);

            drawables.forEach(d => {
                let p = Math3D.project(d.x, d.y, d.z, w, h, this.ship.pitch, 0);
                if (!p.visible) return;

                if (d.type === 'cloud') {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, d.obj.size * p.s, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'jet') {
                    this.draw3DJet(ctx, p.x, p.y, 450 * p.s, d.obj.rotZ);
                    
                    if (d.obj === this.currentTarget) {
                        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; let s = 80;
                        ctx.beginPath();
                        ctx.moveTo(p.x - s, p.y - s/2); ctx.lineTo(p.x - s, p.y - s); ctx.lineTo(p.x - s/2, p.y - s);
                        ctx.moveTo(p.x + s, p.y - s/2); ctx.lineTo(p.x + s, p.y - s); ctx.lineTo(p.x + s/2, p.y - s);
                        ctx.moveTo(p.x - s, p.y + s/2); ctx.lineTo(p.x - s, p.y + s); ctx.lineTo(p.x - s/2, p.y + s);
                        ctx.moveTo(p.x + s, p.y + s/2); ctx.lineTo(p.x + s, p.y + s); ctx.lineTo(p.x + s/2, p.y + s);
                        ctx.stroke();
                        ctx.fillStyle = '#e74c3c'; ctx.textAlign = 'center'; ctx.font = "bold 14px Arial"; ctx.fillText("LOCKED", p.x, p.y + s + 20);
                    } else {
                        ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 1;
                        ctx.strokeRect(p.x - 40, p.y - 40, 80, 80);
                    }
                }
                else if (d.type === 'bullet') {
                    ctx.fillStyle = d.obj.isEnemy ? '#ff0000' : '#ffff00';
                    ctx.shadowBlur = 20; ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 10 * p.s), Math.max(2, 60 * p.s), 0, 0, Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0;
                }
                else if (d.type === 'missile') {
                    ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 15*p.s, p.y - 15*p.s, 30*p.s, 30*p.s);
                }
                else if (d.type === 'particle') {
                    ctx.globalAlpha = Math.max(0, d.obj.life);
                    ctx.fillStyle = d.obj.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, d.obj.size * p.s, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });

            ctx.restore();
        },

        draw3DJet: function(ctx, cx, cy, s, rot) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.fillStyle = '#333'; ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(s*0.3, -s*0.2); ctx.lineTo(-s*0.3, -s*0.2); ctx.fill();
            ctx.fillStyle = '#555'; ctx.beginPath(); ctx.moveTo(0, -s*0.1); ctx.lineTo(s*0.9, -s*0.4); ctx.lineTo(-s*0.9, -s*0.4); ctx.fill();
            ctx.fillStyle = '#2980b9'; ctx.beginPath(); ctx.moveTo(0, s*0.7); ctx.lineTo(s*0.1, s*0.3); ctx.lineTo(-s*0.1, s*0.3); ctx.fill();
            ctx.fillStyle = '#ff3300'; ctx.beginPath(); ctx.arc(0, -s*0.5, s*0.2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // --- HUD ---
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll);
            let hudPitchY = this.ship.pitch * 500; 
            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2; ctx.font = "14px 'Chakra Petch'";
            for (let i = -3; i <= 3; i++) {
                if(i === 0) continue;
                let py = hudPitchY + (i * 100);
                ctx.beginPath(); ctx.moveTo(-60, py); ctx.lineTo(-20, py); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(60, py); ctx.lineTo(20, py); ctx.stroke();
            }
            ctx.restore(); 

            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(w/2, h/2, 20, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            ctx.font = "bold 20px 'Chakra Petch'"; ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)}`, w*0.3, h/2);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.altitude)}`, w*0.7, h/2);
            
            ctx.textAlign = "center"; ctx.fillStyle = "#f1c40f"; ctx.font = "bold 24px 'Russo One'";
            ctx.fillText(`ALVOS: ${this.mission.targetsDestroyed} / ${this.mission.targetGoal}`, w/2, h*0.1);

            // --- TABLIER ---
            const panelY = h * 0.8;
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, panelY); ctx.lineTo(w, panelY); ctx.lineTo(w, h); ctx.fill();
            ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.stroke();

            ctx.fillStyle = '#051a05'; ctx.beginPath(); ctx.arc(w*0.85, panelY + 60, 60, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.stroke();
            this.entities.forEach(e => {
                let rx = (e.x - this.ship.worldX) / 100; let rz = (e.z - this.ship.worldZ) / 100;
                if(Math.hypot(rx, rz) < 60) { ctx.fillStyle = '#f00'; ctx.fillRect(w*0.85 + rx, panelY + 60 - rz, 5, 5); }
            });

            // Barra de Velocidade (Aceleração Física com os braços)
            ctx.fillStyle = '#222'; ctx.fillRect(w*0.15, panelY + 20, 150, 20);
            ctx.fillStyle = '#3498db'; ctx.fillRect(w*0.15, panelY + 20, 150 * this.ship.throttlePct, 20);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(w*0.15, panelY + 20, 150, 20);
            ctx.fillStyle = '#fff'; ctx.font = "12px Arial"; ctx.fillText("POTÊNCIA (AFASTE AS MÃOS)", w*0.15 + 75, panelY + 15);

            // --- YOKE (MANCHE DUPLO COM BOTÕES INTEGRADOS) ---
            const yoke = this.yoke;
            let drawYokeY = yoke.baseY + yoke.yOffset;
            
            ctx.save();
            ctx.translate(yoke.baseX, drawYokeY);
            ctx.rotate(yoke.angle);

            // Coluna Central
            ctx.fillStyle = '#222'; ctx.fillRect(-30, 0, 60, h);
            
            // Volante
            ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(-150, -60); ctx.lineTo(-150, 40); ctx.lineTo(-80, 80); 
            ctx.lineTo(80, 80); ctx.lineTo(150, 40); ctx.lineTo(150, -60);
            ctx.stroke();

            // Pegas (Onde seguras)
            ctx.strokeStyle = '#444'; ctx.lineWidth = 44;
            ctx.beginPath(); ctx.moveTo(-150, -50); ctx.lineTo(-150, 30); ctx.stroke(); // Esq
            ctx.beginPath(); ctx.moveTo(150, -50); ctx.lineTo(150, 30); ctx.stroke();   // Dir

            // BOTÃO DO POLEGAR ESQUERDO (MÍSSIL)
            ctx.fillStyle = this.yoke.leftBtnPressed ? '#fff' : '#e74c3c';
            ctx.beginPath(); ctx.arc(-100, -50, 25, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4; ctx.stroke();
            ctx.fillStyle = this.yoke.leftBtnPressed ? '#e74c3c' : '#fff'; 
            ctx.textAlign = 'center'; ctx.font = "bold 12px Arial"; ctx.fillText("MSL", -100, -45);

            // BOTÃO DO POLEGAR DIREITO (VULCAN)
            ctx.fillStyle = this.yoke.rightBtnPressed ? '#fff' : '#f1c40f';
            ctx.beginPath(); ctx.arc(100, -50, 25, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 4; ctx.stroke();
            ctx.fillStyle = '#000'; ctx.font = "bold 12px Arial"; ctx.fillText("FIRE", 100, -45);

            // Logotipo Central
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
                
                // Manga do Fato
                ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 60; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(elbowX, elbowY); ctx.stroke();
                ctx.lineWidth = 45; ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.stroke();

                // Luva Base
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(wristX, wristY, 35, 0, Math.PI*2); ctx.fill();
                
                // Representação do Polegar Virtual Esticado
                if (isPressing) {
                    ctx.strokeStyle = '#111'; ctx.lineWidth = 18; ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(wristX, wristY);
                    // Desenha um segmento (o polegar) indo em direção ao interior do volante
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
            window.System.registerGame('flight_sim', 'Aero Strike AR', '🛩️', Game, {
                camera: 'user',
                phases: [ { id: 'mission1', name: 'ZONA DE GATILHO', desc: 'Pilote com as duas mãos! Deslize o pulso para o centro do manche para atirar. Afaste as mãos para acelerar!', reqLvl: 1 } ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();