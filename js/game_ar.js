// =============================================================================
// AR TOY TRUCK SIMULATOR: MASTER ARCHITECT EDITION (V28 - MODERN UI)
// OFICINA MINORITY REPORT TOTALMENTE REDESENHADA: SUB-MENUS, ADMIN E EVOLUÇÃO
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1) CAMERA MANAGER (INTEGRADO COM O CORE.JS)
    // =========================================================================
    const CameraManager = {
        isSwitching: false,
        stopCurrentStream: function() {
            const video = window.System?.video;
            if (video && video.srcObject) {
                const tracks = video.srcObject.getTracks();
                tracks.forEach(track => { track.stop(); });
                video.srcObject = null;
            }
        },
        safeSwitch: async function(mode) {
            if (this.isSwitching) return false;
            this.isSwitching = true;
            
            try {
                if (window.System && typeof window.System.switchCamera === 'function') {
                    await window.System.switchCamera(mode);
                } else {
                    this.stopCurrentStream();
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
                        audio: false
                    });
                    const video = window.System?.video;
                    if (video) {
                        video.srcObject = stream;
                        video.style.transform = mode === 'user' ? "scaleX(-1)" : "none";
                        await video.play();
                    }
                }
                if (window.System) window.System.currentCameraMode = mode;
                this.isSwitching = false;
                return true;
            } catch(e) {
                this.isSwitching = false;
                return false;
            }
        },
        startRearCamera: async function() { return await this.safeSwitch('environment'); },
        startFrontCamera: async function() { return await this.safeSwitch('user'); }
    };

    // FUNÇÃO AUXILIAR: Desenhar Cartões com Bordas Arredondadas (Glassmorphism)
    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius); ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius); ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
    }

    // =========================================================================
    // 2) FRONT_AR_OFFICE (MINORITY REPORT UI MODERNA E SUB-MENUS)
    // =========================================================================
    const GestureOffice = {
        isActive: false, 
        cursor: { x: 0, y: 0, active: false }, 
        hoverTime: 0, 
        hoveredBtn: null, 
        eventCallback: null,
        
        // NOVO SISTEMA DE MENUS DE NAVEGAÇÃO
        menuState: 'MAIN',
        menus: {
            MAIN: [
                { id: 'MENU_BATTERY', icon: '🔋', label: 'BATERIAS', color: '#f39c12' },
                { id: 'MENU_ENGINE', icon: '⚙️', label: 'MOTORES', color: '#3498db' },
                { id: 'MENU_RADAR', icon: '📡', label: 'RADARES', color: '#00ffff' },
                { id: 'MENU_CHASSIS', icon: '🚜', label: 'CHASSIS', color: '#f1c40f' },
                { id: 'MENU_ADMIN', icon: '💼', label: 'ADMINISTRAÇÃO', color: '#9b59b6' },
                { id: 'EXIT', icon: '🚀', label: 'VOLTAR À PATRULHA', color: '#00ff66', isWide: true }
            ],
            ENGINE: [
                { id: 'BUY_ENG_1', type: 'engine', lvlReq: 1, icon: '⚙️', label: 'MOTOR V1', desc: 'Básico (Vel: 20)', cost: 0, color: '#3498db' },
                { id: 'BUY_ENG_2', type: 'engine', lvlReq: 2, icon: '⚡', label: 'MOTOR V2', desc: 'Turbo (Vel: 35)', cost: 1500, color: '#3498db' },
                { id: 'BUY_ENG_3', type: 'engine', lvlReq: 3, icon: '🔥', label: 'MOTOR V3', desc: 'Quantum (Vel: 55)', cost: 4000, color: '#3498db' },
                { id: 'BACK', icon: '🔙', label: 'VOLTAR', color: '#aaaaaa', isWide: true }
            ],
            BATTERY: [
                { id: 'BUY_BAT_1', type: 'battery', lvlReq: 1, icon: '🔋', label: 'BATERIA STD', desc: 'Capacidade: 100', cost: 0, color: '#f39c12' },
                { id: 'BUY_BAT_2', type: 'battery', lvlReq: 2, icon: '⚡', label: 'BATERIA LIPO', desc: 'Capacidade: 250', cost: 1200, color: '#f39c12' },
                { id: 'BUY_BAT_3', type: 'battery', lvlReq: 3, icon: '☢️', label: 'CÉLULA FUSÃO', desc: 'Capacidade: 600', cost: 3500, color: '#f39c12' },
                { id: 'BACK', icon: '🔙', label: 'VOLTAR', color: '#aaaaaa', isWide: true }
            ],
            RADAR: [
                { id: 'BUY_RAD_1', type: 'radar', lvlReq: 1, icon: '📡', label: 'RADAR BÁSICO', desc: 'Alcance: 150m', cost: 0, color: '#00ffff' },
                { id: 'BUY_RAD_2', type: 'radar', lvlReq: 2, icon: '🔭', label: 'RADAR AVANÇADO', desc: 'Alcance: 300m', cost: 1800, color: '#00ffff' },
                { id: 'BUY_RAD_3', type: 'radar', lvlReq: 3, icon: '🛰️', label: 'SATÉLITE USR', desc: 'Alcance: 600m', cost: 5000, color: '#00ffff' },
                { id: 'BACK', icon: '🔙', label: 'VOLTAR', color: '#aaaaaa', isWide: true }
            ],
            CHASSIS: [
                { id: 'BUY_CHA_1', type: 'chassis', lvlReq: 1, icon: '🛻', label: 'CHASSI PLÁSTICO', desc: 'Carga Máx: 3', cost: 0, color: '#f1c40f' },
                { id: 'BUY_CHA_2', type: 'chassis', lvlReq: 2, icon: '🚜', label: 'CHASSI ALUMÍNIO', desc: 'Carga Máx: 6', cost: 2000, color: '#f1c40f' },
                { id: 'BUY_CHA_3', type: 'chassis', lvlReq: 3, icon: '🚛', label: 'CHASSI TITÂNIO', desc: 'Carga Máx: 12', cost: 6000, color: '#f1c40f' },
                { id: 'BACK', icon: '🔙', label: 'VOLTAR', color: '#aaaaaa', isWide: true }
            ],
            ADMIN: [
                { id: 'ACT_REPAIR', action: 'repair', icon: '👨‍🔧', label: 'PAGAR MECÂNICO', desc: 'Restaura Vida 100%', cost: 500, color: '#e74c3c' },
                { id: 'ACT_REFUEL', action: 'refuel', icon: '🔌', label: 'CARGA RÁPIDA', desc: 'Enche a Bateria', cost: 300, color: '#f39c12' },
                { id: 'ACT_SCOUT',  action: 'scout', icon: '🕵️', label: 'CONTRATAR OLHEIRO', desc: '+ Chance Raros (Perm)', cost: 2500, color: '#9b59b6' },
                { id: 'BACK', icon: '🔙', label: 'VOLTAR', color: '#aaaaaa', isWide: true }
            ]
        },

        init: function(callback) {
            this.eventCallback = callback; 
            this.isActive = true; 
            this.menuState = 'MAIN';
            this.cursor = { x: window.innerWidth/2, y: window.innerHeight/2, active: false }; 
            this.hoverTime = 0; 
            this.hoveredBtn = null;
        },

        update: function(ctx, w, h, dt, gameState, rawPose, drawX, drawY, scaleCanvas) {
            if (!this.isActive) return;

            const cx = w / 2;
            const gap = Math.min(15, w * 0.03); 
            const btnW = Math.min(180, (w * 0.45));
            const btnH = Math.min(100, h * 0.16);
            const startY = Math.max(140, h * 0.22);
            
            // Fundo da Oficina (Escuro, tecnológico)
            ctx.fillStyle = "rgba(5, 10, 20, 0.9)"; ctx.fillRect(0, 0, w, h);
            
            // ========================================================
            // PROCESSAMENTO MOVENET (BRAÇOS HOLO)
            // ========================================================
            this.cursor.active = false;
            let kps = [];
            
            if (rawPose) {
                if (Array.isArray(rawPose) && rawPose.length > 0) { kps = rawPose[0].keypoints ? rawPose[0].keypoints : rawPose; } 
                else if (rawPose.keypoints) { kps = rawPose.keypoints; } 
                else if (rawPose.pose && rawPose.pose.keypoints) { kps = rawPose.pose.keypoints; }
            }
            
            if (kps && kps.length > 0) {
                ctx.lineWidth = 4;
                ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
                ctx.fillStyle = "#fff";

                const mapKpx = (valX) => w - (drawX + (valX * scaleCanvas));
                const mapKpy = (valY) => drawY + (valY * scaleCanvas);

                const drawBone = (p1Name, p2Name) => {
                    const kp1 = kps.find(k => k.name === p1Name);
                    const kp2 = kps.find(k => k.name === p2Name);
                    if (kp1 && kp2 && kp1.score > 0.25 && kp2.score > 0.25) {
                        const x1 = mapKpx(kp1.x); const y1 = mapKpy(kp1.y);
                        const x2 = mapKpx(kp2.x); const y2 = mapKpy(kp2.y);
                        if(Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
                            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                            ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI*2); ctx.fill();
                            ctx.beginPath(); ctx.arc(x2, y2, 4, 0, Math.PI*2); ctx.fill();
                        }
                    }
                };

                drawBone('left_shoulder', 'right_shoulder');
                drawBone('left_shoulder', 'left_elbow'); drawBone('left_elbow', 'left_wrist');
                drawBone('right_shoulder', 'right_elbow'); drawBone('right_elbow', 'right_wrist');

                const rw = kps.find(k => k.name === 'right_wrist');
                const lw = kps.find(k => k.name === 'left_wrist');
                let domWrist = null;
                
                if (rw && rw.score > 0.25 && lw && lw.score > 0.25) { domWrist = rw.y < lw.y ? rw : lw; } 
                else if (rw && rw.score > 0.25) { domWrist = rw; } 
                else if (lw && lw.score > 0.25) { domWrist = lw; }

                if (domWrist) {
                    const cxW = mapKpx(domWrist.x);
                    const cyW = mapKpy(domWrist.y);
                    if(Number.isFinite(cxW) && Number.isFinite(cyW)) {
                        this.cursor.x = cxW; this.cursor.y = cyW; this.cursor.active = true;
                    }
                }
            }

            // TEXTOS E STATUS NO TOPO
            ctx.fillStyle = "#00ffff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
            ctx.font = "bold clamp(22px, 5vw, 36px) 'Russo One'"; ctx.fillText("EMPRESA USR", cx, Math.max(30, startY - 90));
            ctx.fillStyle = "#00ff66"; ctx.font = "bold clamp(18px, 4vw, 24px) 'Chakra Petch'"; ctx.fillText(`CAIXA: R$ ${Math.floor(gameState.displayMoney).toLocaleString()}`, cx, Math.max(60, startY - 55));
            ctx.fillStyle = "#fff"; ctx.font = "clamp(12px, 3vw, 16px) Arial"; ctx.fillText(`VIDA DO CAMINHÃO: ${Math.floor(gameState.health)}%`, cx, Math.max(80, startY - 30));

            // RENDERIZAÇÃO DINÂMICA DO MENU ATUAL
            const activeMenu = this.menus[this.menuState] || this.menus['MAIN'];
            let currentlyHovering = null;

            activeMenu.forEach((btn, index) => {
                // Cálculo dinâmico de Grid
                let row = Math.floor(index / 2);
                let col = index % 2;
                
                let bX = cx + (col === 0 ? -btnW - gap/2 : gap/2);
                let bY = startY + row * (btnH + gap);
                let bW = btnW;
                let bH = btnH;

                if (btn.isWide) {
                    bX = cx - btnW - gap/2;
                    bW = (btnW * 2) + gap;
                    bH = Math.min(60, btnH * 0.8);
                }

                // Hitbox detection
                let isHover = false;
                if (this.cursor.active && this.cursor.x > bX && this.cursor.x < bX + bW && this.cursor.y > bY && this.cursor.y < bY + bH) { 
                    isHover = true; currentlyHovering = btn; 
                }

                // ==================== LÓGICA DE ESTADOS DOS BOTÕES ====================
                let displayCost = btn.cost ? `R$ ${btn.cost}` : "";
                let subDesc = btn.desc || "";
                let isClickable = true;
                let statusColor = btn.color;
                let badgeTxt = null;

                // Verificações para Menus de Upgrade (V1, V2, V3)
                if (btn.id.startsWith('BUY_')) {
                    const currentLvl = gameState.upgrades[btn.type];
                    if (currentLvl >= btn.lvlReq) {
                        displayCost = "EQUIPADO"; statusColor = "#2ecc71"; isClickable = false; badgeTxt = "✓ SEU";
                    } else if (currentLvl === btn.lvlReq - 1) {
                        isClickable = gameState.money >= btn.cost;
                        if (!isClickable) { statusColor = "#e74c3c"; displayCost = "SEM SALDO"; }
                    } else {
                        displayCost = "BLOQUEADO"; statusColor = "#555555"; isClickable = false; badgeTxt = "🔒 REQ V" + (btn.lvlReq - 1);
                    }
                } 
                // Verificações para Menu de Administração
                else if (btn.id.startsWith('ACT_')) {
                    if (btn.action === 'repair' && gameState.health >= 100) { displayCost = "CHASSI OK"; isClickable = false; statusColor = "#555"; }
                    else if (btn.action === 'refuel' && gameState.fuel >= gameState.stats.maxFuel) { displayCost = "BATERIA OK"; isClickable = false; statusColor = "#555"; }
                    else if (btn.action === 'scout' && gameState.upgrades.scout) { displayCost = "CONTRATADO"; isClickable = false; statusColor = "#2ecc71"; badgeTxt = "✓ ATIVO"; }
                    else {
                        isClickable = gameState.money >= btn.cost;
                        if (!isClickable) { statusColor = "#e74c3c"; displayCost = "SEM SALDO"; }
                    }
                }

                // Corpo do Botão (Glassmorphism)
                ctx.fillStyle = isHover && isClickable ? "rgba(255, 255, 255, 0.15)" : "rgba(25, 35, 50, 0.9)";
                roundRect(ctx, bX, bY, bW, bH, 15); ctx.fill();
                
                ctx.strokeStyle = isHover && isClickable ? statusColor : "rgba(255, 255, 255, 0.1)";
                ctx.lineWidth = isHover && isClickable ? 3 : 1; 
                ctx.stroke();

                if (isHover && isClickable) {
                    ctx.shadowColor = statusColor; ctx.shadowBlur = 15;
                    ctx.strokeStyle = statusColor; ctx.stroke(); ctx.shadowBlur = 0;
                }

                // Ícone e Textos
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                if (btn.isWide) {
                    ctx.font = "clamp(20px, 5vw, 25px) Arial";
                    ctx.fillStyle = "#fff"; ctx.font = "bold clamp(14px, 3.5vw, 18px) 'Chakra Petch'";
                    ctx.fillText(`${btn.icon} ${btn.label} ${btn.icon}`, bX + bW/2, bY + bH/2);
                } else {
                    ctx.font = isHover ? "clamp(35px, 8vw, 45px) Arial" : "clamp(30px, 7vw, 40px) Arial";
                    ctx.fillText(btn.icon, bX + bW/2, bY + bH/2 - 15);
                    
                    ctx.fillStyle = "#fff"; ctx.font = "bold clamp(10px, 2.5vw, 12px) 'Chakra Petch'";
                    ctx.fillText(btn.label, bX + bW/2, bY + bH - 30);
                    
                    if(subDesc) {
                        ctx.fillStyle = "#aaa"; ctx.font = "10px Arial";
                        ctx.fillText(subDesc, bX + bW/2, bY + bH - 18);
                    }

                    // Preço no Rodapé
                    if (displayCost) {
                        ctx.fillStyle = statusColor; ctx.font = "bold clamp(12px, 3vw, 14px) 'Russo One'";
                        ctx.fillText(displayCost, bX + bW/2, bY + bH - 6);
                    }

                    // Badge (Se existir)
                    if (badgeTxt) {
                        ctx.fillStyle = statusColor;
                        let badgeW = ctx.measureText(badgeTxt).width + 16;
                        roundRect(ctx, bX - 5, bY - 10, badgeW, 20, 8); ctx.fill();
                        ctx.fillStyle = "#000"; ctx.font = "bold 10px Arial";
                        ctx.fillText(badgeTxt, bX - 5 + badgeW/2, bY);
                    }
                }
                
                // Salva a hitbox real para a lógica do mouse magnético
                btn.hitbox = { x: bX, y: bY, w: bW, h: bH };
            });

            ctx.textBaseline = "alphabetic"; // Reset p/ não bugar outras telas

            // LÓGICA DE CLIQUE GESTUAL HOLOGRÁFICA (Preenche no centro do botão)
            if (currentlyHovering) {
                // Se mudou de botão, reseta o timer
                if (this.hoveredBtn && this.hoveredBtn.id !== currentlyHovering.id) this.hoverTime = 0;
                
                this.hoveredBtn = currentlyHovering;
                this.hoverTime += dt;
                if (this.hoverTime >= 1.5) { 
                    if (this.eventCallback) this.eventCallback(this.hoveredBtn); 
                    this.hoverTime = 0; 
                    this.hoveredBtn = null;
                }
            } else { this.hoveredBtn = null; this.hoverTime = 0; }

            // DESENHA O CURSOR DO JOGADOR
            if (this.cursor.active) {
                ctx.fillStyle = "rgba(0, 255, 255, 0.9)"; ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, 10, 0, Math.PI*2); ctx.fill();
                
                // Anel de Carregamento Magnético no Centro do Botão!
                if (this.hoverTime > 0 && this.hoveredBtn) {
                    let tb = this.hoveredBtn.hitbox;
                    if (tb) {
                        ctx.strokeStyle = "#00ff66"; ctx.lineWidth = 6; 
                        ctx.beginPath(); ctx.arc(tb.x + tb.w/2, tb.y + tb.h/2, 35, -Math.PI/2, -Math.PI/2 + (this.hoverTime/1.5)*(Math.PI*2)); ctx.stroke();
                    }
                }
            } else {
                ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; 
                ctx.fillText("APAREÇA NA CÂMERA E LEVANTE A MÃO PARA CONTROLAR (OU TOQUE)", cx, h - 20);
            }
        },

        destroy: function() { this.isActive = false; this.cursor = { x: 0, y: 0, active: false }; }
    };

    // =========================================================================
    // 3) ARQUITETURA GLOBAL DA ENGINE AR
    // =========================================================================
    let particles = [];
    
    const Game = {
        state: 'UNINITIALIZED', lastTime: 0, timeTotal: 0, score: 0, transitionAlpha: 0, transitionPhase: 0, pendingCamPromise: null,
        vPos: { x: 0, y: 0 }, baseHeading: 0, currentHeading: 0, virtualSpeed: 0, targetSpeed: 0, manualAccelerate: false, deviceForce: 0,
        _deviceOrientationHandler: null, _deviceMotionHandler: null, _sensorsReady: false,
        
        objectModel: null, detectedItems: [], lastAiTime: 0, aiIntervalMs: 500, aiIntervalId: null, aiProcessing: false,
        activeAnomaly: null, anomalies: [], spawnTimer: 0,
        
        isExtracting: false, pickupTimer: 0, cooldown: 0, currentEvent: null, eventTimer: 0,
        
        currentPose: null, isEstimatingPose: false,
        
        displayMoney: 0, displayFuel: 100, collectGlow: 0, collectZoom: 0, baseFlash: 0,
        currentMission: { type: 'NORMAL', goal: 3, progress: 0, timer: 0, active: false },
        
        health: 100, fuel: 100, wear: { motor: 0, wheels: 0 }, money: 0, cargo: [], level: 1, xp: 0,
        stats: { maxFuel: 100, maxCargo: 3, baseSpeed: 20, scanPower: 1.0, radarRange: 150, wearRate: 0.3 },
        
        // SISTEMA DE UPGRADES INTEIROS (Para facilitar a evolução V1, V2, V3)
        upgrades: { engine: 1, battery: 1, radar: 1, chassis: 1, scout: false },
        
        colors: { main: '#00ffff', danger: '#ff003c', success: '#00ff66', warn: '#f1c40f', panel: 'rgba(0,15,30,0.85)', rare: '#ff00ff' },

        init: function() {
            this.state = 'INIT'; this.lastTime = performance.now(); this.timeTotal = 0; this.score = 0;
            this.upgrades = { engine: 1, battery: 1, radar: 1, chassis: 1, scout: false };
            this.applyStats();
            this.health = 100; this.fuel = this.stats.maxFuel; this.wear = { motor: 0, wheels: 0 }; this.displayFuel = this.fuel;
            this.money = 0; this.displayMoney = 0; this.xp = 0; this.level = 1; this.cargo = []; this.anomalies = [];
            this.isExtracting = false; this.pickupTimer = 0; this.collectGlow = 0; this.collectZoom = 0; this.baseFlash = 0; particles = [];
            this.currentPose = null; this.isEstimatingPose = false;
            
            this.generateMission(); this.setupSensors(); this.setupInput(); 
            
            CameraManager.startRearCamera().then(() => {
                this.loadAIModel();
            });
        },

        generateMission: function() {
            const types = ['COMBO', 'HEAVY LOAD', 'TIMED']; let t = types[Math.floor(Math.random() * types.length)];
            this.currentMission = { type: t, goal: 3 + Math.floor(Math.random() * 3), progress: 0, timer: t === 'TIMED' ? 90 : 0, active: true };
        },

        completeMission: function() {
            this.currentMission.active = false; let bonus = this.currentMission.goal * 1000; this.money += bonus;
            window.System.msg("OBJETIVO CUMPRIDO! BÔNUS: R$" + bonus); this.baseFlash = 1.0;
            if (window.Sfx && typeof window.Sfx.epic === 'function') window.Sfx.epic();
        },

        changeState: function(newState) {
            if (this.state === newState) return;
            if (this.state === 'FRONT_AR_OFFICE') GestureOffice.destroy();
            this.state = newState;
            
            switch(newState) {
                case 'CALIBRATION': 
                    window.System.msg("SISTEMAS ONLINE."); 
                    break;
                case 'PLAY_REAR_AR':
                    this.startAILoop();
                    if (!this.currentMission.active) this.generateMission();
                    break;
                case 'WAITING_PICKUP':
                    this.pickupTimer = 0;
                    if(window.Sfx) window.Sfx.play(800, 'square', 0.2, 0.2);
                    break;
                case 'ENTER_BASE_TRANSITION':
                    this.stopAILoop(); this.transitionAlpha = 0; this.transitionPhase = 'FADE_OUT'; this.virtualSpeed = 0; this.isExtracting = false; this.manualAccelerate = false;
                    break;
                case 'FRONT_AR_OFFICE':
                    this.virtualSpeed = 0; this.deliverCargo(); this.baseFlash = 1.0; GestureOffice.init(this.handleOfficeAction.bind(this));
                    break;
                case 'EXIT_BASE_TRANSITION':
                    this.transitionAlpha = 0; this.transitionPhase = 'FADE_OUT'; this.manualAccelerate = false;
                    break;
                case 'TOW_MODE':
                    this.isExtracting = false; window.System.msg("SISTEMAS CRÍTICOS! VOLTANDO À BASE.");
                    break;
            }
        },

        setupSensors: function() {
            if (!this._deviceOrientationHandler) { 
                this._deviceOrientationHandler = (e) => { 
                    if (e.webkitCompassHeading !== undefined) { this.currentHeading = 360 - e.webkitCompassHeading; } 
                    else { this.currentHeading = e.alpha || 0; }
                }; 
            }
            if (!this._deviceMotionHandler) {
                this._deviceMotionHandler = (e) => {
                    if (this.state === 'ENTER_BASE_TRANSITION' || this.state === 'EXIT_BASE_TRANSITION') return;
                    let acc = e.acceleration || e.accelerationIncludingGravity; if (!acc) return;
                    let mag = Math.sqrt((acc.x||0)*(acc.x||0) + (acc.y||0)*(acc.y||0) + (acc.z||0)*(acc.z||0));
                    let force = Math.abs(mag - (e.acceleration ? 0 : 9.81));
                    
                    if (force > 0.3) {
                        this.deviceForce = force;
                        if (force > 15 && this.state === 'PLAY_REAR_AR') {
                            this.health -= force * 0.5;
                            if(navigator.vibrate) navigator.vibrate(200);
                            this.spawnParticles(window.innerWidth/2, window.innerHeight/2, 20, this.colors.danger); window.System.msg("IMPACTO DETECTADO!");
                            if (this.health <= 0 && this.state !== 'TOW_MODE') this.changeState('TOW_MODE');
                        }
                    } else { this.deviceForce = 0; }
                };
            }
            window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            window.removeEventListener('devicemotion', this._deviceMotionHandler);
            window.addEventListener('deviceorientation', this._deviceOrientationHandler);
            window.addEventListener('devicemotion', this._deviceMotionHandler);
            this._sensorsReady = true;
        },

        setupInput: function() {
            const canvas = window.System?.canvas; if (!canvas) return;
            canvas.onpointerdown = (e) => {
                if (this.state === 'ENTER_BASE_TRANSITION' || this.state === 'EXIT_BASE_TRANSITION') return;
                const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top; const w = r.width; const h = r.height;

                if (this.state === 'CALIBRATION') {
                    this.baseHeading = this.currentHeading; 
                    this.vPos = { x: 0, y: 0 }; 
                    this.changeState('PLAY_REAR_AR');
                }
                else if (this.state === 'PLAY_REAR_AR' || this.state === 'TOW_MODE') {
                    let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
                    const btnS = Math.min(50, w * 0.15);
                    
                    if (y > 60 && y < 60 + btnS && x > w - btnS - 10 && x < w - 10) {
                        if (distToBase < 30) {
                            this.pendingCamPromise = CameraManager.startFrontCamera(); this.changeState('ENTER_BASE_TRANSITION');
                        } else { window.System.msg("MUITO LONGE DA BASE!"); } return;
                    }
                    const accR = Math.min(45, w * 0.12);
                    if (x < 30 + accR*2 && y > h - 80 - accR*2 && this.state !== 'TOW_MODE') { this.manualAccelerate = true; }
                }
                else if (this.state === 'FRONT_AR_OFFICE') {
                    // Touch Fallback para quando o Minority Report não detetar
                    let foundHit = false;
                    GestureOffice.buttons.forEach(btn => { 
                        if (x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) { 
                            if (GestureOffice.eventCallback) GestureOffice.eventCallback(btn); 
                            foundHit = true;
                        } 
                    });
                }
            };
            canvas.onpointerup = () => { this.manualAccelerate = false; };
        },

        loadAIModel: async function() {
            const loadPromise = new Promise((resolve) => {
                try {
                    if (typeof cocoSsd === 'undefined') {
                        const script = document.createElement('script'); script.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                        script.onload = () => { 
                            if (typeof cocoSsd !== 'undefined') cocoSsd.load().then(m => { this.objectModel = m; resolve(); }).catch(() => resolve());
                            else resolve();
                        };
                        script.onerror = () => resolve(); document.head.appendChild(script);
                    } else {
                        cocoSsd.load().then(m => { this.objectModel = m; resolve(); }).catch(() => resolve());
                    }
                } catch (e) { this.objectModel = null; resolve(); }
            });

            await Promise.race([loadPromise, new Promise(res => setTimeout(res, 5000))]);
            this.changeState('CALIBRATION');
        },

        startAILoop: function() {
            if (this.aiIntervalId !== null) { clearInterval(this.aiIntervalId); this.aiIntervalId = null; }
            this.aiIntervalId = setInterval(async () => {
                if (this.aiProcessing) return;
                if ((this.state === 'PLAY_REAR_AR' || this.state === 'WAITING_PICKUP') && this.objectModel && window.System?.video && window.System.video.readyState === 4) {
                    this.aiProcessing = true;
                    try {
                        const preds = await this.objectModel.detect(window.System.video);
                        this.detectedItems = preds || [];
                    } catch(e) { this.detectedItems = []; } finally { this.aiProcessing = false; }
                }
            }, this.aiIntervalMs);
        },
        
        stopAILoop: function() {
            if (this.aiIntervalId !== null) { clearInterval(this.aiIntervalId); this.aiIntervalId = null; }
            this.aiProcessing = false;
        },

        update: function(ctx, w, h, globalPose) {
            const now = performance.now(); let dt = (now - this.lastTime) / 1000; if (isNaN(dt) || dt > 0.1 || dt < 0) dt = 0.016; this.lastTime = now; this.timeTotal += dt;

            // FORÇANDO O MOVENET A RODAR NA CÂMARA FRONTAL
            if (this.state === 'FRONT_AR_OFFICE' && window.System?.detector && window.System.video?.readyState === 4) {
                if (!this.isEstimatingPose) {
                    this.isEstimatingPose = true;
                    window.System.detector.estimatePoses(window.System.video, {flipHorizontal: false}).then(p => {
                        if (p && p.length > 0) this.currentPose = p[0];
                        this.isEstimatingPose = false;
                    }).catch(() => { this.isEstimatingPose = false; });
                }
            }

            if (isNaN(this.displayMoney)) this.displayMoney = 0; if (isNaN(this.displayFuel)) this.displayFuel = 100;
            this.displayMoney += (this.money - this.displayMoney) * 10 * dt; this.displayFuel += (this.fuel - this.displayFuel) * 5 * dt;

            let fps = 1 / dt; let newInterval = (fps < 20) ? 1000 : 500;
            if (this.aiIntervalMs !== newInterval) { this.aiIntervalMs = newInterval; if (this.state === 'PLAY_REAR_AR' || this.state === 'WAITING_PICKUP') { this.startAILoop(); } }

            const vW = window.System?.video?.videoWidth || w; const vH = window.System?.video?.videoHeight || h;
            const videoRatio = vW / vH; const canvasRatio = w / h; 
            let drawW = w, drawH = h, drawX = 0, drawY = 0;
            if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } 
            else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
            const scaleCanvas = drawW / vW; 

            if (!['FRONT_AR_OFFICE', 'ENTER_BASE_TRANSITION', 'EXIT_BASE_TRANSITION'].includes(this.state)) {
                ctx.save();
                if (this.virtualSpeed > 0.1 && !this.isExtracting) {
                    let susY = Math.sin(this.timeTotal * this.virtualSpeed * 1.5) * (this.virtualSpeed / this.stats.baseSpeed) * 3; ctx.translate(0, susY);
                }
                if (this.collectZoom > 0) {
                    let z = 1 + (this.collectZoom * 0.03); ctx.translate(w/2, h/2); ctx.scale(z, z); ctx.translate(-w/2, -h/2); this.collectZoom -= dt * 2;
                }
                if (window.System?.video && window.System.video.readyState === 4) {
                    ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
                } else { ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h); }
                
                if (this.baseFlash > 0) { ctx.fillStyle = `rgba(0, 255, 100, ${this.baseFlash * 0.5})`; ctx.fillRect(0, 0, w, h); this.baseFlash -= dt * 1.5; }
                if (this.state === 'WAITING_PICKUP') { ctx.fillStyle = `rgba(255, 0, 60, ${Math.abs(Math.sin(this.timeTotal*10))*0.15})`; ctx.fillRect(0, 0, w, h); }
                else { ctx.fillStyle = `rgba(0, 50, 60, ${0.1 + Math.sin(this.timeTotal*2)*0.05})`; ctx.fillRect(0, 0, w, h); }
                ctx.restore();
            }

            switch (this.state) {
                case 'BOOT': case 'INIT': this.drawOverlay(ctx, w, h, "INICIALIZANDO", "Carregando Engine Premium..."); break;
                case 'CALIBRATION': this.drawOverlay(ctx, w, h, "PONTO ZERO", "Coloque o caminhão na Base e TOQUE NA TELA"); break;
                case 'PLAY_REAR_AR':
                case 'WAITING_PICKUP':
                case 'TOW_MODE':
                    this.updatePhysics(dt); this.updateEvents(dt); this.spawnAnomalies(dt); this.processAR(ctx, w, h, dt, drawX, drawY, scaleCanvas); this.drawHUD(ctx, w, h); break;
                case 'ENTER_BASE_TRANSITION': this.processTransition(ctx, w, h, dt, 'startFrontCamera', 'FRONT_AR_OFFICE'); break;
                case 'FRONT_AR_OFFICE':
                    if (window.System?.video && window.System.video.readyState === 4) {
                        ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(window.System.video, -drawX, drawY, drawW, drawH); ctx.restore();
                    }
                    GestureOffice.update(ctx, w, h, dt, this, this.currentPose || globalPose, drawX, drawY, scaleCanvas); break;
                case 'EXIT_BASE_TRANSITION': this.processTransition(ctx, w, h, dt, 'startRearCamera', 'PLAY_REAR_AR'); break;
                case 'GAME_OVER': this.drawOverlay(ctx, w, h, "FIM DE JOGO", "Calculando pontuação..."); break;
            }

            this.updateParticles(ctx, dt, w, h); return this.score || 0; 
        },

        processTransition: function(ctx, w, h, dt, camFunc, nextState) {
            if (this.transitionPhase === 'FADE_OUT') {
                this.transitionAlpha += dt * 3.0; 
                if (this.transitionAlpha >= 1) {
                    this.transitionAlpha = 1; this.transitionPhase = 'SWITCH_CAM';
                    if (this.pendingCamPromise) {
                        this.pendingCamPromise.then(() => { this.transitionPhase = 'FADE_IN'; this.pendingCamPromise = null; }).catch(() => { this.transitionPhase = 'FADE_IN'; this.pendingCamPromise = null; });
                    } else { this.transitionPhase = 'FADE_IN'; }
                }
            } else if (this.transitionPhase === 'SWITCH_CAM') {
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.textAlign="center"; ctx.fillText("A INICIAR HOLOGRAMA...", w/2, h/2);
            } else if (this.transitionPhase === 'FADE_IN') {
                this.transitionAlpha -= dt * 3.0;
                if (this.transitionAlpha <= 0) { this.transitionAlpha = 0; this.changeState(nextState); }
            }
            if (this.transitionPhase !== 'SWITCH_CAM') { ctx.fillStyle = `rgba(0,0,0,${this.transitionAlpha})`; ctx.fillRect(0, 0, w, h); }
        },

        updatePhysics: function(dt) {
            if (this.cooldown > 0) this.cooldown -= dt;

            let accelInput = (this.manualAccelerate || this.deviceForce > 0.5) ? (5.0 + (this.upgrades.engine * 2)) : 0;
            let drag = 0.05 * this.virtualSpeed * this.virtualSpeed; 
            
            if (accelInput > 0) {
                let speedRatio = this.virtualSpeed / this.stats.baseSpeed;
                this.virtualSpeed += accelInput * (1 - speedRatio * speedRatio) * dt * 8;
            }
            this.virtualSpeed -= drag * dt;
            this.virtualSpeed = Math.max(0, Math.min(this.virtualSpeed, this.stats.baseSpeed));

            if (this.state === 'TOW_MODE') {
                this.virtualSpeed = Math.min(this.virtualSpeed, this.stats.baseSpeed * 0.4);
                let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
                if (distToBase < 30) { this.pendingCamPromise = CameraManager.startFrontCamera(); this.changeState('ENTER_BASE_TRANSITION'); return; }
            }

            let isMoving = this.virtualSpeed > 0.15;
            if (isMoving) {
                let speedMod = 1.0; if (this.currentEvent === 'STORM') speedMod *= 0.5; 
                let currentSpeed = this.virtualSpeed * speedMod;
                
                let rad = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
                this.vPos.x += -Math.sin(rad) * currentSpeed * dt; 
                this.vPos.y += Math.cos(rad) * currentSpeed * dt; 

                let wearMod = 1.0 - (this.upgrades.chassis * 0.05);
                this.wear.motor = Math.min(100, this.wear.motor + (this.stats.wearRate * wearMod * dt));
                this.wear.wheels = Math.min(100, this.wear.wheels + (this.stats.wearRate * wearMod * 1.5 * dt));

                let isHeavyLoad = (this.currentMission && this.currentMission.active && this.currentMission.type === 'HEAVY LOAD');
                let heavyMod = isHeavyLoad ? 2.0 : 1.0;

                let cargoWeight = this.cargo.length; let baseDrain = 0.8 / 60; let speedDrain = this.virtualSpeed * 0.015; let cargoDrain = cargoWeight * 0.01 * heavyMod;
                let fuelLoss = (baseDrain + speedDrain + cargoDrain) * dt;
                this.fuel = Math.max(0, Math.min(this.fuel - fuelLoss, this.stats.maxFuel));
            } else { this.fuel = Math.max(0, Math.min(this.fuel, this.stats.maxFuel)); }

            if (this.fuel <= 0 && this.state !== 'TOW_MODE') { this.fuel = 0; this.changeState('TOW_MODE'); }

            if (this.currentMission && this.currentMission.active && this.currentMission.type === 'TIMED' && this.state !== 'TOW_MODE') {
                this.currentMission.timer -= dt;
                if (this.currentMission.timer <= 0) { this.currentMission.active = false; window.System.msg("TEMPO DA MISSÃO ESGOTADO!"); if(window.Sfx && typeof window.Sfx.error === 'function') window.Sfx.error(); }
            }
        },

        updateEvents: function(dt) {
            if (this.currentEvent) {
                this.eventTimer -= dt; if (this.eventTimer <= 0) this.currentEvent = null;
            } else if (Math.random() < (0.01 * dt)) { 
                this.currentEvent = Math.random() > 0.5 ? 'STORM' : 'GLITCH'; this.eventTimer = 10; window.System.msg("EVENTO: " + this.currentEvent);
            }
        },

        spawnAnomalies: function(dt) {
            if (this.state === 'TOW_MODE') return;
            this.spawnTimer += dt;
            if (this.anomalies.length < 5 && this.spawnTimer > 2.0) {
                this.spawnTimer = 0; 
                // Se contratou olheiros (scout), tem mais chance de rare
                let rareChance = this.upgrades.scout ? 0.35 : 0.15;
                let isRare = Math.random() < rareChance; 
                let dist = 40 + Math.random() * (100 + this.level * 20); let ang = Math.random() * Math.PI * 2;
                this.anomalies.push({ id: Math.random().toString(36), x: this.vPos.x + Math.cos(ang) * dist, y: this.vPos.y + Math.sin(ang) * dist, type: isRare ? 'RARE' : 'NORMAL', val: isRare ? 5000 : (500 + Math.floor(Math.random()*500)), life: isRare ? 25 : 999 });
            }
            this.anomalies.forEach(a => { if (a.life < 999) a.life -= dt; }); this.anomalies = this.anomalies.filter(a => a.life > 0);
        },

        processAR: function(ctx, w, h, dt, drawX, drawY, scaleCanvas) {
            if (this.state === 'TOW_MODE') { this.isExtracting = false; return; }

            const cx = w / 2; const cy = h / 2;
            let nearestDist = 9999; this.activeAnomaly = null;
            this.anomalies.forEach(ano => { let d = Math.hypot(ano.x - this.vPos.x, ano.y - this.vPos.y); if (d < nearestDist) { nearestDist = d; this.activeAnomaly = ano; } });

            let visualFound = false; let foundBox = null;

            const allowedClasses = ['car', 'truck', 'bus', 'train', 'mouse', 'remote', 'cell phone', 'bottle', 'cup'];
            
            this.detectedItems.forEach(item => {
                if (!allowedClasses.includes(item.class) || item.score < 0.20) return;
                
                const bW = item.bbox[2] * scaleCanvas; 
                const bH = item.bbox[3] * scaleCanvas;
                if (bW > w * 0.8 || bW < w * 0.05) return; 
                
                const cX = drawX + (item.bbox[0] * scaleCanvas) + bW/2; 
                const cY = drawY + (item.bbox[1] * scaleCanvas) + bH/2;
                
                let isCentered = Math.hypot(cX - cx, cY - cy) < Math.min(w, h) * 0.4;
                
                ctx.strokeStyle = isCentered ? this.colors.danger : "rgba(255, 255, 0, 0.8)"; ctx.lineWidth = isCentered ? 4 : 2;
                ctx.strokeRect(drawX + (item.bbox[0] * scaleCanvas), drawY + (item.bbox[1] * scaleCanvas), bW, bH);
                ctx.fillStyle = isCentered ? this.colors.danger : "rgba(255, 255, 0, 0.8)"; ctx.font = "bold 14px Arial";
                ctx.fillText(item.class.toUpperCase(), drawX + (item.bbox[0] * scaleCanvas), drawY + (item.bbox[1] * scaleCanvas) - 5);

                if (isCentered) {
                    visualFound = true; foundBox = { x: drawX + (item.bbox[0] * scaleCanvas), y: drawY + (item.bbox[1] * scaleCanvas), w: bW, h: bH, label: item.class };
                }
            });

            if (this.state === 'PLAY_REAR_AR') {
                if (visualFound && this.cargo.length < this.stats.maxCargo && this.cooldown <= 0) {
                    this.changeState('WAITING_PICKUP');
                }
            } 
            else if (this.state === 'WAITING_PICKUP') {
                const uiY = h - 140;
                ctx.fillStyle = this.colors.danger; ctx.textAlign = "center"; ctx.font = "bold clamp(20px, 5vw, 40px) 'Russo One'";
                ctx.fillText("ALVO BLOQUEADO!", cx, uiY - 45);
                ctx.fillStyle = "#fff"; ctx.font = "bold clamp(14px, 3.5vw, 20px) Arial";
                ctx.fillText("PARE O CAMINHÃO E REMOVA COM A MÃO!", cx, uiY - 15);

                if (!visualFound) {
                    this.pickupTimer += dt;
                    ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(w*0.1, uiY + 10, w*0.8, 20);
                    ctx.fillStyle = this.colors.success; ctx.fillRect(w*0.1, uiY + 10, (this.pickupTimer/1.0)*(w*0.8), 20); 
                    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(w*0.1, uiY + 10, w*0.8, 20);
                    
                    if (this.pickupTimer > 1.0) { 
                        let val = (this.activeAnomaly && nearestDist < 30) ? this.activeAnomaly.val : (500 + Math.floor(Math.random() * 500));
                        this.cargo.push(val); this.score += val / 10;
                        window.System.msg("BRINQUEDO NA CAÇAMBA!");
                        
                        if (this.currentMission && this.currentMission.active) {
                            this.currentMission.progress++;
                            if (this.currentMission.progress >= this.currentMission.goal) this.completeMission();
                        }
                        if (this.activeAnomaly && nearestDist < 30) this.anomalies = this.anomalies.filter(a => a.id !== this.activeAnomaly.id);

                        this.changeState('PLAY_REAR_AR'); this.cooldown = 3.0; 
                        if(window.Gfx && typeof window.Gfx.shakeScreen === 'function') window.Gfx.shakeScreen(20);
                        if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
                        this.collectGlow = 1.0; this.collectZoom = 1.0; this.spawnParticles(cx, cy, 40, this.colors.main);
                    }
                } else {
                    this.pickupTimer = Math.max(0, this.pickupTimer - (dt * 0.5));
                }

                if (this.virtualSpeed > 10) {
                    this.changeState('PLAY_REAR_AR'); window.System.msg("ALVO ABANDONADO");
                }
            }
        },

        drawHUD: function(ctx, w, h) {
            let fuelPct = this.displayFuel / this.stats.maxFuel;
            let isFull = this.cargo.length >= this.stats.maxCargo;
            let radHead = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
            
            if (this.collectGlow > 0) { ctx.fillStyle = `rgba(0, 255, 255, ${this.collectGlow * 0.3})`; ctx.fillRect(0, 0, w, h); this.collectGlow -= 0.03; }

            // AR WAYPOINTS (NAVEGAÇÃO REAL PARA A BASE 3D)
            const drawARWaypoint = (worldX, worldY, label, color, isBase) => {
                let dx = worldX - this.vPos.x; let dy = worldY - this.vPos.y; let dist = Math.hypot(dx, dy);
                let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2);
                let fwdAngle = Math.atan2(Math.sin(angle), Math.cos(angle)); 
                let fov = Math.PI / 2.5; 
                
                if (Math.abs(fwdAngle) < fov) {
                    let projX = (w/2) + (fwdAngle / fov) * (w/2); let projY = h/2 + Math.sin(this.timeTotal * 4) * 10;
                    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(projX, projY - 25); ctx.lineTo(projX + 15, projY); ctx.lineTo(projX, projY + 25); ctx.lineTo(projX - 15, projY); ctx.fill();
                    ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Russo One'"; ctx.textAlign = "center"; ctx.fillText(label, projX, projY - 35);
                    ctx.font = "bold 12px Arial"; ctx.fillText(Math.floor(dist) + "m", projX, projY + 45);
                } else {
                    let isRight = fwdAngle > 0; let edgeX = isRight ? w - 40 : 40; let edgeY = h / 2;
                    ctx.fillStyle = isBase ? this.colors.success : color; ctx.beginPath();
                    if (isRight) { ctx.moveTo(edgeX-20, edgeY - 30); ctx.lineTo(edgeX + 20, edgeY); ctx.lineTo(edgeX-20, edgeY + 30); } 
                    else { ctx.moveTo(edgeX+20, edgeY - 30); ctx.lineTo(edgeX - 20, edgeY); ctx.lineTo(edgeX+20, edgeY + 30); }
                    ctx.fill();
                    ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(isRight ? "GIRE ->" : "<- GIRE", isRight ? edgeX - 40 : edgeX + 40, edgeY + 5);
                }
            };

            if (isFull || this.state === 'TOW_MODE') {
                drawARWaypoint(0, 0, "BASE DE ENTREGA", this.colors.success, true);
            } else {
                this.anomalies.forEach(a => drawARWaypoint(a.x, a.y, a.type==='RARE'?"RARO":"SUCATA", a.type==='RARE'?this.colors.rare:this.colors.warn, false));
                ctx.globalAlpha = 0.3; drawARWaypoint(0, 0, "BASE", this.colors.success, true); ctx.globalAlpha = 1.0;
            }

            const topH = 50;
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, 0, w, topH); ctx.strokeStyle = this.colors.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, topH); ctx.lineTo(w, topH); ctx.stroke();

            ctx.fillStyle = "#fff"; ctx.font = "bold clamp(10px, 3vw, 14px) 'Chakra Petch'"; ctx.textAlign = "left"; ctx.fillText(`LVL ${this.level} | VIDA: ${Math.floor(this.health)}%`, 10, 20);
            
            ctx.save();
            const fuelW = Math.min(150, w/2.5);
            if (fuelPct < 0.2) { let pulse = 1 + Math.abs(Math.sin(this.timeTotal * 10)) * 0.05; ctx.translate(10 + fuelW/2, 28 + 5); ctx.scale(pulse, pulse); ctx.translate(-(10 + fuelW/2), -(28 + 5)); }
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(10, 28, fuelW, 12); ctx.fillStyle = fuelPct > 0.2 ? this.colors.success : this.colors.danger; ctx.fillRect(10, 28, fuelPct * fuelW, 12);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(10, 28, fuelW, 12); ctx.fillStyle = "#fff"; ctx.font = "bold 10px Arial"; ctx.fillText("COMBUSTÍVEL", 15, 38); ctx.restore();

            if (isFull && this.state !== 'TOW_MODE') {
                ctx.fillStyle = (Math.sin(this.timeTotal*5) > 0) ? this.colors.success : "#fff"; ctx.textAlign = "center"; ctx.font = "bold clamp(16px, 4vw, 24px) 'Russo One'";
                ctx.fillText("CAÇAMBA CHEIA! SIGA A SETA PARA A BASE!", w/2, topH + 30);
            }

            const btnS = Math.min(50, w * 0.15); const rightPad = 15;
            let distToBase = Math.hypot(this.vPos.x, this.vPos.y); let atBase = distToBase < 30;
            const garageY = topH + 15;
            ctx.fillStyle = atBase ? this.colors.success : "rgba(100,100,100,0.5)"; ctx.fillRect(w - btnS - rightPad, garageY, btnS, btnS);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(w - btnS - rightPad, garageY, btnS, btnS); ctx.fillStyle = "#000"; ctx.textAlign="center"; ctx.font = `bold ${btnS*0.5}px Arial`; ctx.fillText("🔧", w - rightPad - btnS/2, garageY + btnS*0.7);

            const rR = Math.min(45, w * 0.12);
            const rCx = w - rR - rightPad; const rCy = garageY + btnS + rR + 15;
            let radarGradient = ctx.createRadialGradient(rCx, rCy, 0, rCx, rCy, rR);
            radarGradient.addColorStop(0, "rgba(0, 50, 40, 0.9)"); radarGradient.addColorStop(1, "rgba(0, 10, 20, 0.7)");
            ctx.fillStyle = radarGradient; ctx.beginPath(); ctx.arc(rCx, rCy, rR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = this.currentEvent ? this.colors.danger : this.colors.main; ctx.lineWidth = 2; ctx.stroke();

            const drawBlip = (wX, wY, col, sz, isBlinking) => {
                let dx = wX - this.vPos.x; let dy = wY - this.vPos.y; let dist = Math.hypot(dx, dy);
                if (dist < this.stats.radarRange) {
                    if (isBlinking && Math.sin(this.timeTotal * 15) > 0) return;
                    let worldAngle = Math.atan2(dy, dx);
                    let playerForwardAngle = (Math.PI / 2) + radHead;
                    let relAngle = worldAngle - playerForwardAngle;
                    let canvasAngle = -relAngle - Math.PI/2; 
                    
                    let sD = (dist / this.stats.radarRange) * rR;
                    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rCx + Math.cos(canvasAngle)*sD, rCy + Math.sin(canvasAngle)*sD, sz, 0, Math.PI*2); ctx.fill();
                }
            };
            drawBlip(0, 0, this.colors.success, 5, false);
            if(!isFull) this.anomalies.forEach(a => drawBlip(a.x, a.y, a.type==='RARE'?this.colors.rare:this.colors.warn, 3, a.type==='RARE'));
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(rCx, rCy - 6); ctx.lineTo(rCx+4, rCy+4); ctx.lineTo(rCx-4, rCy+4); ctx.fill();

            const botH = 60; const botY = h - botH;
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, botY, w, botH); ctx.strokeStyle = this.colors.main; ctx.beginPath(); ctx.moveTo(0, botY); ctx.lineTo(w, botY); ctx.stroke();

            const accR = Math.min(45, w * 0.12); const accX = 15 + accR; const accY = botY - accR - 15;
            ctx.fillStyle = this.manualAccelerate ? "rgba(0,255,255,0.6)" : "rgba(0,255,255,0.2)"; ctx.beginPath(); ctx.arc(accX, accY, accR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.font = "bold 12px Arial"; ctx.textAlign="center"; ctx.fillText("GAS", accX, accY + 4);

            ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold clamp(14px, 3.5vw, 18px) 'Chakra Petch'"; ctx.fillText(`CARGA: ${this.cargo.length}/${this.stats.maxCargo}`, 140, h - 25);
            ctx.fillStyle = this.colors.success; ctx.font = "bold clamp(18px, 5vw, 24px) 'Russo One'"; ctx.fillText(`R$ ${Math.floor(this.displayMoney).toLocaleString()}`, 300, h - 22);

            ctx.textAlign = "right"; ctx.fillStyle = this.colors.main; ctx.font = "bold clamp(12px, 3vw, 16px) 'Chakra Petch'"; ctx.fillText(`BASE: ${Math.floor(distToBase)}m`, w - 15, h - 25);
            
            if (this.state === 'TOW_MODE') { ctx.textAlign="center"; ctx.fillStyle = this.colors.danger; ctx.font = "bold clamp(20px, 5vw, 30px) 'Russo One'"; ctx.fillText("MODO REBOQUE!", w/2, h/2 - 20); }
        },

        deliverCargo: function() {
            if (this.cargo.length > 0) {
                let total = this.cargo.reduce((a, b) => a + b, 0); let effBonus = Math.floor(total * (this.fuel / this.stats.maxFuel) * 0.3); total += effBonus;
                if (this.currentMission && this.currentMission.active && this.currentMission.type === 'HEAVY LOAD') { total = Math.floor(total * 1.5); }
                this.money += total; this.score += total / 10;
                this.xp += this.cargo.length * 100;
                if (this.xp >= this.level * 600) { this.xp = 0; this.level++; window.System.msg("NÍVEL " + this.level + " ALCANÇADO!"); } else { window.System.msg(`ENTREGA: R$${total}`); }
                this.cargo = [];
            }
        },

        // AQUI ESTÁ O NOVO GESTOR DO SISTEMA DE MENUS DA OFICINA
        handleOfficeAction: function(btn) {
            let id = btn.id || btn;

            // NAVEGAÇÃO DE MENUS
            if (id.startsWith('MENU_')) {
                let newMenu = id.replace('MENU_', '');
                GestureOffice.menuState = newMenu;
                if(window.Sfx) window.Sfx.hover();
                return;
            }
            if (id === 'BACK') {
                GestureOffice.menuState = 'MAIN';
                if(window.Sfx) window.Sfx.click();
                return;
            }

            // AÇÕES DE COMPRA
            const buyObj = (cost, callback) => {
                if (this.money >= cost && cost > 0) { this.money -= cost; callback(); if(window.Sfx && typeof window.Sfx.coin === 'function') window.Sfx.coin(); return true; }
                if(window.Sfx && typeof window.Sfx.error === 'function') window.Sfx.error(); return false;
            };

            // Upgrade Systems (V1, V2, V3)
            if (id.startsWith('BUY_')) {
                if (buyObj(btn.cost, () => { this.upgrades[btn.type] = btn.lvlReq; this.applyStats(); })) {
                    window.System.msg("UPGRADE ADQUIRIDO!");
                }
            }
            // Admin Systems
            else if (id.startsWith('ACT_')) {
                if (btn.action === 'repair' && this.health < 100) { buyObj(btn.cost, () => { this.health = 100; }); }
                else if (btn.action === 'refuel' && this.fuel < this.stats.maxFuel) { buyObj(btn.cost, () => { this.fuel = this.stats.maxFuel; }); }
                else if (btn.action === 'scout' && !this.upgrades.scout) { buyObj(btn.cost, () => { this.upgrades.scout = true; }); }
            }

            if (id === 'EXIT') { this.pendingCamPromise = CameraManager.startRearCamera(); this.changeState('EXIT_BASE_TRANSITION'); }
        },

        applyStats: function() {
            const engSpeeds = [20, 35, 55];
            const batCaps = [100, 250, 600];
            const radRanges = [150, 300, 600];
            const chasCargo = [3, 6, 12];

            this.stats.baseSpeed = engSpeeds[this.upgrades.engine - 1]; 
            this.stats.maxFuel = batCaps[this.upgrades.battery - 1]; 
            this.stats.radarRange = radRanges[this.upgrades.radar - 1]; 
            this.stats.maxCargo = chasCargo[this.upgrades.chassis - 1];

            if (this.fuel > this.stats.maxFuel) this.fuel = this.stats.maxFuel;
        },

        drawOverlay: function(ctx, w, h, title, sub) {
            ctx.fillStyle = "rgba(0, 5, 10, 0.95)"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = this.colors.main; ctx.textAlign = "center"; ctx.font = "bold clamp(24px, 6vw, 50px) 'Russo One'"; ctx.fillText(title, w/2, h/2 - 20); ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial"; ctx.fillText(sub, w/2, h/2 + 30);
        },

        spawnParticles: function(x, y, count, color) {
            for(let i=0; i<count; i++) { particles.push({ x: x, y: y, vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20, life: 1.0, color: color, size: Math.random()*8+4 }); }
        },

        updateParticles: function(ctx, dt, w, h) {
            ctx.globalCompositeOperation = 'screen';
            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i]; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt * 2;
                if (p.life <= 0) { particles.splice(i, 1); continue; } ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            }
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
        },

        cleanup: function() {
            this.stopAILoop(); if (this.state === 'FRONT_AR_OFFICE') GestureOffice.destroy();
            if (this._deviceOrientationHandler) window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            if (this._deviceMotionHandler) window.removeEventListener('devicemotion', this._deviceMotionHandler);
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('ar_truck_sim', 'AR Ops Premium', '🚀', Game, {
                camera: 'environment', phases: [{ id: 'f1', name: 'MISSÃO AR GLOBAL', desc: 'Siga a Bússola e Recolha Brinquedos com a Mão!', reqLvl: 1 }]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
