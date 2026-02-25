// =============================================================================
// AERO STRIKE AR: FLIGHT SIMULATOR (COMBAT EDITION)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: TRUE ATMOSPHERIC 3D, FIGHTER JET HUD, HOTAS & MINORITY REPORT TRACKING
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA VETORIAL
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 600,
        project: (x, y, z, w, h, camPitch, camYaw) => {
            // Aplicar rotação da câmara (Yaw e Pitch do jogador)
            let cosY = Math.cos(camYaw), sinY = Math.sin(camYaw);
            let dx = x * cosY + z * sinY;
            let dz = -x * sinY + z * cosY;
            
            let cosP = Math.cos(camPitch), sinP = Math.sin(camPitch);
            let dy = y * cosP - dz * sinP;
            dz = y * sinP + dz * cosP;

            if (dz < 10) return { visible: false }; // Atrás da câmara
            
            let scale = Math3D.fov / dz;
            return {
                x: (dx * scale) + (w / 2),
                y: (dy * scale) + (h / 2),
                s: scale,
                z: dz,
                visible: true
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. SÍNTESE DE ÁUDIO REALISTA (Turbina e Armas)
    // -----------------------------------------------------------------
    const AudioEngine = {
        ctx: null, jetNoise: null, jetFilter: null, gain: null, initialized: false,
        init: function() {
            if (this.initialized) return;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.gain = this.ctx.createGain();
                this.gain.connect(this.ctx.destination);
                this.gain.gain.value = 0.2;
                this.initialized = true;
            } catch (e) {}
        },
        startJet: function() {
            if (!this.initialized || this.jetNoise) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            
            // Gerar ruído branco para simular o vento/turbina
            let bufferSize = this.ctx.sampleRate * 2;
            let buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            let data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            
            this.jetNoise = this.ctx.createBufferSource();
            this.jetNoise.buffer = buffer;
            this.jetNoise.loop = true;
            
            this.jetFilter = this.ctx.createBiquadFilter();
            this.jetFilter.type = 'lowpass';
            this.jetFilter.frequency.value = 400; // Frequência base grave
            
            this.jetNoise.connect(this.jetFilter);
            this.jetFilter.connect(this.gain);
            this.jetNoise.start();
        },
        updateThrottle: function(throttlePct) {
            if (!this.jetFilter) return;
            // Throttle altera o "uivo" da turbina
            this.jetFilter.frequency.setTargetAtTime(400 + (throttlePct * 1500), this.ctx.currentTime, 0.2);
        },
        fireVulcan: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime;
            let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, t); osc.frequency.exponentialRampToValueAtTime(10, t + 0.1);
            g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
        },
        fireMissile: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime;
            let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(200, t); osc.frequency.linearRampToValueAtTime(800, t + 0.5);
            g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 1.5);
        },
        explode: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime;
            let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(50, t); osc.frequency.exponentialRampToValueAtTime(5, t + 0.8);
            g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.8);
        },
        stop: function() {
            if (this.jetNoise) { this.jetNoise.stop(); this.jetNoise.disconnect(); this.jetNoise = null; }
        }
    };

    // -----------------------------------------------------------------
    // 3. MOTOR DE VOO E COMBATE
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0,
        
        // Missão
        mission: { targetsDestroyed: 0, targetGoal: 10 },
        
        // Estado da Aeronave
        ship: { 
            hp: 100, 
            speed: 300,        // Velocidade atual (nós)
            targetSpeed: 300,  // Velocidade desejada (throttle)
            altitude: 5000,    // Altitude em pés
            heading: 0,        // Bússola (0-360)
            pitch: 0, yaw: 0, roll: 0, 
            worldX: 0, worldZ: 0 
        },
        
        // Físicas do Mundo
        entities: [], bullets: [], missiles: [], clouds: [], particles: [],
        
        // Controlos (HOTAS = Hands On Throttle-And-Stick)
        hotas: {
            stick: { x: 0, y: 0, active: false, maxR: 70, baseX: 0, baseY: 0 },
            throttle: { val: 0.5, active: false, x: 0, y: 0, height: 150 },
            mfd: { x: 0, y: 0, r: 40, pressed: false } // Multi-Function Display (Tiro)
        },
        
        // Cinemática Inversa dos Braços
        arms: { left: { x:0, y:0, active:false }, right: { x:0, y:0, active:false } },
        
        lastVulcanTime: 0, lastMissileTime: 0, shake: 0, damageFlash: 0,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now();
            this.mission.targetsDestroyed = 0;
            this.ship = { hp: 100, speed: 300, targetSpeed: 300, altitude: 5000, heading: 0, pitch: 0, yaw: 0, roll: 0, worldX: 0, worldZ: 0 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.particles = [];
            
            // Gerar nuvens atmosféricas
            for (let i = 0; i < 40; i++) {
                this.clouds.push({
                    x: (Math.random() - 0.5) * 20000,
                    y: 4000 + Math.random() * 3000, // Acima do jogador
                    z: (Math.random() - 0.5) * 20000,
                    size: 800 + Math.random() * 1000
                });
            }

            AudioEngine.init(); AudioEngine.startJet();
            if(window.System && window.System.msg) window.System.msg("SISTEMAS ONLINE. DESTRUA 10 CAÇAS.");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- TRACKING & INPUT (MOVENET) ---
        processArmTracking: function(pose, w, h) {
            // Setup posições do Cockpit
            this.hotas.stick.baseX = w * 0.75; 
            this.hotas.stick.baseY = h * 0.85;
            this.hotas.throttle.x = w * 0.15;
            this.hotas.throttle.y = h * 0.70;
            this.hotas.mfd.x = w * 0.35; // Painel flutuante de armas
            this.hotas.mfd.y = h * 0.80;

            this.arms.left.active = false; this.arms.right.active = false;
            this.hotas.mfd.pressed = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');

                const mapX = (x) => (1 - (x / 640)) * w;
                const mapY = (y) => (y / 480) * h;

                // MÃO DIREITA -> JOYSTICK (CONTROLO DE VOO)
                if (rw && rw.score > 0.2) {
                    this.arms.right.active = true;
                    this.arms.right.x = mapX(rw.x); this.arms.right.y = mapY(rw.y);

                    let dx = this.arms.right.x - this.hotas.stick.baseX;
                    let dy = this.arms.right.y - this.hotas.stick.baseY;
                    let dist = Math.hypot(dx, dy);
                    
                    if (dist > this.hotas.stick.maxR) {
                        this.hotas.stick.x = this.hotas.stick.baseX + (dx / dist) * this.hotas.stick.maxR;
                        this.hotas.stick.y = this.hotas.stick.baseY + (dy / dist) * this.hotas.stick.maxR;
                    } else {
                        this.hotas.stick.x = this.arms.right.x; this.hotas.stick.y = this.arms.right.y;
                    }

                    // Dinâmica de Voo (Pitch e Roll baseados na posição do manche)
                    let normX = (this.hotas.stick.x - this.hotas.stick.baseX) / this.hotas.stick.maxR;
                    let normY = (this.hotas.stick.y - this.hotas.stick.baseY) / this.hotas.stick.maxR;

                    this.ship.roll += normX * 0.05; // Rolar o avião
                    this.ship.pitch += normY * 0.02; // Levantar/Baixar o nariz
                    this.ship.yaw -= normX * 0.01;   // Guiinada suave com o roll
                    
                    // Limites físicos
                    this.ship.pitch = Math.max(-Math.PI/3, Math.min(Math.PI/3, this.ship.pitch));
                    this.ship.roll = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.ship.roll));

                } else {
                    // Retorno ao centro suave
                    this.hotas.stick.x += (this.hotas.stick.baseX - this.hotas.stick.x) * 0.1;
                    this.hotas.stick.y += (this.hotas.stick.baseY - this.hotas.stick.y) * 0.1;
                    this.ship.roll *= 0.95; this.ship.pitch *= 0.98;
                }

                // MÃO ESQUERDA -> ACELERAÇÃO E ARMAS
                if (lw && lw.score > 0.2) {
                    this.arms.left.active = true;
                    this.arms.left.x = mapX(lw.x); this.arms.left.y = mapY(lw.y);

                    // 1. Controlar a Manete de Potência (Throttle) se a mão estiver no lado esquerdo
                    if (this.arms.left.x < w * 0.25) {
                        let throttlePct = 1 - ((this.arms.left.y - this.hotas.throttle.y) / this.hotas.throttle.height);
                        throttlePct = Math.max(0, Math.min(1, throttlePct));
                        this.hotas.throttle.val = throttlePct;
                        this.ship.targetSpeed = 200 + (throttlePct * 600); // 200 a 800 nós
                    }

                    // 2. Tocar no MFD Holográfico Central para disparar Metralhadora
                    if (Math.hypot(this.arms.left.x - this.hotas.mfd.x, this.arms.left.y - this.hotas.mfd.y) < this.hotas.mfd.r) {
                        this.hotas.mfd.pressed = true;
                        this.fireVulcan();
                    }
                    
                    // 3. Levantar a mão esquerda bem alto dispara míssil (Gesto Minority Report)
                    if (this.arms.left.y < h * 0.4) {
                        this.fireMissile();
                    }
                }
            } else {
                this.hotas.stick.x += (this.hotas.stick.baseX - this.hotas.stick.x) * 0.1;
                this.hotas.stick.y += (this.hotas.stick.baseY - this.hotas.stick.y) * 0.1;
                this.ship.roll *= 0.95; this.ship.pitch *= 0.98;
            }
        },

        fireVulcan: function() {
            const now = performance.now();
            if (now - this.lastVulcanTime > 80) { // Cadência alta
                this.lastVulcanTime = now;
                // Dispara do nariz do avião (centro inferior)
                this.bullets.push({ x: 0, y: 50, z: 0, vz: 4000, life: 2.0 });
                AudioEngine.fireVulcan();
                this.shake = 3;
            }
        },

        fireMissile: function() {
            const now = performance.now();
            if (now - this.lastMissileTime > 1500) { // Recarga do míssil
                this.lastMissileTime = now;
                // Procura um alvo à frente para "trancar" (Lock-on simples)
                let target = null;
                for(let e of this.entities) {
                    if(e.type === 'jet' && Math.abs(e.x - this.ship.worldX) < 1000) { target = e; break; }
                }
                this.missiles.push({ x: -100, y: 20, z: 0, vz: 1000, target: target, life: 5.0 });
                AudioEngine.fireMissile();
            }
        },

        // --- ATUALIZAÇÃO FÍSICA DO MUNDO ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.renderWorld(ctx, w, h); this.renderCockpit(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 60px 'Russo One'";
                if(this.state === 'VICTORY') {
                    ctx.fillStyle = "#2ecc71"; ctx.fillText("MISSÃO CUMPRIDA!", w/2, h/2);
                } else {
                    ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE ABATIDA", w/2, h/2);
                }
                return this.mission.targetsDestroyed * 100;
            }

            this.processArmTracking(pose, w, h);
            
            // Físicas da Aeronave
            this.ship.speed += (this.ship.targetSpeed - this.ship.speed) * dt;
            AudioEngine.updateThrottle(this.hotas.throttle.val);
            
            // Movimento pelo mundo
            let speedZ = this.ship.speed * dt * 20;
            this.ship.worldZ += speedZ * Math.cos(this.ship.yaw);
            this.ship.worldX += speedZ * Math.sin(this.ship.yaw);
            this.ship.altitude += this.ship.pitch * speedZ * 0.5; // Pitch altera a altitude
            this.ship.heading = (this.ship.yaw * 180 / Math.PI) % 360;

            // Spawner de Inimigos
            if (this.entities.length < 5 && Math.random() < 0.02) {
                this.entities.push({
                    type: 'jet', hp: 100,
                    x: this.ship.worldX + (Math.random() - 0.5) * 6000,
                    y: this.ship.altitude + (Math.random() - 0.5) * 2000,
                    z: this.ship.worldZ + 10000 + Math.random() * 5000,
                    vx: (Math.random() - 0.5) * 1000,
                    vz: -200 - Math.random() * 500, // Voam na nossa direção ou cruzam
                    rotZ: Math.random() > 0.5 ? 0.5 : -0.5
                });
            }

            // Atualizar Inimigos
            for (let i = this.entities.length - 1; i >= 0; i--) {
                let e = this.entities[i];
                e.x += e.vx * dt; e.z += e.vz * dt;
                
                // IA básica: Tentar virar de volta se fugirem muito
                if (e.x > this.ship.worldX + 4000) e.vx -= 500 * dt;
                if (e.x < this.ship.worldX - 4000) e.vx += 500 * dt;

                let relZ = e.z - this.ship.worldZ;
                if (relZ < -2000) { this.entities.splice(i, 1); continue; } // Passaram por nós

                // Inimigo atira
                if (Math.random() < 0.01 && relZ > 1000 && relZ < 5000 && Math.abs(e.x - this.ship.worldX) < 1000) {
                     this.bullets.push({ x: e.x - this.ship.worldX, y: e.y - this.ship.altitude, z: relZ, vz: -3000, isEnemy: true, life: 2.0 });
                }
            }

            // Atualizar Projéteis (Metralhadora)
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i];
                b.z += b.vz * dt; b.life -= dt;
                
                if (b.isEnemy) {
                    if (b.z < 100 && b.z > -100 && Math.abs(b.x) < 200 && Math.abs(b.y) < 200) {
                        this.ship.hp -= 10; this.damageFlash = 1.0; this.shake = 10;
                        if (this.ship.hp <= 0) this.endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    // Colisão com inimigos (Projétil amigo tem Z relativo à câmara)
                    for (let e of this.entities) {
                        let relZ = e.z - this.ship.worldZ; let relX = e.x - this.ship.worldX; let relY = e.y - this.ship.altitude;
                        if (Math.abs(b.z - relZ) < 400 && Math.abs(b.x - relX) < 300 && Math.abs(b.y - relY) < 300) {
                            e.hp -= 25; b.life = 0;
                            this.spawnParticles(relX, relY, relZ, '#f39c12', 5);
                            if (e.hp <= 0) this.destroyTarget(e, relX, relY, relZ);
                            break;
                        }
                    }
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }

            // Atualizar Mísseis
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i];
                m.vz += 1000 * dt; // Aceleração do míssil
                m.z += m.vz * dt; m.life -= dt;
                
                // Rasto de fumo
                if (Math.random() < 0.5) this.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: -m.vz*0.5, life: 0.5, c: 'rgba(200,200,200,0.5)', size: 50 });

                if (m.target) {
                    let relX = m.target.x - this.ship.worldX; let relY = m.target.y - this.ship.altitude; let relZ = m.target.z - this.ship.worldZ;
                    // Homing suave
                    m.x += (relX - m.x) * 5 * dt; m.y += (relY - m.y) * 5 * dt;
                    
                    if (Math.abs(m.z - relZ) < 500 && Math.abs(m.x - relX) < 400) {
                        m.target.hp -= 100; m.life = 0;
                        if (m.target.hp <= 0) this.destroyTarget(m.target, relX, relY, relZ);
                    }
                }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }

            // Atualizar Nuvens
            for (let c of this.clouds) {
                if (c.z - this.ship.worldZ < -5000) { c.z += 25000; c.x = this.ship.worldX + (Math.random()-0.5)*20000; }
            }

            // Atualizar Partículas (Explosões)
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            // Renderizar Frame
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
            this.spawnParticles(rx, ry, rz, '#e74c3c', 20);
            this.spawnParticles(rx, ry, rz, '#34495e', 10);
            this.entities = this.entities.filter(e => e !== target);
            this.mission.targetsDestroyed++;
            if (this.mission.targetsDestroyed >= this.mission.targetGoal) this.endGame('VICTORY');
        },

        endGame: function(result) {
            this.state = result; AudioEngine.stop();
            setTimeout(() => { 
                if(window.System.gameOver) window.System.gameOver(this.mission.targetsDestroyed * 100, result === 'VICTORY', this.mission.targetsDestroyed * 2); 
                else window.System.home(); 
            }, 4000);
        },

        spawnParticles: function(x, y, z, color, count) {
            for(let i=0; i<count; i++) {
                this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*1500, vy: (Math.random()-0.5)*1500, vz: (Math.random()-0.5)*1500, life: 1.0 + Math.random(), c: color, size: 20 + Math.random()*50 });
            }
        },

        // --- MOTOR DE RENDERIZAÇÃO 3D REALISTA ---
        renderWorld: function(ctx, w, h) {
            // 1. O Céu Dinâmico (Roda com o Roll do Avião)
            ctx.save();
            ctx.translate(w/2, h/2);
            ctx.rotate(this.ship.roll); // O mundo roda em sentido contrário ao roll

            // Pitch altera o centro do horizonte
            let horizonY = this.ship.pitch * 1000; 

            // Gradiente do Céu
            let skyGrad = ctx.createLinearGradient(0, -h, 0, horizonY);
            skyGrad.addColorStop(0, '#1e3c72'); // Azul escuro
            skyGrad.addColorStop(1, '#6dd5ed'); // Azul claro/Horizonte
            ctx.fillStyle = skyGrad;
            ctx.fillRect(-w, -h*2, w*2, horizonY + h*2); // Desenha o céu bem grande para cobrir rotações

            // Gradiente do Chão (Terra/Oceano)
            let groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
            groundGrad.addColorStop(0, '#5f6f59'); // Verde musgo distante (neblina)
            groundGrad.addColorStop(1, '#2c3e20'); // Verde escuro perto
            ctx.fillStyle = groundGrad;
            ctx.fillRect(-w, horizonY, w*2, h*2);

            // Linhas de Terreno (Velocidade e Perspetiva)
            ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2;
            ctx.beginPath();
            let zOffset = (this.ship.worldZ % 2000);
            for(let i=1; i<15; i++) {
                let pz = i * 2000 - zOffset;
                let scale = Math3D.fov / pz;
                let py = ((-this.ship.altitude) * scale) + horizonY;
                if(py > horizonY) { ctx.moveTo(-w, py); ctx.lineTo(w, py); }
            }
            ctx.stroke();

            ctx.restore(); // Fim do mundo afetado pelo horizonte global

            // 2. Elementos 3D em Perspetiva (Relativos à câmara)
            let drawables = [];
            
            // Nuvens
            this.clouds.forEach(c => {
                let relZ = c.z - this.ship.worldZ; let relX = c.x - this.ship.worldX; let relY = c.y - this.ship.altitude;
                drawables.push({ type: 'cloud', obj: c, x: relX, y: relY, z: relZ });
            });
            // Entidades
            this.entities.forEach(e => {
                let relZ = e.z - this.ship.worldZ; let relX = e.x - this.ship.worldX; let relY = e.y - this.ship.altitude;
                drawables.push({ type: 'jet', obj: e, x: relX, y: relY, z: relZ });
            });
            // Balas & Mísseis
            this.bullets.forEach(b => drawables.push({ type: 'bullet', obj: b, x: b.x, y: b.y, z: b.z }));
            this.missiles.forEach(m => drawables.push({ type: 'missile', obj: m, x: m.x, y: m.y, z: m.z }));
            this.particles.forEach(p => drawables.push({ type: 'particle', obj: p, x: p.x, y: p.y, z: p.z }));

            // Ordenar por Profundidade (Painter's Algorithm)
            drawables.sort((a, b) => b.z - a.z);

            // Rotação visual global para objetos (câmara)
            ctx.save();
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll); ctx.translate(-w/2, -h/2);

            drawables.forEach(d => {
                let p = Math3D.project(d.x, d.y, d.z, w, h, this.ship.pitch, 0); // Yaw já foi calculado no mundo
                if (!p.visible) return;

                if (d.type === 'cloud') {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.beginPath(); ctx.arc(p.x, p.y, d.obj.size * p.s, 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'jet') {
                    this.draw3DJet(ctx, p.x, p.y, 400 * p.s, d.obj.rotZ);
                    // Indicador UI do Inimigo (Caixa vermelha)
                    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 1;
                    ctx.strokeRect(p.x - 30, p.y - 30, 60, 60);
                }
                else if (d.type === 'bullet') {
                    ctx.fillStyle = d.obj.isEnemy ? '#ff0000' : '#f1c40f';
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, 15 * p.s), 0, Math.PI*2); ctx.fill();
                }
                else if (d.type === 'missile') {
                    ctx.fillStyle = '#ecf0f1';
                    ctx.fillRect(p.x - 10*p.s, p.y - 10*p.s, 20*p.s, 20*p.s);
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
            // Desenha um caça a jato estilizado (Formato Delta)
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
            // Sombras / Fuselagem Inferior
            ctx.fillStyle = '#555'; ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(s*0.4, -s*0.2); ctx.lineTo(-s*0.4, -s*0.2); ctx.fill();
            // Asas Principais
            ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(s*0.8, -s*0.5); ctx.lineTo(-s*0.8, -s*0.5); ctx.fill();
            // Leme (Cauda)
            ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.moveTo(0, -s*0.5); ctx.lineTo(s*0.1, -s*0.8); ctx.lineTo(-s*0.1, -s*0.8); ctx.fill();
            // Cockpit (Vidro)
            ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.moveTo(0, s*0.6); ctx.lineTo(s*0.1, s*0.2); ctx.lineTo(-s*0.1, s*0.2); ctx.fill();
            
            // Fogo do Motor
            ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.arc(0, -s*0.6, s*0.2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(0, -s*0.6, s*0.1, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // --- 1. HEAD UP DISPLAY (HUD MILITAR) ---
            ctx.save();
            ctx.translate(w/2, h/2);
            // O HUD Roda e Sobe/Desce com a aeronave
            ctx.rotate(this.ship.roll);
            let hudPitchY = this.ship.pitch * 500; 

            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2; ctx.font = "14px 'Chakra Petch'";

            // Pitch Ladder (Escada de inclinação)
            for (let i = -3; i <= 3; i++) {
                if(i === 0) continue;
                let py = hudPitchY + (i * 100);
                ctx.beginPath(); ctx.moveTo(-60, py); ctx.lineTo(-20, py); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(60, py); ctx.lineTo(20, py); ctx.stroke();
                ctx.fillText(Math.abs(i)*10, -80, py + 5);
                ctx.fillText(Math.abs(i)*10, 65, py + 5);
            }

            // Crosshair / Mira Central (Fixa na aeronave, logo não afetada pelo pitch, desenha antes do restore)
            ctx.restore(); 

            // HUD Estático no Vidro
            ctx.strokeStyle = '#00ff00'; ctx.fillStyle = '#00ff00'; ctx.lineWidth = 2;
            
            // Mira Central Fixa (Gun Cross)
            ctx.beginPath(); ctx.arc(w/2, h/2, 20, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            // Fitas de Informação (Tapes)
            ctx.font = "bold 18px 'Chakra Petch'"; ctx.textAlign = "left";
            ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, w*0.3, h/2);
            ctx.textAlign = "right";
            ctx.fillText(`ALT: ${Math.floor(this.ship.altitude)} FT`, w*0.7, h/2);
            ctx.textAlign = "center";
            ctx.fillText(`HDG: ${Math.floor(this.ship.heading)}°`, w/2, h*0.2);

            // Objetivo da Missão
            ctx.fillStyle = "#e67e22"; ctx.font = "bold 20px 'Russo One'";
            ctx.fillText(`ALVOS ABATIDOS: ${this.mission.targetsDestroyed} / ${this.mission.targetGoal}`, w/2, h*0.1);


            // --- 2. PAINÉIS FÍSICOS DO COCKPIT ---
            const panelY = h * 0.75;
            ctx.fillStyle = '#111314'; // Cinza muito escuro de avião militar
            
            // Desenho do tablier
            ctx.beginPath();
            ctx.moveTo(0, h); ctx.lineTo(0, panelY);
            ctx.lineTo(w*0.3, panelY - 50); ctx.lineTo(w*0.7, panelY - 50);
            ctx.lineTo(w, panelY); ctx.lineTo(w, h);
            ctx.closePath(); ctx.fill();
            
            ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.stroke(); // Borda do painel

            // Tela MFD Esquerda (Radar)
            ctx.fillStyle = '#051a05'; ctx.fillRect(w*0.2, panelY - 20, 150, 150);
            ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(w*0.2, panelY - 20, 150, 150);
            ctx.beginPath(); ctx.arc(w*0.2 + 75, panelY + 55, 60, 0, Math.PI*2); ctx.stroke();
            // Pontos no radar
            this.entities.forEach(e => {
                let rx = (e.x - this.ship.worldX) / 100; let rz = (e.z - this.ship.worldZ) / 100;
                if(Math.hypot(rx, rz) < 60) {
                    ctx.fillStyle = '#f00'; ctx.fillRect(w*0.2 + 75 + rx, panelY + 55 - rz, 4, 4);
                }
            });

            // Tela MFD Direita (Estado)
            ctx.fillStyle = '#0a0a2a'; ctx.fillRect(w - 350, panelY - 20, 150, 150);
            ctx.strokeStyle = '#00f'; ctx.lineWidth = 2; ctx.strokeRect(w - 350, panelY - 20, 150, 150);
            ctx.fillStyle = '#0bf'; ctx.font = "14px Arial"; ctx.textAlign = "left";
            ctx.fillText("SISTEMAS:", w - 340, panelY);
            ctx.fillText(`CASCO: ${this.ship.hp}%`, w - 340, panelY + 30);
            ctx.fillText(this.missiles.length < 2 ? "MSL: PRONTO" : "MSL: RELOAD", w - 340, panelY + 60);

            // --- 3. HARDWARE DE VOO (THROTTLE & STICK) ---
            
            // MANETE DE POTÊNCIA (Throttle - Lado Esquerdo)
            let tx = this.hotas.throttle.x; let ty = this.hotas.throttle.y; let th = this.hotas.throttle.height;
            // Calha da manete
            ctx.fillStyle = '#000'; ctx.fillRect(tx - 15, ty, 30, th);
            ctx.strokeStyle = '#444'; ctx.strokeRect(tx - 15, ty, 30, th);
            // Pega da manete (Move-se com o valor)
            let handleY = ty + (th * (1 - this.hotas.throttle.val));
            ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(tx, handleY, 25, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 3; ctx.stroke();

            // BOTÃO MFD FLUTUANTE / TÁTIL (Lado Esquerdo do Painel)
            const mfd = this.hotas.mfd;
            ctx.fillStyle = mfd.pressed ? 'rgba(255,0,0,0.5)' : 'rgba(255,0,0,0.2)';
            ctx.beginPath(); ctx.arc(mfd.x, mfd.y, mfd.r, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#f00'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 14px Arial"; ctx.fillText("FIRE", mfd.x, mfd.y + 5);

            // MANCHE (Joystick Central)
            const stick = this.hotas.stick;
            // Base de fole
            ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(stick.baseX, stick.baseY, 50, 20, 0, 0, Math.PI*2); ctx.fill();
            // Haste
            ctx.strokeStyle = '#555'; ctx.lineWidth = 18; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(stick.baseX, stick.baseY); ctx.lineTo(stick.x, stick.y); ctx.stroke();
            // Pega (HOTAS Stick Head)
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.arc(stick.x, stick.y, 30, 0, Math.PI*2); ctx.fill();
            // Botões no Manche
            ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(stick.x - 10, stick.y - 10, 5, 0, Math.PI*2); ctx.fill();
            
            // Destaque se a mão estiver agarrar
            if (this.arms.right.active) {
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(stick.x, stick.y, 35, 0, Math.PI*2); ctx.stroke();
            }
        },

        renderPilotArms: function(ctx, w, h) {
            // Fato de voo (Flight Suit Verde Tropa)
            const drawArm = (wristX, wristY, isRight) => {
                const shoulderX = isRight ? w * 0.9 : w * 0.1;
                const shoulderY = h + 150; // Ombro cá em baixo
                const elbowX = shoulderX + (wristX - shoulderX) * 0.5 + (isRight ? 120 : -120);
                const elbowY = shoulderY + (wristY - shoulderY) * 0.6 + 80;

                ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.5)';
                
                // Manga do Fato (Ombro -> Cotovelo)
                ctx.strokeStyle = '#4b5320'; // Verde Tropa Militar
                ctx.lineWidth = 60; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(elbowX, elbowY); ctx.stroke();

                // Manga do Fato (Cotovelo -> Pulso)
                ctx.lineWidth = 45;
                ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.stroke();

                // Luvas de Voo Nomex (Cinza escuro/Verde)
                ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.arc(wristX, wristY, 35, 0, Math.PI*2); ctx.fill();
                // Detalhe da Luva (Nós dos dedos)
                ctx.fillStyle = '#1a252f'; ctx.beginPath(); ctx.arc(wristX, wristY - 5, 20, 0, Math.PI*2); ctx.fill();
                
                ctx.shadowBlur = 0;
            };

            // Desenhar os braços se as mãos estiverem na câmara
            if (this.arms.right.active) drawArm(this.arms.right.x, this.arms.right.y, true);
            if (this.arms.left.active) drawArm(this.arms.left.x, this.arms.left.y, false);
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike AR', '🛩️', Game, {
                camera: 'user', // Câmara frontal para captar o piloto
                phases: [ { id: 'mission1', name: 'INTERCEÇÃO AÉREA', desc: 'Pilote o caça. Abata 10 alvos inimigos usando metralhadora e mísseis.', reqLvl: 1 } ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();