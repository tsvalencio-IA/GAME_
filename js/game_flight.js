// =============================================================================
// AERO STRIKE WAR: TACTICAL SIMULATOR (COMMERCIAL PLATINUM EDITION - TRUE AAA)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (DIVISÃO DE SIMULAÇÃO MILITAR)
// STATUS: TRUE 6DOF PHYSICS, PN GUIDANCE, 100% ES5 SYNTAX (CRASH-PROOF)
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
            id: "falcon_lite", name: "F-16 FALCON", price: 0,
            thrust: 120000, mass: 12000, wingArea: 28.0,
            cd0: 0.022, kInduced: 0.05, clMax: 1.6, stallAngle: 0.26,
            maxPitchRate: 1.5, maxRollRate: 3.0, color: "#3498db"
        },
        raptor_pro: {
            id: "raptor_pro", name: "F-22 RAPTOR", price: 5000,
            thrust: 230000, mass: 19700, wingArea: 78.04,
            cd0: 0.019, kInduced: 0.035, clMax: 1.8, stallAngle: 0.35,    
            maxPitchRate: 2.0, maxRollRate: 4.0, color: "#9b59b6"
        },
        boss_su57: {
            id: "boss_su57", name: "SU-57 FELON (ACE)", price: 99999,
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
            var cx = cam.pos ? cam.pos.x : cam.x;
            var cy = cam.pos ? cam.pos.y : cam.y;
            var cz = cam.pos ? cam.pos.z : cam.z;
            
            var dx = obj.x - cx;
            var dy = cy - obj.y; 
            var dz = obj.z - cz;
            
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
    // 3. NÚCLEO DE FÍSICA AERODINÂMICA AAA
    // =========================================================================
    function PhysicsEntity(x, y, z, stats) {
        this.pos = { x: x, y: y, z: z };
        this.vel = { x: 0, y: 0, z: 250 };
        this.pitch = 0; this.yaw = 0; this.roll = 0;
        this.stats = stats;
        this.throttle = 0.5;
        this.inputs = { pitch: 0, roll: 0, yaw: 0 };
        
        this.gForce = 1.0;
        this.mach = 0;
        this.alpha = 0; 
        this.isStalling = false;
        this.hp = 100;
        this.active = true;
        this.isBoss = false;
    }

    PhysicsEntity.prototype.updatePhysics = function(dt) {
        if (!this.active) return;
        if (dt > 0.1) dt = 0.1; 

        var altitude = Math.max(0, Math.min(GAME_CONFIG.MAX_ALTITUDE, this.pos.y));
        var tempK = 288.15 - 0.0065 * altitude; 
        var airDensity = 1.225 * Math.pow(Math.max(0, 1 - 0.0000225577 * altitude), 4.2561); 
        var speedOfSound = Math.sqrt(GAME_CONFIG.GAMMA * GAME_CONFIG.R_GAS * tempK);

        var V2 = (this.vel.x * this.vel.x) + (this.vel.y * this.vel.y) + (this.vel.z * this.vel.z);
        var V = Math.sqrt(V2);
        if (isNaN(V) || V === 0) V = 1;
        this.mach = V / speedOfSound;
        if (isNaN(this.mach)) this.mach = 0;

        var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        var cr = Math.cos(this.roll), sr = Math.sin(this.roll);

        var forwardVec = { x: sy * cp, y: sp, z: cy * cp };
        var upVec = { x: -sy * sp * cr - cy * sr, y: cp * cr, z: -cy * sp * cr + sy * sr };
        var rightVec = { x: cy * cr - sy * sp * sr, y: sp * sr, z: -sy * cr - cy * sp * sr };

        var vDir = V > 1.0 ? { x: this.vel.x/V, y: this.vel.y/V, z: this.vel.z/V } : forwardVec;
        var cosAlpha = forwardVec.x*vDir.x + forwardVec.y*vDir.y + forwardVec.z*vDir.z;
        this.alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
        if (isNaN(this.alpha)) this.alpha = 0;

        var CL = this.alpha * (this.stats.clMax / this.stats.stallAngle); 
        if (isNaN(CL)) CL = 0;
        
        this.isStalling = this.alpha > this.stats.stallAngle || V < 50;
        if (this.isStalling) CL = Math.max(0, CL - (this.alpha - this.stats.stallAngle) * 5.0); 

        var CD = this.stats.cd0 + this.stats.kInduced * (CL * CL);
        if (isNaN(CD)) CD = this.stats.cd0;

        var dynamicPressure = 0.5 * airDensity * (V * V);
        var liftMag = dynamicPressure * this.stats.wingArea * CL;
        var dragMag = dynamicPressure * this.stats.wingArea * CD;

        var liftForce = { x: upVec.x * liftMag, y: upVec.y * liftMag, z: upVec.z * liftMag };
        var dragForce = { x: -vDir.x * dragMag, y: -vDir.y * dragMag, z: -vDir.z * dragMag };
        
        var thrustMag = this.stats.thrust * this.throttle;
        var thrustForce = { x: forwardVec.x * thrustMag, y: forwardVec.y * thrustMag, z: forwardVec.z * thrustMag };

        var weight = this.stats.mass * GAME_CONFIG.GRAVITY;
        var gravityForce = { x: 0, y: -weight, z: 0 };

        var Fx = liftForce.x + dragForce.x + thrustForce.x + gravityForce.x;
        var Fy = liftForce.y + dragForce.y + thrustForce.y + gravityForce.y;
        var Fz = liftForce.z + dragForce.z + thrustForce.z + gravityForce.z;

        this.vel.x += (Fx / this.stats.mass) * dt;
        this.vel.y += (Fy / this.stats.mass) * dt;
        this.vel.z += (Fz / this.stats.mass) * dt;

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.pos.z += this.vel.z * dt;

        var specificForceMag = Math.sqrt(
            Math.pow(liftForce.x + dragForce.x + thrustForce.x, 2) +
            Math.pow(liftForce.y + dragForce.y + thrustForce.y, 2) +
            Math.pow(liftForce.z + dragForce.z + thrustForce.z, 2)
        );
        this.gForce = specificForceMag / weight;
        if (isNaN(this.gForce)) this.gForce = 1.0;

        var currentTurnRate = (liftMag * Math.sin(this.roll)) / (this.stats.mass * V); 
        if (!this.isStalling && V > 30 && !isNaN(currentTurnRate)) {
            this.yaw += currentTurnRate * dt;
        }

        this.pitch += this.inputs.pitch * this.stats.maxPitchRate * dt;
        this.roll += this.inputs.roll * this.stats.maxRollRate * dt;
        this.pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, this.pitch));

        if (this.isStalling) {
            this.pitch += (-0.5 - this.pitch) * 1.5 * dt;
            this.roll += (Math.random() - 0.5) * 2.0 * dt; 
        }

        if (isNaN(this.pitch)) this.pitch = 0;
        if (isNaN(this.roll)) this.roll = 0;
        if (isNaN(this.yaw)) this.yaw = 0;
        if (isNaN(this.pos.x)) this.pos.x = 0;
        if (isNaN(this.pos.y)) this.pos.y = 3000;
        if (isNaN(this.pos.z)) this.pos.z = 0;

        if (this.pos.y <= 0) {
            this.pos.y = 0;
            this.hp = 0;
            this.active = false;
        }
    };

    // =========================================================================
    // 4. GUIAGEM BALÍSTICA E PARTÍCULAS
    // =========================================================================
    function Particle(x, y, z, color, size, life) {
        this.pos = { x: x, y: y, z: z };
        this.vel = { x: (Math.random()-0.5)*30, y: (Math.random()-0.5)*30, z: (Math.random()-0.5)*30 };
        this.color = color; this.size = size; this.life = life; this.maxLife = life;
    }
    Particle.prototype.update = function(dt) {
        this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
        this.life -= dt;
    };

    function Missile(shooter, target, isEnemy) {
        this.pos = { x: shooter.pos.x, y: shooter.pos.y - 5, z: shooter.pos.z };
        this.vel = { x: shooter.vel.x, y: shooter.vel.y, z: shooter.vel.z }; 
        this.target = target;
        this.isEnemy = isEnemy;
        this.thrust = 1500; 
        this.maxG = 30.0; 
        this.life = 8.0;
        this.active = true;
        this.pitch = shooter.pitch;
        this.yaw = shooter.yaw;
        this.roll = shooter.roll;
    }

    Missile.prototype.update = function(dt) {
        if (!this.active) return;
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }

        var V2 = (this.vel.x * this.vel.x) + (this.vel.y * this.vel.y) + (this.vel.z * this.vel.z);
        var V = Math.sqrt(V2);

        if (this.target && this.target.active) {
            var rx = this.target.pos.x - this.pos.x;
            var ry = this.target.pos.y - this.pos.y;
            var rz = this.target.pos.z - this.pos.z;
            var dist2 = (rx*rx) + (ry*ry) + (rz*rz);
            var dist = Math.sqrt(dist2);
            
            if (dist < 80) { 
                this.active = false; this.target.hp -= 55;
                if(window.Sfx && window.Sfx.play) window.Sfx.play(100, 'sawtooth', 0.5, 0.3);
                return;
            }

            var vrx = this.target.vel.x - this.vel.x;
            var vry = this.target.vel.y - this.vel.y;
            var vrz = this.target.vel.z - this.vel.z;

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
            var maxAcc = this.maxG * GAME_CONFIG.GRAVITY;
            if (accMag > maxAcc) {
                ax = (ax / accMag) * maxAcc;
                ay = (ay / accMag) * maxAcc;
                az = (az / accMag) * maxAcc;
            }

            if (!isNaN(ax)) this.vel.x += ax * dt;
            if (!isNaN(ay)) this.vel.y += ay * dt;
            if (!isNaN(az)) this.vel.z += az * dt;

            this.yaw = Math.atan2(this.vel.x, this.vel.z);
            this.pitch = Math.asin(this.vel.y / (V || 1));
        }

        var vDir = V > 0.1 ? { x: this.vel.x/V, y: this.vel.y/V, z: this.vel.z/V } : {x:0, y:0, z:1};
        this.vel.x += vDir.x * this.thrust * dt;
        this.vel.y += vDir.y * this.thrust * dt;
        this.vel.z += vDir.z * this.thrust * dt;

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.pos.z += this.vel.z * dt;
    };

    // =========================================================================
    // 5. SISTEMA PRINCIPAL DO JOGO E CONTROLADOR 
    // =========================================================================
    var Game = {
        state: 'INIT', 
        lastTime: 0, 
        player: null,
        entities: { missiles: [], enemies: [], particles: [] },
        session: { kills: 0, cash: 0, mode: 'SINGLE', time: 0, wave: 1, selectedPlane: null },
        radarTarget: null, 
        lockTimer: 0, 
        keys: {}, 
        keysBound: false, 
        hangarTimer: 3.0,
        hotas: { pitchInput: 0, rollInput: 0, calibratedY: 0, calibratedX: 0, lastValidPitch: 0, lastValidRoll: 0, lastValidThr: 0.5 },
        network: { lastSyncTime: 0, remotePlayers: {}, sendRate: 100 },
        fatalError: null,

        // =====================================================================
        // ALIAS DUPLOS PARA GARANTIR A CHAMADA DO CORE.JS
        // =====================================================================
        init: function(missionData) { this._init(missionData); },
        update: function(kps, w, h) { this._update(kps, w, h); },
        draw: function(ctx, w, h) { this._draw(ctx, w, h); },
        render: function(ctx, w, h) { this._draw(ctx, w, h); },

        _init: function(missionData) {
            try {
                this.fatalError = null;
                this.state = 'HANGAR'; 
                this.hangarTimer = 3.0;
                this.hotas = { pitchInput: 0, rollInput: 0, calibratedY: 0, calibratedX: 0, lastValidPitch: 0, lastValidRoll: 0, lastValidThr: 0.5 };
                this.keys = {};
                this.session = { 
                    kills: 0, cash: 0, time: 0, wave: 1, 
                    mode: (missionData && missionData.mode) ? missionData.mode : 'SINGLE',
                    selectedPlane: PLANES.falcon_lite 
                };
                
                this.player = new PhysicsEntity(0, 3000, 0, this.session.selectedPlane);
                this.entities = { missiles: [], enemies: [], particles: [] };
                this.lastTime = performance.now();
                this.spawnWave();

                if(window.Sfx && window.Sfx.play) window.Sfx.play(400, 'sine', 0.5, 0.1); 

                if (!this.keysBound) {
                    var self = this;
                    window.addEventListener('keydown', function(e) {
                        self.keys[e.key] = true;
                        if (self.state === 'HANGAR' && e.key === ' ') self.state = 'CALIBRATING';
                        if (self.state === 'CALIBRATING' && ['ArrowUp', 'ArrowDown', 'w', 's', ' '].indexOf(e.key) !== -1) self.state = 'PLAYING';
                        if (e.key === ' ' && self.state === 'PLAYING') self.fireMissile();
                    });
                    window.addEventListener('keyup', function(e) { self.keys[e.key] = false; });
                    this.keysBound = true;
                }

                if (this.session.mode === 'PVP' || this.session.mode === 'COOP') {
                    this.initMultiplayer();
                }
            } catch(e) {
                this.fatalError = "ERRO NO INIT: " + e.message;
            }
        },

        _update: function(kps, w, h) {
            if (this.fatalError) return;
            if (!this.player) return; 
            
            try {
                var now = performance.now();
                if (this.lastTime === 0) this.lastTime = now;
                var dt = (now - this.lastTime) / 1000;
                this.lastTime = now;
                
                if (dt < 0.005) return; 
                if (dt > 0.05) dt = 0.05; 

                if (this.state === 'HANGAR') {
                    this.hangarTimer -= dt;
                    if (this.hangarTimer <= 0) this.state = 'CALIBRATING';
                } else if (this.state === 'CALIBRATING' || this.state === 'PLAYING') {
                    this.processMobileInputs(kps, dt);
                    if (this.state === 'PLAYING') {
                        this.session.time += dt;
                        this.player.updatePhysics(dt);
                        this.updateAI(dt);
                        this.updateEntities(dt);
                        this.updateCombatSystem(dt);
                        this.updateMissionSystem();
                        this.updateMultiplayer(dt);
                        
                        if (this.player.hp <= 0 || !this.player.active) this.endGame('GAMEOVER');
                    }
                }
            } catch(e) {
                this.fatalError = "CRASH NO UPDATE: " + e.message;
            }
        },

        _draw: function(ctx, w, h) {
            if (!ctx) return;
            w = w || window.innerWidth || 640;
            h = h || window.innerHeight || 480;

            if (this.fatalError) {
                ctx.fillStyle = "#c0392b"; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "white"; ctx.font = "bold 20px Arial"; ctx.textAlign = "left";
                ctx.fillText("CRITICAL ERROR NO JOGO", 20, 50);
                ctx.font = "14px monospace"; 
                var lines = this.fatalError.split("\n");
                for(var i=0; i<lines.length; i++) ctx.fillText(lines[i], 20, 90 + (i*20));
                return;
            }

            if (!this.player) {
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "#0f0"; ctx.font = "bold 20px 'Chakra Petch'"; ctx.textAlign = "center";
                ctx.fillText("INICIANDO SIMULADOR...", w/2, h/2);
                return;
            }

            try {
                ctx.clearRect(0, 0, w, h);
                
                if (this.state === 'HANGAR') {
                    this.drawHangar(ctx, w, h);
                } else if (this.state === 'CALIBRATING') {
                    this.drawCalibration(ctx, w, h);
                } else if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                    this._drawEnd(ctx, w, h);
                } else {
                    this.draw3DWorld(ctx, w, h);
                    this.drawHUD(ctx, w, h);
                    this.drawRadar(ctx, w, h); 
                    this.drawPilotFX(ctx, w, h);
                }
            } catch(e) {
                this.fatalError = "CRASH NO RENDER: " + e.message;
            }
        },

        _drawEnd: function(ctx, w, h) {
            if (!ctx) return;
            ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,w,h);
            ctx.textAlign = "center"; 
            if (this.state === 'VICTORY') {
                ctx.fillStyle = "#2ecc71"; ctx.font = "bold 50px 'Russo One'"; ctx.fillText("ESPAÇO AÉREO LIMPO", w/2, h/2 - 30);
                ctx.fillStyle = "#f1c40f"; ctx.font = "20px 'Chakra Petch'"; ctx.fillText("PAGAMENTO APROVADO: R$ " + this.session.cash, w/2, h/2 + 20);
            } else {
                ctx.fillStyle = "#e74c3c"; ctx.font = "bold 50px 'Russo One'"; ctx.fillText("CAÇA ABATIDO", w/2, h/2 - 30);
                ctx.fillStyle = "#fff"; ctx.font = "20px 'Chakra Petch'"; ctx.fillText("O PILOTO FOI EJETADO.", w/2, h/2 + 20);
            }
            ctx.fillText("Inimigos Destruídos: " + this.session.kills, w/2, h/2 + 60);
        },

        // =====================================================================
        // CONTROLE E CÂMERA BLINDADO
        // =====================================================================
        processMobileInputs: function(kps, dt) {
            if (!this.hotas) this.hotas = { pitchInput: 0, rollInput: 0, calibratedY: 0, calibratedX: 0, lastValidPitch: 0, lastValidRoll: 0, lastValidThr: 0.5 };
            
            var rawPitch = 0, rawRoll = 0, rawThr = this.player.throttle;

            if (this.keys['ArrowUp']) rawPitch = 1.0; else if (this.keys['ArrowDown']) rawPitch = -1.0;
            if (this.keys['ArrowRight']) rawRoll = 1.0; else if (this.keys['ArrowLeft']) rawRoll = -1.0;
            if (this.keys['w']) rawThr = 1.0; else if (this.keys['s']) rawThr = 0.2;

            // Extração Nativa Compatível
            var rightWrist = null, leftWrist = null, nose = null;
            
            var arr = kps;
            if (kps && !Array.isArray(kps) && kps[0] && kps[0].keypoints) {
                arr = kps[0].keypoints;
            }

            if (arr && Array.isArray(arr)) {
                if (arr[10] && arr[10].score > 0.3) rightWrist = arr[10];
                if (arr[9] && arr[9].score > 0.3) leftWrist = arr[9];
                if (arr[0] && arr[0].score > 0.3) nose = arr[0];
                
                if (!rightWrist || !leftWrist || !nose) {
                    arr.forEach(function(k) {
                        if (k && k.name === 'right_wrist' && k.score > 0.3) rightWrist = k;
                        if (k && k.name === 'left_wrist' && k.score > 0.3) leftWrist = k;
                        if (k && k.name === 'nose' && k.score > 0.3) nose = k;
                    });
                }
            }

            if (rightWrist && nose) {
                if (this.state === 'CALIBRATING') {
                    this.hotas.calibratedX = typeof rightWrist.x === 'number' ? rightWrist.x : 320; 
                    this.hotas.calibratedY = typeof rightWrist.y === 'number' ? rightWrist.y : 240;
                    this.state = 'PLAYING';
                    if(window.System && window.System.msg) window.System.msg("FCS ONLINE", "#2ecc71");
                }
                if (this.state === 'PLAYING' && !this.keys['ArrowUp'] && !this.keys['ArrowDown']) {
                    var dy = (rightWrist.y - this.hotas.calibratedY) / 120;
                    var dx = (rightWrist.x - this.hotas.calibratedX) / 120;
                    rawPitch = Math.max(-1, Math.min(1, isNaN(dy) ? 0 : dy));
                    rawRoll = Math.max(-1, Math.min(1, isNaN(dx) ? 0 : dx));
                    this.hotas.lastValidPitch = rawPitch;
                    this.hotas.lastValidRoll = rawRoll;
                }
            } else if (this.state === 'PLAYING' && !this.keys['ArrowUp'] && !this.keys['ArrowDown']) {
                rawPitch = this.hotas.lastValidPitch || 0;
                rawRoll = this.hotas.lastValidRoll || 0;
            }

            if (leftWrist && this.state === 'PLAYING' && !this.keys['w']) {
                var lwY = typeof leftWrist.y === 'number' ? leftWrist.y : 240;
                var thr = 1.1 - (lwY / 480);
                rawThr = Math.max(0.1, Math.min(1.0, isNaN(thr) ? 0.5 : thr));
                this.hotas.lastValidThr = rawThr;

                if (rightWrist && Math.abs(leftWrist.x - rightWrist.x) < 80 && this.lockTimer > 1.5) this.fireMissile();
            } else if (this.state === 'PLAYING' && !this.keys['w']) {
                rawThr = this.hotas.lastValidThr !== undefined ? this.hotas.lastValidThr : this.player.throttle;
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

            this.player.inputs.pitch += (targetPitch - this.player.inputs.pitch) * (dt * 10.0);
            this.player.inputs.roll += (targetRoll - this.player.inputs.roll) * (dt * 10.0);
            this.player.throttle += (targetThrottle - this.player.throttle) * (dt * 5.0);

            if (this.player.gForce > 8.0 && this.player.inputs.pitch > 0) this.player.inputs.pitch *= 0.5; 
        },

        spawnWave: function() {
            var count = (this.session.wave === 3) ? 1 : 3; 
            var planeType = (this.session.wave === 3) ? PLANES.boss_su57 : PLANES.falcon_lite;

            for(var i=0; i<count; i++) {
                var e = new PhysicsEntity(
                    this.player.pos.x + (Math.random() * 8000 - 4000), 
                    3000 + Math.random() * 2000, 
                    this.player.pos.z + 4000 + (Math.random() * 8000),
                    planeType 
                );
                if (this.session.wave === 3) {
                    e.hp = 500;
                    e.isBoss = true;
                    if(window.System && window.System.msg) window.System.msg("WARNING: ENEMY ACE INBOUND", "#e74c3c");
                }
                e.stateTimer = 0;
                this.entities.enemies.push(e);
            }
        },

        updateMissionSystem: function() {
            if (this.session.mode !== 'SINGLE') return;
            if (this.entities.enemies.length === 0) {
                if (this.session.wave >= 3) {
                    this.endGame('VICTORY');
                } else {
                    this.session.wave++;
                    this.spawnWave();
                }
            }
        },

        updateAI: function(dt) {
            var self = this;
            this.entities.enemies.forEach(function(e) {
                if (!e.active) return;
                
                e.stateTimer -= dt;
                if (e.stateTimer <= 0) e.stateTimer = 1.0 + Math.random() * 2.0;

                var dx = self.player.pos.x - e.pos.x;
                var dy = self.player.pos.y - e.pos.y;
                var dz = self.player.pos.z - e.pos.z;
                
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

                e.updatePhysics(dt);

                if (e.isBoss && distToPlayer < 4000 && Math.abs(e.inputs.roll) < 0.2 && Math.random() < 0.005) {
                    self.entities.missiles.push(new Missile(e, self.player, true));
                }
            });
        },

        updateEntities: function(dt) {
            var self = this;
            this.entities.missiles.forEach(function(m) { 
                m.update(dt); 
                if (m.active && Math.random() > 0.3) self.entities.particles.push(new Particle(m.pos.x, m.pos.y, m.pos.z, m.isEnemy ? "#e74c3c" : "#ddd", 5, 1.0)); 
            });
            
            var activeMissiles = [];
            for(var i=0; i<this.entities.missiles.length; i++) {
                if(this.entities.missiles[i].active) activeMissiles.push(this.entities.missiles[i]);
            }
            this.entities.missiles = activeMissiles;

            this.entities.enemies.forEach(function(e) {
                if (e.hp <= 0 && e.active) {
                    e.active = false;
                    for(var j=0; j<30; j++) self.entities.particles.push(new Particle(e.pos.x, e.pos.y, e.pos.z, "#e74c3c", Math.random()*20+10, 2.5));
                    self.session.kills++; 
                    self.session.cash += e.isBoss ? GAME_CONFIG.MONEY_BOSS_BONUS : GAME_CONFIG.MONEY_PER_KILL; 
                    if(window.Sfx && window.Sfx.play) window.Sfx.play(150, 'square', 0.8, 0.4); 
                }
            });
            
            var activeEnemies = [];
            for(var k=0; k<this.entities.enemies.length; k++) {
                if(this.entities.enemies[k].active) activeEnemies.push(this.entities.enemies[k]);
            }
            this.entities.enemies = activeEnemies;

            this.entities.particles.forEach(function(p) { p.update(dt); });
            
            var activeParticles = [];
            for(var p=0; p<this.entities.particles.length; p++) {
                if(this.entities.particles[p].life > 0) activeParticles.push(this.entities.particles[p]);
            }
            this.entities.particles = activeParticles;
        },

        updateCombatSystem: function(dt) {
            var closestDist = Infinity, target = null;
            var self = this;
            this.entities.enemies.forEach(function(e) {
                if(!e.active) return;
                var dx = e.pos.x - self.player.pos.x, dy = e.pos.y - self.player.pos.y, dz = e.pos.z - self.player.pos.z;
                var dist = Math.sqrt((dx*dx) + (dy*dy) + (dz*dz));
                
                var vDir = { x: Math.sin(self.player.yaw)*Math.cos(self.player.pitch), y: Math.sin(self.player.pitch), z: Math.cos(self.player.yaw)*Math.cos(self.player.pitch) };
                var targetDir = { x: dx/dist, y: dy/dist, z: dz/dist };
                var angleToTarget = Math.acos(Math.max(-1, Math.min(1, (vDir.x*targetDir.x) + (vDir.y*targetDir.y) + (vDir.z*targetDir.z))));

                if (angleToTarget < 0.35 && dist < 8000 && dist < closestDist) { closestDist = dist; target = e; }
            });

            if (target) {
                this.radarTarget = target; this.lockTimer += dt;
                if (window.Sfx && window.Sfx.play) {
                    if (this.lockTimer > 1.5 && Math.floor(this.session.time * 10) % 2 === 0) window.Sfx.play(1200, 'square', 0.05, 0.05);
                    else if (Math.floor(this.session.time * 5) % 2 === 0) window.Sfx.play(800, 'square', 0.05, 0.02);
                }
            } else { this.radarTarget = null; this.lockTimer = 0; }
        },

        fireMissile: function() {
            if (this.radarTarget && this.lockTimer > 1.5) {
                if(window.Sfx && window.Sfx.play) window.Sfx.play(600, 'sawtooth', 0.5, 0.2);
                this.entities.missiles.push(new Missile(this.player, this.radarTarget, false));
                this.lockTimer = 0; 
                if(window.System && window.System.msg) window.System.msg("FOX 2 FIRED!", "#e74c3c");
            }
        },

        initMultiplayer: function() {
            if (!window.DB || !window.System || !window.System.playerId) return;
            var self = this;
            var ref = window.DB.ref("games/flight_" + window.System.playerId);
            ref.on('value', function(snap) {
                var data = snap.val();
                if (data && data.players) {
                    for(var id in data.players) {
                        if (id !== window.System.playerId) {
                            if(!self.network.remotePlayers[id]) self.network.remotePlayers[id] = new PhysicsEntity(0,3000,0, PLANES.falcon_lite);
                            var rd = data.players[id];
                            var rPlayer = self.network.remotePlayers[id];
                            rPlayer.targetPos = { x: rd.x, y: rd.y, z: rd.z };
                            rPlayer.targetVel = { x: rd.vx, y: rd.vy, z: rd.vz };
                            rPlayer.targetRot = { p: rd.p, y: rd.yaw, r: rd.r };
                        }
                    }
                }
            });
        },

        updateMultiplayer: function(dt) {
            if (this.session.mode !== 'PVP' && this.session.mode !== 'COOP') return;
            
            var now = performance.now();
            if (now - this.network.lastSyncTime > this.network.sendRate && window.DB && window.System && window.System.playerId) {
                window.DB.ref("games/flight_" + window.System.playerId + "/players/" + window.System.playerId).set({
                    x: Number(this.player.pos.x.toFixed(2)), y: Number(this.player.pos.y.toFixed(2)), z: Number(this.player.pos.z.toFixed(2)),
                    vx: Number(this.player.vel.x.toFixed(2)), vy: Number(this.player.vel.y.toFixed(2)), vz: Number(this.player.vel.z.toFixed(2)),
                    p: Number(this.player.pitch.toFixed(3)), yaw: Number(this.player.yaw.toFixed(3)), r: Number(this.player.roll.toFixed(3)),
                    hp: this.player.hp
                });
                this.network.lastSyncTime = now;
            }

            for(var id in this.network.remotePlayers) {
                var rp = this.network.remotePlayers[id];
                if(rp.targetPos) {
                    rp.pos.x += (rp.targetPos.x - rp.pos.x) * dt * 5.0 + (rp.targetVel.x * dt);
                    rp.pos.y += (rp.targetPos.y - rp.pos.y) * dt * 5.0 + (rp.targetVel.y * dt);
                    rp.pos.z += (rp.targetPos.z - rp.pos.z) * dt * 5.0 + (rp.targetVel.z * dt);
                    rp.pitch += (rp.targetRot.p - rp.pitch) * dt * 10;
                    rp.yaw += (rp.targetRot.y - rp.yaw) * dt * 10;
                    rp.roll += (rp.targetRot.r - rp.roll) * dt * 10;
                }
            }
        },

        endGame: function(finalState) {
            this.state = finalState;
            var self = this;
            setTimeout(function() {
                var totalCash = self.session.cash + (finalState === 'VICTORY' ? GAME_CONFIG.MONEY_MISSION_BONUS : 0);
                if (window.System && window.System.gameOver) window.System.gameOver(self.session.kills, finalState === 'VICTORY', totalCash);
                else if (window.System && window.System.home) window.System.home();
            }, 4000);
        },

        // =====================================================================
        // SISTEMAS VISUAIS
        // =====================================================================
        drawHangar: function(ctx, w, h) {
            ctx.fillStyle = "rgba(10,15,25,0.9)"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#3498db"; ctx.font = "bold 40px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("HANGAR MILITAR AAA", w/2, 80);
            ctx.fillStyle = "#fff"; ctx.font = "20px 'Chakra Petch'";
            ctx.fillText("Calculando Termodinâmica e Pressão Atmosférica...", w/2, h/2);
            ctx.strokeStyle = "#3498db"; ctx.strokeRect(w/2 - 150, h/2 + 40, 300, 20);
            ctx.fillStyle = "#3498db"; ctx.fillRect(w/2 - 148, h/2 + 42, 296 * (1 - (this.hangarTimer/3.0)), 16);
            ctx.fillStyle = "#f1c40f"; ctx.font = "14px Arial";
            ctx.fillText("Aeronave: " + this.session.selectedPlane.name + " | Sistema FCS FBW: ONLINE", w/2, h - 50);
        },

        draw3DWorld: function(ctx, w, h) {
            var p = this.player;
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(p.roll);
            var horizonY = p.pitch * (h/2); 
            ctx.fillStyle = "rgba(46, 204, 113, 0.15)"; ctx.fillRect(-w*2, horizonY, w*4, h*4);
            ctx.fillStyle = "rgba(52, 152, 219, 0.15)"; ctx.fillRect(-w*2, -h*4 + horizonY, w*4, h*4);
            ctx.beginPath(); ctx.moveTo(-w, horizonY); ctx.lineTo(w, horizonY);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
            ctx.restore();

            var self = this;
            this.entities.enemies.forEach(function(e) {
                var proj = Engine3D.project(e.pos, p, w, h);
                if (proj.visible) {
                    Engine3D.drawJetModel(ctx, proj.x, proj.y, Math.max(0.1, proj.s * 2), e.roll - p.roll, true, e.stats.color);
                    if (self.radarTarget === e) {
                        ctx.strokeStyle = self.lockTimer > 1.5 ? "#e74c3c" : "#f1c40f"; ctx.lineWidth = 2;
                        var size = 30 * proj.s; ctx.strokeRect(proj.x - size/2, proj.y - size/2, size, size);
                        if (self.lockTimer > 1.5) { ctx.fillStyle = "#e74c3c"; ctx.font = "12px Arial"; ctx.fillText("LOCK", proj.x + size/2 + 5, proj.y); }
                    }
                }
            });

            for(var id in this.network.remotePlayers) {
                var rp = this.network.remotePlayers[id];
                var proj = Engine3D.project(rp.pos, p, w, h);
                if (proj.visible) Engine3D.drawJetModel(ctx, proj.x, proj.y, Math.max(0.1, proj.s * 2), rp.roll - p.roll, false, "#2ecc71");
            }

            this.entities.particles.forEach(function(part) {
                var proj2 = Engine3D.project(part.pos, p, w, h);
                if (proj2.visible) {
                    ctx.fillStyle = part.color; ctx.globalAlpha = Math.max(0, part.life / part.maxLife);
                    ctx.beginPath(); ctx.arc(proj2.x, proj2.y, part.size * proj2.s, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });

            this.entities.missiles.forEach(function(m) {
                var proj3 = Engine3D.project(m.pos, p, w, h);
                if (proj3.visible) { ctx.fillStyle = m.isEnemy ? "#e74c3c" : "#fff"; ctx.beginPath(); ctx.arc(proj3.x, proj3.y, 4 * proj3.s, 0, Math.PI*2); ctx.fill(); }
            });
        },

        drawHUD: function(ctx, w, h) {
            var p = this.player, hudColor = this.session.selectedPlane.color;
            ctx.fillStyle = hudColor; ctx.strokeStyle = hudColor; ctx.font = "bold 16px 'Chakra Petch', sans-serif";

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

            ctx.strokeRect(w - 70, h/2 - 100, 40, 200); ctx.textAlign = "center"; ctx.font = "bold 16px 'Chakra Petch'"; ctx.fillText("ALT", w - 50, h/2 - 110);
            ctx.beginPath(); ctx.moveTo(w - 70, h/2); ctx.lineTo(w - 80, h/2 - 5); ctx.lineTo(w - 80, h/2 + 5); ctx.fill(); 
            ctx.fillText(Math.floor(p.pos.y), w - 50, h/2 + 5);

            ctx.strokeRect(w/2 - 100, 20, 200, 25); var heading = (p.yaw * 180 / Math.PI) % 360; if (heading < 0) heading += 360;
            ctx.fillText(Math.floor(heading) + "°", w/2, 40); ctx.beginPath(); ctx.moveTo(w/2, 45); ctx.lineTo(w/2 - 5, 55); ctx.lineTo(w/2 + 5, 55); ctx.fill();

            ctx.textAlign = "left"; ctx.fillText("G-FORCE: " + p.gForce.toFixed(1) + "G", 20, h - 80);
            ctx.fillText("AoA: " + (p.alpha * 180/Math.PI).toFixed(1) + "°", 20, h - 100);
            if (this.session.mode === 'SINGLE') ctx.fillText("WAVE: " + this.session.wave + "/3", 20, h - 120);
            ctx.fillStyle = p.hp < 40 ? "#e74c3c" : hudColor; ctx.fillText("INTEGRIDADE: " + Math.floor(p.hp) + "%", 20, h - 60);
            
            if (p.isStalling) {
                ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
                ctx.textAlign = "center"; ctx.font = "bold 28px 'Russo One'"; ctx.fillText("STALL - PUSH DOWN", w/2, h/2 + 80); 
            }
            if (this.lockTimer > 1.5) { ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 20px 'Chakra Petch'"; ctx.fillText("SHOOT!", w/2, h/2 + 50); }
        },

        drawRadar: function(ctx, w, h) {
            var radarSize = 100; var rx = w - radarSize - 20; var ry = h - radarSize - 20;
            ctx.strokeStyle = "rgba(0, 255, 204, 0.5)"; ctx.lineWidth = 1;
            ctx.fillStyle = "rgba(0, 20, 40, 0.6)"; ctx.fillRect(rx, ry, radarSize, radarSize);
            ctx.strokeRect(rx, ry, radarSize, radarSize);
            
            ctx.fillStyle = "#0f0"; ctx.fillRect(rx + radarSize/2 - 2, ry + radarSize/2 - 2, 4, 4);

            var self = this;
            this.entities.enemies.forEach(function(e) {
                var dx = (e.pos.x - self.player.pos.x) * 0.01; var dz = (e.pos.z - self.player.pos.z) * 0.01;
                var px = rx + radarSize/2 + dx; var py = ry + radarSize/2 + dz;
                if (px > rx && px < rx + radarSize && py > ry && py < ry + radarSize) {
                    ctx.fillStyle = e.isBoss ? "#f39c12" : "#e74c3c"; 
                    ctx.fillRect(px, py, e.isBoss ? 6 : 4, e.isBoss ? 6 : 4);
                }
            });
            
            for(var id in this.network.remotePlayers) {
                var rp = this.network.remotePlayers[id];
                var dx2 = (rp.pos.x - this.player.pos.x) * 0.01; var dz2 = (rp.pos.z - this.player.pos.z) * 0.01;
                var px2 = rx + radarSize/2 + dx2; var py2 = ry + radarSize/2 + dz2;
                if (px2 > rx && px2 < rx + radarSize && py2 > ry && py2 < ry + radarSize) {
                    ctx.fillStyle = "#2ecc71"; ctx.fillRect(px2, py2, 4, 4);
                }
            }
        },

        drawPilotFX: function(ctx, w, h) {
            var p = this.player;
            if (p.gForce > 5.0) {
                var intensity = Math.min(1.0, (p.gForce - 5.0) / 4.0); 
                ctx.fillStyle = "rgba(0, 0, 0, " + (intensity * 0.8) + ")"; ctx.fillRect(0,0,w,h);
            } else if (p.gForce < -1.5) {
                var intensityN = Math.min(1.0, (Math.abs(p.gForce) - 1.5) / 2.0);
                ctx.fillStyle = "rgba(231, 76, 60, " + (intensityN * 0.6) + ")"; ctx.fillRect(0,0,w,h);
            }
        },

        drawCalibration: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,10,20,0.8)"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText("SISTEMA DE VOO ONLINE", w/2, h/2 - 40);
            
            ctx.font = "18px 'Chakra Petch'"; ctx.fillStyle = "#fff";
            ctx.fillText("Fique em frente à câmera.", w/2, h/2 + 10);
            ctx.fillText("Mão Direita: Manche (Pitch / Roll).", w/2, h/2 + 40);
            ctx.fillText("Mão Esquerda: Acelerador. Junte as mãos: Atirar.", w/2, h/2 + 70);
            
            ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
            var scannerY = (h/2 + 150) + Math.sin(performance.now() * 0.005) * 20;
            ctx.beginPath(); ctx.moveTo(w/2 - 100, scannerY); ctx.lineTo(w/2 + 100, scannerY); ctx.stroke();
        }
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
