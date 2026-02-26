// =============================================================================
// AERO STRIKE WAR: ULTIMATE TACTICAL SIMULATOR (V-BULLETPROOF)
// ARQUITETO: LEAD ENGINE PROGRAMMER (30 YRS EXP)
// STATUS: SISTEMA ANTI-CRASH ATIVADO | F-22 YOKE SEGURO | AUTO-VULCAN | HANGAR
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. ENGINE 3D AVANÇADA (6-DOF)
    // =========================================================================
    const Engine3D = {
        fov: 900,
        project: (ox, oy, oz, cx, cy, cz, pitch, yaw, roll, w, h) => {
            let dx=ox-cx, dy=oy-cy, dz=oz-cz;
            let cyw=Math.cos(-yaw), syw=Math.sin(-yaw), cp=Math.cos(-pitch), sp=Math.sin(-pitch), cr=Math.cos(roll), sr=Math.sin(roll);
            let x1=dx*cyw-dz*syw, z1=dx*syw+dz*cyw, y2=dy*cp-z1*sp, z2=dy*sp+z1*cp;
            if (z2 < 20) return { visible: false };
            let fx=x1*cr-y2*sr, fy=x1*sr+y2*cr, s=Engine3D.fov/z2;
            return { x: (w/2)+fx*s, y: (h/2)-fy*s, s: s, z: z2, visible: true };
        }
    };

    // =========================================================================
    // 2. MODELOS VETORIAIS PS2-STYLE
    // =========================================================================
    const MESHES = {
        jet: {
            v: [
                {x:0,y:0,z:50}, {x:0,y:10,z:-30}, {x:-40,y:0,z:-15}, {x:40,y:0,z:-15},
                {x:0,y:-10,z:-20}, {x:0,y:15,z:15}, {x:-15,y:15,z:-30}, {x:15,y:15,z:-30}
            ],
            f: [
                [0,2,1,'#7f8c8d'], [0,1,3,'#95a5a6'], [0,4,2,'#2c3e50'], [0,3,4,'#34495e'],
                [1,6,2,'#111'], [1,3,7,'#111'], [0,5,2,'#bdc3c7'], [0,3,5,'#ecf0f1']
            ]
        },
        tank: {
            v: [{x:-20,y:0,z:30},{x:20,y:0,z:30},{x:20,y:15,z:30},{x:-20,y:15,z:30},{x:-20,y:0,z:-30},{x:20,y:0,z:-30},{x:20,y:15,z:-30},{x:-20,y:15,z:-30},{x:-10,y:15,z:10},{x:10,y:15,z:10},{x:10,y:25,z:-15},{x:-10,y:25,z:-15},{x:0,y:20,z:10},{x:0,y:20,z:50}],
            f: [[0,1,2,3,'#3d4d1d'],[4,5,6,7,'#2d3d1d'],[8,9,10,11,'#1d2d0d'],[12,13,12,'#111']]
        }
    };

    // =========================================================================
    // 3. CORE DO SIMULADOR TÁTICO
    // =========================================================================
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE', session: { kills: 0, goal: 20 },
        ship: { x:0, y:15000, z:0, pitch:0, yaw:0, roll:0, speed:1800, hp:100, boost:100, overheat:0 },
        pilot: { active:false, trgRoll:0, trgPitch:0, headTilt:false, wristL:{x:0,y:0}, wristR:{x:0,y:0}, baseY:0 },
        combat: { targetId:null, locked:false, lockTimer:0, vulcanCd:0, missileCd:0 },
        entities: {}, eId: 0,
        upgrades: { engine: 1, radar: 1, missile: 1, thermal: 1 },
        hoveredItem: null, hoverTime: 0,
        net: { uid:null, isHost:false, isReady:false, players:{} },
        environment: { skyTop:'#1e3c72', skyBot:'#2a5298', ground:'#1b2e1b', isNight:false, stars:[] },
        sysError: null, // Sistema Anti-Tela-Branca

        init: function(faseData) {
            try {
                this.sysError = null;
                this.lastTime = performance.now();
                this.entities = {}; this.eId = 0;
                this.session = { kills: 0, goal: faseData?.mode === 'SINGLE' ? 15 : 50 };
                this.ship = { x:0, y:15000, z:0, pitch:0, yaw:0, roll:0, speed:1800, hp:100, boost:100, overheat:0 };
                this.combat = { targetId:null, locked:false, lockTimer:0, vulcanCd:0, missileCd:0 };
                this.hoverTime = 0; this.hoveredItem = null;

                // Carrega Upgrades com Proteção
                this.upgrades = (window.Profile && window.Profile.flightUpgrades) ? window.Profile.flightUpgrades : { engine: 1, radar: 1, missile: 1, thermal: 1 };
                
                // Cenário Baseado no Horário
                let hr = new Date().getHours();
                if(hr >= 6 && hr < 17) { this.environment = { skyTop:'#4facfe', skyBot:'#00f2fe', ground:'#2e4a22', isNight:false }; }
                else if(hr >= 17 && hr < 19) { this.environment = { skyTop:'#fa709a', skyBot:'#fee140', ground:'#3e2723', isNight:false }; }
                else { 
                    this.environment = { skyTop:'#000428', skyBot:'#004e92', ground:'#050505', isNight:true, stars:[] }; 
                    for(let i=0;i<100;i++) this.environment.stars.push({x:Math.random()*2-1, y:Math.random(), z:Math.random()*2-1}); 
                }

                // Spawns Iniciais
                for(let i=0; i<40; i++) this.spawn('cloud', { x:(Math.random()-0.5)*200000, y:8000+Math.random()*20000, z:(Math.random()-0.5)*200000, size:5000+Math.random()*10000 });
                for(let i=0; i<15; i++) this.spawn('enemy_tank', { x:(Math.random()-0.5)*150000, y:0, z:(Math.random()-0.5)*150000, hp:300 });

                this.net.uid = window.System?.playerId || "p_" + Math.floor(Math.random()*9999);
                this.mode = faseData?.mode || 'SINGLE';
                
                this._handleClick = this._handleClick.bind(this);
                window.addEventListener('pointerdown', this._handleClick);

                // Inicialização Segura de Rede
                if(this.mode !== 'SINGLE' && window.DB) {
                    this._initNetSafe();
                } else {
                    this.state = 'HANGAR'; 
                }

                if(window.Sfx) window.Sfx.init();

            } catch(e) {
                console.error("Flight Init Error:", e);
                this.sysError = e.message;
            }
        },

        spawn: function(type, data) {
            let id = type + "_" + (this.eId++);
            this.entities[id] = { id, type, ...data };
            return id;
        },

        // =========================================================================
        // REDE SEGURA (NUNCA VAI CRASHAR A TELA SE A INTERNET CAIR)
        // =========================================================================
        _initNetSafe: async function() {
            this.state = 'LOBBY';
            try {
                const path = 'br_army_sessions/aero_' + this.mode;
                this.net.sessionRef = window.DB.ref(path);
                this.net.playersRef = this.net.sessionRef.child('pilotos');
                
                this.net.playersRef.child(this.net.uid).onDisconnect().remove();
                
                let snap = await this.net.sessionRef.child('host').once('value');
                if(!snap.val()) {
                    this.net.isHost = true;
                    await this.net.sessionRef.child('host').set(this.net.uid);
                    await this.net.sessionRef.child('state').set('LOBBY');
                }
                
                this._updateNetProfile();

                this.net.playersRef.on('value', s => { this.net.players = s.val() || {}; });
                this.net.sessionRef.child('state').on('value', s => {
                    let st = s.val();
                    if(st === 'HANGAR' && this.state === 'LOBBY') this.state = 'HANGAR';
                    if(st === 'CALIBRATION' && this.state === 'HANGAR') { this.state = 'CALIBRATION'; this.timer = 4; }
                });
            } catch(e) {
                console.warn("Netcode bloqueado, forçando modo offline.", e);
                this.state = 'HANGAR';
                this.mode = 'SINGLE'; // Força offline para não estragar a diversão
            }
        },

        _updateNetProfile: function() {
            if(!this.net.playersRef || this.mode === 'SINGLE') return;
            try {
                this.net.playersRef.child(this.net.uid).set({
                    name: window.Profile?.username || 'PILOTO',
                    ready: this.net.isReady,
                    hp: this.ship.hp, x:this.ship.x, y:this.ship.y, z:this.ship.z,
                    pitch:this.ship.pitch, yaw:this.ship.yaw, roll:this.ship.roll
                }).catch(()=>{}); // Suprime erros de DB
            } catch(e) {}
        },

        // =========================================================================
        // GAME LOOP COM ESCUDO DE PROTEÇÃO (TRY/CATCH GLOBAL)
        // =========================================================================
        update: function(ctx, w, h, pose) {
            try {
                if (this.sysError) {
                    ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
                    ctx.fillStyle = '#f00'; ctx.font = '20px Arial';
                    ctx.fillText("ERRO DO SISTEMA RECUPERADO: " + this.sysError, 20, 50);
                    ctx.fillStyle = '#fff'; ctx.fillText("TENTANDO REINICIAR...", 20, 90);
                    return window.Profile?.coins || 0;
                }

                const now = performance.now();
                // Trava o DeltaTime para evitar que valores absurdos quebrem a física
                let dt = Math.max(0.001, Math.min((now - this.lastTime)/1000, 0.05));
                if(isNaN(dt)) dt = 0.016; 
                this.lastTime = now;

                this._readPose(pose, w, h, dt);

                if(this.state === 'LOBBY') { this._drawLobby(ctx, w, h); return window.Profile?.coins || 0; }
                if(this.state === 'HANGAR') { this._drawHangar(ctx, w, h, dt); return window.Profile?.coins || 0; }
                
                if(this.state === 'CALIBRATION') {
                    // Proteção contra NaN no timer
                    if(isNaN(this.timer)) this.timer = 4;
                    this.timer -= dt;
                    this._drawCalib(ctx, w, h);
                    if(this.timer <= 0) { 
                        this.state = 'PLAYING'; 
                        if(window.Sfx) { window.Sfx.play(1000, 'sine', 0.5); window.Sfx.play(150, 'sawtooth', 1.0, 0.2); }
                    }
                    return window.Profile?.coins || 0;
                }

                if(this.state === 'GAMEOVER' || this.state === 'VICTORY') { this._drawEnd(ctx, w, h); return window.Profile?.coins || 0; }

                this._processPhysics(dt);
                this._processCombat(dt, w, h, now);
                this._processAI(dt);
                this._updateEntities(dt);

                if(this.mode !== 'SINGLE' && now % 200 < 20) this._updateNetProfile();

                this._draw(ctx, w, h, now);
                return window.Profile?.coins || 0;

            } catch (e) {
                console.error("CRASH EVITADO NO UPDATE:", e);
                ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(0,0,w,100);
                ctx.fillStyle = '#fff'; ctx.font = '16px Arial';
                ctx.fillText("ERRO INTERNO IGNORADO: " + e.message, 10, 30);
                return window.Profile?.coins || 0;
            }
        },

        // =========================================================================
        // CONTROLES FLY-BY-WIRE AVANÇADOS (SEM TREMEDEIRA)
        // =========================================================================
        _readPose: function(pose, w, h, dt) {
            this.pilot.active = false;
            if(!pose?.keypoints) return;
            
            const kp = n => pose.keypoints.find(k => k.name === n);
            const rw = kp('right_wrist'), lw = kp('left_wrist'), re = kp('right_ear'), le = kp('left_ear');
            const pX = x => w - (x/640)*w, pY = y => (y/480)*h;

            if(rw?.score > 0.3 && lw?.score > 0.3) {
                this.pilot.active = true;
                this.pilot.wristR = { x: pX(rw.x), y: pY(rw.y) };
                this.pilot.wristL = { x: pX(lw.x), y: pY(lw.y) };

                // ROLL (Giro)
                let dx = this.pilot.wristR.x - this.pilot.wristL.x;
                let dy = this.pilot.wristR.y - this.pilot.wristL.y;
                let rawRoll = Math.atan2(dy, dx);
                if(Math.abs(rawRoll) < 0.1) rawRoll = 0; // Deadzone
                this.pilot.trgRoll = rawRoll;

                // PITCH (Arfar)
                let avgY = (this.pilot.wristR.y + this.pilot.wristL.y) / 2;
                if(this.state === 'CALIBRATION') this.pilot.baseY = avgY;
                
                let diffY = avgY - (this.pilot.baseY || h/2);
                let normalizedPitch = diffY / (h * 0.3); // Zona confortável de movimento
                
                // Zona Morta Segura (Não pula ao menor movimento)
                if(Math.abs(normalizedPitch) < 0.15) {
                    this.pilot.trgPitch = 0;
                } else {
                    let sign = Math.sign(normalizedPitch);
                    let val = Math.min(1.0, (Math.abs(normalizedPitch) - 0.15) / 0.85);
                    this.pilot.trgPitch = (val * val) * sign * -1.2; // Curva exponencial suave
                }

                // MÍSSIL (Head Tilt)
                if(re?.score > 0.4 && le?.score > 0.4) {
                    this.pilot.headTilt = Math.abs(pY(re.y) - pY(le.y)) > h * 0.06;
                }
            }
        },

        _processPhysics: function(dt) {
            // Suavização da Inércia
            this.ship.roll += (this.pilot.trgRoll - this.ship.roll) * 3 * dt;
            this.ship.pitch += (this.pilot.trgPitch - this.ship.pitch) * 2 * dt;
            this.ship.yaw += this.ship.roll * 1.2 * dt;

            // Limite de Ângulo
            this.ship.pitch = Math.max(-1.3, Math.min(1.3, this.ship.pitch));
            
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch);
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);

            let maxSpeed = 1800 + (this.upgrades.engine * 400);
            this.ship.speed += (maxSpeed - this.ship.speed) * dt;

            let spdMult = this.ship.speed * 20;
            this.ship.x += fX * spdMult * dt;
            this.ship.y += fY * spdMult * dt;
            this.ship.z += fZ * spdMult * dt;

            // Colisões Seguras
            if(this.ship.y < 50) { 
                this.ship.y = 50; 
                this.ship.hp -= (this.ship.pitch < -0.3) ? 30*dt : 2*dt;
                this.ship.pitch = Math.max(0.1, this.ship.pitch); 
                if(window.Gfx) window.Gfx.shakeScreen(3);
            }
            if(this.ship.y > 60000) { this.ship.y = 60000; this.ship.pitch = Math.min(0, this.ship.pitch); }
            
            if(this.ship.hp <= 0 && this.state === 'PLAYING') this._endGame('GAMEOVER');
        },

        // =========================================================================
        // COMBATE (AUTO-VULCAN E MÍSSEIS)
        // =========================================================================
        _processCombat: function(dt, w, h, now) {
            let radarRange = 60000 + (this.upgrades.radar * 15000);
            let bestId = null, minDist = Infinity;
            
            for(let id in this.entities) {
                let e = this.entities[id];
                if(!e.type.startsWith('enemy') && e.type !== 'net_player') continue;
                if(e.type === 'net_player' && (e.id === this.net.uid || this.mode === 'COOP')) continue; 
                
                let p = Engine3D.project(e.x, e.y, e.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if(p.visible && p.z < radarRange) {
                    let dToCenter = Math.hypot(p.x - w/2, p.y - h/2);
                    if(dToCenter < w * 0.4) { 
                        if(p.z < minDist) { minDist = p.z; bestId = id; }
                    }
                }
            }
            
            this.combat.targetId = bestId;
            if(bestId) {
                this.combat.lockTimer += dt;
                if(this.combat.lockTimer > 0.4) {
                    if(!this.combat.locked && window.Sfx) window.Sfx.play(1200, 'square', 0.1, 0.1);
                    this.combat.locked = true;
                }
            } else {
                this.combat.locked = false;
                this.combat.lockTimer = 0;
            }

            // AUTO-VULCAN COM RESFRIAMENTO
            if(this.combat.isJammed) {
                this.ship.overheat -= (30 + this.upgrades.thermal * 10) * dt;
                if(this.ship.overheat <= 20) { this.combat.isJammed = false; if(window.Sfx) window.Sfx.play(800, 'sine', 0.1, 0.1); }
            }

            if(this.combat.locked && !this.combat.isJammed && now - this.combat.vulcanCd > 100) {
                this.combat.vulcanCd = now;
                this.ship.overheat += 15 - (this.upgrades.thermal * 1.5);
                
                if(this.ship.overheat >= 100) { 
                    this.ship.overheat = 100; this.combat.isJammed = true; 
                    if(window.Sfx) window.Sfx.play(600, 'square', 0.2, 0.1); 
                }

                let target = this.entities[this.combat.targetId];
                if(target) {
                    let dx = target.x - this.ship.x + (Math.random()-0.5)*1500;
                    let dy = target.y - this.ship.y + (Math.random()-0.5)*1500;
                    let dz = target.z - this.ship.z;
                    let dist = Math.hypot(dx,dy,dz);

                    this.spawn('bullet', { 
                        x:this.ship.x, y:this.ship.y-20, z:this.ship.z, 
                        vx: (dx/dist)*60000, vy: (dy/dist)*60000, vz: (dz/dist)*60000,
                        life: 2.0, isEnemy: false
                    });
                    if(window.Sfx) window.Sfx.play(150, 'sawtooth', 0.05, 0.1);
                    if(window.Gfx) window.Gfx.shakeScreen(1);
                }
            } else if(!this.combat.locked && !this.combat.isJammed) {
                this.ship.overheat = Math.max(0, this.ship.overheat - 20 * dt);
            }

            // MÍSSIL
            if(this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if(this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 3.5 - (this.upgrades.missile * 0.4);
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                let fY = Math.sin(this.ship.pitch);
                let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);

                this.spawn('missile', {
                    x:this.ship.x, y:this.ship.y-100, z:this.ship.z,
                    vx: fX * 20000, vy: fY * 20000 - 1000, vz: fZ * 20000,
                    targetId: this.combat.targetId, life: 8.0, speed: 20000
                });
                if(window.Sfx) window.Sfx.play(400, 'square', 0.8, 0.3);
            }
        },

        _processAI: function(dt) {
            let enemyCount = 0;
            for(let id in this.entities) if(this.entities[id].type.startsWith('enemy')) enemyCount++;
            if(enemyCount < 8 && Math.random() < 0.02) {
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                let sx = this.ship.x + fX * 80000 + (Math.random()-0.5)*50000;
                let sz = this.ship.z + fZ * 80000 + (Math.random()-0.5)*50000;
                if(Math.random() < 0.6) this.spawn('enemy_jet', { x:sx, y:this.ship.y + (Math.random()-0.5)*10000, z:sz, hp:150 });
                else this.spawn('enemy_tank', { x:sx, y:0, z:sz, hp:400 });
            }

            for(let id in this.entities) {
                let e = this.entities[id];
                if(e.type === 'enemy_jet') {
                    let dx = this.ship.x - e.x, dy = this.ship.y - e.y, dz = this.ship.z - e.z;
                    let dist = Math.hypot(dx,dy,dz);
                    if(dist > 150000) { delete this.entities[id]; continue; }
                    e.x += (dx/dist) * 15000 * dt; e.y += (dy/dist) * 15000 * dt; e.z += (dz/dist) * 15000 * dt;
                    if(dist < 40000 && Math.random() < 0.01) {
                        this.spawn('bullet', { x:e.x, y:e.y, z:e.z, vx: (dx/dist)*40000, vy: (dy/dist)*40000, vz: (dz/dist)*40000, life: 3.0, isEnemy: true });
                    }
                }
            }
        },

        _updateEntities: function(dt) {
            for(let id in this.entities) {
                let e = this.entities[id];
                if(e.type === 'cloud') {
                    if(Math.hypot(e.x - this.ship.x, e.z - this.ship.z) > 180000) {
                        let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
                        let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                        e.x = this.ship.x + fX * 150000 + (Math.random()-0.5)*80000;
                        e.z = this.ship.z + fZ * 150000 + (Math.random()-0.5)*80000;
                    }
                } 
                else if(e.type === 'bullet') {
                    e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; e.life -= dt;
                    if(Math.random() < 0.5) this.spawn('fx', {x:e.x, y:e.y, z:e.z, life:0.2, color: e.isEnemy ? '#f30' : '#ff0', size: 100});
                    if(e.life <= 0 || e.y < 0) { delete this.entities[id]; continue; }

                    if(e.isEnemy && Math.hypot(e.x - this.ship.x, e.y - this.ship.y, e.z - this.ship.z) < 1500) {
                        this.ship.hp -= 5;
                        if(window.Gfx) window.Gfx.shakeScreen(3);
                        if(window.Sfx) window.Sfx.play(80, 'sawtooth', 0.2, 0.4);
                        delete this.entities[id];
                    } 
                    else if(!e.isEnemy) {
                        for(let tId in this.entities) {
                            let t = this.entities[tId];
                            if(t.type.startsWith('enemy') && Math.hypot(e.x - t.x, e.y - t.y, e.z - t.z) < 2500) {
                                t.hp -= 20;
                                this.spawn('fx', {x:t.x, y:t.y, z:t.z, life:0.5, color:'#f90', size:300});
                                if(t.hp <= 0) this._explode(tId);
                                delete this.entities[id]; break;
                            }
                        }
                    }
                } 
                else if(e.type === 'missile') {
                    e.speed += 25000 * dt;
                    let t = this.entities[e.targetId];
                    if(!t) { e.life = 0; delete this.entities[id]; continue; }
                    let dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z, dist = Math.hypot(dx,dy,dz);
                    let tr = (30000 + this.upgrades.missile * 15000) * dt;
                    e.vx += (dx/dist) * tr; e.vy += (dy/dist) * tr; e.vz += (dz/dist) * tr;
                    let vD = Math.hypot(e.vx, e.vy, e.vz);
                    if(vD > e.speed) { e.vx = (e.vx/vD)*e.speed; e.vy = (e.vy/vD)*e.speed; e.vz = (e.vz/vD)*e.speed; }
                    e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; e.life -= dt;
                    this.spawn('fx', {x:e.x, y:e.y, z:e.z, life:1.0, color:'rgba(200,200,200,0.5)', size:400});
                    if(dist < 3000) { this._explode(e.targetId); delete this.entities[id]; }
                    if(e.y < 0 || e.life <= 0) delete this.entities[id];
                }
                else if(e.type === 'fx') {
                    e.life -= dt; if(e.life <= 0) delete this.entities[id];
                }
            }
        },

        _explode: function(tId) {
            let t = this.entities[tId]; if(!t) return;
            
            let reward = t.type === 'enemy_tank' ? 300 : 200;
            if(window.Profile) {
                window.Profile.coins = (window.Profile.coins || 0) + reward;
                if(window.System && window.System.playerId && window.DB) {
                    window.DB.ref(`users/${window.System.playerId}/coins`).set(window.Profile.coins).catch(()=>{});
                }
            }
            this.session.kills++;
            
            if(window.Gfx) window.Gfx.shakeScreen(8);
            if(window.Sfx) window.Sfx.play(80, 'sawtooth', 0.8, 0.6);
            
            this.spawn('fx', {x:t.x, y:t.y, z:t.z, life:2.0, color:'#f30', size: 1000});
            this.spawn('fx', {x:t.x, y:t.y, z:t.z, life:1.5, color:'#ff0', size: 600});
            
            delete this.entities[tId];
            if(this.session.kills >= this.session.goal && this.mode === 'SINGLE') this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res;
            setTimeout(() => { if(window.System && window.System.home) window.System.home(); }, 4000);
        },

        // =========================================================================
        // INPUTS (SEGURANÇA TOTAL)
        // =========================================================================
        _handleClick: function(e) {
            if(!window.System?.canvas) return;
            const w = window.System.canvas.width; const h = window.System.canvas.height;
            const rect = window.System.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (w/rect.width);
            const y = (e.clientY - rect.top) * (h/rect.height);
            
            if(this.state === 'LOBBY') {
                if(x > w/2 - 150 && x < w/2 + 150 && y > h*0.8 && y < h*0.8 + 60) {
                    if(this.net.isHost) {
                        this.net.sessionRef?.child('state').set('HANGAR').catch(()=>{ this.state='HANGAR'; });
                    } else {
                        this.net.isReady = !this.net.isReady;
                        this.net.playersRef?.child(this.net.uid).update({ ready: this.net.isReady }).catch(()=>{});
                    }
                    if(window.Sfx) window.Sfx.play(1000, 'sine', 0.1);
                }
            }
            else if(this.state === 'HANGAR') {
                const items = this._getHangarItems(w, h);
                items.forEach(item => {
                    let r = { x: w*0.1, y: item.y - h*0.04, w: w*0.8, h: h*0.08 };
                    if(x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) this._buyItem(item);
                });
            }
        },

        // =========================================================================
        // RENDERS (TOTALMENTE À PROVA DE CRASH)
        // =========================================================================
        _draw: function(ctx, w, h, now) {
            ctx.save();
            let grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, this.environment.skyTop); grad.addColorStop(1, this.environment.skyBot);
            ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

            if(this.environment.isNight) {
                ctx.fillStyle = "rgba(255,255,255,0.8)";
                this.environment.stars.forEach(s => { ctx.beginPath(); ctx.arc(w/2 + s.x*w, h/2 + s.y*h, 1, 0, 7); ctx.fill(); });
            }

            this._drawGrid(ctx, w, h);
            this._drawEntities(ctx, w, h);
            ctx.restore();

            this._drawHUD(ctx, w, h, now);
        },

        _drawGrid: function(ctx, w, h) {
            if(this.ship.y > 45000) return;
            ctx.strokeStyle = "rgba(0, 255, 100, 0.2)"; ctx.lineWidth = 1;
            let spacing = 10000;
            let startX = Math.floor(this.ship.x / spacing) * spacing - spacing*15;
            let startZ = Math.floor(this.ship.z / spacing) * spacing - spacing*15;
            
            ctx.beginPath();
            for(let x=0; x<=30; x++) {
                for(let z=0; z<=30; z++) {
                    let p = Engine3D.project(startX + x*spacing, 0, startZ + z*spacing, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                    if(p.visible && p.s > 0.001) {
                        ctx.moveTo(p.x - 20*p.s, p.y); ctx.lineTo(p.x + 20*p.s, p.y);
                        ctx.moveTo(p.x, p.y - 20*p.s); ctx.lineTo(p.x, p.y + 20*p.s);
                    }
                }
            }
            ctx.stroke();
        },

        _drawEntities: function(ctx, w, h) {
            let drawList = [];
            for(let id in this.entities) {
                let e = this.entities[id];
                let p = Engine3D.project(e.x, e.y, e.z, this.ship.x, this.ship.y, this.ship.z, this.ship.pitch, this.ship.yaw, this.ship.roll, w, h);
                if(p.visible) drawList.push({ e, p });
            }
            drawList.sort((a,b) => b.p.z - a.p.z);

            drawList.forEach(item => {
                let e = item.e, p = item.p;
                
                if(e.type === 'cloud') {
                    ctx.fillStyle = this.environment.isNight ? "rgba(40,40,50,0.1)" : "rgba(255, 255, 255, 0.3)";
                    ctx.beginPath(); ctx.arc(p.x, p.y, e.size * p.s, 0, 7); ctx.fill();
                } 
                else if(e.type === 'enemy_tank') { this._drawMesh(ctx, MESHES.tank, p, 80); } 
                else if(e.type === 'enemy_jet' || e.type === 'net_player') { this._drawMesh(ctx, MESHES.jet, p, 60); }
                else if(e.type === 'missile') { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, 40*p.s), 0, 7); ctx.fill(); }
                else if(e.type === 'fx') {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = e.color; ctx.globalAlpha = Math.max(0, e.life);
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, e.size * p.s), 0, 7); ctx.fill();
                    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                }

                if(e.type === 'net_player') {
                    ctx.fillStyle = this.mode === 'COOP' ? '#0ff' : '#f33';
                    ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
                    ctx.fillText(e.name || 'ALIADO', p.x, p.y - 400*p.s);
                }

                if(this.combat.targetId === e.id) {
                    ctx.strokeStyle = this.combat.locked ? "#f03" : "#0f0"; ctx.lineWidth = 3;
                    let sz = Math.max(20, 300 * p.s);
                    ctx.beginPath();
                    ctx.moveTo(p.x - sz, p.y - sz + 10); ctx.lineTo(p.x - sz, p.y - sz); ctx.lineTo(p.x - sz + 10, p.y - sz);
                    ctx.moveTo(p.x + sz - 10, p.y - sz); ctx.lineTo(p.x + sz, p.y - sz); ctx.lineTo(p.x + sz, p.y - sz + 10);
                    ctx.moveTo(p.x - sz, p.y + sz - 10); ctx.lineTo(p.x - sz, p.y + sz); ctx.lineTo(p.x - sz + 10, p.y + sz);
                    ctx.moveTo(p.x + sz - 10, p.y + sz); ctx.lineTo(p.x + sz, p.y + sz); ctx.lineTo(p.x + sz, p.y + sz - 10);
                    ctx.stroke();
                    if(this.combat.locked) { ctx.fillStyle = "#f03"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText("LOCK", p.x, p.y + sz + 20); }
                }
            });
        },

        _drawMesh: function(ctx, mesh, p, scale) {
            mesh.f.forEach(f => {
                ctx.fillStyle = f[f.length-1];
                ctx.beginPath();
                f.slice(0, -1).forEach((vIdx, i) => {
                    let v = mesh.v[vIdx];
                    let sx = p.x + v.x * p.s * (scale); let sy = p.y - v.y * p.s * (scale);
                    if(i===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
                });
                ctx.fill();
            });
        },

        // =========================================================================
        // HUD E MANCHE 100% BLINDADO CONTRA ERRO DE RENDER
        // =========================================================================
        _drawHUD: function(ctx, w, h, now) {
            let cx = w/2, cy = h/2;

            ctx.shadowBlur = 10; ctx.shadowColor = '#0f0'; ctx.strokeStyle = "rgba(0, 255, 100, 0.9)"; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx-30, cy-10); ctx.lineTo(cx-30, cy+10); ctx.moveTo(cx-30, cy-10); ctx.lineTo(cx-15, cy-10); ctx.moveTo(cx-30, cy+10); ctx.lineTo(cx-15, cy+10);
            ctx.moveTo(cx+30, cy-10); ctx.lineTo(cx+30, cy+10); ctx.moveTo(cx+30, cy-10); ctx.lineTo(cx+15, cy-10); ctx.moveTo(cx+30, cy+10); ctx.lineTo(cx+15, cy+10);
            ctx.stroke(); ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;

            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll);
            ctx.beginPath(); ctx.rect(-w/2, -h/2, w, h); ctx.clip();
            let pDeg = (this.ship.pitch * 180 / Math.PI);
            for(let i=-90; i<=90; i+=10) {
                if(i===0) continue;
                let y = (pDeg - i) * (h * 0.01);
                if(Math.abs(y) > h*0.4) continue;
                ctx.beginPath(); if(i<0) ctx.setLineDash([10,10]); else ctx.setLineDash([]);
                ctx.moveTo(-w*0.15, y); ctx.lineTo(-w*0.05, y); ctx.moveTo(w*0.15, y); ctx.lineTo(w*0.05, y); ctx.stroke();
                ctx.setLineDash([]); ctx.fillStyle = "rgba(0, 255, 100, 0.8)"; ctx.font = "bold 12px 'Chakra Petch'";
                ctx.textAlign='left'; ctx.fillText(Math.abs(i), -w*0.15 + 5, y+4);
                ctx.textAlign='right'; ctx.fillText(Math.abs(i), w*0.15 - 5, y+4);
            }
            ctx.restore();

            // MANCHE F-22 (USANDO FORMAS BÁSICAS IMPOSSÍVEIS DE DAR CRASH)
            ctx.save();
            let yokeOffset = (isNaN(this.pilot.trgPitch) ? 0 : this.pilot.trgPitch) * 100;
            ctx.translate(cx, h + 20 + yokeOffset);
            ctx.rotate((isNaN(this.pilot.trgRoll) ? 0 : this.pilot.trgRoll) * 0.8);

            ctx.fillStyle = '#1a1c20'; ctx.fillRect(-25, -150, 50, 150); ctx.strokeStyle = '#000'; ctx.strokeRect(-25, -150, 50, 150); // Base
            ctx.fillStyle = '#2a2d34'; ctx.fillRect(-140, -100, 280, 40); ctx.strokeRect(-140, -100, 280, 40); // Barra Horizontal
            
            // Grip Esquerdo
            ctx.fillStyle = '#222'; ctx.fillRect(-160, -160, 45, 120); ctx.strokeStyle = '#555'; ctx.strokeRect(-160, -160, 45, 120);
            ctx.fillStyle = '#e74c3c'; ctx.fillRect(-145, -140, 20, 15); // Gatilho
            ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(-135, -110, 6, 0, 7); ctx.fill(); // Botão

            // Grip Direito
            ctx.fillStyle = '#222'; ctx.fillRect(115, -160, 45, 120); ctx.strokeRect(115, -160, 45, 120);
            ctx.fillStyle = '#e74c3c'; ctx.fillRect(125, -140, 20, 15); // Gatilho
            ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(135, -110, 6, 0, 7); ctx.fill(); // Botão

            ctx.restore();

            // INFOS TELA
            ctx.fillStyle = "#0f6"; ctx.font = "bold 18px 'Russo One'"; ctx.textAlign = "left";
            ctx.fillText(`VEL: ${Math.floor(this.ship.speed)} KNTS`, 20, 40);
            ctx.fillText(`ALT: ${Math.floor(this.ship.y)} FT`, 20, 65);
            ctx.textAlign = "right"; ctx.fillStyle = this.ship.hp > 30 ? "#0f6" : "#f00";
            ctx.fillText(`HP: ${Math.floor(this.ship.hp)}%`, w - 20, 40);
            ctx.fillStyle = "#f1c40f"; ctx.fillText(`R$ ${window.Profile?.coins || 0}`, w - 20, 65);
            ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; ctx.fillText(`ABATES: ${this.session.kills} / ${this.session.goal}`, w - 20, 85);

            // BARRAS INFERIORES
            const bX = cx + 80, bY = h - 60, cW = w * 0.25;
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bX, bY, cW, 10); ctx.fillRect(bX, bY + 15, cW, 10);
            ctx.fillStyle = '#3498db'; ctx.fillRect(bX, bY, cW * (Math.max(0, this.ship.boost)/100), 10);
            ctx.fillStyle = this.combat.isJammed ? '#e74c3c' : '#e67e22'; ctx.fillRect(bX, bY + 15, cW * (Math.max(0, this.ship.overheat)/100), 10);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.font = 'bold 10px Arial';
            ctx.fillText("MOTOR", bX - 10, bY + 9); ctx.fillText("CANHÃO", bX - 10, bY + 24);

            ctx.textAlign = 'center';
            if(this.combat.locked) {
                ctx.fillStyle = '#f03'; ctx.font = "bold 24px 'Russo One'"; ctx.fillText("FOGO AUTORIZADO!", cx, h*0.65);
                if(this.combat.missileCd <= 0) { ctx.fillStyle = '#0ff'; ctx.font = "bold 14px Arial"; ctx.fillText("INCLINE A CABEÇA P/ MÍSSIL", cx, h*0.7); }
            }
            if(this.combat.isJammed) { ctx.fillStyle = '#f00'; ctx.font = "bold 24px 'Russo One'"; ctx.fillText("ARMA SOBREAQUECIDA!", cx, h*0.60); }
            if(!this.pilot.active) {
                ctx.fillStyle = "rgba(255, 0, 0, 0.6)"; ctx.fillRect(0, cy-30, w, 60); ctx.fillStyle = "#fff"; ctx.font = "bold 25px Arial"; ctx.fillText("MÃOS FORA DA CÂMERA", cx, cy+10);
            }
        },

        // =========================================================================
        // TELAS DE FLUXO (Lobby, Hangar, End)
        // =========================================================================
        _drawLobby: function(ctx, w, h) {
            ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#2ecc71"; ctx.font = "bold 40px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("ESQUADRÃO TÁTICO", w/2, h*0.2);
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; let py = h*0.4;
            ctx.fillText("PILOTOS CONECTADOS:", w/2, py); py += 40;
            for(let id in this.net.players) {
                let p = this.net.players[id]; ctx.fillStyle = p.ready ? "#2ecc71" : "#e74c3c";
                ctx.fillText(`${p.name} - ${p.ready ? 'PRONTO' : 'ESPERANDO'}`, w/2, py); py += 35;
            }
            let bColor = this.net.isReady ? "#e67e22" : "#27ae60"; if(this.net.isHost) bColor = "#c0392b";
            ctx.fillStyle = bColor; ctx.fillRect(w/2 - 150, h*0.8, 300, 60);
            ctx.fillStyle = "#fff"; ctx.font = "bold 25px 'Russo One'";
            ctx.fillText(this.net.isHost ? "IR PARA O HANGAR" : (this.net.isReady ? "AGUARDANDO HOST" : "FICAR PRONTO"), w/2, h*0.8 + 40);
        },

        _getHangarItems: function(w, h) {
            return [
                { id: 'engine', name: 'MOTOR TURBO', cost: this.upgrades.engine * 500, lvl: this.upgrades.engine, max: 5, y: h*0.3 },
                { id: 'radar', name: 'RADAR ALCANCE', cost: this.upgrades.radar * 400, lvl: this.upgrades.radar, max: 5, y: h*0.42 },
                { id: 'missile', name: 'MÍSSEIS GUIADOS', cost: this.upgrades.missile * 600, lvl: this.upgrades.missile, max: 5, y: h*0.54 },
                { id: 'thermal', name: 'CANHÃO RESFRIADO', cost: this.upgrades.thermal * 300, lvl: this.upgrades.thermal, max: 5, y: h*0.66 },
                { id: 'start', name: (this.mode === 'SINGLE' || this.net.isHost) ? '>> INICIAR VOO <<' : '>> AGUARDANDO HOST <<', cost: 0, lvl: 0, max: 0, y: h*0.85, isBtn: true }
            ];
        },

        _drawHangar: function(ctx, w, h, dt) {
            ctx.fillStyle = 'rgba(15, 20, 25, 0.98)'; ctx.fillRect(0, 0, w, h);
            const fz = Math.min(w * 0.04, 20);
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'center'; ctx.font = `bold ${fz*1.5}px "Russo One"`; ctx.fillText('HANGAR - UPGRADES', w/2, h*0.1);
            ctx.fillStyle = '#2ecc71'; ctx.fillText(`SALDO: R$ ${window.Profile?.coins || 0}`, w/2, h*0.18);
            
            const items = this._getHangarItems(w, h);
            let isHoveringAny = false;
            
            items.forEach(item => {
                let rect = { x: w*0.1, y: item.y - h*0.04, w: w*0.8, h: h*0.08 };
                ctx.fillStyle = '#2c3e50'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
                let hx = this.pilot.wristR.x, hy = this.pilot.wristR.y;
                if (this.pilot.active && hx > rect.x && hx < rect.x + rect.w && hy > rect.y && hy < rect.y + rect.h) {
                    ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 3; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
                    isHoveringAny = true; 
                    if (this.hoveredItem !== item.id) { this.hoveredItem = item.id; this.hoverTime = 0; }
                    this.hoverTime += dt; 
                    ctx.fillStyle = 'rgba(0, 255, 204, 0.3)'; ctx.fillRect(rect.x, rect.y, rect.w * Math.min(1, this.hoverTime / 1.5), rect.h);
                    if (this.hoverTime >= 1.5) { this._buyItem(item); this.hoverTime = 0; }
                }
                ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `bold ${fz}px Arial`;
                if (item.isBtn) { 
                    ctx.textAlign = 'center'; ctx.fillStyle = '#e74c3c'; ctx.fillText(item.name, w/2, item.y + fz*0.3); 
                } else { 
                    ctx.fillText(`${item.name} (LVL ${item.lvl}/${item.max})`, rect.x + 20, item.y + fz*0.3); ctx.textAlign = 'right'; 
                    let myCoins = window.Profile?.coins || 0;
                    ctx.fillStyle = (myCoins >= item.cost && item.lvl < item.max) ? '#f1c40f' : '#7f8c8d'; 
                    ctx.fillText(item.lvl >= item.max ? 'MÁXIMO' : `R$ ${item.cost}`, rect.x + rect.w - 20, item.y + fz*0.3); 
                }
            });
            if (!isHoveringAny) this.hoverTime = 0;
            if (this.pilot.active) { ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(this.pilot.wristR.x, this.pilot.wristR.y, 15, 0, 7); ctx.fill(); }
        },

        _buyItem: function(item) {
            if(item.isBtn) {
                if(this.mode === 'SINGLE' || this.net.isHost) {
                    if(this.mode !== 'SINGLE') this.net.sessionRef?.child('state').set('CALIBRATION').catch(()=>{});
                    this.state = 'CALIBRATION'; this.timer = 4;
                    if(window.Sfx) window.Sfx.play(1000, 'sine', 0.2);
                }
            } else if (window.Profile && (window.Profile.coins || 0) >= item.cost && this.upgrades[item.id] < item.max) {
                window.Profile.coins -= item.cost; this.upgrades[item.id]++; window.Profile.flightUpgrades = this.upgrades;
                if(window.System && window.System.playerId && window.DB) {
                    window.DB.ref(`users/${window.System.playerId}/coins`).set(window.Profile.coins).catch(()=>{});
                    window.DB.ref(`users/${window.System.playerId}/flightUpgrades`).set(this.upgrades).catch(()=>{});
                }
                if(window.Sfx) window.Sfx.play(1500, 'sine', 0.1);
            } else { if(window.Sfx) window.Sfx.play(300, 'square', 0.2); }
        },

        _drawCalib: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#0f6"; ctx.font = "bold 30px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("CALIBRANDO SISTEMAS", w/2, h*0.3);
            ctx.fillStyle = "#fff"; ctx.font = "20px Arial"; ctx.fillText("POSICIONE AS MÃOS À FRENTE", w/2, h*0.5);
            ctx.strokeStyle = "#0f6"; ctx.strokeRect(w*0.2, h*0.7, w*0.6, 20);
            
            // Proteção matemática final da barra
            let pct = 1 - ((isNaN(this.timer) ? 4 : this.timer) / 4);
            ctx.fillStyle = "#0f6"; ctx.fillRect(w*0.2, h*0.7, (w*0.6) * Math.max(0, Math.min(1, pct)), 20);
        },

        _drawEnd: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = this.state === 'VICTORY' ? "#2ecc71" : "#e74c3c";
            ctx.font = "bold 50px 'Russo One'"; ctx.textAlign = "center"; ctx.fillText(this.state === 'VICTORY' ? "MISSÃO CUMPRIDA" : "CAÇA ABATIDO", w/2, h/2);
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.fillText(`INIMIGOS DESTRUÍDOS: ${this.session.kills}`, w/2, h/2 + 50);
        },

        cleanup: function() {
            window.removeEventListener('pointerdown', this._handleClick);
            if(this.net.sessionRef) {
                try {
                    this.net.playersRef?.off();
                    this.net.sessionRef.child('state')?.off();
                    this.net.playersRef.child(this.net.uid)?.remove();
                } catch(e) {}
            }
        }
    };

    // ID DO JOGO CONFIRMADO: usarmy_flight_sim
    const register = () => {
        if (window.System?.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '🚀', Game, {
                camera: 'user',
                phases: [
                    { id: 'single', name: 'CAMPANHA SOLO', desc: 'Destrua alvos para ganhar R$.', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'ESQUADRÃO CO-OP', desc: 'Jogue junto com seus amigos.', mode: 'COOP', reqLvl: 1 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Combate aéreo entre jogadores.', mode: 'PVP', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };
    if (!register()) { const c = setInterval(() => { if (register()) clearInterval(c); }, 100); }
})();