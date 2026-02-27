// =============================================================================
// AERO STRIKE WAR: TACTICAL SIMULATOR (COMMERCIAL PLATINUM EDITION - FINAL STABLE)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (DIVISÃO DE SIMULAÇÃO MILITAR)
// STATUS: SILENT-CRASH FIXED, ROBUST MOVENET TRACKING, STRICT CORE.JS MAPPING
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. MOTOR 3D VETORIAL E RENDERIZAÇÃO MILITAR
    // =========================================================================
    const Engine3D = {
        fov: 800,
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            let dx = objX - camX;
            let dy = camY - objY; // Y Invertido para o Canvas
            let dz = objZ - camZ;
            
            // Rotação YAW (Esquerda/Direita)
            let cy = Math.cos(-yaw), sy = Math.sin(-yaw);
            let x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
            
            // Rotação PITCH (Subir/Descer)
            let cp = Math.cos(-pitch), sp = Math.sin(-pitch);
            let y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            
            // Clipping de profundidade
            if (z2 < 10) return { visible: false };
            
            // Rotação ROLL (Inclinação das asas)
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
        
        drawJetModel: (ctx, px, py, scale, roll, isEnemy) => {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(roll);
            ctx.scale(scale, scale);
            
            ctx.strokeStyle = isEnemy ? "#e74c3c" : "#3498db";
            ctx.lineWidth = 2;
            ctx.fillStyle = isEnemy ? "rgba(231, 76, 60, 0.4)" : "rgba(52, 152, 219, 0.4)";
            
            ctx.beginPath();
            ctx.moveTo(0, -20); ctx.lineTo(5, -10); ctx.lineTo(20, 5);
            ctx.lineTo(5, 10); ctx.lineTo(0, 15); ctx.lineTo(-5, 10);
            ctx.lineTo(-20, 5); ctx.lineTo(-5, -10); ctx.closePath();
            
            ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = "#f39c12";
            ctx.beginPath(); ctx.arc(0, 16, Math.random() * 4 + 2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    };

    // =========================================================================
    // 2. CONSTANTES E CLASSES DO JOGO
    // =========================================================================
    const PHYSICS = { MAX_THRUST: 1200, MAX_PITCH_RATE: 0.03, MAX_ROLL_RATE: 0.05 };

    class Particle {
        constructor(x, y, z, color, size, life) {
            this.x = x; this.y = y; this.z = z;
            this.vx = (Math.random() - 0.5) * 20; this.vy = (Math.random() - 0.5) * 20; this.vz = (Math.random() - 0.5) * 20;
            this.color = color; this.size = size; this.life = life; this.maxLife = life;
        }
        update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt; this.life -= dt; }
    }

    class Missile {
        constructor(x, y, z, pitch, yaw, roll, speed, isEnemy, target) {
            this.x = x; this.y = y; this.z = z;
            this.pitch = pitch; this.yaw = yaw; this.roll = roll;
            this.speed = speed + 800; this.isEnemy = isEnemy; this.target = target;
            this.life = 6.0; this.active = true;
        }
        update(dt) {
            if (!this.active) return;
            this.life -= dt;
            if (this.life <= 0) { this.active = false; return; }

            if (this.target && this.target.active) {
                let dx = this.target.x - this.x, dy = this.target.y - this.y, dz = this.target.z - this.z;
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                if (dist < 150) { 
                    this.active = false; this.target.hit(45);
                    if(window.Sfx) window.Sfx.play(100, 'sawtooth', 0.5, 0.3);
                    return;
                }
                let targetYaw = Math.atan2(dx, dz);
                let targetPitch = Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
                this.yaw += (targetYaw - this.yaw) * 0.05;
                this.pitch += (targetPitch - this.pitch) * 0.05;
            }

            this.x += Math.sin(this.yaw) * Math.cos(this.pitch) * this.speed * dt;
            this.y += Math.sin(this.pitch) * this.speed * dt;
            this.z += Math.cos(this.yaw) * Math.cos(this.pitch) * this.speed * dt;
        }
    }

    class EnemyJet {
        constructor(id, x, y, z) {
            this.id = id; this.x = x; this.y = y; this.z = z;
            this.pitch = 0; this.yaw = 0; this.roll = 0;
            this.speed = 300 + Math.random() * 100;
            this.hp = 100; this.active = true; this.evading = false; this.stateTimer = 0;
        }
        update(dt, playerX, playerY, playerZ) {
            if (!this.active) return;
            this.stateTimer -= dt;

            if (this.stateTimer <= 0) {
                this.evading = Math.random() > 0.7; 
                this.stateTimer = 2 + Math.random() * 3;
            }

            let dx = playerX - this.x, dz = playerZ - this.z;
            let targetYaw = Math.atan2(dx, dz);
            
            if (this.evading) {
                this.roll += (Math.PI/3 - this.roll) * 0.1; this.yaw += 0.02;
            } else {
                this.roll += (0 - this.roll) * 0.1;
                let yawDiff = targetYaw - this.yaw;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                if (!isNaN(yawDiff)) this.yaw += yawDiff * 0.01;
            }

            this.x += Math.sin(this.yaw) * this.speed * dt;
            this.z += Math.cos(this.yaw) * this.speed * dt;
        }
        hit(damage) { this.hp -= damage; if (this.hp <= 0) this.active = false; }
    }

    // =========================================================================
    // 3. LÓGICA PRINCIPAL (MAPEAMENTO DIRETO PARA O CORE.JS)
    // =========================================================================
    const Game = {
        state: 'INIT', lastTime: 0,
        player: { x: 0, y: 3000, z: 0, pitch: 0, yaw: 0, roll: 0, speed: 400, throttle: 0.5, hp: 100, flares: 10, gForce: 1.0, mach: 0.3 },
        hotas: { pitchInput: 0, rollInput: 0, calibratedY: 0, calibratedX: 0 },
        entities: { missiles: [], enemies: [], particles: [] },
        session: { kills: 0, cash: 0, mode: 'SINGLE', time: 0 },
        radarTarget: null, lockTimer: 0, keys: {}, keysBound: false,

        // Apelidos diretos suportados por diferentes versões do motor
        _init: function(m) { this.init(m); },
        _update: function(k, w, h) { this.update(k, w, h); },
        _draw: function(c, w, h) { this.render(c, w, h); },
        _drawEnd: function(c, w, h) { this.renderEnd(c, w, h); },

        init: function(missionData) {
            this.state = 'CALIBRATING';
            this.session.mode = (missionData && missionData.mode) ? missionData.mode : 'SINGLE';
            this.player = { x: 0, y: 3000, z: 0, pitch: 0, yaw: 0, roll: 0, speed: 400, throttle: 0.5, hp: 100, flares: 10, gForce: 1.0, mach: 0.3 };
            this.entities = { missiles: [], enemies: [], particles: [] };
            this.session.kills = 0; this.session.cash = 0; this.session.time = 0;
            this.lastTime = performance.now();
            this.spawnEnemies(4);

            if(window.Sfx) window.Sfx.play(400, 'sine', 0.5, 0.1); 

            if (!this.keysBound) {
                window.addEventListener('keydown', (e) => {
                    this.keys[e.key] = true;
                    if (this.state === 'CALIBRATING' && ['ArrowUp', 'ArrowDown', 'w', 's', ' '].includes(e.key)) {
                        this.state = 'PLAYING';
                        if(window.System && window.System.msg) window.System.msg("TECLADO MANUAL ATIVADO", "#f39c12");
                    }
                    if (e.key === ' ' && this.state === 'PLAYING') this.fireMissile();
                });
                window.addEventListener('keyup', (e) => this.keys[e.key] = false);
                this.keysBound = true;
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

        update: function(kps, w, h) {
            let now = performance.now();
            if (this.lastTime === 0) this.lastTime = now;
            let dt = Math.max(0.001, (now - this.lastTime) / 1000);
            this.lastTime = now;
            if (dt > 0.1) dt = 0.1; // Limita o Delta Time para o jogo não "saltar"

            this.processInputs(kps);

            if (this.state === 'PLAYING') {
                this.session.time += dt;
                this.updatePhysics(dt);
                this.updateEntities(dt);
                this.updateCombatSystem(dt);

                if (this.player.hp <= 0 || this.player.y <= 0) { 
                    this.endGame('GAMEOVER');
                } else if (this.entities.enemies.filter(e => e.active).length === 0) {
                    this.endGame('VICTORY');
                }
            }
        },

        processInputs: function(kps) {
            // Teclado (Sempre Processado)
            if (this.keys['ArrowUp']) this.hotas.pitchInput = 0.5;
            else if (this.keys['ArrowDown']) this.hotas.pitchInput = -0.5;
            else this.hotas.pitchInput = this.lerp(this.hotas.pitchInput, 0, 0.1);

            if (this.keys['ArrowRight']) this.hotas.rollInput = 0.5;
            else if (this.keys['ArrowLeft']) this.hotas.rollInput = -0.5;
            else this.hotas.rollInput = this.lerp(this.hotas.rollInput, 0, 0.1);

            if (this.keys['w']) this.player.throttle = 1.0;
            else if (this.keys['s']) this.player.throttle = 0.2;
            else this.player.throttle = this.lerp(this.player.throttle, 0.5, 0.05);

            // Câmara (MoveNet) - Com proteções Anti-Crash!
            let kpDict = {};
            if (kps && Array.isArray(kps) && kps.length > 0) {
                let arr = (kps[0] && kps[0].keypoints) ? kps[0].keypoints : kps;
                arr.forEach(kp => { if (kp && kp.name) kpDict[kp.name] = kp; });
            }

            let rightWrist = kpDict['right_wrist'], leftWrist = kpDict['left_wrist'], nose = kpDict['nose'];

            // SÓ avança se o nariz também existir no frame (evita o erro undefined)
            if (rightWrist && rightWrist.score > 0.4 && nose && nose.score > 0.4) {
                if (this.state === 'CALIBRATING') {
                    this.hotas.calibratedX = rightWrist.x; this.hotas.calibratedY = rightWrist.y;
                    this.state = 'PLAYING';
                    if(window.System && window.System.msg) window.System.msg("HOTAS AR CALIBRADO!", "#2ecc71");
                }
                if (this.state === 'PLAYING' && !this.keys['ArrowUp'] && !this.keys['ArrowDown']) {
                    let deltaY = (rightWrist.y - this.hotas.calibratedY) / 100;
                    let deltaX = (rightWrist.x - this.hotas.calibratedX) / 100;
                    if (!isNaN(deltaY)) this.hotas.pitchInput = this.lerp(this.hotas.pitchInput, deltaY, 0.1);
                    if (!isNaN(deltaX)) this.hotas.rollInput = this.lerp(this.hotas.rollInput, deltaX, 0.1);
                }
            }

            // Acelerador: Mesma proteção (exige pulso + nariz ativos neste exato frame)
            if (leftWrist && leftWrist.score > 0.4 && nose && nose.score > 0.4 && this.state === 'PLAYING') {
                let thrInput = (nose.y - leftWrist.y) / 200; 
                if (!isNaN(thrInput)) {
                    this.player.throttle = Math.max(0.2, Math.min(1.0, thrInput));
                }
                if (rightWrist && Math.abs(leftWrist.x - rightWrist.x) < 50 && this.lockTimer > 1.5) {
                    this.fireMissile();
                }
            }
        },

        updatePhysics: function(dt) {
            let p = this.player;
            p.pitch += p.pitchInput * PHYSICS.MAX_PITCH_RATE;
            p.roll += p.rollInput * PHYSICS.MAX_ROLL_RATE;
            p.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, p.pitch));
            
            let turnRate = Math.sin(p.roll) * 0.02;
            if (!isNaN(turnRate)) {
                p.yaw += turnRate;
                p.pitch -= Math.abs(turnRate) * 0.01;
            }

            let targetSpeed = PHYSICS.MAX_THRUST * p.throttle;
            p.speed = this.lerp(p.speed, targetSpeed, 0.01);
            p.mach = (p.speed / 343).toFixed(2);
            p.gForce = 1.0 + (Math.abs(p.pitchInput) * 4.0) + (Math.abs(turnRate || 0) * 50.0);

            let vx = Math.sin(p.yaw) * Math.cos(p.pitch) * p.speed;
            let vy = Math.sin(p.pitch) * p.speed; // Ganha altitude com nariz cima
            let vz = Math.cos(p.yaw) * Math.cos(p.pitch) * p.speed;

            if (!isNaN(vx)) p.x += vx * dt; 
            if (!isNaN(vy)) p.y += vy * dt; 
            if (!isNaN(vz)) p.z += vz * dt;
        },

        updateEntities: function(dt) {
            this.entities.missiles.forEach(m => {
                m.update(dt);
                if (m.active && Math.random() > 0.5) this.entities.particles.push(new Particle(m.x, m.y, m.z, "#ddd", 5, 1.0));
            });
            this.entities.missiles = this.entities.missiles.filter(m => m.active);

            this.entities.enemies.forEach(e => {
                e.update(dt, this.player.x, this.player.y, this.player.z);
                if (!e.active) {
                    for(let i=0; i<20; i++) this.entities.particles.push(new Particle(e.x, e.y, e.z, "#e74c3c", Math.random()*15+5, 2.0));
                    this.session.kills++; this.session.cash += 500;
                    if(window.Sfx) window.Sfx.play(150, 'square', 0.8, 0.4); 
                }
            });
            this.entities.enemies = this.entities.enemies.filter(e => e.active);

            this.entities.particles.forEach(p => p.update(dt));
            this.entities.particles = this.entities.particles.filter(p => p.life > 0);
        },

        updateCombatSystem: function(dt) {
            let closestDist = Infinity, target = null;
            this.entities.enemies.forEach(e => {
                let dx = e.x - this.player.x, dy = e.y - this.player.y, dz = e.z - this.player.z;
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                let dirYaw = Math.atan2(dx, dz);
                let yawDiff = Math.abs(dirYaw - this.player.yaw);
                if (yawDiff < 0.5 && dist < 5000 && dist < closestDist) {
                    closestDist = dist; target = e;
                }
            });

            if (target) {
                this.radarTarget = target; this.lockTimer += dt;
                if (window.Sfx) {
                    if (this.lockTimer > 1.5) {
                        if (Math.floor(this.session.time * 10) % 2 === 0) window.Sfx.play(1200, 'square', 0.05, 0.05);
                    } else {
                        if (Math.floor(this.session.time * 5) % 2 === 0) window.Sfx.play(800, 'square', 0.05, 0.02);
                    }
                }
            } else {
                this.radarTarget = null; this.lockTimer = 0;
            }
        },

        fireMissile: function() {
            if (this.radarTarget && this.lockTimer > 1.5) {
                if(window.Sfx) window.Sfx.play(600, 'sawtooth', 0.5, 0.2);
                this.entities.missiles.push(new Missile(
                    this.player.x, this.player.y - 10, this.player.z,
                    this.player.pitch, this.player.yaw, this.player.roll,
                    this.player.speed, false, this.radarTarget
                ));
                this.lockTimer = 0; 
                if(window.System && window.System.msg) window.System.msg("FOX 2!", "#e74c3c");
            }
        },

        endGame: function(finalState) {
            this.state = finalState;
            setTimeout(() => {
                if (window.System && window.System.gameOver) window.System.gameOver(this.session.kills, finalState === 'VICTORY', this.session.cash);
                else if (window.System && window.System.home) window.System.home();
            }, 4000);
        },

        lerp: (a, b, t) => a + (b - a) * t,

        // =====================================================================
        // RENDERIZAÇÃO
        // =====================================================================
        render: function(ctx, w, h) {
            ctx.clearRect(0, 0, w, h);
            if (this.state === 'CALIBRATING') return this.drawCalibration(ctx, w, h);
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') return this.renderEnd(ctx, w, h);

            this.draw3DWorld(ctx, w, h);
            this.drawHUD(ctx, w, h);
        },

        draw3DWorld: function(ctx, w, h) {
            let p = this.player;

            ctx.save();
            ctx.translate(w/2, h/2);
            ctx.rotate(p.roll);
            
            let horizonY = p.pitch * (h/2); 
            ctx.fillStyle = "rgba(46, 204, 113, 0.15)"; ctx.fillRect(-w*2, horizonY, w*4, h*4);
            ctx.fillStyle = "rgba(52, 152, 219, 0.15)"; ctx.fillRect(-w*2, -h*4 + horizonY, w*4, h*4);
            
            ctx.beginPath(); ctx.moveTo(-w, horizonY); ctx.lineTo(w, horizonY);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
            ctx.restore();

            this.entities.enemies.forEach(e => {
                let proj = Engine3D.project(e.x, e.y, e.z, p.x, p.y, p.z, p.pitch, p.yaw, p.roll, w, h);
                if (proj.visible) {
                    Engine3D.drawJetModel(ctx, proj.x, proj.y, Math.max(0.1, proj.s * 2), e.roll - p.roll, true);
                    if (this.radarTarget === e) {
                        ctx.strokeStyle = this.lockTimer > 1.5 ? "#e74c3c" : "#f1c40f"; ctx.lineWidth = 2;
                        let size = 30 * proj.s;
                        ctx.strokeRect(proj.x - size/2, proj.y - size/2, size, size);
                        if (this.lockTimer > 1.5) {
                            ctx.fillStyle = "#e74c3c"; ctx.font = "12px Arial"; ctx.fillText("LOCK", proj.x + size/2 + 5, proj.y);
                        }
                    }
                }
            });

            this.entities.particles.forEach(part => {
                let proj = Engine3D.project(part.x, part.y, part.z, p.x, p.y, p.z, p.pitch, p.yaw, p.roll, w, h);
                if (proj.visible) {
                    ctx.fillStyle = part.color; ctx.globalAlpha = part.life / part.maxLife;
                    ctx.beginPath(); ctx.arc(proj.x, proj.y, part.size * proj.s, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });

            this.entities.missiles.forEach(m => {
                let proj = Engine3D.project(m.x, m.y, m.z, p.x, p.y, p.z, p.pitch, p.yaw, p.roll, w, h);
                if (proj.visible) {
                    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(proj.x, proj.y, 4 * proj.s, 0, Math.PI*2); ctx.fill();
                }
            });
        },

        drawHUD: function(ctx, w, h) {
            let p = this.player, hudColor = "#00ffcc";
            ctx.fillStyle = hudColor; ctx.strokeStyle = hudColor; ctx.font = "bold 16px 'Chakra Petch', sans-serif";

            ctx.beginPath();
            ctx.moveTo(w/2 - 15, h/2); ctx.lineTo(w/2 - 5, h/2);
            ctx.moveTo(w/2 + 15, h/2); ctx.lineTo(w/2 + 5, h/2);
            ctx.moveTo(w/2, h/2 - 15); ctx.lineTo(w/2, h/2 - 5);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            ctx.save();
            ctx.translate(w/2, h/2); ctx.rotate(p.roll);
            for(let i = -3; i <= 3; i++) {
                if (i === 0) continue;
                let relPitch = (i * 0.17) + p.pitch; 
                let yPos = relPitch * 400; 
                if (yPos > -h/2 && yPos < h/2) {
                    ctx.beginPath();
                    if (i < 0) ctx.setLineDash([5, 5]); 
                    ctx.moveTo(-40, yPos); ctx.lineTo(-20, yPos); ctx.lineTo(-20, yPos + (i < 0 ? -5 : 5)); 
                    ctx.moveTo(40, yPos); ctx.lineTo(20, yPos); ctx.lineTo(20, yPos + (i < 0 ? -5 : 5));
                    ctx.stroke(); ctx.setLineDash([]);
                    ctx.font = "10px Arial"; ctx.textAlign = "right"; ctx.fillText(Math.abs(i*10), -45, yPos + 3);
                    ctx.textAlign = "left"; ctx.fillText(Math.abs(i*10), 45, yPos + 3);
                }
            }
            ctx.restore();

            ctx.strokeRect(30, h/2 - 100, 40, 200); ctx.textAlign = "center"; ctx.fillText("SPD", 50, h/2 - 110);
            ctx.beginPath(); ctx.moveTo(70, h/2); ctx.lineTo(80, h/2 - 5); ctx.lineTo(80, h/2 + 5); ctx.fill(); 
            ctx.fillText(Math.floor(p.speed), 50, h/2 + 5); ctx.font = "12px Arial"; ctx.fillText(`M ${p.mach}`, 50, h/2 + 120);

            ctx.strokeRect(w - 70, h/2 - 100, 40, 200); ctx.textAlign = "center"; ctx.font = "bold 16px 'Chakra Petch'";
            ctx.fillText("ALT", w - 50, h/2 - 110);
            ctx.beginPath(); ctx.moveTo(w - 70, h/2); ctx.lineTo(w - 80, h/2 - 5); ctx.lineTo(w - 80, h/2 + 5); ctx.fill(); 
            ctx.fillText(Math.floor(p.y), w - 50, h/2 + 5);

            ctx.strokeRect(w/2 - 100, 20, 200, 25);
            let heading = (p.yaw * 180 / Math.PI) % 360; if (heading < 0) heading += 360;
            ctx.fillText(Math.floor(heading) + "°", w/2, 40);
            ctx.beginPath(); ctx.moveTo(w/2, 45); ctx.lineTo(w/2 - 5, 55); ctx.lineTo(w/2 + 5, 55); ctx.fill();

            ctx.textAlign = "left"; ctx.fillText(`G-FORCE: ${p.gForce.toFixed(1)}G`, 20, h - 80);
            ctx.fillStyle = p.hp < 40 ? "#e74c3c" : hudColor; ctx.fillText(`INTEGRIDADE: ${Math.floor(p.hp)}%`, 20, h - 60);
            
            ctx.textAlign = "right"; ctx.fillText(`ARMAMENTO: FOX-2`, w - 20, h - 80); ctx.fillText(`KILLS: ${this.session.kills}`, w - 20, h - 60);

            if (p.speed < 150) {
                ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 24px 'Russo One'";
                ctx.fillText("STALL ALARM!", w/2, h/2 + 80);
            }
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
            ctx.fillText("Estique o braço direito na altura do ombro (Seu Manche).", w/2, h/2 + 40);
            ctx.fillText("Levante o braço esquerdo para acelerar. Junte as mãos para atirar.", w/2, h/2 + 70);
            
            ctx.fillStyle = "#f39c12"; ctx.font = "14px Arial";
            ctx.fillText("[Mapeamento Auxiliar: Setas do Teclado e W/S operacionais]", w/2, h/2 + 120);

            ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
            let scannerY = (h/2 + 150) + Math.sin(performance.now() * 0.005) * 20;
            ctx.beginPath(); ctx.moveTo(w/2 - 100, scannerY); ctx.lineTo(w/2 + 100, scannerY); ctx.stroke();
        },

        renderEnd: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,w,h);
            ctx.textAlign = "center"; 
            if (this.state === 'VICTORY') {
                ctx.fillStyle = "#2ecc71"; ctx.font = "bold 50px 'Russo One'"; ctx.fillText("ESPAÇO AÉREO LIMPO", w/2, h/2 - 30);
                ctx.fillStyle = "#f1c40f"; ctx.font = "20px 'Chakra Petch'"; ctx.fillText(`PAGAMENTO APROVADO: R$ ${this.session.cash}`, w/2, h/2 + 20);
            } else {
                ctx.fillStyle = "#e74c3c"; ctx.font = "bold 50px 'Russo One'"; ctx.fillText("CAÇA ABATIDO", w/2, h/2 - 30);
                ctx.fillStyle = "#fff"; ctx.font = "20px 'Chakra Petch'"; ctx.fillText("O PILOTO FOI EJETADO.", w/2, h/2 + 20);
            }
            ctx.fillText(`Inimigos Destruídos: ${this.session.kills}`, w/2, h/2 + 60);
        }
    };

    // =========================================================================
    // 4. REGISTRO NO SISTEMA (THIAGUINHO OS)
    // =========================================================================
    const register = () => {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '✈️', Game, {
                camera: 'user', camOpacity: 0.4, 
                phases: [
                    // Mapeamento EXATO da versão original do teu repositório:
                    { id: 'single', name: 'CAMPANHA SOLO', desc: 'Destrua alvos para ganhar $', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'CO-OP SQUADRON', desc: 'Jogue com amigos.', mode: 'COOP', reqLvl: 3 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Batalha aérea.', mode: 'PVP', reqLvl: 5 }
                ]
            });
            clearInterval(regLoop);
        }
    };
    const regLoop = setInterval(register, 100);

})();
