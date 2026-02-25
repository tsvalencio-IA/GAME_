// =============================================================================
// STAR WING AR: GALAXY COMMANDER (COCKPIT FLIGHT SIMULATOR)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT & PARCEIRO DE PROGRAMAÇÃO
// STATUS: PSEUDO-3D ENGINE, HOLO-JOYSTICK, COMBATE ESPACIAL
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES DO MOTOR 3D E DO JOGO
    // -----------------------------------------------------------------
    const CONF = {
        FOV: 400,            // Campo de visão (profundidade)
        RENDER_DIST: 5000,   // Distância máxima de renderização no eixo Z
        BASE_SPEED: 40,      // Velocidade de voo
        BOOST_SPEED: 120,    // Velocidade com turbo
        MAX_ENEMIES: 10,     // Limite de inimigos no ecrã
        JOYSTICK_R: 80       // Tamanho do raio de controlo do manche
    };

    // -----------------------------------------------------------------
    // 2. SÍNTESE DE ÁUDIO (Sons estilo Sci-Fi)
    // -----------------------------------------------------------------
    const FlightAudio = {
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
        startEngine: function() {
            if (!this.initialized || this.engineOsc) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            this.engineOsc = this.ctx.createOscillator();
            this.engineOsc.type = 'sawtooth';
            this.engineOsc.frequency.value = 60;
            this.engineOsc.connect(this.engineGain);
            this.engineOsc.start();
        },
        updateEngine: function(speedRatio, isBoosting) {
            if (!this.engineOsc) return;
            const now = this.ctx.currentTime;
            this.engineOsc.frequency.setTargetAtTime(60 + (speedRatio * 100) + (isBoosting ? 100 : 0), now, 0.1);
            this.engineGain.gain.setTargetAtTime(isBoosting ? 0.15 : 0.05, now, 0.1);
        },
        stopEngine: function() {
            if (this.engineOsc) { this.engineOsc.stop(); this.engineOsc.disconnect(); this.engineOsc = null; }
        },
        playShoot: function() {
            if (!this.initialized) return;
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(880, t); osc.frequency.exponentialRampToValueAtTime(110, t + 0.2);
            g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.2);
        },
        playExplosion: function() {
            if (!this.initialized) return;
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, t); osc.frequency.exponentialRampToValueAtTime(10, t + 0.5);
            g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.5);
        }
    };

    // -----------------------------------------------------------------
    // 3. MOTOR DE JOGO (Lógica Principal)
    // -----------------------------------------------------------------
    const Game = {
        state: 'START',
        lastTime: 0,
        score: 0,
        
        // Dados da Nave (O Jogador)
        ship: {
            hp: 100, energy: 100,
            x: 0, y: 0,             // Posição visual no ecrã
            pitch: 0, yaw: 0, roll: 0, // Rotação da nave
            targetPitch: 0, targetYaw: 0,
            speed: CONF.BASE_SPEED,
            isBoosting: false,
            lastShootTime: 0
        },

        // Efeitos Visuais
        shake: 0,
        hitFlash: 0,
        
        // Entidades do Mundo 3D
        stars: [],
        entities: [], // Inimigos e Asteroides
        lasers: [],
        particles: [],

        // Controlos UI
        joystick: { x: 0, y: 0, active: false },
        buttons: {
            shoot: { x: 0, y: 0, r: 50, pressed: false },
            boost: { x: 0, y: 0, r: 50, pressed: false }
        },

        init: function(faseData) {
            this.state = 'PLAYING';
            this.lastTime = performance.now();
            this.score = 0;
            this.ship = { hp: 100, energy: 100, x: 0, y: 0, pitch: 0, yaw: 0, roll: 0, targetPitch: 0, targetYaw: 0, speed: CONF.BASE_SPEED, isBoosting: false, lastShootTime: 0 };
            this.entities = []; this.lasers = []; this.particles = []; this.stars = [];
            
            // Gerar estrelas para o fundo
            for(let i=0; i<200; i++) {
                this.stars.push({
                    x: (Math.random() - 0.5) * 4000,
                    y: (Math.random() - 0.5) * 4000,
                    z: Math.random() * CONF.RENDER_DIST
                });
            }

            FlightAudio.init();
            FlightAudio.startEngine();
            if (window.System && window.System.msg) window.System.msg("MÓDULO DE VOO ATIVADO");
            this.setupInput();
        },

        cleanup: function() {
            FlightAudio.stopEngine();
            if(window.System && window.System.canvas) {
                window.System.canvas.onpointerdown = null;
                window.System.canvas.onpointerup = null;
            }
        },

        setupInput: function() {
            const canvas = window.System.canvas;
            canvas.onpointerdown = (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left; const y = e.clientY - rect.top;
                
                // Verificar toques nos botões virtuais
                if (Math.hypot(x - this.buttons.shoot.x, y - this.buttons.shoot.y) < this.buttons.shoot.r) {
                    this.buttons.shoot.pressed = true; this.fireLaser();
                }
                if (Math.hypot(x - this.buttons.boost.x, y - this.buttons.boost.y) < this.buttons.boost.r) {
                    this.buttons.boost.pressed = true;
                }
            };
            canvas.onpointerup = () => {
                this.buttons.shoot.pressed = false;
                this.buttons.boost.pressed = false;
            };
        },

        // --- MATEMÁTICA 3D ---
        project3D: function(x, y, z, w, h) {
            if (z <= 0) return { visible: false };
            const scale = CONF.FOV / z;
            return {
                x: (x * scale) + (w / 2) + this.ship.x,
                y: (y * scale) + (h / 2) + this.ship.y,
                s: scale,
                visible: true
            };
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            if (dt > 0.1) dt = 0.016; // Prevenir saltos de frame
            this.lastTime = now;

            if (this.state === 'GAMEOVER') {
                this.renderGameOver(ctx, w, h);
                return Math.floor(this.score);
            }

            this.processAIInput(pose, w, h);
            this.updatePhysics(dt);
            this.spawner(dt);
            this.checkCollisions();

            ctx.save();
            if (this.shake > 0) {
                ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake);
                this.shake *= 0.9;
                if(this.shake < 0.5) this.shake = 0;
            }

            this.renderWorld(ctx, w, h);
            this.renderCockpit(ctx, w, h);
            ctx.restore();

            return Math.floor(this.score);
        },

        processAIInput: function(pose, w, h) {
            this.joystick.active = false;
            
            // Posição dos botões baseada no tamanho do ecrã
            this.buttons.shoot.x = w * 0.15; this.buttons.shoot.y = h * 0.85;
            this.buttons.boost.x = w * 0.85; this.buttons.boost.y = h * 0.85;
            const joyCenterX = w / 2; const joyCenterY = h * 0.85;

            if (pose && pose.keypoints) {
                const rightWrist = pose.keypoints.find(k => k.name === 'right_wrist');
                const leftWrist = pose.keypoints.find(k => k.name === 'left_wrist');
                const nose = pose.keypoints.find(k => k.name === 'nose');

                // Lógica da Mão Direita -> Manche Holográfico
                if (rightWrist && rightWrist.score > 0.3) {
                    this.joystick.active = true;
                    // Mapear posição da câmara para o ecrã (Inverter X por causa do espelho)
                    const handX = (1 - (rightWrist.x / 640)) * w;
                    const handY = (rightWrist.y / 480) * h;
                    
                    this.joystick.x = handX; this.joystick.y = handY;

                    // Calcular desvio em relação ao centro do ecrã para rodar a nave
                    let normX = (handX - w/2) / (w/2);
                    let normY = (handY - h/2) / (h/2);
                    
                    // Limitar os valores
                    normX = Math.max(-1, Math.min(1, normX));
                    normY = Math.max(-1, Math.min(1, normY));

                    this.ship.targetYaw = normX * 40;   // A nave vira para os lados
                    this.ship.targetPitch = normY * 30; // A nave sobe e desce
                } else {
                    this.ship.targetYaw = 0; this.ship.targetPitch = 0;
                }

                // Lógica da Mão Esquerda -> Atirar (Levantar a mão acima do nariz)
                if (leftWrist && nose && leftWrist.score > 0.3 && nose.score > 0.5) {
                    if (leftWrist.y < nose.y) {
                        this.buttons.shoot.pressed = true;
                        this.fireLaser();
                    } else {
                        if (!window.System.canvas.matches(':active')) this.buttons.shoot.pressed = false;
                    }
                }
            } else {
                this.ship.targetYaw = 0; this.ship.targetPitch = 0;
            }
        },

        fireLaser: function() {
            const now = performance.now();
            if (now - this.ship.lastShootTime > 150) { // Cadência de tiro
                this.ship.lastShootTime = now;
                // Dispara dois lasers das pontas das asas
                this.lasers.push({ x: -150, y: 50, z: 0, vz: 1500 });
                this.lasers.push({ x: 150, y: 50, z: 0, vz: 1500 });
                FlightAudio.playShoot();
                this.shake = 2; // Pequeno coice
            }
        },

        updatePhysics: function(dt) {
            // Suavizar movimento da nave
            this.ship.yaw += (this.ship.targetYaw - this.ship.yaw) * 5 * dt;
            this.ship.pitch += (this.ship.targetPitch - this.ship.pitch) * 5 * dt;
            this.ship.roll = -this.ship.yaw * 0.8; // Efeito de rolagem ao virar

            // Efeito visual do ecrã a inclinar
            this.ship.x = -this.ship.yaw * 10;
            this.ship.y = -this.ship.pitch * 10;

            // Lógica do Turbo
            if (this.buttons.boost.pressed && this.ship.energy > 0) {
                this.ship.isBoosting = true;
                this.ship.speed = CONF.BOOST_SPEED;
                this.ship.energy -= 20 * dt;
                CONF.FOV = 400 + (Math.random() * 20); // Efeito de velocidade no FOV
            } else {
                this.ship.isBoosting = false;
                this.ship.speed = CONF.BASE_SPEED;
                this.ship.energy = Math.min(100, this.ship.energy + 10 * dt);
                CONF.FOV = 400;
            }

            FlightAudio.updateEngine(this.ship.speed / CONF.BOOST_SPEED, this.ship.isBoosting);
            this.score += (this.ship.speed * dt * 0.5);

            // Mover mundo para trás (ilusão de voo)
            const speedZ = this.ship.speed * dt * 60;

            // Estrelas
            this.stars.forEach(s => {
                s.z -= speedZ * 2;
                if (s.z <= 0) { s.z = CONF.RENDER_DIST; s.x = (Math.random() - 0.5) * 4000; s.y = (Math.random() - 0.5) * 4000; }
            });

            // Lasers (movem-se para a frente no eixo Z)
            for (let i = this.lasers.length - 1; i >= 0; i--) {
                let l = this.lasers[i];
                l.z += l.vz * dt;
                // O laser acompanha a mira para onde atiramos
                l.x += this.ship.yaw * dt * 20;
                l.y += this.ship.pitch * dt * 20;
                if (l.z > CONF.RENDER_DIST) this.lasers.splice(i, 1);
            }

            // Inimigos e Asteroides
            for (let i = this.entities.length - 1; i >= 0; i--) {
                let e = this.entities[i];
                e.z -= speedZ;
                
                // IA básica dos inimigos: mover-se ligeiramente na direção do jogador
                if (e.type === 'ship') {
                    e.x += (0 - e.x) * 0.5 * dt;
                    e.y += (0 - e.y) * 0.5 * dt;
                }

                if (e.z <= 0) {
                    // Passou por nós, se for perto damos dano!
                    if (Math.abs(e.x) < 300 && Math.abs(e.y) < 300) {
                        this.ship.hp -= 15;
                        this.hitFlash = 1.0;
                        this.shake = 20;
                        FlightAudio.playExplosion();
                        if (window.System && window.System.msg) window.System.msg("IMPACTO!");
                        if (this.ship.hp <= 0) this.gameOver();
                    }
                    this.entities.splice(i, 1);
                }
            }

            // Partículas
            for (let i = this.particles.length - 1; i >= 0; i--) {
                let p = this.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                p.life -= dt * 2;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        },

        spawner: function(dt) {
            if (this.entities.length < CONF.MAX_ENEMIES && Math.random() < 0.05) {
                const isEnemy = Math.random() > 0.5;
                this.entities.push({
                    type: isEnemy ? 'ship' : 'asteroid',
                    x: (Math.random() - 0.5) * 3000,
                    y: (Math.random() - 0.5) * 3000,
                    z: CONF.RENDER_DIST,
                    hp: isEnemy ? 20 : 50,
                    size: isEnemy ? 100 : 150 + Math.random() * 100,
                    rot: Math.random() * Math.PI * 2
                });
            }
        },

        checkCollisions: function() {
            for (let i = this.lasers.length - 1; i >= 0; i--) {
                let l = this.lasers[i];
                let hit = false;

                for (let j = this.entities.length - 1; j >= 0; j--) {
                    let e = this.entities[j];
                    // Colisão 3D básica
                    if (Math.abs(l.z - e.z) < 200 && Math.abs(l.x - e.x) < e.size && Math.abs(l.y - e.y) < e.size) {
                        e.hp -= 25;
                        hit = true;
                        
                        // Faiscas do impacto
                        for(let k=0; k<5; k++) {
                            this.particles.push({
                                x: e.x, y: e.y, z: e.z,
                                vx: (Math.random()-0.5)*500, vy: (Math.random()-0.5)*500, vz: -500,
                                life: 1, color: '#f1c40f'
                            });
                        }

                        if (e.hp <= 0) {
                            FlightAudio.playExplosion();
                            this.score += (e.type === 'ship' ? 100 : 50);
                            
                            // Explosão Grande
                            for(let k=0; k<20; k++) {
                                this.particles.push({
                                    x: e.x, y: e.y, z: e.z,
                                    vx: (Math.random()-0.5)*1000, vy: (Math.random()-0.5)*1000, vz: (Math.random()-0.5)*1000,
                                    life: 1.5, color: e.type === 'ship' ? '#e74c3c' : '#95a5a6'
                                });
                            }
                            this.entities.splice(j, 1);
                        }
                        break; // Um laser acerta apenas num alvo
                    }
                }
                if (hit) this.lasers.splice(i, 1);
            }
        },

        // --- RENDERIZAÇÃO GRÁFICA ---
        renderWorld: function(ctx, w, h) {
            // Fundo / Espaço
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, w, h);

            // Rotação Global do Ecrã (Roll)
            ctx.translate(w/2, h/2);
            ctx.rotate(this.ship.roll * Math.PI / 180);
            ctx.translate(-w/2, -h/2);

            // Grelha de Movimento (Estilo Synthwave/Retro 3D)
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const gridY = 1000; // Posição do chão
            for (let i = -5; i <= 5; i++) {
                let p1 = this.project3D(i * 400, gridY, 100, w, h);
                let p2 = this.project3D(i * 400, gridY, CONF.RENDER_DIST, w, h);
                if (p1.visible && p2.visible) {
                    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                }
            }
            // Linhas horizontais da grelha que se movem
            let zOffset = (this.score % 100) * 10;
            for (let i = 0; i < 20; i++) {
                let zPos = i * 250 - zOffset;
                if (zPos > 0) {
                    let p1 = this.project3D(-2000, gridY, zPos, w, h);
                    let p2 = this.project3D(2000, gridY, zPos, w, h);
                    if (p1.visible && p2.visible) {
                        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                    }
                }
            }
            ctx.stroke();

            // Estrelas
            ctx.fillStyle = '#ffffff';
            this.stars.forEach(s => {
                let p = this.project3D(s.x, s.y, s.z, w, h);
                if (p.visible) {
                    ctx.globalAlpha = p.s * 1.5;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.s * 15), 0, Math.PI*2); ctx.fill();
                }
            });
            ctx.globalAlpha = 1.0;

            // Ordenar Entidades e Partículas por Z (Para desenhar as de trás primeiro)
            let drawables = [];
            this.entities.forEach(e => drawables.push({ type: 'entity', obj: e, z: e.z }));
            this.lasers.forEach(l => drawables.push({ type: 'laser', obj: l, z: l.z }));
            this.particles.forEach(p => drawables.push({ type: 'particle', obj: p, z: p.z }));
            
            drawables.sort((a, b) => b.z - a.z);

            drawables.forEach(d => {
                if (d.z <= 0) return;
                const p = this.project3D(d.obj.x, d.obj.y, d.obj.z, w, h);
                if (!p.visible) return;

                if (d.type === 'entity') {
                    const e = d.obj;
                    const size = e.size * p.s;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(e.rot + (this.score * 0.01));
                    
                    if (e.type === 'asteroid') {
                        ctx.fillStyle = '#7f8c8d';
                        ctx.beginPath();
                        ctx.moveTo(-size, 0); ctx.lineTo(-size*0.5, -size);
                        ctx.lineTo(size*0.8, -size*0.8); ctx.lineTo(size, 0);
                        ctx.lineTo(size*0.5, size); ctx.lineTo(-size*0.5, size*0.8);
                        ctx.closePath(); ctx.fill();
                        // Detalhes sombra
                        ctx.fillStyle = 'rgba(0,0,0,0.4)';
                        ctx.beginPath(); ctx.arc(-size*0.2, -size*0.2, size*0.3, 0, Math.PI); ctx.fill();
                    } 
                    else if (e.type === 'ship') {
                        // Nave Inimiga (Triângulo ameaçador)
                        ctx.fillStyle = '#c0392b';
                        ctx.shadowBlur = 15 * p.s; ctx.shadowColor = '#ff0000';
                        ctx.beginPath();
                        ctx.moveTo(0, size);      // Bico apontado para o jogador
                        ctx.lineTo(size, -size);
                        ctx.lineTo(0, -size*0.5);
                        ctx.lineTo(-size, -size);
                        ctx.closePath(); ctx.fill();
                        ctx.shadowBlur = 0;
                    }
                    ctx.restore();
                } 
                else if (d.type === 'laser') {
                    ctx.fillStyle = '#00ffff';
                    ctx.shadowBlur = 20 * p.s; ctx.shadowColor = '#00ffff';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(2, 20 * p.s), 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                else if (d.type === 'particle') {
                    ctx.globalAlpha = Math.max(0, d.obj.life);
                    ctx.fillStyle = d.obj.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(1, 15 * p.s), 0, Math.PI*2);
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });

            // Flash de Dano
            if (this.hitFlash > 0) {
                ctx.fillStyle = `rgba(255, 0, 0, ${this.hitFlash * 0.5})`;
                ctx.fillRect(-w, -h, w*3, h*3);
                this.hitFlash -= 0.05;
            }

            // Desfazer Roll global para renderizar o UI estático
            ctx.translate(w/2, h/2);
            ctx.rotate(-this.ship.roll * Math.PI / 180);
            ctx.translate(-w/2, -h/2);
        },

        renderCockpit: function(ctx, w, h) {
            // Mira no centro do ecrã
            const cx = w / 2; const cy = h / 2 - 50;
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx - 40, cy); ctx.lineTo(cx + 40, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy - 40); ctx.lineTo(cx, cy + 40); ctx.stroke();

            // Painel Inferior (Cockpit Interior)
            const panelY = h * 0.75;
            const grad = ctx.createLinearGradient(0, panelY, 0, h);
            grad.addColorStop(0, 'rgba(15, 20, 30, 0.9)');
            grad.addColorStop(1, 'rgba(5, 10, 15, 1)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, h); ctx.lineTo(0, panelY + 50);
            ctx.lineTo(w*0.2, panelY); ctx.lineTo(w*0.8, panelY);
            ctx.lineTo(w, panelY + 50); ctx.lineTo(w, h);
            ctx.closePath(); ctx.fill();
            
            ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3; ctx.stroke();

            // HUD do Piloto
            ctx.fillStyle = '#00ffcc'; ctx.font = "bold 20px 'Chakra Petch', Arial"; ctx.textAlign = "left";
            ctx.fillText(`INTEGRIDADE: ${Math.floor(this.ship.hp)}%`, 20, panelY + 40);
            
            // Barra de HP
            ctx.fillStyle = 'rgba(255,0,0,0.3)'; ctx.fillRect(20, panelY + 50, 200, 15);
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c';
            ctx.fillRect(20, panelY + 50, this.ship.hp * 2, 15);

            ctx.textAlign = "right";
            ctx.fillText(`ENERGIA TURBO: ${Math.floor(this.ship.energy)}%`, w - 20, panelY + 40);
            // Barra de Energia
            ctx.fillStyle = 'rgba(0,100,255,0.3)'; ctx.fillRect(w - 220, panelY + 50, 200, 15);
            ctx.fillStyle = '#3498db'; ctx.fillRect(w - 20 - (this.ship.energy*2), panelY + 50, this.ship.energy * 2, 15);

            ctx.textAlign = "center"; ctx.fillStyle = "#f1c40f"; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText(`SCORE: ${Math.floor(this.score)}`, cx, panelY + 45);

            // Botões Virtuais (Atirar e Turbo)
            const drawBtn = (btn, label, color) => {
                ctx.fillStyle = btn.pressed ? color : 'rgba(0,0,0,0.5)';
                ctx.beginPath(); ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
                ctx.fillStyle = btn.pressed ? '#fff' : color; ctx.font = "bold 18px Arial"; ctx.fillText(label, btn.x, btn.y + 6);
            };
            drawBtn(this.buttons.shoot, "ATIRAR", "#e74c3c");
            drawBtn(this.buttons.boost, "TURBO", "#3498db");

            // Joystick Holográfico Controlado por IA (MoveNet)
            const joyCenterX = w / 2; const joyCenterY = h * 0.85;
            
            ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
            ctx.beginPath(); ctx.arc(joyCenterX, joyCenterY, CONF.JOYSTICK_R, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)'; ctx.lineWidth = 2; ctx.stroke();

            // Posição do manche dependente da câmara/mão
            let stickX = joyCenterX; let stickY = joyCenterY;
            if (this.joystick.active) {
                // Limitar o desenho visual do manche ao círculo base
                let dx = this.joystick.x - joyCenterX;
                let dy = this.joystick.y - joyCenterY;
                let dist = Math.hypot(dx, dy);
                if (dist > CONF.JOYSTICK_R) {
                    stickX = joyCenterX + (dx / dist) * CONF.JOYSTICK_R;
                    stickY = joyCenterY + (dy / dist) * CONF.JOYSTICK_R;
                } else {
                    stickX = this.joystick.x;
                    stickY = this.joystick.y;
                }
            } else {
                // Retorna ao centro se não houver mão
                ctx.fillStyle = '#fff'; ctx.font = "12px Arial";
                ctx.fillText("APONTE A MÃO PARA GUIAR", joyCenterX, joyCenterY - CONF.JOYSTICK_R - 10);
            }

            // Haste do manche
            ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 15; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(joyCenterX, h); ctx.lineTo(stickX, stickY); ctx.stroke();
            
            // Cabeça do manche brilhante
            ctx.fillStyle = this.joystick.active ? '#00ffff' : '#555555';
            ctx.shadowBlur = this.joystick.active ? 20 : 0; ctx.shadowColor = '#00ffff';
            ctx.beginPath(); ctx.arc(stickX, stickY, 25, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
        },

        renderGameOver: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 60px 'Russo One'";
            ctx.fillText("NAVE DESTRUÍDA", w/2, h/2 - 20);
            ctx.fillStyle = "#f1c40f"; ctx.font = "bold 30px Arial";
            ctx.fillText(`SCORE FINAL: ${Math.floor(this.score)}`, w/2, h/2 + 40);
        },

        gameOver: function() {
            this.state = 'GAMEOVER';
            FlightAudio.stopEngine();
            setTimeout(() => {
                if (window.System && window.System.gameOver) {
                    window.System.gameOver(this.score, true, Math.floor(this.score / 100)); // Win=true só pra dar recompensa, converte score em moedas
                } else {
                    window.System.home();
                }
            }, 3000);
        }
    };

    // Registar o jogo no Sistema Principal do ThIAguinho OS
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Star Wing AR', '🚀', Game, {
                camera: 'user', // Usar a câmara frontal para ver o jogador
                phases: [
                    { id: 'arcade', name: 'SOBREVIVÊNCIA', desc: 'Pilote pelo espaço e destrua asteroides!', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();