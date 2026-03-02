// =============================================================================
// AERO STRIKE: TACTICAL YOKE SIMULATOR (AAA PHYSICS INJECTED)
// COMPATÍVEL COM: core.js (MoveNet, System.loop, Profile, Sfx, Gfx)
// STATUS: 100% INICIALIZÁVEL, YOKE VIRTUAL, FÍSICA AERODINÂMICA REAL
// =============================================================================
(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES FÍSICAS REAIS
    // -----------------------------------------------------------------
    const GAME_CONFIG = {
        GRAVITY: 9.80665,     
        R_GAS: 287.05,        
        GAMMA: 1.4,           
        MAX_ALTITUDE: 40000   
    };

    const PLANE_STATS = {
        thrust: 120000, mass: 12000, wingArea: 28.0,
        cd0: 0.022, kInduced: 0.05, clMax: 1.6, stallAngle: 0.26,
        maxPitchRate: 1.5, maxRollRate: 3.0
    };

    const Engine3D = {
        fov: 800,
        project: (objX, objY, objZ, camX, camY, camZ, pitch, yaw, roll, w, h) => {
            let dx = objX - camX, dy = objY - camY, dz = objZ - camZ;
            let cy = Math.cos(-yaw), sy = Math.sin(-yaw);
            let x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
            let cp = Math.cos(-pitch), sp = Math.sin(-pitch);
            let y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            if (z2 < 10) return { visible: false };
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let finalX = x1 * cr - y2 * sr, finalY = x1 * sr + y2 * cr;
            let scale = Engine3D.fov / z2;
            return { x: (w/2) + (finalX * scale), y: (h/2) - (finalY * scale), s: scale, z: z2, visible: true };
        },
        drawJetModel: (ctx, px, py, scale, roll, isEnemy, color) => {
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

    const GameSfx = {
        ctx: null, engineSrc: null, ready: false,
        init: function() {
            if (this.ready) return;
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.ready = true; } catch(e) {}
        },
        startEngine: function() {
            if (!this.ready || this.engineSrc || !this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < buf.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
            this.engineSrc = this.ctx.createBufferSource();
            this.engineSrc.buffer = buf; this.engineSrc.loop = true;
            const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
            const gain = this.ctx.createGain(); gain.gain.value = 0.15;
            this.engineSrc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
            this.engineSrc.start();
        },
        play: function(type) {
            if (type === 'lock') window.Sfx?.play(1000, 'square', 0.1, 0.1);
            else if (type === 'vulcan') window.Sfx?.play(300, 'sawtooth', 0.08, 0.15);
            else if (type === 'missile') {
                if(this.ctx) {
                    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
                    o.type='square'; o.frequency.setValueAtTime(150,t); o.frequency.linearRampToValueAtTime(900,t+0.5);
                    g.gain.setValueAtTime(0.5,t); g.gain.exponentialRampToValueAtTime(0.01,t+1);
                    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+1);
                }
            }
            else if (type === 'boom') window.Sfx?.play(80, 'sawtooth', 0.4, 0.2);
        },
        stop: function() { if (this.engineSrc) { try { this.engineSrc.stop(); } catch(e){} this.engineSrc = null; } }
    };

    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30 },
        // Ship agora tem vetores de velocidade (vx, vy, vz) e telemetria (gForce, alpha, mach)
        ship: { hp: 100, speed: 250, x: 0, y: 3000, z: 0, vx: 0, vy: 0, vz: 250, pitch: 0, yaw: 0, roll: 0, gForce: 1, alpha: 0, mach: 0, isStalling: false },
        pilot: { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false, throttle: 0.8 },
        timer: 3.0,
        entities: [], bullets: [], missiles: [], clouds: [], fx: [], floaters: [],
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null, loop: null },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30 };
            this.ship = { hp: 100, speed: 250, x: 0, y: 3000, z: 0, vx: 0, vy: 0, vz: 250, pitch: 0, yaw: 0, roll: 0, gForce: 1, alpha: 0, mach: 0, isStalling: false };
            this.pilot = { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false, throttle: 0.8 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.fx = []; this.floaters = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            for (let i = 0; i < 50; i++) this.clouds.push({ x: (Math.random()-0.5)*100000, y: 5000+Math.random()*15000, z: (Math.random()-0.5)*100000, size: 3000+Math.random()*5000 });
            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random()*9999);
            this.mode = faseData?.mode || 'SINGLE';
            if (this.mode !== 'SINGLE' && window.DB) this._initNet();
            else { this.state = 'CALIBRATION'; this.timer = 3.0; }
            GameSfx.init();
        },

        _initNet: function() {
            this.state = 'LOBBY'; this.net.players = {};
            this.net.sessionRef = window.DB.ref('usarmy_sessions/aero_' + this.mode);
            this.net.playersRef = this.net.sessionRef.child('pilots');
            this.net.playersRef.child(this.net.uid).onDisconnect().remove();
            this.net.sessionRef.child('host').once('value').then(snap => {
                if (!snap.val()) {
                    this.net.isHost = true;
                    this.net.sessionRef.child('host').set(this.net.uid);
                    this.net.sessionRef.child('state').set('LOBBY');
                    this.net.playersRef.remove();
                }
                this.net.playersRef.child(this.net.uid).set({
                    name: window.Profile?.username || 'PILOT', ready: false, hp: 100,
                    x: 0, y: 3000, z: 0, pitch: 0, yaw: 0, roll: 0
                });
            });
            this.net.playersRef.on('value', snap => { this.net.players = snap.val() || {}; });
            this.net.sessionRef.child('state').on('value', snap => {
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') { this.state = 'CALIBRATION'; this.timer = 3.0; }
            });
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            if (dt > 0.1) dt = 0.1; // Limite de estabilidade
            if (dt < 0.001) return 0;

            if (this.state === 'LOBBY') { this._drawLobby(ctx, w, h); return 0; }
            
            this._readPose(pose, w, h, dt);
            
            if (this.state === 'CALIBRATION') {
                this.timer -= dt;
                this._drawCalib(ctx, w, h);
                if (this.timer <= 0) this._startMission();
                return 0;
            }
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this._drawEnd(ctx, w, h);
                return this.session.cash;
            }

            // =================================================================
            // INJEÇÃO: FÍSICA AERODINÂMICA AAA
            // =================================================================
            let altitude = Math.max(0, Math.min(GAME_CONFIG.MAX_ALTITUDE, this.ship.y));
            let tempK = 288.15 - 0.0065 * altitude; 
            let airDensity = 1.225 * Math.pow(Math.max(0, 1 - 0.0000225577 * altitude), 4.2561); 
            let speedOfSound = Math.sqrt(GAME_CONFIG.GAMMA * GAME_CONFIG.R_GAS * tempK);

            let V = Math.hypot(this.ship.vx, this.ship.vy, this.ship.vz);
            if (V === 0) V = 1;
            this.ship.speed = V;
            this.ship.mach = V / speedOfSound;

            let cy = Math.cos(this.ship.yaw), sy = Math.sin(this.ship.yaw);
            let cp = Math.cos(this.ship.pitch), sp = Math.sin(this.ship.pitch);
            let cr = Math.cos(this.ship.roll), sr = Math.sin(this.ship.roll);

            let fwdX = sy * cp, fwdY = sp, fwdZ = cy * cp;
            let upX = -sy*sp*cr - cy*sr, upY = cp*cr, upZ = -cy*sp*cr + sy*sr;

            // Ângulo de Ataque (Alpha)
            let vDirX = this.ship.vx/V, vDirY = this.ship.vy/V, vDirZ = this.ship.vz/V;
            let cosAlpha = fwdX*vDirX + fwdY*vDirY + fwdZ*vDirZ;
            this.ship.alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
            if (isNaN(this.ship.alpha)) this.ship.alpha = 0;

            // Lift e Drag
            let CL = this.ship.alpha * (PLANE_STATS.clMax / PLANE_STATS.stallAngle); 
            this.ship.isStalling = this.ship.alpha > PLANE_STATS.stallAngle || V < 50;
            if (this.ship.isStalling) CL = Math.max(0, CL - (this.ship.alpha - PLANE_STATS.stallAngle) * 5.0); 

            let CD = PLANE_STATS.cd0 + PLANE_STATS.kInduced * (CL * CL);

            let dynPress = 0.5 * airDensity * (V * V);
            let liftMag = dynPress * PLANE_STATS.wingArea * CL;
            let dragMag = dynPress * PLANE_STATS.wingArea * CD;

            let liftFx = upX * liftMag, liftFy = upY * liftMag, liftFz = upZ * liftMag;
            let dragFx = -vDirX * dragMag, dragFy = -vDirY * dragMag, dragFz = -vDirZ * dragMag;
            
            let thrustMag = PLANE_STATS.thrust * this.pilot.throttle;
            let thrustFx = fwdX * thrustMag, thrustFy = fwdY * thrustMag, thrustFz = fwdZ * thrustMag;

            let weight = PLANE_STATS.mass * GAME_CONFIG.GRAVITY;
            
            let Fx = liftFx + dragFx + thrustFx;
            let Fy = liftFy + dragFy + thrustFy - weight;
            let Fz = liftFz + dragFz + thrustFz;

            // Aceleração, Velocidade e Posição
            this.ship.vx += (Fx / PLANE_STATS.mass) * dt;
            this.ship.vy += (Fy / PLANE_STATS.mass) * dt;
            this.ship.vz += (Fz / PLANE_STATS.mass) * dt;

            this.ship.x += this.ship.vx * dt;
            this.ship.y += this.ship.vy * dt;
            this.ship.z += this.ship.vz * dt;

            // Força G Vectorial Real
            let specForce = Math.sqrt(Math.pow(liftFx+dragFx+thrustFx, 2) + Math.pow(liftFy+dragFy+thrustFy, 2) + Math.pow(liftFz+dragFz+thrustFz, 2));
            this.ship.gForce = specForce / weight;

            if (this.ship.y < 50) { 
                this.ship.y = 50; 
                this.ship.vy = Math.max(0, this.ship.vy); 
                if (this.ship.pitch < 0) this.ship.pitch = 0; 
            }
            // =================================================================

            this._processCombat(dt, w, h);
            this._spawnEnemies();
            this._updateEntities(dt, now);
            this._updateBullets(dt);
            this._updateMissiles(dt); // PN Guidance atualizado
            this._cleanupFx();

            if (this.mode !== 'SINGLE' && this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');

            this._draw(ctx, w, h);
            return this.session.cash + this.session.kills * 10;
        },

        cleanup: function() {
            GameSfx.stop();
            if (this.net.loop) clearInterval(this.net.loop);
            if (this.mode !== 'SINGLE' && this.net.playersRef) {
                this.net.playersRef.off();
                this.net.sessionRef?.child('state')?.off();
                this.net.playersRef.child(this.net.uid)?.remove();
                if (this.net.isHost) this.net.sessionRef?.remove();
            }
        },

        // LOGÍCA DE CÂMERA INTACTA DA VERSÃO QUE FUNCIONA NO SEU SISTEMA
        _readPose: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false, rawThr = this.pilot.throttle;
            this.pilot.headTilt = false;
            
            let pts = null;
            if (pose && Array.isArray(pose)) pts = pose;
            else if (pose && pose.keypoints) pts = pose.keypoints;
            else if (pose && Array.isArray(pose) && pose[0] && pose[0].keypoints) pts = pose[0].keypoints;

            if (pts) {
                const kp = function(name) {
                    for(var i=0; i<pts.length; i++) {
                        if (pts[i] && (pts[i].part === name || pts[i].name === name)) return pts[i];
                    }
                    return null;
                };
                
                const rw = kp('right_wrist'), lw = kp('left_wrist');
                const rEar = kp('right_ear'), lEar = kp('left_ear');
                const pX = function(x) { return (1 - (x / 640)) * w; }; 
                const pY = function(y) { return (y / 480) * h; };
                
                if (rEar?.score > 0.4 && lEar?.score > 0.4 && (rEar.y - lEar.y) > 20) this.pilot.headTilt = true;
                
                if (rw?.score > 0.3 && lw?.score > 0.3) {
                    inputDetected = true;
                    let rx = pX(rw.x), ry = pY(rw.y), lx = pX(lw.x), ly = pY(lw.y);
                    
                    trgRoll = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, Math.atan2(ry - ly, rx - lx)));
                    let avgY = (ry + ly) / 2;
                    
                    if (this.state === 'CALIBRATION') {
                        this.pilot.baseY = this.pilot.baseY * 0.95 + avgY * 0.05;
                        if (!this.pilot.baseY) this.pilot.baseY = avgY;
                    } else {
                        let deltaY = avgY - this.pilot.baseY;
                        let threshold = h * 0.10; 
                        if (deltaY < -threshold) trgPitch = 1.0 * Math.min(1, Math.abs(deltaY)/200);      
                        else if (deltaY > threshold) trgPitch = -1.0 * Math.min(1, Math.abs(deltaY)/200); 
                        else trgPitch = 0;
                    }

                    // Acelerador adaptado
                    rawThr = 1.1 - (lw.y / 480);
                    rawThr = Math.max(0.1, Math.min(1.0, isNaN(rawThr) ? 0.5 : rawThr));
                    if (Math.abs(lx - rx) < 80) this.pilot.headTilt = true; 
                }
            }

            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 8 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 5 * dt;
                this.pilot.throttle += (rawThr - this.pilot.throttle) * 5 * dt;

                if (this.state === 'PLAYING') {
                    // Convertemos o input do piloto para as taxas de rotação da física aerodinâmica
                    let turnRate = (this.ship.speed > 50 && !this.ship.isStalling) ? Math.sin(this.ship.roll) * (this.ship.speed/300) * 1.5 : 0;
                    this.ship.yaw += turnRate * dt;
                    
                    this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * PLANE_STATS.maxRollRate * dt;
                    this.ship.pitch += this.pilot.targetPitch * PLANE_STATS.maxPitchRate * dt;
                    
                    if (this.ship.isStalling) {
                        this.ship.pitch += (-0.5 - this.ship.pitch) * 2 * dt;
                        this.ship.roll += (Math.random() - 0.5) * 4 * dt;
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
            this.combat.target = null; this.combat.locked = false; let closestZ = Infinity;
            const scan = (obj, isPlayer, uid) => {
                let p = Engine3D.project(obj.x, obj.y, obj.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (p.visible && p.z > 200 && p.z < 60000 && Math.abs(p.x - w/2) < w*0.35 && Math.abs(p.y - h/2) < h*0.35 && p.z < closestZ) {
                    closestZ = p.z;
                    this.combat.target = isPlayer ? {...obj, isPlayer: true, uid} : obj;
                }
            };
            this.entities.forEach(e => scan(e, false));
            if (this.mode === 'PVP') {
                Object.keys(this.net.players).forEach(id => {
                    if (id !== this.net.uid && this.net.players[id]?.hp > 0) scan(this.net.players[id], true, id);
                });
            }
            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 1.0) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true;
                    this.combat.lockTimer = 1.0;
                }
            } else {
                this.combat.lockTimer -= dt * 2;
                if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }
            if (this.combat.locked && this.combat.target && performance.now() - this.combat.vulcanCd > 80) {
                this.combat.vulcanCd = performance.now();
                let spd = this.ship.speed + 800; // Velocidade relativa da bala
                let dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                this.bullets.push({
                    x: this.ship.x + Math.cos(this.ship.yaw)*60, y: this.ship.y-20, z: this.ship.z - Math.sin(this.ship.yaw)*60,
                    vx: this.ship.vx + (dx/dist)*spd, vy: this.ship.vy + (dy/dist)*spd, vz: this.ship.vz + (dz/dist)*spd,
                    isEnemy: false, life: 2
                });
                GameSfx.play('vulcan');
                window.Gfx?.shakeScreen(4);
            }
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 1.2;
                this.missiles.push({
                    x: this.ship.x, y: this.ship.y-50, z: this.ship.z,
                    vx: this.ship.vx, vy: this.ship.vy, vz: this.ship.vz,
                    target: this.combat.target, life: 6, maxG: 30
                });
                GameSfx.play('missile');
                window.Gfx?.shakeScreen(12);
            }
        },

        _spawnEnemies: function() {
            if (this.entities.length >= 15 || Math.random() > 0.05) return;
            let dist = 10000 + Math.random()*20000, r = Math.random();
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let sx = this.ship.x + fX*dist + (Math.random()-0.5)*30000;
            let sz = this.ship.z + fZ*dist + (Math.random()-0.5)*30000;
            
            // Inimigos agora com vetores reais
            if (r < 0.35) this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 250, yaw: Math.random()*Math.PI*2, roll: 0, pitch: 0 });
            else if (r < 0.75) this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(1000, this.ship.y+(Math.random()-0.5)*8000), z: sz, vx: fX*250, vy: 0, vz: fZ*250, hp: 150, yaw: this.ship.yaw, roll: 0, pitch: 0 });
            else this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(1000, this.ship.y+(Math.random()-0.5)*8000), z: sz, vx: -fX*300, vy: 0, vz: -fZ*300, hp: 150, yaw: this.ship.yaw + Math.PI, roll: 0, pitch: 0 });
        },

        _updateEntities: function(dt, now) {
            for (let e of this.entities) {
                if (e.type.startsWith('jet')) {
                    // IA Física Básica
                    let dx = this.ship.x - e.x, dy = this.ship.y - e.y, dz = this.ship.z - e.z;
                    let targetYaw = Math.atan2(dx, dz);
                    let targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
                    
                    e.roll += (0 - e.roll) * 2 * dt;
                    
                    let yawDiff = targetYaw - e.yaw;
                    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                    
                    e.yaw += yawDiff * 0.5 * dt;
                    e.pitch += (targetPitch - e.pitch) * 0.5 * dt;
                    e.roll = yawDiff * 2.0; 

                    let speed = e.type === 'jet_attack' ? 300 : 250;
                    e.vx = Math.sin(e.yaw) * Math.cos(e.pitch) * speed;
                    e.vy = Math.sin(e.pitch) * speed;
                    e.vz = Math.cos(e.yaw) * Math.cos(e.pitch) * speed;
                }
                
                e.x += e.vx*dt; e.y += e.vy*dt; e.z += e.vz*dt;
                
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) > 120000) { e.hp = -1; continue; }
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) < 10000 && ((e.type==='jet_attack' && Math.random()<0.04) || (e.type==='tank' && Math.random()<0.02))) {
                    let bSpd = 600;
                    let d = Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z);
                    this.bullets.push({
                        x: e.x, y: e.y, z: e.z,
                        vx: e.vx - (e.x-this.ship.x)/d*bSpd, vy: e.vy - (e.y-this.ship.y)/d*bSpd, vz: e.vz - (e.z-this.ship.z)/d*bSpd,
                        isEnemy: true, life: 3.5
                    });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);
        },

        _updateBullets: function(dt) {
            for (let i = this.bullets.length-1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx*dt; b.y += b.vy*dt; b.z += b.vz*dt; b.life -= dt;
                if (b.isEnemy) {
                    if (Math.hypot(b.x-this.ship.x, b.y-this.ship.y, b.z-this.ship.z) < 80) { // Raio hitbox realista
                        this.ship.hp -= 8;
                        window.Gfx?.shakeScreen(15);
                        if (this.ship.hp <= 0) this._endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x-e.x, b.y-e.y, b.z-e.z) < 150) {
                            e.hp -= 40; b.life = 0;
                            this._fx(e.x,e.y,e.z,'#f90',4,40);
                            if (e.hp <= 0) this._kill(e, e.type==='tank'?200:100);
                            break;
                        }
                    }
                    if (this.mode==='PVP' && b.life>0) {
                        Object.keys(this.net.players).forEach(uid => {
                            if (uid!==this.net.uid && this.net.players[uid]?.hp>0 && Math.hypot(b.x-this.net.players[uid].x, b.y-this.net.players[uid].y, b.z-this.net.players[uid].z)<150) {
                                b.life=0;
                                this._fx(this.net.players[uid].x,this.net.players[uid].y,this.net.players[uid].z,'#f90',4,50);
                                window.DB?.ref(`usarmy_sessions/aero_${this.mode}/pilots/${uid}/hp`).set(this.net.players[uid].hp-10);
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this._fx(b.x,0,b.z,'#789',3,50); }
                }
                if (b.life <= 0) this.bullets.splice(i,1);
            }
        },

        // INJEÇÃO: PROPORTIONAL NAVIGATION REAL
        _updateMissiles: function(dt) {
            for (let i = this.missiles.length-1; i >= 0; i--) {
                let m = this.missiles[i];
                let V = Math.hypot(m.vx, m.vy, m.vz) || 1;

                if (m.target && (m.target.hp>0 || m.target.isPlayer)) {
                    let rx = m.target.x - m.x, ry = m.target.y - m.y, rz = m.target.z - m.z;
                    let dist2 = rx*rx + ry*ry + rz*rz;
                    let dist = Math.sqrt(dist2);
                    
                    if (dist < 80) { // Raio Letal
                        if (m.target.isPlayer && this.mode==='PVP') {
                            window.DB?.ref(`usarmy_sessions/aero_${this.mode}/pilots/${m.target.uid}/hp`).set(m.target.hp-50);
                            this._fx(m.target.x,m.target.y,m.target.z,'#f33',40,300);
                            this.session.cash += 500;
                        } else if (!m.target.isPlayer) {
                            m.target.hp -= 400;
                            if (m.target.hp <= 0) this._kill(m.target, m.target.type==='tank'?300:200);
                        }
                        m.life = 0;
                    } else {
                        // PN Guidance Math
                        let tx = m.target.vx || 0, ty = m.target.vy || 0, tz = m.target.vz || 0;
                        let vrx = tx - m.vx, vry = ty - m.vy, vrz = tz - m.vz;
                        
                        let cx = ry * vrz - rz * vry, cy = rz * vrx - rx * vrz, cz = rx * vry - ry * vrx;
                        let omx = cx/dist2, omy = cy/dist2, omz = cz/dist2;
                        
                        let Vc = -(rx*vrx + ry*vry + rz*vrz) / dist;
                        let ux = rx/dist, uy = ry/dist, uz = rz/dist;
                        
                        let oxux = omy*uz - omz*uy, oxuy = omz*ux - omx*uz, oxuz = omx*uy - omy*ux;
                        
                        let N = 4.0;
                        let ax = N * Vc * oxux, ay = N * Vc * oxuy, az = N * Vc * oxuz;
                        
                        let accMag = Math.hypot(ax, ay, az);
                        let maxAcc = m.maxG * GAME_CONFIG.GRAVITY;
                        if (accMag > maxAcc) { ax = (ax/accMag)*maxAcc; ay = (ay/accMag)*maxAcc; az = (az/accMag)*maxAcc; }
                        
                        if (!isNaN(ax)) { m.vx += ax*dt; m.vy += ay*dt; m.vz += az*dt; }
                    }
                }
                
                // Propulsão do míssil
                let vDirX = m.vx/V, vDirY = m.vy/V, vDirZ = m.vz/V;
                m.vx += vDirX * 800 * dt; m.vy += vDirY * 800 * dt; m.vz += vDirZ * 800 * dt;

                m.x += m.vx*dt; m.y += m.vy*dt; m.z += m.vz*dt; m.life -= dt;
                this.fx.push({x:m.x,y:m.y,z:m.z,vx:(Math.random()-0.5)*15,vy:(Math.random()-0.5)*15,vz:(Math.random()-0.5)*15,life:0.5,c:'rgba(255,200,100,0.8)',size:8});
                if (m.life <= 0) this.missiles.splice(i,1);
            }
        },

        _cleanupFx: function() {
            for (let c of this.clouds) {
                if (Math.hypot(c.x-this.ship.x, c.z-this.ship.z) > 120000) {
                    let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                    let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                    c.z = this.ship.z + fZ*90000 + (Math.random()-0.5)*50000;
                    c.x = this.ship.x + fX*90000 + (Math.random()-0.5)*50000;
                }
            }
            this.floaters = this.floaters.filter(f => { f.life -= 1/60; f.y -= 80/60; return f.life > 0; });
            this.fx = this.fx.filter(f => { f.x+=f.vx/60; f.y+=f.vy/60; f.z+=f.vz/60; f.life-=1/60; return f.life>0; });
        },

        _kill: function(t, rew) {
            GameSfx.play('boom');
            this._fx(t.x,t.y,t.z,'#f33',40,300);
            this._fx(t.x,t.y,t.z,'#234',30,600);
            this.floaters.push({x:t.x,y:t.y,z:t.z,text:`+$${rew}`,life:2});
            this.session.kills++;
            this.session.cash += rew;
            if (this.session.kills >= this.session.goal && this.mode==='SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res;
            GameSfx.stop();
            setTimeout(() => {
                if (window.System?.gameOver) window.System.gameOver(this.session.kills*100, res==='VICTORY', this.session.cash);
                else if (window.System?.home) window.System.home();
            }, 2000);
        },

        _fx: function(x,y,z,c,n,s) {
            for(let i=0;i<n;i++) this.fx.push({x,y,z,vx:(Math.random()-0.5)*1200,vy:(Math.random()-0.5)*1200,vz:(Math.random()-0.5)*1200,life:1+Math.random(),c,size:s+Math.random()*50});
        },

        _startMission: function() {
            this.state = 'PLAYING';
            this.ship.x = (Math.random()-0.5)*10000;
            this.ship.z = (Math.random()-0.5)*10000;
            GameSfx.startEngine();
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(() => {
                    if (this.state === 'PLAYING' && this.net.playersRef) {
                        this.net.playersRef.child(this.net.uid).update({
                            x: this.ship.x, y: this.ship.y, z: this.ship.z,
                            pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp
                        });
                    }
                }, 100);
            }
        },

        _draw: function(ctx, w, h) {
            ctx.save();
            if (window.Gfx?.shake > 0.5) {
                ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            }
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            this._drawPilotFX(ctx, w, h); // INJEÇÃO: Efeito G-Force Visual
            this._drawHUD(ctx,w,h);
            this._drawCockpit(ctx,w,h);
            ctx.restore();
            ctx.fillStyle='rgba(0,0,0,0.1)';
            for(let i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
        },

        _drawWorld: function(ctx,w,h) {
            ctx.save();
            ctx.translate(w/2,h/2);
            ctx.rotate(-this.ship.roll);
            let hy = Math.sin(this.ship.pitch) * h * 1.5;
            let sG = ctx.createLinearGradient(0,-h*4,0,hy);
            sG.addColorStop(0,'#001a33'); sG.addColorStop(0.5,'#004080'); sG.addColorStop(1,'#66a3ff');
            ctx.fillStyle = sG;
            ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
            let gG = ctx.createLinearGradient(0,hy,0,h*4);
            gG.addColorStop(0,'#0a1a0a'); gG.addColorStop(1,'#020502');
            ctx.fillStyle = gG;
            ctx.fillRect(-w*3,hy,w*6,h*4);
            ctx.strokeStyle='rgba(0,255,100,0.15)'; ctx.lineWidth=2; ctx.beginPath();
            let st=8000, sx=Math.floor(this.ship.x/st)*st-st*10, sz=Math.floor(this.ship.z/st)*st-st*10;
            for(let x=0;x<=20;x++) for(let z=0;z<=20;z++) {
                let p=Engine3D.project(sx+x*st,0,sz+z*st,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                if(p.visible&&p.s>0.01) { ctx.moveTo(p.x-20*p.s,p.y); ctx.lineTo(p.x+20*p.s,p.y); }
            }
            ctx.stroke();
            ctx.strokeStyle='rgba(0,255,200,0.8)'; ctx.lineWidth=3;
            ctx.beginPath(); ctx.moveTo(-w*3,hy); ctx.lineTo(w*3,hy); ctx.stroke();
            ctx.restore();
        },

        _drawEntities: function(ctx,w,h) {
            let buf=[];
            const add=(list,t)=>list.forEach(o=>{
                let p=Engine3D.project(o.x,o.y,o.z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                if(p.visible)buf.push({p,t,o});
            });
            add(this.clouds,'c'); add(this.entities,'e'); add(this.bullets,'b'); add(this.missiles,'m'); add(this.fx,'f'); add(this.floaters,'x');
            if(this.mode!=='SINGLE') Object.keys(this.net.players).forEach(uid=>{
                if(uid!==this.net.uid&&this.net.players[uid]?.hp>0){
                    let p=Engine3D.project(this.net.players[uid].x,this.net.players[uid].y,this.net.players[uid].z,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                    if(p.visible)buf.push({p,t:'p',o:this.net.players[uid],id:uid});
                }
            });
            buf.sort((a,b)=>b.p.z-a.p.z);
            buf.forEach(d=>{
                let p=d.p,s=p.s,o=d.o;
                if(d.t==='c'){ctx.fillStyle='rgba(255,255,255,0.05)';ctx.beginPath();ctx.arc(p.x,p.y,o.size*s,0,Math.PI*2);ctx.fill();}
                else if(d.t==='x'){ctx.fillStyle='#2ecc71';ctx.font=`bold ${Math.max(16,1500*s)}px 'Russo One'`;ctx.textAlign='center';ctx.fillText(o.text,p.x,p.y);}
                else if(d.t==='e'||d.t==='p'){
                    let isNet=d.t==='p',isTank=o.type==='tank';
                    if(isNet||o.type?.startsWith('jet')) Engine3D.drawJetModel(ctx,p.x,p.y,Math.max(0.1,s*2),o.yaw-this.ship.yaw-this.ship.roll, !isNet);
                    else if(isTank) {
                        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(-this.ship.roll);
                        let ts = s*700; ctx.fillStyle='#452'; ctx.fillRect(-ts,-ts*0.8,ts*2,ts*1.6);
                        ctx.fillStyle='#111'; ctx.fillRect(-ts*1.2,-ts*0.8,ts*0.2,ts*1.6); ctx.fillRect(ts*1.0,-ts*0.8,ts*0.2,ts*1.6);
                        ctx.restore();
                    }
                    if(isNet){ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33';ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.fillText(o.name||'ALLY',p.x,p.y-300*s-10);}
                    let locked=this.combat.target&&(isNet?this.combat.target.uid===d.id:this.combat.target===o),bs=Math.max(30,200*s);
                    if(locked){ctx.strokeStyle='#f03';ctx.lineWidth=4;ctx.strokeRect(p.x-bs,p.y-bs,bs*2,bs*2);ctx.fillStyle='#f03';ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText('LOCK',p.x,p.y+bs+25);}
                    else if(!isNet){ctx.strokeStyle=isTank?'rgba(255,100,0,0.8)':'rgba(255,0,0,0.6)';ctx.lineWidth=2;ctx.strokeRect(p.x-bs,p.y-bs,bs*2,bs*2);}
                }
                else if(d.t==='b'){ctx.globalCompositeOperation='lighter';ctx.fillStyle=o.isEnemy?'#f00':'#ff0';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,6*s),0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';}
                else if(d.t==='m'){ctx.fillStyle='#fff';ctx.fillRect(p.x-10*s,p.y-10*s,20*s,20*s);}
                else if(d.t==='f'){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.max(0,o.life);ctx.fillStyle=o.c;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,o.size*s),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
            });
        },

        _drawPilotFX: function(ctx, w, h) {
            if (this.ship.gForce > 5.0) {
                let intensity = Math.min(1.0, (this.ship.gForce - 5.0) / 4.0); 
                ctx.fillStyle = `rgba(0, 0, 0, ${intensity * 0.8})`; ctx.fillRect(0,0,w,h);
            } else if (this.ship.gForce < -1.5) {
                let intensity = Math.min(1.0, (Math.abs(this.ship.gForce) - 1.5) / 2.0);
                ctx.fillStyle = `rgba(231, 76, 60, ${intensity * 0.6})`; ctx.fillRect(0,0,w,h);
            }
        },
        
        _drawHUD: function(ctx,w,h){
            ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,w,50);
            ctx.fillStyle='#0f6';ctx.font='bold 20px Arial';ctx.textAlign='left';ctx.fillText(`SPD:${Math.floor(this.ship.speed * 3.6)}KM/H`,20,30);
            ctx.textAlign='right';ctx.fillText(`ALT:${Math.floor(this.ship.y)}M`,w-20,30);
            let hdg=(this.ship.yaw*180/Math.PI)%360;if(hdg<0)hdg+=360;
            ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(Math.floor(hdg)+'°',w/2,35);
            
            ctx.textAlign='left'; ctx.font='bold 14px Arial'; ctx.fillStyle='#0f6';
            ctx.fillText(`G-FORCE: ${this.ship.gForce.toFixed(1)}G`, 20, 80);
            ctx.fillText(`MACH: ${this.ship.mach.toFixed(2)}`, 20, 100);
            ctx.fillText(`AoA: ${(this.ship.alpha * 180/Math.PI).toFixed(1)}°`, 20, 120);

            if (this.ship.isStalling) {
                ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
                ctx.textAlign = "center"; ctx.font = "bold 28px 'Russo One'"; ctx.fillText("STALL - PITCH DOWN", w/2, h/2 - 100); 
            }

            const rx=w-80,ry=130,rr=60;
            ctx.fillStyle='rgba(0,30,10,0.7)';ctx.beginPath();ctx.arc(rx,ry,rr,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle='#0f6';ctx.lineWidth=2;ctx.stroke();
            ctx.beginPath();ctx.moveTo(rx,ry-rr);ctx.lineTo(rx,ry+rr);ctx.moveTo(rx-rr,ry);ctx.lineTo(rx+rr,ry);ctx.stroke();
            ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(rx,ry-6);ctx.lineTo(rx-5,ry+4);ctx.lineTo(rx+5,ry+4);ctx.fill();
            
            const plot=(tx,tz,col,sq)=>{
                let dx=tx-this.ship.x,dz=tz-this.ship.z,cr=Math.cos(this.ship.yaw),sr=Math.sin(this.ship.yaw),lx=dx*cr-dz*sr,lz=dx*sr+dz*cr,d=Math.hypot(lx,lz);
                if(d<60000){let px=rx+lx/60000*rr,py=ry-lz/60000*rr;ctx.fillStyle=col;if(sq)ctx.fillRect(px-3,py-3,6,6);else{ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();}}
            };
            this.entities.forEach(e=>plot(e.x,e.z,e.type==='tank'?'#e83':'#f03',e.type==='tank'));
            if(this.mode!=='SINGLE')Object.keys(this.net.players).forEach(uid=>{if(uid!==this.net.uid&&this.net.players[uid]?.hp>0)plot(this.net.players[uid].x,this.net.players[uid].z,this.mode==='COOP'?'#0ff':'#f33',false);});
        },

        _drawCockpit: function(ctx,w,h){
            let cx=w/2,cy=h/2;
            ctx.save();
            ctx.beginPath();ctx.rect(cx-180,cy-180,360,360);ctx.clip();
            ctx.shadowBlur=10;ctx.shadowColor='#0ff';ctx.strokeStyle='rgba(0,255,100,0.8)';ctx.lineWidth=3;
            ctx.beginPath();ctx.moveTo(cx-30,cy);ctx.lineTo(cx-10,cy);ctx.moveTo(cx+30,cy);ctx.lineTo(cx+10,cy);
            ctx.moveTo(cx,cy-30);ctx.lineTo(cx,cy-10);ctx.moveTo(cx,cy+30);ctx.lineTo(cx,cy+10);ctx.stroke();
            ctx.fillStyle='#0ff';ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();
            ctx.translate(cx,cy);ctx.rotate(-this.ship.roll);
            ctx.strokeStyle='rgba(0,255,100,0.7)';ctx.fillStyle='rgba(0,255,100,0.7)';ctx.lineWidth=2;ctx.font='bold 14px Arial';
            let pDeg=this.ship.pitch*180/Math.PI,ppd=15;
            for(let i=-90;i<=90;i+=10){if(i===0)continue;let yo=(pDeg-i)*ppd;ctx.beginPath();ctx.moveTo(-150,yo);ctx.lineTo(-80,yo);ctx.lineTo(-80,i<0?yo-10:yo+10);ctx.moveTo(150,yo);ctx.lineTo(80,yo);ctx.lineTo(80,i<0?yo-10:yo+10);ctx.stroke();ctx.textAlign='right';ctx.fillText(Math.abs(i),-160,yo+5);ctx.textAlign='left';ctx.fillText(Math.abs(i),160,yo+5);}
            ctx.restore();
            
            if(this.pilot.active){
                ctx.save();
                let yokeYOffset = 0;
                if (this.pilot.targetPitch < -0.2) yokeYOffset = 30; 
                else if (this.pilot.targetPitch > 0.2) yokeYOffset = -30; 
                
                ctx.translate(cx, h + yokeYOffset);
                ctx.fillStyle='#050505';ctx.fillRect(-25,-180,50,180);
                ctx.translate(0,-180);ctx.rotate(this.pilot.targetRoll);
                ctx.fillStyle='rgba(20,20,20,0.95)';ctx.strokeStyle='#333';ctx.lineWidth=15;ctx.lineCap='round';
                ctx.beginPath();ctx.moveTo(-110,-30);ctx.lineTo(-130,40);ctx.lineTo(-60,60);ctx.lineTo(60,60);ctx.lineTo(130,40);ctx.lineTo(110,-30);ctx.closePath();ctx.fill();ctx.stroke();
                ctx.fillStyle=this.combat.missileCd<=0?'#f00':'#500';ctx.beginPath();ctx.arc(-100,-25,10,0,Math.PI*2);ctx.fill();
                ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(100,-25,10,0,Math.PI*2);ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle='#f00';ctx.textAlign='center';ctx.font='bold 18px Arial';ctx.fillText('PLACE HANDS ON SCREEN',cx,h-50);
            }
            ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(10,h-50,220,40);
            ctx.fillStyle='#222';ctx.fillRect(20,h-30,200,10);
            ctx.fillStyle=this.ship.hp>30?'#2ecc71':'#e74c3c';ctx.fillRect(20,h-30,200*(this.ship.hp/100),10);
            ctx.fillStyle='#fff';ctx.font='bold 12px Arial';ctx.textAlign='left';ctx.fillText(`HP:${Math.floor(this.ship.hp)}%`,20,h-35);
            ctx.fillStyle='#f1c40f';ctx.font='bold 18px "Russo One"';ctx.textAlign='right';ctx.fillText(`$${this.session.cash}`,w-10,h-20);
        },
        
        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,10,0.95)';ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font='bold 40px "Russo One"';ctx.fillText('US ARMY FLIGHT SIM',w/2,h*0.15);
            const ps=Object.values(this.net.players);
            ctx.font='bold 24px Arial';ctx.fillStyle='#fff';ctx.fillText(`PILOTS: ${ps.length}`,w/2,h*0.25);
            let py=h*0.35;
            ps.forEach(p=>{ctx.fillStyle=p.ready?'#2ecc71':'#e74c3c';ctx.fillText(`[${p.ready?'READY':'WAITING'}] ${p.name}`,w/2,py);py+=40;});
            if(this.net.isHost){
                const r=ps.length>=1;
                ctx.fillStyle=r?'#c00':'#333';ctx.fillRect(w/2-160,h*0.85,320,60);
                ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(r?'LAUNCH MISSION':'WAITING...',w/2,h*0.85+38);
            }else{
                ctx.fillStyle=this.net.isReady?'#e83':'#27a';ctx.fillRect(w/2-160,h*0.85,320,60);
                ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(this.net.isReady?'STANDBY':'MARK READY',w/2,h*0.85+38);
            }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(0,10,5,0.95)';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='rgba(0,255,100,0.2)';ctx.lineWidth=2;ctx.strokeRect(50,50,w-100,h-100);
            ctx.fillStyle='#0f6';ctx.textAlign='center';ctx.font='bold 30px "Russo One"';ctx.fillText('PILOT CALIBRATION',w/2,h*0.3);
            ctx.fillStyle='#fff';ctx.font='bold 20px Arial';ctx.fillText('HOLD NEUTRAL POSITION',w/2,h*0.4);
            ctx.fillStyle='#f1c40f';ctx.font='bold 16px Arial';ctx.fillText('RAISE ARMS = CLIMB | LOWER ARMS = DIVE | CLAP = FIRE',w/2,h*0.5);
            let pct=1-this.timer/3;
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
            ctx.fillText(`REWARDS: $${this.session.cash}`,w/2,h/2+60);
        }
    };

    // Registro Automático Padrão Original
    const register = () => {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike: TACTICAL', '✈️', Game, {
                camera: 'user',
                phases: [
                    { id: 'training', name: 'BASIC TRAINING', desc: 'Calibrate controls. Engage aerial targets.', mode: 'SINGLE', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) {
        const check = setInterval(() => { if (register()) clearInterval(check); }, 100);
    }
})();
