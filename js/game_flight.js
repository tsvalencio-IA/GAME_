// =============================================================================
// AERO STRIKE AR: TACTICAL SIMULATOR (ACE COMBAT GRAPHICS)
// BASEADO NO ARQUIVO: AERO STRIKE_ US
// FIX: HUD BOUNDARIES (NO CLIPPING BUGS), FIXED YOKE & SUNSET RENDERING
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. MOTOR MATEMÁTICO E PROJEÇÃO 3D (6DOF)
    // =========================================================================
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
            return {
                x: (w / 2) + (finalX * scale),
                y: (h / 2) - (finalY * scale), // Canvas Y invertido
                s: scale, z: z2, visible: true
            };
        }
    };

    // =========================================================================
    // 2. SUBSISTEMA DE ÁUDIO TÁTICO
    // =========================================================================
    const AudioFX = {
        ctx: null, engineOsc: null, filter: null, gainNode: null, ready: false,
        init: function() {
            if (this.ready) return;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.gainNode = this.ctx.createGain(); this.gainNode.connect(this.ctx.destination);
                this.gainNode.gain.value = 0.15; this.ready = true;
            } catch (e) { console.warn("Audio offline"); }
        },
        startEngine: function() {
            if (!this.ready || this.engineOsc) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            let bufSize = this.ctx.sampleRate * 2; let buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            let data = buf.getChannelData(0); for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            this.engineOsc = this.ctx.createBufferSource(); this.engineOsc.buffer = buf; this.engineOsc.loop = true;
            this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 400;
            this.engineOsc.connect(this.filter); this.filter.connect(this.gainNode); this.engineOsc.start();
        },
        play: function(type) {
            if (!this.ready) return;
            let t = this.ctx.currentTime; let osc = this.ctx.createOscillator(); let g = this.ctx.createGain();
            if (type === 'lock') {
                osc.type = 'square'; osc.frequency.setValueAtTime(1000, t);
                g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
                osc.start(t); osc.stop(t + 0.1);
            } else if (type === 'vulcan') {
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.08);
                g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
                osc.start(t); osc.stop(t + 0.08);
            } else if (type === 'missile') {
                osc.type = 'square'; osc.frequency.setValueAtTime(150, t); osc.frequency.linearRampToValueAtTime(900, t + 0.5);
                g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
                osc.start(t); osc.stop(t + 1.0);
            } else if (type === 'boom') {
                osc.type = 'square'; osc.frequency.setValueAtTime(60, t); osc.frequency.exponentialRampToValueAtTime(10, t + 0.8);
                g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
                osc.start(t); osc.stop(t + 0.8);
            }
            osc.connect(g); g.connect(this.ctx.destination);
        },
        stop: function() { if (this.engineOsc) { this.engineOsc.stop(); this.engineOsc.disconnect(); this.engineOsc = null; } }
    };

    // =========================================================================
    // 3. CORE DO SIMULADOR E NETCODE (MULTIPLAYER)
    // =========================================================================
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30, callsign: "PILOTO" },
        ship: { hp: 100, speed: 2000, x: 0, y: 2000, z: 0, pitch: 0, yaw: 0, roll: 0 },
        pilot: { active: false, baseDepth: 0, targetRoll: 0, targetPitch: 0, headTilt: false },
        timer: 3.0,
        entities: [], bullets: [], missiles: [], clouds: [], fx: [], floaters: [],
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },
        screenShake: 0, hitFlash: 0,
        net: { isHost: false, isReady: false, uid: null, name: "PILOT", players: {}, sessionRef: null, playersRef: null, loop: null },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30, callsign: "VIPER-" + Math.floor(Math.random()*99) };
            this.ship = { hp: 100, speed: 2000, x: 0, y: 2000, z: 0, pitch: 0, yaw: 0, roll: 0 };
            this.pilot = { active: false, baseDepth: 0, targetRoll: 0, targetPitch: 0, headTilt: false };
            this.entities = []; this.bullets = []; this.missiles = []; this.clouds = []; this.fx = []; this.floaters = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            for (let i = 0; i < 50; i++) this.clouds.push({ x: (Math.random()-0.5)*100000, y: 5000 + Math.random()*15000, z: (Math.random()-0.5)*100000, size: 3000 + Math.random()*5000 });
            this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random()*9999);
            this.net.name = window.System?.playerId ? "P_" + this.net.uid.substring(0,4).toUpperCase() : "GUEST";
            this.mode = faseData ? faseData.mode : 'SINGLE';
            if (this.mode !== 'SINGLE') this.initNetwork();
            else { this.state = 'CALIBRATION'; this.timer = 3.0; }
            AudioFX.init();
        },

        initNetwork: function() {
            if (!window.DB) { alert("SISTEMA DE REDE OFFLINE."); window.System.home(); return; }
            this.state = 'LOBBY'; this.net.players = {};
            this.net.sessionRef = window.DB.ref('game_sessions/flight_sim_' + this.mode);
            this.net.playersRef = this.net.sessionRef.child('pilots');
            this.net.playersRef.child(this.net.uid).onDisconnect().remove();
            this.net.sessionRef.child('host').once('value').then(snap => {
                if (!snap.val()) { 
                    this.net.isHost = true; 
                    this.net.sessionRef.child('host').set(this.net.uid); 
                    this.net.sessionRef.child('state').set('LOBBY'); 
                    this.net.playersRef.remove(); 
                }
                this.net.playersRef.child(this.net.uid).set({ name: this.net.name, ready: false, hp: 100, x: 0, y: 2000, z: 0, pitch: 0, yaw: 0, roll: 0, callsign: this.session.callsign });
            });
            this.net.playersRef.on('value', snap => { this.net.players = snap.val() || {}; });
            this.net.sessionRef.child('state').on('value', snap => { 
                if (snap.val() === 'PLAYING' && this.state === 'LOBBY') { this.state = 'CALIBRATION'; this.timer = 3.0; }
            });
            this._lobbyClick = this.handleLobbyClick.bind(this);
            window.System.canvas.addEventListener('pointerdown', this._lobbyClick);
        },

        handleLobbyClick: function(e) {
            if (this.state !== 'LOBBY') return;
            const rect = window.System.canvas.getBoundingClientRect(); 
            const scaleX = window.System.canvas.width / rect.width, scaleY = window.System.canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX, y = (e.clientY - rect.top) * scaleY;
            const w = window.System.canvas.width, h = window.System.canvas.height;
            if (x > w/2 - 160 && x < w/2 + 160 && y > h*0.85 && y < h*0.85 + 60) {
                if (this.net.isHost) { 
                    if (Object.keys(this.net.players).length >= 1) this.net.sessionRef.child('state').set('PLAYING'); 
                } else { 
                    this.net.isReady = !this.net.isReady; 
                    this.net.playersRef.child(this.net.uid).update({ ready: this.net.isReady }); 
                }
            }
        },

        launchSortie: function() {
            this.state = 'PLAYING';
            this.ship.x = (Math.random() - 0.5) * 10000; this.ship.z = (Math.random() - 0.5) * 10000;
            AudioFX.startEngine();
            if (this.mode !== 'SINGLE') {
                this.net.loop = setInterval(() => {
                    if (this.state === 'PLAYING') this.net.playersRef.child(this.net.uid).update({ x: this.ship.x, y: this.ship.y, z: this.ship.z, pitch: this.ship.pitch, yaw: this.ship.yaw, roll: this.ship.roll, hp: this.ship.hp });
                }, 100);
            }
        },

        cleanup: function() { 
            AudioFX.stop();
            if (this.net.loop) clearInterval(this.net.loop);
            if (this._lobbyClick) window.System.canvas.removeEventListener('pointerdown', this._lobbyClick);
            if (this.mode !== 'SINGLE' && this.net.playersRef) {
                this.net.playersRef.off(); this.net.sessionRef.child('state').off(); 
                this.net.playersRef.child(this.net.uid).remove();
                if (this.net.isHost) this.net.sessionRef.remove();
            }
        },

        // =========================================================================
        // 4. RASTREAMENTO DO PILOTO (CÂMERA)
        // =========================================================================
        readPoseNet: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false;
            this.pilot.headTilt = false;
            if (pose && pose.keypoints) {
                const kp = (name) => pose.keypoints.find(k => k.name === name);
                const rw = kp('right_wrist'), lw = kp('left_wrist');
                const rs = kp('right_shoulder'), ls = kp('left_shoulder');
                const rEar = kp('right_ear'), lEar = kp('left_ear');
                const pX = (x) => (1 - (x / 640)) * w, pY = (y) => (y / 480) * h;
                
                if (rEar && lEar && rEar.score > 0.4 && lEar.score > 0.4) {
                    if ((rEar.y - lEar.y) > 20) this.pilot.headTilt = true;
                }
                
                let sDist = w * 0.4; 
                if (rs && ls && rs.score > 0.4 && ls.score > 0.4) {
                    sDist = Math.hypot(pX(rs.x) - pX(ls.x), pY(rs.y) - pY(ls.y)); 
                }
                
                if (this.state === 'CALIBRATION') {
                    this.pilot.baseDepth = (this.pilot.baseDepth * 0.95) + (sDist * 0.05);
                    if (this.pilot.baseDepth === 0) this.pilot.baseDepth = sDist;
                }
                
                if (rw && lw && rw.score > 0.3 && lw.score > 0.3) {
                    inputDetected = true;
                    let rx = pX(rw.x), ry = pY(rw.y), lx = pX(lw.x), ly = pY(lw.y);
                    trgRoll = Math.atan2(ry - ly, rx - lx);
                    trgRoll = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, trgRoll)); 
                    let ratio = sDist / Math.max(1, this.pilot.baseDepth);
                    if (ratio > 1.15) trgPitch = -1.2;
                    else if (ratio < 0.85) trgPitch = 1.2;
                }
            }
            if (inputDetected) {
                this.pilot.active = true;
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 8 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 5 * dt;
                if (this.state === 'PLAYING') {
                    this.ship.yaw += this.pilot.targetRoll * 1.8 * dt; 
                    this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * 5 * dt;
                    this.ship.pitch += this.pilot.targetPitch * dt;
                    this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));
                }
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll *= 0.9;
                this.pilot.targetPitch *= 0.9;
                this.ship.roll *= 0.95;
            }
            this.ship.pitch = this.ship.pitch % (Math.PI * 2);
            this.ship.yaw = this.ship.yaw % (Math.PI * 2);
        },

        // =========================================================================
        // 5. COMBATE AR-TERRA E AR-AR
        // =========================================================================
        processTactics: function(dt, w, h) {
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch); 
            let fY = Math.sin(this.ship.pitch); 
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            this.combat.target = null;
            this.combat.locked = false;
            let closestZ = Infinity;
            
            const scan = (obj, isPlayer, uid) => {
                let p = Engine3D.project(obj.x, obj.y, obj.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if (p.visible && p.z > 200 && p.z < 60000) {
                    if (Math.abs(p.x - w/2) < w * 0.35 && Math.abs(p.y - h/2) < h * 0.35) {
                        if (p.z < closestZ) { closestZ = p.z; this.combat.target = isPlayer ? { ...obj, isPlayer: true, uid: uid } : obj; }
                    }
                }
            };
            
            for (let e of this.entities) scan(e, false, null);
            if (this.mode === 'PVP') {
                Object.keys(this.net.players).forEach(id => {
                    if (id !== this.net.uid && this.net.players[id].hp > 0) scan(this.net.players[id], true, id);
                });
            }
            
            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.3) { 
                    if (!this.combat.locked) AudioFX.play('lock'); 
                    this.combat.locked = true; this.combat.lockTimer = 0.3; 
                }
            } else {
                this.combat.lockTimer -= dt * 2.0; 
                if (this.combat.lockTimer <= 0) this.combat.lockTimer = 0; 
            }
            
            if (this.combat.locked && this.combat.target) {
                const now = performance.now();
                if (now - this.combat.vulcanCd > 80) { 
                    this.combat.vulcanCd = now;
                    let spd = (this.ship.speed * 25) + 35000; 
                    let dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                    let dist = Math.hypot(dx, dy, dz);
                    let offset = Math.random() > 0.5 ? 60 : -60;
                    let sx = this.ship.x + (Math.cos(this.ship.yaw) * offset);
                    let sz = this.ship.z - (Math.sin(this.ship.yaw) * offset);
                    this.bullets.push({ x: sx, y: this.ship.y - 20, z: sz, vx: (dx/dist)*spd, vy: (dy/dist)*spd, vz: (dz/dist)*spd, isEnemy: false, life: 2.0 });
                    AudioFX.play('vulcan'); this.screenShake = 4;
                }
            }
            
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 1.2; 
                let mSpd = this.ship.speed * 30;
                this.missiles.push({ x: this.ship.x, y: this.ship.y - 50, z: this.ship.z, vx: fX*mSpd, vy: fY*mSpd, vz: fZ*mSpd, target: this.combat.target, life: 6.0 });
                AudioFX.play('missile'); this.screenShake = 12;
            }
        },

        // =========================================================================
        // 6. MAIN GAME LOOP
        // =========================================================================
        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = Math.min((now - this.lastTime) / 1000, 0.05); this.lastTime = now;
            if (this.state === 'LOBBY') { this.drawLobby(ctx, w, h); return 0; }
            this.readPoseNet(pose, w, h, dt);
            if (this.state === 'CALIBRATION') {
                this.timer -= dt; this.drawCalibration(ctx, w, h);
                if (this.timer <= 0) this.launchSortie(); return 0;
            }
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this.draw(ctx, w, h);
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'";
                if(this.state === 'VICTORY') { 
                    ctx.fillStyle = "#2ecc71"; ctx.fillText("ÁREA LIMPA. BOM TRABALHO.", w/2, h/2); 
                } else { 
                    ctx.fillStyle = "#e74c3c"; ctx.fillText("AERONAVE DESTRUÍDA.", w/2, h/2); 
                }
                ctx.fillStyle = "#f1c40f"; ctx.font = "bold 30px Arial"; 
                ctx.fillText(`LUCRO: R$ ${this.session.cash}`, w/2, h/2 + 60);
                return this.session.cash;
            }
            
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch); 
            let fY = Math.sin(this.ship.pitch); 
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let units = this.ship.speed * 25;
            this.ship.x += units * fX * dt; 
            this.ship.y += units * fY * dt; 
            this.ship.z += units * fZ * dt;
            
            if (this.ship.y < 50) { this.ship.y = 50; this.ship.pitch = Math.max(0, this.ship.pitch); }
            if (this.ship.y > 40000) this.ship.y = 40000;
            
            this.processTactics(dt, w, h);
            
            if (this.entities.length < 15 && Math.random() < 0.05) {
                let dist = 40000 + Math.random() * 20000;
                let sx = this.ship.x + fX * dist + (Math.random()-0.5)*30000; 
                let sz = this.ship.z + fZ * dist + (Math.random()-0.5)*30000;
                let r = Math.random();
                if (r < 0.35) this.entities.push({ type: 'tank_t72', x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, hp: 250, yaw: Math.random()*Math.PI*2 }); 
                else if (r < 0.75) this.entities.push({ type: 'jet_flee', x: sx, y: Math.max(1000, this.ship.y + (Math.random()-0.5)*8000), z: sz, vx: fX * units * 0.8, vy: 0, vz: fZ * units * 0.8, hp: 150, yaw: this.ship.yaw }); 
                else this.entities.push({ type: 'jet_attack', x: sx, y: Math.max(1000, this.ship.y + (Math.random()-0.5)*8000), z: sz, vx: -fX * 22000, vy: -fY * 22000, vz: -fZ * 22000, hp: 150, yaw: this.ship.yaw + Math.PI }); 
            }

            for (let e of this.entities) {
                e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
                if (e.type === 'jet_flee') { e.vx += Math.sin(now * 0.003) * 1500 * dt; e.x += e.vx * dt; }
                let d = Math.hypot(e.x - this.ship.x, e.y - this.ship.y, e.z - this.ship.z);
                if (d > 120000) { e.hp = -1; continue; }
                if (d > 1000 && d < 18000 && ((e.type === 'jet_attack' && Math.random() < 0.08) || (e.type === 'tank_t72' && Math.random() < 0.04))) {
                    let bSpd = e.type === 'tank_t72' ? 12000 : 30000;
                    this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: (-(e.x - this.ship.x)/d)*bSpd, vy: (-(e.y - this.ship.y)/d)*bSpd, vz: (-(e.z - this.ship.z)/d)*bSpd, isEnemy: true, life: 3.5 });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);
            
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                let b = this.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
                if (b.isEnemy) {
                    if (Math.hypot(b.x - this.ship.x, b.y - this.ship.y, b.z - this.ship.z) < 800) {
                        this.ship.hp -= 8; this.hitFlash = 1.0; this.screenShake = 15;
                        if (this.ship.hp <= 0) this.resolveGame('GAMEOVER'); b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z) < 1200) {
                            e.hp -= 40; b.life = 0; this.spawnFx(e.x, e.y, e.z, '#f39c12', 4, 40); 
                            if (e.hp <= 0) this.kill(e, e.type === 'tank_t72' ? 200 : 100); break;
                        }
                    }
                    if (this.mode === 'PVP' && b.life > 0) {
                        Object.keys(this.net.players).forEach(uid => {
                            if (uid === this.net.uid) return; let rp = this.net.players[uid];
                            if (rp.hp > 0 && Math.hypot(b.x - rp.x, b.y - rp.y, b.z - rp.z) < 1500) {
                                b.life = 0; this.spawnFx(rp.x, rp.y, rp.z, '#f39c12', 4, 50);
                                window.DB.ref(`game_sessions/flight_sim_${this.mode}/pilots/${uid}/hp`).set(rp.hp - 10);
                            }
                        });
                    }
                    if (b.y < 0) { b.life = 0; this.spawnFx(b.x, 0, b.z, '#7f8c8d', 3, 50); } 
                }
                if (b.life <= 0) this.bullets.splice(i, 1);
            }
            
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                let m = this.missiles[i]; m.vx += fX * 8000 * dt; m.vy += fY * 8000 * dt; m.vz += fZ * 8000 * dt; 
                if (m.target && (m.target.hp > 0 || m.target.isPlayer)) {
                    let dx = m.target.x - m.x, dy = m.target.y - m.y, dz = m.target.z - m.z;
                    let d = Math.hypot(dx, dy, dz); let turn = 45000 * dt; 
                    m.vx += (dx/d) * turn; m.vy += (dy/d) * turn; m.vz += (dz/d) * turn;
                    if (d < 1800) { 
                        if (m.target.isPlayer && this.mode === 'PVP') {
                            window.DB.ref(`game_sessions/flight_sim_${this.mode}/pilots/${m.target.uid}/hp`).set(m.target.hp - 50);
                            this.spawnFx(m.target.x, m.target.y, m.target.z, '#ff3300', 40, 300); 
                            this.floatText(m.target.x, m.target.y, m.target.z, "+ ABATE PVP: R$ 500");
                            this.session.cash += 500;
                        } else if (!m.target.isPlayer) { 
                            m.target.hp -= 400; if (m.target.hp <= 0) this.kill(m.target, m.target.type === 'tank_t72' ? 300 : 200); 
                        }
                        m.life = 0; 
                    }
                }
                m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.life -= dt;
                this.fx.push({ x: m.x, y: m.y, z: m.z, vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, vz: (Math.random()-0.5)*150, life: 1.0, c: 'rgba(200,200,200,0.8)', size: 150 });
                this.fx.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: '#ff3300', size: 100 });
                if (m.y < 0) { m.life = 0; this.spawnFx(m.x, 0, m.z, '#e74c3c', 15, 200); }
                if (m.life <= 0) this.missiles.splice(i, 1);
            }
            
            for (let c of this.clouds) { if (Math.hypot(c.x - this.ship.x, c.z - this.ship.z) > 120000) { c.z = this.ship.z + fZ * 90000 + (Math.random()-0.5)*50000; c.x = this.ship.x + fX * 90000 + (Math.random()-0.5)*50000; } }
            for (let i = this.floaters.length - 1; i >= 0; i--) { let f = this.floaters[i]; f.life -= dt; f.y -= 80 * dt; if (f.life <= 0) this.floaters.splice(i, 1); }
            for (let i = this.fx.length - 1; i >= 0; i--) { let f = this.fx[i]; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.life -= dt; if (f.life <= 0) this.fx.splice(i, 1); }
            
            if (this.mode !== 'SINGLE' && this.ship.hp <= 0 && this.state !== 'GAMEOVER') this.resolveGame('GAMEOVER');
            this.draw(ctx, w, h);
            return this.session.cash;
        },

        kill: function(t, rew) {
            AudioFX.play('boom');
            this.spawnFx(t.x, t.y, t.z, '#ff3300', 40, 300); this.spawnFx(t.x, t.y, t.z, '#2c3e50', 30, 600); 
            this.floatText(t.x, t.y, t.z, `+ R$ ${rew}`);
            this.session.kills++; this.session.cash += rew;
            if (this.session.kills >= this.session.goal && this.mode === 'SINGLE') this.resolveGame('VICTORY');
        },

        resolveGame: function(res) {
            this.state = res; AudioFX.stop();
            setTimeout(() => { 
                if(window.System && window.System.gameOver) window.System.gameOver(this.session.kills * 100, res === 'VICTORY', this.session.cash); 
                else if(window.System) window.System.home(); 
            }, 5000);
        },

        spawnFx: function(x, y, z, c, n, s) { for(let i=0; i<n; i++) this.fx.push({ x: x, y: y, z: z, vx: (Math.random()-0.5)*12000, vy: (Math.random()-0.5)*12000, vz: (Math.random()-0.5)*12000, life: 1.0 + Math.random(), c: c, size: s + Math.random()*200 }); },
        floatText: function(x, y, z, t) { this.floaters.push({ x: x, y: y, z: z, text: t, life: 2.0 }); },

        // =========================================================================
        // 7. RENDERIZAÇÃO ESTILO ACE COMBAT (PÔR DO SOL + OCEANO)
        // =========================================================================
        drawLobby: function(ctx, w, h) {
            ctx.fillStyle = "rgba(10, 15, 25, 0.95)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 40px 'Russo One'"; ctx.fillText("SALA DE PRÉ-LANÇAMENTO", w/2, h*0.15);
            const ps = Object.values(this.net.players);
            ctx.font = "bold 24px 'Chakra Petch'"; ctx.fillStyle = "#fff"; ctx.fillText(`PILOTOS ONLINE: ${ps.length}`, w/2, h*0.25);
            let py = h*0.35;
            ps.forEach((p) => { ctx.fillStyle = p.ready ? "#2ecc71" : "#e74c3c"; ctx.fillText(`[ ${p.ready ? 'PRONTO' : 'PREPARANDO'} ] - ${p.callsign || p.name}`, w/2, py); py += 40; });
            if (this.net.isHost) {
                const ready = ps.length >= 1;
                ctx.fillStyle = ready ? "#c0392b" : "#333"; ctx.fillRect(w/2 - 160, h*0.85, 320, 60); ctx.fillStyle = "white"; ctx.font = "bold 22px 'Russo One'"; ctx.fillText(ready ? "INICIAR MISSÃO" : "AGUARDANDO...", w/2, h*0.85 + 38);
            } else {
                ctx.fillStyle = this.net.isReady ? "#e67e22" : "#27ae60"; ctx.fillRect(w/2 - 160, h*0.85, 320, 60); ctx.fillStyle = "white"; ctx.font = "bold 22px 'Russo One'"; ctx.fillText(this.net.isReady ? "AGUARDANDO COMANDO" : "MARCAR PRONTO!", w/2, h*0.85 + 38);
            }
        },

        drawCalibration: function(ctx, w, h) {
            ctx.fillStyle = "rgba(10, 15, 25, 0.95)"; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "rgba(0, 255, 100, 0.2)"; ctx.lineWidth = 2; ctx.strokeRect(50, 50, w-100, h-100);
            ctx.fillStyle = "#00ffcc"; ctx.textAlign = "center"; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText("CALIBRAÇÃO DE PILOTO", w/2, h*0.3);
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Chakra Petch'";
            ctx.fillText("FIQUE PARADO E SEGURE O MANCHE INVISÍVEL", w/2, h*0.4);
            ctx.fillStyle = "#f1c40f"; ctx.font = "bold 16px Arial";
            ctx.fillText("TÁTICA: PASSO PARA A FRENTE PARA MERGULHAR", w/2, h*0.5);
            let pct = 1 - (this.timer / 3.0);
            ctx.fillStyle = "#111"; ctx.fillRect(w/2 - 200, h*0.6, 400, 10);
            ctx.fillStyle = "#00ffcc"; ctx.fillRect(w/2 - 200, h*0.6, 400 * pct, 10);
            if (this.pilot.active) { ctx.fillStyle = "#00ffcc"; ctx.fillText(">> BIOMETRIA OK. GRAVANDO EIXO Z...", w/2, h*0.7); } 
            else { ctx.fillStyle = "#ff3333"; ctx.fillText(">> ENQUADRE-SE NA CÂMERA...", w/2, h*0.7); }
        },

        draw: function(ctx, w, h) {
            ctx.save();
            if (this.screenShake > 0) { ctx.translate((Math.random()-0.5)*this.screenShake, (Math.random()-0.5)*this.screenShake); this.screenShake *= 0.9; }
            
            this.drawWorld(ctx, w, h);
            this.drawEntities(ctx, w, h);
            this.drawHUD(ctx, w, h);
            this.drawCockpit(ctx, w, h);
            
            if (this.hitFlash > 0) { 
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = `rgba(255, 0, 0, ${this.hitFlash})`; ctx.fillRect(0,0,w,h); 
                this.hitFlash -= 0.05; 
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; for(let i = 0; i < h; i+= 4) ctx.fillRect(0, i, w, 1);
            ctx.restore();
        },

        drawWorld: function(ctx, w, h) {
            ctx.save(); 
            ctx.translate(w/2, h/2); 
            ctx.rotate(-this.ship.roll);
            let pWrap = this.ship.pitch % (Math.PI * 2);
            let isInv = (pWrap > Math.PI/2 && pWrap < 3*Math.PI/2);
            let hy = Math.sin(pWrap) * h * 1.5; 
            if (isInv) { ctx.rotate(Math.PI); hy = -hy; }

            // CÉU COM PÔR DO SOL (ACE COMBAT STYLE)
            let sGrad = ctx.createLinearGradient(0, -h*4, 0, hy);
            sGrad.addColorStop(0, '#0a1b3f'); 
            sGrad.addColorStop(0.6, '#cc5500'); 
            sGrad.addColorStop(1, '#ffd700'); 
            ctx.fillStyle = sGrad; ctx.fillRect(-w*3, -h*4, w*6, hy + h*4);
            
            // SOL
            ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
            ctx.shadowBlur = 100; ctx.shadowColor = '#ffa500';
            ctx.beginPath(); ctx.arc(w*0.8, hy - 120, 70, 0, Math.PI*2); ctx.fill(); 
            ctx.shadowBlur = 0;

            // CHÃO OCEÂNICO PROFUNDO
            let gGrad = ctx.createLinearGradient(0, hy, 0, h*4);
            gGrad.addColorStop(0, '#003366'); 
            gGrad.addColorStop(1, '#001122'); 
            ctx.fillStyle = gGrad; ctx.fillRect(-w*3, hy, w*6, h*4);

            // GRELHA SUPERFÍCIE
            ctx.strokeStyle = 'rgba(0, 150, 255, 0.1)'; ctx.lineWidth = 1;
            let st = 8000, sx = Math.floor(this.ship.x / st) * st - (st * 10), sz = Math.floor(this.ship.z / st) * st - (st * 10);
            ctx.beginPath();
            for(let x=0; x<=20; x++) {
                for(let z=0; z<=20; z++) {
                    let p = Engine3D.project(sx+x*st, 0, sz+z*st, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible && p.s > 0.01) { ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y); }
                }
            }
            ctx.stroke();

            // LINHA DE HORIZONTE
            ctx.strokeStyle = 'rgba(255, 200, 100, 0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w*3, hy); ctx.lineTo(w*3, hy); ctx.stroke();
            ctx.restore();
        },

        drawEntities: function(ctx, w, h) {
            let buffer = [];
            const add = (list, type) => {
                list.forEach(obj => {
                    let p = Engine3D.project(obj.x, obj.y, obj.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible) buffer.push({ p: p, t: type, o: obj });
                });
            };
            add(this.clouds, 'c'); add(this.entities, 'e'); add(this.bullets, 'b'); add(this.missiles, 'm'); add(this.fx, 'f'); add(this.floaters, 'x');
            if (this.mode !== 'SINGLE') {
                Object.keys(this.net.players).forEach(uid => {
                    if (uid === this.net.uid) return; let rp = this.net.players[uid]; if (rp.hp <= 0) return; 
                    let p = Engine3D.project(rp.x, rp.y, rp.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if (p.visible) buffer.push({ p: p, t: 'p', o: rp, id: uid });
                });
            }
            buffer.sort((a, b) => b.p.z - a.p.z);
            buffer.forEach(d => {
                let p = d.p, s = p.s, obj = d.o;
                if (d.t === 'c') { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(p.x, p.y, obj.size * s, 0, Math.PI*2); ctx.fill(); }
                else if (d.t === 'x') { ctx.fillStyle = '#2ecc71'; ctx.font = `bold ${Math.max(16, 1500*s)}px 'Russo One'`; ctx.textAlign="center"; ctx.fillText(obj.text, p.x, p.y); }
                else if (d.t === 'e' || d.t === 'p') {
                    let isNet = d.t === 'p', isTank = obj.type === 'tank_t72';
                    if (isNet || obj.type.startsWith('jet')) this.renderJet(ctx, p, obj.yaw - this.ship.yaw - this.ship.roll, isNet);
                    else if (isTank) this.renderTank(ctx, p, obj.yaw - this.ship.yaw, -this.ship.roll);
                    
                    if (isNet) {
                        ctx.fillStyle = this.mode === 'COOP' ? '#00ffff' : '#ff3300'; ctx.font="bold 14px Arial"; ctx.textAlign="center"; ctx.fillText(obj.callsign || obj.name, p.x, p.y - 300*s - 10);
                        ctx.fillStyle='#e74c3c'; ctx.fillRect(p.x-20, p.y-300*s, 40, 5); ctx.fillStyle='#2ecc71'; ctx.fillRect(p.x-20, p.y-300*s, 40*(obj.hp/100), 5);
                    }
                    let locked = (this.combat.target && (isNet ? this.combat.target.uid === d.id : this.combat.target === obj));
                    let bs = Math.max(30, 200 * s); 
                    if (locked) {
                        ctx.strokeStyle = '#ff003c'; ctx.lineWidth = 4; ctx.beginPath();
                        ctx.moveTo(p.x-bs, p.y-bs+15); ctx.lineTo(p.x-bs, p.y-bs); ctx.lineTo(p.x-bs+15, p.y-bs);
                        ctx.moveTo(p.x+bs-15, p.y-bs); ctx.lineTo(p.x+bs, p.y-bs); ctx.lineTo(p.x+bs, p.y-bs+15);
                        ctx.moveTo(p.x-bs, p.y+bs-15); ctx.lineTo(p.x-bs, p.y+bs); ctx.lineTo(p.x-bs+15, p.y+bs);
                        ctx.moveTo(p.x+bs-15, p.y+bs); ctx.lineTo(p.x+bs, p.y+bs); ctx.lineTo(p.x+bs, p.y+bs-15);
                        ctx.stroke(); ctx.fillStyle = '#ff003c'; ctx.textAlign='center'; ctx.font="bold 16px 'Chakra Petch'"; ctx.fillText("LOCKED", p.x, p.y+bs+25);
                    } else if (!isNet) {
                        ctx.strokeStyle = isTank ? 'rgba(255, 100, 0, 0.8)' : 'rgba(255, 0, 0, 0.6)'; ctx.lineWidth = 2; ctx.strokeRect(p.x-bs, p.y-bs, bs*2, bs*2);
                        if(bs === 30) { ctx.fillStyle=ctx.strokeStyle; ctx.font="10px Arial"; ctx.textAlign="center"; ctx.fillText(isTank?"[T-72]":"[CAÇA]", p.x, p.y+bs+15); }
                    }
                }
                else if (d.t === 'b') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = obj.isEnemy ? '#f00' : '#ff0'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 6*s), 0, Math.PI*2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
                else if (d.t === 'm') { ctx.fillStyle = '#fff'; ctx.fillRect(p.x-10*s, p.y-10*s, 20*s, 20*s); }
                else if (d.t === 'f') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, obj.life); ctx.fillStyle = obj.c; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, obj.size*s), 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; }
            });
        },

        renderJet: function(ctx, p, ry, net) {
            let s = p.s * 600; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ry);
            let mc = net ? (this.mode==='COOP'?'#0a3d62':'#8e44ad') : '#2c3e50'; let ec = net ? (this.mode==='COOP'?'#00ffcc':'#e74c3c') : '#e67e22';
            if (Math.cos(ry) > 0) {
                ctx.fillStyle = mc; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-s, s*0.2); ctx.lineTo(-s*0.8, s*0.4); ctx.lineTo(s*0.8, s*0.4); ctx.lineTo(s, s*0.2); ctx.fill();
                ctx.fillStyle = '#1a252f'; ctx.fillRect(-s*0.4, -s*0.6, s*0.3, s*0.7); ctx.fillRect(s*0.1, -s*0.6, s*0.3, s*0.7);                
                ctx.fillStyle = ec; ctx.globalCompositeOperation='lighter'; ctx.beginPath(); ctx.arc(-s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.arc(s*0.15, s*0.2, s*0.1, 0, Math.PI*2); ctx.fill(); ctx.globalCompositeOperation='source-over';
            } else {
                ctx.fillStyle = mc; ctx.beginPath(); ctx.moveTo(0,-s*0.2); ctx.lineTo(-s, s*0.4); ctx.lineTo(0, s*0.5); ctx.lineTo(s, s*0.4); ctx.fill();
                ctx.fillStyle = '#000'; ctx.fillRect(-s*0.3, s*0.2, s*0.15, s*0.2); ctx.fillRect(s*0.15, s*0.2, s*0.15, s*0.2);
            }
            ctx.restore();
        },

        renderTank: function(ctx, p, ry, vRoll) {
            let s = p.s * 700; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(vRoll);
            ctx.fillStyle = '#3a4018'; ctx.fillRect(-s, -s*0.8, s*2, s*1.6);
            ctx.fillStyle = '#111'; ctx.fillRect(-s*1.2, -s*0.8, s*0.2, s*1.6); ctx.fillRect(s*1.0, -s*0.8, s*0.2, s*1.6);
            ctx.rotate(ry); ctx.fillStyle = '#2f3513'; ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(-s*0.1, -s*1.8, s*0.2, s*1.8);
            ctx.restore();
        },

        drawHUD: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)"; ctx.fillRect(0, 0, w, 50);
            ctx.fillStyle = "#00ffcc"; ctx.font = "bold 20px 'Chakra Petch'"; 
            ctx.textAlign = "left"; ctx.fillText(`SPD: ${Math.floor(this.ship.speed)} KTS`, 20, 30);
            ctx.textAlign = "right"; ctx.fillText(`ALT: ${Math.floor(this.ship.y)} FT`, w - 20, 30);
            let hdg = (this.ship.yaw * 180 / Math.PI) % 360; if(hdg < 0) hdg += 360;
            ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 22px 'Russo One'"; ctx.fillText(Math.floor(hdg) + "°", w/2, 35);
            
            // RADAR
            const rx = w - 80, ry = 130, rr = 60;
            ctx.fillStyle = 'rgba(0, 30, 10, 0.6)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx, ry-rr); ctx.lineTo(rx, ry+rr); ctx.moveTo(rx-rr, ry); ctx.lineTo(rx+rr, ry); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(rx, ry-6); ctx.lineTo(rx-5, ry+4); ctx.lineTo(rx+5, ry+4); ctx.fill();
            
            const plotRadar = (tx, tz, col, isSquare) => {
                let dx = tx - this.ship.x, dz = tz - this.ship.z;
                let cr = Math.cos(this.ship.yaw), sr = Math.sin(this.ship.yaw);
                let locX = dx * cr - dz * sr, locZ = dx * sr + dz * cr;
                let dist = Math.hypot(locX, locZ); let maxD = 60000;
                if (dist < maxD) {
                    let px = rx + (locX/maxD)*rr, py = ry - (locZ/maxD)*rr;
                    ctx.fillStyle = col; 
                    if (isSquare) ctx.fillRect(px-3, py-3, 6, 6); else { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2); ctx.fill(); }
                }
            };
            this.entities.forEach(e => plotRadar(e.x, e.z, e.type === 'tank_t72' ? '#e67e22' : '#ff003c', e.type === 'tank_t72'));
            if (this.mode !== 'SINGLE') {
                Object.keys(this.net.players).forEach(uid => {
                    if (uid !== this.net.uid && this.net.players[uid].hp > 0) plotRadar(this.net.players[uid].x, this.net.players[uid].z, this.mode === 'COOP' ? '#00ffff' : '#ff3300', false);
                });
            }
        },

        drawCockpit: function(ctx, w, h) {
            let cx = w/2, cy = h/2;
            ctx.save();
            
            // ==============================================================
            // FIX: TRAVA MATEMÁTICA PARA OS RISCOS VERDES NÃO VAZAREM
            // Removido ctx.clip() para não dar bug no Chrome de Android.
            // ==============================================================
            
            // MIRA CENTRAL
            ctx.shadowBlur=10; ctx.shadowColor='#0ff'; ctx.strokeStyle='rgba(0,255,200,0.9)'; ctx.lineWidth=3;
            ctx.beginPath(); ctx.moveTo(cx-30, cy); ctx.lineTo(cx-10, cy); ctx.moveTo(cx+30, cy); ctx.lineTo(cx+10, cy);
            ctx.moveTo(cx, cy-30); ctx.lineTo(cx, cy-10); ctx.moveTo(cx, cy+30); ctx.lineTo(cx, cy+10); ctx.stroke();
            ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
            
            // PITCH LADDER MATEMÁTICO
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll); 
            ctx.strokeStyle='rgba(0,255,200,0.8)'; ctx.fillStyle='rgba(0,255,200,0.8)'; ctx.lineWidth=2; ctx.font="bold 14px Arial";
            let pDeg = this.ship.pitch * (180/Math.PI), ppd = 15; 
            let maxRadius = Math.min(w, h) * 0.35; // Raio máximo invisível a partir do centro. Não encosta nas bordas.

            for(let i = -90; i <= 90; i+=10) {
                if (i===0) continue; 
                let yo = (pDeg - i) * ppd;
                
                // Desenha a linha APENAS se estiver dentro do limite central
                if (Math.abs(yo) < maxRadius) {
                    ctx.beginPath(); 
                    ctx.moveTo(-150, yo); ctx.lineTo(-80, yo); ctx.lineTo(-80, i<0 ? yo-10 : yo+10);
                    ctx.moveTo(150, yo); ctx.lineTo(80, yo); ctx.lineTo(80, i<0 ? yo-10 : yo+10); 
                    ctx.stroke();
                    ctx.textAlign="right"; ctx.fillText(Math.abs(i), -160, yo+5); 
                    ctx.textAlign="left"; ctx.fillText(Math.abs(i), 160, yo+5);
                }
            }
            ctx.restore();

            // ==============================================================
            // O MANCHE FÍSICO (COLUNA FIXA, VOLANTE RODA)
            // ==============================================================
            if (this.pilot.active) {
                ctx.save();
                ctx.translate(cx, h); // Desce a âncora para a base preta
                let depth = 1.0; if (this.pilot.targetPitch < 0) depth = 0.85; else if (this.pilot.targetPitch > 0) depth = 1.15;
                ctx.scale(depth, depth);
                
                // Haste preta (NÃO DEITA PARA OS LADOS)
                ctx.fillStyle = '#050505'; ctx.fillRect(-25, -180, 50, 180); 
                
                // Sobe até o topo da haste e gira SÓ O VOLANTE
                ctx.translate(0, -180); 
                ctx.rotate(this.pilot.targetRoll); 
                
                ctx.fillStyle = 'rgba(20,20,20,0.95)'; ctx.strokeStyle = '#333'; ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(-110, -30); ctx.lineTo(-130, 40); ctx.lineTo(-60, 60); ctx.lineTo(60, 60); ctx.lineTo(130, 40); ctx.lineTo(110, -30); ctx.lineTo(60, -20); ctx.lineTo(30, 20); ctx.lineTo(-30, 20); ctx.lineTo(-60, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = (this.combat.missileCd<=0) ? '#f00' : '#500'; ctx.beginPath(); ctx.arc(-100, -25, 10, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(100, -25, 10, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#020617'; ctx.fillRect(-45, 5, 90, 25); ctx.strokeStyle = '#0f6'; ctx.lineWidth=2; ctx.strokeRect(-45, 5, 90, 25);
                ctx.fillStyle = '#0f6'; ctx.font="bold 12px Arial"; ctx.textAlign="center"; ctx.fillText(this.pilot.targetPitch < -0.5 ? "MERGULHO" : (this.pilot.targetPitch > 0.5 ? "SUBIDA" : "NIVELADO"), 0, 22);
                ctx.restore();
            } else {
                ctx.fillStyle='#f00'; ctx.textAlign="center"; ctx.font="bold clamp(16px, 3vw, 24px) Arial"; ctx.fillText("COLOQUE AS MÃOS NA TELA PARA ASSUMIR O MANCHE", cx, h-50);
            }

            // HUD RODAPÉ EM PORTUGUÊS
            ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(10, h-50, 220, 40);
            ctx.fillStyle='#222'; ctx.fillRect(20, h-30, 200, 10); ctx.fillStyle=this.ship.hp>30?'#2ecc71':'#e74c3c'; ctx.fillRect(20, h-30, 200*(Math.max(0,this.ship.hp)/100), 10);
            ctx.fillStyle='#fff'; ctx.font="bold 12px Arial"; ctx.textAlign="left"; ctx.fillText(`INTEGRIDADE: ${Math.floor(this.ship.hp)}%`, 20, h-35);
            ctx.fillStyle='#f1c40f'; ctx.font="bold 18px 'Russo One'"; ctx.textAlign="right"; ctx.fillText(`DINHEIRO: R$ ${this.session.cash}`, w-10, h-20);
        }
    };

    // SYSTEM INJECTION PARA THIAGUINHO OS
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('flight_sim', 'Aero Strike WAR', '✈️', Game, {
                camera: 'user', 
                phases: [ 
                    { id: 'basic_training', name: 'TREINO VS IA', desc: 'Sistemas a 100%. Calibre as mãos. Abata tudo o que se mover.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'squadron_coop', name: 'ESQUADRÃO CO-OP', desc: 'Rede ativa. Alie-se a outros pilotos contra os Bots.', mode: 'COOP', reqLvl: 1 },
                    { id: 'air_superiority', name: 'DOGFIGHT PVP', desc: 'Cada um por si. Ganhe dinheiro caçando pilotos reais.', mode: 'PVP', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();