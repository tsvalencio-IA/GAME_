// =============================================================================
// AERO STRIKE WAR: TACTICAL YOKE SIMULATOR (TRUE AAA EDITION)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT
// STATUS: TWO-HANDED YOKE RESTORED, TOUCH LOBBY FIXED, TRUE 6DOF PHYSICS
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAÇÕES FÍSICAS REAIS
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
            var dy = cam.pos.y - obj.y; // Eixo Y Invertido para o Canvas
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
            ctx.moveTo(0, -30); 
            ctx.lineTo(8, -10); 
            ctx.lineTo(25, 5);  
            ctx.lineTo(8, 12);  
            ctx.lineTo(12, 25); 
            ctx.lineTo(0, 20);  
            ctx.lineTo(-12, 25);
            ctx.lineTo(-8, 12); 
            ctx.lineTo(-25, 5); 
            ctx.lineTo(-8, -10);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = "#f39c12"; ctx.beginPath(); ctx.arc(0, 22, Math.random() * 4 + 3, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    };

    // =========================================================================
    // 3. FÍSICA FUNCIONAL (AERODINÂMICA AAA ANTI-CRASH)
    // =========================================================================
    function createPhysicsEntity(x, y, z, stats) {
        return {
            pos: { x: x, y: y, z: z },
            vel: { x: 0, y: 0, z: 250 },
            pitch: 0, yaw: 0, roll: 0,
            stats: stats,
            throttle: 0.85, // Cruzeiro automático constante
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

        // Recuperação Segura
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

            // Proportional Navigation Guidance Math
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
    // 5. SISTEMA GLOBAL PURE FUNCTIONAL (ESTÁVEL)
    // =========================================================================
    var GameState = {
        status: 'INIT',
        lastTime: 0,
        player: null,
        entities: { missiles: [], enemies: [], particles: [], clouds: [], floaters: [] },
        session: { kills: 0, cash: 0, mode: 'SINGLE', time: 0, wave: 1, selectedPlane: PLANES.falcon_lite },
        radarTarget: null, lockTimer: 0, vulcanCd: 0, missileCd: 0, hangarTimer: 3.0,
        yoke: { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, fireCommand: false },
        keys: {}, keysBound: false, touchBound: false,
        fatalError: null
    };

    var Game = {};

    Game._init = function(missionData) {
        try {
            GameState.fatalError = null;
            GameState.status = 'LOBBY'; // Inicia sempre no Lobby para permitir o toque na tela
            GameState.hangarTimer = 3.0;
            GameState.yoke = { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, fireCommand: false };
            GameState.keys = {};
            GameState.session = { 
                kills: 0, cash: 0, time: 0, wave: 1, 
                mode: (missionData && missionData.mode) ? missionData.mode : 'SINGLE',
                selectedPlane: PLANES.falcon_lite 
            };
            
            GameState.player = createPhysicsEntity(0, 3000, 0, GameState.session.selectedPlane);
            GameState.entities = { missiles: [], enemies: [], particles: [], clouds: [], floaters: [] };
            GameState.lastTime = performance.now();
            
            for (var i = 0; i < 50; i++) {
                GameState.entities.clouds.push({ x: (Math.random()-0.5)*100000, y: 5000+Math.random()*15000, z: (Math.random()-0.5)*100000, size: 3000+Math.random()*5000 });
            }

            if(window.Sfx && window.Sfx.play) window.Sfx.play(400, 'sine', 0.5, 0.1); 

            // EVENTOS DE TECLADO
            if (!GameState.keysBound) {
                window.addEventListener('keydown', function(e) { GameState.keys[e.key] = true; });
                window.addEventListener('keyup', function(e) { GameState.keys[e.key] = false; });
                GameState.keysBound = true;
            }

            // CORREÇÃO CRÍTICA DO LOBBY: O JOGO AGORA RESPONDE AO TOQUE NA TELA
            if (!GameState.touchBound) {
                var handleScreenTap = function() {
                    if (GameState.status === 'LOBBY') {
                        GameState.status = 'CALIBRATION'; // Inicia imediatamente o jogo!
                    } else if (GameState.status === 'CALIBRATION') {
                        Game._startMission();
                    }
                };
                window.addEventListener('pointerdown', handleScreenTap);
                window.addEventListener('mousedown', handleScreenTap);
                window.addEventListener('touchstart', handleScreenTap);
                GameState.touchBound = true;
            }

            // Simulação de Multiplayer Fake para que o modo funcione caso o DB não exista
            if (GameState.session.mode !== 'SINGLE') {
                if (!window.DB) { GameState.status = 'CALIBRATION'; } // Força a pular o lobby se não houver internet
            } else {
                GameState.status = 'CALIBRATION'; // Singleplayer salta o lobby
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

            // Atalho de Teclado no Lobby
            if (GameState.status === 'LOBBY' && GameState.keys[' ']) {
                GameState.status = 'CALIBRATION';
            }

            if (GameState.status === 'CALIBRATION' || GameState.status === 'PLAYING') {
                Game.processMobileInputs(kps, dt, w, h);
                
                if (GameState.status === 'PLAYING') {
                    GameState.session.time += dt;
                    updatePhysics(GameState.player, dt);
                    Game.updateAI(dt);
                    Game.updateEntities(dt);
                    Game.updateCombatSystem(dt, w, h);
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
                ctx.fillText("CRITICAL ERROR", 20, 50);
                ctx.font = "14px monospace"; 
                var lines = GameState.fatalError.split("\n");
                for(var i=0; i<lines.length; i++) ctx.fillText(lines[i], 20, 90 + (i*20));
                return;
            }

            if (!GameState.player) return;

            ctx.clearRect(0, 0, w, h);
            
            if (GameState.status === 'LOBBY') Game._drawLobby(ctx, w, h);
            else if (GameState.status === 'CALIBRATION') Game.drawCalibration(ctx, w, h);
            else if (GameState.status === 'GAMEOVER' || GameState.status === 'VICTORY') Game._drawEnd(ctx, w, h);
            else {
                ctx.save();
                // Efeito G-Force Tremor
                if (GameState.player.gForce > 3.0) {
                    var shake = (GameState.player.gForce - 3.0) * 2;
                    ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);
                }
                Game.draw3DWorld(ctx, w, h);
                Game.drawEntities(ctx, w, h);
                Game.drawPilotFX(ctx, w, h);
                Game.drawHUD(ctx, w, h);
                Game.drawCockpitYoke(ctx, w, h);
                ctx.restore();
                
                // Scanline leve
                ctx.fillStyle='rgba(0,0,0,0.1)';
                for(var yLine=0; yLine<h; yLine+=4) ctx.fillRect(0, yLine, w, 1);
            }
        } catch (e) {
            GameState.fatalError = "CRASH DRAW: " + e.message;
        }
    };

    Game._drawLobby = function(ctx, w, h) {
        ctx.fillStyle='rgba(10,20,10,0.95)'; ctx.fillRect(0,0,w,h);
        ctx.fillStyle='#0f6'; ctx.textAlign='center'; ctx.font='bold 40px "Russo One", Arial'; 
        ctx.fillText('AERO STRIKE: MULTIPLAYER', w/2, h*0.25);
        ctx.fillStyle='#fff'; ctx.font='bold 20px Arial'; 
        ctx.fillText('MODO: ' + GameState.session.mode, w/2, h*0.35);

        // BOTÃO DE INICIAR CLARO E ENORME (Agora reativo ao toque)
        var btnWidth = Math.min(400, w * 0.8);
        ctx.fillStyle='#c00'; ctx.fillRect(w/2 - btnWidth/2, h*0.6, btnWidth, 80);
        ctx.fillStyle='#fff'; ctx.font='bold 26px "Russo One", Arial'; 
        ctx.fillText('TOQUE NA TELA PARA INICIAR', w/2, h*0.6 + 50);
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
    // LÓGICA DO VERDADEIRO VOLANTE / YOKE DE DUAS MÃOS
    // =====================================================================
    Game.processMobileInputs = function(kps, dt, w, h) {
        var trgRoll = 0, trgPitch = 0, inputDetected = false;
        GameState.yoke.fireCommand = false;

        if (GameState.keys['ArrowUp']) trgPitch = 1.0; else if (GameState.keys['ArrowDown']) trgPitch = -1.0;
        if (GameState.keys['ArrowRight']) trgRoll = 1.0; else if (GameState.keys['ArrowLeft']) trgRoll = -1.0;
        if (GameState.keys[' ']) GameState.yoke.fireCommand = true;

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

        // LÓGICA YOKE 2 MÃOS (A exata lógica que você gostou da v10.js)
        if (rightWrist && leftWrist) {
            inputDetected = true;
            
            var rx = (1 - (rightWrist.x / 640)) * w; 
            var ry = (rightWrist.y / 480) * h;
            var lx = (1 - (leftWrist.x / 640)) * w; 
            var ly = (leftWrist.y / 480) * h;

            // VOLANTE (Roll): Mede a inclinação geométrica entre a mão esquerda e a direita
            trgRoll = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, Math.atan2(ry - ly, rx - lx)));

            // PITCH (Nariz Cima/Baixo): Mede se as DUAS mãos subiram ou desceram juntas em relação ao centro calibrado
            var avgY = (ry + ly) / 2;

            if (GameState.status === 'CALIBRATION') {
                GameState.yoke.baseY = GameState.yoke.baseY * 0.95 + avgY * 0.05;
                if (!GameState.yoke.baseY) GameState.yoke.baseY = avgY;
            } else {
                var deltaY = avgY - GameState.yoke.baseY;
                var threshold = h * 0.10; 
                
                // Mãos Sobem = Nariz Sobe (Puxa o Yoke pra trás)
                if (deltaY < -threshold) trgPitch = 1.0 * Math.min(1, Math.abs(deltaY)/200);      
                // Mãos Descem = Nariz Desce (Empurra o Yoke pra frente)
                else if (deltaY > threshold) trgPitch = -1.0 * Math.min(1, Math.abs(deltaY)/200); 
            }

            // ATIRAR: Bater palmas (Aproximar as duas mãos no centro do volante)
            var handDist = Math.sqrt(Math.pow(rx - lx, 2) + Math.pow(ry - ly, 2));
            if (handDist < 100) {
                GameState.yoke.fireCommand = true;
            }

        } else if (GameState.status === 'PLAYING') {
            // Memória Cinética: Se a câmara piscar, o avião não trava violentamente
            trgPitch = GameState.yoke.targetPitch;
            trgRoll = GameState.yoke.targetRoll;
        }

        if (inputDetected || GameState.status === 'PLAYING') {
            GameState.yoke.active = inputDetected;
            GameState.yoke.targetRoll += (trgRoll - GameState.yoke.targetRoll) * 8 * dt;
            GameState.yoke.targetPitch += (trgPitch - GameState.yoke.targetPitch) * 5 * dt;

            // Transmite a intenção do Yoke para o sistema de Fly-By-Wire da Física AAA
            GameState.player.inputs.pitch += (GameState.yoke.targetPitch - GameState.player.inputs.pitch) * (dt * 10.0);
            GameState.player.inputs.roll += (GameState.yoke.targetRoll - GameState.player.inputs.roll) * (dt * 10.0);

            // Assistência estrutural para evitar partir o avião
            if (GameState.player.gForce > 8.0 && GameState.player.inputs.pitch > 0) GameState.player.inputs.pitch *= 0.5; 
        }
    };

    Game._startMission = function() {
        GameState.status = 'PLAYING';
        GameState.player.pos.x = (Math.random()-0.5)*10000;
        GameState.player.pos.z = (Math.random()-0.5)*10000;
        Game.spawnWave();
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

            if (e.isBoss && distToPlayer < 4000 && Math.abs(e.inputs.roll) < 0.2 && Math.random() < 0.01) {
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

    Game.updateCombatSystem = function(dt, w, h) {
        var closestDist = Infinity, target = null;
        
        // Mira do Radar usando projeção de tela (igual à v10)
        GameState.entities.enemies.forEach(function(e) {
            if(!e.active) return;
            var proj = Engine3D.project(e.pos, GameState.player, w || 640, h || 480);
            if (proj.visible && proj.z > 200 && proj.z < 60000 && Math.abs(proj.x - (w||640)/2) < (w||640)*0.35 && Math.abs(proj.y - (h||480)/2) < (h||480)*0.35 && proj.z < closestDist) {
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

        // Auto-Metralhadora se alinhado
        if (GameState.radarTarget && GameState.lockTimer >= 1.0 && GameState.vulcanCd <= 0) {
            GameState.vulcanCd = 0.1;
            if(window.Sfx && window.Sfx.play) window.Sfx.play(300, 'sawtooth', 0.08, 0.15);
        }

        // FOGO DE MÍSSIL (CLAP)
        if (GameState.radarTarget && GameState.lockTimer > 1.5 && GameState.yoke.fireCommand && GameState.missileCd <= 0) {
            GameState.missileCd = 1.5;
            if(window.Sfx && window.Sfx.play) window.Sfx.play(600, 'sawtooth', 0.5, 0.2);
            GameState.entities.missiles.push(createMissile(GameState.player, GameState.radarTarget, false));
            GameState.lockTimer = 0; 
        }
    };

    Game.endGame = function(finalState) {
        GameState.status = finalState;
        setTimeout(function() {
            var totalCash = GameState.session.cash + (finalState === 'VICTORY' ? GAME_CONFIG.MONEY_MISSION_BONUS : 0);
            if (window.System && window.System.gameOver) window.System.gameOver(GameState.session.kills*100, finalState === 'VICTORY', totalCash);
            else if (window.System && window.System.home) window.System.home();
        }, 4000);
    };

    // =====================================================================
    // SISTEMAS VISUAIS (VOLANTE RESTAURADO E HUD)
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
        ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(-p.roll);
        var hy = Math.sin(p.pitch) * h * 1.5; 
        var sG = ctx.createLinearGradient(0,-h*4,0,hy);
        sG.addColorStop(0,'#001a33'); sG.addColorStop(0.5,'#004080'); sG.addColorStop(1,'#66a3ff');
        ctx.fillStyle = sG;
        ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
        var gG = ctx.createLinearGradient(0,hy,0,h*4);
        gG.addColorStop(0,'#0a1a0a'); gG.addColorStop(1,'#020502');
        ctx.fillStyle = gG;
        ctx.fillRect(-w*3,hy,w*6,h*4);
        
        ctx.strokeStyle='rgba(0,255,100,0.15)'; ctx.lineWidth=2; ctx.beginPath();
        var st=8000, sx=Math.floor(p.pos.x/st)*st-st*10, sz=Math.floor(p.pos.z/st)*st-st*10;
        for(var x=0;x<=20;x++) for(var z=0;z<=20;z++) {
            var gProj = Engine3D.project({x: sx+x*st, y:0, z: sz+z*st}, p, w, h);
            if(gProj.visible && gProj.s>0.01) { ctx.moveTo(gProj.x-20*gProj.s,gProj.y); ctx.lineTo(gProj.x+20*gProj.s,gProj.y); }
        }
        ctx.stroke();
        
        ctx.strokeStyle='rgba(0,255,200,0.8)'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(-w*3,hy); ctx.lineTo(w*3,hy); ctx.stroke();
        ctx.restore();
    };

    Game.drawEntities = function(ctx, w, h) {
        var buf=[];
        var p = GameState.player;
        
        GameState.entities.clouds.forEach(function(c) {
            var proj = Engine3D.project(c, p, w, h);
            if(proj.visible) buf.push({p: proj, t: 'c', o: c});
        });

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
            if(d.t==='c'){ctx.fillStyle='rgba(255,255,255,0.05)';ctx.beginPath();ctx.arc(pr.x,pr.y,o.size*s,0,Math.PI*2);ctx.fill();}
            else if(d.t==='e'){
                Engine3D.drawJetModel(ctx, pr.x, pr.y, Math.max(0.1, s*2), o.roll - p.roll, true, o.stats ? o.stats.color : '#e74c3c');
                if (GameState.radarTarget === o) {
                    ctx.strokeStyle = GameState.lockTimer > 1.5 ? "#e74c3c" : "#f1c40f"; ctx.lineWidth = 2;
                    var bs = Math.max(30, 200*s); ctx.strokeRect(pr.x - bs, pr.y - bs, bs*2, bs*2);
                    if (GameState.lockTimer > 1.5) { ctx.fillStyle = "#e74c3c"; ctx.font = "bold 16px Arial"; ctx.textAlign='center'; ctx.fillText("LOCK", pr.x, pr.y + bs + 25); }
                }
            }
            else if(d.t==='part'){
                ctx.globalCompositeOperation='lighter'; ctx.fillStyle = o.color; ctx.globalAlpha = Math.max(0, o.life / o.maxLife);
                ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(1, o.size * s), 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1.0; ctx.globalCompositeOperation='source-over';
            }
            else if(d.t==='m'){ctx.fillStyle=o.isEnemy?'#e74c3c':'#fff';ctx.fillRect(pr.x-10*s,pr.y-10*s,20*s,20*s);}
        });
    };

    Game.drawHUD = function(ctx, w, h) {
        var p = GameState.player;
        ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,w,50);
        ctx.fillStyle='#0f6';ctx.font='bold 20px Arial';ctx.textAlign='left';ctx.fillText("SPD: " + Math.floor(p.speed * 3.6) + " KM/H",20,30);
        ctx.textAlign='right';ctx.fillText("ALT: " + Math.floor(p.pos.y) + " M",w-20,30);
        var hdg=(p.yaw*180/Math.PI)%360;if(hdg<0)hdg+=360;
        ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 22px Arial';ctx.fillText(Math.floor(hdg)+'°',w/2,35);

        ctx.textAlign='left'; ctx.font='bold 14px Arial'; ctx.fillStyle='#0f6';
        ctx.fillText("G-FORCE: " + p.gForce.toFixed(1) + "G", 20, 80);
        ctx.fillText("MACH: " + p.mach.toFixed(2), 20, 100);
        ctx.fillText("AoA: " + (p.alpha * 180/Math.PI).toFixed(1) + "°", 20, 120);

        if (p.isStalling) {
            ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
            ctx.textAlign = "center"; ctx.font = "bold 28px Arial"; ctx.fillText("STALL - PUSH DOWN", w/2, h/2 - 100); 
        }

        if (GameState.radarTarget) {
            if (GameState.lockTimer >= 1.5) {
                ctx.fillStyle = "#f03"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
                ctx.fillText("CLAP TO FIRE!", w/2, h/2 + 80);
            } else {
                ctx.fillStyle = "#ff0"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center";
                ctx.fillText("LOCKING...", w/2, h/2 + 80);
            }
        }
    };

    Game.drawCockpitYoke = function(ctx, w, h) {
        var cx = w/2, cy = h/2;
        
        // MIRA CENTRAL
        ctx.strokeStyle='rgba(0,255,100,0.8)';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(cx-30,cy);ctx.lineTo(cx-10,cy);ctx.moveTo(cx+30,cy);ctx.lineTo(cx+10,cy);
        ctx.moveTo(cx,cy-30);ctx.lineTo(cx,cy-10);ctx.moveTo(cx,cy+30);ctx.lineTo(cx,cy+10);ctx.stroke();
        ctx.fillStyle='#0ff';ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();

        // O VERDADEIRO VOLANTE MILITAR DE DUAS MÃOS (YOKE RESTAURADO DA v10.js)
        if(GameState.yoke.active) {
            ctx.save();
            var yokeYOffset = 0;
            // Traduz a intenção de PITCH visualmente no manche (sobe e desce)
            if (GameState.yoke.targetPitch < -0.2) yokeYOffset = 30; // Mergulhando
            else if (GameState.yoke.targetPitch > 0.2) yokeYOffset = -30; // Subindo
            
            var stickX = cx;
            var stickY = h + yokeYOffset;
            
            ctx.translate(stickX, stickY);
            
            // Haste de suporte central
            ctx.fillStyle='#050505'; ctx.fillRect(-25,-180,50,180);
            
            // Rotação do Volante (Eixo central)
            ctx.translate(0,-180); ctx.rotate(GameState.yoke.targetRoll);
            
            // O Volante em forma de "U" ou chifres
            ctx.fillStyle='rgba(20,20,20,0.95)'; ctx.strokeStyle='#333'; ctx.lineWidth=15; ctx.lineCap='round';
            ctx.beginPath();
            ctx.moveTo(-110,-30);
            ctx.lineTo(-130,40);
            ctx.lineTo(-60,60);
            ctx.lineTo(60,60);
            ctx.lineTo(130,40);
            ctx.lineTo(110,-30);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            // Botões de polegar no volante
            ctx.fillStyle = GameState.missileCd <= 0 ? '#f00' : '#500'; 
            ctx.beginPath(); ctx.arc(-100,-25,10,0,Math.PI*2); ctx.fill();
            
            ctx.fillStyle='#ff0'; 
            ctx.beginPath(); ctx.arc(100,-25,10,0,Math.PI*2); ctx.fill();
            
            ctx.restore();
        } else {
            ctx.fillStyle='#f00'; ctx.textAlign='center'; ctx.font='bold 22px Arial'; 
            ctx.fillText('PLACE BOTH HANDS ON YOKE', cx, h-150);
        }

        // HUD Inferior (Estado e Integridade)
        ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(10,h-50,220,40);
        ctx.fillStyle='#222';ctx.fillRect(20,h-30,200,10);
        ctx.fillStyle=GameState.player.hp>30?'#2ecc71':'#e74c3c';ctx.fillRect(20,h-30,200*(Math.max(0,GameState.player.hp)/100),10);
        ctx.fillStyle='#fff';ctx.font='bold 12px Arial';ctx.textAlign='left';ctx.fillText("HP: " + Math.floor(GameState.player.hp) + "%",20,h-35);
        ctx.fillStyle='#f1c40f';ctx.font='bold 18px Arial';ctx.textAlign='right';ctx.fillText("$" + GameState.session.cash,w-10,h-20);
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
        ctx.fillText("Coloque as DUAS MÃOS no ecrã como se segurasse um volante.", w/2, h/2 + 10);
        ctx.fillText("Rode as mãos para inclinar o avião. Suba as mãos para mergulhar.", w/2, h/2 + 40);
        ctx.fillStyle = "#f1c40f"; ctx.fillText("Bata palmas (CLAP) para atirar Mísseis.", w/2, h/2 + 70);
        
        ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
        var scannerY = (h/2 + 150) + Math.sin(performance.now() * 0.005) * 20;
        ctx.beginPath(); ctx.moveTo(w/2 - 100, scannerY); ctx.lineTo(w/2 + 100, scannerY); ctx.stroke();
    };

    // =========================================================================
    // 6. REGISTRO NO SISTEMA (THIAGUINHO OS)
    // =========================================================================
    var register = function() {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike: TACTICAL', '✈️', Game, {
                camera: 'user',
                phases: [
                    { id: 'training', name: 'BASIC TRAINING', desc: 'Calibrate controls. Engage aerial targets.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'SQUADRON CO-OP', desc: 'Team up with allies vs AI.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'AIR SUPERIORITY', desc: 'PvP dogfight for rewards.', mode: 'PVP', reqLvl: 1 }
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