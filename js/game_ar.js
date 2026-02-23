// =============================================================================
// AR TOY TRUCK SIMULATOR: MASTER ARCHITECT EDITION (V17 - THE REAL AR EXPERIENCE)
// AR WAYPOINTS 3D, CAMERA SWITCH INSTANTÂNEO, UI LIMPA E TOUCH FALLBACK
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1) CAMERA MANAGER OBRIGATÓRIO (FIX DE PERMISSÃO)
    // =========================================================================
    const CameraManager = {
        isSwitching: false,
        timeoutMs: 5000,

        stopCurrentStream: function() {
            const video = window.System?.video;
            if (video && video.srcObject) {
                const tracks = video.srcObject.getTracks();
                tracks.forEach(track => {
                    track.stop();
                });
                video.srcObject = null;
            }
        },

        safeSwitch: async function(mode) {
            if (this.isSwitching) return false;
            this.isSwitching = true;
            this.stopCurrentStream();

            try {
                const constraints = {
                    video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                };

                const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Camera Timeout")), this.timeoutMs));
                
                const stream = await Promise.race([streamPromise, timeoutPromise]);
                
                const video = window.System?.video;
                if (!video) {
                    this.isSwitching = false;
                    return false;
                }

                video.srcObject = stream;
                
                if (mode === 'environment') {
                    video.style.transform = "none";
                } else {
                    video.style.transform = "scaleX(-1)";
                }

                const metadataPromise = new Promise((resolve) => {
                    video.onloadedmetadata = () => resolve();
                });
                const metaTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Metadata Timeout")), 3000));
                
                await Promise.race([metadataPromise, metaTimeout]);

                try {
                    await video.play();
                } catch(playErr) {}

                this.isSwitching = false;
                window.System.currentCameraMode = mode;
                return true;
            } catch (err) {
                this.isSwitching = false;
                return false; 
            }
        },

        startRearCamera: async function() {
            return await this.safeSwitch('environment');
        },

        startFrontCamera: async function() {
            return await this.safeSwitch('user');
        }
    };

    // =========================================================================
    // 2) FRONT_AR_OFFICE (GESTURE MODULE)
    // =========================================================================
    const GestureOffice = {
        hands: null,
        isActive: false,
        cursor: { x: 0, y: 0, active: false },
        hoverTime: 0,
        hoveredBtn: null,
        lastProcessTime: 0,
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

        init: async function(callback) {
            this.eventCallback = callback;
            this.isActive = true;
            this.cursor = { x: window.innerWidth/2, y: window.innerHeight/2, active: false };
            this.hoverTime = 0;
            this.hoveredBtn = null;

            if (typeof window.Hands === 'undefined') {
                await this.loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
                await this.loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
                await this.loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
            }

            if (!this.hands && window.Hands) {
                this.hands = new window.Hands({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                });
                this.hands.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.hands.onResults(this.onResults.bind(this));
            }
        },

        loadScript: function(src) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        },

        onResults: function(results) {
            if (!this.isActive) return;
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const indexFinger = results.multiHandLandmarks[0][8]; 
                this.cursor.x = (1 - indexFinger.x) * window.innerWidth;
                this.cursor.y = indexFinger.y * window.innerHeight;
                this.cursor.active = true;
            } else {
                this.cursor.active = false;
                this.hoverTime = 0;
            }
        },

        update: async function(ctx, w, h, dt, gameState) {
            if (!this.isActive) return;

            const now = Date.now();
            if (now - this.lastProcessTime > 100 && window.System?.video && window.System.video.readyState === 4) {
                this.lastProcessTime = now;
                try { await this.hands.send({image: window.System.video}); } catch(e) {}
            }

            const cx = w / 2; const cy = h / 2;
            
            // Layout responsivo Oficina
            const gap = 10;
            const btnW = Math.min(160, (w/2) - 20);
            this.buttons[0].x = cx - btnW - gap; this.buttons[0].y = cy - 80;  this.buttons[0].w = btnW;
            this.buttons[1].x = cx + gap;        this.buttons[1].y = cy - 80;  this.buttons[1].w = btnW;
            this.buttons[2].x = cx - btnW - gap; this.buttons[2].y = cy - 10;  this.buttons[2].w = btnW;
            this.buttons[3].x = cx + gap;        this.buttons[3].y = cy - 10;  this.buttons[3].w = btnW;
            this.buttons[4].x = cx - btnW - gap; this.buttons[4].y = cy + 60;  this.buttons[4].w = btnW;
            this.buttons[5].x = cx + gap;        this.buttons[5].y = cy + 60;  this.buttons[5].w = btnW;
            this.buttons[6].x = cx - 130;        this.buttons[6].y = cy + 140; this.buttons[6].w = 260;

            ctx.fillStyle = "rgba(0, 15, 30, 0.9)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#00ffff"; ctx.textAlign = "center";
            ctx.font = "bold clamp(24px, 6vw, 40px) 'Russo One'";
            ctx.fillText("OFICINA HOLOGRÁFICA", cx, Math.max(40, cy - 140));
            
            ctx.fillStyle = "#00ff66"; ctx.font = "bold clamp(18px, 4vw, 24px) 'Chakra Petch'";
            ctx.fillText(`SALDO: R$ ${Math.floor(gameState.displayMoney).toLocaleString()}`, cx, Math.max(70, cy - 110));

            let currentlyHovering = null;

            this.buttons.forEach(btn => {
                let isHover = false;
                if (this.cursor.active) {
                    if (this.cursor.x > btn.x && this.cursor.x < btn.x + btn.w &&
                        this.cursor.y > btn.y && this.cursor.y < btn.y + btn.h) {
                        isHover = true;
                        currentlyHovering = btn.id;
                    }
                }

                ctx.fillStyle = isHover ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.6)";
                ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
                ctx.strokeStyle = btn.color; ctx.lineWidth = isHover ? 4 : 2;
                ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
                
                ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Chakra Petch'"; ctx.textAlign = "center";
                ctx.fillText(btn.label, btn.x + btn.w/2, btn.y + btn.h/2 + 2);
                
                ctx.font = "12px Arial"; ctx.fillStyle = btn.color;
                let costTxt = "";
                if(btn.id==='REFUEL') costTxt = `R$ ${Math.floor((gameState.stats.maxFuel - gameState.fuel)*2)}`;
                if(btn.id==='REPAIR') costTxt = `R$ ${Math.floor((100 - gameState.health)*5)}`;
                if(btn.id==='UPG_ENGINE') costTxt = gameState.upgrades.engine.lvl < gameState.upgrades.engine.max ? `R$ ${gameState.upgrades.engine.cost}` : 'MÁX';
                if(btn.id==='UPG_TANK') costTxt = gameState.upgrades.tank.lvl < gameState.upgrades.tank.max ? `R$ ${gameState.upgrades.tank.cost}` : 'MÁX';
                if(btn.id==='UPG_RADAR') costTxt = gameState.upgrades.radar.lvl < gameState.upgrades.radar.max ? `R$ ${gameState.upgrades.radar.cost}` : 'MÁX';
                if(btn.id==='UPG_TRUCK') costTxt = gameState.upgrades.truck.lvl < gameState.upgrades.truck.max ? `R$ ${gameState.upgrades.truck.cost}` : 'MÁX';
                if(costTxt) ctx.fillText(costTxt, btn.x + btn.w/2, btn.y + btn.h - 8);
            });

            if (currentlyHovering) {
                if (this.hoveredBtn === currentlyHovering) {
                    this.hoverTime += dt;
                    if (this.hoverTime >= 1.0) { // Reduzido para 1 segundo
                        if (this.eventCallback) this.eventCallback(this.hoveredBtn);
                        this.hoverTime = 0; 
                    }
                } else {
                    this.hoveredBtn = currentlyHovering;
                    this.hoverTime = 0;
                }
            } else {
                this.hoveredBtn = null;
                this.hoverTime = 0;
            }

            if (this.cursor.active) {
                ctx.fillStyle = "rgba(0, 255, 255, 0.8)";
                ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, 10, 0, Math.PI*2); ctx.fill();
                if (this.hoverTime > 0) {
                    ctx.strokeStyle = "#00ff66"; ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(this.cursor.x, this.cursor.y, 25, -Math.PI/2, -Math.PI/2 + (this.hoverTime/1.0)*(Math.PI*2));
                    ctx.stroke();
                }
            } else {
                ctx.fillStyle = "#aaa"; ctx.font = "12px Arial"; ctx.textAlign = "center";
                ctx.fillText("MOSTRE A MÃO PARA A CÂMERA OU TOQUE NOS BOTÕES", cx, h - 20);
            }
        },

        destroy: function() {
            this.isActive = false;
            if (this.hands) {
                this.hands.onResults(() => {});
                if (typeof this.hands.close === 'function') {
                    this.hands.close();
                }
            }
            this.cursor = { x: 0, y: 0, active: false };
        }
    };

    // =========================================================================
    // 3) ARQUITETURA GLOBAL (MÁQUINA DE ESTADOS)
    // =========================================================================
    let particles = [];
    
    const Game = {
        state: 'UNINITIALIZED', 
        lastTime: 0,
        timeTotal: 0,
        score: 0,
        
        transitionAlpha: 0,
        transitionPhase: 0,
        pendingCamPromise: null, // Novo: Guarda a promessa da câmera
        
        vPos: { x: 0, y: 0 },
        baseHeading: 0,
        currentHeading: 0,
        virtualSpeed: 0,
        targetSpeed: 0,
        manualAccelerate: false,
        deviceForce: 0,
        _deviceOrientationHandler: null,
        _deviceMotionHandler: null,
        
        objectModel: null,
        detectedItems: [],
        lastAiTime: 0,
        aiIntervalMs: 500,
        aiIntervalId: null,
        aiProcessing: false,
        floorColor: { r: 0, g: 0, b: 0 },
        targetColor: { r: 0, g: 0, b: 0 },
        activeAnomaly: null,
        anomalies: [],
        spawnTimer: 0,
        
        isExtracting: false,
        extractProgress: 0,
        cooldown: 0,
        currentEvent: null,
        eventTimer: 0,
        _sensorsReady: false,
        
        displayMoney: 0,
        displayFuel: 100,
        collectGlow: 0,
        collectZoom: 0,
        baseFlash: 0,

        currentMission: { type: 'NORMAL', goal: 3, progress: 0, timer: 0, active: false },
        
        health: 100,
        fuel: 100,
        wear: { motor: 0, wheels: 0 },
        money: 0,
        cargo: [],
        level: 1,
        xp: 0,
        
        stats: { maxFuel: 100, maxCargo: 3, baseSpeed: 20, scanPower: 1.0, radarRange: 150, wearRate: 0.3 },
        
        upgrades: {
            engine: { lvl: 1, max: 5, cost: 1000 },
            tank:   { lvl: 1, max: 5, cost: 800 },
            radar:  { lvl: 1, max: 5, cost: 1200 },
            truck:  { lvl: 1, max: 5, cost: 1500 }
        },

        colors: { 
            main: '#00ffff', 
            danger: '#ff003c', 
            success: '#00ff66', 
            warn: '#f1c40f', 
            panel: 'rgba(0,15,30,0.85)', 
            rare: '#ff00ff' 
        },

        init: function() {
            this.state = 'INIT'; 
            this.lastTime = performance.now();
            this.timeTotal = 0;
            this.score = 0;
            this.health = 100;
            this.fuel = this.stats.maxFuel;
            this.wear = { motor: 0, wheels: 0 };
            this.displayFuel = this.fuel;
            this.money = 0;
            this.displayMoney = 0;
            this.xp = 0;
            this.level = 1;
            this.cargo = [];
            this.anomalies = [];
            this.isExtracting = false;
            this.collectGlow = 0;
            this.collectZoom = 0;
            this.baseFlash = 0;
            particles = [];
            
            this.generateMission();
            this.setupSensors();
            this.setupInput();
            this.changeState('BOOT');
        },

        generateMission: function() {
            const types = ['COMBO', 'HEAVY LOAD', 'TIMED'];
            let t = types[Math.floor(Math.random() * types.length)];
            this.currentMission = {
                type: t,
                goal: 3 + Math.floor(Math.random() * 3),
                progress: 0,
                timer: t === 'TIMED' ? 90 : 0,
                active: true
            };
        },

        completeMission: function() {
            this.currentMission.active = false;
            let bonus = this.currentMission.goal * 1000;
            this.money += bonus;
            window.System.msg("OBJETIVO CUMPRIDO! BÔNUS: R$" + bonus);
            this.baseFlash = 1.0;
            if (window.Sfx && typeof window.Sfx.epic === 'function') window.Sfx.epic();
        },

        changeState: function(newState) {
            if (this.state === newState) return;
            
            if (this.state === 'FRONT_AR_OFFICE') GestureOffice.destroy();
            
            this.state = newState;
            
            switch(newState) {
                case 'BOOT':
                    this.loadAIModel();
                    break;
                case 'CALIBRATION':
                    window.System.msg("SISTEMAS ONLINE.");
                    break;
                case 'PLAY_REAR_AR':
                    this.startAILoop();
                    if (!this.currentMission.active) this.generateMission();
                    break;
                case 'ENTER_BASE_TRANSITION':
                    this.stopAILoop();
                    this.transitionAlpha = 0;
                    this.transitionPhase = 'FADE_OUT';
                    this.virtualSpeed = 0;
                    this.isExtracting = false;
                    this.manualAccelerate = false;
                    break;
                case 'FRONT_AR_OFFICE':
                    this.virtualSpeed = 0;
                    this.deliverCargo();
                    this.baseFlash = 1.0;
                    GestureOffice.init(this.handleOfficeAction.bind(this));
                    break;
                case 'EXIT_BASE_TRANSITION':
                    this.transitionAlpha = 0;
                    this.transitionPhase = 'FADE_OUT';
                    this.manualAccelerate = false;
                    break;
                case 'TOW_MODE':
                    this.isExtracting = false;
                    window.System.msg("SISTEMAS CRÍTICOS! VOLTANDO À BASE.");
                    break;
                case 'GAME_OVER':
                    if(window.System && typeof window.System.gameOver === 'function') {
                        window.System.gameOver(this.score, true, this.money);
                    }
                    break;
            }
        },

        setupSensors: function() {
            if (!this._deviceOrientationHandler) {
                this._deviceOrientationHandler = (e) => {
                    this.currentHeading = e.alpha || 0;
                };
            }
            if (!this._deviceMotionHandler) {
                this._deviceMotionHandler = (e) => {
                    if (this.state === 'ENTER_BASE_TRANSITION' || this.state === 'EXIT_BASE_TRANSITION') return;
                    
                    let acc = e.acceleration || e.accelerationIncludingGravity;
                    if (!acc) return;
                    let mag = Math.sqrt((acc.x||0)*(acc.x||0) + (acc.y||0)*(acc.y||0) + (acc.z||0)*(acc.z||0));
                    let force = Math.abs(mag - (e.acceleration ? 0 : 9.81));
                    
                    if (force > 0.3) {
                        this.deviceForce = force;
                        if (force > 15 && this.state === 'PLAY_REAR_AR') {
                            let impactDmg = force * 0.5;
                            this.health -= impactDmg;
                            if(navigator.vibrate) navigator.vibrate(200);
                            this.spawnParticles(window.innerWidth/2, window.innerHeight/2, 20, this.colors.danger);
                            window.System.msg("IMPACTO DETECTADO!");
                            
                            if (this.health <= 0 && this.state !== 'TOW_MODE') {
                                this.changeState('TOW_MODE');
                            }
                        }
                    } else {
                        this.deviceForce = 0;
                    }
                };
            }

            window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            window.removeEventListener('devicemotion', this._deviceMotionHandler);

            window.addEventListener('deviceorientation', this._deviceOrientationHandler);
            window.addEventListener('devicemotion', this._deviceMotionHandler);
            this._sensorsReady = true;
        },

        setupInput: function() {
            const canvas = window.System?.canvas;
            if (!canvas) return;

            canvas.onpointerdown = (e) => {
                if (this.state === 'ENTER_BASE_TRANSITION' || this.state === 'EXIT_BASE_TRANSITION') return;
                
                const r = canvas.getBoundingClientRect();
                const x = e.clientX - r.left; const y = e.clientY - r.top;
                const w = r.width; const h = r.height;

                if (this.state === 'CALIBRATION') {
                    this.baseHeading = this.currentHeading;
                    this.vPos = { x: 0, y: 0 }; 
                    this.changeState('PLAY_REAR_AR');
                }
                else if (this.state === 'PLAY_REAR_AR' || this.state === 'TOW_MODE') {
                    let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
                    
                    // BOTÃO DA GARAGEM: Aciona imediatamente a troca de câmera
                    if (y > 60 && y < 100 && x > w - 120 && x < w - 10) {
                        if (distToBase < 30) {
                            // A chamada OBRIGATORIAMENTE deve acontecer direto no evento de click para o browser aceitar
                            this.pendingCamPromise = CameraManager.startFrontCamera();
                            this.changeState('ENTER_BASE_TRANSITION');
                        } else {
                            window.System.msg("MUITO LONGE DA BASE!");
                        }
                        return;
                    }
                    
                    // BOTÃO ACELERAR
                    const accR = Math.min(45, w * 0.12);
                    if (x < 30 + accR*2 && y > h - 80 - accR*2) {
                        this.manualAccelerate = true;
                    }
                }
                else if (this.state === 'FRONT_AR_OFFICE') {
                    // TOUCH FALLBACK SE A IA DE MÃO FALHAR
                    GestureOffice.buttons.forEach(btn => {
                        if (x > btn.x && x < btn.x + btn.w && y > btn.y && y < btn.y + btn.h) {
                            if (GestureOffice.eventCallback) GestureOffice.eventCallback(btn.id);
                        }
                    });
                }
            };
            canvas.onpointerup = () => { this.manualAccelerate = false; };
        },

        loadAIModel: async function() {
            const loadTask = new Promise((resolve) => {
                try {
                    if (typeof cocoSsd === 'undefined') {
                        const script = document.createElement('script');
                        script.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                        script.onload = async () => {
                            if (typeof cocoSsd !== 'undefined') {
                                this.objectModel = await cocoSsd.load().catch(() => null);
                            }
                            resolve();
                        };
                        script.onerror = () => {
                            this.objectModel = null;
                            resolve();
                        };
                        document.head.appendChild(script);
                    } else {
                        cocoSsd.load().then(model => {
                            this.objectModel = model;
                            resolve();
                        }).catch(() => {
                            this.objectModel = null;
                            resolve();
                        });
                    }
                } catch (e) {
                    this.objectModel = null;
                    resolve();
                }
            });

            const timeoutTask = new Promise(resolve => setTimeout(resolve, 5000));
            
            await Promise.race([loadTask, timeoutTask]);
            
            this.changeState('CALIBRATION');
        },

        startAILoop: function() {
            if (this.aiIntervalId !== null) {
                clearInterval(this.aiIntervalId);
                this.aiIntervalId = null;
            }
            this.aiIntervalId = setInterval(async () => {
                if (this.aiProcessing) return;
                if ((this.state === 'PLAY_REAR_AR') && this.objectModel && window.System?.video && window.System.video.readyState === 4) {
                    this.aiProcessing = true;
                    try {
                        const preds = await this.objectModel.detect(window.System.video);
                        this.detectedItems = preds || [];
                    } catch(e) {
                        this.detectedItems = [];
                    } finally {
                        this.aiProcessing = false;
                    }
                }
            }, this.aiIntervalMs);
        },
        
        stopAILoop: function() {
            if (this.aiIntervalId !== null) { 
                clearInterval(this.aiIntervalId); 
                this.aiIntervalId = null; 
            }
            this.aiProcessing = false;
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            if (isNaN(dt) || dt > 0.1 || dt < 0) dt = 0.016; 
            this.lastTime = now;
            this.timeTotal += dt;

            if (isNaN(this.displayMoney)) this.displayMoney = 0;
            if (isNaN(this.displayFuel)) this.displayFuel = 100;
            this.displayMoney += (this.money - this.displayMoney) * 10 * dt;
            this.displayFuel += (this.fuel - this.displayFuel) * 5 * dt;

            let fps = 1 / dt;
            let newInterval = (fps < 25) ? 1000 : 500;
            if (this.aiIntervalMs !== newInterval) {
                this.aiIntervalMs = newInterval;
                if (this.state === 'PLAY_REAR_AR') {
                    this.startAILoop();
                }
            }

            if (!['FRONT_AR_OFFICE', 'ENTER_BASE_TRANSITION', 'EXIT_BASE_TRANSITION'].includes(this.state)) {
                ctx.save();
                
                if (this.virtualSpeed > 0.1 && !this.isExtracting) {
                    let susY = Math.sin(this.timeTotal * this.virtualSpeed * 1.5) * (this.virtualSpeed / this.stats.baseSpeed) * 3;
                    ctx.translate(0, susY);
                }

                if (this.collectZoom > 0) {
                    let z = 1 + (this.collectZoom * 0.03);
                    ctx.translate(w/2, h/2);
                    ctx.scale(z, z);
                    ctx.translate(-w/2, -h/2);
                    this.collectZoom -= dt * 2;
                }

                if (window.System?.video && window.System.video.readyState === 4) {
                    const vW = window.System.video.videoWidth || w;
                    const vH = window.System.video.videoHeight || h;
                    const videoRatio = vW / vH;
                    const canvasRatio = w / h;
                    let drawW = w, drawH = h, drawX = 0, drawY = 0;
                    if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } 
                    else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
                    ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
                } else {
                    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h);
                }
                
                if (this.baseFlash > 0) {
                    ctx.fillStyle = `rgba(0, 255, 100, ${this.baseFlash * 0.5})`;
                    ctx.fillRect(0, 0, w, h);
                    this.baseFlash -= dt * 1.5;
                }

                ctx.fillStyle = `rgba(0, 50, 60, ${0.1 + Math.sin(this.timeTotal*2)*0.05})`;
                ctx.fillRect(0, 0, w, h);
                
                ctx.restore();
            }

            switch (this.state) {
                case 'BOOT':
                    this.drawOverlay(ctx, w, h, "INICIALIZANDO", "Carregando Engine Premium...");
                    break;
                case 'CALIBRATION':
                    this.drawOverlay(ctx, w, h, "PONTO ZERO", "Aponte o caminhão para a pista e TOQUE");
                    break;
                case 'PLAY_REAR_AR':
                case 'TOW_MODE':
                    this.updatePhysics(dt);
                    this.updateEvents(dt);
                    this.spawnAnomalies(dt);
                    this.processAR(ctx, w, h, dt);
                    this.drawHUD(ctx, w, h);
                    break;
                case 'ENTER_BASE_TRANSITION':
                    this.processTransition(ctx, w, h, dt, 'FRONT_AR_OFFICE');
                    break;
                case 'FRONT_AR_OFFICE':
                    if (window.System?.video && window.System.video.readyState === 4) {
                        const vW = window.System.video.videoWidth || w;
                        const vH = window.System.video.videoHeight || h;
                        const vr = vW / vH;
                        const cr = w / h;
                        let dw = w, dh = h, dx = 0, dy = 0;
                        if (vr > cr) { dw = h * vr; dx = (w - dw) / 2; } else { dh = w / vr; dy = (h - dh) / 2; }
                        ctx.save();
                        ctx.translate(w, 0); ctx.scale(-1, 1);
                        ctx.drawImage(window.System.video, -dx, dy, dw, dh);
                        ctx.restore();
                    }
                    GestureOffice.update(ctx, w, h, dt, this);
                    break;
                case 'EXIT_BASE_TRANSITION':
                    this.processTransition(ctx, w, h, dt, 'PLAY_REAR_AR');
                    break;
                case 'GAME_OVER':
                    this.drawOverlay(ctx, w, h, "FIM DE JOGO", "Calculando pontuação...");
                    break;
            }

            this.updateParticles(ctx, dt, w, h);
            return this.score || 0; 
        },

        processTransition: function(ctx, w, h, dt, nextState) {
            if (this.transitionPhase === 'FADE_OUT') {
                this.transitionAlpha += dt * 3.0; // Fade mais rápido
                if (this.transitionAlpha >= 1) {
                    this.transitionAlpha = 1;
                    this.transitionPhase = 'SWITCH_CAM';
                    
                    // Aguarda a promessa que foi disparada no evento de clique!
                    if (this.pendingCamPromise) {
                        this.pendingCamPromise.then(() => {
                            this.transitionPhase = 'FADE_IN';
                            this.pendingCamPromise = null;
                        }).catch(() => {
                            this.transitionPhase = 'FADE_IN';
                            this.pendingCamPromise = null;
                        });
                    } else {
                        this.transitionPhase = 'FADE_IN';
                    }
                }
            } else if (this.transitionPhase === 'SWITCH_CAM') {
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.textAlign="center";
                ctx.fillText("SISTEMAS REINICIANDO...", w/2, h/2);
            } else if (this.transitionPhase === 'FADE_IN') {
                this.transitionAlpha -= dt * 3.0;
                if (this.transitionAlpha <= 0) {
                    this.transitionAlpha = 0;
                    this.changeState(nextState);
                }
            }
            
            if (this.transitionPhase !== 'SWITCH_CAM') {
                ctx.fillStyle = `rgba(0,0,0,${this.transitionAlpha})`;
                ctx.fillRect(0, 0, w, h);
            }
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
                if (distToBase < 30) {
                    this.pendingCamPromise = CameraManager.startFrontCamera();
                    this.changeState('ENTER_BASE_TRANSITION');
                    return;
                }
            }

            let isMoving = this.virtualSpeed > 0.15;

            if (isMoving) {
                let speedMod = 1.0;
                if (this.currentEvent === 'STORM') speedMod *= 0.5; 
                
                let currentSpeed = this.virtualSpeed * speedMod;
                let rad = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
                this.vPos.x += Math.sin(rad) * currentSpeed * dt;
                this.vPos.y -= Math.cos(rad) * currentSpeed * dt; 

                let wearMod = 1.0 - ((this.upgrades.truck?.lvl || 1) * 0.05);
                this.wear.motor = Math.min(100, this.wear.motor + (this.stats.wearRate * wearMod * dt));
                this.wear.wheels = Math.min(100, this.wear.wheels + (this.stats.wearRate * wearMod * 1.5 * dt));

                let isHeavyLoad = (this.currentMission && this.currentMission.active && this.currentMission.type === 'HEAVY LOAD');
                let heavyMod = isHeavyLoad ? 2.0 : 1.0;

                let cargoWeight = this.cargo.length;
                let baseDrain = 0.8 / 60; 
                let speedDrain = this.virtualSpeed * 0.015;
                let cargoDrain = cargoWeight * 0.01 * heavyMod;
                
                let fuelLoss = (baseDrain + speedDrain + cargoDrain) * dt;
                this.fuel = Math.max(0, Math.min(this.fuel - fuelLoss, this.stats.maxFuel));
            } else {
                this.fuel = Math.max(0, Math.min(this.fuel, this.stats.maxFuel));
            }

            if (this.fuel <= 0 && this.state !== 'TOW_MODE') {
                this.fuel = 0; 
                this.changeState('TOW_MODE');
            }

            if (this.currentMission && this.currentMission.active && this.currentMission.type === 'TIMED' && this.state !== 'TOW_MODE') {
                this.currentMission.timer -= dt;
                if (this.currentMission.timer <= 0) {
                    this.currentMission.active = false;
                    window.System.msg("TEMPO DA MISSÃO ESGOTADO!");
                    if(window.Sfx && typeof window.Sfx.error === 'function') window.Sfx.error();
                }
            }
        },

        updateEvents: function(dt) {
            if (this.currentEvent) {
                this.eventTimer -= dt;
                if (this.eventTimer <= 0) this.currentEvent = null;
            } else if (Math.random() < (0.01 * dt)) { 
                this.currentEvent = Math.random() > 0.5 ? 'STORM' : 'GLITCH';
                this.eventTimer = 10;
                window.System.msg("EVENTO: " + this.currentEvent);
            }
        },

        spawnAnomalies: function(dt) {
            if (this.state === 'TOW_MODE') return;
            this.spawnTimer += dt;
            if (this.anomalies.length < 5 && this.spawnTimer > 2.0) {
                this.spawnTimer = 0;
                let isRare = Math.random() < 0.15;
                let dist = 40 + Math.random() * (100 + this.level * 20); 
                let ang = Math.random() * Math.PI * 2;
                
                this.anomalies.push({
                    id: Math.random().toString(36),
                    x: this.vPos.x + Math.cos(ang) * dist,
                    y: this.vPos.y + Math.sin(ang) * dist,
                    type: isRare ? 'RARE' : 'NORMAL',
                    val: isRare ? 5000 : (500 + Math.floor(Math.random()*500)), 
                    life: isRare ? 25 : 999 
                });
            }
            this.anomalies.forEach(a => { if (a.life < 999) a.life -= dt; });
            this.anomalies = this.anomalies.filter(a => a.life > 0);
        },

        getAverageColor: function(ctx, x, y, w, h) {
            try {
                if (w <= 0 || h <= 0) return {r:0,g:0,b:0};
                const data = ctx.getImageData(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h)).data;
                let r=0, g=0, b=0;
                for (let i=0; i<data.length; i+=4) { r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
                let c = data.length/4; 
                if (c === 0) return {r:0, g:0, b:0};
                return {r:r/c, g:g/c, b:b/c};
            } catch(e) { return {r:0,g:0,b:0}; }
        },

        processAR: function(ctx, w, h, dt) {
            if (this.state === 'TOW_MODE') {
                this.isExtracting = false;
                return; 
            }

            const cx = w / 2; const cy = h / 2;
            let nearestDist = 9999;
            this.activeAnomaly = null;
            
            this.anomalies.forEach(ano => {
                let d = Math.hypot(ano.x - this.vPos.x, ano.y - this.vPos.y);
                if (d < nearestDist) { nearestDist = d; this.activeAnomaly = ano; }
            });

            if (this.activeAnomaly && nearestDist < 20 && this.cargo.length < this.stats.maxCargo && this.cooldown <= 0) {
                
                this.floorColor = this.getAverageColor(ctx, cx - 50, h * 0.85, 100, 40);
                this.targetColor = this.getAverageColor(ctx, cx - 40, cy - 40, 80, 80);
                
                let diff = Math.abs(this.floorColor.r - this.targetColor.r) + Math.abs(this.floorColor.g - this.targetColor.g) + Math.abs(this.floorColor.b - this.targetColor.b);
                let visualFound = (diff > 60);

                const vW = window.System?.video?.videoWidth || w;
                const vH = window.System?.video?.videoHeight || h;
                const sX = w / vW;
                const sY = h / vH;
                
                let foundBox = null;

                this.detectedItems.forEach(item => {
                    if (['person', 'bed', 'sofa'].includes(item.class) || item.score < 0.2) return;
                    const bW = item.bbox[2]*sX; const bH = item.bbox[3]*sY;
                    if (bW > w * 0.8) return;
                    const cX = (item.bbox[0]*sX) + bW/2; const cY = (item.bbox[1]*sY) + bH/2;
                    if (Math.hypot(cX - cx, cY - cy) < Math.min(w, h) * 0.4) {
                        visualFound = true;
                        foundBox = { x: item.bbox[0]*sX, y: item.bbox[1]*sY, w: bW, h: bH, label: item.class };
                    }
                });

                const targetR = Math.min(w, h) * 0.35;

                if (!this.isExtracting) {
                    ctx.strokeStyle = this.colors.warn; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(cx, cy, targetR, 0, Math.PI*2); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(cx - targetR - 20, cy); ctx.lineTo(cx + targetR + 20, cy); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(cx, cy - targetR - 20); ctx.lineTo(cx, cy + targetR + 20); ctx.stroke();

                    if (foundBox) {
                        ctx.strokeStyle = "rgba(0, 255, 255, 0.8)"; ctx.lineWidth = 3;
                        ctx.strokeRect(foundBox.x, foundBox.y, foundBox.w, foundBox.h);
                        ctx.fillStyle = "rgba(0,0,0,0.7)";
                        ctx.fillRect(foundBox.x, foundBox.y - 25, 100, 25);
                        ctx.fillStyle = "#0ff"; ctx.textAlign="left"; ctx.font="14px Arial";
                        ctx.fillText(foundBox.label.toUpperCase(), foundBox.x + 5, foundBox.y - 8);
                    }
                }

                if (visualFound && !this.isExtracting) {
                    this.isExtracting = true;
                    this.extractProgress = 0;
                }
            }

            if (this.isExtracting && this.activeAnomaly) {
                let actionForce = Math.max(this.virtualSpeed, this.manualAccelerate ? this.stats.baseSpeed : 0);
                
                if (actionForce > 1.0) {
                    this.extractProgress += (actionForce * this.stats.scanPower * dt * 5);
                    if(window.Gfx && typeof window.Gfx.addShake === 'function') window.Gfx.addShake(1);
                } else {
                    this.extractProgress = Math.max(0, this.extractProgress - (15 * dt));
                }

                ctx.fillStyle = `rgba(255, 0, 60, ${Math.abs(Math.sin(this.timeTotal*10))*0.3})`; ctx.fillRect(0, 0, w, h);
                
                const uiY = h - 140;
                ctx.fillStyle = this.colors.danger; ctx.textAlign = "center";
                ctx.font = "bold clamp(20px, 5vw, 40px) 'Russo One'";
                ctx.fillText("TRAVANDO ALVO! ACELERE!", cx, uiY - 15);

                ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(w*0.1, uiY, w*0.8, 20);
                ctx.fillStyle = this.colors.danger; ctx.fillRect(w*0.1, uiY, (this.extractProgress/100)*(w*0.8), 20);
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(w*0.1, uiY, w*0.8, 20);

                const targetR = Math.min(w, h) * 0.35;
                ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(this.timeTotal*20)*0.5})`; ctx.lineWidth = 10;
                ctx.beginPath(); ctx.moveTo(cx, uiY); ctx.lineTo(cx, cy); ctx.stroke();

                const ringSize = Math.max(20, targetR * (1 - this.extractProgress/150));
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.timeTotal * 5);
                ctx.strokeStyle = this.colors.danger; ctx.lineWidth = 6; ctx.setLineDash([20, 15]);
                ctx.beginPath(); ctx.arc(0, 0, ringSize, 0, Math.PI*2); ctx.stroke(); ctx.restore();

                if (this.extractProgress >= 100) {
                    this.cargo.push(this.activeAnomaly.val);
                    this.score += this.activeAnomaly.val / 10;
                    window.System.msg(this.activeAnomaly.type === 'RARE' ? "CARGA RARA COLETADA!" : "COLETADO!");
                    
                    if (this.currentMission && this.currentMission.active) {
                        this.currentMission.progress++;
                        if (this.currentMission.progress >= this.currentMission.goal) {
                            this.completeMission();
                        }
                    }

                    this.anomalies = this.anomalies.filter(a => a.id !== this.activeAnomaly.id);
                    this.isExtracting = false;
                    this.cooldown = 2.0; 
                    
                    if(window.Gfx && typeof window.Gfx.shakeScreen === 'function') window.Gfx.shakeScreen(20);
                    if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
                    this.collectGlow = 1.0;
                    this.collectZoom = 1.0;
                    this.spawnParticles(cx, cy, 40, this.colors.main);
                }

                if (this.activeAnomaly && nearestDist > 30) {
                    this.isExtracting = false;
                    window.System.msg("ALVO PERDIDO");
                }
            }
        },

        drawHUD: function(ctx, w, h) {
            let fuelPct = this.displayFuel / this.stats.maxFuel;
            let isFull = this.cargo.length >= this.stats.maxCargo;
            let radHead = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
            
            if (this.collectGlow > 0) {
                ctx.fillStyle = `rgba(0, 255, 255, ${this.collectGlow * 0.3})`;
                ctx.fillRect(0, 0, w, h);
                this.collectGlow -= 0.03;
            }

            // O SEGREDO DO AR: WAYPOINTS HOLOGRÁFICOS 3D
            const drawARWaypoint = (worldX, worldY, label, color, isBase) => {
                let dx = worldX - this.vPos.x;
                let dy = worldY - this.vPos.y;
                let dist = Math.hypot(dx, dy);
                
                let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2);
                let fwdAngle = angle + Math.PI/2;
                fwdAngle = Math.atan2(Math.sin(fwdAngle), Math.cos(fwdAngle)); // -PI to PI
                
                let fov = Math.PI / 2.5; 
                
                if (Math.abs(fwdAngle) < fov) {
                    // Está na frente da câmera!
                    let projX = (w/2) + (fwdAngle / fov) * (w/2);
                    let projY = h/2 + Math.sin(this.timeTotal * 4) * 10;
                    if (this.isExtracting && !isBase) projY += (Math.random() * 5 - 2.5); // Tremor de captura
                    
                    // Desenha o Losango AR
                    ctx.fillStyle = (this.isExtracting && !isBase) ? this.colors.danger : color;
                    ctx.beginPath();
                    ctx.moveTo(projX, projY - 25);
                    ctx.lineTo(projX + 15, projY);
                    ctx.lineTo(projX, projY + 25);
                    ctx.lineTo(projX - 15, projY);
                    ctx.fill();
                    
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 14px 'Russo One'";
                    ctx.textAlign = "center";
                    ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
                    ctx.fillText(label, projX, projY - 35);
                    ctx.font = "bold 12px Arial";
                    ctx.fillText(Math.floor(dist) + "m", projX, projY + 45);
                    ctx.shadowBlur = 0;
                } else {
                    // Fora da tela: Indicador nas bordas!
                    let edgeX = fwdAngle > 0 ? w - 20 : 20;
                    let edgeY = h/2;
                    ctx.fillStyle = isBase ? this.colors.success : color;
                    ctx.beginPath();
                    if (fwdAngle > 0) {
                        ctx.moveTo(edgeX-15, edgeY - 15); ctx.lineTo(edgeX + 10, edgeY); ctx.lineTo(edgeX-15, edgeY + 15);
                    } else {
                        ctx.moveTo(edgeX+15, edgeY - 15); ctx.lineTo(edgeX - 10, edgeY); ctx.lineTo(edgeX+15, edgeY + 15);
                    }
                    ctx.fill();
                    ctx.fillStyle = "#fff"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center";
                    ctx.fillText(Math.floor(dist) + "m", edgeX + (fwdAngle > 0 ? -25 : 25), edgeY + 5);
                }
            };

            // Se a caçamba está cheia, a missão principal é voltar para a base
            if (isFull || this.state === 'TOW_MODE') {
                drawARWaypoint(0, 0, "BASE USR", this.colors.success, true);
            } else {
                this.anomalies.forEach(a => {
                    let col = a.type === 'RARE' ? this.colors.rare : this.colors.warn;
                    let lbl = a.type === 'RARE' ? "RARO" : "SUCATA";
                    drawARWaypoint(a.x, a.y, lbl, col, false);
                });
                ctx.globalAlpha = 0.3;
                drawARWaypoint(0, 0, "BASE", this.colors.success, true);
                ctx.globalAlpha = 1.0;
            }

            // --- HUD SUPERIOR (LIMPO E COMPACTO) ---
            const topH = 40;
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, 0, w, topH);
            ctx.strokeStyle = this.colors.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, topH); ctx.lineTo(w, topH); ctx.stroke();

            ctx.fillStyle = "#fff"; ctx.font = "bold 12px 'Chakra Petch'"; ctx.textAlign = "left";
            ctx.fillText(`LVL ${this.level} | VIDA: ${Math.floor(this.health)}%`, 10, 25);
            
            ctx.save();
            const fuelW = Math.min(120, w/3);
            if (fuelPct < 0.2) {
                let pulse = 1 + Math.abs(Math.sin(this.timeTotal * 10)) * 0.05;
                ctx.translate(140 + fuelW/2, 16 + 5); ctx.scale(pulse, pulse); ctx.translate(-(140 + fuelW/2), -(16 + 5));
            }
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(140, 16, fuelW, 10);
            ctx.fillStyle = fuelPct > 0.2 ? this.colors.success : this.colors.danger;
            ctx.fillRect(140, 16, fuelPct * fuelW, 10);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(140, 16, fuelW, 10);
            ctx.restore();

            // --- MENSAGEM CENTRALIZADA E CLARA ---
            ctx.textAlign = "center";
            if (isFull) {
                ctx.fillStyle = (Math.sin(this.timeTotal*5) > 0) ? this.colors.success : "#fff";
                ctx.font = "bold clamp(16px, 4vw, 24px) 'Russo One'";
                ctx.fillText("CAÇAMBA CHEIA! SIGA A SETA PARA A BASE!", w/2, topH + 30);
            } else if (this.currentMission && this.currentMission.active && this.state !== 'TOW_MODE') {
                ctx.fillStyle = this.colors.warn;
                ctx.font = "bold clamp(14px, 3.5vw, 18px) 'Chakra Petch'";
                ctx.fillText(`MISSÃO: ${this.currentMission.type} (${this.currentMission.progress}/${this.currentMission.goal})`, w/2, topH + 25);
            }

            // --- RADAR E GARAGEM (CANTO DIREITO) ---
            const rR = Math.min(40, w * 0.1);
            const rCx = w - rR - 10; const rCy = topH + rR + 10;
            let radarGradient = ctx.createRadialGradient(rCx, rCy, 0, rCx, rCy, rR);
            radarGradient.addColorStop(0, "rgba(0, 50, 40, 0.9)"); radarGradient.addColorStop(1, "rgba(0, 10, 20, 0.7)");
            ctx.fillStyle = radarGradient; ctx.beginPath(); ctx.arc(rCx, rCy, rR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = this.colors.main; ctx.lineWidth = 2; ctx.stroke();

            const drawBlip = (wX, wY, col, sz) => {
                let dx = wX - this.vPos.x; let dy = wY - this.vPos.y;
                let dist = Math.hypot(dx, dy);
                if (dist < this.stats.radarRange) {
                    let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2); 
                    let sD = (dist / this.stats.radarRange) * rR;
                    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rCx + Math.cos(angle)*sD, rCy + Math.sin(angle)*sD, sz, 0, Math.PI*2); ctx.fill();
                }
            };
            drawBlip(0, 0, this.colors.success, 5);
            if (!isFull) this.anomalies.forEach(a => drawBlip(a.x, a.y, a.type==='RARE'?this.colors.rare:this.colors.warn, 3));
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(rCx, rCy - 5); ctx.lineTo(rCx+4, rCy+4); ctx.lineTo(rCx-4, rCy+4); ctx.fill();

            // Botão da Garagem
            let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
            let atBase = distToBase < 30;
            const btnW = 100; const btnH = 35;
            ctx.fillStyle = atBase ? this.colors.success : "rgba(100,100,100,0.5)";
            ctx.fillRect(w - btnW - 10, rCy + rR + 10, btnW, btnH);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(w - btnW - 10, rCy + rR + 10, btnW, btnH);
            ctx.fillStyle = "#000"; ctx.textAlign="center"; ctx.font = "bold 12px 'Russo One'"; 
            ctx.fillText(atBase ? "ENTRAR OFICINA" : "BASE LONGE", w - 10 - btnW/2, rCy + rR + 32);

            // --- PAINEL INFERIOR E ACELERADOR ---
            const botH = 50; const botY = h - botH;
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, botY, w, botH);
            ctx.strokeStyle = this.colors.main; ctx.beginPath(); ctx.moveTo(0, botY); ctx.lineTo(w, botY); ctx.stroke();

            const accR = Math.min(40, w * 0.12);
            ctx.fillStyle = this.manualAccelerate ? "rgba(0,255,255,0.6)" : "rgba(0,255,255,0.2)";
            ctx.beginPath(); ctx.arc(10 + accR, botY - accR - 10, accR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.font = "bold 12px Arial"; ctx.textAlign="center"; ctx.fillText("GAS", 10 + accR, botY - accR - 6);

            ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Chakra Petch'";
            ctx.fillText(`CARGA: ${this.cargo.length}/${this.stats.maxCargo}`, 20, h - 20);
            ctx.fillStyle = this.colors.success; ctx.font = "bold 18px 'Russo One'";
            ctx.fillText(`R$ ${Math.floor(this.displayMoney).toLocaleString()}`, w/2 - 40, h - 18);
            
            ctx.textAlign = "right"; ctx.fillStyle = this.colors.main; ctx.font = "bold 14px 'Chakra Petch'";
            ctx.fillText(`BASE: ${Math.floor(distToBase)}m`, w - 20, h - 20);
        },

        deliverCargo: function() {
            if (this.cargo.length > 0) {
                let total = this.cargo.reduce((a, b) => a + b, 0);
                let effBonus = Math.floor(total * (this.fuel / this.stats.maxFuel) * 0.3); 
                total += effBonus;

                if (this.currentMission && this.currentMission.active && this.currentMission.type === 'HEAVY LOAD') {
                    total = Math.floor(total * 1.5);
                }

                this.money += total;
                this.score += total / 10;
                
                this.xp += this.cargo.length * 100;
                if (this.xp >= this.level * 600) {
                    this.xp = 0; this.level++;
                    window.System.msg("NÍVEL " + this.level + " ALCANÇADO!");
                } else {
                    window.System.msg(`ENTREGA: R$${total}`);
                }
                
                this.cargo = [];
            }
        },

        handleOfficeAction: function(actionId) {
            const buyObj = (cost, callback) => {
                if (this.money >= cost && cost > 0) { this.money -= cost; callback(); if(window.Sfx && typeof window.Sfx.coin === 'function') window.Sfx.coin(); return true; }
                if(window.Sfx && typeof window.Sfx.error === 'function') window.Sfx.error(); return false;
            };

            let fuelCost = Math.floor((this.stats.maxFuel - this.fuel) * 2);
            let repCost = Math.floor((100 - this.health) * 5);

            if (actionId === 'REFUEL') buyObj(fuelCost, () => this.fuel = this.stats.maxFuel);
            if (actionId === 'REPAIR') buyObj(repCost, () => { this.health = 100; });
            
            if (actionId === 'UPG_ENGINE') {
                let u = this.upgrades.engine;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }
            if (actionId === 'UPG_TANK') {
                let u = this.upgrades.tank;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }
            if (actionId === 'UPG_RADAR') {
                let u = this.upgrades.radar;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }
            if (actionId === 'UPG_TRUCK') {
                let u = this.upgrades.truck;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }

            if (actionId === 'EXIT') {
                // Ao clicar em sair (fallback ou gesto), aciona o Switch IMEDIATAMENTE
                this.pendingCamPromise = CameraManager.startRearCamera();
                this.changeState('EXIT_BASE_TRANSITION');
            }
        },

        applyStats: function() {
            this.stats.baseSpeed = 20 + (this.upgrades.engine.lvl * 5);
            this.stats.maxFuel = 100 + (this.upgrades.tank.lvl * 50);
            this.stats.radarRange = 150 + (this.upgrades.radar.lvl * 50);
            this.stats.wearRate = Math.max(0.1, 0.3 - (this.upgrades.truck.lvl * 0.05));
            if (this.fuel > this.stats.maxFuel) this.fuel = this.stats.maxFuel;
        },

        drawOverlay: function(ctx, w, h, title, sub) {
            ctx.fillStyle = "rgba(0, 5, 10, 0.95)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = this.colors.main; ctx.textAlign = "center";
            ctx.font = "bold clamp(30px, 6vw, 60px) 'Russo One'"; ctx.fillText(title, w/2, h/2 - 20);
            ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial"; ctx.fillText(sub, w/2, h/2 + 30);
        },

        spawnParticles: function(x, y, count, color) {
            for(let i=0; i<count; i++) {
                particles.push({
                    x: x, y: y,
                    vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20,
                    life: 1.0, color: color, size: Math.random()*8+4
                });
            }
        },

        updateParticles: function(ctx, dt, w, h) {
            ctx.globalCompositeOperation = 'screen';
            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
                p.life -= dt * 2;
                if (p.life <= 0) { particles.splice(i, 1); continue; }
                ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life);
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            }
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
        },

        cleanup: function() {
            this.stopAILoop();
            if (this.state === 'FRONT_AR_OFFICE') GestureOffice.destroy();
            if (this._deviceOrientationHandler) window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            if (this._deviceMotionHandler) window.removeEventListener('devicemotion', this._deviceMotionHandler);
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('ar_truck_sim', 'AR Ops Premium', '🚀', Game, {
                camera: 'environment',
                phases: [
                    { id: 'f1', name: 'MISSÃO AR GLOBAL', desc: 'Siga as Setas AR para recolher o material.', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
