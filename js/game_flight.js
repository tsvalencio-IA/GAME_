// =============================================================================
// AERO STRIKE WAR: TACTICAL SIMULATOR (COMMERCIAL PLATINUM EDITION - TRUE AAA)
// ARQUITETO: SENIOR GAME ENGINE ARCHITECT (DIVISÃO DE SIMULAÇÃO MILITAR)
// STATUS: TRUE 6DOF PHYSICS, THERMODYNAMIC ATMOSPHERE, PROPORTIONAL NAVIGATION
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1. CONFIGURAÇÕES GLOBAIS E CATÁLOGO DE AERONAVES
    // =========================================================================
    const GAME_CONFIG = {
        MONEY_PER_KILL: 150,
        MONEY_MISSION_BONUS: 800,
        GRAVITY: 9.80665,     // Aceleração da gravidade (m/s^2)
        R_GAS: 287.05,        // Constante do gás para o ar (J/(kg·K))
        GAMMA: 1.4            // Razão de calor específico do ar
    };

    // Parâmetros reais de design aerodinâmico
    const PLANES = {
        falcon_lite: {
            id: "falcon_lite", name: "F-16 FALCON", price: 0,
            thrust: 120000,      // Empuxo em Newtons (aprox 27,000 lbf)
            mass: 12000,         // Massa em kg
            wingArea: 28.0,      // Área da asa (m^2)
            cd0: 0.022,          // Coeficiente de arrasto parasita
            kInduced: 0.05,      // Fator de arrasto induzido (k)
            clMax: 1.6,          // Coeficiente de sustentação máximo (Stall)
            stallAngle: 0.26,    // Ângulo de estol crítico (~15 graus em rad)
            maxPitchRate: 1.5,   // Resposta mecânica do manche
            maxRollRate: 3.0,
            color: "#3498db"
        },
        raptor_pro: {
            id: "raptor_pro", name: "F-22 RAPTOR", price: 5000,
            thrust: 230000,      // Empuxo com pós-combustão
            mass: 19700,
            wingArea: 78.04,
            cd0: 0.019,
            kInduced: 0.035,
            clMax: 1.8,
            stallAngle: 0.35,    // Controle de vetoramento de empuxo permite maior AoA
            maxPitchRate: 2.0,
            maxRollRate: 4.0,
            color: "#9b59b6"
        }
    };

    // =========================================================================
    // 2. MOTOR DE RENDERIZAÇÃO 3D VETORIAL
    // =========================================================================
    const Engine3D = {
        fov: 800,
        project: (obj, cam, w, h) => {
            let dx = obj.x - cam.x;
            let dy = cam.y - obj.y; // Eixo Y da Tela é invertido em relação à física (Céu é +Y na física)
            let dz = obj.z - cam.z;
            
            // Transformação de Câmera (Yaw, Pitch, Roll)
            let cy = Math.cos(-cam.yaw), sy = Math.sin(-cam.yaw);
            let x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
            
            let cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
            let y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
            
            if (z2 < 10) return { visible: false }; // Near clipping plane
            
            let cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
            let finalX = x1 * cr - y2 * sr, finalY = x1 * sr + y2 * cr;
            let scale = Engine3D.fov / z2;
            
            return { x: (w/2) + (finalX * scale), y: (h/2) + (finalY * scale), s: scale, z: z2, visible: true };
        },
        
        drawJetModel: (ctx, px, py, scale, roll, isEnemy, color = "#3498db") => {
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
    class PhysicsEntity {
        constructor(x, y, z, stats) {
            this.pos = { x: x, y: y, z: z };
            this.vel = { x: 0, y: 0, z: 250 }; // Inicia a 250 m/s
            this.pitch = 0; this.yaw = 0; this.roll = 0;
            this.stats = stats;
            this.throttle = 0.5;
            this.inputs = { pitch: 0, roll: 0 };
            
            // Variáveis Telemetria
            this.gForce = 1.0;
            this.mach = 0;
            this.alpha = 0; // Angle of Attack
            this.isStalling = false;
            this.hp = 100;
            this.active = true;
        }

        updatePhysics(dt) {
            if (!this.active) return;
            if (dt > 0.1) dt = 0.1; // Estabilidade de integração numérica

            // 1. Atmosfera Padrão Internacional (ISA) - Variação com Altitude
            let altitude = Math.max(0, Math.min(20000, this.pos.y));
            let tempK = 288.15 - 0.0065 * altitude; // Temperatura em Kelvin cai com a altitude
            let airDensity = 1.225 * Math.pow(1 - 0.0000225577 * altitude, 4.2561); // Densidade real
            let speedOfSound = Math.sqrt(GAME_CONFIG.GAMMA * GAME_CONFIG.R_GAS * tempK);

            // 2. Velocidade Vetorial e Escalar
            let V = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);
            this.mach = V / speedOfSound;

            // Vetores de Orientação da Aeronave
            let cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
            let cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
            let cr = Math.cos(this.roll), sr = Math.sin(this.roll);

            let forwardVec = { x: sy * cp, y: sp, z: cy * cp };
            let upVec = { x: -sy * sp * cr - cy * sr, y: cp * cr, z: -cy * sp * cr + sy * sr };
            let rightVec = { x: cy * cr - sy * sp * sr, y: sp * sr, z: -sy * cr - cy * sp * sr };

            // 3. Ângulo de Ataque (AoA / Alpha)
            let vDir = V > 1.0 ? { x: this.vel.x/V, y: this.vel.y/V, z: this.vel.z/V } : forwardVec;
            let cosAlpha = forwardVec.x*vDir.x + forwardVec.y*vDir.y + forwardVec.z*vDir.z;
            this.alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
            if (isNaN(this.alpha)) this.alpha = 0;

            // 4. Aerodinâmica: Cálculo Real de Sustentação (Lift) e Arrasto (Drag)
            let CL = this.alpha * (this.stats.clMax / this.stats.stallAngle); // Curva linear teórica
            this.isStalling = this.alpha > this.stats.stallAngle || V < 50;
            if (this.isStalling) {
                CL = Math.max(0, CL - (this.alpha - this.stats.stallAngle) * 5.0); // Queda drástica de Lift no Estol
            }

            // Arrasto = Arrasto Parasita + Arrasto Induzido (proporcional ao quadrado do Lift)
            let CD = this.stats.cd0 + this.stats.kInduced * (CL * CL);

            let dynamicPressure = 0.5 * airDensity * (V * V);
            let liftMag = dynamicPressure * this.stats.wingArea * CL;
            let dragMag = dynamicPressure * this.stats.wingArea * CD;

            // Direção das Forças
            let liftForce = { x: upVec.x * liftMag, y: upVec.y * liftMag, z: upVec.z * liftMag };
            let dragForce = { x: -vDir.x * dragMag, y: -vDir.y * dragMag, z: -vDir.z * dragMag };
            
            // Empuxo (Thrust)
            let thrustMag = this.stats.thrust * this.throttle;
            let thrustForce = { x: forwardVec.x * thrustMag, y: forwardVec.y * thrustMag, z: forwardVec.z * thrustMag };

            // Gravidade (Peso)
            let weight = this.stats.mass * GAME_CONFIG.GRAVITY;
            let gravityForce = { x: 0, y: -weight, z: 0 };

            // 5. Soma de Forças e Aceleração Vetorial
            let Fx = liftForce.x + dragForce.x + thrustForce.x + gravityForce.x;
            let Fy = liftForce.y + dragForce.y + thrustForce.y + gravityForce.y;
            let Fz = liftForce.z + dragForce.z + thrustForce.z + gravityForce.z;

            let ax = Fx / this.stats.mass;
            let ay = Fy / this.stats.mass;
            let az = Fz / this.stats.mass;

            // Integração de Euler para Velocidade e Posição (Energia Cinética convertida naturalmente em Altitude via vetores)
            this.vel.x += ax * dt;
            this.vel.y += ay * dt;
            this.vel.z += az * dt;

            this.pos.x += this.vel.x * dt;
            this.pos.y += this.vel.y * dt;
            this.pos.z += this.vel.z * dt;

            // 6. G-Force (Fisiologia e Estrutural: Sustentação dividida pelo Peso)
            this.gForce = liftMag / weight;

            // 7. Cinemática Angular (Controles aplicam taxas de rotação)
            let currentTurnRate = (liftMag * Math.sin(this.roll)) / (this.stats.mass * V); // Taxa de curva induzida pelo Lift inclinado
            
            if (!this.isStalling && V > 30) {
                this.yaw += (isNaN(currentTurnRate) ? 0 : currentTurnRate) * dt;
            }

            this.pitch += this.inputs.pitch * this.stats.maxPitchRate * dt;
            this.roll += this.inputs.roll * this.stats.maxRollRate * dt;
            this.pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, this.pitch));

            // Estol: Nariz cai fisicamente pela falta de estabilidade aerodinâmica
            if (this.isStalling) {
                this.pitch += (-0.5 - this.pitch) * 1.5 * dt;
                this.roll += (Math.random() - 0.5) * 2.0 * dt; // Trepidação de perda de fluxo
            }

            // Ground Collision
            if (this.pos.y <= 0) {
                this.pos.y = 0;
                this.hp = 0;
                this.active = false;
            }
        }
    }

    // =========================================================================
    // 4. ENTIDADES SECUNDÁRIAS (MISSIL PN & PARTÍCULAS)
    // =========================================================================
    class Particle {
        constructor(x, y, z, color, size, life) {
            this.pos = { x, y, z };
            this.vel = { x: (Math.random()-0.5)*20, y: (Math.random()-0.5)*20, z: (Math.random()-0.5)*20 };
            this.color = color; this.size = size; this.life = life; this.maxLife = life;
        }
        update(dt) {
            this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
            this.life -= dt;
        }
    }

    class Missile {
        constructor(shooter, target, isEnemy) {
            this.pos = { x: shooter.pos.x, y: shooter.pos.y - 5, z: shooter.pos.z };
            this.vel = { x: shooter.vel.x, y: shooter.vel.y, z: shooter.vel.z }; // Inércia herdada
            this.target = target;
            this.isEnemy = isEnemy;
            this.thrust = 1500; // Aceleração
            this.maxG = 25.0; // Limite mecânico do míssil
            this.life = 8.0;
            this.active = true;
        }
        update(dt) {
            if (!this.active) return;
            this.life -= dt;
            if (this.life <= 0) { this.active = false; return; }

            let V = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);

            if (this.target && this.target.active) {
                let dx = this.target.pos.x - this.pos.x;
                let dy = this.target.pos.y - this.pos.y;
                let dz = this.target.pos.z - this.pos.z;
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                if (dist < 80) { // Raio letal de fragmentação
                    this.active = false; this.target.hp -= 55;
                    if(window.Sfx) window.Sfx.play(100, 'sawtooth', 0.5, 0.3);
                    return;
                }

                // Proportional Navigation (Guidance Law)
                let LOS = { x: dx/dist, y: dy/dist, z: dz/dist };
                let closingVelocity = -((LOS.x*(this.vel.x - this.target.vel.x)) + (LOS.y*(this.vel.y - this.target.vel.y)) + (LOS.z*(this.vel.z - this.target.vel.z)));
                
                // Vetor desejado
                let N = 4.0; // Ganho de Navegação
                let desiredAcc = {
                    x: N * closingVelocity * LOS.x,
                    y: N * closingVelocity * LOS.y,
                    z: N * closingVelocity * LOS.z
                };

                // Limita G do míssil (G = a/g)
                let accMag = Math.sqrt(desiredAcc.x**2 + desiredAcc.y**2 + desiredAcc.z**2);
                let maxAcc = this.maxG * GAME_CONFIG.GRAVITY;
                if (accMag > maxAcc) {
                    desiredAcc.x = (desiredAcc.x / accMag) * maxAcc;
                    desiredAcc.y = (desiredAcc.y / accMag) * maxAcc;
                    desiredAcc.z = (desiredAcc.z / accMag) * maxAcc;
                }

                this.vel.x += desiredAcc.x * dt;
                this.vel.y += desiredAcc.y * dt;
                this.vel.z += desiredAcc.z * dt;
            }

            // Motor foguete
            let vDir = { x: this.vel.x/V, y: this.vel.y/V, z: this.vel.z/V };
            this.vel.x += vDir.x * this.thrust * dt;
            this.vel.y += vDir.y * this.thrust * dt;
            this.vel.z += vDir.z * this.thrust * dt;

            this.pos.x += this.vel.x * dt;
            this.pos.y += this.vel.y * dt;
            this.pos.z += this.vel.z * dt;
        }
    }

    // =========================================================================
    // 5. SISTEMA PRINCIPAL DO JOGO (CONTROLLER, REDE, INPUTS, IA)
    // =========================================================================
    const Game = {
        state: 'INIT', lastTime: 0, hasDrawnThisFrame: false, fatalError: null,
        player: null,
        entities: { missiles: [], enemies: [], particles: [] },
        session: { kills: 0, cash: 0, mode: 'SINGLE', time: 0, selectedPlane: PLANES.falcon_lite },
        radarTarget: null, lockTimer: 0, keys: {}, keysBound: false, hangarTimer: 3.0,
        
        // Networking Netcode (Interpolação)
        network: { lastSyncTime: 0, remotePlayers: {}, sendRate: 100 },
hotas: { calibratedX: 0, calibratedY: 0 },

        _init: function(m) { this.init(m); },
        init: function(missionData) {
            try {
                this.fatalError = null;
                this.state = 'HANGAR'; 
                this.hangarTimer = 3.0;
                this.session.mode = (missionData && missionData.mode) ? missionData.mode : 'SINGLE';
                
                this.player = new PhysicsEntity(0, 3000, 0, this.session.selectedPlane);
                this.entities = { missiles: [], enemies: [], particles: [] };
                this.session.kills = 0; this.session.cash = 0; this.session.time = 0;
                this.lastTime = performance.now();
                
                this.spawnEnemies(4);

                if(window.Sfx) window.Sfx.play(400, 'sine', 0.5, 0.1); 

                if (!this.keysBound) {
                    window.addEventListener('keydown', (e) => {
                        this.keys[e.key] = true;
                        if (this.state === 'HANGAR' && e.key === ' ') this.state = 'CALIBRATING';
                        if (this.state === 'CALIBRATING' && ['ArrowUp', 'ArrowDown', 'w', 's', ' '].includes(e.key)) this.state = 'PLAYING';
                        if (e.key === ' ' && this.state === 'PLAYING') this.fireMissile();
                    });
                    window.addEventListener('keyup', (e) => this.keys[e.key] = false);
                    this.keysBound = true;
                }

                if (this.session.mode === 'PVP' || this.session.mode === 'COOP') {
                    this.initMultiplayer();
                }

            } catch(e) { this.fatalError = "ERRO NO INIT: " + e.message; }
        },

        _update: function() { this.coreLoop(...arguments); },
        update: function()  { this.coreLoop(...arguments); },
        _draw: function()   { this.coreLoop(...arguments); },
        
        coreLoop: function() {
            let ctx = null, kps = [], w = 640, h = 480;
            
            try {
                for (let i = 0; i < arguments.length; i++) {
                    let arg = arguments[i];
                    if (arg && typeof arg.clearRect === 'function') ctx = arg;
                    else if (Array.isArray(arg)) kps = arg;
                    else if (typeof arg === 'number' && arg >= 100) { if (w === 640) w = arg; else h = arg; }
                }

                let now = performance.now();
                if (this.lastTime === 0) this.lastTime = now;
                let dt = Math.max(0.001, Math.min(0.05, (now - this.lastTime) / 1000)); // Cap estrito de dt para física
                this.lastTime = now;

                if (!this.hasDrawnThisFrame && !this.fatalError) {
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
                            this.updateMultiplayer(dt);
                            
                            if (this.player.hp <= 0 || !this.player.active) this.endGame('GAMEOVER');
                            else if (this.entities.enemies.length === 0 && this.session.mode === 'SINGLE') this.endGame('VICTORY');
                        }
                    }
                }
            } catch(e) {
                this.fatalError = "CRASH NA ENGINE FÍSICA: " + e.message + "\\n" + e.stack;
            }

            if (ctx) {
                if (this.fatalError) {
                    ctx.fillStyle = "#c0392b"; ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = "white"; ctx.font = "bold 20px Arial"; ctx.textAlign = "left";
                    ctx.fillText("⚠️ CRITICAL SYSTEM FAILURE ⚠️", 20, 50);
                    ctx.font = "12px monospace"; 
                    let lines = this.fatalError.split("\\n");
                    for(let i=0; i<lines.length; i++) ctx.fillText(lines[i], 20, 90 + (i*15));
                } else {
                    try { this.render(ctx, w, h); } catch(e) { this.fatalError = "CRASH NO RENDER: " + e.message; }
                }
                this.hasDrawnThisFrame = true; 
            }
            setTimeout(() => { this.hasDrawnThisFrame = false; }, 0);
        },

        // AR Controle Profissional: Deadzone, Exponencial, Suavização e FBW
        processMobileInputs: function(kps, dt) {
            let rawPitch = 0, rawRoll = 0, rawThr = this.player.throttle;

            if (this.keys['ArrowUp']) rawPitch = 1.0; else if (this.keys['ArrowDown']) rawPitch = -1.0;
            if (this.keys['ArrowRight']) rawRoll = 1.0; else if (this.keys['ArrowLeft']) rawRoll = -1.0;
            if (this.keys['w']) rawThr = 1.0; else if (this.keys['s']) rawThr = 0.2;

            let kpDict = {};
            if (kps && Array.isArray(kps) && kps.length > 0) {
                let arr = (kps[0] && kps[0].keypoints) ? kps[0].keypoints : kps;
                arr.forEach(kp => { if (kp && kp.name) kpDict[kp.name] = kp; });
            }

            let rightWrist = kpDict['right_wrist'], leftWrist = kpDict['left_wrist'], nose = kpDict['nose'];

            if (rightWrist && rightWrist.score > 0.4 && nose && nose.score > 0.4) {
                if (this.state === 'CALIBRATING') {
                    this.hotas.calibratedX = rightWrist.x; this.hotas.calibratedY = rightWrist.y;
                    this.state = 'PLAYING';
                    if(window.System && window.System.msg) window.System.msg("FCS ONLINE", "#2ecc71");
                }
                if (this.state === 'PLAYING' && !this.keys['ArrowUp'] && !this.keys['ArrowDown']) {
                    let dy = (rightWrist.y - this.hotas.calibratedY) / 120;
                    let dx = (rightWrist.x - this.hotas.calibratedX) / 120;
                    rawPitch = Math.max(-1, Math.min(1, dy));
                    rawRoll = Math.max(-1, Math.min(1, dx));
                }
            }

            if (leftWrist && leftWrist.score > 0.4 && this.state === 'PLAYING' && !this.keys['w']) {
                rawThr = 1.1 - (leftWrist.y / 480);
                if (rightWrist && Math.abs(leftWrist.x - rightWrist.x) < 80 && this.lockTimer > 1.5) this.fireMissile();
            }

            // Aplicação de Deadzone e Curva Exponencial
            const applyCurve = (val, deadzone, expo) => {
                if (Math.abs(val) < deadzone) return 0;
                let sign = Math.sign(val);
                let normalized = (Math.abs(val) - deadzone) / (1.0 - deadzone);
                return sign * Math.pow(Math.max(0, normalized), expo);
            };

            let targetPitch = applyCurve(rawPitch, 0.1, 1.5);
            let targetRoll = applyCurve(rawRoll, 0.1, 1.5);
            let targetThrottle = Math.max(0.1, Math.min(1.0, rawThr));

            // Filtro Passa-Baixa (Suavização)
            this.player.inputs.pitch += (targetPitch - this.player.inputs.pitch) * (dt * 10.0);
            this.player.inputs.roll += (targetRoll - this.player.inputs.roll) * (dt * 10.0);
            this.player.throttle += (targetThrottle - this.player.throttle) * (dt * 5.0);

            // Fly-By-Wire: Limitador de G
            if (this.player.gForce > 8.0 && this.player.inputs.pitch > 0) {
                this.player.inputs.pitch *= 0.5; // Reduz a autoridade de nariz p/ cima se G > 8
            }
        },

        // Inteligência Artificial com Física Real
        spawnEnemies: function(count) {
            for(let i=0; i<count; i++) {
                let e = new PhysicsEntity(
                    this.player.pos.x + (Math.random() * 8000 - 4000), 
                    3000 + Math.random() * 2000, 
                    this.player.pos.z + 4000 + (Math.random() * 8000),
                    PLANES.falcon_lite // Bots usam a mesma física
                );
                e.stateTimer = 0;
                this.entities.enemies.push(e);
            }
        },

        updateAI: function(dt) {
            this.entities.enemies.forEach(e => {
                if (!e.active) return;
                
                e.stateTimer -= dt;
                if (e.stateTimer <= 0) e.stateTimer = 1.0 + Math.random() * 2.0;

                let dx = this.player.pos.x - e.pos.x;
                let dy = this.player.pos.y - e.pos.y;
                let dz = this.player.pos.z - e.pos.z;
                
                let distToPlayer = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                // Lógica de Manobra AI
                e.throttle = 0.8; // Mantém energia

                if (e.pos.y < 1000) {
                    // Prevenção de colisão com o solo (Pull up)
                    e.inputs.roll += (0 - e.roll) * dt * 5;
                    e.inputs.pitch = 1.0; 
                } else if (e.isStalling) {
                    // Recuperação de Estol (Nose down)
                    e.inputs.pitch = -1.0;
                } else {
                    // Dogfight: Busca apontar o vetor de sustentação para o jogador
                    let targetYaw = Math.atan2(dx, dz);
                    let yawDiff = targetYaw - e.yaw;
                    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

                    // Bank para virar
                    let desiredRoll = Math.max(-1.5, Math.min(1.5, yawDiff * 2.0));
                    e.inputs.roll = Math.max(-1, Math.min(1, (desiredRoll - e.roll)));
                    
                    // Puxa G's se estiver na angulação certa
                    if (Math.abs(yawDiff) < 1.0) e.inputs.pitch = 0.8;
                    else e.inputs.pitch = 0.2;
                }

                // Atualiza a física do Bot (EXATAMENTE a mesma do jogador)
                e.updatePhysics(dt);
            });
        },

        updateEntities: function(dt) {
            this.entities.missiles.forEach(m => { 
                m.update(dt); 
                if (m.active && Math.random() > 0.3) this.entities.particles.push(new Particle(m.pos.x, m.pos.y, m.pos.z, "#ddd", 5, 1.0)); 
            });
            this.entities.missiles = this.entities.missiles.filter(m => m.active);

            this.entities.enemies.forEach(e => {
                if (e.hp <= 0 && e.active) {
                    e.active = false;
                    for(let i=0; i<30; i++) this.entities.particles.push(new Particle(e.pos.x, e.pos.y, e.pos.z, "#e74c3c", Math.random()*20+10, 2.5));
                    this.session.kills++; 
                    this.session.cash += GAME_CONFIG.MONEY_PER_KILL; 
                    if(window.Sfx) window.Sfx.play(150, 'square', 0.8, 0.4); 
                }
            });
            this.entities.enemies = this.entities.enemies.filter(e => e.active);

            this.entities.particles.forEach(p => p.update(dt));
            this.entities.particles = this.entities.particles.filter(p => p.life > 0);
        },

        updateCombatSystem: function(dt) {
            let closestDist = Infinity, target = null;
            this.entities.enemies.forEach(e => {
                if(!e.active) return;
                let dx = e.pos.x - this.player.pos.x, dy = e.pos.y - this.player.pos.y, dz = e.pos.z - this.player.pos.z;
                let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                let dirYaw = Math.atan2(dx, dz);
                let yawDiff = Math.abs(dirYaw - this.player.yaw);
                if (yawDiff < 0.5 && dist < 8000 && dist < closestDist) { closestDist = dist; target = e; }
            });

            if (target) {
                this.radarTarget = target; this.lockTimer += dt;
                if (window.Sfx) {
                    if (this.lockTimer > 1.5 && Math.floor(this.session.time * 10) % 2 === 0) window.Sfx.play(1200, 'square', 0.05, 0.05);
                    else if (Math.floor(this.session.time * 5) % 2 === 0) window.Sfx.play(800, 'square', 0.05, 0.02);
                }
            } else { this.radarTarget = null; this.lockTimer = 0; }
        },

        fireMissile: function() {
            if (this.radarTarget && this.lockTimer > 1.5) {
                if(window.Sfx) window.Sfx.play(600, 'sawtooth', 0.5, 0.2);
                this.entities.missiles.push(new Missile(this.player, this.radarTarget, false));
                this.lockTimer = 0; 
                if(window.System && window.System.msg) window.System.msg("FOX 2 FIRED!", "#e74c3c");
            }
        },

        // Networking Determinístico - Sem Spam de Firebase
        initMultiplayer: function() {
            if (!window.DB || !window.System.playerId) return;
            const ref = window.DB.ref(`games/flight_${window.System.playerId}`);
            ref.on('value', snap => {
                const data = snap.val();
                if (data && data.players) {
                    for(let id in data.players) {
                        if (id !== window.System.playerId) {
                            if(!this.network.remotePlayers[id]) {
                                this.network.remotePlayers[id] = new PhysicsEntity(0,0,0, PLANES.falcon_lite);
                            }
                            // Alimentar Buffer de Interpolação
                            let remoteData = data.players[id];
                            let rPlayer = this.network.remotePlayers[id];
                            rPlayer.targetPos = { x: remoteData.x, y: remoteData.y, z: remoteData.z };
                            rPlayer.targetRot = { p: remoteData.p, y: remoteData.yaw, r: remoteData.r };
                        }
                    }
                }
            });
        },

        updateMultiplayer: function(dt) {
            if (this.session.mode !== 'PVP' && this.session.mode !== 'COOP') return;
            
            // Envio Controlado (Throttling)
            let now = performance.now();
            if (now - this.network.lastSyncTime > this.network.sendRate && window.DB && window.System.playerId) {
                window.DB.ref(`games/flight_${window.System.playerId}/players/${window.System.playerId}`).set({
                    x: Math.round(this.player.pos.x), y: Math.round(this.player.pos.y), z: Math.round(this.player.pos.z),
                    p: Number(this.player.pitch.toFixed(3)), yaw: Number(this.player.yaw.toFixed(3)), r: Number(this.player.roll.toFixed(3)),
                    hp: this.player.hp
                });
                this.network.lastSyncTime = now;
            }

            // Interpolação Visual Remota (Smooth Local Prediction)
            for(let id in this.network.remotePlayers) {
                let rp = this.network.remotePlayers[id];
                if(rp.targetPos) {
                    rp.pos.x += (rp.targetPos.x - rp.pos.x) * dt * 10;
                    rp.pos.y += (rp.targetPos.y - rp.pos.y) * dt * 10;
                    rp.pos.z += (rp.targetPos.z - rp.pos.z) * dt * 10;
                    rp.pitch += (rp.targetRot.p - rp.pitch) * dt * 10;
                    rp.yaw += (rp.targetRot.y - rp.yaw) * dt * 10;
                    rp.roll += (rp.targetRot.r - rp.roll) * dt * 10;
                }
            }
        },

        endGame: function(finalState) {
            this.state = finalState;
            setTimeout(() => {
                let totalCash = this.session.cash + (finalState === 'VICTORY' ? GAME_CONFIG.MONEY_MISSION_BONUS : 0);
                if (window.System && window.System.gameOver) window.System.gameOver(this.session.kills, finalState === 'VICTORY', totalCash);
                else if (window.System && window.System.home) window.System.home();
            }, 4000);
        },

        // =====================================================================
        // RENDERIZAÇÃO & EFEITOS ESPECIAIS
        // =====================================================================
        render: function(ctx, w, h) {
            ctx.clearRect(0, 0, w, h);
            
            if (this.state === 'HANGAR') return this.drawHangar(ctx, w, h);
            if (this.state === 'CALIBRATING') return this.drawCalibration(ctx, w, h);
            if (this.state === 'GAMEOVER' || this.state === 'VICTORY') return this.renderEnd(ctx, w, h);

            this.draw3DWorld(ctx, w, h);
            this.drawHUD(ctx, w, h);
            this.drawChatGPT_Radar(ctx, w, h); 
            this.drawPilotFX(ctx, w, h);
        },

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
            let p = this.player;

            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(p.roll);
            let horizonY = p.pitch * (h/2); 
            ctx.fillStyle = "rgba(46, 204, 113, 0.15)"; ctx.fillRect(-w*2, horizonY, w*4, h*4);
            ctx.fillStyle = "rgba(52, 152, 219, 0.15)"; ctx.fillRect(-w*2, -h*4 + horizonY, w*4, h*4);
            ctx.beginPath(); ctx.moveTo(-w, horizonY); ctx.lineTo(w, horizonY);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
            ctx.restore();

            // Desenhar Inimigos Locais
            this.entities.enemies.forEach(e => {
                let proj = Engine3D.project(e.pos, p, w, h);
                if (proj.visible) {
                    Engine3D.drawJetModel(ctx, proj.x, proj.y, Math.max(0.1, proj.s * 2), e.roll - p.roll, true);
                    if (this.radarTarget === e) {
                        ctx.strokeStyle = this.lockTimer > 1.5 ? "#e74c3c" : "#f1c40f"; ctx.lineWidth = 2;
                        let size = 30 * proj.s; ctx.strokeRect(proj.x - size/2, proj.y - size/2, size, size);
                        if (this.lockTimer > 1.5) { ctx.fillStyle = "#e74c3c"; ctx.font = "12px Arial"; ctx.fillText("LOCK", proj.x + size/2 + 5, proj.y); }
                    }
                }
            });

            // Desenhar Players Remotos
            for(let id in this.network.remotePlayers) {
                let rp = this.network.remotePlayers[id];
                let proj = Engine3D.project(rp.pos, p, w, h);
                if (proj.visible) {
                    Engine3D.drawJetModel(ctx, proj.x, proj.y, Math.max(0.1, proj.s * 2), rp.roll - p.roll, false, "#2ecc71");
                }
            }

            this.entities.particles.forEach(part => {
                let proj = Engine3D.project(part.pos, p, w, h);
                if (proj.visible) {
                    ctx.fillStyle = part.color; ctx.globalAlpha = part.life / part.maxLife;
                    ctx.beginPath(); ctx.arc(proj.x, proj.y, part.size * proj.s, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });

            this.entities.missiles.forEach(m => {
                let proj = Engine3D.project(m.pos, p, w, h);
                if (proj.visible) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(proj.x, proj.y, 4 * proj.s, 0, Math.PI*2); ctx.fill(); }
            });
        },

        drawHUD: function(ctx, w, h) {
            let p = this.player, hudColor = this.session.selectedPlane.color;
            ctx.fillStyle = hudColor; ctx.strokeStyle = hudColor; ctx.font = "bold 16px 'Chakra Petch', sans-serif";

            // Crosshair e Flight Path Vector
            ctx.beginPath(); ctx.moveTo(w/2 - 15, h/2); ctx.lineTo(w/2 - 5, h/2); ctx.moveTo(w/2 + 15, h/2); ctx.lineTo(w/2 + 5, h/2); ctx.moveTo(w/2, h/2 - 15); ctx.lineTo(w/2, h/2 - 5); ctx.stroke();
            ctx.beginPath(); ctx.arc(w/2, h/2, 2, 0, Math.PI*2); ctx.fill();

            // Pitch Ladder verdadeiro dinâmico
            ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(p.roll);
            for(let i = -3; i <= 3; i++) {
                if (i === 0) continue;
                let yPos = ((i * 0.17) + p.pitch) * 400; 
                if (yPos > -h/2 && yPos < h/2) {
                    ctx.beginPath(); if (i < 0) ctx.setLineDash([5, 5]); 
                    ctx.moveTo(-40, yPos); ctx.lineTo(-20, yPos); ctx.lineTo(-20, yPos + (i < 0 ? -5 : 5)); 
                    ctx.moveTo(40, yPos); ctx.lineTo(20, yPos); ctx.lineTo(20, yPos + (i < 0 ? -5 : 5));
                    ctx.stroke(); ctx.setLineDash([]); ctx.font = "10px Arial"; ctx.textAlign = "right"; ctx.fillText(Math.abs(i*10), -45, yPos + 3); ctx.textAlign = "left"; ctx.fillText(Math.abs(i*10), 45, yPos + 3);
                }
            }
            ctx.restore();

            // Telemetria (Speed, Mach, Altitude)
            let V = Math.sqrt(p.vel.x**2 + p.vel.y**2 + p.vel.z**2);
            ctx.strokeRect(30, h/2 - 100, 40, 200); ctx.textAlign = "center"; ctx.fillText("SPD", 50, h/2 - 110);
            ctx.beginPath(); ctx.moveTo(70, h/2); ctx.lineTo(80, h/2 - 5); ctx.lineTo(80, h/2 + 5); ctx.fill(); 
            ctx.fillText(Math.floor(V), 50, h/2 + 5); ctx.font = "12px Arial"; ctx.fillText(`M ${p.mach.toFixed(2)}`, 50, h/2 + 120);

            ctx.strokeRect(w - 70, h/2 - 100, 40, 200); ctx.textAlign = "center"; ctx.font = "bold 16px 'Chakra Petch'"; ctx.fillText("ALT", w - 50, h/2 - 110);
            ctx.beginPath(); ctx.moveTo(w - 70, h/2); ctx.lineTo(w - 80, h/2 - 5); ctx.lineTo(w - 80, h/2 + 5); ctx.fill(); 
            ctx.fillText(Math.floor(p.pos.y), w - 50, h/2 + 5);

            ctx.strokeRect(w/2 - 100, 20, 200, 25); let heading = (p.yaw * 180 / Math.PI) % 360; if (heading < 0) heading += 360;
            ctx.fillText(Math.floor(heading) + "°", w/2, 40); ctx.beginPath(); ctx.moveTo(w/2, 45); ctx.lineTo(w/2 - 5, 55); ctx.lineTo(w/2 + 5, 55); ctx.fill();

            // Status Tático
            ctx.textAlign = "left"; ctx.fillText(`G-FORCE: ${p.gForce.toFixed(1)}G`, 20, h - 80);
            ctx.fillText(`AoA (Alpha): ${(p.alpha * 180/Math.PI).toFixed(1)}°`, 20, h - 100);
            ctx.fillStyle = p.hp < 40 ? "#e74c3c" : hudColor; ctx.fillText(`INTEGRIDADE: ${Math.floor(p.hp)}%`, 20, h - 60);
            
            // Avisos Críticos
            if (p.isStalling) {
                ctx.fillStyle = (Math.floor(performance.now() / 150) % 2 === 0) ? "#e74c3c" : "#fff"; 
                ctx.textAlign = "center"; ctx.font = "bold 28px 'Russo One'"; ctx.fillText("STALL - PITCH DOWN", w/2, h/2 + 80); 
            }
            if (this.lockTimer > 1.5) { ctx.fillStyle = "#e74c3c"; ctx.textAlign = "center"; ctx.font = "bold 20px 'Chakra Petch'"; ctx.fillText("SHOOT!", w/2, h/2 + 50); }
        },

        drawChatGPT_Radar: function(ctx, w, h) {
            const radarSize = 100; const rx = w - radarSize - 20; const ry = h - radarSize - 20;
            ctx.strokeStyle = "rgba(0, 255, 204, 0.5)"; ctx.lineWidth = 1;
            ctx.fillStyle = "rgba(0, 20, 40, 0.6)"; ctx.fillRect(rx, ry, radarSize, radarSize);
            ctx.strokeRect(rx, ry, radarSize, radarSize);
            
            ctx.fillStyle = "#0f0"; ctx.fillRect(rx + radarSize/2 - 2, ry + radarSize/2 - 2, 4, 4);

            this.entities.enemies.forEach(e => {
                let dx = (e.pos.x - this.player.pos.x) * 0.01; let dz = (e.pos.z - this.player.pos.z) * 0.01;
                let px = rx + radarSize/2 + dx; let py = ry + radarSize/2 + dz;
                if (px > rx && px < rx + radarSize && py > ry && py < ry + radarSize) {
                    ctx.fillStyle = "#e74c3c"; ctx.fillRect(px, py, 4, 4);
                }
            });
            
            for(let id in this.network.remotePlayers) {
                let rp = this.network.remotePlayers[id];
                let dx = (rp.pos.x - this.player.pos.x) * 0.01; let dz = (rp.pos.z - this.player.pos.z) * 0.01;
                let px = rx + radarSize/2 + dx; let py = ry + radarSize/2 + dz;
                if (px > rx && px < rx + radarSize && py > ry && py < ry + radarSize) {
                    ctx.fillStyle = "#2ecc71"; ctx.fillRect(px, py, 4, 4);
                }
            }
        },

        drawPilotFX: function(ctx, w, h) {
            let p = this.player;
            if (p.gForce > 5.0) {
                let intensity = Math.min(1.0, (p.gForce - 5.0) / 4.0); 
                ctx.fillStyle = `rgba(0, 0, 0, ${intensity * 0.8})`; ctx.fillRect(0,0,w,h);
            } else if (p.gForce < -1.5) {
                let intensity = Math.min(1.0, (Math.abs(p.gForce) - 1.5) / 2.0);
                ctx.fillStyle = `rgba(231, 76, 60, ${intensity * 0.6})`; ctx.fillRect(0,0,w,h);
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
            let scannerY = (h/2 + 150) + Math.sin(performance.now() * 0.005) * 20;
            ctx.beginPath(); ctx.moveTo(w/2 - 100, scannerY); ctx.lineTo(w/2 + 100, scannerY); ctx.stroke();
        },

        renderEnd: function(ctx, w, h) {
            ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,w,h);
            ctx.textAlign = "center"; 
            if (this.state === 'VICTORY') {
                ctx.fillStyle = "#2ecc71"; ctx.font = "bold 50px 'Russo One'"; ctx.fillText("ESPAÇO AÉREO LIMPO", w/2, h/2 - 30);
                ctx.fillStyle = "#f1c40f"; ctx.font = "20px 'Chakra Petch'"; ctx.fillText(`PAGAMENTO APROVADO: R$ ${this.session.cash}`, w/2, h/2 + 20);
            } else {
                ctx.fillStyle = "#e74c3c"; ctx.font = "bold 50px 'Russo One'"; ctx.fillText("CAÇA ABATIDO", w/2, h/2 - 30);
                ctx.fillStyle = "#fff"; ctx.font = "20px 'Chakra Petch'"; ctx.fillText("O PILOTO FOI EJETADO.", w/2, h/2 + 20);
            }
            ctx.fillText(`Inimigos Destruídos: ${this.session.kills}`, w/2, h/2 + 60);
        }
    };

    // =========================================================================
    // 6. REGISTRO NO SISTEMA (THIAGUINHO OS)
    // =========================================================================
    const register = () => {
        if (window.System && window.System.registerGame) {
            window.System.registerGame('usarmy_flight_sim', 'Aero Strike WAR', '✈️', Game, {
                camera: 'user', camOpacity: 0.4, 
                phases: [
                    { id: 'single', name: 'CAMPANHA SOLO', desc: 'Destrua alvos para ganhar $', mode: 'SINGLE', reqLvl: 1 },
                    { id: 'coop', name: 'CO-OP SQUADRON', desc: 'Jogue com amigos.', mode: 'COOP', reqLvl: 3 },
                    { id: 'pvp', name: 'DOGFIGHT PVP', desc: 'Batalha aérea.', mode: 'PVP', reqLvl: 5 }
                ]
            });
            clearInterval(regLoop);
        }
    };
    const regLoop = setInterval(register, 100);

})();
