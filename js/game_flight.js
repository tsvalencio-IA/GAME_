// =============================================================================
// AERO STRIKE WAR: TACTICAL SIMULATOR (COMMERCIAL PLATINUM EDITION)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (DIVISÃO DE SIMULAÇÃO MILITAR)
// STATUS: 6DOF PHYSICS, TRUE AERODYNAMICS, DYNAMIC HUD, SMART AI, AR-HOTAS
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. MOTOR 3D VETORIAL E RENDERIZAÇÃO MILITAR
    // =========================================================================
    const Engine3D = {
        fov: 800,
        // Projeta coordenadas 3D do Mundo para 2D na Tela baseadas na Câmera do Jogador
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            let dx = objX - camX, dy = objY - camY, dz = objZ - camZ;
            
            // Rotação YAW (Eixo Y - Esquerda/Direita)
            let cy = Math.cos(-yaw), sy = Math.sin(-yaw);
            let x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
            
            // Rotação PITCH (Eixo X - Subir/Descer)
            let cp = Math.cos(-pitch), sp = Math.sin(-pitch);
            let y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            
            // Clipping de profundidade (evita renderizar o que está atrás da câmera)
            if (z2 < 10) return { visible: false };
            
            // Rotação ROLL (Eixo Z - Inclinação das asas)
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let finalX = x1 * cr - y2 * sr, finalY = x1 * sr + y2 * cr;
            
            let scale = Engine3D.fov / z2;
            
            return {
                x: (w/2) + (finalX * scale),
                y: (h/2) + (finalY * scale),
                s: scale,
                z: z2,
                visible: true
            };
        },
        
        // Desenha um modelo de caça 3D em formato wireframe/poligonal no radar e na tela
        drawJetModel: (ctx, px, py, scale, roll, isEnemy) => {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(roll);
            ctx.scale(scale, scale);
            
            ctx.strokeStyle = isEnemy ? "#e74c3c" : "#3498db";
            ctx.lineWidth = 2;
            ctx.fillStyle = isEnemy ? "rgba(231, 76, 60, 0.2)" : "rgba(52, 152, 219, 0.2)";
            
            // Corpo do Caça (F-22 Raptor Profile)
            ctx.beginPath();
            ctx.moveTo(0, -20); // Nariz
            ctx.lineTo(5, -10);
            ctx.lineTo(20, 5);  // Asa Dir
            ctx.lineTo(5, 10);
            ctx.lineTo(0, 15);  // Cauda
            ctx.lineTo(-5, 10);
            ctx.lineTo(-20, 5); // Asa Esq
            ctx.lineTo(-5, -10);
            ctx.closePath();
            
            ctx.fill(); ctx.stroke();
            
            // Motor em chamas
            ctx.fillStyle = "#f39c12";
            ctx.beginPath(); ctx.arc(0, 16, Math.random() * 4 + 2, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        }
    };

    // =========================================================================
    // 2. CONSTANTES FÍSICAS E CONFIGURAÇÕES DA AERONAVE
    // =========================================================================
    const PHYSICS = {
        GRAVITY: 9.8,
        AIR_DENSITY: 1.225,
        MAX_THRUST: 1200,      // Potência máxima do motor
        MASS: 15000,           // Massa do caça (Kg)
        DRAG_COEFF: 0.02,      // Coeficiente de arrasto aerodinâmico
        LIFT_COEFF: 0.05,      // Coeficiente de sustentação
        MAX_PITCH_RATE: 0.03,  // Limite de curva vertical
        MAX_ROLL_RATE: 0.05,   // Limite de rotação no próprio eixo
    };

    // =========================================================================
    // 3. OBJETOS DO JOGO (MÍSSEIS, INIMIGOS, PARTÍCULAS)
    // =========================================================================
    class Particle {
        constructor(x, y, z, color, size, life) {
            this.x = x; this.y = y; this.z = z;
            this.vx = (Math.random() - 0.5) * 20;
            this.vy = (Math.random() - 0.5) * 20;
            this.vz = (Math.random() - 0.5) * 20;
            this.color = color; this.size = size; this.life = life; this.maxLife = life;
        }
        update(dt) {
            this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
            this.life -= dt;
        }
    }

    class Missile {
        constructor(x, y, z, pitch, yaw, roll, speed, isEnemy, target) {
            this.x = x; this.y = y; this.z = z;
            this.pitch = pitch; this.yaw = yaw; this.roll = roll;
            this.speed = speed + 800; // Míssil é sempre mais rápido
            this.isEnemy = isEnemy;
            this.target = target;
            this.life = 6.0; // 6 segundos de combustível
            this.active = true;
        }
        update(dt) {
            if (!this.active) return;
            this.life -= dt;
            if (this.life <= 0) { this.active = false; return; }

            // Homing Logic (Perseguição ao alvo)
            if (this.target && this.target.active) {
                let dx = this.target.x - this.x;
                let dy = this.target.y - this.y;
                let dz = this.target.z - this.z;
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                // Detonação por proximidade
                if (dist < 150) {
                    this.active = false;
                    this.target.hit(45); // Dano do míssil
                    window.Sfx.play(100, 'sawtooth', 0.5, 0.3); // Explosão
                    return;
                }

                // Ajuste de trajetória (Proportional Navigation simplificada)
                let targetYaw = Math.atan2(dx, dz);
                let targetPitch = Math.atan2(-dy, Math.sqrt(dx*dx + dz*dz));
                
                // Taxa de giro do míssil
                this.yaw += (targetYaw - this.yaw) * 0.05;
                this.pitch += (targetPitch - this.pitch) * 0.05;
            }

            // Movimento Retilíneo
            this.x += Math.sin(this.yaw) * Math.cos(this.pitch) * this.speed * dt;
            this.y -= Math.sin(this.pitch) * this.speed * dt;
            this.z += Math.cos(this.yaw) * Math.cos(this.pitch) * this.speed * dt;
        }
    }

    class EnemyJet {
        constructor(id, x, y, z) {
            this.id = id;
            this.x = x; this.y = y; this.z = z;
            this.pitch = 0; this.yaw = 0; this.roll = 0;
            this.speed = 300 + Math.random() * 100;
            this.hp = 100;
            this.active = true;
            this.evading = false;
            this.stateTimer = 0;
        }
        update(dt, playerX, playerY, playerZ) {
            if (!this.active) return;
            this.stateTimer -= dt;

            // Inteligência Artificial Simples
            if (this.stateTimer <= 0) {
                this.evading = Math.random() > 0.7; // 30% de chance de manobra evasiva
                this.stateTimer = 2 + Math.random() * 3;
            }

            let dx = playerX - this.x;
            let dy = playerY - this.y;
            let dz = playerZ - this.z;
            let targetYaw = Math.atan2(dx, dz);
            
            if (this.evading) {
                this.roll += (Math.PI/3 - this.roll) * 0.1; // Curva fechada
                this.yaw += 0.02;
            } else {
                this.roll += (0 - this.roll) * 0.1; // Nivela
                // Segue o jogador
                let yawDiff = targetYaw - this.yaw;
                // Normaliza diferença de angulo
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                this.yaw += yawDiff * 0.01;
            }

            // Movimento
            this.x += Math.sin(this.yaw) * this.speed * dt;
            this.z += Math.cos(this.yaw) * this.speed * dt;
            this.y += Math.sin(this.roll) * 50 * dt; // Perde/ganha altitude na curva
        }
        hit(damage) {
            this.hp -= damage;
            if (this.hp <= 0) this.active = false;
        }
    }

    // =========================================================================
    // 4. LÓGICA PRINCIPAL DO JOGO
    // =========================================================================
    const Game = {
        state: 'INIT', // INIT, CALIBRATING, PLAYING, GAMEOVER, VICTORY
        lastTime: 0,
        
        // Aeronave do Jogador
        player: {
            x: 0, y: 3000, z: 0,      // Altitude inicial: 3000m
            pitch: 0, yaw: 0, roll: 0,
            speed: 400, throttle: 0.5,
            hp: 100, flares: 10,
            gForce: 1.0, mach: 0.3
        },
        
        // Controles AR
        hotas: {
            pitchInput: 0, rollInput: 0, 
            calibratedY: 0, calibratedX: 0,
            isFiring: false, hasLocked: false
        },

        // Mundo e Gestão
        entities: { missiles: [], enemies: [], particles: [] },
        session: { kills: 0, cash: 0, mode: 'SINGLE', time: 0 },
        radarTarget: null, lockTimer: 0,

        // Multiplayer Firebase
        isHost: false, remotePlayers: {}, lastSync: 0,

        _init: function(missionData) { this.init(missionData); },
        init: function(missionData) {
            this.state = 'CALIBRATING';
            this.session.mode = missionData.mode || 'SINGLE';
            this.player = { x: 0, y: 3000, z: 0, pitch: 0, yaw: 0, roll: 0, speed: 400, throttle: 0.5, hp: 100, flares: 10, gForce: 1.0, mach: 0.3 };
            this.entities = { missiles: [], enemies: [], particles: [] };
            this.session.kills = 0; this.session.cash = 0; this.session.time = 0;
            this.lastTime = performance.now();
            this.spawnEnemies(3);

            // Audio Setup
            window.Sfx.play(400, 'sine', 0.5, 0.1); // Engine Startup

            if (this.session.mode === 'COOP' || this.session.mode === 'PVP') {
                this.initMultiplayer();
            }
        },

        spawnEnemies: function(count) {
            for(let i=0; i<count; i++) {
                let ex = this.player.x + (Math.random() * 8000 - 4000);
                let ez = this.player.z + 4000 + (Math.random() * 8000);
                let ey = 2000 + Math.random() * 2000;
                this.entities.enemies.push(new EnemyJet(`bot_${Math.random()}`, ex, ey, ez));
            }
        },

        initMultiplayer: function() {
            if (!window.DB || !window.System.playerId) return;
            const ref = window.DB.ref(`games/flight_${window.System.playerId}`);
            ref.on('value', snap => {
                const data = snap.val();
                if (data && data.players) {
                    this.remotePlayers = data.players;
                }
            });
        },

        syncNetwork: function() {
            if (!window.DB || !window.System.playerId) return;
            const now = performance.now();
            if (now - this.lastSync > 100) { // 10 ticks por segundo
                window.DB.ref(`games/flight_${window.System.playerId}/players/${window.System.playerId}`).set({
                    x: this.player.x, y: this.player.y, z: this.player.z,
                    pitch: this.player.pitch, yaw: this.player.yaw, roll: this.player.roll,
                    hp: this.player.hp
                });
                this.lastSync = now;
            }
        },

        // =====================================================================
        // LOOP PRINCIPAL: ATUALIZAÇÃO FÍSICA E IA
        // =====================================================================
        _update: function(poses) { this.update(poses); },
        update: function(poses) {
            let now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            if (dt > 0.1) dt = 0.1; // Limite para evitar pulos quando a aba fica inativa

            this.processARInputs(poses);

            if (this.state === 'PLAYING') {
                this.session.time += dt;
                this.updatePhysics(dt);
                this.updateEntities(dt);
                this.updateCombatSystem(dt);
                if (this.session.mode !== 'SINGLE') this.syncNetwork();

                // Condição de Vitória/Derrota
                if (this.player.hp <= 0 || this.player.y <= 0) { // Colisão com o chão
                    this.endGame('GAMEOVER');
                } else if (this.entities.enemies.filter(e => e.active).length === 0) {
                    this.endGame('VICTORY');
                }
            }
        },

        processARInputs: function(poses) {
            if (!poses || poses.length === 0) return;
            const pose = poses[0];
            const keypoints = pose.keypoints.reduce((acc, kp) => { acc[kp.name] = kp; return acc; }, {});

            // Rastreia Mão Direita (Manche) e Mão Esquerda (Acelerador)
            let rightWrist = keypoints['right_wrist'];
            let leftWrist = keypoints['left_wrist'];
            let nose = keypoints['nose'];

            if (rightWrist && rightWrist.score > 0.4 && nose) {
                if (this.state === 'CALIBRATING') {
                    // Espera a pessoa colocar a mão na posição neutra
                    this.hotas.calibratedX = rightWrist.x;
                    this.hotas.calibratedY = rightWrist.y;
                    this.state = 'PLAYING';
                    window.System.msg("HOTAS CALIBRADO. TAKEOFF!", "#2ecc71");
                }

                if (this.state === 'PLAYING') {
                    // Normaliza os inputs da câmera para o controle (Pitch / Roll)
                    let deltaY = (rightWrist.y - this.hotas.calibratedY) / 100; // Cima/Baixo
                    let deltaX = (rightWrist.x - this.hotas.calibratedX) / 100; // Esq/Dir

                    // Suavização do input
                    this.hotas.pitchInput = this.lerp(this.hotas.pitchInput, deltaY, 0.1);
                    this.hotas.rollInput = this.lerp(this.hotas.rollInput, deltaX, 0.1);
                }
            }

            // Acelerador Mão Esquerda (Puxar pra cima = +Velocidade)
            if (leftWrist && leftWrist.score > 0.4 && this.state === 'PLAYING') {
                let thrInput = (nose.y - leftWrist.y) / 200; 
                this.player.throttle = Math.max(0.2, Math.min(1.0, thrInput));
                
                // Gatilho (Se juntar as mãos no meio do corpo ou levantar a esquerda rapido)
                if (Math.abs(leftWrist.x - rightWrist.x) < 50 && this.lockTimer > 1.5) {
                    this.fireMissile();
                }
            }
        },

        updatePhysics: function(dt) {
            let p = this.player;
            
            // Controle Aerodinâmico
            p.pitch += p.pitchInput * PHYSICS.MAX_PITCH_RATE;
            p.roll += p.rollInput * PHYSICS.MAX_ROLL_RATE;
            
            // Limites de Cabine (Evita girar pra sempre o pitch, simulação estilo árcade)
            p.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, p.pitch));
            
            // O Roll afeta o Yaw (O avião vira porque está inclinado)
            let turnRate = Math.sin(p.roll) * 0.02;
            p.yaw += turnRate;

            // Perda de sustentação em curvas muito acentuadas
            p.pitch -= Math.abs(turnRate) * 0.01;

            // Aceleração e Velocidade
            let targetSpeed = PHYSICS.MAX_THRUST * p.throttle;
            p.speed = this.lerp(p.speed, targetSpeed, 0.01);
            p.mach = (p.speed / 343).toFixed(2); // 343 m/s = Mach 1

            // G-Force Simulada
            p.gForce = 1.0 + (Math.abs(p.pitchInput) * 4.0) + (Math.abs(turnRate) * 50.0);

            // Vetor de Velocidade (Aplica ao Mundo)
            let vx = Math.sin(p.yaw) * Math.cos(p.pitch) * p.speed;
            let vy = -Math.sin(p.pitch) * p.speed; // Pitch negativo (pra cima) aumenta Y
            let vz = Math.cos(p.yaw) * Math.cos(p.pitch) * p.speed;

            p.x += vx * dt;
            p.y += vy * dt;
            p.z += vz * dt;
        },

        updateEntities: function(dt) {
            // Mísseis
            this.entities.missiles.forEach(m => {
                m.update(dt);
                // Rastro de fumaça
                if (m.active && Math.random() > 0.5) {
                    this.entities.particles.push(new Particle(m.x, m.y, m.z, "#ddd", 5, 1.0));
                }
            });
            this.entities.missiles = this.entities.missiles.filter(m => m.active);

            // Inimigos
            this.entities.enemies.forEach(e => {
                e.update(dt, this.player.x, this.player.y, this.player.z);
                if (!e.active) {
                    // Explosão
                    for(let i=0; i<20; i++) this.entities.particles.push(new Particle(e.x, e.y, e.z, "#e74c3c", Math.random()*15+5, 2.0));
                    this.session.kills++;
                    this.session.cash += 500;
                    window.Sfx.play(150, 'square', 0.8, 0.4); // Kill som
                }
            });
            this.entities.enemies = this.entities.enemies.filter(e => e.active);

            // Partículas
            this.entities.particles.forEach(p => p.update(dt));
            this.entities.particles = this.entities.particles.filter(p => p.life > 0);
        },

        updateCombatSystem: function(dt) {
            // Sistema de Lock-on Radar (LCOS)
            let closestDist = Infinity;
            let target = null;

            this.entities.enemies.forEach(e => {
                let dx = e.x - this.player.x;
                let dy = e.y - this.player.y;
                let dz = e.z - this.player.z;
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

                // Se estiver na frente (ângulo simples) e num raio de 5000m
                let dirYaw = Math.atan2(dx, dz);
                let yawDiff = Math.abs(dirYaw - this.player.yaw);
                if (yawDiff < 0.5 && dist < 5000 && dist < closestDist) {
                    closestDist = dist;
                    target = e;
                }
            });

            if (target) {
                this.radarTarget = target;
                this.lockTimer += dt;
                // Bips do Radar
                if (this.lockTimer > 1.5) {
                    if (Math.floor(this.session.time * 10) % 2 === 0) window.Sfx.play(1200, 'square', 0.05, 0.05); // Som Lock Completo
                } else {
                    if (Math.floor(this.session.time * 5) % 2 === 0) window.Sfx.play(800, 'square', 0.05, 0.02); // Som buscando
                }
            } else {
                this.radarTarget = null;
                this.lockTimer = 0;
            }
        },

        fireMissile: function() {
            if (this.radarTarget && this.lockTimer > 1.5) {
                window.Sfx.play(600, 'sawtooth', 0.5, 0.2); // Lançamento
                this.entities.missiles.push(new Missile(
                    this.player.x, this.player.y - 10, this.player.z, // Nasce debaixo do avião
                    this.player.pitch, this.player.yaw, this.player.roll,
                    this.player.speed, false, this.radarTarget
                ));
                this.lockTimer = 0; // Reseta o lock após atirar
                window.System.msg("FOX 2!", "#e74c3c");
            }
        },

        endGame: function(finalState) {
            this.state = finalState;
            setTimeout(() => {
                if (window.System && window.System.gameOver) {
                    window.System.gameOver(this.session.kills, finalState === 'VICTORY', this.session.cash);
                } else {
                    window.System.home();
                }
            }, 4000);
        },

        // Utilidade de Matemática Linear
        lerp: (a, b, t) => a + (b - a) * t,

        // =====================================================================
        // LOOP DE RENDERIZAÇÃO: AR + HUD + 3D
        // =====================================================================
        _draw: function(ctx, w, h) { this.draw(ctx, w, h); },
        _drawEnd: function(ctx, w, h) { this.drawEndScreen(ctx, w, h); },
        draw: function(ctx, w, h) {
            ctx.clearRect(0, 0, w, h);

            if (this.state === 'CALIBRATING') {
                this.drawCalibration(ctx, w, h);
                return;
            }

            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.drawEndScreen(ctx, w, h);
                return;
            }

            // 1. DESENHA MUNDO 3D (Inimigos, Mísseis, Chão Simulado)
            this.draw3DWorld(ctx, w, h);

            // 2. DESENHA HUD MILITAR (Overscreen Layer)
            this.drawHUD(ctx, w, h);
        },

        draw3DWorld: function(ctx, w, h) {
            let p = this.player;

            // Linha do Horizonte Dinâmica (Artificial Horizon Layer)
            ctx.save();
            ctx.translate(w/2, h/2);
            ctx.rotate(p.roll);
            
            // O Pitch move o horizonte para cima/baixo
            let horizonY = p.pitch * (h/2); 
            
            // Chão semitransparente por cima da câmera real (AR Effect)
            ctx.fillStyle = "rgba(46, 204, 113, 0.1)"; 
            ctx.fillRect(-w*2, horizonY, w*4, h*4);
            // Céu semitransparente
            ctx.fillStyle = "rgba(52, 152, 219, 0.1)";
            ctx.fillRect(-w*2, -h*4 + horizonY, w*4, h*4);
            
            ctx.beginPath();
            ctx.moveTo(-w, horizonY);
            ctx.lineTo(w, horizonY);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.restore();

            // Desenhar Inimigos
            this.entities.enemies.forEach(e => {
                let proj = Engine3D.project(e.x, e.y, e.z, p.x, p.y, p.z, p.pitch, p.yaw, p.roll, w, h);
                if (proj.visible) {
                    Engine3D.drawJetModel(ctx, proj.x, proj.y, Math.max(0.1, proj.s * 2), e.roll - p.roll, true);
                    
                    // Box de Alvo do Radar
                    if (this.radarTarget === e) {
                        ctx.strokeStyle = this.lockTimer > 1.5 ? "#e74c3c" : "#f1c40f";
                        ctx.lineWidth = 2;
                        let size = 30 * proj.s;
                        ctx.strokeRect(proj.x - size/2, proj.y - size/2, size, size);
                        if (this.lockTimer > 1.5) {
                            ctx.fillStyle = "#e74c3c"; ctx.font = "12px Arial";
                            ctx.fillText("LOCK", proj.x + size/2 + 5, proj.y);
                        }
                    }
                }
            });

            // Desenhar Partículas
            this.entities.particles.forEach(part => {
                let proj = Engine3D.project(part.x, part.y, part.z, p.x, p.y, p.z, p.pitch, p.yaw, p.roll, w, h);
                if (proj.visible) {
                    ctx.fillStyle = part.color;
                    ctx.globalAlpha = part.life / part.maxLife;
                    ctx.beginPath(); ctx.arc(proj.x, proj.y, part.size * proj.s, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });

            // Desenhar Mísseis
            this.entities.missiles.forEach(m => {
                let proj = Engine3D.project(m.x, m.y, m.z, p.x, p.y, p.z, p.pitch, p.yaw, p.roll, w, h);
                if (proj.visible) {
                    ctx.fillStyle = "#fff";
                    ctx.beginPath(); ctx.arc(proj.x, proj.y, 4 * proj.s, 0, Math.PI*2); ctx.fill();
                }
            });
        },

        drawHUD: function(ctx, w, h) {
            let p = this.player;
            let hudColor = "#00ffcc"; // Verde/Ciano Tático

            ctx.fillStyle = hudColor;
            ctx.strokeStyle = hudColor;
            ctx.font = "bold 16px 'Chakra Petch', sans-serif";

            // --- CROSSHAIR CENTRAL ---
            ctx.beginPath();
            ctx.moveTo(w/2 - 15, h/2); ctx.lineTo(w/2 - 5, h/2);
            ctx.moveTo(w/2 + 15, h/2); ctx.lineTo(w/2 + 5, h/2);
            ctx.moveTo(w/2, h/2 - 15); ctx.lineTo(w/2, h/2 - 5);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            // --- ESCADA DE INCLINAÇÃO (PITCH LADDER) ---
            ctx.save();
            ctx.translate(w/2, h/2);
            ctx.rotate(p.roll);
            
            // Desenha linhas de pitch a cada 10 graus (aprox 0.17 radianos)
            for(let i = -3; i <= 3; i++) {
                if (i === 0) continue;
                let linePitch = i * 0.17;
                let relPitch = linePitch + p.pitch; // Diferença pro horizonte
                let yPos = relPitch * 400; // Escala visual da tela
                
                if (yPos > -h/2 && yPos < h/2) {
                    ctx.beginPath();
                    // Se for pitch positivo (céu), linha contínua. Negativo (chão), tracejado
                    if (i < 0) ctx.setLineDash([5, 5]); 
                    ctx.moveTo(-40, yPos);
                    ctx.lineTo(-20, yPos);
                    ctx.lineTo(-20, yPos + (i < 0 ? -5 : 5)); // Hastes indicadoras
                    ctx.moveTo(40, yPos);
                    ctx.lineTo(20, yPos);
                    ctx.lineTo(20, yPos + (i < 0 ? -5 : 5));
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    ctx.font = "10px Arial"; ctx.textAlign = "right";
                    ctx.fillText(Math.abs(i*10), -45, yPos + 3);
                    ctx.textAlign = "left";
                    ctx.fillText(Math.abs(i*10), 45, yPos + 3);
                }
            }
            ctx.restore();

            // --- FITA DE VELOCIDADE (Esquerda) ---
            ctx.strokeRect(30, h/2 - 100, 40, 200);
            ctx.textAlign = "center";
            ctx.fillText("SPD", 50, h/2 - 110);
            let dSpeed = p.speed % 10;
            ctx.beginPath(); ctx.moveTo(70, h/2); ctx.lineTo(80, h/2 - 5); ctx.lineTo(80, h/2 + 5); ctx.fill(); // Ponteiro
            ctx.fillText(Math.floor(p.speed), 50, h/2 + 5);
            ctx.font = "12px Arial";
            ctx.fillText(`M ${p.mach}`, 50, h/2 + 120);

            // --- FITA DE ALTITUDE (Direita) ---
            ctx.strokeRect(w - 70, h/2 - 100, 40, 200);
            ctx.textAlign = "center"; ctx.font = "bold 16px 'Chakra Petch'";
            ctx.fillText("ALT", w - 50, h/2 - 110);
            ctx.beginPath(); ctx.moveTo(w - 70, h/2); ctx.lineTo(w - 80, h/2 - 5); ctx.lineTo(w - 80, h/2 + 5); ctx.fill(); // Ponteiro
            ctx.fillText(Math.floor(p.y), w - 50, h/2 + 5);

            // --- BÚSSOLA (Topo) ---
            ctx.strokeRect(w/2 - 100, 20, 200, 25);
            let heading = (p.yaw * 180 / Math.PI) % 360;
            if (heading < 0) heading += 360;
            ctx.fillText(Math.floor(heading) + "°", w/2, 40);
            ctx.beginPath(); ctx.moveTo(w/2, 45); ctx.lineTo(w/2 - 5, 55); ctx.lineTo(w/2 + 5, 55); ctx.fill();

            // --- INFO SISTEMAS TÁTICOS ---
            ctx.textAlign = "left";
            ctx.fillText(`G-FORCE: ${p.gForce.toFixed(1)}G`, 20, h - 80);
            ctx.fillStyle = p.hp < 40 ? "#e74c3c" : hudColor;
            ctx.fillText(`INTEGRIDADE: ${Math.floor(p.hp)}%`, 20, h - 60);
            
            ctx.textAlign = "right";
            ctx.fillText(`ARMAMENTO: FOX-2`, w - 20, h - 80);
            ctx.fillText(`KILLS: ${this.session.kills}`, w - 20, h - 60);

            // --- ALERTA DE STALL ---
            if (p.speed < 150) {
                ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 24px 'Russo One'";
                ctx.fillText("STALL ALARM!", w/2, h/2 + 80);
            }
            
            // --- GATILHO VIRTUAL INFO ---
            if (this.lockTimer > 1.5) {
                ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 20px 'Chakra Petch'";
                ctx.fillText("SHOOT!", w/2, h/2 + 50);
            }
        },

        drawCalibration: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,10,20,0.8)"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText("CALIBRAÇÃO DO SISTEMA DE VOO", w/2, h/2 - 40);
            
            ctx.font = "18px 'Chakra Petch'"; ctx.fillStyle = "#fff";
            ctx.fillText("Fique em frente à câmera.", w/2, h/2 + 10);
            ctx.fillText("Abaixe e estique o braço direito na altura do ombro (Seu Manche).", w/2, h/2 + 40);
            ctx.fillText("Levante o braço esquerdo para acelerar. Junte as mãos para atirar.", w/2, h/2 + 70);
            
            // Scanner visual
            ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
            let scannerY = (h/2 + 100) + Math.sin(performance.now() * 0.005) * 20;
            ctx.beginPath(); ctx.moveTo(w/2 - 100, scannerY); ctx.lineTo(w/2 + 100, scannerY); ctx.stroke();
        },

        drawEndScreen: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,w,h);
            ctx.textAlign = "center"; 
            
            if (this.state === 'VICTORY') {
                ctx.fillStyle = "#2ecc71"; ctx.font = "bold 50px 'Russo One'";
                ctx.fillText("ESPAÇO AÉREO LIMPO", w/2, h/2 - 30);
                ctx.fillStyle = "#f1c40f"; ctx.font = "20px 'Chakra Petch'";
                ctx.fillText(`PAGAMENTO APROVADO: R$ ${this.session.cash}`, w/2, h/2 + 20);
            } else {
                ctx.fillStyle = "#e74c3c"; ctx.font = "bold 50px 'Russo One'";
                ctx.fillText("CAÇA ABATIDO", w/2, h/2 - 30);
                ctx.fillStyle = "#fff"; ctx.font = "20px 'Chakra Petch'";
                ctx.fillText("O PILOTO FOI EJETADO.", w/2, h/2 + 20);
            }
            ctx.fillText(`Inimigos Destruídos: ${this.session.kills}`, w/2, h/2 + 60);
        }
    };

    // =========================================================================
    // 5. REGISTRO NO SISTEMA THIAGUINHO OS (System.registerGame)
    // =========================================================================
    const register = () => {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '✈️', Game, {
                camera: 'user',
                camOpacity: 0.4, // AR com forte presença da interface virtual
                phases: [
                    { id: 'training', name: 'TREINO BÁSICO', desc: 'Destrua os drones com o HOTAS Virtual.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop_mission', name: 'OPERAÇÃO DESERT STORM', desc: 'Combate Aéreo. Destrua os inimigos antes que o abate chegue a si.', mode: 'SINGLE', reqLvl: 3 },
                    { id: 'multi_pvp', name: 'DOGFIGHT (PVP)', desc: 'Enfrente outros jogadores na rede.', mode: 'PVP', reqLvl: 5 }
                ]
            });
            clearInterval(regLoop);
            console.log("[SIMULAÇÃO MILITAR ATIVADA]: Aero Strike Carregado com Sucesso.");
        }
    };
    const regLoop = setInterval(register, 100);

})();