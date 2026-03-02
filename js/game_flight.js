// =============================================================================
// AERO STRIKE: BLACK OPS EDITION (VFX OVERHAUL & TACTICAL CONTROLS)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT
// STATUS: HIGH-FIDELITY 2D-3D RENDER, RESPONSIVE YOKE, ARCADE-SIM PHYSICS
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES FÍSICAS REAIS (AJUSTADAS PARA JOGABILIDADE)
    // -----------------------------------------------------------------
    var GAME_CONFIG = {
        MONEY_PER_KILL: 150,
        MONEY_MISSION_BONUS: 800,
        MONEY_BOSS_BONUS: 2000,
        GRAVITY: 9.80665,     
        R_GAS: 287.05,        
        GAMMA: 1.4,           
        MAX_ALTITUDE: 40000   
    };

    var PLANES = {
        falcon_lite: {
            name: "F-16 BLACK OPS", price: 0,
            // EMPUXO AUMENTADO MASSIÇAMENTE PARA SUBIR FÁCIL
            thrust: 200000, mass: 12000, wingArea: 28.0,
            cd0: 0.022, kInduced: 0.05, 
            clMax: 2.2, // Sustentação aumentada para não cair
            stallAngle: 0.45, // Mais tolerância para apontar o nariz para cima
            maxPitchRate: 2.0, maxRollRate: 3.5, color: "#00ffcc"
        },
        boss_su57: {
            name: "SU-57 FELON (ACE)", price: 99999,
            thrust: 280000, mass: 18000, wingArea: 78.8,
            cd0: 0.020, kInduced: 0.04, clMax: 2.0, stallAngle: 0.50,
            maxPitchRate: 2.8, maxRollRate: 4.5, color: "#ff3300"
        }
    };

    // -----------------------------------------------------------------
    // 2. MOTOR DE RENDERIZAÇÃO 3D VETORIAL (OVERHAUL GRÁFICO)
    // -----------------------------------------------------------------
    var Engine3D = {
        fov: 800,
        project: function(obj, cam, w, h) {
            var dx = obj.x - cam.pos.x;
            var dy = cam.pos.y - obj.y; 
            var dz = obj.z - cam.pos.z;
            
            var cyaw = Math.cos(-cam.yaw), syaw = Math.sin(-cam.yaw);
            var x1 = dx * cyaw - dz * syaw, z1 = dx * syaw + dz * cyaw;
            
            var cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
            var y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            
            if (z2 < 10) return { visible: false };
            
            var cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
            var finalX = x1 * cr - y2 * sr, finalY = x1 * sr + y2 * cr;
            var scale = Engine3D.fov / z2;
            
            return { x: (w/2) + (finalX * scale), y: (h/2) + (finalY * scale), s: scale, z: z2, visible: true };
        },
        
        drawJetModel: function(ctx, px, py, scale, roll, isEnemy, color) {
            color = color || "#00ffcc";
            ctx.save(); 
            ctx.translate(px, py); 
            ctx.rotate(roll); 
            ctx.scale(scale, scale);
            
            // SOMBREADO METÁLICO (Efeito PS2)
            var jetGrad = ctx.createLinearGradient(0, -30, 0, 30);
            if (isEnemy) {
                jetGrad.addColorStop(0, "#441111");
                jetGrad.addColorStop(0.5, "#cc2222");
                jetGrad.addColorStop(1, "#220000");
                ctx.strokeStyle = "#ff5555";
            } else {
                jetGrad.addColorStop(0, "#113333");
                jetGrad.addColorStop(0.5, "#2288aa");
                jetGrad.addColorStop(1, "#001111");
                ctx.strokeStyle = color;
            }

            ctx.lineWidth = 2;
            ctx.fillStyle = jetGrad;
            
            // Formato avançado do caça
            ctx.beginPath();
            ctx.moveTo(0, -40); // Bico
            ctx.lineTo(6, -15); // Cockpit dir
            ctx.lineTo(35, 10); // Asa dir ponta
            ctx.lineTo(10, 15); // Asa dir base
            ctx.lineTo(15, 30); // Estabilizador dir
            ctx.lineTo(0, 25);  // Motor
            ctx.lineTo(-15, 30); // Estabilizador esq
            ctx.lineTo(-10, 15); // Asa esq base
            ctx.lineTo(-35, 10); // Asa esq ponta
            ctx.lineTo(-6, -15); // Cockpit esq
            ctx.closePath();
            
            ctx.shadowBlur = 10;
            ctx.shadowColor = isEnemy ? "#ff0000" : "#00ffff";
            ctx.fill(); 
            ctx.stroke();
            
            // Cockpit Vidro
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.beginPath(); ctx.moveTo(0,-25); ctx.lineTo(3,-10); ctx.lineTo(-3,-10); ctx.fill();

            // Afterburner Glow
            ctx.shadowBlur = 20;
            ctx.shadowColor = "#ff9900";
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(0, 28, Math.random() * 5 + 4, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#ff6600";
            ctx.beginPath(); ctx.arc(0, 28, Math.random() * 8 + 6, 0, Math.PI*2); ctx.fill();

            ctx.restore();
        }
    };

    // -----------------------------------------------------------------
    // 3. FÍSICA FUNCIONAL 
    // -----------------------------------------------------------------
    function createPhysicsEntity(x, y, z, stats) {
        return {
            pos: { x: x, y: y, z: z },
            vel: { x: 0, y: 0, z: 300 },
            pitch: 0, yaw: 0, roll: 0,
            stats: stats,
            throttle: 0.9, 
            inputs: { pitch: 0, roll: 0, yaw: 0 },
            gForce: 1.0, mach: 0, alpha: 0, isStalling: false,
            hp: 100, active: true, isBoss: false, stateTimer: 0
        };
    }

    function updatePhysics(ent, dt) {
        if (!ent.active) return;
        if (dt > 0.1) dt = 0.1; 

        var altitude = Math.max(0, Math.min(GAME_CONFIG.MAX_ALTITUDE, ent.pos.y));
        var tempK = 288.15 - 0.0065 * altitude; 
        var airDensity = 1.225 * Math.pow(Math.max(0, 1 - 0.0000225577 * altitude), 4.2561); 
        var speedOfSound = Math.sqrt(GAME_CONFIG.GAMMA * GAME_CONFIG.R_GAS * tempK);

        var V2 = (ent.vel.x * ent.vel.x) + (ent.vel.y * ent.vel.y) + (ent.vel.z * ent.vel.z);
        var V = Math.sqrt(V2);
        if (isNaN(V) || V === 0) V = 1;
        ent.mach = V / speedOfSound;
        if (isNaN(ent.mach)) ent.mach = 0;

        var cy = Math.cos(ent.yaw), sy = Math.sin(ent.yaw);
        var cp = Math.cos(ent.pitch), sp = Math.sin(ent.pitch);
        var cr = Math.cos(ent.roll), sr = Math.sin(ent.roll);

        var forwardVec = { x: sy * cp, y: sp, z: cy * cp };
        var upVec = { x: -sy * sp * cr - cy * sr, y: cp * cr, z: -cy * sp * cr + sy * sr };
        var rightVec = { x: cy * cr - sy * sp * sr, y: sp * sr, z: -sy * cr - cy * sp * sr };

        var vDir = V > 1.0 ? { x: ent.vel.x/V, y: ent.vel.y/V, z: ent.vel.z/V } : forwardVec;
        var cosAlpha = forwardVec.x*vDir.x + forwardVec.y*vDir.y + forwardVec.z*vDir.z;
        ent.alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
        if (isNaN(ent.alpha)) ent.alpha = 0;

        var CL = ent.alpha * (ent.stats.clMax / ent.stats.stallAngle); 
        if (isNaN(CL)) CL = 0;
        
        ent.isStalling = ent.alpha > ent.stats.stallAngle || V < 80;
        if (ent.isStalling) CL = Math.max(0, CL - (ent.alpha - ent.stats.stallAngle) * 5.0); 

        var CD = ent.stats.cd0 + ent.stats.kInduced * (CL * CL);
        if (isNaN(CD)) CD = ent.stats.cd0;

        var dynamicPressure = 0.5 * airDensity * (V * V);
        var liftMag = dynamicPressure * ent.stats.wingArea * CL;
        var dragMag = dynamicPressure * ent.stats.wingArea * CD;

        var liftForce = { x: upVec.x * liftMag, y: upVec.y * liftMag, z: upVec.z * liftMag };
        var dragForce = { x: -vDir.x * dragMag, y: -vDir.y * dragMag, z: -vDir.z * dragMag };
        
        var thrustMag = ent.stats.thrust * ent.throttle;
        var thrustForce = { x: forwardVec.x * thrustMag, y: forwardVec.y * thrustMag, z: forwardVec.z * thrustMag };

        var weight = ent.stats.mass * GAME_CONFIG.GRAVITY;
        var Fx = liftForce.x + dragForce.x + thrustForce.x;
        var Fy = liftForce.y + dragForce.y + thrustForce.y - weight;
        var Fz = liftForce.z + dragForce.z + thrustForce.z;

        ent.vel.x += (Fx / ent.stats.mass) * dt;
        ent.vel.y += (Fy / ent.stats.mass) * dt;
        ent.vel.z += (Fz / ent.stats.mass) * dt;

        ent.pos.x += ent.vel.x * dt;
        ent.pos.y += ent.vel.y * dt;
        ent.pos.z += ent.vel.z * dt;

        var specificForceMag = Math.sqrt(
            Math.pow(liftForce.x + dragForce.x + thrustForce.x, 2) +
            Math.pow(liftForce.y + dragForce.y + thrustForce.y, 2) +
            Math.pow(liftForce.z + dragForce.z + thrustForce.z, 2)
        );
        ent.gForce = specificForceMag / weight;
        if (isNaN(ent.gForce)) ent.gForce = 1.0;

        var currentTurnRate = (liftMag * Math.sin(ent.roll)) / (ent.stats.mass * V); 
        if (!ent.isStalling && V > 30 && !isNaN(currentTurnRate)) {
            ent.yaw += currentTurnRate * dt;
        }

        ent.pitch += ent.inputs.pitch * ent.stats.maxPitchRate * dt;
        ent.roll += ent.inputs.roll * ent.stats.maxRollRate * dt;
        ent.pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, ent.pitch));

        if (ent.isStalling) {
            ent.pitch += (-0.5 - ent.pitch) * 2.0 * dt;
            ent.roll += (Math.random() - 0.5) * 3.0 * dt; 
        }

        if (isNaN(ent.pitch)) ent.pitch = 0;
        if (isNaN(ent.roll)) ent.roll = 0;
        if (isNaN(ent.yaw)) ent.yaw = 0;
        if (isNaN(ent.pos.x)) ent.pos.x = 0;
        if (isNaN(ent.pos.y)) ent.pos.y = 3000;
        if (isNaN(ent.pos.z)) ent.pos.z = 0;

        if (ent.pos.y <= 50) {
            ent.pos.y = 50;
            if (ent.vel.y < -50) { ent.hp = 0; ent.active = false; } // Crash
            else { ent.vel.y = 0; if (ent.pitch < 0) ent.pitch = 0; } // Skimming
        }
    }

    // -----------------------------------------------------------------
    // 4. GUIAGEM BALÍSTICA E PARTÍCULAS HD
    // -----------------------------------------------------------------
    function createParticle(x, y, z, color, size, life, type) {
        return {
            pos: { x: x, y: y, z: z },
            vel: { x: (Math.random()-0.5)*50, y: (Math.random()-0.5)*50, z: (Math.random()-0.5)*50 },
            color: color, size: size, life: life, maxLife: life, type: type || 'smoke'
        };
    }

    function updateParticle(p, dt) {
        p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
        if (p.type === 'smoke') p.size += 15 * dt; // Fumaça expande
        p.life -= dt;
    }

    function createMissile(shooter, target, isEnemy) {
        return {
            pos: { x: shooter.pos.x, y: shooter.pos.y - 5, z: shooter.pos.z },
            vel: { x: shooter.vel.x, y: shooter.vel.y, z: shooter.vel.z },
            target: target, isEnemy: isEnemy,
            thrust: 2000, maxG: 40.0, life: 8.0, active: true,
            pitch: shooter.pitch, yaw: shooter.yaw, roll: shooter.roll
        };
    }

    function updateMissile(m, dt) {
        if (!m.active) return;
        m.life -= dt;
        if (m.life <= 0) { m.active = false; return; }

        var V2 = (m.vel.x * m.vel.x) + (m.vel.y * m.vel.y) + (m.vel.z * m.vel.z);
        var V = Math.sqrt(V2);

        if (m.target && m.target.active) {
            var rx = m.target.pos.x - m.pos.x, ry = m.target.pos.y - m.pos.y, rz = m.target.pos.z - m.pos.z;
            var dist2 = (rx*rx) + (ry*ry) + (rz*rz);
            var dist = Math.sqrt(dist2);
            
            if (dist < 100) { 
                m.active = false; m.target.hp -= 60;
                if(window.Sfx && window.Sfx.play) window.Sfx.play(100, 'sawtooth', 0.5, 0.3);
                return;
            }

            var vrx = m.target.vel.x - m.vel.x, vry = m.target.vel.y - m.vel.y, vrz = m.target.vel.z - m.vel.z;
            var cx = ry * vrz - rz * vry, cy = rz * vrx - rx * vrz, cz = rx * vry - ry * vrx;
            
            var omegax = cx / dist2, omegay = cy / dist2, omegaz = cz / dist2;
            var Vc = -(rx*vrx + ry*vry + rz*vrz) / dist;
            var ux = rx / dist, uy = ry / dist, uz = rz / dist;

            var N_gain = 5.0; // Míssil muito ágil
            var oxu_x = omegay * uz - omegaz * uy, oxu_y = omegaz * ux - omegax * uz, oxu_z = omegax * uy - omy * ux;

            var ax = N_gain * Vc * oxu_x, ay = N_gain * Vc * oxu_y, az = N_gain * Vc * oxu_z;

            var accMag = Math.sqrt((ax*ax) + (ay*ay) + (az*az));
            var maxAcc = m.maxG * GAME_CONFIG.GRAVITY;
            if (accMag > maxAcc) { ax = (ax / accMag) * maxAcc; ay = (ay / accMag) * maxAcc; az = (az / accMag) * maxAcc; }

            if (!isNaN(ax)) m.vel.x += ax * dt;
            if (!isNaN(ay)) m.vel.y += ay * dt;
            if (!isNaN(az)) m.vel.z += az * dt;

            m.yaw = Math.atan2(m.vel.x, m.vel.z);
            m.pitch = Math.asin(m.vel.y / (V || 1));
        }

        var vDir = V > 0.1 ? { x: m.vel.x/V, y: m.vel.y/V, z: m.vel.z/V } : {x:0, y:0, z:1};
        m.vel.x += vDir.x * m.thrust * dt;
        m.vel.y += vDir.y * m.thrust * dt;
        m.vel.z += vDir.z * m.thrust * dt;

        m.pos.x += m.vel.x * dt;
        m.pos.y += m.vel.y * dt;
        m.pos.z += m.vel.z * dt;
    }

    // -----------------------------------------------------------------
    // 5. SISTEMA GLOBAL PURE FUNCTIONAL
    // -----------------------------------------------------------------
    var GameState = {
        status: 'INIT', lastTime: 0, player: null,
        entities: { missiles: [], enemies: [], particles: [] },
        session: { kills: 0, cash: 0, mode: 'SINGLE', time: 0, wave: 1, selectedPlane: PLANES.falcon_lite },
        radarTarget: null, lockTimer: 0, vulcanCd: 0, missileCd: 0, hangarTimer: 3.0,
        hotas: { pitchInput: 0, rollInput: 0, calibratedY: 240, calibratedX: 320, lastValidPitch: 0, lastValidRoll: 0 },
        keys: {}, keysBound: false, touchBound: false, fatalError: null,
        screenFlash: 0
    };

    var Game = {};

    Game._init = function(missionData) {
        try {
            GameState.fatalError = null;
            GameState.status = 'LOBBY'; 
            GameState.hangarTimer = 3.0;
            GameState.hotas = { pitchInput: 0, rollInput: 0, calibratedY: 240, calibratedX: 320, lastValidPitch: 0, lastValidRoll: 0 };
            GameState.keys = {};
            GameState.session = { 
                kills: 0, cash: 0, time: 0, wave: 1, 
                mode: (missionData && missionData.mode) ? missionData.mode : 'SINGLE',
                selectedPlane: PLANES.falcon_lite 
            };
            
            GameState.player = createPhysicsEntity(0, 3000, 0, GameState.session.selectedPlane);
            GameState.entities = { missiles: [], enemies: [], particles: [] };
            GameState.lastTime = performance.now();
            GameState.screenFlash = 0;
            
            Game.spawnWave();

            if(window.Sfx && window.Sfx.play) window.Sfx.play(400, 'sine', 0.5, 0.1); 

            if (!GameState.keysBound) {
                window.addEventListener('keydown', function(e) { GameState.keys[e.key] = true; });
                window.addEventListener('keyup', function(e) { GameState.keys[e.key] = false; });
                GameState.keysBound = true;
            }

            if (!GameState.touchBound) {
                var handleScreenTap = function() {
                    if (GameState.status === 'LOBBY') {
                        GameState.status = 'CALIBRATION'; 
                    } else if (GameState.status === 'CALIBRATION') {
                        GameState.status = 'PLAYING';
                    }
                };
                window.addEventListener('pointerdown', handleScreenTap);
                window.addEventListener('touchstart', handleScreenTap);
                GameState.touchBound = true;
            }

            if (GameState.session.mode === 'SINGLE') GameState.status = 'CALIBRATION';

        } catch (e) {
            GameState.fatalError = "ERRO NO INIT: " + e.message;
        }
    };

    Game._update = function(kps, w, h) {
        if (GameState.fatalError || !GameState.player) return;

        try {
            var now = performance.now();
            if (GameState.lastTime === 0) GameState.lastTime = now;
            var dt = (now - GameState.lastTime) / 1000;
            GameState.lastTime = now;
            
            if (dt < 0.005) return; 
            if (dt > 0.05) dt = 0.05; 

            if (GameState.status === 'LOBBY' && GameState.keys[' ']) {
                GameState.status = 'CALIBRATION';
            }

            if (GameState.status === 'CALIBRATION' || GameState.status === 'PLAYING') {
                Game.processMobileInputs(kps, dt, h);
                
                if (GameState.status === 'PLAYING') {
                    GameState.session.time += dt;
                    updatePhysics(GameState.player, dt);
                    Game.updateAI(dt);
                    Game.updateEntities(dt);
                    Game.updateCombatSystem(dt, w, h);
                    Game.updateMissionSystem();
                    
                    if (GameState.screenFlash > 0) GameState.screenFlash -= dt * 2;
                    if (GameState.player.hp <= 0 || !GameState.player.active) Game.endGame('GAMEOVER');
                }
            }
        } catch(e) {
            GameState.fatalError = "CRASH UPDATE: " + e.message;
        }
    };

    Game._draw = function(ctx, w, h) {
        try {
            if (!ctx || !ctx.clearRect) return; 
            w = w || window.innerWidth || 640;
            h = h || window.innerHeight || 480;

            if (GameState.fatalError) {
                ctx.fillStyle = "#c0392b"; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "white"; ctx.font = "bold 20px Arial"; ctx.textAlign = "left";
                ctx.fillText("CRITICAL ERROR NO JOGO", 20, 50);
                ctx.font = "14px monospace"; 
                var lines = GameState.fatalError.split("\n");
                for(var i=0; i<lines.length; i++) ctx.fillText(lines[i], 20, 90 + (i*20));
                return;
            }

            if (!GameState.player) return;

            ctx.clearRect(0, 0, w, h);
            
            if (GameState.status === 'LOBBY') Game.drawLobby(ctx, w, h);
            else if (GameState.status === 'CALIBRATION') Game.drawCalibration(ctx, w, h);
            else if (GameState.status === 'GAMEOVER' || GameState.status === 'VICTORY') Game._drawEnd(ctx, w, h);
            else {
                ctx.save();
                if (GameState.player.gForce > 3.0) {
                    var shake = (GameState.player.gForce - 3.0) * 3;
                    ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);
                } else if (GameState.screenFlash > 0) {
                    ctx.translate((Math.random()-0.5)*10, (Math.random()-0.5)*10);
                }

                Game.draw3DWorld(ctx, w, h);
                Game.drawEntities(ctx, w, h);
                Game.drawPilotFX(ctx, w, h);
                Game.drawHUD(ctx, w, h);
                Game.drawCockpitYoke(ctx, w, h);
                
                if (GameState.screenFlash > 0) {
                    ctx.fillStyle = "rgba(255,100,50," + GameState.screenFlash + ")";
                    ctx.fillRect(0,0,w,h);
                }

                ctx.restore();
            }
        } catch (e) {
            GameState.fatalError = "CRASH DRAW: " + e.message;
        }
    };

    Game._drawEnd = function(ctx, w, h) {
        if (!ctx) return;
        ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,w,h);
        ctx.textAlign = "center"; 
        if (GameState.status === 'VICTORY') {
            ctx.fillStyle = "#2ecc71"; ctx.font = "bold 50px Arial"; ctx.fillText("MISSÃO CUMPRIDA", w/2, h/2 - 30);
            ctx.fillStyle = "#f1c40f"; ctx.font = "20px Arial"; ctx.fillText("PAGAMENTO: R$ " + GameState.session.cash, w/2, h/2 + 20);
        } else {
            ctx.fillStyle = "#e74c3c"; ctx.font = "bold 50px Arial"; ctx.fillText("CAÇA ABATIDO", w/2, h/2 - 30);
            ctx.fillStyle = "#fff"; ctx.font = "20px Arial"; ctx.fillText("PILOTO EJETADO", w/2, h/2 + 20);
        }
    };

    Game.init = Game._init; Game.update = Game._update; Game.draw = Game._draw; Game.render = Game._draw; Game.renderEnd = Game._drawEnd;

    // =====================================================================
    // LÓGICA DE CONTROLO (VOLANTE MAIS FÁCIL E ÁGIL)
    // =====================================================================
    Game.processMobileInputs = function(kps, dt, h) {
        var rawPitch = 0, rawRoll = 0, fireCmd = false;

        if (GameState.keys['ArrowUp']) rawPitch = 1.0; else if (GameState.keys['ArrowDown']) rawPitch = -1.0;
        if (GameState.keys['ArrowRight']) rawRoll = 1.0; else if (GameState.keys['ArrowLeft']) rawRoll = -1.0;
        if (GameState.keys[' ']) fireCmd = true;

        var rightWrist = null, leftWrist = null;
        var arr = kps;
        if (kps && !Array.isArray(kps) && kps[0] && kps[0].keypoints) arr = kps[0].keypoints;

        if (arr && Array.isArray(arr)) {
            for(var i=0; i<arr.length; i++) {
                var k = arr[i];
                if (!k) continue;
                if ((k.name === 'right_wrist' || i === 10) && k.score > 0.3) rightWrist = k;
                if ((k.name === 'left_wrist' || i === 9) && k.score > 0.3) leftWrist = k;
            }
        }

        if (rightWrist && leftWrist) {
            var rx = rightWrist.x, ry = rightWrist.y, lx = leftWrist.x, ly = leftWrist.y;

            // VOLANTE (Roll): Inclinação geométrica
            rawRoll = Math.max(-1.0, Math.min(1.0, Math.atan2(ry - ly, rx - lx) / 1.5));

            // PITCH (Cima/Baixo): Altura média, SENSÍVEL PARA SUBIR MAIS FÁCIL
            var avgY = (ry + ly) / 2;
            if (GameState.status === 'CALIBRATION') {
                GameState.hotas.calibratedY = GameState.hotas.calibratedY * 0.9 + avgY * 0.1;
                if (!GameState.hotas.calibratedY) GameState.hotas.calibratedY = avgY;
            } else {
                var deltaY = avgY - GameState.hotas.calibratedY;
                // Deadzone menor (5%) para reação imediata
                var threshold = 480 * 0.05; 
                
                // Se as mãos sobem (delta negativo), o nariz do avião Sobe
                if (deltaY < -threshold) {
                    rawPitch = 1.0 * Math.min(1, Math.abs(deltaY + threshold) / 100); 
                } 
                // Se descem, Mergulha
                else if (deltaY > threshold) {
                    rawPitch = -1.0 * Math.min(1, Math.abs(deltaY - threshold) / 100); 
                }
            }

            // ATIRAR: Bater palmas / aproximar as mãos (< 100px)
            if (Math.sqrt((rx-lx)*(rx-lx) + (ry-ly)*(ry-ly)) < 120) fireCmd = true;

            GameState.hotas.lastValidPitch = rawPitch;
            GameState.hotas.lastValidRoll = rawRoll;
        } else if (GameState.status === 'PLAYING') {
            rawPitch = GameState.hotas.lastValidPitch || 0;
            rawRoll = GameState.hotas.lastValidRoll || 0;
        }

        var applyCurve = function(val, expo) {
            var sign = val < 0 ? -1 : 1;
            return sign * Math.pow(Math.abs(val), expo);
        };

        var targetPitch = applyCurve(rawPitch, 1.2); // Curva menos agressiva para facilitar o controlo
        var targetRoll = applyCurve(rawRoll, 1.2);

        GameState.player.inputs.pitch += (targetPitch - GameState.player.inputs.pitch) * (dt * 15.0); // Resposta hiper rápida
        GameState.player.inputs.roll += (targetRoll - GameState.player.inputs.roll) * (dt * 15.0);
        
        if (fireCmd && GameState.radarTarget && GameState.lockTimer > 1.5 && GameState.missileCd <= 0) {
            GameState.missileCd = 1.0;
            if(window.Sfx && window.Sfx.play) window.Sfx.play(600, 'sawtooth', 0.5, 0.2);
            GameState.entities.missiles.push(createMissile(GameState.player, GameState.radarTarget, false));
            GameState.lockTimer = 0; 
        }
    };

    Game.spawnWave = function() {
        var count = (GameState.session.wave === 3) ? 1 : 3; 
        var planeType = (GameState.session.wave === 3) ? PLANES.boss_su57 : PLANES.falcon_lite;

        for(var i=0; i<count; i++) {
            var e = createPhysicsEntity(
                GameState.player.pos.x + (Math.random() * 10000 - 5000), 
                2000 + Math.random() * 3000, 
                GameState.player.pos.z + 5000 + (Math.random() * 10000),
                planeType 
            );
            if (GameState.session.wave === 3) {
                e.hp = 800; e.isBoss = true;
            }
            GameState.entities.enemies.push(e);
        }
    };

    Game.updateMissionSystem = function() {
        if (GameState.session.mode !== 'SINGLE') return;
        if (GameState.entities.enemies.length === 0) {
            if (GameState.session.wave >= 3) Game.endGame('VICTORY');
            else { GameState.session.wave++; Game.spawnWave(); }
        }
    };

    Game.updateAI = function(dt) {
        GameState.entities.enemies.forEach(function(e) {
            if (!e.active) return;
            
            e.stateTimer -= dt;
            if (e.stateTimer <= 0) e.stateTimer = 0.5 + Math.random() * 1.5;

            var dx = GameState.player.pos.x - e.pos.x;
            var dy = GameState.player.pos.y - e.pos.y;
            var dz = GameState.player.pos.z - e.pos.z;
            
            var distToPlayer = Math.sqrt((dx*dx) + (dy*dy) + (dz*dz));
            e.throttle = e.isBoss ? 1.0 : 0.8; 

            if (e.pos.y < 1500) {
                e.inputs.roll = Math.max(-1, Math.min(1, 0 - e.roll));
                e.inputs.pitch = 1.0; 
            } else if (e.isStalling) {
                e.inputs.pitch = -1.0;
            } else {
                var targetYaw = Math.atan2(dx, dz);
                var yawDiff = targetYaw - e.yaw;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

                e.inputs.roll = Math.max(-1, Math.min(1, (yawDiff * 3.0) - e.roll));
                e.inputs.pitch = Math.max(-1, Math.min(1, Math.abs(yawDiff) < 0.5 ? 0.8 : 0.2));
            }

            updatePhysics(e, dt);

            if (e.isBoss && distToPlayer < 5000 && Math.abs(yawDiff) < 0.3 && Math.random() < 0.02) {
                GameState.entities.missiles.push(createMissile(e, GameState.player, true));
            }
        });
    };

    Game.updateEntities = function(dt) {
        GameState.entities.missiles.forEach(function(m) { 
            updateMissile(m, dt); 
            if (m.active && Math.random() > 0.1) GameState.entities.particles.push(createParticle(m.pos.x, m.pos.y, m.pos.z, m.isEnemy ? "#ff5500" : "#ffffff", 8, 0.8, 'smoke')); 
        });
        
        var activeMissiles = [];
        for(var i=0; i<GameState.entities.missiles.length; i++) {
            if(GameState.entities.missiles[i].active) activeMissiles.push(GameState.entities.missiles[i]);
        }
        GameState.entities.missiles = activeMissiles;

        GameState.entities.enemies.forEach(function(e) {
            if (e.hp <= 0 && e.active) {
                e.active = false;
                // Explosão Cinematográfica
                for(var j=0; j<40; j++) {
                    GameState.entities.particles.push(createParticle(e.pos.x, e.pos.y, e.pos.z, "#ffcc00", Math.random()*30+10, 1.5, 'fire'));
                    GameState.entities.particles.push(createParticle(e.pos.x, e.pos.y, e.pos.z, "#333333", Math.random()*50+20, 3.0, 'smoke'));
                }
                GameState.session.kills++; 
                GameState.session.cash += e.isBoss ? GAME_CONFIG.MONEY_BOSS_BONUS : GAME_CONFIG.MONEY_PER_KILL; 
                if(window.Sfx && window.Sfx.play) window.Sfx.play(150, 'square', 0.8, 0.5); 
            }
        });
        
        var activeEnemies = [];
        for(var k=0; k<GameState.entities.enemies.length; k++) {
            if(GameState.entities.enemies[k].active) activeEnemies.push(GameState.entities.enemies[k]);
        }
        GameState.entities.enemies = activeEnemies;

        GameState.entities.particles.forEach(function(p) { updateParticle(p, dt); });
        
        var activeParticles = [];
        for(var p=0; p<GameState.entities.particles.length; p++) {
            if(GameState.entities.particles[p].life > 0) activeParticles.push(GameState.entities.particles[p]);
        }
        GameState.entities.particles = activeParticles;
    };

    Game.updateCombatSystem = function(dt, w, h) {
        var closestDist = Infinity, target = null;
        GameState.entities.enemies.forEach(function(e) {
            if(!e.active) return;
            var proj = Engine3D.project(e.pos, GameState.player, w||640, h||480);
            if (proj.visible && proj.z > 200 && proj.z < 60000 && Math.abs(proj.x - (w||640)/2) < (w||640)*0.3 && Math.abs(proj.y - (h||480)/2) < (h||480)*0.3 && proj.z < closestDist) {
                closestDist = proj.z; target = e;
            }
        });

        if (target) {
            GameState.radarTarget = target; GameState.lockTimer += dt;
            if (window.Sfx && window.Sfx.play) {
                if (GameState.lockTimer > 1.5 && Math.floor(GameState.session.time * 10) % 2 === 0) window.Sfx.play(1200, 'square', 0.05, 0.05);
                else if (Math.floor(GameState.session.time * 5) % 2 === 0) window.Sfx.play(800, 'square', 0.05, 0.02);
            }
        } else { GameState.radarTarget = null; GameState.lockTimer = 0; }

        if (GameState.vulcanCd > 0) GameState.vulcanCd -= dt;
        if (GameState.missileCd > 0) GameState.missileCd -= dt;

        // Auto-Metralhadora
        if (GameState.radarTarget && GameState.lockTimer >= 0.5 && GameState.vulcanCd <= 0 && closestDist < 5000) {
            GameState.vulcanCd = 0.1;
            if(window.Sfx && window.Sfx.play) window.Sfx.play(300, 'sawtooth', 0.08, 0.15);
            // Visual tracer
            var fwdX = Math.sin(GameState.player.yaw)*Math.cos(GameState.player.pitch);
            var fwdY = Math.sin(GameState.player.pitch);
            var fwdZ = Math.cos(GameState.player.yaw)*Math.cos(GameState.player.pitch);
            GameState.entities.particles.push(createParticle(
                GameState.player.pos.x + fwdX*100, GameState.player.pos.y-20, GameState.player.pos.z + fwdZ*100, 
                "#ffff00", 4, 0.2, 'tracer'
            ));
            // Dano direto probabilístico
            if (Math.random() < 0.3) {
                GameState.radarTarget.hp -= 5;
                GameState.entities.particles.push(createParticle(GameState.radarTarget.pos.x, GameState.radarTarget.pos.y, GameState.radarTarget.pos.z, "#ff9900", 15, 0.5, 'fire'));
            }
        }
    };

    Game.endGame = function(finalState) {
        GameState.status = finalState;
        var totalCash = GameState.session.cash + (finalState === 'VICTORY' ? GAME_CONFIG.MONEY_MISSION_BONUS : 0);
        setTimeout(function() {
            if (window.System && window.System.gameOver) window.System.gameOver(GameState.session.kills*100, finalState === 'VICTORY', totalCash);
            else if (window.System && window.System.home) window.System.home();
        }, 4000);
    };

    // =====================================================================
    // O NOVO VISUAL BLACK PS2 (RENDERIZAÇÃO HD)
    // =====================================================================
    Game.drawHangar = function(ctx, w, h) {
        ctx.fillStyle = "#050a10"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "#00ffcc"; ctx.font = "bold 40px Arial"; ctx.textAlign = "center";
        ctx.fillText("TACTICAL FIGHTER PREP", w/2, 80);
        ctx.fillStyle = "#fff"; ctx.font = "20px Arial";
        ctx.fillText("Iniciando Computador de Voo e Dinâmica de Fluidos...", w/2, h/2);
    };

    Game.draw3DWorld = function(ctx, w, h) {
        var p = GameState.player;
        ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(-p.roll);
        
        var hy = Math.sin(p.pitch) * h * 1.5; 
        
        // CÉU MILITAR HD
        var sG = ctx.createLinearGradient(0,-h*4,0,hy);
        sG.addColorStop(0,'#0a1a2a'); 
        sG.addColorStop(0.6,'#2a4a6a'); 
        sG.addColorStop(1,'#88aacc'); // Névoa atmosférica
        ctx.fillStyle = sG;
        ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);

        // SOL
        ctx.fillStyle = "rgba(255, 255, 200, 0.4)";
        ctx.shadowBlur = 50; ctx.shadowColor = "#ffcc00";
        ctx.beginPath(); ctx.arc(0, hy - 100, 60, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        
        // CHÃO CYBER/MILITAR
        var gG = ctx.createLinearGradient(0,hy,0,h*4);
        gG.addColorStop(0,'#111115'); // Névoa na distância
        gG.addColorStop(0.3,'#051505'); 
        gG.addColorStop(1,'#000000');
        ctx.fillStyle = gG;
        ctx.fillRect(-w*3,hy,w*6,h*4);
        
        // GRELHA PERSPECTIVA 3D
        ctx.strokeStyle='rgba(0, 255, 100, 0.15)'; ctx.lineWidth=2; 
        ctx.beginPath();
        var st=10000, sx=Math.floor(p.pos.x/st)*st-st*10, sz=Math.floor(p.pos.z/st)*st-st*10;
        for(var x=0;x<=20;x++) for(var z=0;z<=20;z++) {
            var gProj = Engine3D.project({x: sx+x*st, y:0, z: sz+z*st}, p, w, h);
            if(gProj.visible && gProj.s>0.01) { 
                ctx.moveTo(gProj.x-30*gProj.s, gProj.y); 
                ctx.lineTo(gProj.x+30*gProj.s, gProj.y); 
            }
        }
        ctx.stroke();
        
        ctx.strokeStyle='rgba(0,255,200,0.6)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-w*3,hy); ctx.lineTo(w*3,hy); ctx.stroke();
        ctx.restore();
    };

    Game.drawEntities = function(ctx, w, h) {
        var buf=[];
        var p = GameState.player;
        
        GameState.entities.enemies.forEach(function(e) {
            var proj = Engine3D.project(e.pos, p, w, h);
            if (proj.visible) buf.push({p: proj, t: 'e', o: e});
        });

        GameState.entities.particles.forEach(function(part) {
            var proj = Engine3D.project(part.pos, p, w, h);
            if (proj.visible) buf.push({p: proj, t: 'part', o: part});
        });

        GameState.entities.missiles.forEach(function(m) {
            var proj = Engine3D.project(m.pos, p, w, h);
            if (proj.visible) buf.push({p: proj, t: 'm', o: m});
        });
        
        buf.sort(function(a,b) { return b.p.z - a.p.z; });
        
        buf.forEach(function(d) {
            var pr=d.p, s=pr.s, o=d.o;
            if(d.t==='e'){
                Engine3D.drawJetModel(ctx, pr.x, pr.y, Math.max(0.1, s*2), o.roll - p.roll, true, o.stats ? o.stats.color : '#e74c3c');
                if (GameState.radarTarget === o) {
                    ctx.strokeStyle = GameState.lockTimer > 1.5 ? "#ff0000" : "#00ffcc"; ctx.lineWidth = 2;
                    var bs = Math.max(40, 250*s); 
                    ctx.strokeRect(pr.x - bs, pr.y - bs, bs*2, bs*2);
                    
                    // Box de Mira do PS2
                    ctx.beginPath(); ctx.moveTo(pr.x, pr.y - bs); ctx.lineTo(pr.x, pr.y - bs - 20); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(pr.x, pr.y + bs); ctx.lineTo(pr.x, pr.y + bs + 20); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(pr.x - bs, pr.y); ctx.lineTo(pr.x - bs - 20, pr.y); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(pr.x + bs, pr.y); ctx.lineTo(pr.x + bs + 20, pr.y); ctx.stroke();

                    if (GameState.lockTimer > 1.5) { 
                        ctx.fillStyle = "#ff0000"; ctx.font = "bold 14px Arial"; ctx.textAlign='center'; 
                        ctx.fillText("LOCKED", pr.x, pr.y + bs + 35); 
                    }
                }
            }
            else if(d.t==='part'){
                ctx.globalCompositeOperation='lighter'; 
                ctx.fillStyle = o.color; 
                ctx.globalAlpha = Math.max(0, o.life / o.maxLife);
                ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(2, o.size * s), 0, Math.PI*2); ctx.fill();
                
                if (o.type === 'fire') {
                    ctx.shadowBlur = 20; ctx.shadowColor = o.color; ctx.fill(); ctx.shadowBlur = 0;
                }
                ctx.globalAlpha = 1.0; ctx.globalCompositeOperation='source-over';
            }
            else if(d.t==='m'){
                ctx.fillStyle=o.isEnemy?'#ff3300':'#ffffff';
                ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
                ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(2, 6*s), 0, Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
            }
        });
    };

    Game.drawHUD = function(ctx, w, h) {
        var p = GameState.player, hudColor = "#00ffcc";
        ctx.fillStyle = hudColor; ctx.strokeStyle = hudColor; ctx.font = "bold 16px Arial";

        // MIRA CENTRAL
        ctx.beginPath(); ctx.arc(w/2, h/2, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(w/2, h/2, 20, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w/2 - 40, h/2); ctx.lineTo(w/2 - 20, h/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w/2 + 40, h/2); ctx.lineTo(w/2 + 20, h/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w/2, h/2 - 40); ctx.lineTo(w/2, h/2 - 20); ctx.stroke();

        ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(p.roll);
        for(var i = -4; i <= 4; i++) {
            if (i === 0) continue;
            var yPos = ((i * 0.17) + p.pitch) * 400; 
            if (yPos > -h/2 && yPos < h/2) {
                ctx.beginPath(); if (i < 0) ctx.setLineDash([5, 5]); 
                ctx.moveTo(-60, yPos); ctx.lineTo(-30, yPos); ctx.lineTo(-30, yPos + (i < 0 ? -10 : 10)); 
                ctx.moveTo(60, yPos); ctx.lineTo(30, yPos); ctx.lineTo(30, yPos + (i < 0 ? -10 : 10));
                ctx.stroke(); ctx.setLineDash([]); ctx.font = "12px Arial"; ctx.textAlign = "right"; ctx.fillText(Math.abs(i*10), -65, yPos + 4); ctx.textAlign = "left"; ctx.fillText(Math.abs(i*10), 65, yPos + 4);
            }
        }
        ctx.restore();

        // TELEMETRIA MILITAR (Fitas Laterais Transparentes)
        ctx.fillStyle = 'rgba(0,20,10,0.5)'; ctx.fillRect(10, h/2 - 120, 50, 240);
        ctx.fillStyle = hudColor; ctx.textAlign = "center"; ctx.fillText("SPD", 35, h/2 - 130);
        ctx.beginPath(); ctx.moveTo(60, h/2); ctx.lineTo(70, h/2 - 8); ctx.lineTo(70, h/2 + 8); ctx.fill(); 
        ctx.fillText(Math.floor(p.speed * 3.6), 35, h/2 + 6); ctx.font = "12px Arial"; ctx.fillText("M " + p.mach.toFixed(2), 35, h/2 + 140);

        ctx.fillStyle = 'rgba(0,20,10,0.5)'; ctx.fillRect(w - 60, h/2 - 120, 50, 240);
        ctx.fillStyle = hudColor; ctx.textAlign = "center"; ctx.font = "bold 16px Arial"; ctx.fillText("ALT", w - 35, h/2 - 130);
        ctx.beginPath(); ctx.moveTo(w - 60, h/2); ctx.lineTo(w - 70, h/2 - 8); ctx.lineTo(w - 70, h/2 + 8); ctx.fill(); 
        ctx.fillText(Math.floor(p.pos.y), w - 35, h/2 + 6);

        var hdg=(p.yaw*180/Math.PI)%360; if(hdg<0) hdg+=360;
        ctx.fillStyle = 'rgba(0,20,10,0.5)'; ctx.fillRect(w/2 - 60, 10, 120, 30);
        ctx.fillStyle = hudColor;
        ctx.fillText(Math.floor(hdg)+'°', w/2, 32); ctx.beginPath(); ctx.moveTo(w/2, 40); ctx.lineTo(w/2 - 6, 50); ctx.lineTo(w/2 + 6, 50); ctx.fill();

        ctx.textAlign = "left"; ctx.fillText("G-FORCE: " + p.gForce.toFixed(1) + "G", 20, 80);
        ctx.fillText("AoA: " + (p.alpha * 180/Math.PI).toFixed(1) + "°", 20, 100);
        if (GameState.session.mode === 'SINGLE') ctx.fillText("WAVE: " + GameState.session.wave + "/3", 20, 120);
        
        if (p.isStalling) {
            ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
            ctx.textAlign = "center"; ctx.font = "bold 32px Arial"; ctx.fillText("STALL - PUSH DOWN", w/2, h/2 - 100); 
        }
        if (GameState.lockTimer > 1.5) { ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 24px Arial"; ctx.fillText("CLAP TO FIRE!", w/2, h/2 + 100); }
    };

    Game.drawRadar = function(ctx, w, h) {
        var radarSize = 100; var rx = w - radarSize - 20; var ry = h - radarSize - 20;
        ctx.strokeStyle = "rgba(0, 255, 204, 0.5)"; ctx.lineWidth = 2;
        ctx.fillStyle = "rgba(0, 20, 40, 0.6)"; 
        ctx.beginPath(); ctx.arc(rx + radarSize/2, ry + radarSize/2, radarSize/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        ctx.beginPath(); ctx.moveTo(rx, ry+radarSize/2); ctx.lineTo(rx+radarSize, ry+radarSize/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx+radarSize/2, ry); ctx.lineTo(rx+radarSize/2, ry+radarSize); ctx.stroke();
        
        ctx.fillStyle = "#0f0"; ctx.beginPath(); ctx.arc(rx + radarSize/2, ry + radarSize/2, 3, 0, Math.PI*2); ctx.fill();

        GameState.entities.enemies.forEach(function(e) {
            var dx = (e.pos.x - GameState.player.pos.x) * 0.005; var dz = (e.pos.z - GameState.player.pos.z) * 0.005;
            if (dx*dx + dz*dz < (radarSize/2)*(radarSize/2)) {
                var px = rx + radarSize/2 + dx; var py = ry + radarSize/2 + dz;
                ctx.fillStyle = e.isBoss ? "#f39c12" : "#e74c3c"; 
                ctx.beginPath(); ctx.arc(px, py, e.isBoss ? 4 : 3, 0, Math.PI*2); ctx.fill();
            }
        });
    };

    Game.drawPilotFX = function(ctx, w, h) {
        var p = GameState.player;
        if (p.gForce > 5.0) {
            var intensity = Math.min(1.0, (p.gForce - 5.0) / 4.0); 
            ctx.fillStyle = "rgba(0, 0, 0, " + (intensity * 0.8) + ")"; ctx.fillRect(0,0,w,h);
        } else if (p.gForce < -1.5) {
            var intensityN = Math.min(1.0, (Math.abs(p.gForce) - 1.5) / 2.0);
            ctx.fillStyle = "rgba(231, 76, 60, " + (intensityN * 0.6) + ")"; ctx.fillRect(0,0,w,h);
        }
    };

    Game.drawCockpitYoke = function(ctx, w, h) {
        var cx = w/2, cy = h/2;
        
        // O YOKE DE DUAS MÃOS ILUMINADO
        if (GameState.status === 'PLAYING' || GameState.status === 'CALIBRATION') {
            ctx.save();
            var trgPitch = GameState.player.inputs.pitch || 0;
            var trgRoll = GameState.player.inputs.roll || 0;
            
            var yokeYOffset = 0;
            if (trgPitch < -0.2) yokeYOffset = 40; 
            else if (trgPitch > 0.2) yokeYOffset = -40; 
            
            ctx.translate(cx, h + yokeYOffset + 20); // Mais baixo e realista
            
            // Haste
            ctx.fillStyle='#050a10'; ctx.fillRect(-30,-180,60,180); 
            ctx.translate(0,-160); ctx.rotate(trgRoll);
            
            // O Volante em Si (Cyber/Militar look)
            ctx.shadowBlur = 10; ctx.shadowColor = "#000";
            ctx.fillStyle='#1a202c'; ctx.strokeStyle='#00ffcc'; ctx.lineWidth=3; ctx.lineJoin='round';
            
            ctx.beginPath();
            ctx.moveTo(-130, -20);
            ctx.lineTo(-150, 60);
            ctx.lineTo(-80, 80);
            ctx.lineTo(80, 80);
            ctx.lineTo(150, 60);
            ctx.lineTo(130, -20);
            ctx.lineTo(70, -20);
            ctx.lineTo(70, 30);
            ctx.lineTo(-70, 30);
            ctx.lineTo(-70, -20);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            // Painéis dos botões
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-110, 0, 20, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(110, 0, 20, 0, Math.PI*2); ctx.fill();

            // Botão de Disparo Esq
            ctx.fillStyle = GameState.missileCd <= 0 ? '#ff3300' : '#440000'; 
            ctx.shadowBlur = GameState.missileCd <= 0 ? 15 : 0; ctx.shadowColor = '#ff0000';
            ctx.beginPath(); ctx.arc(-110, 0, 10, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;

            // Botão Dir
            ctx.fillStyle='#ffcc00'; ctx.beginPath(); ctx.arc(110, 0, 10, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        }

        ctx.fillStyle='rgba(0,15,10,0.8)';ctx.fillRect(0,h-50,w,50);
        ctx.fillStyle='#222';ctx.fillRect(20,h-30,w/2 - 40,12);
        ctx.fillStyle=GameState.player.hp>30?'#00ffcc':'#ff3300';
        ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(20,h-30,(w/2 - 40)*(Math.max(0,GameState.player.hp)/100),12);
        ctx.shadowBlur = 0;
        ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.textAlign='left';ctx.fillText("HP: " + Math.floor(GameState.player.hp) + "%",20,h-35);
        ctx.fillStyle='#f1c40f';ctx.font='bold 22px Arial';ctx.textAlign='right';ctx.fillText("$" + GameState.session.cash,w-20,h-20);
    };

    Game.drawCalibration = function(ctx, w, h) {
        ctx.fillStyle = "rgba(0,15,25,0.95)"; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle = "rgba(0,255,204,0.3)"; ctx.lineWidth = 2; ctx.strokeRect(40,40,w-80,h-80);
        
        ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 36px Arial";
        ctx.fillText("SISTEMA DE VOO ONLINE", w/2, h/2 - 60);
        
        ctx.font = "bold 20px Arial"; ctx.fillStyle = "#fff";
        ctx.fillText("Coloque as DUAS MÃOS no ecrã como se segurasse um volante.", w/2, h/2);
        ctx.fillStyle = "#aaaaaa"; ctx.font = "16px Arial";
        ctx.fillText("Rode as mãos para virar o avião. Suba as mãos para mergulhar.", w/2, h/2 + 30);
        ctx.fillStyle = "#ffcc00"; ctx.font = "bold 18px Arial";
        ctx.fillText("Bata palmas (Junte as mãos) para disparar Mísseis.", w/2, h/2 + 60);
        
        ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 3;
        var scannerY = (h/2 + 150) + Math.sin(performance.now() * 0.01) * 30;
        ctx.beginPath(); ctx.moveTo(w/2 - 150, scannerY); ctx.lineTo(w/2 + 150, scannerY); ctx.stroke();
    };

    Game._drawLobby = function(ctx,w,h) {
        ctx.fillStyle = "rgba(0,0,0,1)"; ctx.fillRect(0,0,w,h); // Fallback caso não seja chamado
    };

    // =========================================================================
    // 6. REGISTRO NO SISTEMA (THIAGUINHO OS)
    // =========================================================================
    var register = function() {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike: BLACK OPS', '✈️', Game, {
                camera: 'user', camOpacity: 0.2, // Câmara mais escura para o jogo brilhar
                phases: [
                    { id: 'training', name: 'CAMPANHA SOLO', desc: 'Calibrate controls. Engage aerial targets.', mode: 'SINGLE', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) {
        var check = setInterval(function() { if (register()) clearInterval(check); }, 100);
    }
})();
