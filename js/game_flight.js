// =============================================================================
// AERO STRIKE SIMULATOR: BRAZILIAN ARMED FORCES EDITION (V_FINAL_PLATINUM)
// ENGINE: PS1-Style 3D Engine, HUD Tapes (Risquinhos), Perfect Absolute Physics
// =============================================================================
(function() {
    "use strict";

    // --- MOTOR 3D REALISTA (RENDERIZAÇÃO DE POLÍGONOS) ---
    const Math3D = {
        fov: 600,
        // Aplica as rotações 3D (Roll, Pitch, Yaw) num vértice
        rotate: (x, y, z, pitch, yaw, roll) => {
            // Roll (Z)
            let cr = Math.cos(roll), sr = Math.sin(roll);
            let x1 = x * cr - y * sr, y1 = x * sr + y * cr, z1 = z;
            // Pitch (X)
            let cp = Math.cos(pitch), sp = Math.sin(pitch);
            let x2 = x1, y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;
            // Yaw (Y)
            let cy = Math.cos(yaw), sy = Math.sin(yaw);
            return { x: x2 * cy + z2 * sy, y: y2, z: -x2 * sy + z2 * cy };
        },
        // Projeta o 3D na Tela 2D
        project: (x, y, z, cam, w, h) => {
            let dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
            
            // Inverter Yaw e Pitch da Câmera para rotacionar o mundo ao redor do jogador
            let cy = Math.cos(-cam.yaw), sy = Math.sin(-cam.yaw);
            let x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
            
            let cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
            let y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            
            if (z2 < 10) return { visible: false }; // Atrás da câmera
            
            let cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
            let finalX = x1 * cr - y2 * sr, finalY = x1 * sr + y2 * cr;
            
            let scale = Math3D.fov / z2;
            // No Canvas, Y cresce para baixo, por isso a subtração no eixo Y
            return { x: (w/2) + (finalX * scale), y: (h/2) - (finalY * scale), s: scale, z: z2, visible: true };
        }
    };

    // --- RENDERIZADOR DE MODELOS 3D (ADEUS CAIXAS QUADRADAS) ---
    const Models3D = {
        // Renderiza um Prédio/Caixa 3D
        drawBuilding: (ctx, bx, by, bz, bw, bh, bd, cam, w, h, baseColor) => {
            const v = [
                {x: bx-bw, y: by, z: bz-bd}, {x: bx+bw, y: by, z: bz-bd}, {x: bx+bw, y: by+bh, z: bz-bd}, {x: bx-bw, y: by+bh, z: bz-bd},
                {x: bx-bw, y: by, z: bz+bd}, {x: bx+bw, y: by, z: bz+bd}, {x: bx+bw, y: by+bh, z: bz+bd}, {x: bx-bw, y: by+bh, z: bz+bd}
            ];
            const faces = [
                { p: [0,1,2,3], c: baseColor }, // Frente
                { p: [1,5,6,2], c: Models3D.shade(baseColor, -20) }, // Direita
                { p: [4,0,3,7], c: Models3D.shade(baseColor, -40) }, // Esquerda
                { p: [3,2,6,7], c: Models3D.shade(baseColor, 20) }   // Topo
            ];
            Models3D.renderFaces(ctx, v, faces, cam, w, h, 0, 0, 0);
        },
        // Renderiza o Jato de Caça Stealth
        drawJet: (ctx, jx, jy, jz, yaw, cam, w, h) => {
            const scale = 50;
            const v = [
                {x: 0, y: 0, z: 20*scale},    // 0: Bico
                {x: -15*scale, y: 0, z: -10*scale}, // 1: Asa Esquerda
                {x: 15*scale, y: 0, z: -10*scale},  // 2: Asa Direita
                {x: 0, y: 5*scale, z: -10*scale},   // 3: Topo da Cauda
                {x: 0, y: -5*scale, z: -10*scale}   // 4: Fundo
            ];
            // Rotação local do Jato
            for(let i=0; i<v.length; i++) {
                let rot = Math3D.rotate(v[i].x, v[i].y, v[i].z, 0, yaw, 0);
                v[i].x = jx + rot.x; v[i].y = jy + rot.y; v[i].z = jz + rot.z;
            }
            const faces = [
                { p: [0,1,3], c: '#556' }, { p: [0,3,2], c: '#667' }, // Topo
                { p: [0,4,1], c: '#334' }, { p: [0,2,4], c: '#223' }, // Embaixo
                { p: [1,4,3], c: '#778' }, { p: [2,3,4], c: '#778' }  // Traseira
            ];
            Models3D.renderFaces(ctx, v, faces, cam, w, h, jx, jy, jz);
        },
        renderFaces: (ctx, vertices, faces, cam, w, h) => {
            let projected = [];
            for(let i=0; i<vertices.length; i++) {
                projected.push(Math3D.project(vertices[i].x, vertices[i].y, vertices[i].z, cam, w, h));
            }
            // Backface Culling & Z-Sorting
            let drawList = [];
            for(let f of faces) {
                let pts = f.p.map(idx => projected[idx]);
                if (pts.some(p => !p.visible)) continue;
                // Produto vetorial para ver se a face está virada pra câmera
                let v1x = pts[1].x - pts[0].x, v1y = pts[1].y - pts[0].y;
                let v2x = pts[2].x - pts[0].x, v2y = pts[2].y - pts[0].y;
                let cross = (v1x * v2y) - (v1y * v2x);
                if (cross > 0) { // Visível
                    let zAvg = pts.reduce((sum, p) => sum + p.z, 0) / pts.length;
                    drawList.push({pts, c: f.c, z: zAvg});
                }
            }
            drawList.sort((a, b) => b.z - a.z); // Pinta de trás pra frente
            
            for(let d of drawList) {
                ctx.fillStyle = d.c; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(d.pts[0].x, d.pts[0].y);
                for(let i=1; i<d.pts.length; i++) ctx.lineTo(d.pts[i].x, d.pts[i].y);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        },
        shade: (color, percent) => {
            let R = parseInt(color.substring(1,3),16), G = parseInt(color.substring(3,5),16), B = parseInt(color.substring(5,7),16);
            R = parseInt(R * (100 + percent) / 100); G = parseInt(G * (100 + percent) / 100); B = parseInt(B * (100 + percent) / 100);
            R = (R<255)?R:255; G = (G<255)?G:255; B = (B<255)?B:255;
            R = Math.round(R); G = Math.round(G); B = Math.round(B);
            let RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
            let GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
            let BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));
            return "#"+RR+GG+BB;
        }
    };

    // --- SONS ---
    const GameSfx = {
        play: function(type) {
            if (type === 'lock') window.Sfx?.play(1200, 'square', 0.1, 0.1);
            else if (type === 'vulcan') window.Sfx?.play(150, 'sawtooth', 0.05, 0.1);
            else if (type === 'missile') window.Sfx?.play(300, 'square', 1.0, 0.3);
            else if (type === 'boom') window.Sfx?.play(80, 'sawtooth', 0.5, 0.4);
        }
    };

    // --- CORE DO JOGO ---
    const Game = {
        state: 'INIT', lastTime: 0, mode: 'SINGLE',
        session: { kills: 0, cash: 0, goal: 30 },
        // A Navegação: y é altitude.
        ship: { hp: 100, speed: 800, x: 0, y: 5000, z: 0, pitch: 0, yaw: 0, roll: 0 },
        pilot: { active: false, targetRoll: 0, targetPitch: 0, headTilt: false },
        timer: 4.0,
        entities: [], bullets: [], missiles: [], fx: [], floaters: [],
        city: [], // Prédios da cidade
        combat: { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 },

        init: function(faseData) {
            this.lastTime = performance.now();
            this.session = { kills: 0, cash: 0, goal: 30 };
            this.ship = { hp: 100, speed: 800, x: 0, y: 5000, z: 0, pitch: 0, yaw: 0, roll: 0 };
            this.pilot = { active: false, targetRoll: 0, targetPitch: 0, headTilt: false };
            this.entities = []; this.bullets = []; this.missiles = []; this.fx = []; this.floaters = []; this.city = [];
            this.combat = { target: null, locked: false, lockTimer: 0, vulcanCd: 0, missileCd: 0 };
            
            // Gera uma Metrópole 3D de Prédios
            for(let i=0; i<150; i++) {
                this.city.push({
                    x: (Math.random()-0.5)*150000, z: (Math.random()-0.5)*150000,
                    w: 800 + Math.random()*1500, d: 800 + Math.random()*1500, h: 1000 + Math.random()*8000,
                    c: `#${Math.floor(Math.random()*3+3)}${Math.floor(Math.random()*3+3)}${Math.floor(Math.random()*3+3)}` // Tons de cinza
                });
            }

            this.state = 'CALIBRATION'; this.timer = 5.0;
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            const dt = Math.min((now - this.lastTime) / 1000, 0.05);
            this.lastTime = now;

            this._readPose(pose, w, h, dt);
            
            if (this.state === 'CALIBRATION') {
                this.timer -= dt; this._drawCalib(ctx, w, h);
                if (this.timer <= 0) this.state = 'PLAYING';
                return 0;
            }
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') {
                this._drawEnd(ctx, w, h); return this.session.cash;
            }

            // --- FÍSICA DE VOO ---
            // Vetor Direcional baseado no Yaw (Direção) e Pitch (Inclinação)
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch);
            let fY = Math.sin(this.ship.pitch); // Positivo = Subindo
            let fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            
            // Velocidade varia com o nariz: Mergulhar ganha velocidade.
            this.ship.speed -= (fY * 800 * dt);
            this.ship.speed = Math.max(400, Math.min(2500, this.ship.speed));

            let units = this.ship.speed * 15;
            this.ship.x += units * fX * dt; 
            this.ship.y += units * fY * dt; // Altitude aumenta se Pitch for Positivo
            this.ship.z += units * fZ * dt;
            
            // Restrição de Solo
            if (this.ship.y < 100) { 
                this.ship.y = 100; 
                if (this.ship.pitch < 0) { // Bateu de bico
                    this.ship.hp -= 15; window.Gfx?.shakeScreen(20); GameSfx.play('boom'); 
                    this.ship.pitch = 0.2; // Quica o bico pra cima
                }
            }

            this._processCombat(dt, w, h, now);
            this._spawnEnemies();
            this._updateEntities(dt, now);
            this._updateBullets(dt);
            this._updateMissiles(dt);
            
            if (this.ship.hp <= 0 && this.state !== 'GAMEOVER') this._endGame('GAMEOVER');

            this._draw(ctx, w, h);
            return this.session.cash + this.session.kills * 10;
        },

        cleanup: function() {},

        // =====================================================================
        // O CONTROLE PERFEITO: SEM INVERSÃO DE ESPELHO E COM USO DOS OMBROS
        // =====================================================================
        _readPose: function(pose, w, h, dt) {
            let trgRoll = 0, trgPitch = 0, inputDetected = false;
            this.pilot.headTilt = false;
            
            if (pose?.keypoints) {
                const kp = name => pose.keypoints.find(k => k.part === name || k.name === name);
                const rw = kp('right_wrist'), lw = kp('left_wrist');
                const rs = kp('right_shoulder'), ls = kp('left_shoulder');
                const rEar = kp('right_ear'), lEar = kp('left_ear');
                
                if (rEar?.score > 0.4 && lEar?.score > 0.4 && Math.abs(rEar.y - lEar.y) > 25) this.pilot.headTilt = true;
                
                if (rw?.score > 0.3 && lw?.score > 0.3 && rs?.score > 0.3 && ls?.score > 0.3) {
                    inputDetected = true;
                    
                    // Ordenamos as mãos pelo X bruto da imagem.
                    // A mão com MENOR X está do lado esquerdo da TELA.
                    // A mão com MAIOR X está do lado direito da TELA.
                    let hands = [{x: rw.x, y: rw.y}, {x: lw.x, y: lw.y}].sort((a,b) => a.x - b.x);
                    let leftScreenHand = hands[0];  
                    let rightScreenHand = hands[1]; 
                    
                    // --- DIREÇÃO (YAW/ROLL) ---
                    // Se o jogador abaixar a mão direita (como um volante), a mão direita da tela fica com Y MAIOR.
                    // leftScreenHand.y - rightScreenHand.y -> Se a mão direita desce, isso fica NEGATIVO.
                    // Avião rolando negativo (Roll < 0) = Virar para a Direita.
                    let rollDiff = (leftScreenHand.y - rightScreenHand.y) / 100;
                    trgRoll = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, rollDiff));
                    
                    // --- ALTITUDE (PITCH) ---
                    // Mãos ACIMA dos ombros (Y menor) = Subir (Pitch Positivo).
                    let avgShoulderY = (rs.y + ls.y) / 2;
                    let avgWristY = (leftScreenHand.y + rightScreenHand.y) / 2;
                    
                    // deltaY é negativo se as mãos estiverem muito altas (acima do ombro).
                    let deltaY = avgWristY - avgShoulderY; 
                    
                    if (deltaY < -20) {
                        trgPitch = 1.0; // Puxou o manche (SOBE)
                    } else if (deltaY > 60) {
                        trgPitch = -1.0; // Empurrou o manche para a barriga (DESCE)
                    } else {
                        trgPitch = 0; // Neutro
                    }
                }
            }
            
            if (inputDetected) {
                this.pilot.active = true;
                // Suavização do manche
                this.pilot.targetRoll += (trgRoll - this.pilot.targetRoll) * 10 * dt;
                this.pilot.targetPitch += (trgPitch - this.pilot.targetPitch) * 8 * dt;
                
                if (this.state === 'PLAYING') {
                    // Yaw (Curva) acompanha o Roll
                    // Roll negativo -> Curva Direita -> Yaw aumenta (Positivo)
                    this.ship.yaw -= this.pilot.targetRoll * 1.5 * dt;
                    this.ship.roll += (this.pilot.targetRoll - this.ship.roll) * 5 * dt;
                    this.ship.pitch += (this.pilot.targetPitch - this.ship.pitch) * 3 * dt;
                    
                    this.ship.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.ship.pitch));
                }
            } else {
                this.pilot.active = false;
                this.pilot.targetRoll *= 0.9; this.pilot.targetPitch *= 0.9; this.ship.roll *= 0.95; this.ship.pitch *= 0.95;
            }
            this.ship.pitch %= Math.PI * 2; this.ship.yaw %= Math.PI * 2;
        },

        // --- SISTEMA DE COMBATE (BALANCEADO) ---
        _processCombat: function(dt, w, h, now) {
            this.combat.target = null; this.combat.locked = false; let closestZ = Infinity;
            
            // Scanner central amplo
            for(let e of this.entities) {
                let p = Math3D.project(e.x, e.y, e.z, this.ship, w, h);
                if (p.visible && p.z > 500 && p.z < 80000 && Math.abs(p.x - w/2) < w*0.35 && Math.abs(p.y - h/2) < h*0.35 && p.z < closestZ) {
                    closestZ = p.z; this.combat.target = e;
                }
            }

            if (this.combat.target) {
                this.combat.lockTimer += dt;
                if (this.combat.lockTimer >= 0.4) {
                    if (!this.combat.locked) GameSfx.play('lock');
                    this.combat.locked = true; this.combat.lockTimer = 0.4;
                }
            } else {
                this.combat.lockTimer -= dt * 3; if (this.combat.lockTimer < 0) this.combat.lockTimer = 0;
            }

            // Atira vulcan apenas quando a trava está segura
            if (this.combat.locked && this.combat.target && now - this.combat.vulcanCd > 150) {
                this.combat.vulcanCd = now;
                let spd = this.ship.speed * 20 + 35000;
                let dx = this.combat.target.x - this.ship.x, dy = this.combat.target.y - this.ship.y, dz = this.combat.target.z - this.ship.z;
                let dist = Math.hypot(dx,dy,dz);
                this.bullets.push({ x: this.ship.x, y: this.ship.y-20, z: this.ship.z, vx: dx/dist*spd, vy: dy/dist*spd, vz: dz/dist*spd, isEnemy: false, life: 2.0 });
                GameSfx.play('vulcan');
            }

            // Míssil Homing (Inclinar a Cabeça)
            if (this.combat.missileCd > 0) this.combat.missileCd -= dt;
            if (this.combat.locked && this.pilot.headTilt && this.combat.missileCd <= 0) {
                this.combat.missileCd = 2.0;
                let mSpd = this.ship.speed * 15 + 10000;
                let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fY = Math.sin(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
                this.missiles.push({
                    x: this.ship.x, y: this.ship.y-50, z: this.ship.z,
                    vx: fX*mSpd, vy: fY*mSpd + 1000, vz: fZ*mSpd,
                    target: this.combat.target, life: 8, speed: mSpd
                });
                GameSfx.play('missile'); window.Gfx?.shakeScreen(5);
            }
        },

        _spawnEnemies: function() {
            if (this.entities.length >= 8 || Math.random() > 0.02) return;
            let dist = 40000 + Math.random()*20000, r = Math.random();
            let fX = Math.sin(this.ship.yaw) * Math.cos(this.ship.pitch), fZ = Math.cos(this.ship.yaw) * Math.cos(this.ship.pitch);
            let sx = this.ship.x + fX*dist + (Math.random()-0.5)*30000, sz = this.ship.z + fZ*dist + (Math.random()-0.5)*30000;
            
            if (r < 0.6) this.entities.push({ type: 'tank', x: sx, y: 0, z: sz, hp: 200, yaw: Math.random()*Math.PI*2 });
            else this.entities.push({ type: 'jet', x: sx, y: Math.max(2000, this.ship.y+(Math.random()-0.5)*8000), z: sz, vx: fX*1500, hp: 150, yaw: this.ship.yaw + Math.PI/2 });
        },

        _updateEntities: function(dt, now) {
            for (let e of this.entities) {
                e.x += (e.vx||0)*dt; e.y += (e.vy||0)*dt; e.z += (e.vz||0)*dt;
                if (e.type === 'jet') e.x += Math.sin(now*0.002)*1500*dt; // Jato faz curvas lentas
                if (e.type === 'tank') e.y = 0; 
                
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) > 120000) { e.hp = -1; continue; }
                
                // IA INIMIGA BALANCEADA (Atiram muito menos e mais devagar)
                if (Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z) < 20000 && Math.random() < 0.008) {
                    let bSpd = 12000; // Tiros bem mais lentos
                    let d = Math.hypot(e.x-this.ship.x, e.y-this.ship.y, e.z-this.ship.z);
                    this.bullets.push({ x: e.x, y: e.y, z: e.z, vx: -(e.x-this.ship.x)/d*bSpd, vy: -(e.y-this.ship.y)/d*bSpd, vz: -(e.z-this.ship.z)/d*bSpd, isEnemy: true, life: 5.0 });
                }
            }
            this.entities = this.entities.filter(e => e.hp > 0);
        },

        _updateBullets: function(dt) {
            for (let i = this.bullets.length-1; i >= 0; i--) {
                let b = this.bullets[i];
                b.x += b.vx*dt; b.y += b.vy*dt; b.z += b.vz*dt; b.life -= dt;
                
                // Rastro do tiro
                this.fx.push({x:b.x, y:b.y, z:b.z, life:0.1, c: b.isEnemy?'#ff3300':'#ffff00', size: 300});

                if (b.isEnemy) {
                    if (Math.hypot(b.x-this.ship.x, b.y-this.ship.y, b.z-this.ship.z) < 800) { // Hitbox menor pro jogador
                        this.ship.hp -= 5; window.Gfx?.shakeScreen(5); this._fx(this.ship.x, this.ship.y, this.ship.z + 500, '#f00', 3, 150); GameSfx.play('boom');
                        b.life = 0;
                    }
                } else {
                    for (let e of this.entities) {
                        if (Math.hypot(b.x-e.x, b.y-e.y, b.z-e.z) < 3000) { // Hitbox grande para acertar o inimigo
                            e.hp -= 40; b.life = 0; this._fx(e.x,e.y,e.z,'#f90',3,150);
                            if (e.hp <= 0) this._kill(e, e.type==='tank'?200:300); break;
                        }
                    }
                    if (b.y < 0) { b.life = 0; this._fx(b.x,0,b.z,'#789',3,200); }
                }
                if (b.life <= 0) this.bullets.splice(i,1);
            }
        },

        _updateMissiles: function(dt) {
            for (let i = this.missiles.length-1; i >= 0; i--) {
                let m = this.missiles[i];
                m.speed += 25000 * dt; 
                if (m.target && m.target.hp>0) {
                    let dx = m.target.x - m.x, dy = m.target.y - m.y, dz = m.target.z - m.z;
                    let d = Math.hypot(dx,dy,dz);
                    let turn = 90000 * dt; 
                    m.vx += (dx/d)*turn; m.vy += (dy/d)*turn; m.vz += (dz/d)*turn;
                    let velD = Math.hypot(m.vx, m.vy, m.vz);
                    if(velD > m.speed) { m.vx = (m.vx/velD)*m.speed; m.vy = (m.vy/velD)*m.speed; m.vz = (m.vz/velD)*m.speed; }
                    
                    if (d < 3500) {
                        m.target.hp -= 500; if (m.target.hp <= 0) this._kill(m.target, 300);
                        m.life = 0; GameSfx.play('boom'); window.Gfx?.shakeScreen(5);
                    }
                }
                m.x += m.vx*dt; m.y += m.vy*dt; m.z += m.vz*dt; m.life -= dt;
                if(m.y < 0) { m.life = 0; this._fx(m.x,0,m.z,'#a55',10,300); }
                
                // Fumaça Teleguiada Realista
                this.fx.push({x:m.x, y:m.y, z:m.z, life: 1.5, c:'rgba(200,200,200,0.5)', size: 500}); 
                if (m.life <= 0) this.missiles.splice(i,1);
            }
        },

        _kill: function(t, rew) {
            GameSfx.play('boom');
            this._fx(t.x,t.y,t.z,'#ff3300', 40, 600); this._fx(t.x,t.y,t.z,'#222233', 30, 900);
            this.floaters.push({x:t.x, y:t.y+1000, z:t.z, text:`+ R$${rew}`, life:2.0});
            this.session.kills++; this.session.cash += rew;
            if (this.session.kills >= this.session.goal) this._endGame('VICTORY');
        },

        _endGame: function(res) {
            this.state = res; 
            setTimeout(() => {
                if (window.System?.gameOver) window.System.gameOver(this.session.kills*150, res==='VICTORY', this.session.cash);
                else if (window.System?.home) window.System.home();
            }, 3000);
        },

        _fx: function(x,y,z,c,n,s) {
            for(let i=0;i<n;i++) this.fx.push({x,y,z,vx:(Math.random()-0.5)*15000,vy:(Math.random()-0.5)*15000,vz:(Math.random()-0.5)*15000,life:1+Math.random(),c,size:s+Math.random()*400});
        },

        // =====================================================================
        // O VISUAL PLATINUM (PRÉDIOS, MODELOS 3D E HUD DE RISQUINHOS)
        // =====================================================================
        _draw: function(ctx, w, h) {
            ctx.save();
            if (window.Gfx?.shake > 0.5) ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            
            // 1. Céu e Chão
            let hy = h/2 + Math.sin(this.ship.pitch) * h * 1.5;
            let sky = ctx.createLinearGradient(0,0,0,hy); sky.addColorStop(0, '#0a3d62'); sky.addColorStop(1, '#82ccdd');
            ctx.fillStyle = sky; ctx.fillRect(0,0,w,h);
            
            // Desenha a cidade no chão se estiver baixo
            if (this.ship.y < 80000) {
                // Fundo de asfalto/cidade
                let gnd = ctx.createLinearGradient(0,hy,0,h); gnd.addColorStop(0, '#2d3436'); gnd.addColorStop(1, '#636e72');
                ctx.fillStyle = gnd;
                
                // Rotacionar o mundo pelo Roll
                ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(-this.ship.roll); ctx.translate(-w/2, -h/2);
                ctx.fillRect(-w*2, hy, w*5, h*4);
                
                // Renderizar Prédios 3D
                for(let b of this.city) {
                    // Culling simples de repetição infinita
                    if (Math.hypot(b.x-this.ship.x, b.z-this.ship.z) > 100000) {
                        let fX = Math.sin(this.ship.yaw), fZ = Math.cos(this.ship.yaw);
                        b.x = this.ship.x + fX*80000 + (Math.random()-0.5)*60000;
                        b.z = this.ship.z + fZ*80000 + (Math.random()-0.5)*60000;
                    }
                    Models3D.drawBuilding(ctx, b.x, 0, b.z, b.w, b.h, b.d, this.ship, w, h, b.c);
                }
                ctx.restore();
            }

            // 2. Entidades 3D e Partículas
            let buf=[];
            this.fx.forEach(o => { let p = Math3D.project(o.x,o.y,o.z,this.ship,w,h); if(p.visible) buf.push({p, t:'f', o}); });
            this.bullets.forEach(o => { let p = Math3D.project(o.x,o.y,o.z,this.ship,w,h); if(p.visible) buf.push({p, t:'b', o}); });
            this.floaters.forEach(o => { let p = Math3D.project(o.x,o.y,o.z,this.ship,w,h); if(p.visible) buf.push({p, t:'x', o}); });
            this.entities.forEach(o => { let p = Math3D.project(o.x,o.y,o.z,this.ship,w,h); if(p.visible) buf.push({p, t:'e', o}); });
            
            buf.sort((a,b)=>b.p.z-a.p.z); // Z-Buffer
            
            buf.forEach(d => {
                let p=d.p, s=p.s, o=d.o;
                if(d.t==='e') {
                    if (o.type === 'jet') Models3D.drawJet(ctx, o.x, o.y, o.z, o.yaw, this.ship, w, h);
                    else Models3D.drawBuilding(ctx, o.x, 0, o.z, 1500, 1000, 1500, this.ship, w, h, '#d35400'); // Tanque simplificado 3D

                    let locked = this.combat.target === o;
                    if (locked) {
                        let bs = Math.max(30, 400*s);
                        ctx.strokeStyle = '#f03'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, bs, 0, Math.PI*2); ctx.stroke();
                        ctx.fillStyle = '#f03'; ctx.font = `bold ${Math.max(12, w*0.02)}px Arial`; ctx.textAlign = 'center'; 
                        ctx.fillText('TRAVADO', p.x, p.y + bs + 15);
                    }
                }
                else if(d.t==='b') {
                    ctx.fillStyle = o.isEnemy ? '#ff3300' : '#ffff00';
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, 20*s), 0, Math.PI*2); ctx.fill();
                }
                else if(d.t==='f') { 
                    ctx.globalAlpha = Math.max(0, o.life); ctx.fillStyle = o.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, o.size*s), 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1; 
                }
                else if(d.t==='x') {
                    ctx.fillStyle='#f1c40f'; ctx.font=`bold ${Math.max(14, 3000*s)}px Arial`; ctx.textAlign='center'; 
                    ctx.fillText(o.text, p.x, p.y);
                }
            });

            // 3. HUD DE AVIAÇÃO REAL (Risquinhos)
            this._drawHUD(ctx, w, h);

            ctx.restore();
            // Scanline Overlay
            ctx.fillStyle='rgba(0,255,100,0.03)'; for(let i=0;i<h;i+=4) ctx.fillRect(0,i,w,1);
        },

        _drawHUD: function(ctx, w, h) {
            let cx = w/2, cy = h/2;
            const fz = Math.max(12, Math.min(w * 0.035, 20)); 
            ctx.strokeStyle = '#0f0'; ctx.fillStyle = '#0f0'; ctx.lineWidth = 2; ctx.font = `bold ${fz}px 'Chakra Petch', Arial`;

            // --- PITCH LADDER (Centro Girando) ---
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(-this.ship.roll);
            // Move a escada pra cima e pra baixo de acordo com o Pitch
            let pitchPixels = this.ship.pitch * 500; 
            ctx.translate(0, pitchPixels);
            
            // Desenha as linhas de 10 em 10 graus
            for(let i = -90; i <= 90; i += 10) {
                if(i === 0) { // Linha do Horizonte
                    ctx.beginPath(); ctx.moveTo(-100, 0); ctx.lineTo(100, 0); ctx.stroke();
                } else {
                    let yPos = -i * 10; // Espaçamento
                    if(Math.abs(yPos + pitchPixels) < h/2.5) { // Só desenha o que está visível
                        ctx.setLineDash(i < 0 ? [5, 5] : []); // Tracejado se estiver mergulhando
                        ctx.beginPath(); ctx.moveTo(-60, yPos); ctx.lineTo(-20, yPos); ctx.lineTo(-20, yPos + (i>0?5:-5)); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(60, yPos); ctx.lineTo(20, yPos); ctx.lineTo(20, yPos + (i>0?5:-5)); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.textAlign = 'right'; ctx.fillText(Math.abs(i), -65, yPos + 5);
                        ctx.textAlign = 'left'; ctx.fillText(Math.abs(i), 65, yPos + 5);
                    }
                }
            }
            ctx.restore();

            // MIRA FIXA NO CENTRO DA TELA
            ctx.beginPath(); ctx.moveTo(cx-20, cy); ctx.lineTo(cx-5, cy); ctx.moveTo(cx+20, cy); ctx.lineTo(cx+5, cy);
            ctx.moveTo(cx, cy-20); ctx.lineTo(cx, cy-5); ctx.moveTo(cx, cy+20); ctx.lineTo(cx, cy+5); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill();

            // --- FITAS (RISQUINHOS LATERAL) ---
            let tapeH = h * 0.5, tapeW = w * 0.12;
            
            // Fita ESQUERDA (Velocidade)
            ctx.save(); ctx.beginPath(); ctx.rect(10, cy - tapeH/2, tapeW, tapeH); ctx.clip();
            ctx.fillStyle = 'rgba(0,50,0,0.5)'; ctx.fillRect(10, cy - tapeH/2, tapeW, tapeH);
            let spdOff = this.ship.speed % 100;
            for(let i = -3; i <= 3; i++) {
                let val = Math.floor(this.ship.speed / 100) * 100 + (i * 100);
                let yPos = cy - (i * 40) + (spdOff / 100 * 40);
                ctx.beginPath(); ctx.moveTo(10 + tapeW, yPos); ctx.lineTo(10 + tapeW - 15, yPos); ctx.stroke();
                ctx.textAlign = 'right'; ctx.fillStyle = '#0f0'; ctx.fillText(val, 10 + tapeW - 20, yPos + 5);
            }
            ctx.restore();
            // Caixa Valor Atual SPD
            ctx.fillStyle = '#000'; ctx.fillRect(10, cy - 15, tapeW, 30); ctx.strokeRect(10, cy - 15, tapeW, 30);
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(Math.floor(this.ship.speed), 10 + tapeW/2, cy + 5);
            ctx.fillText("SPD", 10 + tapeW/2, cy - tapeH/2 - 10);

            // Fita DIREITA (Altitude)
            let rx = w - tapeW - 10;
            ctx.save(); ctx.beginPath(); ctx.rect(rx, cy - tapeH/2, tapeW, tapeH); ctx.clip();
            ctx.fillStyle = 'rgba(0,50,0,0.5)'; ctx.fillRect(rx, cy - tapeH/2, tapeW, tapeH);
            let altOff = this.ship.y % 500;
            for(let i = -3; i <= 3; i++) {
                let val = Math.floor(this.ship.y / 500) * 500 + (i * 500);
                let yPos = cy + (i * 40) - (altOff / 500 * 40);
                ctx.beginPath(); ctx.moveTo(rx, yPos); ctx.lineTo(rx + 15, yPos); ctx.stroke();
                ctx.textAlign = 'left'; ctx.fillStyle = '#0f0'; ctx.fillText(val, rx + 20, yPos + 5);
            }
            ctx.restore();
            // Caixa Valor Atual ALT
            ctx.fillStyle = '#000'; ctx.fillRect(rx, cy - 15, tapeW, 30); ctx.strokeRect(rx, cy - 15, tapeW, 30);
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(Math.floor(this.ship.y), rx + tapeW/2, cy + 5);
            ctx.fillText("ALT", rx + tapeW/2, cy - tapeH/2 - 10);

            // --- MENSAGENS E INTEGRIDADE ---
            ctx.fillStyle = this.ship.hp > 30 ? '#2ecc71' : '#e74c3c'; ctx.textAlign = 'left'; ctx.font = `bold ${fz}px Arial`;
            ctx.fillText(`INTEGRIDADE: ${Math.floor(this.ship.hp)}%`, 10, h - 20);
            
            ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'right';
            ctx.fillText(`SALDO: R$ ${this.session.cash}`, w - 10, h - 20);
            
            ctx.textAlign = 'center';
            if (this.combat.target && this.combat.locked) {
                ctx.fillStyle = '#f03'; ctx.font = `bold ${fz * 1.5}px 'Russo One'`;
                ctx.fillText("ALVO TRAVADO - ATIRANDO!", cx, h * 0.8);
                if (this.combat.missileCd <= 0) {
                    ctx.fillStyle = '#0ff'; ctx.font = `bold ${fz}px Arial`;
                    ctx.fillText("INCLINE CABEÇA P/ LANÇAR MÍSSIL", cx, h * 0.85);
                }
            } else {
                ctx.fillStyle = '#0f0'; ctx.font = `bold ${fz}px Arial`;
                ctx.fillText("SISTEMAS ONLINE", cx, h * 0.85);
            }

            if (!this.pilot.active) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(0, cy - 30, w, 60);
                ctx.fillStyle = '#f00'; ctx.font = `bold ${fz * 1.5}px Arial`; ctx.textAlign = 'center';
                ctx.fillText("PILOTO NÃO DETECTADO NA CÂMERA", cx, cy + fz*0.5);
            }
        },
        
        _drawCalib: function(ctx,w,h){
            ctx.fillStyle='rgba(0,20,0,0.95)';ctx.fillRect(0,0,w,h);
            const fz = Math.min(w * 0.045, 20);
            ctx.fillStyle='#0f0';ctx.textAlign='center';ctx.font=`bold ${fz*1.5}px "Russo One"`;
            ctx.fillText('INICIANDO SISTEMAS DO CAÇA', w/2, h*0.3);
            
            ctx.fillStyle='#fff';ctx.font=`bold ${fz}px Arial`;
            ctx.fillText('FIQUE EM PÉ E AFASTE-SE DA CÂMERA', w/2, h*0.45);
            
            ctx.fillStyle='#0ff';
            ctx.fillText('CONTROLES FÍSICOS REAIS:', w/2, h*0.55);
            ctx.fillStyle='#f1c40f';
            ctx.fillText('1. GIRE COMO UM VOLANTE PARA VIRAR', w/2, h*0.62);
            ctx.fillText('2. LEVANTE MÃOS ACIMA DO OMBRO PARA SUBIR', w/2, h*0.68);
            ctx.fillText('3. DESÇA MÃOS PARA BARRIGA PARA MERGULHAR', w/2, h*0.74);
            
            let pct = 1 - this.timer/5;
            ctx.fillStyle='#111';ctx.fillRect(w*0.2,h*0.85,w*0.6,15);
            ctx.fillStyle='#0f0';ctx.fillRect(w*0.2,h*0.85,(w*0.6)*pct,15);
        },

        _drawEnd: function(ctx,w,h){
            this._draw(ctx,w,h);
            ctx.fillStyle='rgba(0,0,0,0.9)';ctx.fillRect(0,0,w,h);
            const fz = Math.min(w * 0.06, 35);
            ctx.textAlign='center';ctx.font=`bold ${fz}px "Russo One"`;
            ctx.fillStyle=this.state==='VICTORY'?'#2ecc71':'#e74c3c';
            ctx.fillText(this.state==='VICTORY'?'MISSÃO CUMPRIDA':'ABATIDO EM COMBATE', w/2, h/2 - fz);
            
            ctx.fillStyle='#f1c40f';ctx.font=`bold ${fz*0.6}px Arial`;
            ctx.fillText(`PAGAMENTO: R$ ${this.session.cash}`, w/2, h/2 + fz);
            ctx.fillStyle='#fff';
            ctx.fillText(`ABATES: ${this.session.kills}`, w/2, h/2 + fz*2);
        }
    };

    const register = () => {
        if (window.System?.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Simulador Militar', '✈️', Game, {
                camera: 'user',
                phases: [
                    { id: 'training', name: 'TREINO DE COMBATE', desc: 'HUD Profissional de Fita. Destrua jatos e a cidade.', mode: 'SINGLE', reqLvl: 1 }
                ]
            });
            return true;
        }
        return false;
    };

    if (!register()) { const check = setInterval(() => { if (register()) clearInterval(check); }, 100); }
})();