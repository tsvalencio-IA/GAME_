// =============================================================================
// AERO STRIKE: BLACK OPS (TRUE AAA PHYSICS + V10 ARCHITECTURE)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT
// STATUS: TELA BRANCA RESOLVIDA! VOLANTE DE 2 MÃOS RESTAURADO, FÍSICA AAA.
// =============================================================================

(function() {
    "use strict";

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES FÍSICAS REAIS (AJUSTADAS PARA JOGABILIDADE)
    // -----------------------------------------------------------------
    const GAME_CONFIG = {
        MONEY_PER_KILL: 150,
        MONEY_MISSION_BONUS: 800,
        MONEY_BOSS_BONUS: 2000,
        GRAVITY: 9.80665,     
        R_GAS: 287.05,        
        GAMMA: 1.4,           
        MAX_ALTITUDE: 40000   
    };

    const PLANE_STATS = {
        thrust: 200000, mass: 12000, wingArea: 28.0,
        cd0: 0.022, kInduced: 0.05, 
        clMax: 2.2, stallAngle: 0.45, 
        maxPitchRate: 2.0, maxRollRate: 3.5
    };

    // -----------------------------------------------------------------
    // 2. MOTOR DE RENDERIZAÇÃO 3D VETORIAL (OVERHAUL GRÁFICO)
    // -----------------------------------------------------------------
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
            color = color || "#00ffcc";
            ctx.save(); 
            ctx.translate(px, py); 
            ctx.rotate(roll); 
            ctx.scale(scale, scale);
            
            // SOMBREADO METÁLICO (Efeito PS2)
            let jetGrad = ctx.createLinearGradient(0, -30, 0, 30);
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

    // -----------------------------------------------------------------
    // 3. ESTRUTURA PRINCIPAL V10.JS (NÃO ALTERAR ASSINATURAS)
    // -----------------------------------------------------------------
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30 },
        // Ship agora tem física 6DOF acoplada
        ship: { hp: 100, speed: 250, x: 0, y: 3000, z: 0, vx: 0, vy: 0, vz: 250, pitch: 0, yaw: 0, roll: 0, gForce: 1, mach: 0, alpha: 0, isStalling: false },
        pilot: { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false, throttle: 0.9 }, // Aceleração automática constante
        timer: 3.0, keys: {}, keysBound: false,
        entities: [], bullets: [], missiles: [], clouds: [], fx: [], floaters: [],
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        net: { isHost: false, uid: null, players: {}, sessionRef: null, playersRef: null, loop: null },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30 };
            this.ship = { hp: 100, speed: 250, x: 0, y: 3000, z: 0, vx: 0, vy: 0, vz: 250, pitch: 0, yaw: 0, roll: 0, gForce: 1, mach: 0, alpha: 0, isStalling: false };
            this.pilot = { active: false, baseY: 0, targetRoll: 0, targetPitch: 0, headTilt: false, throttle: 0.9 };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.fx = []; this.floaters = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            
            for (let i = 0; i < 50; i++) {
                this.clouds.push({ x: (Math.random()-0.5)*100000, y: 5000+Math.random()*15000, z: (Math.random()-0.5)*100000, size: 3000+Math.random()*5000 });
            }
            
            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random()*9999);
            this.mode = faseData?.mode || 'SINGLE';
            
            if (!this.keysBound) {
                window.addEventListener('keydown', (e) => this.keys[e.key] = true);
                window.addEventListener('keyup', (e) => this.keys[e.key] = false);
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

        // =====================================================================
        // O CORAÇÃO DO JOGO - ASSINATURA V10.JS (NÃO ALTERAR)
        // =====================================================================
        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            
            if (dt > 0.05) dt = 0.05; 
            if (dt < 0.001) return this.session.cash || 0;

            if (this.state === 'LOBBY') { 
                if (this.keys[' '] || this.keys['ArrowUp']) {
                    if (this.net.isHost && Object.keys(this.net.players).length >= 1) { this.net.sessionRef?.child('state').set('PLAYING'); }
                    else if (!this.net.isHost) { this.net.playersRef?.child(this.net.uid).update({ready: true}); }
                }
                this._drawLobby(ctx, w, h); 
                return 0; 
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

            // -----------------------------------------------------------------
            // INJEÇÃO DA FÍSICA AAA DENTRO DO UPDATE V10
            // -----------------------------------------------------------------
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

            let vDirX = this.ship.vx/V, vDirY = this.ship.vy/V, vDirZ = this.ship.vz/V;
            let cosAlpha = fwdX*vDirX + fwdY*vDirY + fwdZ*vDirZ;
            this.ship.alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha))) || 0;

            let CL = this.ship.alpha * (PLANE_STATS.clMax / PLANE_STATS.stallAngle); 
            this.ship.isStalling = this.ship.alpha > PLANE_STATS.stallAngle || V < 80;
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

            this.ship.vx += (Fx / PLANE_STATS.mass) * dt;
            this.ship.vy += (Fy / PLANE_STATS.mass) * dt;
            this.ship.vz += (Fz / PLANE_STATS.mass) * dt;

            this.ship.x += this.ship.vx * dt;
            this.ship.y += this.ship.vy * dt;
            this.ship.z += this.ship.vz * dt;

            let specForce = Math.hypot(liftFx+dragFx+thrustFx, liftFy+dragFy+thrustFy, liftFz+dragFz+thrustFz);
            this.ship.gForce = specForce / weight;

            if (this.ship.y < 50) { 
                this.ship.y = 50; 
                this.ship.vy = Math.max(0, this.ship.vy); 
                if (this.ship.pitch < 0) this.ship.pitch = 0; 
            }

            let turnRate = (liftMag * Math.sin(this.ship.roll)) / (PLANE_STATS.mass * V);
            if (!this.ship.isStalling && V > 30 && !isNaN(turnRate)) {
                this.ship.yaw += turnRate * dt;
            }

            this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * PLANE_STATS.maxRollRate * dt;
            this.ship.pitch += (this.pilot.targetPitch - this.ship.pitch) * PLANE_STATS.maxPitchRate * dt;
            
            if (this.ship.isStalling) {
                this.ship.pitch += (-0.5 - this.ship.pitch) * 2 * dt;
                this.ship.roll += (Math.random() - 0.5) * 4 * dt;
            }
            this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));
            // -----------------------------------------------------------------

            this._processCombat(dt, w, h);
            this._spawnEnemies();
            this._updateEntities(dt, now);
            this._updateBullets(dt);
            this._updateMissiles(dt); 
            this._cleanupFx();

            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');

            // Renderiza tudo (O que impedia a tela branca da v10)
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

        // =====================================================================
        // O VERDADEIRO VOLANTE (YOKE) DE DUAS MÃOS - IDÊNTICO À V10.JS
        // =====================================================================
        _readPose: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false;
            this.pilot.headTilt = false; 
            
            if (this.keys['ArrowUp']) trgPitch = 1.0; else if (this.keys['ArrowDown']) trgPitch = -1.0;
            if (this.keys['ArrowRight']) trgRoll = 1.0; else if (this.keys['ArrowLeft']) trgRoll = -1.0;
            if (this.keys[' ']) this.pilot.headTilt = true;
            if (this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight']) inputDetected = true;

            let pts = null;
            if (pose && Array.isArray(pose)) pts = pose;
            else if (pose && pose.keypoints) pts = pose.keypoints;
            else if (pose && Array.isArray(pose) && pose[0] && pose[0].keypoints) pts = pose[0].keypoints;

            if (pts && pts.length > 0) {
                let rightWrist = null, leftWrist = null;
                for (let i = 0; i < pts.length; i++) {
                    let k = pts[i];
                    if (!k) continue;
                    if ((k.name === 'right_wrist' || k.part === 'right_wrist' || i === 10) && k.score > 0.3) rightWrist = k;
                    if ((k.name === 'left_wrist' || k.part === 'left_wrist' || i === 9) && k.score > 0.3) leftWrist = k;
                }
                
                if (rightWrist && leftWrist) {
                    inputDetected = true;
                    // Conversão de Coordenadas
                    let rx = (1 - (rightWrist.x / 640)) * w; 
                    let ry = (rightWrist.y / 480) * h;
                    let lx = (1 - (leftWrist.x / 640)) * w; 
                    let ly = (leftWrist.y / 480) * h;
                    
                    // VOLANTE: Inclinação entre as mãos
                    trgRoll = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, Math.atan2(ry - ly, rx - lx)));
                    
                    // PITCH: Altura média das duas mãos em relação à calibração
                    let avgY = (ry + ly) / 2;
                    
                    if (this.state === 'CALIBRATION') {
                        this.pilot.baseY = this.pilot.baseY * 0.95 + avgY * 0.05;
                        if (!this.pilot.baseY) this.pilot.baseY = avgY;
                    } else {
                        let deltaY = avgY - this.pilot.baseY;
                        let threshold = h * 0.10; 
                        if (deltaY < -threshold) trgPitch = 1.0 * Math.min(1, Math.abs(deltaY)/200);      
                        else if (deltaY > threshold) trgPitch = -1.0 * Math.min(1, Math.abs(deltaY)/200); 
                    }

                    // Juntar as mãos atira o míssil! (Clap)
                    if (Math.hypot(rx - lx, ry - ly) < 120 && this.state === 'PLAYING') {
                        this.pilot.headTilt = true; 
                    }
                }
            }

            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 8 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 5 * dt;
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll *= 0.9;
                this.pilot.targetPitch *= 0.9;
            }
        },

        _processCombat: function(dt, w, h) {
            this.combat.target = null; this.combat.locked = false; let closestZ = Infinity;
            
            const scan = (obj, isPlayer, uid) => {
                let p = Engine3D.project(obj.x, obj.y, obj.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (p.visible && p.z > 200 && p.z < 60000 && Math.abs(p.x - w/2) < w*0.35 && Math.abs(p.y - h/2) < h*0.35 && p.z < closestZ) {
                    closestZ = p.z;
                    this.combat.target = isPlayer ? {x:obj.x, y:obj.y, z:obj.z, vx:obj.vx||0, vy:obj.vy||0, vz:obj.vz||0, hp:obj.hp, isPlayer:true, uid:uid} : obj;
                }
            };

            this.entities.forEach(e => scan(e, false));

            if (this.mode === 'PVP' && this.net.players) {
                Object.keys(this.net.players).forEach(id => {
                    if (id !== this.net.uid && this.net.players[id]?.hp > 0) scan(this.net.players[id], true, id);
                });
            }

            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.5) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true;
                    this.combat.lockTimer = 0.5;
                }
            } else {
                this.combat.lockTimer -= dt * 2;
                if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }

            // Metralhadora
            if (this.combat.locked && this.combat.target && performance.now() - this.combat.vulcanCd > 80) {
                this.combat.vulcanCd = performance.now();
                let spd = this.ship.speed + 800;
                let dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                this.bullets.push({
                    x: this.ship.x + Math.cos(this.ship.yaw)*60, y: this.ship.y-20, z: this.ship.z - Math.sin(this.ship.yaw)*60,
                    vx: this.ship.vx + (dx/dist)*spd, vy: this.ship.vy + (dy/dist)*spd, vz: this.ship.vz + (dz/dist)*spd,
                    isEnemy: false, life: 2
                });
                GameSfx.play('vulcan');
                window.Gfx?.shakeScreen?.(4);
            }

            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;

            // Disparo de Míssil com Mãos Juntas
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 1.2;
                this.missiles.push({
                    x: this.ship.x, y: this.ship.y-50, z: this.ship.z,
                    vx: this.ship.vx, vy: this.ship.vy, vz: this.ship.vz,
                    target: this.combat.target, life: 6, maxG: 40
                });
                GameSfx.play('missile');
                window.Gfx?.shakeScreen?.(12);
            }
        },

        _spawnEnemies: function() {
            if (this.entities.length >= 6 || Math.random() > 0.02) return;
            let dist = 8000 + Math.random()*10000;
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let sx = this.ship.x + fX*dist + (Math.random()-0.5)*15000;
            let sz = this.ship.z + fZ*dist + (Math.random()-0.5)*15000;
            
            // Inimigos com vetores de física
            this.entities.push({ 
                type: 'jet', x: sx, y: Math.max(1000, this.ship.y+(Math.random()-0.5)*4000), z: sz, 
                vx: -fX*250, vy: 0, vz: -fZ*250, hp: 150, yaw: this.ship.yaw + Math.PI, roll: 0, pitch: 0 
            });
        },

        _updateEntities: function(dt, now) {
            for (let e of this.entities) {
                let dx = this.ship.x - e.x, dy = this.ship.y - e.y, dz = this.ship.z - e.z;
                let targetYaw = Math.atan2(dx, dz);
                let targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
                
                e.roll += (0 - e.roll) * 2 * dt;
                
                let yawDiff = targetYaw - e.yaw;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                
                e.yaw += yawDiff * 0.8 * dt;
                e.pitch += (targetPitch - e.pitch) * 0.8 * dt;
                e.roll = yawDiff * 2.0;

                let speed = 280;
                e.vx = Math.sin(e.yaw) * Math.cos(e.pitch) * speed;
                e.vy = Math.sin(e.pitch) * speed;
                e.vz = Math.cos(e.yaw) * Math.cos(e.pitch) * speed;

                e.x += e.vx*dt; e.y += e.vy*dt; e.z += e.vz*dt;
                if (e.y < 100) e.y = 100;
                
                if (Math.hypot(dx, dy, dz) > 120000) { e.hp = -1; continue; }
                
                // IA Disparando de Volta
                if (Math.hypot(dx, dy, dz) < 8000 && Math.abs(yawDiff) < 0.2 && Math.random()<0.03) {
                    let bSpd = 600;
                    let d = Math.hypot(dx, dy, dz);
                    this.bullets.push({
                        x: e.x, y: e.y, z: e.z,
                        vx: e.vx + (dx/d)*bSpd, vy: e.vy + (dy/d)*bSpd, vz: e.vz + (dz/d)*bSpd,
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
                    if (Math.hypot(b.x-this.ship.x, b.y-this.ship.y, b.z-this.ship.z) < 80) {
                        this.ship.hp -= 8;
                        window.Gfx?.shakeScreen?.(15);
                        if (this.ship.hp <= 0) this._endGame('GAMEOVER');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x-e.x, b.y-e.y, b.z-e.z) < 150) {
                            e.hp -= 40; b.life = 0;
                            this._fx(e.x,e.y,e.z,'#f90',4,40);
                            if (e.hp <= 0) this._kill(e, 150);
                            break;
                        }
                    }
                    if (this.mode==='PVP' && b.life>0 && this.net.players) {
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

        // INJEÇÃO: PROPORTIONAL NAVIGATION GUIDANCE
        _updateMissiles: function(dt) {
            for (let i = this.missiles.length-1; i >= 0; i--) {
                let m = this.missiles[i];
                let V = Math.hypot(m.vx, m.vy, m.vz) || 1;

                if (m.target && (m.target.hp>0 || m.target.isPlayer)) {
                    let rx = m.target.x - m.x, ry = m.target.y - m.y, rz = m.target.z - m.z;
                    let dist2 = rx*rx + ry*ry + rz*rz;
                    let dist = Math.sqrt(dist2);
                    
                    if (dist < 80) { 
                        if (m.target.isPlayer && this.mode==='PVP') {
                            window.DB?.ref(`usarmy_sessions/aero_${this.mode}/pilots/${m.target.uid}/hp`).set(m.target.hp-50);
                            this._fx(m.target.x,m.target.y,m.target.z,'#f33',40,300);
                            this.session.cash += 500;
                        } else if (!m.target.isPlayer) {
                            m.target.hp -= 400;
                            if (m.target.hp <= 0) this._kill(m.target, 300);
                        }
                        m.life = 0;
                    } else {
                        // Física de Interceção Proporcional (PN)
                        let tx = m.target.vx || 0, ty = m.target.vy || 0, tz = m.target.vz || 0;
                        let vrx = tx - m.vx, vry = ty - m.vy, vrz = tz - m.vz;
                        
                        let cx = ry * vrz - rz * vry, cy = rz * vrx - rx * vrz, cz = rx * vry - ry * vrx;
                        let omx = cx/dist2, omy = cy/dist2, omz = cz/dist2;
                        
                        let Vc = -(rx*vrx + ry*vry + rz*vrz) / dist;
                        let ux = rx/dist, uy = ry/dist, uz = rz/dist;
                        
                        let oxux = omy*uz - omz*uy, oxuy = omz*ux - omx*uz, oxuz = omx*uy - omy*ux;
                        
                        let N = 5.0;
                        let ax = N * Vc * oxux, ay = N * Vc * oxuy, az = N * Vc * oxuz;
                        
                        let accMag = Math.hypot(ax, ay, az);
                        let maxAcc = m.maxG * GAME_CONFIG.GRAVITY;
                        if (accMag > maxAcc) { ax = (ax/accMag)*maxAcc; ay = (ay/accMag)*maxAcc; az = (az/accMag)*maxAcc; }
                        
                        if (!isNaN(ax)) { m.vx += ax*dt; m.vy += ay*dt; m.vz += az*dt; }
                    }
                }
                
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
            for(let i=0;i<n;i++) this.fx.push({x,y,z,vx:(Math.random()-0.5)*12000,vy:(Math.random()-0.5)*12000,vz:(Math.random()-0.5)*12000,life:1+Math.random(),c,size:s+Math.random()*200});
        },

        _startMission: function() {
            this.state = 'PLAYING';
            this.ship.x = (Math.random()-0.5)*10000;
            this.ship.z = (Math.random()-0.5)*10000;
            GameSfx.startEngine();
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(() => {
                    if (this.state === 'PLAYING' && this.net.playersRef && this.net.uid) {
                        this.net.playersRef.child(this.net.uid).update({
                            x: this.ship.x, y: this.ship.y, z: this.ship.z,
                            vx: this.ship.vx, vy: this.ship.vy, vz: this.ship.vz,
                            pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp
                        });
                    }
                }, 100);
            }
        },

        // =====================================================================
        // O VISUAL BLACK PS2 INJETADO NA ARQUITETURA ANTIGA
        // =====================================================================
        _draw: function(ctx, w, h) {
            ctx.save();
            // Efeito Físico de G-Force Visual Tremor
            if (this.ship.gForce > 3.0) {
                let shake = (this.ship.gForce - 3.0) * 2;
                ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);
            } else if (window.Gfx?.shake > 0.5) {
                ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            }
            
            this._drawWorld(ctx,w,h);
            this._drawEntities(ctx,w,h);
            this._drawPilotFX(ctx, w, h); 
            this._drawHUD(ctx,w,h);
            this._drawCockpit(ctx,w,h);   // O VOLANTE YOKE DE DUAS MÃOS
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
            sG.addColorStop(0,'#0a1a2a'); sG.addColorStop(0.6,'#2a4a6a'); sG.addColorStop(1,'#88aacc');
            ctx.fillStyle = sG;
            ctx.fillRect(-w*3,-h*4,w*6,hy+h*4);
            
            // Sol
            ctx.fillStyle = "rgba(255, 255, 200, 0.4)";
            ctx.beginPath(); ctx.arc(0, hy - 100, 60, 0, Math.PI*2); ctx.fill();

            let gG = ctx.createLinearGradient(0,hy,0,h*4);
            gG.addColorStop(0,'#111115'); gG.addColorStop(0.3,'#051505'); gG.addColorStop(1,'#000000');
            ctx.fillStyle = gG;
            ctx.fillRect(-w*3,hy,w*6,h*4);
            
            ctx.strokeStyle='rgba(0,255,100,0.15)'; ctx.lineWidth=2; ctx.beginPath();
            let st=10000, sx=Math.floor(this.ship.x/st)*st-st*10, sz=Math.floor(this.ship.z/st)*st-st*10;
            for(let x=0;x<=20;x++) for(let z=0;z<=20;z++) {
                let p=Engine3D.project(sx+x*st,0,sz+z*st,this.ship.x,this.ship.y,this.ship.z,this.ship.pitch,this.ship.yaw,this.ship.roll,w,h);
                if(p.visible&&p.s>0.01) { ctx.moveTo(p.x-30*p.s,p.y); ctx.lineTo(p.x+30*p.s,p.y); }
            }
            ctx.stroke();
            ctx.strokeStyle='rgba(0,255,200,0.6)'; ctx.lineWidth=2;
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
            
            // Interpolação Multiplayer
            if(this.mode!=='SINGLE' && this.net.players) Object.keys(this.net.players).forEach(uid=>{
                if(uid!==this.net.uid&&this.net.players[uid]?.hp>0){
                    let rp = this.net.players[uid];
                    let px = rp.x + (rp.vx||0)*0.05, py = rp.y + (rp.vy||0)*0.05, pz = rp.z + (rp.vz||0)*0.05; 
                    let p=Engine3D.project(px, py, pz, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if(p.visible)buf.push({p,t:'p',o:rp,id:uid});
                }
            });
            buf.sort((a,b)=>b.p.z-a.p.z);
            buf.forEach(d=>{
                let p=d.p,s=p.s,o=d.o;
                if(d.t==='c'){ctx.fillStyle='rgba(255,255,255,0.05)';ctx.beginPath();ctx.arc(p.x,p.y,o.size*s,0,Math.PI*2);ctx.fill();}
                else if(d.t==='x'){ctx.fillStyle='#2ecc71';ctx.font=`bold ${Math.max(16,1500*s)}px 'Russo One'`;ctx.textAlign='center';ctx.fillText(o.text,p.x,p.y);}
                else if(d.t==='e'||d.t==='p'){
                    let isNet=d.t==='p';
                    Engine3D.drawJetModel(ctx, p.x, p.y, Math.max(0.1, s*2), o.roll||0, !isNet, isNet?(this.mode==='COOP'?'#0ff':'#f33'):'#00ffcc');
                    if(isNet){ctx.fillStyle=this.mode==='COOP'?'#0ff':'#f33';ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.fillText(o.name||'ALLY',p.x,p.y-300*s-10);}
                    
                    let locked=this.combat.target&&(isNet?this.combat.target.uid===d.id:this.combat.target===o);
                    let bs = Math.max(40, 250*s); 
                    if(locked){
                        ctx.strokeStyle='#ff0000';ctx.lineWidth=2;ctx.strokeRect(p.x-bs,p.y-bs,bs*2,bs*2);
                        // Box de Mira do PS2
                        ctx.beginPath(); ctx.moveTo(p.x, p.y - bs); ctx.lineTo(p.x, p.y - bs - 20); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(p.x, p.y + bs); ctx.lineTo(p.x, p.y + bs + 20); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(p.x - bs, p.y); ctx.lineTo(p.x - bs - 20, p.y); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(p.x + bs, p.y); ctx.lineTo(p.x + bs + 20, p.y); ctx.stroke();
                        ctx.fillStyle='#ff0000';ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.fillText('LOCKED',p.x,p.y+bs+35);
                    }
                }
                else if(d.t==='b'){ctx.globalCompositeOperation='lighter';ctx.fillStyle=o.isEnemy?'#f00':'#ff0';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,6*s),0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';}
                else if(d.t==='m'){ctx.fillStyle=o.isEnemy?'#ff3300':'#ffffff';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,6*s),0,Math.PI*2);ctx.fill();}
                else if(d.t==='f'){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.max(0,o.life);ctx.fillStyle=o.c;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,o.size*s),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
            });
        },

        _drawPilotFX: function(ctx, w, h) {
            if (this.ship.gForce > 5.0) {
                let intensity = Math.min(1.0, (this.ship.gForce - 5.0) / 4.0); 
                ctx.fillStyle = `rgba(0, 0, 0, ${intensity * 0.8})`; ctx.fillRect(0,0,w,h);
            } else if (this.ship.gForce < -1.5) {
                let intensityN = Math.min(1.0, (Math.abs(this.ship.gForce) - 1.5) / 2.0);
                ctx.fillStyle = `rgba(231, 76, 60, ${intensityN * 0.6})`; ctx.fillRect(0,0,w,h);
            }
        },
        
        _drawHUD: function(ctx,w,h){
            let p = this.ship;
            ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,w,50);
            ctx.fillStyle='#00ffcc';ctx.font='bold 20px Arial';ctx.textAlign='left';ctx.fillText(`SPD: ${Math.floor(p.speed * 3.6)} KM/H`,20,30);
            ctx.textAlign='right';ctx.fillText(`ALT: ${Math.floor(p.y)} M`,w-20,30);
            let hdg=(p.yaw*180/Math.PI)%360;if(hdg<0)hdg+=360;
            ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(Math.floor(hdg)+'°',w/2,35);
            
            // MIRA CENTRAL
            ctx.strokeStyle='#00ffcc'; ctx.lineWidth=2;
            ctx.beginPath(); ctx.arc(w/2, h/2, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(w/2, h/2, 20, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 - 40, h/2); ctx.lineTo(w/2 - 20, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2 + 40, h/2); ctx.lineTo(w/2 + 20, h/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/2, h/2 - 40); ctx.lineTo(w/2, h/2 - 20); ctx.stroke();

            // TELEMETRIA
            ctx.textAlign='left'; ctx.font='bold 14px Arial'; ctx.fillStyle='#00ffcc';
            ctx.fillText(`G-FORCE: ${p.gForce.toFixed(1)}G`, 20, 80);
            ctx.fillText(`MACH: ${p.mach.toFixed(2)}`, 20, 100);

            if (p.isStalling) {
                ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
                ctx.textAlign = "center"; ctx.font = "bold 32px 'Russo One'"; ctx.fillText("STALL - PUSH DOWN", w/2, h/2 - 100); 
            }

            const rx=w-80,ry=130,rr=60;
            ctx.fillStyle='rgba(0,30,10,0.7)';ctx.beginPath();ctx.arc(rx,ry,rr,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle='#00ffcc';ctx.lineWidth=2;ctx.stroke();
            ctx.beginPath();ctx.moveTo(rx,ry-rr);ctx.lineTo(rx,ry+rr);ctx.moveTo(rx-rr,ry);ctx.lineTo(rx+rr,ry);ctx.stroke();
            ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(rx,ry-6);ctx.lineTo(rx-5,ry+4);ctx.lineTo(rx+5,ry+4);ctx.fill();
            
            const plot=(tx,tz,col)=>{
                let dx=tx-p.x,dz=tz-p.z,cr=Math.cos(p.yaw),sr=Math.sin(p.yaw),lx=dx*cr-dz*sr,lz=dx*sr+dz*cr,d=Math.hypot(lx,lz);
                if(d<60000){let px=rx+lx/60000*rr,py=ry-lz/60000*rr;ctx.fillStyle=col;ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();}
            };
            this.entities.forEach(e=>plot(e.x,e.z,'#ff0000'));
            if(this.mode!=='SINGLE'&&this.net.players)Object.keys(this.net.players).forEach(uid=>{if(uid!==this.net.uid&&this.net.players[uid]?.hp>0)plot(this.net.players[uid].x,this.net.players[uid].z,this.mode==='COOP'?'#00ffff':'#ff0000');});
        },

        _drawCockpit: function(ctx,w,h){
            let cx=w/2,cy=h/2;
            
            if(this.pilot.active){
                ctx.save();
                
                let yokeYOffset = 0;
                if (this.pilot.targetPitch < -0.2) yokeYOffset = 40; 
                else if (this.pilot.targetPitch > 0.2) yokeYOffset = -40; 
                
                ctx.translate(cx, h + yokeYOffset + 20); 
                
                // Haste
                ctx.fillStyle='#050a10';ctx.fillRect(-30,-180,60,180);
                ctx.translate(0,-160);ctx.rotate(this.pilot.targetRoll);
                
                // Volante Yoke Cyber/Militar
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
                
                // Painéis e Botões
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-110, 0, 20, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(110, 0, 20, 0, Math.PI*2); ctx.fill();

                ctx.fillStyle = this.combat.missileCd <= 0 ? '#ff3300' : '#440000'; 
                ctx.beginPath(); ctx.arc(-110, 0, 10, 0, Math.PI*2); ctx.fill();

                ctx.fillStyle='#ffcc00'; ctx.beginPath(); ctx.arc(110, 0, 10, 0, Math.PI*2); ctx.fill();
                
                if (this.combat.target) {
                    if (this.combat.lockTimer >= 0.5) {
                        ctx.fillStyle = "#ff0000"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
                        ctx.fillText("CLAP TO FIRE!", 0, -50);
                    } else {
                        ctx.fillStyle = "#ffcc00"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center";
                        ctx.fillText("LOCKING...", 0, -50);
                    }
                }

                ctx.restore();
            } else {
                ctx.fillStyle='#ff0000';ctx.textAlign='center';ctx.font='bold 22px Arial';ctx.fillText('PLACE HANDS ON SCREEN',cx,h-100);
            }

            // HUD Inferior (Estado e Integridade)
            ctx.fillStyle='rgba(0,15,10,0.8)';ctx.fillRect(0,h-50,w,50);
            ctx.fillStyle='#222';ctx.fillRect(20,h-30,w/2 - 40,12);
            ctx.fillStyle=this.ship.hp>30?'#00ffcc':'#ff3300';
            ctx.fillRect(20,h-30,(w/2 - 40)*(Math.max(0,this.ship.hp)/100),12);
            ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.textAlign='left';ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`,20,h-35);
            ctx.fillStyle='#f1c40f';ctx.font='bold 22px "Russo One"';ctx.textAlign='right';ctx.fillText(`$${this.session.cash}`,w-20,h-20);
        },
        
        _drawLobby: function(ctx,w,h){
            ctx.fillStyle='rgba(10,20,10,0.95)';ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#00ffcc';ctx.textAlign='center';ctx.font='bold 40px "Russo One"';ctx.fillText('AERO STRIKE: MULTIPLAYER',w/2,h*0.15);
            const ps=Object.keys(this.net.players);
            ctx.font='bold 24px Arial';ctx.fillStyle='#fff';ctx.fillText(`PILOTS: ${ps.length}`,w/2,h*0.25);
            let py=h*0.35;
            ps.forEach(uid=>{
                let p = this.net.players[uid];
                ctx.fillStyle=p.ready?'#2ecc71':'#e74c3c';ctx.fillText(`[${p.ready?'READY':'WAITING'}] ${p.name}`,w/2,py);py+=40;
            });
            
            if(this.net.isHost){
                const r=ps.length>=1;
                ctx.fillStyle=r?'#c00':'#333';ctx.fillRect(w/2-200,h*0.85,400,60);
                ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(r?'TOQUE NA TELA PARA INICIAR':'WAITING...',w/2,h*0.85+38);
            }else{
                let isR = this.net.players[this.net.uid]?.ready;
                ctx.fillStyle=isR?'#e83':'#27a';ctx.fillRect(w/2-200,h*0.85,400,60);
                ctx.fillStyle='#fff';ctx.font='bold 22px "Russo One"';ctx.fillText(isR?'STANDBY':'TOQUE NA TELA: READY',w/2,h*0.85+38);
            }
        },

        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(0,10,15,0.95)';ctx.fillRect(0,0,w,h);
            ctx.strokeStyle='rgba(0,255,204,0.2)';ctx.lineWidth=2;ctx.strokeRect(50,50,w-100,h-100);
            ctx.fillStyle='#00ffcc';ctx.textAlign='center';ctx.font='bold 30px "Russo One"';ctx.fillText('PILOT CALIBRATION',w/2,h*0.3);
            ctx.fillStyle='#fff';ctx.font='bold 20px Arial';ctx.fillText('Coloque as DUAS MÃOS no ecrã.',w/2,h*0.4);
            ctx.fillStyle='#f1c40f';ctx.font='bold 16px Arial';ctx.fillText('RAISE ARMS = CLIMB | LOWER ARMS = DIVE | CLAP = FIRE',w/2,h*0.5);
            let pct=1-this.timer/3;
            ctx.fillStyle='#111';ctx.fillRect(w/2-200,h*0.6,400,10);
            ctx.fillStyle='#00ffcc';ctx.fillRect(w/2-200,h*0.6,400*pct,10);
            ctx.fillStyle=this.pilot.active?'#00ffcc':'#f33';
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

    // Registro Automático Padrão Original (V10)
    const register = () => {
        if (window.System?.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '✈️', Game, {
                camera: 'user', camOpacity: 0.2,
                phases: [
                    { id: 'training', name: 'CAMPANHA SOLO', desc: 'Calibrate controls. Engage aerial targets.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'SQUADRON CO-OP', desc: 'Team up with allies vs AI.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'AIR SUPERIORITY', desc: 'PvP dogfight for rewards.', mode: 'PVP', reqLvl: 1 }
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
