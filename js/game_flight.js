// =============================================================================
// STAR WING AR: 4K COCKPIT SIMULATOR (ULTIMATE EDITION)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: 3D POLYGON ENGINE, TRUE COCKPIT, PHYSICAL JOYSTICK, ARM TRACKING
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. MOTOR 3D & MATEMÁTICA
    // -----------------------------------------------------------------
    const Math3D = {
        fov: 500,
        rotateX: (x, y, z, angle) => {
            let cos = Math.cos(angle), sin = Math.sin(angle);
            return { x: x, y: y * cos - z * sin, z: y * sin + z * cos };
        },
        rotateY: (x, y, z, angle) => {
            let cos = Math.cos(angle), sin = Math.sin(angle);
            return { x: x * cos + z * sin, y: y, z: -x * sin + z * cos };
        },
        rotateZ: (x, y, z, angle) => {
            let cos = Math.cos(angle), sin = Math.sin(angle);
            return { x: x * cos - y * sin, y: x * sin + y * cos, z: z };
        },
        project: (x, y, z, w, h) => {
            if (z < 10) return { visible: false }; // Atrás da câmara
            let scale = Math3D.fov / z;
            return {
                x: (x * scale) + (w / 2),
                y: (y * scale) + (h / 2),
                s: scale,
                visible: true
            };
        }
    };

    // -----------------------------------------------------------------
    // 2. SÍNTESE DE ÁUDIO 8-BIT/SCI-FI
    // -----------------------------------------------------------------
    const AudioEngine = {
        ctx: null, engineOsc: null, engineGain: null, initialized: false,
        init: function() {
            if (this.initialized) return;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.engineGain = this.ctx.createGain();
                this.engineGain.connect(this.ctx.destination);
                this.engineGain.gain.value = 0.05;
                this.initialized = true;
            } catch (e) {}
        },
        start: function() {
            if (!this.initialized || this.engineOsc) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            this.engineOsc = this.ctx.createOscillator();
            this.engineOsc.type = 'sawtooth';
            this.engineOsc.frequency.value = 80;
            this.engineOsc.connect(this.engineGain);
            this.engineOsc.start();
        },
        updateRPM: function(pitch, boost) {
            if (!this.engineOsc) return;
            let targetFreq = 80 + (Math.abs(pitch) * 20) + (boost ? 100 : 0);
            this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
            this.engineGain.gain.setTargetAtTime(boost ? 0.15 : 0.08, this.ctx.currentTime, 0.1);
        },
        shoot: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime;
            let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(1200, t); osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
            g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.15);
        },
        explode: function() {
            if (!this.initialized) return;
            let t = this.ctx.currentTime;
            let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(10, t + 0.6);
            g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.6);
        },
        stop: function() {
            if (this.engineOsc) { this.engineOsc.stop(); this.engineOsc.disconnect(); this.engineOsc = null; }
        }
    };

    // -----------------------------------------------------------------
    // 3. MOTOR DO JOGO E LÓGICA
    // -----------------------------------------------------------------
    const Game = {
        state: 'START', lastTime: 0, score: 0,
        
        // Estado do Jogador
        ship: { hp: 100, shield: 100, speed: 60, boost: 0, pitch: 0, yaw: 0, roll: 0 },
        camera: { x: 0, y: 0, z: 0 },
        
        // Elementos Físicos e Renderização
        entities: [], lasers: [], particles: [], terrain: [],
        
        // Tracking do Jogador
        pilotArms: {
            left: { x: 0, y: 0, active: false, action: null },
            right: { x: 0, y: 0, active: false }
        },
        
        // Painel e Joystick
        joystick: { 
            baseX: 0, baseY: 0, 
            stickX: 0, stickY: 0, 
            maxRadius: 80 
        },
        dashboard: {
            shootBtn: { x: 0, y: 0, r: 60, pressed: false },
            shieldBtn: { x: 0, y: 0, r: 50, pressed: false }
        },
        
        lastShoot: 0, shake: 0, flash: 0,

        init: function() {
            this.state = 'PLAYING'; this.lastTime = performance.now(); this.score = 0;
            this.ship = { hp: 100, shield: 100, speed: 100, boost: 100, pitch: 0, yaw: 0, roll: 0 };
            this.entities = []; this.lasers = []; this.particles = []; this.terrain = [];
            
            // Gerar Grelha de Terreno 3D
            for (let z = 0; z < 20; z++) {
                for (let x = -10; x < 10; x++) {
                    this.terrain.push({ x: x * 400, y: 800, z: z * 400 });
                }
            }

            AudioEngine.init(); AudioEngine.start();
            if(window.System && window.System.msg) window.System.msg("HYPER-DRIVE ENGAGED");
        },

        cleanup: function() { AudioEngine.stop(); },

        // --- TRACKING & INPUT (MOVENET) ---
        processArmTracking: function(pose, w, h) {
            // Posicionar Elementos Físicos do Cockpit
            this.joystick.baseX = w * 0.75; 
            this.joystick.baseY = h * 0.85;
            this.dashboard.shootBtn = { x: w * 0.20, y: h * 0.80, r: 60, pressed: false };
            this.dashboard.shieldBtn = { x: w * 0.35, y: h * 0.85, r: 40, pressed: false };

            this.pilotArms.left.active = false;
            this.pilotArms.right.active = false;

            if (pose && pose.keypoints) {
                const getKp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = getKp('right_wrist'); const lw = getKp('left_wrist');

                // Mapear posição da câmara para o ecrã
                const mapX = (x) => (1 - (x / 640)) * w;
                const mapY = (y) => (y / 480) * h;

                // Mão Direita -> Manche Físico
                if (rw && rw.score > 0.2) {
                    this.pilotArms.right.active = true;
                    this.pilotArms.right.x = mapX(rw.x);
                    this.pilotArms.right.y = mapY(rw.y);

                    // Puxar o manche para a mão, com limite de raio
                    let dx = this.pilotArms.right.x - this.joystick.baseX;
                    let dy = this.pilotArms.right.y - this.joystick.baseY;
                    let dist = Math.hypot(dx, dy);
                    
                    if (dist > this.joystick.maxRadius) {
                        this.joystick.stickX = this.joystick.baseX + (dx / dist) * this.joystick.maxRadius;
                        this.joystick.stickY = this.joystick.baseY + (dy / dist) * this.joystick.maxRadius;
                    } else {
                        this.joystick.stickX = this.pilotArms.right.x;
                        this.joystick.stickY = this.pilotArms.right.y;
                    }

                    // A inclinação do manche controla a nave
                    let normX = (this.joystick.stickX - this.joystick.baseX) / this.joystick.maxRadius;
                    let normY = (this.joystick.stickY - this.joystick.baseY) / this.joystick.maxRadius;

                    this.ship.yaw = normX * 0.05;     // Virar
                    this.ship.pitch = normY * 0.05;   // Subir/Descer
                    this.ship.roll = normX * 0.5;     // Rolar visualmente

                } else {
                    // Retorno automático do manche ao centro
                    this.joystick.stickX += (this.joystick.baseX - this.joystick.stickX) * 0.1;
                    this.joystick.stickY += (this.joystick.baseY - this.joystick.stickY) * 0.1;
                    this.ship.yaw *= 0.9; this.ship.pitch *= 0.9; this.ship.roll *= 0.9;
                }

                // Mão Esquerda -> Painel de Comandos
                if (lw && lw.score > 0.2) {
                    this.pilotArms.left.active = true;
                    this.pilotArms.left.x = mapX(lw.x);
                    this.pilotArms.left.y = mapY(lw.y);

                    // Deteção de toques holográficos
                    if (Math.hypot(this.pilotArms.left.x - this.dashboard.shootBtn.x, this.pilotArms.left.y - this.dashboard.shootBtn.y) < this.dashboard.shootBtn.r) {
                        this.dashboard.shootBtn.pressed = true;
                        this.fire();
                    }
                    if (Math.hypot(this.pilotArms.left.x - this.dashboard.shieldBtn.x, this.pilotArms.left.y - this.dashboard.shieldBtn.y) < this.dashboard.shieldBtn.r) {
                        this.dashboard.shieldBtn.pressed = true;
                    }
                }
            } else {
                this.ship.yaw *= 0.9; this.ship.pitch *= 0.9; this.ship.roll *= 0.9;
                this.joystick.stickX += (this.joystick.baseX - this.joystick.stickX) * 0.1;
                this.joystick.stickY += (this.joystick.baseY - this.joystick.stickY) * 0.1;
            }
        },

        fire: function() {
            const now = performance.now();
            if (now - this.lastShoot > 120) {
                this.lastShoot = now;
                // Dispara do centro/lados da câmara
                this.lasers.push({ x: -100, y: 100, z: 0, vx: 0, vy: 0, vz: 3000 });
                this.lasers.push({ x: 100, y: 100, z: 0, vx: 0, vy: 0, vz: 3000 });
                AudioEngine.shoot();
                this.shake = 5;
            }
        },

        // --- UPDATE FÍSICA ---
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;

            if (this.state === 'GAMEOVER') {
                this.renderWorld(ctx, w, h); this.renderCockpit(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0,0,w,h);
                ctx.fillStyle = "#ff003c"; ctx.textAlign = "center"; ctx.font = "bold 60px 'Russo One'";
                ctx.fillText("SISTEMAS CRÍTICOS!", w/2, h/2);
                return Math.floor(this.score);
            }

            this.processArmTracking(pose, w, h);
            
            let speed = this.dashboard.shieldBtn.pressed ? 200 : this.ship.speed; // Boost falso
            AudioEngine.updateRPM(this.ship.pitch, this.dashboard.shieldBtn.pressed);
            this.score += speed * dt * 0.1;

            // Mover Terreno (Grelha 3D infinita)
            this.terrain.forEach(t => {
                t.z -= speed * dt * 30;
                // Aplicar rotação da nave ao mundo
                t.x -= this.ship.yaw * speed * dt * 50;
                t.y -= this.ship.pitch * speed * dt * 50;
                
                if (t.z < 0) { t.z += 8000; t.x = (Math.random()-0.5)*8000; t.y = 800 + (Math.random()-0.5)*400; }
            });

            // Spawner de Inimigos (Polígonos)
            if (this.entities.length < 15 && Math.random() < 0.1) {
                this.entities.push({
                    type: Math.random() > 0.7 ? 'obstacle' : 'fighter',
                    x: (Math.random() - 0.5) * 6000, y: (Math.random() - 0.5) * 4000, z: 10000,
                    hp: 50, size: 200, rotZ: 0
                });
            }

            // Atualizar Entidades
            for (let i = this.entities.length - 1; i >= 0; i--) {
                let e = this.entities[i];
                e.z -= speed * dt * (e.type === 'fighter' ? 40 : 20);
                e.x -= this.ship.yaw * speed * dt * 50;
                e.y -= this.ship.pitch * speed * dt * 50;
                e.rotZ += dt;

                if (e.z < 100) {
                    if (Math.abs(e.x) < 400 && Math.abs(e.y) < 400) {
                        this.ship.hp -= 20; this.flash = 1.0; this.shake = 30; AudioEngine.explode();
                        if (this.ship.hp <= 0) this.triggerGameOver();
                    }
                    this.entities.splice(i, 1);
                }
            }

            // Atualizar Lasers e Colisões
            for (let i = this.lasers.length - 1; i >= 0; i--) {
                let l = this.lasers[i];
                l.z += l.vz * dt;
                l.x += this.ship.yaw * 1000 * dt; // Compensação da câmara
                l.y += this.ship.pitch * 1000 * dt;
                
                let hit = false;
                for (let j = this.entities.length - 1; j >= 0; j--) {
                    let e = this.entities[j];
                    if (Math.abs(l.z - e.z) < 500 && Math.abs(l.x - e.x) < e.size && Math.abs(l.y - e.y) < e.size) {
                        e.hp -= 30; hit = true;
                        if (e.hp <= 0) {
                            AudioEngine.explode(); this.score += 150;
                            this.spawnParticles(e.x, e.y, e.z, e.type === 'fighter' ? '#ff003c' : '#f1c40f', 15);
                            this.entities.splice(j, 1);
                        }
                        break;
                    }
                }
                if (hit || l.z > 10000) this.lasers.splice(i, 1);
            }

            // Atualizar Partículas
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                p.life -= dt * 2;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            // Renderizar Tudo
            ctx.save();
            if (this.shake > 0) { ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake); this.shake *= 0.9; }
            this.renderWorld(ctx, w, h);
            this.renderCockpit(ctx, w, h);
            this.renderPilotArms(ctx, w, h);
            if (this.flash > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${this.flash})`; ctx.fillRect(0,0,w,h); this.flash -= dt * 2; }
            ctx.restore();

            return Math.floor(this.score);
        },

        triggerGameOver: function() {
            this.state = 'GAMEOVER'; AudioEngine.stop();
            setTimeout(() => { if(window.System.gameOver) window.System.gameOver(this.score, true, Math.floor(this.score/50)); else window.System.home(); }, 3000);
        },

        spawnParticles: function(x, y, z, color, count) {
            for(let i=0; i<count; i++) {
                this.particles.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*2000, vy: (Math.random()-0.5)*2000, vz: (Math.random()-0.5)*2000, life: 1.0, c: color });
            }
        },

        // --- RENDERIZADORES 4K (Desenho Geométrico Avançado) ---
        renderWorld: function(ctx, w, h) {
            // Fundo Espacial com Gradiente Profundo
            let bgGrad = ctx.createLinearGradient(0, 0, 0, h);
            bgGrad.addColorStop(0, '#02000a'); bgGrad.addColorStop(1, '#0a0022');
            ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, w, h);

            // Rotação visual da câmara (Roll)
            ctx.translate(w/2, h/2); ctx.rotate(this.ship.roll); ctx.translate(-w/2, -h/2);

            // Desenhar Terreno (Grelha Tron/Synthwave)
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)'; ctx.lineWidth = 1.5;
            this.terrain.forEach(t => {
                let p = Math3D.project(t.x, t.y, t.z, w, h);
                if (p.visible) {
                    ctx.fillStyle = `rgba(0, 255, 255, ${p.s})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, 10 * p.s), 0, Math.PI*2); ctx.fill();
                }
            });

            // Preparar Lista Z-Buffer
            let drawables = [];
            this.entities.forEach(e => drawables.push({ type: e.type, obj: e, z: e.z }));
            this.lasers.forEach(l => drawables.push({ type: 'laser', obj: l, z: l.z }));
            this.particles.forEach(p => drawables.push({ type: 'particle', obj: p, z: p.z }));
            drawables.sort((a, b) => b.z - a.z);

            drawables.forEach(d => {
                let obj = d.obj;
                let p = Math3D.project(obj.x, obj.y, obj.z, w, h);
                if (!p.visible) return;

                if (d.type === 'fighter') {
                    this.draw3DShip(ctx, p.x, p.y, p.s * obj.size, obj.rotZ);
                } 
                else if (d.type === 'obstacle') {
                    this.draw3DAsteroid(ctx, p.x, p.y, p.s * obj.size, obj.rotZ);
                }
                else if (d.type === 'laser') {
                    ctx.fillStyle = '#00ffcc'; ctx.shadowBlur = 15; ctx.shadowColor = '#00ffcc';
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, 20*p.s), Math.max(2, 60*p.s), 0, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
                }
                else if (d.type === 'particle') {
                    ctx.globalAlpha = Math.max(0, obj.life);
                    ctx.fillStyle = obj.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, 30*p.s), 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });

            // Resetar Rotação para a UI
            ctx.translate(w/2, h/2); ctx.rotate(-this.ship.roll); ctx.translate(-w/2, -h/2);
        },

        draw3DShip: function(ctx, cx, cy, s, rot) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
            // Asa Direita
            ctx.fillStyle = '#8e44ad'; ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(s, s*0.5); ctx.lineTo(0, s); ctx.fill();
            // Asa Esquerda
            ctx.fillStyle = '#9b59b6'; ctx.beginPath(); ctx.moveTo(0, -s*0.2); ctx.lineTo(-s, s*0.5); ctx.lineTo(0, s); ctx.fill();
            // Corpo Central
            ctx.fillStyle = '#ff003c'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s*0.3, s*0.8); ctx.lineTo(-s*0.3, s*0.8); ctx.fill();
            // Motor Glore
            ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff'; ctx.fillStyle = '#00ffff';
            ctx.beginPath(); ctx.arc(0, s*0.8, s*0.2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        },

        draw3DAsteroid: function(ctx, cx, cy, s, rot) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
            ctx.fillStyle = '#34495e'; ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.5, -s); ctx.lineTo(s*0.8, -s*0.8); ctx.lineTo(s, 0); ctx.lineTo(s*0.6, s); ctx.lineTo(-s*0.5, s*0.8);
            ctx.closePath(); ctx.fill();
            // Textura/Luzes
            ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(-s*0.5, -s); ctx.lineTo(s*0.8, -s*0.8); ctx.lineTo(s*0.2, 0); ctx.fill();
            ctx.restore();
        },

        renderCockpit: function(ctx, w, h) {
            // Overlay do Vidro do Cockpit
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 10;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w*0.2, h*0.2); ctx.lineTo(w*0.8, h*0.2); ctx.lineTo(w, 0); ctx.stroke();

            // Painel Inferior
            const panelY = h * 0.7;
            let pGrad = ctx.createLinearGradient(0, panelY, 0, h);
            pGrad.addColorStop(0, '#0a0a10'); pGrad.addColorStop(1, '#020205');
            ctx.fillStyle = pGrad;
            ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, panelY + 50); ctx.lineTo(w*0.15, panelY); ctx.lineTo(w*0.85, panelY); ctx.lineTo(w, panelY + 50); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 4; ctx.stroke();

            // Ecrãs Holográficos do Dashboard
            const drawScreen = (sx, sy, sw, sh, color, title, val) => {
                ctx.fillStyle = `rgba(${color}, 0.1)`; ctx.fillRect(sx, sy, sw, sh);
                ctx.strokeStyle = `rgba(${color}, 0.5)`; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, sw, sh);
                ctx.fillStyle = `rgb(${color})`; ctx.font = "bold 14px 'Chakra Petch'"; ctx.fillText(title, sx + 10, sy + 20);
                ctx.font = "bold 24px 'Russo One'"; ctx.fillText(val, sx + 10, sy + 50);
            };

            drawScreen(w*0.05, panelY + 20, 150, 70, '0, 255, 100', 'INTEGRIDADE', `${Math.floor(this.ship.hp)}%`);
            drawScreen(w - 200, panelY + 20, 150, 70, '0, 200, 255', 'VELOCIDADE', `${Math.floor(this.score / 10)} k/s`);

            // Radar Central
            ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(w/2, panelY + 60, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#00ffcc'; ctx.beginPath(); ctx.arc(w/2, panelY + 60, 50, 0, Math.PI*2); ctx.stroke();
            // Blips do radar
            this.entities.forEach(e => {
                let rx = (e.x / 6000) * 45; let ry = -(e.z / 10000) * 45;
                ctx.fillStyle = e.type === 'fighter' ? '#ff003c' : '#f1c40f';
                ctx.beginPath(); ctx.arc(w/2 + rx, panelY + 60 + ry, 3, 0, Math.PI*2); ctx.fill();
            });

            // MANCHE FÍSICO 3D (Joystick)
            const joy = this.joystick;
            ctx.shadowBlur = 10; ctx.shadowColor = '#000';
            // Base Metálica
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(joy.baseX, joy.baseY, 60, 30, 0, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#444'; ctx.lineWidth = 5; ctx.stroke();
            
            // Haste
            ctx.lineWidth = 20; ctx.lineCap = 'round';
            let gradStick = ctx.createLinearGradient(joy.baseX, joy.baseY, joy.stickX, joy.stickY);
            gradStick.addColorStop(0, '#111'); gradStick.addColorStop(1, '#555');
            ctx.strokeStyle = gradStick;
            ctx.beginPath(); ctx.moveTo(joy.baseX, joy.baseY); ctx.lineTo(joy.stickX, joy.stickY); ctx.stroke();
            ctx.shadowBlur = 0;

            // Cabeça do Manche
            let knobGrad = ctx.createRadialGradient(joy.stickX - 10, joy.stickY - 10, 5, joy.stickX, joy.stickY, 35);
            knobGrad.addColorStop(0, '#fff'); knobGrad.addColorStop(0.3, '#e74c3c'); knobGrad.addColorStop(1, '#800000');
            ctx.fillStyle = knobGrad;
            ctx.beginPath(); ctx.arc(joy.stickX, joy.stickY, 35, 0, Math.PI*2); ctx.fill();
            // Anel Brilhante se Ativo
            if (this.pilotArms.right.active) {
                ctx.shadowBlur = 15; ctx.shadowColor = '#ff003c'; ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(joy.stickX, joy.stickY, 35, 0, Math.PI*2); ctx.stroke(); ctx.shadowBlur = 0;
            }

            // BOTÕES HOLOGRÁFICOS (Painel Esquerdo)
            const drawHoloBtn = (btn, icon, color) => {
                ctx.fillStyle = btn.pressed ? `rgba(${color}, 0.5)` : `rgba(${color}, 0.1)`;
                ctx.beginPath(); ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = `rgb(${color})`; ctx.lineWidth = btn.pressed ? 6 : 2;
                if (btn.pressed) { ctx.shadowBlur = 20; ctx.shadowColor = `rgb(${color})`; }
                ctx.stroke(); ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 24px Arial"; ctx.fillText(icon, btn.x, btn.y + 8);
            };
            drawHoloBtn(this.dashboard.shootBtn, "💥 ATIRAR", "255, 0, 60");
        },

        renderPilotArms: function(ctx, w, h) {
            // Renderiza o braço mecânico do fato espacial projetado até ao volante
            const drawArm = (wristX, wristY, isRight) => {
                const shoulderX = isRight ? w * 0.9 : w * 0.1;
                const shoulderY = h + 100; // Ombro fora do ecrã
                // Calcula um cotovelo falso (IK simples)
                const elbowX = shoulderX + (wristX - shoulderX) * 0.6 + (isRight ? 100 : -100);
                const elbowY = shoulderY + (wristY - shoulderY) * 0.6 + 50;

                ctx.shadowBlur = 10; ctx.shadowColor = '#000';
                
                // Segmento Ombro -> Cotovelo
                ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 45; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(elbowX, elbowY); ctx.stroke();
                // Detalhe laranja (Neon Suit)
                ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 15; ctx.stroke();

                // Segmento Cotovelo -> Pulso
                ctx.strokeStyle = '#34495e'; ctx.lineWidth = 35;
                ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(wristX, wristY); ctx.stroke();
                ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 10; ctx.stroke();

                // Junta do Cotovelo
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(elbowX, elbowY, 25, 0, Math.PI*2); ctx.fill();
                
                // Mão/Luva
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(wristX, wristY, 30, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = isRight ? '#e74c3c' : '#00ffcc'; ctx.beginPath(); ctx.arc(wristX, wristY, 15, 0, Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
            };

            if (this.pilotArms.right.active) drawArm(this.pilotArms.right.x, this.pilotArms.right.y, true);
            if (this.pilotArms.left.active) drawArm(this.pilotArms.left.x, this.pilotArms.left.y, false);
        }
    };

    // Registar no Sistema Principal
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Star Wing 4K', '🚀', Game, {
                camera: 'user', // Câmara frontal
                phases: [ { id: 'arcade', name: 'SOBREVIVÊNCIA 3D', desc: 'Pilote na cabine. A mão direita no Manche, a esquerda nos comandos!', reqLvl: 1 } ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();