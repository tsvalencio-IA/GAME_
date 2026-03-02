// =============================================================================
// AERO STRIKE: TACTICAL FLIGHT SIMULATOR (TRUE AAA PHYSICS MERGE)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (DIVISÃO DE SIMULAÇÃO MILITAR)
// STATUS: 100% INICIALIZÁVEL, HOTAS VISUAL, FÍSICA AERODINÂMICA REAL E IA
// =============================================================================
(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES FÍSICAS REAIS E MATEMÁTICA
    // -----------------------------------------------------------------
    var GAME_CONFIG = {
        GRAVITY: 9.80665,     
        R_GAS: 287.05,        
        GAMMA: 1.4,           
        MAX_ALTITUDE: 40000   
    };

    var PLANE_STATS = {
        thrust: 120000, mass: 12000, wingArea: 28.0,
        cd0: 0.022, kInduced: 0.05, clMax: 1.6, stallAngle: 0.26,
        maxPitchRate: 1.5, maxRollRate: 3.0
    };

    var Engine3D = {
        fov: 800,
        project: function(objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) {
            var dx = objX - camX, dy = objY - camY, dz = objZ - camZ;
            var cy = Math.cos(-yaw), sy = Math.sin(-yaw);
            var x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
            var cp = Math.cos(-pitch), sp = Math.sin(-pitch);
            var y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            if (z2 < 10) return { visible: false };
            var cr = Math.cos(roll), sr = Math.sin(roll);
            var finalX = x1 * cr - y2 * sr, finalY = x1 * sr + y2 * cr;
            var scale = Engine3D.fov / z2;
            return { x: (w/2) + (finalX * scale), y: (h/2) - (finalY * scale), s: scale, z: z2, visible: true };
        },
        drawJetModel: function(ctx, px, py, scale, roll, isEnemy, color) {
            color = color || "#3498db";
            ctx.save(); ctx.translate(px, py); ctx.rotate(roll); ctx.scale(scale, scale);
            ctx.strokeStyle = isEnemy ? "#e74c3c" : color; ctx.lineWidth = 2;
            ctx.fillStyle = isEnemy ? "rgba(231, 76, 60, 0.4)" : "rgba(52, 152, 219, 0.4)";
            
            // Desenho avançado estilo F-22
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
            
            // Jato do motor
            ctx.fillStyle = "#f39c12"; ctx.beginPath(); ctx.arc(0, 22, Math.random() * 4 + 3, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    };

    var GameSfx = {
        ctx: null, engineSrc: null, ready: false,
        init: function() {
            if (this.ready) return;
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.ready = true; } catch(e) {}
        },
        startEngine: function() {
            if (!this.ready || this.engineSrc || !this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            var buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
            var data = buf.getChannelData(0);
            for (var i = 0; i < buf.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
            this.engineSrc = this.ctx.createBufferSource();
            this.engineSrc.buffer = buf; this.engineSrc.loop = true;
            var filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
            var gain = this.ctx.createGain(); gain.gain.value = 0.15;
            this.engineSrc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
            this.engineSrc.start();
        },
        stop: function() { if (this.engineSrc) { try { this.engineSrc.stop(); } catch(e){} this.engineSrc = null; } }
    };

    // -----------------------------------------------------------------
    // 2. MOTOR PRINCIPAL DO JOGO (SINTAXE 100% COMPATÍVEL CORE.JS)
    // -----------------------------------------------------------------
    var Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30, time: 0 },
        // Matriz de física completa: posições, velocidades e telemetria
        ship: { hp: 100, speed: 250, x: 0, y: 3000, z: 0, vx: 0, vy: 0, vz: 250, pitch: 0, yaw: 0, roll: 0, gForce: 1, alpha: 0, mach: 0, isStalling: false },
        pilot: { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false, throttle: 0.8 },
        timer: 3.0, keys: {},
        entities: [], bullets: [], missiles: [], clouds: [], fx: [], floaters: [],
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null, loop: null },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30, time: 0 };
            this.ship = { hp: 100, speed: 250, x: 0, y: 3000, z: 0, vx: 0, vy: 0, vz: 250, pitch: 0, yaw: 0, roll: 0, gForce: 1, alpha: 0, mach: 0, isStalling: false };
            this.pilot = { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false, throttle: 0.8 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.fx = []; this.floaters = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            for (var i = 0; i < 50; i++) this.clouds.push({ x: (Math.random()-0.5)*100000, y: 5000+Math.random()*15000, z: (Math.random()-0.5)*100000, size: 3000+Math.random()*5000 });
            this.net.uid = (window.System && window.System.playerId) ? window.System.playerId : "p_" + Math.floor(Math.random()*9999);
            this.mode = (faseData && faseData.mode) ? faseData.mode : 'SINGLE';
            
            var self = this;
            if (!this.keysBound) {
                window.addEventListener('keydown', function(e) { self.keys[e.key] = true; });
                window.addEventListener('keyup', function(e) { self.keys[e.key] = false; });
                this.keysBound = true;
            }

            if (this.mode !== 'SINGLE' && window.DB) this._initNet();
            else { this.state = 'CALIBRATION'; this.timer = 3.0; }
            GameSfx.init();
        },

        _initNet: function() {
            this.state = 'LOBBY'; this.net.players = {};
            this.net.sessionRef = window.DB.ref('usarmy_sessions/aero_' + this.mode);
            this.net.playersRef = this.net.sessionRef.child('pilots');
            this.net.playersRef.child(this.net.uid).onDisconnect().remove();
            var self = this;
            this.net.sessionRef.child('host').once('value').then(function(snap) {
                if (!snap.val()) {
                    self.net.isHost = true;
                    self.net.sessionRef.child('host').set(self.net.uid);
                    self.net.sessionRef.child('state').set('LOBBY');
                    self.net.playersRef.remove();
                }
                var uname = (window.Profile && window.Profile.username) ? window.Profile.username : 'PILOT';
                self.net.playersRef.child(self.net.uid).set({
                    name: uname, ready: false, hp: 100,
                    x: 0, y: 3000, z: 0, pitch: 0, yaw: 0, roll: 0
                });
            });
            this.net.playersRef.on('value', function(snap) { self.net.players = snap.val() || {}; });
            this.net.sessionRef.child('state').on('value', function(snap) {
                if (snap.val() === 'PLAYING' && self.state === 'LOBBY') { self.state = 'CALIBRATION'; self.timer = 3.0; }
            });
        },

        update: function(ctx, w, h, pose) {
            var now = performance.now();
            var dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            if (dt > 0.1) dt = 0.1; // Limite de estabilidade
            if (dt < 0.001) return 0;

            if (this.state === 'LOBBY') {
                if (this.keys[' ']) {
                    if (this.net.isHost && Object.keys(this.net.players).length > 0) this.net.sessionRef.child('state').set('PLAYING');
                    else if (!this.net.isHost) this.net.playersRef.child(this.net.uid).update({ready: true});
                }
                this._drawLobby(ctx, w, h); return 0; 
            }
            
            this._readPose(pose, w, h, dt);
            
            if (this.state === 'CALIBRATION') {
                this.timer -= dt;
                this._drawCalib(ctx, w, h);
                if (this.timer <= 0 || this.keys[' ']) this._startMission();
                return 0;
            }
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this._drawEnd(ctx, w, h);
                return this.session.cash;
            }

            this.session.time += dt;

            // =================================================================
            // INJEÇÃO: FÍSICA AERODINÂMICA AAA (LIFT, DRAG, STALL, G-FORCE)
            // =================================================================
            var altitude = Math.max(0, Math.min(GAME_CONFIG.MAX_ALTITUDE, this.ship.y));
            var tempK = 288.15 - 0.0065 * altitude; 
            var airDensity = 1.225 * Math.pow(Math.max(0, 1 - 0.0000225577 * altitude), 4.2561); 
            var speedOfSound = Math.sqrt(GAME_CONFIG.GAMMA * GAME_CONFIG.R_GAS * tempK);

            var V = Math.sqrt(this.ship.vx*this.ship.vx + this.ship.vy*this.ship.vy + this.ship.vz*this.ship.vz);
            if (V === 0 || isNaN(V)) V = 1;
            this.ship.speed = V;
            this.ship.mach = V / speedOfSound;

            var cy = Math.cos(this.ship.yaw), sy = Math.sin(this.ship.yaw);
            var cp = Math.cos(this.ship.pitch), sp = Math.sin(this.ship.pitch);
            var cr = Math.cos(this.ship.roll), sr = Math.sin(this.ship.roll);

            var fwdX = sy * cp, fwdY = sp, fwdZ = cy * cp;
            var upX = -sy*sp*cr - cy*sr, upY = cp*cr, upZ = -cy*sp*cr + sy*sr;

            // Ângulo de Ataque (Alpha)
            var vDirX = this.ship.vx/V, vDirY = this.ship.vy/V, vDirZ = this.ship.vz/V;
            var cosAlpha = fwdX*vDirX + fwdY*vDirY + fwdZ*vDirZ;
            this.ship.alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
            if (isNaN(this.ship.alpha)) this.ship.alpha = 0;

            // Sustentação (Lift) e Arrasto (Drag)
            var CL = this.ship.alpha * (PLANE_STATS.clMax / PLANE_STATS.stallAngle); 
            this.ship.isStalling = this.ship.alpha > PLANE_STATS.stallAngle || V < 50;
            if (this.ship.isStalling) CL = Math.max(0, CL - (this.ship.alpha - PLANE_STATS.stallAngle) * 5.0); 

            var CD = PLANE_STATS.cd0 + PLANE_STATS.kInduced * (CL * CL);

            var dynPress = 0.5 * airDensity * (V * V);
            var liftMag = dynPress * PLANE_STATS.wingArea * CL;
            var dragMag = dynPress * PLANE_STATS.wingArea * CD;

            var liftFx = upX * liftMag, liftFy = upY * liftMag, liftFz = upZ * liftMag;
            var dragFx = -vDirX * dragMag, dragFy = -vDirY * dragMag, dragFz = -vDirZ * dragMag;
            
            var thrustMag = PLANE_STATS.thrust * this.pilot.throttle;
            var thrustFx = fwdX * thrustMag, thrustFy = fwdY * thrustMag, thrustFz = fwdZ * thrustMag;

            var weight = PLANE_STATS.mass * GAME_CONFIG.GRAVITY;
            
            var Fx = liftFx + dragFx + thrustFx;
            var Fy = liftFy + dragFy + thrustFy - weight; // Gravidade afeta o eixo Y
            var Fz = liftFz + dragFz + thrustFz;

            // Aceleração, Velocidade e Posição Cinética
            this.ship.vx += (Fx / PLANE_STATS.mass) * dt;
            this.ship.vy += (Fy / PLANE_STATS.mass) * dt;
            this.ship.vz += (Fz / PLANE_STATS.mass) * dt;

            this.ship.x += this.ship.vx * dt;
            this.ship.y += this.ship.vy * dt;
            this.ship.z += this.ship.vz * dt;

            // Força G Vectorial Real
            var specForce = Math.sqrt(Math.pow(liftFx+dragFx+thrustFx, 2) + Math.pow(liftFy+dragFy+thrustFy, 2) + Math.pow(liftFz+dragFz+thrustFz, 2));
            this.ship.gForce = specForce / weight;

            if (this.ship.y < 50) { 
                this.ship.y = 50; 
                this.ship.vy = Math.max(0, this.ship.vy); 
                if (this.ship.pitch < 0) this.ship.pitch = 0; 
            }

            // O avião vira devido à inclinação (Roll) da Sustentação (Lift)
            var turnRate = (liftMag * Math.sin(this.ship.roll)) / (PLANE_STATS.mass * V);
            if (!this.ship.isStalling && V > 30 && !isNaN(turnRate)) {
                this.ship.yaw += turnRate * dt;
            }
            // =================================================================

            this._processCombat(dt, w, h);
            this._spawnEnemies();
            this._updateEntities(dt, now);
            this._updateBullets(dt);
            this._updateMissiles(dt); // PN Guidance 
            this._cleanupFx();

            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');

            this._draw(ctx, w, h);
            return this.session.cash + this.session.kills * 10;
        },

        cleanup: function() {
            GameSfx.stop();
            if (this.net.loop) clearInterval(this.net.loop);
            if (this.mode !== 'SINGLE' && this.net.playersRef) {
                this.net.playersRef.off();
                if(this.net.sessionRef && this.net.sessionRef.child) this.net.sessionRef.child('state').off();
                if(this.net.uid) this.net.playersRef.child(this.net.uid).remove();
                if (this.net.isHost && this.net.sessionRef) this.net.sessionRef.remove();
            }
        },

        _readPose: function(pose, w, h, dt) {
            var trgRoll = 0, trgPitch = 0, inputDetected = false, rawThr = this.pilot.throttle;
            this.pilot.headTilt = false;
            
            // Suporte para Teclado Embutido (Mapeamento de Fallback/Testes)
            if (this.keys['ArrowUp']) trgPitch = 1.0; else if (this.keys['ArrowDown']) trgPitch = -1.0;
            if (this.keys['ArrowRight']) trgRoll = 1.0; else if (this.keys['ArrowLeft']) trgRoll = -1.0;
            if (this.keys['w']) rawThr = 1.0; else if (this.keys['s']) rawThr = 0.2;
            if (this.keys[' ']) this.pilot.headTilt = true;
            if (this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight']) inputDetected = true;

            var pts = null;
            if (pose && Array.isArray(pose)) pts = pose;
            else if (pose && pose.keypoints) pts = pose.keypoints;
            else if (pose && Array.isArray(pose) && pose[0] && pose[0].keypoints) pts = pose[0].keypoints;

            if (pts && pts.length > 0) {
                var kp = function(name) {
                    for(var i=0; i<pts.length; i++) {
                        if (pts[i] && (pts[i].part === name || pts[i].name === name)) return pts[i];
                    }
                    return null;
                };
                
                var rw = kp('right_wrist'), lw = kp('left_wrist');
                var rEar = kp('right_ear'), lEar = kp('left_ear');
                var pX = function(x) { return (1 - (x / 640)) * w; }; 
                var pY = function(y) { return (y / 480) * h; };
                
                // Tilt de cabeça extra (opcional)
                if (rEar && rEar.score > 0.4 && lEar && lEar.score > 0.4 && (rEar.y - lEar.y) > 20) this.pilot.headTilt = true;
                
                if (rw && rw.score > 0.3 && lw && lw.score > 0.3) {
                    inputDetected = true;
                    var rx = pX(rw.x), ry = pY(rw.y), lx = pX(lw.x), ly = pY(lw.y);
                    
                    trgRoll = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, Math.atan2(ry - ly, rx - lx)));
                    var avgY = (ry + ly) / 2;
                    
                    if (this.state === 'CALIBRATION') {
                        this.pilot.baseY = this.pilot.baseY * 0.95 + avgY * 0.05;
                        if (!this.pilot.baseY) this.pilot.baseY = avgY;
                    } else {
                        var deltaY = avgY - this.pilot.baseY;
                        var threshold = h * 0.10; 
                        if (deltaY < -threshold) trgPitch = 1.0 * Math.min(1, Math.abs(deltaY)/200);      
                        else if (deltaY > threshold) trgPitch = -1.0 * Math.min(1, Math.abs(deltaY)/200); 
                    }

                    // Acelerador adaptado à altura da mão esquerda
                    rawThr = 1.1 - (lw.y / 480);
                    rawThr = Math.max(0.1, Math.min(1.0, isNaN(rawThr) ? 0.5 : rawThr));
                    
                    // Juntar as mãos atira míssil (Clap to Fire)
                    if (Math.abs(lx - rx) < 80) this.pilot.headTilt = true; 
                }
            }

            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 8 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 5 * dt;
                this.pilot.throttle += (rawThr - this.pilot.throttle) * 5 * dt;

                if (this.state === 'PLAYING') {
                    // Controlo Fly-By-Wire traduzido para a Física
                    this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * PLANE_STATS.maxRollRate * dt;
                    this.ship.pitch += this.pilot.targetPitch * PLANE_STATS.maxPitchRate * dt;
                    
                    if (this.ship.isStalling) {
                        this.ship.pitch += (-0.5 - this.ship.pitch) * 2 * dt;
                        this.ship.roll += (Math.random() - 0.5) * 4 * dt; // Tremor Físico
                    }
                    
                    this.ship.pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, this.ship.pitch));
                }
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll *= 0.9;
                this.pilot.targetPitch *= 0.9;
                this.ship.roll *= 0.95;
            }
            this.ship.pitch %= Math.PI * 2;
            this.ship.yaw %= Math.PI * 2;
        },

        _processCombat: function(dt, w, h) {
            this.combat.target = null; this.combat.locked = false; var closestZ = Infinity;
            var self = this;
            var scan = function(obj, isPlayer, uid) {
                var p = Engine3D.project(obj.x, obj.y, obj.z, self.ship.x, self.ship.y, self.ship.z, self.ship.pitch, self.ship.yaw, self.ship.roll, w, h);
                if (p.visible && p.z > 200 && p.z < 60000 && Math.abs(p.x - w/2) < w*0.35 && Math.abs(p.y - h/2) < h*0.35 && p.z < closestZ) {
                    closestZ = p.z;
                    self.combat.target = obj;
                    self.combat.target.isPlayer = isPlayer;
                    self.combat.target.uid = uid;
                }
            };
            
            for (var i=0; i<this.entities.length; i++) scan(this.entities[i], false);
            
            if (this.mode === 'PVP' && this.net.players) {
                Object.keys(this.net.players).forEach(function(id) {
                    if (id !== self.net.uid && self.net.players[id] && self.net.players[id].hp > 0) scan(self.net.players[id], true, id);
                });
            }
            
            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 1.0) {
                    if (!this.combat.locked && window.Sfx && window.Sfx.play) window.Sfx.play(1200, 'square', 0.05, 0.05);
                    this.combat.locked = true;
                    this.combat.lockTimer = 1.0;
                } else if (Math.floor(this.session.time * 5) % 2 === 0 && window.Sfx && window.Sfx.play) {
                    window.Sfx.play(800, 'square', 0.05, 0.02);
                }
            } else {
                this.combat.lockTimer -= dt * 2;
                if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }
            
            if (this.combat.locked && this.combat.target && performance.now() - this.combat.vulcanCd > 80) {
                this.combat.vulcanCd = performance.now();
                var spd = this.ship.speed + 800; // Velocidade relativa da bala
                var dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                var dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                this.bullets.push({
                    x: this.ship.x + Math.cos(this.ship.yaw)*60, y: this.ship.y-20, z: this.ship.z - Math.sin(this.ship.yaw)*60,
                    vx: this.ship.vx + (dx/dist)*spd, vy: this.ship.vy + (dy/dist)*spd, vz: this.ship.vz + (dz/dist)*spd,
                    isEnemy: false, life: 2
                });
                if(window.Sfx && window.Sfx.play) window.Sfx.play(300, 'sawtooth', 0.08, 0.15);
                if(window.Gfx && window.Gfx.shakeScreen) window.Gfx.shakeScreen(4);
            }
            
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 1.2;
                this.missiles.push({
                    x: this.ship.x, y: this.ship.y-50, z: this.ship.z,
                    vx: this.ship.vx, vy: this.ship.vy, vz: this.ship.vz,
                    target: this.combat.target, life: 6, maxG: 30
                });
                if(window.Sfx && window.Sfx.play) window.Sfx.play(600, 'sawtooth', 0.5, 0.2);
                if(window.Gfx && window.Gfx.shakeScreen) window.Gfx.shakeScreen(12);
            }
        },

        _spawnEnemies: function() {
            if (this.mode === 'PVP') return; // Sem IA no modo PvP
            if (this.entities.length >= 8 || Math.random() > 0.05) return;
            
            var dist = 8000 + Math.random()*15000;
            var fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            var fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            var sx = this.ship.x + fX*dist + (Math.random()-0.5)*20000;
            var sz = this.ship.z + fZ*dist + (Math.random()-0.5)*20000;
            
            var isBoss = (this.session.kills >= 10 && this.entities.length === 0);
            var hp = isBoss ? 800 : 150;
            var type = isBoss ? 'boss_jet' : 'jet_fighter';
            
            if (isBoss && window.System && window.System.msg) window.System.msg("WARNING: ENEMY ACE INBOUND", "#e74c3c");
            
            this.entities.push({ 
                id: Math.random().toString(), type: type, isBoss: isBoss,
                x: sx, y: Math.max(1000, this.ship.y+(Math.random()-0.5)*4000), z: sz, 
                vx: 0, vy: 0, vz: 0, hp: hp, 
                yaw: this.ship.yaw + Math.PI, roll: 0, pitch: 0 
            });
        },

        _updateEntities: function(dt, now) {
            for (var i = 0; i < this.entities.length; i++) {
                var e = this.entities[i];
                
                // IA de Voo Agressiva em 6DOF
                var target = this.ship;
                var minDist = Math.sqrt(Math.pow(this.ship.x - e.x, 2) + Math.pow(this.ship.y - e.y, 2) + Math.pow(this.ship.z - e.z, 2));
                
                // Modo Co-Op: Procura o jogador mais próximo
                if (this.mode === 'COOP') {
                    for (var uid in this.net.players) {
                        var rp = this.net.players[uid];
                        if (rp && rp.hp > 0) {
                            var d = Math.sqrt(Math.pow(rp.x - e.x, 2) + Math.pow(rp.y - e.y, 2) + Math.pow(rp.z - e.z, 2));
                            if (d < minDist) { minDist = d; target = rp; }
                        }
                    }
                }
                
                var dx = target.x - e.x;
                var dy = target.y - e.y;
                var dz = target.z - e.z;
                
                var targetYaw = Math.atan2(dx, dz);
                var targetPitch = Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
                
                var yawDiff = targetYaw - e.yaw;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                
                var pitchDiff = targetPitch - e.pitch;
                while (pitchDiff > Math.PI) pitchDiff -= Math.PI * 2;
                while (pitchDiff < -Math.PI) pitchDiff += Math.PI * 2;
                
                // O Bot faz a curva inclinado o avião (Bank)
                e.roll += (yawDiff * 2.5 - e.roll) * 2 * dt;
                e.yaw += yawDiff * (e.isBoss ? 0.8 : 0.4) * dt;
                e.pitch += pitchDiff * (e.isBoss ? 0.8 : 0.4) * dt;
                
                var speed = e.isBoss ? 350 : 250;
                e.vx = Math.sin(e.yaw) * Math.cos(e.pitch) * speed;
                e.vy = Math.sin(e.pitch) * speed;
                e.vz = Math.cos(e.yaw) * Math.cos(e.pitch) * speed;
                
                e.x += e.vx*dt; e.y += e.vy*dt; e.z += e.vz*dt;
                if (e.y < 100) e.y = 100;
                
                if (Math.sqrt(dx*dx + dy*dy + dz*dz) > 120000) { e.hp = -1; continue; }
                
                // Inimigo Atira Se Estiver Alinhado
                if (minDist < 6000 && Math.abs(yawDiff) < 0.3 && Math.abs(pitchDiff) < 0.3) {
                    if (Math.random() < (e.isBoss ? 0.08 : 0.02)) {
                        var bSpd = 600;
                        this.bullets.push({
                            x: e.x, y: e.y, z: e.z,
                            vx: e.vx + (dx/minDist)*bSpd, vy: e.vy + (dy/minDist)*bSpd, vz: e.vz + (dz/minDist)*bSpd,
                            isEnemy: true, life: 3.5
                        });
                    }
                }
            }
            var self = this;
            this.entities = this.entities.filter(function(e) { return e.hp > 0; });
        },

        _updateBullets: function(dt) {
            for (var i = this.bullets.length-1; i >= 0; i--) {
                var b = this.bullets[i];
                b.x += b.vx*dt; b.y += b.vy*dt; b.z += b.vz*dt; b.life -= dt;
                if (b.isEnemy) {
                    var dx = b.x-this.ship.x, dy = b.y-this.ship.y, dz = b.z-this.ship.z;
                    if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 80) { // Hitbox realista
                        this.ship.hp -= 8;
                        if(window.Gfx && window.Gfx.shakeScreen) window.Gfx.shakeScreen(15);
                        if (this.ship.hp <= 0) this._endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (var j = 0; j < this.entities.length; j++) {
                        var e = this.entities[j];
                        var dx2 = b.x-e.x, dy2 = b.y-e.y, dz2 = b.z-e.z;
                        if (Math.sqrt(dx2*dx2 + dy2*dy2 + dz2*dz2) < 150) {
                            e.hp -= 40; b.life = 0;
                            this._fx(e.x,e.y,e.z,'#f90',4,40);
                            if (e.hp <= 0) this._kill(e, e.isBoss?800:100);
                            break;
                        }
                    }
                    if (this.mode==='PVP' && b.life>0 && this.net.players) {
                        var self = this;
                        Object.keys(this.net.players).forEach(function(uid) {
                            var rp = self.net.players[uid];
                            if (uid !== self.net.uid && rp && rp.hp > 0) {
                                var dist = Math.sqrt(Math.pow(b.x-rp.x,2) + Math.pow(b.y-rp.y,2) + Math.pow(b.z-rp.z,2));
                                if (dist < 150) {
                                    b.life=0;
                                    self._fx(rp.x, rp.y, rp.z,'#f90',4,50);
                                    if(window.DB && window.DB.ref) window.DB.ref('usarmy_sessions/aero_' + self.mode + '/pilots/' + uid + '/hp').set(rp.hp-10);
                                }
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this._fx(b.x,0,b.z,'#789',3,50); }
                }
                if (b.life <= 0) this.bullets.splice(i,1);
            }
        },

        // INJEÇÃO: PROPORTIONAL NAVIGATION REAL MÍSSEIS AAA
        _updateMissiles: function(dt) {
            for (var i = this.missiles.length-1; i >= 0; i--) {
                var m = this.missiles[i];
                var V = Math.sqrt(m.vx*m.vx + m.vy*m.vy + m.vz*m.vz) || 1;

                if (m.target && (m.target.hp>0 || m.target.isPlayer)) {
                    var rx = m.target.x - m.x, ry = m.target.y - m.y, rz = m.target.z - m.z;
                    var dist2 = rx*rx + ry*ry + rz*rz;
                    var dist = Math.sqrt(dist2);
                    
                    if (dist < 80) { // Raio Letal do míssil
                        if (m.target.isPlayer && this.mode==='PVP') {
                            if(window.DB && window.DB.ref) window.DB.ref('usarmy_sessions/aero_' + this.mode + '/pilots/' + m.target.uid + '/hp').set(m.target.hp-50);
                            this._fx(m.target.x,m.target.y,m.target.z,'#f33',40,300);
                            this.session.cash += 500;
                        } else if (!m.target.isPlayer) {
                            m.target.hp -= 400;
                            if (m.target.hp <= 0) this._kill(m.target, m.target.isBoss?1000:300);
                        }
                        m.life = 0;
                    } else {
                        // PN Guidance Math - O míssil prevê a rota de interceção
                        var tx = m.target.vx || 0, ty = m.target.vy || 0, tz = m.target.vz || 0;
                        var vrx = tx - m.vx, vry = ty - m.vy, vrz = tz - m.vz;
                        
                        var cx = ry * vrz - rz * vry, cy = rz * vrx - rx * vrz, cz = rx * vry - ry * vrx;
                        var omx = cx/dist2, omy = cy/dist2, omz = cz/dist2;
                        
                        var Vc = -(rx*vrx + ry*vry + rz*vrz) / dist;
                        var ux = rx/dist, uy = ry/dist, uz = rz/dist;
                        
                        var oxux = omy*uz - omz*uy, oxuy = omz*ux - omx*uz, oxuz = omx*uy - omy*ux;
                        
                        var N = 4.0;
                        var ax = N * Vc * oxux, ay = N * Vc * oxuy, az = N * Vc * oxuz;
                        
                        var accMag = Math.sqrt(ax*ax + ay*ay + az*az);
                        var maxAcc = m.maxG * GAME_CONFIG.GRAVITY;
                        if (accMag > maxAcc) { ax = (ax/accMag)*maxAcc; ay = (ay/accMag)*maxAcc; az = (az/accMag)*maxAcc; }
                        
                        if (!isNaN(ax)) { m.vx += ax*dt; m.vy += ay*dt; m.vz += az*dt; }
                    }
                }
                
                // Propulsão do motor foguete
                var vDirX = m.vx/V, vDirY = m.vy/V, vDirZ = m.vz/V;
                m.vx += vDirX * 800 * dt; m.vy += vDirY * 800 * dt; m.vz += vDirZ * 800 * dt;

                m.x += m.vx*dt; m.y += m.vy*dt; m.z += m.vz*dt; m.life -= dt;
                this.fx.push({x:m.x,y:m.y,z:m.z,vx:(Math.random()-0.5)*15,vy:(Math.random()-0.5)*15,vz:(Math.random()-0.5)*15,life:0.5,c:'rgba(255,200,100,0.8)',size:8});
                if (m.life <= 0) this.missiles.splice(i,1);
            }
        },

        _cleanupFx: function() {
            for (var i = 0; i < this.clouds.length; i++) {
                var c = this.clouds[i];
                if (Math.sqrt(Math.pow(c.x-this.ship.x,2) + Math.pow(c.z-this.ship.z,2)) > 120000) {
                    var fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                    var fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                    c.z = this.ship.z + fZ*90000 + (Math.random()-0.5)*50000;
                    c.x = this.ship.x + fX*90000 + (Math.random()-0.5)*50000;
                }
            }
            this.floaters = this.floaters.filter(function(f) { f.life -= 1/60; f.y -= 80/60; return f.life > 0; });
            this.fx = this.fx.filter(function(f) { f.x+=f.vx/60; f.y+=f.vy/60; f.z+=f.vz/60; f.life-=1/60; return f.life>0; });
        },

        _kill: function(t, rew) {
            GameSfx.play('boom');
            this._fx(t.x,t.y,t.z,'#f33',40,300);
            this._fx(t.x,t.y,t.z,'#234',30,600);
            this.floaters.push({x:t.x,y:t.y,z:t.z,text:"+$"+rew,life:2});
            this.session.kills++;
            this.session.cash += rew;
            if (this.session.kills >= this.session.goal && this.mode==='SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res;
            GameSfx.stop();
            var self = this;
            setTimeout(function() {
                if (window.System && window.System.gameOver) window.System.gameOver(self.session.kills*100, res==='VICTORY', self.session.cash);
                else if (window.System && window.System.home) window.System.home();
            }, 2000);
        },

        _fx: function(x,y,z,c,n,s) {
            for(var i=0;i<n;i++) this.fx.push({x:x,y:y,z:z,vx:(Math.random()-0.5)*1200,vy:(Math.random()-0.5)*1200,vz:(Math.random()-0.5)*1200,life:1+Math.random(),c:c,size:s+Math.random()*50});
        },

        _startMission: function() {
            this.state = 'PLAYING';
            this.ship.x = (Math.random()-0.5)*10000;
            this.ship.z = (Math.random()-0.5)*10000;
            GameSfx.startEngine();
            var self = this;
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(function() {
                    if (self.state === 'PLAYING' && self.net.playersRef) {
                        self.net.playersRef.child(self.net.uid).update({
                            x: self.ship.x, y: self.ship.y, z: self.ship.z,
                            pitch: self.ship.pitch, yaw: self.ship.yaw, roll: self.ship.roll, hp: self.ship.hp
                        });
                    }
                }, 100);
            }
        },

        _draw: function(ctx, w, h) {
            ctx.save();
            if (window.Gfx && window.Gfx.shake > 0.5) {
                ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            }
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            this._drawPilotFX(ctx, w, h); // Efeitos de Blackout (G-Force)
            this._drawCockpit(ctx,w,h);   // MANCHE MILITAR
            ctx.restore();
            ctx.fillStyle='rgba(0,0,0,0.1)';
            for(var i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
        },

        _drawWorld: function(ctx,w,h) {
            ctx.save();
            ctx.translate(w/2,h/2);
            ctx.rotate(-this.ship.roll);
            var hy = Math.sin(this.ship.pitch) * h * 1.5;
            var sG = ctx.createLinearGradient(0,-h*4,0,hy);
            sG.addColorStop(0,'#001a33'); sG.addColorStop(0.5,'#004080'); sG.addColorStop(1,'#66a3ff');
            ctx.fillStyle = sG;
            ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
            var gG = ctx.createLinearGradient(0,hy,0,h*4);
            gG.addColorStop(0,'#0a1a0a'); gG.addColorStop(1,'#020502');
            ctx.fillStyle = gG;
            ctx.fillRect(-w*3,hy,w*6,h*4);
            ctx.strokeStyle='rgba(0,255,100,0.15)'; ctx.lineWidth=2; ctx.beginPath();
            var st=8000, sx=Math.floor(this.ship.x/st)*st-st*10, sz=Math.floor(this.ship.z/st)*st-st*10;
            for(var x=0;x<=20;x++) for(var z=0;z<=20;z++) {
                var p=Engine3D.project(sx+x*st,0,sz+z*st,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                if(p.visible&&p.s>0.01) { ctx.moveTo(p.x-20*p.s,p.y); ctx.lineTo(p.x+20*p.s,p.y); }
            }
            ctx.stroke();
            ctx.strokeStyle='rgba(0,255,200,0.8)'; ctx.lineWidth=3;
            ctx.beginPath(); ctx.moveTo(-w*3,hy); ctx.lineTo(w*3,hy); ctx.stroke();
            ctx.restore();
        },

        _drawEntities: function(ctx,w,h) {
            var buf=[];
            var self = this;
            var add = function(list, t) {
                list.forEach(function(o) {
                    var p = Engine3D.project(o.x, o.y, o.z, self.ship.x, self.ship.y, self.ship.z, self.ship.pitch, self.ship.yaw, self.ship.roll, w, h);
                    if(p.visible) buf.push({p: p, t: t, o: o});
                });
            };
            add(this.clouds,'c'); add(this.entities,'e'); add(this.bullets,'b'); add(this.missiles,'m'); add(this.fx,'f'); add(this.floaters,'x');
            
            if(this.mode !== 'SINGLE' && this.net.players) {
                Object.keys(this.net.players).forEach(function(uid) {
                    if(uid !== self.net.uid && self.net.players[uid] && self.net.players[uid].hp > 0){
                        var rp = self.net.players[uid];
                        var p = Engine3D.project(rp.x, rp.y, rp.z, self.ship.x, self.ship.y, self.ship.z, self.ship.pitch, self.ship.yaw, self.ship.roll, w, h);
                        if(p.visible) buf.push({p: p, t:'p', o: rp, id: uid});
                    }
                });
            }
            
            buf.sort(function(a,b) { return b.p.z - a.p.z; });
            
            buf.forEach(function(d) {
                var p=d.p, s=p.s, o=d.o;
                if(d.t==='c'){ctx.fillStyle='rgba(255,255,255,0.05)';ctx.beginPath();ctx.arc(p.x,p.y,o.size*s,0,Math.PI*2);ctx.fill();}
                else if(d.t==='x'){ctx.fillStyle='#2ecc71';ctx.font="bold "+Math.max(16,1500*s)+"px 'Russo One'";ctx.textAlign='center';ctx.fillText(o.text,p.x,p.y);}
                else if(d.t==='e'||d.t==='p'){
                    var isNet = d.t==='p';
                    Engine3D.drawJetModel(ctx, p.x, p.y, Math.max(0.1, s*2), o.roll || 0, !isNet, o.isBoss ? '#f39c12' : '#3498db');
                    
                    if(isNet){ctx.fillStyle=self.mode==='COOP'?'#0ff':'#f33';ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.fillText(o.name||'ALLY',p.x,p.y-300*s-10);}
                    
                    var locked = self.combat.target && ((isNet && self.combat.target.uid === d.id) || (!isNet && self.combat.target === o));
                    var bs = Math.max(30, 200*s);
                    if(locked){ctx.strokeStyle='#f03';ctx.lineWidth=4;ctx.strokeRect(p.x-bs,p.y-bs,bs*2,bs*2);ctx.fillStyle='#f03';ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText('LOCK',p.x,p.y+bs+25);}
                    else if(!isNet){ctx.strokeStyle='rgba(255,0,0,0.6)';ctx.lineWidth=2;ctx.strokeRect(p.x-bs,p.y-bs,bs*2,bs*2);}
                }
                else if(d.t==='b'){ctx.globalCompositeOperation='lighter';ctx.fillStyle=o.isEnemy?'#f00':'#ff0';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,6*s),0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';}
                else if(d.t==='m'){ctx.fillStyle='#fff';ctx.fillRect(p.x-10*s,p.y-10*s,20*s,20*s);}
                else if(d.t==='f'){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.max(0,o.life);ctx.fillStyle=o.c;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,o.size*s),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
            });
        },

        _drawPilotFX: function(ctx, w, h) {
            if (this.ship.gForce > 5.0) {
                var intensity = Math.min(1.0, (this.ship.gForce - 5.0) / 4.0); 
                ctx.fillStyle = "rgba(0, 0, 0, " + (intensity * 0.8) + ")"; ctx.fillRect(0,0,w,h);
            } else if (this.ship.gForce < -1.5) {
                var intensityN = Math.min(1.0, (Math.abs(this.ship.gForce) - 1.5) / 2.0);
                ctx.fillStyle = "rgba(231, 76, 60, " + (intensityN * 0.6) + ")"; ctx.fillRect(0,0,w,h);
            }
        },

        _drawCockpit: function(ctx,w,h){
            var cx = w/2, cy = h/2;
            
            // INJEÇÃO: MANCHE E ACELERADOR MILITAR (HOTAS)
            if(this.pilot.active){
                // 1. ACELERADOR (MÃO ESQUERDA)
                ctx.save();
                var thrY = h - 50 - (this.pilot.throttle * 150);
                ctx.translate(60, thrY);
                // Calha do acelerador
                ctx.fillStyle = '#111'; ctx.fillRect(-15, 0, 30, h - thrY + 50); 
                // Punho do acelerador
                ctx.fillStyle = '#222'; ctx.strokeStyle = '#444'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(30, -40); ctx.lineTo(30, 20); ctx.lineTo(-30, 30); ctx.closePath();
                ctx.fill(); ctx.stroke();
                // Botões laterais
                ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(15, -15, 8, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(-10, 0, 6, 0, Math.PI*2); ctx.fill();
                ctx.restore();

                // 2. MANCHE / FLIGHT STICK (MÃO DIREITA / CENTRO)
                ctx.save();
                var stickX = cx + (this.pilot.targetRoll * 180);
                var stickY = h - 40 + (this.pilot.targetPitch * 100);
                ctx.translate(stickX, stickY);
                ctx.rotate(this.pilot.targetRoll * 0.4);
                
                // Haste de metal
                ctx.fillStyle = '#151515';
                ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(25, h - stickY + 50); ctx.lineTo(-25, h - stickY + 50); ctx.fill();
                // Gatilho Frontal
                ctx.fillStyle = this.combat.missileCd <= 0 ? '#e74c3c' : '#500';
                ctx.fillRect(-35, -80, 20, 35);
                // Punho principal (Grip)
                ctx.fillStyle = '#222';
                ctx.beginPath(); ctx.moveTo(-22, -130); ctx.lineTo(22, -140); ctx.lineTo(25, 0); ctx.lineTo(-25, 0); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
                // Detalhes emborrachados
                ctx.fillStyle = '#111'; ctx.fillRect(-20, -50, 40, 10); ctx.fillRect(-20, -20, 40, 10);
                // Cabeça do Manche (Top Hat Switch)
                ctx.fillStyle = '#333';
                ctx.beginPath(); ctx.arc(0, -135, 28, Math.PI, 0); ctx.fill();
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(10, -145, 6, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(-10, -140, 8, 0, Math.PI*2); ctx.fill();
                
                ctx.restore();
            } else {
                ctx.fillStyle='#f00';ctx.textAlign='center';ctx.font='bold 22px Arial';ctx.fillText('PLACE HANDS ON SCREEN',cx,h-150);
            }

            // HUD OVERLAY NO COCKPIT
            ctx.fillStyle='rgba(0,30,10,0.7)';ctx.fillRect(0,0,w,60);
            ctx.fillStyle='#0f6';ctx.font='bold 18px "Chakra Petch", Arial';ctx.textAlign='left';
            ctx.fillText("SPD: " + Math.floor(this.ship.speed * 3.6) + " KM/H", 20, 25);
            ctx.fillText("MACH: " + this.ship.mach.toFixed(2), 20, 45);
            
            ctx.textAlign='right';
            ctx.fillText("ALT: " + Math.floor(this.ship.y) + " M", w-20, 25);
            ctx.fillText("G-FORCE: " + this.ship.gForce.toFixed(1) + "G", w-20, 45);
            
            var hdg=(this.ship.yaw*180/Math.PI)%360; if(hdg<0) hdg+=360;
            ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 24px "Russo One"';ctx.fillText(Math.floor(hdg)+'°', cx, 40);

            // AVISO DE ESTOL
            if (this.ship.isStalling) {
                ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
                ctx.textAlign = "center"; ctx.font = "bold 32px 'Russo One'"; ctx.fillText("STALL - PUSH DOWN", cx, cy - 80); 
            }
            if (this.combat.target) {
                if (this.combat.lockTimer >= 1.0) {
                    ctx.fillStyle = "#f03"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
                    ctx.fillText("SHOOT (CLAP)!", cx, cy + 80);
                } else {
                    ctx.fillStyle = "#ff0"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center";
                    ctx.fillText("LOCKING...", cx, cy + 80);
                }
            }

            // DADOS TÁTICOS BASE
            ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(w/2 - 150, h-45, 300, 35);
            ctx.fillStyle='#222';ctx.fillRect(w/2 - 140, h-25, 280, 8);
            ctx.fillStyle=this.ship.hp>30?'#2ecc71':'#e74c3c';ctx.fillRect(w/2 - 140, h-25, 280*(Math.max(0,this.ship.hp)/100), 8);
            ctx.fillStyle='#fff';ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillText("INTEGRIDADE: " + Math.floor(this.ship.hp) + "%", w/2, h-30);
            
            ctx.fillStyle='#f1c40f';ctx.font='bold 20px "Russo One"';ctx.textAlign='right';ctx.fillText("$" + this.session.cash, w-20, h-20);
        },
        
        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,10,0.95)';ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font='bold 40px "Russo One"';ctx.fillText('US ARMY FLIGHT SIM',w/2,h*0.15);
            var ps = Object.keys(this.net.players);
            ctx.font='bold 24px Arial';ctx.fillStyle='#fff';ctx.fillText("PILOTS: " + ps.length,w/2,h*0.25);
            var py=h*0.35;
            for(var uid in this.net.players) {
                var p = this.net.players[uid];
                ctx.fillStyle = p.ready ? '#2ecc71' : '#e74c3c';
                ctx.fillText("[" + (p.ready ? 'READY' : 'WAITING') + "] " + p.name, w/2, py);
                py+=40;
            }
            if(this.net.isHost){
                var r = ps.length >= 1;
                ctx.fillStyle = r ? '#c00' : '#333'; ctx.fillRect(w/2-160,h*0.85,320,60);
                ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(r ? 'ESPAÇO: LAUNCH MISSION' : 'WAITING...',w/2,h*0.85+38);
            }else{
                var isR = this.net.players[this.net.uid] && this.net.players[this.net.uid].ready;
                ctx.fillStyle = isR ? '#e83' : '#27a'; ctx.fillRect(w/2-160,h*0.85,320,60);
                ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(isR ? 'STANDBY' : 'ESPAÇO: MARK READY',w/2,h*0.85+38);
            }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(0,10,5,0.95)';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='rgba(0,255,100,0.2)';ctx.lineWidth=2;ctx.strokeRect(50,50,w-100,h-100);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font='bold 30px "Russo One"';ctx.fillText('PILOT CALIBRATION',w/2,h*0.3);
            ctx.fillStyle='#fff';ctx.font='bold 20px Arial';ctx.fillText('HOLD NEUTRAL POSITION',w/2,h*0.4);
            ctx.fillStyle='#f1c40f';ctx.font='bold 16px Arial';ctx.fillText('RAISE ARMS = CLIMB | LOWER ARMS = DIVE | CLAP = FIRE',w/2,h*0.5);
            var pct = 1 - this.timer/3;
            ctx.fillStyle='#111';ctx.fillRect(w/2-200,h*0.6,400,10);
            ctx.fillStyle='#0f6';ctx.fillRect(w/2-200,h*0.6,400*pct,10);
            ctx.fillStyle=this.pilot.active?'#0f6':'#f33';
            ctx.fillText(this.pilot.active?'>> INPUT DETECTED':'>> POSITION CAMERA',w/2,h*0.7);
        },

        _drawEnd: function(ctx,w,h){
            this._draw(ctx,w,h);
            ctx.fillStyle='rgba(0,0,0,0.85)';ctx.fillRect(0,0,w,h);
            ctx.textAlign='center';ctx.font='bold 40px "Russo One"';
            ctx.fillStyle=this.state==='VICTORY'?'#2ecc71':'#e74c3c';
            ctx.fillText(this.state==='VICTORY'?'MISSION COMPLETE':'AIRCRAFT LOST',w/2,h/2);
            ctx.fillStyle='#f1c40f';ctx.font='bold 30px Arial';
            ctx.fillText("REWARDS: $" + this.session.cash,w/2,h/2+60);
        }
    };

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
