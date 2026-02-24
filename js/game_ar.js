// =============================================================================
// AR TOY TRUCK SIMULATOR: MASTER ARCHITECT EDITION (V22 - THE ULTIMATE HYBRID)
// OFICINA MINORITY REPORT (PALITINHOS), NAVEGAÇÃO AR REAL E COLETA FÍSICA
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1) CAMERA MANAGER (INTEGRADO COM O CORE.JS)
    // =========================================================================
    const CameraManager = {
        safeSwitch: async function(mode) {
            // Usa a função nativa do core.js para trocar a câmera sem quebrar a IA
            if (window.System && typeof window.System.switchCamera === 'function') {
                try {
                    await window.System.switchCamera(mode);
                    window.System.currentCameraMode = mode;
                    return true;
                } catch(e) {
                    console.error("Erro ao trocar câmera", e);
                    return false;
                }
            }
            return false;
        },
        startRearCamera: async function() { return await this.safeSwitch('environment'); },
        startFrontCamera: async function() { return await this.safeSwitch('user'); }
    };

    // =========================================================================
    // 2) FRONT_AR_OFFICE (MINORITY REPORT COM MOVENET)
    // =========================================================================
    const GestureOffice = {
        isActive: false, 
        cursor: { x: 0, y: 0, active: false }, 
        hoverTime: 0, 
        hoveredBtn: null, 
        eventCallback: null,
        
        buttons: [
            { id: 'REFUEL', label: 'ABASTECER', x: 0, y: 0, w: 160, h: 60, color: '#f39c12' },
            { id: 'REPAIR', label: 'REPARAR', x: 0, y: 0, w: 160, h: 60, color: '#e74c3c' },
            { id: 'UPG_ENGINE', label: 'UPG MOTOR', x: 0, y: 0, w: 160, h: 60, color: '#3498db' },
            { id: 'UPG_TANK', label: 'UPG TANQUE', x: 0, y: 0, w: 160, h: 60, color: '#9b59b6' },
            { id: 'UPG_RADAR', label: 'UPG RADAR', x: 0, y: 0, w: 160, h: 60, color: '#00ffff' },
            { id: 'UPG_TRUCK', label: 'UPG CHASSI', x: 0, y: 0, w: 160, h: 60, color: '#f1c40f' },
            { id: 'EXIT', label: 'SAIR DA BASE', x: 0, y: 0, w: 260, h: 60, color: '#00ff66' }
        ],

        init: function(callback) {
            this.eventCallback = callback; 
            this.isActive = true; 
            this.cursor = { x: window.innerWidth/2, y: window.innerHeight/2, active: false }; 
            this.hoverTime = 0; 
            this.hoveredBtn = null;
        },

        update: function(ctx, w, h, dt, gameState, pose) {
            if (!this.isActive) return;

            const cx = w / 2; const cy = h / 2;
            const gap = 10; const btnW = Math.min(160, (w/2) - 20);
            
            // Posicionamento responsivo dos botões
            this.buttons[0].x = cx - btnW - gap; this.buttons[0].y = cy - 80;  this.buttons[0].w = btnW;
            this.buttons[1].x = cx + gap;        this.buttons[1].y = cy - 80;  this.buttons[1].w = btnW;
            this.buttons[2].x = cx - btnW - gap; this.buttons[2].y = cy - 10;  this.buttons[2].w = btnW;
            this.buttons[3].x = cx + gap;        this.buttons[3].y = cy - 10;  this.buttons[3].w = btnW;
            this.buttons[4].x = cx - btnW - gap; this.buttons[4].y = cy + 60;  this.buttons[4].w = btnW;
            this.buttons[5].x = cx + gap;        this.buttons[5].y = cy + 60;  this.buttons[5].w = btnW;
            this.buttons[6].x = cx - 130;        this.buttons[6].y = cy + 140; this.buttons[6].w = 260;

            // Fundo escuro sobre a câmera frontal
            ctx.fillStyle = "rgba(0, 15, 30, 0.85)"; ctx.fillRect(0, 0, w, h);
            
            // PROCESSAMENTO MOVENET (OS BRAÇOS EM PALITINHO - MINORITY REPORT)
            this.cursor.active = false;
            if (pose && pose.length > 0) {
                ctx.lineWidth = 4;
                ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
                ctx.fillStyle = "#fff";

                const drawBone = (p1Name, p2Name) => {
                    const kp1 = pose.find(k => k.name === p1Name);
                    const kp2 = pose.find(k => k.name === p2Name);
                    if (kp1 && kp2 && kp1.score > 0.3 && kp2.score > 0.3) {
                        // 640x480 é a resolução base do core.js. Espelhamos o X para câmera frontal.
                        const x1 = ((640 - kp1.x) / 640) * w; const y1 = (kp1.y / 480) * h;
                        const x2 = ((640 - kp2.x) / 640) * w; const y2 = (kp2.y / 480) * h;
                        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                        ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI*2); ctx.fill();
                        ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI*2); ctx.fill();
                    }
                };

                // Desenha os braços
                drawBone('left_shoulder', 'left_elbow'); drawBone('left_elbow', 'left_wrist');
                drawBone('right_shoulder', 'right_elbow'); drawBone('right_elbow', 'right_wrist');

                // Define o pulso dominante (o mais alto na tela) como o cursor
                const rw = pose.find(k => k.name === 'right_wrist');
                const lw = pose.find(k => k.name === 'left_wrist');
                let domWrist = null;
                
                if (rw && rw.score > 0.3 && lw && lw.score > 0.3) {
                    domWrist = rw.y < lw.y ? rw : lw;
                } else if (rw && rw.score > 0.3) { domWrist = rw; } 
                else if (lw && lw.score > 0.3) { domWrist = lw; }

                if (domWrist) {
                    this.cursor.x = ((640 - domWrist.x) / 640) * w;
                    this.cursor.y = (domWrist.y / 480) * h;
                    this.cursor.active = true;
                }
            }

            // HUD da Oficina
            ctx.fillStyle = "#00ffff"; ctx.textAlign = "center"; ctx.font = "bold clamp(24px, 6vw, 40px) 'Russo One'"; ctx.fillText("OFICINA HOLOGRÁFICA", cx, Math.max(40, cy - 160));
            ctx.fillStyle = "#00ff66"; ctx.font = "bold clamp(18px, 4vw, 24px) 'Chakra Petch'"; ctx.fillText(`SALDO: R$ ${Math.floor(gameState.displayMoney).toLocaleString()}`, cx, Math.max(70, cy - 130));
            ctx.fillStyle = "#fff"; ctx.font = "clamp(12px, 3vw, 16px) Arial"; ctx.fillText(`VIDA: ${Math.floor(gameState.health)}/100 | COMB: ${Math.floor(gameState.displayFuel)}/${gameState.stats.maxFuel}`, cx, Math.max(90, cy - 110));

            let currentlyHovering = null;

            // Renderiza e verifica hover dos botões
            this.buttons.forEach(btn => {
                let isHover = false;
                if (this.cursor.active) {
                    if (this.cursor.x > btn.x && this.cursor.x < btn.x + btn.w && this.cursor.y > btn.y && this.cursor.y < btn.y + btn.h) { 
                        isHover = true; currentlyHovering = btn.id; 
                    }
                }
                
                ctx.fillStyle = isHover ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.6)"; ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
                ctx.strokeStyle = btn.color; ctx.lineWidth = isHover ? 4 : 2; ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
                
                ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Chakra Petch'"; ctx.textAlign = "center"; ctx.fillText(btn.label, btn.x + btn.w/2, btn.y + btn.h/2 + 2);
                ctx.font = "12px Arial"; ctx.fillStyle = btn.color; let costTxt = "";
                
                if(btn.id==='REFUEL') costTxt = `R$ ${Math.floor((gameState.stats.maxFuel - gameState.fuel)*2)}`;
                if(btn.id==='REPAIR') costTxt = `R$ ${Math.floor((100 - gameState.health)*5)}`;
                if(btn.id==='UPG_ENGINE') costTxt = gameState.upgrades.engine.lvl < gameState.upgrades.engine.max ? `R$ ${gameState.upgrades.engine.cost}` : 'MÁX';
                if(btn.id==='UPG_TANK') costTxt = gameState.upgrades.tank.lvl < gameState.upgrades.tank.max ? `R$ ${gameState.upgrades.tank.cost}` : 'MÁX';
                if(btn.id==='UPG_RADAR') costTxt = gameState.upgrades.radar.lvl < gameState.upgrades.radar.max ? `R$ ${gameState.upgrades.radar.cost}` : 'MÁX';
                if(btn.id==='UPG_TRUCK') costTxt = gameState.upgrades.truck.lvl < gameState.upgrades.truck.max ? `R$ ${gameState.upgrades.truck.cost}` : 'MÁX';
                if(costTxt) ctx.fillText(costTxt, btn.x + btn.w/2, btn.y + btn.h - 8);
            });

            // Lógica do Clique Gestual (Hover por 1 segundo)
            if (currentlyHovering) {
                if (this.hoveredBtn === currentlyHovering) {
                    this.hoverTime += dt;
                    if (this.hoverTime >= 1.0) { 
                        if (this.eventCallback) this.eventCallback(this.hoveredBtn); 
                        this.hoverTime = 0; 
                    }
                } else { this.hoveredBtn = currentlyHovering; this.hoverTime = 0; }
            } else { this.hoveredBtn = null; this.hoverTime = 0; }

            // Desenha Cursor
            if (this.cursor.active) {
                ctx.fillStyle = "rgba(0, 255, 255, 0.8)"; ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, 10, 0, Math.PI*2); ctx.fill();
                if (this.hoverTime > 0) {
                    ctx.strokeStyle = "#00ff66"; ctx.lineWidth = 4; 
                    ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, 25, -Math.PI/2, -Math.PI/2 + (this.hoverTime/1.0)*(Math.PI*2)); ctx.stroke();
                }
            } else {
                ctx.fillStyle = "#aaa"; ctx.font = "14px Arial"; ctx.textAlign = "center"; 
                ctx.fillText("LEVANTE A MÃO PARA A CÂMERA CONTROLAR (OU TOQUE)", cx, h - 20);
            }
        },

        destroy: function() { this.isActive = false; this.cursor = { x: 0, y: 0, active: false }; }
    };

    // =========================================================================
    // 3) ARQUITETURA GLOBAL (MÁQUINA DE ESTADOS)
    // =========================================================================
    let particles = [];
    
    const Game = {
        state: 'UNINITIALIZED', lastTime: 0, timeTotal: 0, score: 0, transitionAlpha: 0, transitionPhase: 0, pendingCamPromise: null,
        vPos: { x: 0, y: 0 }, baseHeading: 0, currentHeading: 0, virtualSpeed: 0, targetSpeed: 0, manualAccelerate: false, deviceForce: 0,
        _deviceOrientationHandler: null, _deviceMotionHandler: null, _sensorsReady: false,
        
        objectModel: null, detectedItems: [], lastAiTime: 0, aiIntervalMs: 500, aiIntervalId: null, aiProcessing: false,
        floorColor: { r: 0, g: 0, b: 0 }, targetColor: { r: 0, g: 0, b: 0 },
        activeAnomaly: null, anomalies: [], spawnTimer: 0,
        
        // INTERAÇÃO FÍSICA DE COLETA
        pickupTimer: 0, cooldown: 0,
        
        currentEvent: null, eventTimer: 0,
        displayMoney: 0, displayFuel: 100, collectGlow: 0, collectZoom: 0, baseFlash: 0,
        currentMission: { type: 'NORMAL', goal: 3, progress: 0, timer: 0, active: false },
        
        health: 100, fuel: 100, wear: { motor: 0, wheels: 0 }, money: 0, cargo: [], level: 1, xp: 0,
        stats: { maxFuel: 100, maxCargo: 3, baseSpeed: 20, scanPower: 1.0, radarRange: 150, wearRate: 0.3 },
        upgrades: { engine: { lvl: 1, max: 5, cost: 1000 }, tank: { lvl: 1, max: 5, cost: 800 }, radar: { lvl: 1, max: 5, cost: 1200 }, truck: { lvl: 1, max: 5, cost: 1500 } },
        colors: { main: '#00ffff', danger: '#ff003c', success: '#00ff66', warn: '#f1c40f', panel: 'rgba(0,15,30,0.85)', rare: '#ff00ff' },

        init: function() {
            this.state = 'INIT'; this.lastTime = performance.now(); this.timeTotal = 0; this.score = 0;
            this.health = 100; this.fuel = this.stats.maxFuel; this.wear = { motor: 0, wheels: 0 }; this.displayFuel = this.fuel;
            this.money = 0; this.displayMoney = 0; this.xp = 0; this.level = 1; this.cargo = []; this.anomalies = [];
            this.pickupTimer = 0; this.collectGlow = 0; this.collectZoom = 0; this.baseFlash = 0; particles = [];
            
            this.generateMission(); this.setupSensors(); this.setupInput(); this.changeState('BOOT');
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
                case 'BOOT': this.loadAIModel(); break;
                case 'CALIBRATION': window.System.msg("SISTEMAS ONLINE."); break;
                case 'PLAY_REAR_AR':
                    this.startAILoop();
                    if (!this.currentMission.active) this.generateMission();
                    break;
                case 'WAITING_PICKUP':
                    this.pickupTimer = 0;
                    if(window.Sfx) window.Sfx.play(800, 'square', 0.2, 0.2);
                    break;
                case 'ENTER_BASE_TRANSITION':
                    this.stopAILoop(); this.transitionAlpha = 0; this.transitionPhase = 'FADE_OUT'; this.virtualSpeed = 0; this.manualAccelerate = false;
                    break;
                case 'FRONT_AR_OFFICE':
                    this.virtualSpeed = 0; this.deliverCargo(); this.baseFlash = 1.0; GestureOffice.init(this.handleOfficeAction.bind(this));
                    break;
                case 'EXIT_BASE_TRANSITION':
                    this.transitionAlpha = 0; this.transitionPhase = 'FADE_OUT'; this.manualAccelerate = false;
                    break;
                case 'TOW_MODE':
                    window.System.msg("SISTEMAS CRÍTICOS! VOLTANDO À BASE.");
                    break;
                case 'GAME_OVER':
                    if(window.System && typeof window.System.gameOver === 'function') { window.System.gameOver(this.score, true, this.money); }
                    break;
            }
        },

        setupSensors: function() {
            if (!this._deviceOrientationHandler) { this._deviceOrientationHandler = (e) => { this.currentHeading = e.alpha || 0; }; }
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
                    this.baseHeading = this.currentHeading; this.vPos = { x: 0, y: 0 }; this.changeState('PLAY_REAR_AR');
                }
                else if (this.state === 'PLAY_REAR_AR' || this.state === 'TOW_MODE') {
                    let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
                    const btnS = Math.min(50, w * 0.15);
                    // Botão da Garagem
                    if (y > 60 && y < 60 + btnS && x > w - btnS - 10 && x < w - 10) {
                        if (distToBase < 30) {
                            this.pendingCamPromise = CameraManager.startFrontCamera(); this.changeState('ENTER_BASE_TRANSITION');
                        } else { window.System.msg("MUITO LONGE DA BASE!"); } return;
                    }
                    const accR = Math.min(45, w * 0.12);
                    if (x < 30 + accR*2 && y > h - 80 - accR*2 && this.state !== 'TOW_MODE') { this.manualAccelerate = true; }
                }
                else if (this.state === 'FRONT_AR_OFFICE') {
                    // Fallback Touch se o Minority Report não detetar
                    GestureOffice.buttons.forEach(btn => { if (x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) { if (GestureOffice.eventCallback) GestureOffice.eventCallback(btn.id); } });
                }
            };
            canvas.onpointerup = () => { this.manualAccelerate = false; };
        },

        loadAIModel: async function() {
            const loadTask = new Promise((resolve) => {
                try {
                    if (typeof cocoSsd === 'undefined') {
                        const script = document.createElement('script'); script.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                        script.onload = async () => { if (typeof cocoSsd !== 'undefined') { this.objectModel = await cocoSsd.load().catch(() => null); } resolve(); };
                        script.onerror = () => { this.objectModel = null; resolve(); }; document.head.appendChild(script);
                    } else { cocoSsd.load().then(model => { this.objectModel = model; resolve(); }).catch(() => { this.objectModel = null; resolve(); }); }
                } catch (e) { this.objectModel = null; resolve(); }
            });
            const timeoutTask = new Promise(resolve => setTimeout(resolve, 5000));
            await Promise.race([loadTask, timeoutTask]);
            this.changeState('CALIBRATION');
        },

        startAILoop: function() {
            if (this.aiIntervalId !== null) { clearInterval(this.aiIntervalId); this.aiIntervalId = null; }
            this.aiIntervalId = setInterval(async () => {
                if (this.aiProcessing) return;
                // A IA roda quando está procurando ou quando já pediu para tirar o objeto
                if ((this.state === 'PLAY_REAR_AR' || this.state === 'WAITING_PICKUP') && this.objectModel && window.System?.video && window.System.video.readyState === 4) {
                    this.aiProcessing = true;
                    try { const preds = await this.objectModel.detect(window.System.video); this.detectedItems = preds || []; } 
                    catch(e) { this.detectedItems = []; } finally { this.aiProcessing = false; }
                }
            }, this.aiIntervalMs);
        },
        
        stopAILoop: function() {
            if (this.aiIntervalId !== null) { clearInterval(this.aiIntervalId); this.aiIntervalId = null; }
            this.aiProcessing = false;
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now(); let dt = (now - this.lastTime) / 1000; if (isNaN(dt) || dt > 0.1 || dt < 0) dt = 0.016; this.lastTime = now; this.timeTotal += dt;

            if (isNaN(this.displayMoney)) this.displayMoney = 0; if (isNaN(this.displayFuel)) this.displayFuel = 100;
            this.displayMoney += (this.money - this.displayMoney) * 10 * dt; this.displayFuel += (this.fuel - this.displayFuel) * 5 * dt;

            let fps = 1 / dt; let newInterval = (fps < 25) ? 1000 : 500;
            if (this.aiIntervalMs !== newInterval) { this.aiIntervalMs = newInterval; if (this.state === 'PLAY_REAR_AR' || this.state === 'WAITING_PICKUP') { this.startAILoop(); } }

            if (!['FRONT_AR_OFFICE', 'ENTER_BASE_TRANSITION', 'EXIT_BASE_TRANSITION'].includes(this.state)) {
                ctx.save();
                if (this.virtualSpeed > 0.1 && this.state === 'PLAY_REAR_AR') {
                    let susY = Math.sin(this.timeTotal * this.virtualSpeed * 1.5) * (this.virtualSpeed / this.stats.baseSpeed) * 3; ctx.translate(0, susY);
                }
                if (this.collectZoom > 0) {
                    let z = 1 + (this.collectZoom * 0.03); ctx.translate(w/2, h/2); ctx.scale(z, z); ctx.translate(-w/2, -h/2); this.collectZoom -= dt * 2;
                }
                if (window.System?.video && window.System.video.readyState === 4) {
                    const vW = window.System.video.videoWidth || w; const vH = window.System.video.videoHeight || h;
                    const videoRatio = vW / vH; const canvasRatio = w / h; let drawW = w, drawH = h, drawX = 0, drawY = 0;
                    if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
                    ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
                } else { ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h); }
                
                if (this.baseFlash > 0) { ctx.fillStyle = `rgba(0, 255, 100, ${this.baseFlash * 0.5})`; ctx.fillRect(0, 0, w, h); this.baseFlash -= dt * 1.5; }
                if (this.state === 'WAITING_PICKUP') { ctx.fillStyle = `rgba(255, 0, 60, ${Math.abs(Math.sin(this.timeTotal*10))*0.15})`; ctx.fillRect(0, 0, w, h); }
                else { ctx.fillStyle = `rgba(0, 50, 60, ${0.1 + Math.sin(this.timeTotal*2)*0.05})`; ctx.fillRect(0, 0, w, h); }
                ctx.restore();
            }

            switch (this.state) {
                case 'BOOT': this.drawOverlay(ctx, w, h, "INICIALIZANDO", "Carregando Engine Premium..."); break;
                case 'CALIBRATION': this.drawOverlay(ctx, w, h, "PONTO ZERO", "Aponte o caminhão para a pista e TOQUE"); break;
                case 'PLAY_REAR_AR':
                case 'WAITING_PICKUP':
                case 'TOW_MODE':
                    this.updatePhysics(dt); this.updateEvents(dt); this.spawnAnomalies(dt); this.processAR(ctx, w, h, dt); this.drawHUD(ctx, w, h); break;
                case 'ENTER_BASE_TRANSITION': this.processTransition(ctx, w, h, dt, 'startFrontCamera', 'FRONT_AR_OFFICE'); break;
                case 'FRONT_AR_OFFICE':
                    if (window.System?.video && window.System.video.readyState === 4) {
                        const vW = window.System.video.videoWidth || w; const vH = window.System.video.videoHeight || h;
                        const vr = vW / vH; const cr = w / h; let dw = w, dh = h, dx = 0, dy = 0;
                        if (vr > cr) { dw = h * vr; dx = (w - dw) / 2; } else { dh = w / vr; dy = (h - dh) / 2; }
                        ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(window.System.video, -dx, dy, dw, dh); ctx.restore();
                    }
                    GestureOffice.update(ctx, w, h, dt, this, pose); break;
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
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.textAlign="center"; ctx.fillText("SISTEMAS REINICIANDO...", w/2, h/2);
            } else if (this.transitionPhase === 'FADE_IN') {
                this.transitionAlpha -= dt * 3.0;
                if (this.transitionAlpha <= 0) { this.transitionAlpha = 0; this.changeState(nextState); }
            }
            if (this.transitionPhase !== 'SWITCH_CAM') { ctx.fillStyle = `rgba(0,0,0,${this.transitionAlpha})`; ctx.fillRect(0, 0, w, h); }
        },

        updatePhysics: function(dt) {
            if (this.cooldown > 0) this.cooldown -= dt;

            let accelInput = (this.manualAccelerate || this.deviceForce > 0.5) ? (5.0 + this.upgrades.engine.lvl) : 0;
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
                this.vPos.x += Math.sin(rad) * currentSpeed * dt; this.vPos.y -= Math.cos(rad) * currentSpeed * dt; 

                let wearMod = 1.0 - ((this.upgrades.truck?.lvl || 1) * 0.05);
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
            // Gera anomalias que dão bónus de dinheiro se encontradas no radar virtual, mas NÃO são obrigatórias para achar brinquedos.
            if (this.anomalies.length < 5 && this.spawnTimer > 2.0) {
                this.spawnTimer = 0; let isRare = Math.random() < 0.15; let dist = 40 + Math.random() * (100 + this.level * 20); let ang = Math.random() * Math.PI * 2;
                this.anomalies.push({ id: Math.random().toString(36), x: this.vPos.x + Math.cos(ang) * dist, y: this.vPos.y + Math.sin(ang) * dist, type: isRare ? 'RARE' : 'NORMAL', val: isRare ? 5000 : (500 + Math.floor(Math.random()*500)), life: isRare ? 25 : 999 });
            }
            this.anomalies.forEach(a => { if (a.life < 999) a.life -= dt; }); this.anomalies = this.anomalies.filter(a => a.life > 0);
        },

        getAverageColor: function(ctx, x, y, w, h) {
            try {
                if (w <= 0 || h <= 0) return {r:0,g:0,b:0};
                const data = ctx.getImageData(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h)).data;
                let r=0, g=0, b=0; for (let i=0; i<data.length; i+=4) { r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
                let c = data.length/4; if (c === 0) return {r:0, g:0, b:0}; return {r:r/c, g:g/c, b:b/c};
            } catch(e) { return {r:0,g:0,b:0}; }
        },

        processAR: function(ctx, w, h, dt) {
            if (this.state === 'TOW_MODE') return; 

            const cx = w / 2; const cy = h / 2;
            let visualFound = false; let foundBox = null;
            const vW = window.System?.video?.videoWidth || w; const vH = window.System?.video?.videoHeight || h;
            const sX = w / vW; const sY = h / vH;

            // 1) RECONHECIMENTO LIVRE DE BRINQUEDOS (IA)
            // A câmara deteta brinquedos em qualquer lugar, não precisa de estar perto de "anomalias" virtuais
            const allowedClasses = ['car', 'truck', 'bus', 'train', 'mouse', 'remote', 'cell phone'];
            
            this.detectedItems.forEach(item => {
                if (!allowedClasses.includes(item.class) || item.score < 0.25) return;
                const bW = item.bbox[2]*sX; const bH = item.bbox[3]*sY;
                // FILTRO DE TAMANHO (Impede de ler coisas gigantes na casa)
                if (bW < w * 0.05 || bW > w * 0.6) return; 
                
                const cX = (item.bbox[0]*sX) + bW/2; const cY = (item.bbox[1]*sY) + bH/2;
                if (Math.hypot(cX - cx, cY - cy) < Math.min(w, h) * 0.4) {
                    visualFound = true; foundBox = { x: item.bbox[0]*sX, y: item.bbox[1]*sY, w: bW, h: bH, label: "BRINQUEDO" };
                }
            });

            // Fallback Óptico (Cor) para garantir que sempre acha algo mesmo sem IA
            if (!visualFound) {
                this.floorColor = this.getAverageColor(ctx, cx - 50, h * 0.85, 100, 40);
                this.targetColor = this.getAverageColor(ctx, cx - 40, cy - 40, 80, 80);
                let diff = Math.abs(this.floorColor.r - this.targetColor.r) + Math.abs(this.floorColor.g - this.targetColor.g) + Math.abs(this.floorColor.b - this.targetColor.b);
                if (diff > 80) visualFound = true; 
            }

            if (this.state === 'PLAY_REAR_AR') {
                if (visualFound && this.cargo.length < this.stats.maxCargo && this.cooldown <= 0) {
                    this.changeState('WAITING_PICKUP');
                }

                if (foundBox) {
                    ctx.strokeStyle = "rgba(0, 255, 255, 0.8)"; ctx.lineWidth = 3; ctx.strokeRect(foundBox.x, foundBox.y, foundBox.w, foundBox.h);
                }
            } 
            else if (this.state === 'WAITING_PICKUP') {
                const uiY = h - 140;
                ctx.fillStyle = this.colors.danger; ctx.textAlign = "center"; ctx.font = "bold clamp(20px, 5vw, 40px) 'Russo One'";
                ctx.fillText("ALVO BLOQUEADO!", cx, uiY - 45);
                ctx.fillStyle = "#fff"; ctx.font = "bold clamp(14px, 3.5vw, 20px) Arial";
                ctx.fillText("PARE O CAMINHÃO E REMOVA COM A MÃO!", cx, uiY - 15);

                if (foundBox) { ctx.strokeStyle = this.colors.danger; ctx.lineWidth = 4; ctx.strokeRect(foundBox.x, foundBox.y, foundBox.w, foundBox.h); }

                // O GRANDE SEGREDO FÍSICO: Se a câmara deixou de ver, é porque a mão tirou!
                if (!visualFound) {
                    this.pickupTimer += dt;
                    ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(w*0.1, uiY + 10, w*0.8, 20);
                    ctx.fillStyle = this.colors.success; ctx.fillRect(w*0.1, uiY + 10, (this.pickupTimer/1.0)*(w*0.8), 20);
                    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(w*0.1, uiY + 10, w*0.8, 20);
                    
                    if (this.pickupTimer > 1.0) { // Ficou 1 segundo sem ver o objeto
                        // Se estiver perto de uma anomalia virtual, ganha o valor dela, senão ganha o padrão.
                        let nearestDist = 9999; let activeAnomaly = null;
                        this.anomalies.forEach(ano => { let d = Math.hypot(ano.x - this.vPos.x, ano.y - this.vPos.y); if (d < nearestDist) { nearestDist = d; activeAnomaly = ano; } });
                        
                        let val = (activeAnomaly && nearestDist < 30) ? activeAnomaly.val : (500 + Math.floor(Math.random() * 500));
                        this.cargo.push(val); this.score += val / 10;
                        window.System.msg("BRINQUEDO NA CAÇAMBA!");
                        
                        if (this.currentMission && this.currentMission.active) {
                            this.currentMission.progress++;
                            if (this.currentMission.progress >= this.currentMission.goal) this.completeMission();
                        }
                        if (activeAnomaly && nearestDist < 30) this.anomalies = this.anomalies.filter(a => a.id !== activeAnomaly.id);

                        this.changeState('PLAY_REAR_AR'); this.cooldown = 3.0; 
                        if(window.Gfx && typeof window.Gfx.shakeScreen === 'function') window.Gfx.shakeScreen(20);
                        if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
                        this.collectGlow = 1.0; this.collectZoom = 1.0; this.spawnParticles(cx, cy, 40, this.colors.main);
                    }
                } else {
                    this.pickupTimer = Math.max(0, this.pickupTimer - dt); // Reseta se o brinquedo voltar para a câmara
                }

                if (this.virtualSpeed > 10) { this.changeState('PLAY_REAR_AR'); window.System.msg("ALVO ABANDONADO"); }
            }
        },

        drawHUD: function(ctx, w, h) {
            let fuelPct = this.displayFuel / this.stats.maxFuel;
            let isFull = this.cargo.length >= this.stats.maxCargo;
            let radHead = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
            
            if (this.collectGlow > 0) { ctx.fillStyle = `rgba(0, 255, 255, ${this.collectGlow * 0.3})`; ctx.fillRect(0, 0, w, h); this.collectGlow -= 0.03; }

            // AR WAYPOINTS (NAVEGAÇÃO REAL PARA A BASE)
            const drawARWaypoint = (worldX, worldY, label, color, isBase) => {
                let dx = worldX - this.vPos.x; let dy = worldY - this.vPos.y; let dist = Math.hypot(dx, dy);
                let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2);
                let fwdAngle = Math.atan2(Math.sin(angle + Math.PI/2), Math.cos(angle + Math.PI/2)); 
                let fov = Math.PI / 2.5; 
                
                if (Math.abs(fwdAngle) < fov) {
                    let projX = (w/2) + (fwdAngle / fov) * (w/2); let projY = h/2 + Math.sin(this.timeTotal * 4) * 10;
                    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(projX, projY - 25); ctx.lineTo(projX + 15, projY); ctx.lineTo(projX, projY + 25); ctx.lineTo(projX - 15, projY); ctx.fill();
                    ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Russo One'"; ctx.textAlign = "center"; ctx.fillText(label, projX, projY - 35);
                    ctx.font = "bold 12px Arial"; ctx.fillText(Math.floor(dist) + "m", projX, projY + 45);
                } else {
                    // Setas indicando para onde virar o caminhão real
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
                    let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2); let sD = (dist / this.stats.radarRange) * rR;
                    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rCx + Math.cos(angle)*sD, rCy + Math.sin(angle)*sD, sz, 0, Math.PI*2); ctx.fill();
                }
            };
            drawBlip(0, 0, this.colors.success, 5, false); // Base
            if(!isFull) this.anomalies.forEach(a => drawBlip(a.x, a.y, a.type==='RARE'?this.colors.rare:this.colors.warn, 3, a.type==='RARE'));
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(rCx, rCy - 6); ctx.lineTo(rCx+4, rCy+4); ctx.lineTo(rCx-4, rCy+4); ctx.fill(); // Player

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

        handleOfficeAction: function(actionId) {
            const buyObj = (cost, callback) => {
                if (this.money >= cost && cost > 0) { this.money -= cost; callback(); if(window.Sfx && typeof window.Sfx.coin === 'function') window.Sfx.coin(); return true; }
                if(window.Sfx && typeof window.Sfx.error === 'function') window.Sfx.error(); return false;
            };

            let fuelCost = Math.floor((this.stats.maxFuel - this.fuel) * 2); let repCost = Math.floor((100 - this.health) * 5);
            if (actionId === 'REFUEL') buyObj(fuelCost, () => this.fuel = this.stats.maxFuel);
            if (actionId === 'REPAIR') buyObj(repCost, () => { this.health = 100; });
            
            if (actionId === 'UPG_ENGINE') { let u = this.upgrades.engine; if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); }); }
            if (actionId === 'UPG_TANK') { let u = this.upgrades.tank; if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); }); }
            if (actionId === 'UPG_RADAR') { let u = this.upgrades.radar; if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); }); }
            if (actionId === 'UPG_TRUCK') { let u = this.upgrades.truck; if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); }); }

            if (actionId === 'EXIT') { this.pendingCamPromise = CameraManager.startRearCamera(); this.changeState('EXIT_BASE_TRANSITION'); }
        },

        applyStats: function() {
            this.stats.baseSpeed = 20 + (this.upgrades.engine.lvl * 5); this.stats.maxFuel = 100 + (this.upgrades.tank.lvl * 50); this.stats.radarRange = 150 + (this.upgrades.radar.lvl * 50); this.stats.wearRate = Math.max(0.1, 0.3 - (this.upgrades.truck.lvl * 0.05));
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