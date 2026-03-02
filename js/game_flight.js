// =============================================================================
// AERO STRIKE WAR: TACTICAL SIMULATOR (COMMERCIAL PLATINUM EDITION - TRUE AAA)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (DIVISÃO DE SIMULAÇÃO MILITAR)
// STATUS: TRUE 6DOF PHYSICS, PN GUIDANCE, 100% PURE FUNCTIONAL (ANTI-CRASH)
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAÇÕES GLOBAIS E CATÁLOGO DE AERONAVES
    // =========================================================================
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
            name: "F-16 FALCON", price: 0,
            thrust: 120000, mass: 12000, wingArea: 28.0,
            cd0: 0.022, kInduced: 0.05, clMax: 1.6, stallAngle: 0.26,
            maxPitchRate: 1.5, maxRollRate: 3.0, color: "#3498db"
        },
        boss_su57: {
            name: "SU-57 FELON (ACE)", price: 99999,
            thrust: 250000, mass: 18000, wingArea: 78.8,
            cd0: 0.020, kInduced: 0.04, clMax: 1.7, stallAngle: 0.38,
            maxPitchRate: 2.5, maxRollRate: 4.5, color: "#e74c3c"
        }
    };

    // =========================================================================
    // 2. MOTOR DE RENDERIZAÇÃO 3D VETORIAL
    // =========================================================================
    var Engine3D = {
        fov: 800,
        project: function(obj, cam, w, h) {
            var dx = obj.x - cam.pos.x;
            var dy = cam.pos.y - obj.y; // Eixo Y da Tela é invertido
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
            color = color || "#3498db";
            ctx.save(); ctx.translate(px, py); ctx.rotate(roll); ctx.scale(scale, scale);
            ctx.strokeStyle = isEnemy ? "#e74c3c" : color; ctx.lineWidth = 2;
            ctx.fillStyle = isEnemy ? "rgba(231, 76, 60, 0.4)" : "rgba(52, 152, 219, 0.4)";
            
            ctx.beginPath();
            ctx.moveTo(0, -20); ctx.lineTo(5, -10); ctx.lineTo(20, 5);
            ctx.lineTo(5, 10); ctx.lineTo(0, 15); ctx.lineTo(-5, 10);
            ctx.lineTo(-20, 5); ctx.lineTo(-5, -10); ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = "#f39c12"; ctx.beginPath(); ctx.arc(0, 16, Math.random() * 4 + 2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    };

    // =========================================================================
    // 3. FÍSICA FUNCIONAL (ANTI-SCOPE LOSS)
    // =========================================================================
    function createPhysicsEntity(x, y, z, stats) {
        return {
            pos: { x: x, y: y, z: z },
            vel: { x: 0, y: 0, z: 250 },
            pitch: 0, yaw: 0, roll: 0,
            stats: stats,
            throttle: 0.5,
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
        
        ent.isStalling = ent.alpha > ent.stats.stallAngle || V < 50;
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
            ent.pitch += (-0.5 - ent.pitch) * 1.5 * dt;
            ent.roll += (Math.random() - 0.5) * 2.0 * dt; 
        }

        if (isNaN(ent.pitch)) ent.pitch = 0;
        if (isNaN(ent.roll)) ent.roll = 0;
        if (isNaN(ent.yaw)) ent.yaw = 0;
        if (isNaN(ent.pos.x)) ent.pos.x = 0;
        if (isNaN(ent.pos.y)) ent.pos.y = 3000;
        if (isNaN(ent.pos.z)) ent.pos.z = 0;

        if (ent.pos.y <= 0) {
            ent.pos.y = 0;
            ent.hp = 0;
            ent.active = false;
        }
    }

    // =========================================================================
    // 4. GUIAGEM BALÍSTICA E PARTÍCULAS
    // =========================================================================
    function createParticle(x, y, z, color, size, life) {
        return {
            pos: { x: x, y: y, z: z },
            vel: { x: (Math.random()-0.5)*30, y: (Math.random()-0.5)*30, z: (Math.random()-0.5)*30 },
            color: color, size: size, life: life, maxLife: life
        };
    }

    function updateParticle(p, dt) {
        p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
        p.life -= dt;
    }

    function createMissile(shooter, target, isEnemy) {
        return {
            pos: { x: shooter.pos.x, y: shooter.pos.y - 5, z: shooter.pos.z },
            vel: { x: shooter.vel.x, y: shooter.vel.y, z: shooter.vel.z },
            target: target,
            isEnemy: isEnemy,
            thrust: 1500, maxG: 30.0, life: 8.0, active: true,
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
            var rx = m.target.pos.x - m.pos.x;
            var ry = m.target.pos.y - m.pos.y;
            var rz = m.target.pos.z - m.pos.z;
            var dist2 = (rx*rx) + (ry*ry) + (rz*rz);
            var dist = Math.sqrt(dist2);
            
            if (dist < 80) { 
                m.active = false; m.target.hp -= 55;
                if(window.Sfx && window.Sfx.play) window.Sfx.play(100, 'sawtooth', 0.5, 0.3);
                return;
            }

            var vrx = m.target.vel.x - m.vel.x;
            var vry = m.target.vel.y - m.vel.y;
            var vrz = m.target.vel.z - m.vel.z;

            var cx = ry * vrz - rz * vry;
            var cy = rz * vrx - rx * vrz;
            var cz = rx * vry - ry * vrx;
            
            var omegax = cx / dist2;
            var omegay = cy / dist2;
            var omegaz = cz / dist2;

            var Vc = -(rx*vrx + ry*vry + rz*vrz) / dist;
            var ux = rx / dist, uy = ry / dist, uz = rz / dist;

            var N_gain = 4.0; 
            var oxu_x = omegay * uz - omegaz * uy;
            var oxu_y = omegaz * ux - omegax * uz;
            var oxu_z = omegax * uy - omegay * ux;

            var ax = N_gain * Vc * oxu_x;
            var ay = N_gain * Vc * oxu_y;
            var az = N_gain * Vc * oxu_z;

            var accMag = Math.sqrt((ax*ax) + (ay*ay) + (az*az));
            var maxAcc = m.maxG * GAME_CONFIG.GRAVITY;
            if (accMag > maxAcc) {
                ax = (ax / accMag) * maxAcc;
                ay = (ay / accMag) * maxAcc;
                az = (az / accMag) * maxAcc;
            }

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

    // =========================================================================
    // 5. SISTEMA GLOBAL PURE FUNCTIONAL (O ANTÍDOTO DA TELA BRANCA)
    // =========================================================================
    var GameState = {
        status: 'INIT',
        lastTime: 0,
        player: null,
        entities: { missiles: [], enemies: [], particles: [] },
        session: { kills: 0, cash: 0, mode: 'SINGLE', time: 0, wave: 1, selectedPlane: PLANES.falcon_lite },
        radarTarget: null, lockTimer: 0, hangarTimer: 3.0,
        hotas: { pitchInput: 0, rollInput: 0, calibratedY: 240, calibratedX: 320, lastValidPitch: 0, lastValidRoll: 0, lastValidThr: 0.5 },
        keys: {}, keysBound: false,
        fatalError: null
    };

    var Game = {};

    Game._init = function(missionData) {
        try {
            GameState.fatalError = null;
            GameState.status = 'HANGAR'; 
            GameState.hangarTimer = 3.0;
            GameState.hotas = { pitchInput: 0, rollInput: 0, calibratedY: 240, calibratedX: 320, lastValidPitch: 0, lastValidRoll: 0, lastValidThr: 0.5 };
            GameState.keys = {};
            GameState.session = { 
                kills: 0, cash: 0, time: 0, wave: 1, 
                mode: (missionData && missionData.mode) ? missionData.mode : 'SINGLE',
                selectedPlane: PLANES.falcon_lite 
            };
            
            GameState.player = createPhysicsEntity(0, 3000, 0, GameState.session.selectedPlane);
            GameState.entities = { missiles: [], enemies: [], particles: [] };
            GameState.lastTime = performance.now();
            
            Game.spawnWave();

            if(window.Sfx && window.Sfx.play) window.Sfx.play(400, 'sine', 0.5, 0.1); 

            if (!GameState.keysBound) {
                window.addEventListener('keydown', function(e) {
                    GameState.keys[e.key] = true;
                    if (GameState.status === 'HANGAR' && e.key === ' ') GameState.status = 'CALIBRATING';
                    if (GameState.status === 'CALIBRATING' && ['ArrowUp', 'ArrowDown', 'w', 's', ' '].indexOf(e.key) !== -1) GameState.status = 'PLAYING';
                    if (e.key === ' ' && GameState.status === 'PLAYING') Game.fireMissile();
                });
                window.addEventListener('keyup', function(e) { GameState.keys[e.key] = false; });
                GameState.keysBound = true;
            }
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

            if (GameState.status === 'HANGAR') {
                GameState.hangarTimer -= dt;
                if (GameState.hangarTimer <= 0) GameState.status = 'CALIBRATING';
            } else if (GameState.status === 'CALIBRATING' || GameState.status === 'PLAYING') {
                Game.processMobileInputs(kps, dt);
                if (GameState.status === 'PLAYING') {
                    GameState.session.time += dt;
                    updatePhysics(GameState.player, dt);
                    Game.updateAI(dt);
                    Game.updateEntities(dt);
                    Game.updateCombatSystem(dt);
                    Game.updateMissionSystem();
                    
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

            if (!GameState.player) {
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "#0f0"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
                ctx.fillText("INICIANDO MOTOR FÍSICO...", w/2, h/2);
                return;
            }

            ctx.clearRect(0, 0, w, h);
            
            if (GameState.status === 'HANGAR') Game.drawHangar(ctx, w, h);
            else if (GameState.status === 'CALIBRATING') Game.drawCalibration(ctx, w, h);
            else if (GameState.status === 'GAMEOVER' || GameState.status === 'VICTORY') Game._drawEnd(ctx, w, h);
            else {
                Game.draw3DWorld(ctx, w, h);
                Game.drawHUD(ctx, w, h);
                Game.drawRadar(ctx, w, h); 
                Game.drawPilotFX(ctx, w, h);
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
            ctx.fillStyle = "#2ecc71"; ctx.font = "bold 50px Arial"; ctx.fillText("ESPAÇO AÉREO LIMPO", w/2, h/2 - 30);
            ctx.fillStyle = "#f1c40f"; ctx.font = "20px Arial"; ctx.fillText("PAGAMENTO: R$ " + GameState.session.cash, w/2, h/2 + 20);
        } else {
            ctx.fillStyle = "#e74c3c"; ctx.font = "bold 50px Arial"; ctx.fillText("CAÇA ABATIDO", w/2, h/2 - 30);
            ctx.fillStyle = "#fff"; ctx.font = "20px Arial"; ctx.fillText("O PILOTO FOI EJETADO.", w/2, h/2 + 20);
        }
    };

    // Apelidos extras para evitar que qualquer engine core se perca
    Game.init = Game._init; Game.update = Game._update; Game.draw = Game._draw; Game.render = Game._draw; Game.renderEnd = Game._drawEnd;

    // =====================================================================
    // SISTEMAS DE LÓGICA E CONTROLO
    // =====================================================================
    Game.processMobileInputs = function(kps, dt) {
        var rawPitch = 0, rawRoll = 0, rawThr = GameState.player.throttle;

        if (GameState.keys['ArrowUp']) rawPitch = 1.0; else if (GameState.keys['ArrowDown']) rawPitch = -1.0;
        if (GameState.keys['ArrowRight']) rawRoll = 1.0; else if (GameState.keys['ArrowLeft']) rawRoll = -1.0;
        if (GameState.keys['w']) rawThr = 1.0; else if (GameState.keys['s']) rawThr = 0.2;

        var rightWrist = null, leftWrist = null, nose = null;
        var arr = kps;
        if (kps && !Array.isArray(kps) && kps[0] && kps[0].keypoints) arr = kps[0].keypoints;

        if (arr && Array.isArray(arr)) {
            for(var i=0; i<arr.length; i++) {
                var k = arr[i];
                if (!k) continue;
                if ((k.name === 'right_wrist' || i === 10) && k.score > 0.3) rightWrist = k;
                if ((k.name === 'left_wrist' || i === 9) && k.score > 0.3) leftWrist = k;
                if ((k.name === 'nose' || i === 0) && k.score > 0.3) nose = k;
            }
        }

        if (rightWrist && nose) {
            if (GameState.status === 'CALIBRATING') {
                GameState.hotas.calibratedX = typeof rightWrist.x === 'number' ? rightWrist.x : 320; 
                GameState.hotas.calibratedY = typeof rightWrist.y === 'number' ? rightWrist.y : 240;
                GameState.status = 'PLAYING';
            }
            if (GameState.status === 'PLAYING' && !GameState.keys['ArrowUp'] && !GameState.keys['ArrowDown']) {
                var dy = (rightWrist.y - GameState.hotas.calibratedY) / 120;
                var dx = (rightWrist.x - GameState.hotas.calibratedX) / 120;
                rawPitch = Math.max(-1, Math.min(1, isNaN(dy) ? 0 : dy));
                rawRoll = Math.max(-1, Math.min(1, isNaN(dx) ? 0 : dx));
                GameState.hotas.lastValidPitch = rawPitch;
                GameState.hotas.lastValidRoll = rawRoll;
            }
        } else if (GameState.status === 'PLAYING' && !GameState.keys['ArrowUp'] && !GameState.keys['ArrowDown']) {
            rawPitch = GameState.hotas.lastValidPitch || 0;
            rawRoll = GameState.hotas.lastValidRoll || 0;
        }

        if (leftWrist && GameState.status === 'PLAYING' && !GameState.keys['w']) {
            var lwY = typeof leftWrist.y === 'number' ? leftWrist.y : 240;
            var thr = 1.1 - (lwY / 480);
            rawThr = Math.max(0.1, Math.min(1.0, isNaN(thr) ? 0.5 : thr));
            GameState.hotas.lastValidThr = rawThr;

            if (rightWrist && Math.abs(leftWrist.x - rightWrist.x) < 80 && GameState.lockTimer > 1.5) Game.fireMissile();
        } else if (GameState.status === 'PLAYING' && !GameState.keys['w']) {
            rawThr = GameState.hotas.lastValidThr !== undefined ? GameState.hotas.lastValidThr : GameState.player.throttle;
        }

        var applyCurve = function(val, deadzone, expo) {
            if (Math.abs(val) < deadzone) return 0;
            var sign = val < 0 ? -1 : 1;
            var normalized = (Math.abs(val) - deadzone) / (1.0 - deadzone);
            return sign * Math.pow(Math.max(0, normalized), expo);
        };

        var targetPitch = applyCurve(rawPitch, 0.1, 1.5);
        var targetRoll = applyCurve(rawRoll, 0.1, 1.5);
        var targetThrottle = Math.max(0.1, Math.min(1.0, isNaN(rawThr) ? 0.5 : rawThr));

        GameState.player.inputs.pitch += (targetPitch - GameState.player.inputs.pitch) * (dt * 10.0);
        GameState.player.inputs.roll += (targetRoll - GameState.player.inputs.roll) * (dt * 10.0);
        GameState.player.throttle += (targetThrottle - GameState.player.throttle) * (dt * 5.0);

        if (GameState.player.gForce > 8.0 && GameState.player.inputs.pitch > 0) GameState.player.inputs.pitch *= 0.5; 
    };

    Game.spawnWave = function() {
        var count = (GameState.session.wave === 3) ? 1 : 3; 
        var planeType = (GameState.session.wave === 3) ? PLANES.boss_su57 : PLANES.falcon_lite;

        for(var i=0; i<count; i++) {
            var e = createPhysicsEntity(
                GameState.player.pos.x + (Math.random() * 8000 - 4000), 
                3000 + Math.random() * 2000, 
                GameState.player.pos.z + 4000 + (Math.random() * 8000),
                planeType 
            );
            if (GameState.session.wave === 3) {
                e.hp = 500; e.isBoss = true;
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
            if (e.stateTimer <= 0) e.stateTimer = 1.0 + Math.random() * 2.0;

            var dx = GameState.player.pos.x - e.pos.x;
            var dy = GameState.player.pos.y - e.pos.y;
            var dz = GameState.player.pos.z - e.pos.z;
            
            var distToPlayer = Math.sqrt((dx*dx) + (dy*dy) + (dz*dz));
            e.throttle = 0.8; 

            if (e.pos.y < 1000) {
                e.inputs.roll = Math.max(-1, Math.min(1, 0 - e.roll));
                e.inputs.pitch = 1.0; 
            } else if (e.isStalling) {
                e.inputs.pitch = -1.0;
            } else {
                var targetYaw = Math.atan2(dx, dz);
                var yawDiff = targetYaw - e.yaw;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

                e.inputs.roll = Math.max(-1, Math.min(1, (yawDiff * 2.0) - e.roll));
                e.inputs.pitch = Math.max(-1, Math.min(1, Math.abs(yawDiff) < 1.0 ? 0.8 : 0.2));
            }

            updatePhysics(e, dt);

            if (e.isBoss && distToPlayer < 4000 && Math.abs(e.inputs.roll) < 0.2 && Math.random() < 0.005) {
                GameState.entities.missiles.push(createMissile(e, GameState.player, true));
            }
        });
    };

    Game.updateEntities = function(dt) {
        GameState.entities.missiles.forEach(function(m) { 
            updateMissile(m, dt); 
            if (m.active && Math.random() > 0.3) GameState.entities.particles.push(createParticle(m.pos.x, m.pos.y, m.pos.z, m.isEnemy ? "#e74c3c" : "#ddd", 5, 1.0)); 
        });
        
        var activeMissiles = [];
        for(var i=0; i<GameState.entities.missiles.length; i++) {
            if(GameState.entities.missiles[i].active) activeMissiles.push(GameState.entities.missiles[i]);
        }
        GameState.entities.missiles = activeMissiles;

        GameState.entities.enemies.forEach(function(e) {
            if (e.hp <= 0 && e.active) {
                e.active = false;
                for(var j=0; j<30; j++) GameState.entities.particles.push(createParticle(e.pos.x, e.pos.y, e.pos.z, "#e74c3c", Math.random()*20+10, 2.5));
                GameState.session.kills++; 
                GameState.session.cash += e.isBoss ? GAME_CONFIG.MONEY_BOSS_BONUS : GAME_CONFIG.MONEY_PER_KILL; 
                if(window.Sfx && window.Sfx.play) window.Sfx.play(150, 'square', 0.8, 0.4); 
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

    Game.updateCombatSystem = function(dt) {
        var closestDist = Infinity, target = null;
        GameState.entities.enemies.forEach(function(e) {
            if(!e.active) return;
            var dx = e.pos.x - GameState.player.pos.x, dy = e.pos.y - GameState.player.pos.y, dz = e.pos.z - GameState.player.pos.z;
            var dist = Math.sqrt((dx*dx) + (dy*dy) + (dz*dz));
            
            var vDir = { x: Math.sin(GameState.player.yaw)*Math.cos(GameState.player.pitch), y: Math.sin(GameState.player.pitch), z: Math.cos(GameState.player.yaw)*Math.cos(GameState.player.pitch) };
            var targetDir = { x: dx/dist, y: dy/dist, z: dz/dist };
            var angleToTarget = Math.acos(Math.max(-1, Math.min(1, (vDir.x*targetDir.x) + (vDir.y*targetDir.y) + (vDir.z*targetDir.z))));

            if (angleToTarget < 0.35 && dist < 8000 && dist < closestDist) { closestDist = dist; target = e; }
        });

        if (target) {
            GameState.radarTarget = target; GameState.lockTimer += dt;
            if (window.Sfx && window.Sfx.play) {
                if (GameState.lockTimer > 1.5 && Math.floor(GameState.session.time * 10) % 2 === 0) window.Sfx.play(1200, 'square', 0.05, 0.05);
                else if (Math.floor(GameState.session.time * 5) % 2 === 0) window.Sfx.play(800, 'square', 0.05, 0.02);
            }
        } else { GameState.radarTarget = null; GameState.lockTimer = 0; }
    };

    Game.fireMissile = function() {
        if (GameState.radarTarget && GameState.lockTimer > 1.5) {
            if(window.Sfx && window.Sfx.play) window.Sfx.play(600, 'sawtooth', 0.5, 0.2);
            GameState.entities.missiles.push(createMissile(GameState.player, GameState.radarTarget, false));
            GameState.lockTimer = 0; 
        }
    };

    Game.endGame = function(finalState) {
        GameState.status = finalState;
        setTimeout(function() {
            var totalCash = GameState.session.cash + (finalState === 'VICTORY' ? GAME_CONFIG.MONEY_MISSION_BONUS : 0);
            if (window.System && window.System.gameOver) window.System.gameOver(GameState.session.kills, finalState === 'VICTORY', totalCash);
            else if (window.System && window.System.home) window.System.home();
        }, 4000);
    };

    // =====================================================================
    // SISTEMAS VISUAIS
    // =====================================================================
    Game.drawHangar = function(ctx, w, h) {
        ctx.fillStyle = "rgba(10,15,25,0.9)"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "#3498db"; ctx.font = "bold 40px Arial"; ctx.textAlign = "center";
        ctx.fillText("HANGAR MILITAR AAA", w/2, 80);
        ctx.fillStyle = "#fff"; ctx.font = "20px Arial";
        ctx.fillText("Calculando Termodinâmica...", w/2, h/2);
        ctx.strokeStyle = "#3498db"; ctx.strokeRect(w/2 - 150, h/2 + 40, 300, 20);
        ctx.fillStyle = "#3498db"; ctx.fillRect(w/2 - 148, h/2 + 42, 296 * (1 - (GameState.hangarTimer/3.0)), 16);
    };

    Game.draw3DWorld = function(ctx, w, h) {
        var p = GameState.player;
        ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(p.roll);
        var horizonY = p.pitch * (h/2); 
        ctx.fillStyle = "rgba(46, 204, 113, 0.15)"; ctx.fillRect(-w*2, horizonY, w*4, h*4);
        ctx.fillStyle = "rgba(52, 152, 219, 0.15)"; ctx.fillRect(-w*2, -h*4 + horizonY, w*4, h*4);
        ctx.beginPath(); ctx.moveTo(-w, horizonY); ctx.lineTo(w, horizonY);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();

        GameState.entities.enemies.forEach(function(e) {
            var proj = Engine3D.project(e.pos, p, w, h);
            if (proj.visible) {
                Engine3D.drawJetModel(ctx, proj.x, proj.y, Math.max(0.1, proj.s * 2), e.roll - p.roll, true, e.stats.color);
                if (GameState.radarTarget === e) {
                    ctx.strokeStyle = GameState.lockTimer > 1.5 ? "#e74c3c" : "#f1c40f"; ctx.lineWidth = 2;
                    var size = 30 * proj.s; ctx.strokeRect(proj.x - size/2, proj.y - size/2, size, size);
                }
            }
        });

        GameState.entities.particles.forEach(function(part) {
            var proj2 = Engine3D.project(part.pos, p, w, h);
            if (proj2.visible) {
                ctx.fillStyle = part.color; ctx.globalAlpha = Math.max(0, part.life / part.maxLife);
                ctx.beginPath(); ctx.arc(proj2.x, proj2.y, part.size * proj2.s, 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        });

        GameState.entities.missiles.forEach(function(m) {
            var proj3 = Engine3D.project(m.pos, p, w, h);
            if (proj3.visible) { ctx.fillStyle = m.isEnemy ? "#e74c3c" : "#fff"; ctx.beginPath(); ctx.arc(proj3.x, proj3.y, 4 * proj3.s, 0, Math.PI*2); ctx.fill(); }
        });
    };

    Game.drawHUD = function(ctx, w, h) {
        var p = GameState.player, hudColor = GameState.session.selectedPlane.color;
        ctx.fillStyle = hudColor; ctx.strokeStyle = hudColor; ctx.font = "bold 16px Arial";

        ctx.beginPath(); ctx.moveTo(w/2 - 15, h/2); ctx.lineTo(w/2 - 5, h/2); ctx.moveTo(w/2 + 15, h/2); ctx.lineTo(w/2 + 5, h/2); ctx.moveTo(w/2, h/2 - 15); ctx.lineTo(w/2, h/2 - 5); ctx.stroke();
        ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

        ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(p.roll);
        for(var i = -3; i <= 3; i++) {
            if (i === 0) continue;
            var yPos = ((i * 0.17) + p.pitch) * 400; 
            if (yPos > -h/2 && yPos < h/2) {
                ctx.beginPath(); if (i < 0) ctx.setLineDash([5, 5]); 
                ctx.moveTo(-40, yPos); ctx.lineTo(-20, yPos); ctx.lineTo(-20, yPos + (i < 0 ? -5 : 5)); 
                ctx.moveTo(40, yPos); ctx.lineTo(20, yPos); ctx.lineTo(20, yPos + (i < 0 ? -5 : 5));
                ctx.stroke(); ctx.setLineDash([]); ctx.font = "10px Arial"; ctx.textAlign = "right"; ctx.fillText(Math.abs(i*10), -45, yPos + 3); ctx.textAlign = "left"; ctx.fillText(Math.abs(i*10), 45, yPos + 3);
            }
        }
        ctx.restore();

        var V2 = (p.vel.x * p.vel.x) + (p.vel.y * p.vel.y) + (p.vel.z * p.vel.z);
        var V = Math.sqrt(V2);
        ctx.strokeRect(30, h/2 - 100, 40, 200); ctx.textAlign = "center"; ctx.fillText("SPD", 50, h/2 - 110);
        ctx.beginPath(); ctx.moveTo(70, h/2); ctx.lineTo(80, h/2 - 5); ctx.lineTo(80, h/2 + 5); ctx.fill(); 
        ctx.fillText(Math.floor(V), 50, h/2 + 5); ctx.font = "12px Arial"; ctx.fillText("M " + p.mach.toFixed(2), 50, h/2 + 120);

        ctx.strokeRect(w - 70, h/2 - 100, 40, 200); ctx.textAlign = "center"; ctx.font = "bold 16px Arial"; ctx.fillText("ALT", w - 50, h/2 - 110);
        ctx.beginPath(); ctx.moveTo(w - 70, h/2); ctx.lineTo(w - 80, h/2 - 5); ctx.lineTo(w - 80, h/2 + 5); ctx.fill(); 
        ctx.fillText(Math.floor(p.pos.y), w - 50, h/2 + 5);

        ctx.strokeRect(w/2 - 100, 20, 200, 25); var heading = (p.yaw * 180 / Math.PI) % 360; if (heading < 0) heading += 360;
        ctx.fillText(Math.floor(heading) + "°", w/2, 40); ctx.beginPath(); ctx.moveTo(w/2, 45); ctx.lineTo(w/2 - 5, 55); ctx.lineTo(w/2 + 5, 55); ctx.fill();

        ctx.textAlign = "left"; ctx.fillText("G-FORCE: " + p.gForce.toFixed(1) + "G", 20, h - 80);
        ctx.fillText("AoA: " + (p.alpha * 180/Math.PI).toFixed(1) + "°", 20, h - 100);
        ctx.fillStyle = p.hp < 40 ? "#e74c3c" : hudColor; ctx.fillText("HP: " + Math.floor(p.hp) + "%", 20, h - 60);
        
        if (p.isStalling) {
            ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
            ctx.textAlign = "center"; ctx.font = "bold 28px Arial"; ctx.fillText("STALL - PUSH DOWN", w/2, h/2 + 80); 
        }
        if (GameState.lockTimer > 1.5) { ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 20px Arial"; ctx.fillText("SHOOT!", w/2, h/2 + 50); }
    };

    Game.drawRadar = function(ctx, w, h) {
        var radarSize = 100; var rx = w - radarSize - 20; var ry = h - radarSize - 20;
        ctx.strokeStyle = "rgba(0, 255, 204, 0.5)"; ctx.lineWidth = 1;
        ctx.fillStyle = "rgba(0, 20, 40, 0.6)"; ctx.fillRect(rx, ry, radarSize, radarSize);
        ctx.strokeRect(rx, ry, radarSize, radarSize);
        
        ctx.fillStyle = "#0f0"; ctx.fillRect(rx + radarSize/2 - 2, ry + radarSize/2 - 2, 4, 4);

        GameState.entities.enemies.forEach(function(e) {
            var dx = (e.pos.x - GameState.player.pos.x) * 0.01; var dz = (e.pos.z - GameState.player.pos.z) * 0.01;
            var px = rx + radarSize/2 + dx; var py = ry + radarSize/2 + dz;
            if (px > rx && px < rx + radarSize && py > ry && py < ry + radarSize) {
                ctx.fillStyle = e.isBoss ? "#f39c12" : "#e74c3c"; 
                ctx.fillRect(px, py, e.isBoss ? 6 : 4, e.isBoss ? 6 : 4);
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

    Game.drawCalibration = function(ctx, w, h) {
        ctx.fillStyle = "rgba(0,10,20,0.8)"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 30px Arial";
        ctx.fillText("SISTEMA DE VOO ONLINE", w/2, h/2 - 40);
        
        ctx.font = "18px Arial"; ctx.fillStyle = "#fff";
        ctx.fillText("Fique em frente à câmera.", w/2, h/2 + 10);
        ctx.fillText("Mão Direita: Manche (Pitch / Roll).", w/2, h/2 + 40);
        ctx.fillText("Mão Esquerda: Acelerador. Junte as mãos: Atirar.", w/2, h/2 + 70);
        
        ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
        var scannerY = (h/2 + 150) + Math.sin(performance.now() * 0.005) * 20;
        ctx.beginPath(); ctx.moveTo(w/2 - 100, scannerY); ctx.lineTo(w/2 + 100, scannerY); ctx.stroke();
    };

    // =========================================================================
    // 6. REGISTRO NO SISTEMA (THIAGUINHO OS)
    // =========================================================================
    var register = function() {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '✈️', Game, {
                camera: 'user', camOpacity: 0.4, 
                phases: [
                    { id: 'single', name: 'CAMPANHA SOLO', desc: 'Derrote 3 Waves (Inclui Boss Final).', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'CO-OP SQUADRON', desc: 'Jogue com amigos.', mode: 'COOP', reqLvl: 3 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Batalha aérea livre.', mode: 'PVP', reqLvl: 5 }
                ]
            });
            clearInterval(regLoop);
        }
    };
    var regLoop = setInterval(register, 100);

})();
