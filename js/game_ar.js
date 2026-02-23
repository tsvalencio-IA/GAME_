// =============================================================================
// AR TOY TRUCK SIMULATOR: V19 - PHYSICAL PICKUP EDITION
// FOCO EM INTERAÇÃO REAL: DETECTAR -> REMOVER COM A MÃO -> LEVAR AO DEPÓSITO
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1) CAMERA MANAGER
    // =========================================================================
    const CameraManager = {
        isSwitching: false,
        stopCurrentStream: function() {
            const video = window.System?.video;
            if (video && video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }
        },
        startRearCamera: async function() {
            if (this.isSwitching) return false;
            this.isSwitching = true;
            this.stopCurrentStream();

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                });
                const video = window.System?.video;
                if (!video) { this.isSwitching = false; return false; }
                
                video.srcObject = stream;
                video.style.transform = "none";
                
                await new Promise((resolve) => { video.onloadedmetadata = () => resolve(); });
                try { await video.play(); } catch(e) {}

                this.isSwitching = false;
                window.System.currentCameraMode = 'environment';
                return true;
            } catch (err) {
                this.isSwitching = false;
                return false; 
            }
        }
    };

    // =========================================================================
    // 2) ENGINE PRINCIPAL
    // =========================================================================
    let particles = [];
    
    const Game = {
        state: 'BOOT', // BOOT, CALIBRATION, SCANNING, WAITING_PICKUP, RETURNING, DEPOT
        lastTime: 0,
        timeTotal: 0,
        score: 0,
        
        // Odometria Virtual (Radar do Depósito)
        vPos: { x: 0, y: 0 },
        baseHeading: 0,
        currentHeading: 0,
        virtualSpeed: 0,
        deviceForce: 0,
        _deviceOrientationHandler: null,
        _deviceMotionHandler: null,
        
        // Sensores
        objectModel: null,
        detectedItems: [],
        lastAiTime: 0,
        aiIntervalId: null,
        
        // Lógica de Coleta Física
        detectTimer: 0,
        pickupTimer: 0,
        colorDiff: 0,
        
        // Inventário e Progressão
        money: 0,
        cargo: 0,
        maxCargo: 1, // Só pode levar 1 por vez para obrigar a ir ao depósito
        level: 1,
        
        colors: { 
            main: '#00ffff', 
            danger: '#ff003c', 
            success: '#00ff66', 
            warn: '#f1c40f', 
            panel: 'rgba(0,15,30,0.85)' 
        },

        init: function() {
            this.state = 'BOOT'; 
            this.lastTime = performance.now();
            this.timeTotal = 0;
            this.score = 0;
            this.money = 0;
            this.cargo = 0;
            this.vPos = { x: 0, y: 0 };
            this.detectTimer = 0;
            this.pickupTimer = 0;
            particles = [];
            
            this.setupSensors();
            this.setupInput();
            this.loadCameraAndAI();
        },

        changeState: function(newState) {
            if (this.state === newState) return;
            this.state = newState;
            
            if (newState === 'SCANNING') {
                this.detectTimer = 0;
            } else if (newState === 'WAITING_PICKUP') {
                this.pickupTimer = 0;
                if(window.Sfx) window.Sfx.play(800, 'square', 0.2, 0.2); // Alerta sonoro
            } else if (newState === 'RETURNING') {
                if(window.Sfx) window.Sfx.epic();
            }
        },

        setupSensors: function() {
            if (!this._deviceOrientationHandler) {
                this._deviceOrientationHandler = (e) => { this.currentHeading = e.alpha || 0; };
            }
            if (!this._deviceMotionHandler) {
                this._deviceMotionHandler = (e) => {
                    let acc = e.acceleration || e.accelerationIncludingGravity;
                    if (!acc) return;
                    let mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2);
                    let force = Math.abs(mag - (e.acceleration ? 0 : 9.81));
                    
                    if (force > 0.3) {
                        this.deviceForce = force;
                    } else {
                        this.deviceForce = 0;
                    }
                };
            }
            window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            window.removeEventListener('devicemotion', this._deviceMotionHandler);
            window.addEventListener('deviceorientation', this._deviceOrientationHandler);
            window.addEventListener('devicemotion', this._deviceMotionHandler);
        },

        setupInput: function() {
            const canvas = window.System?.canvas;
            if (!canvas) return;

            canvas.onpointerdown = (e) => {
                const r = canvas.getBoundingClientRect();
                const x = e.clientX - r.left; const y = e.clientY - r.top;
                const w = r.width; const h = r.height;

                if (this.state === 'CALIBRATION') {
                    // Define a posição atual como o DEPÓSITO (0,0)
                    this.baseHeading = this.currentHeading;
                    this.vPos = { x: 0, y: 0 }; 
                    this.changeState('SCANNING');
                    if(window.Sfx) window.Sfx.epic();
                }
                else if (this.state === 'RETURNING') {
                    // Botão de Forçar Entrega (caso o radar confunda)
                    if (y > h - 100 && x > w/2 - 120 && x < w/2 + 120) {
                        this.deliverCargo();
                    }
                }
                else if (this.state === 'DEPOT') {
                    // Botão Voltar para a Caçada
                    if (y > h - 100 && x > w/2 - 150 && x < w/2 + 150) {
                        this.changeState('SCANNING');
                    }
                }
            };
        },

        loadCameraAndAI: async function() {
            await CameraManager.startRearCamera();

            if (typeof cocoSsd === 'undefined') {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                script.onload = async () => {
                    this.objectModel = await cocoSsd.load().catch(() => null);
                    this.changeState('CALIBRATION');
                    this.startAILoop();
                };
                script.onerror = () => { this.changeState('CALIBRATION'); };
                document.head.appendChild(script);
            } else {
                this.objectModel = await cocoSsd.load().catch(() => null);
                this.changeState('CALIBRATION');
                this.startAILoop();
            }
        },

        startAILoop: function() {
            if (this.aiIntervalId !== null) clearInterval(this.aiIntervalId);
            this.aiIntervalId = setInterval(async () => {
                if (this.objectModel && window.System?.video && window.System.video.readyState === 4) {
                    try {
                        const preds = await this.objectModel.detect(window.System.video);
                        this.detectedItems = preds || [];
                    } catch(e) { this.detectedItems = []; }
                }
            }, 600); // Roda mais devagar para não travar o celular
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            if (isNaN(dt) || dt > 0.1 || dt < 0) dt = 0.016; 
            this.lastTime = now;
            this.timeTotal += dt;

            // Fundo: Câmera Real
            if (this.state !== 'DEPOT') {
                if (window.System?.video && window.System.video.readyState === 4) {
                    const vW = window.System.video.videoWidth || w; const vH = window.System.video.videoHeight || h;
                    const videoRatio = vW / vH; const canvasRatio = w / h;
                    let drawW = w, drawH = h, drawX = 0, drawY = 0;
                    if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } 
                    else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
                    ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
                } else {
                    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h);
                }
            }

            switch (this.state) {
                case 'BOOT':
                    this.drawOverlay(ctx, w, h, "LIGANDO CÂMERA", "Aguarde...");
                    break;
                case 'CALIBRATION':
                    this.drawOverlay(ctx, w, h, "MARCAR DEPÓSITO", "Coloque o caminhão no local de entrega e TOQUE NA TELA");
                    break;
                case 'SCANNING':
                case 'WAITING_PICKUP':
                case 'RETURNING':
                    this.updatePhysics(dt);
                    this.processAR(ctx, w, h, dt);
                    this.drawHUD(ctx, w, h);
                    break;
                case 'DEPOT':
                    this.drawDepot(ctx, w, h);
                    break;
            }

            this.updateParticles(ctx, dt, w, h);
            return this.score || 0; 
        },

        updatePhysics: function(dt) {
            // Atualiza a posição virtual baseada no movimento do celular
            this.virtualSpeed += (Math.min(this.deviceForce * 8, 25) - this.virtualSpeed) * dt * 3.0;
            this.virtualSpeed = Math.max(0, this.virtualSpeed);

            if (this.virtualSpeed > 0.5) {
                let rad = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
                this.vPos.x += Math.sin(rad) * this.virtualSpeed * dt;
                this.vPos.y -= Math.cos(rad) * this.virtualSpeed * dt; 
            }
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
            const cx = w / 2; const cy = h / 2;
            let isObjectInFront = false;

            // 1) SENSOR ÓPTICO DE CORES (Mais preciso para o chão)
            // Lemos uma amostra do chão mais embaixo, e comparamos com o centro exato da tela
            let floorSample = this.getAverageColor(ctx, cx - 25, h * 0.85, 50, 20);
            let targetSample = this.getAverageColor(ctx, cx - 20, cy - 20, 40, 40); // Caixa central pequena
            
            this.colorDiff = Math.abs(floorSample.r - targetSample.r) + Math.abs(floorSample.g - targetSample.g) + Math.abs(floorSample.b - targetSample.b);
            
            // Se a cor do meio for muito diferente do chão, tem algo na frente!
            if (this.colorDiff > 65) isObjectInFront = true;

            // 2) SENSOR IA (Caso a IA consiga ver)
            let aiFoundBox = null;
            if (this.detectedItems.length > 0) {
                const sX = w / (window.System?.video?.videoWidth || w);
                const sY = h / (window.System?.video?.videoHeight || h);
                this.detectedItems.forEach(item => {
                    if (['person', 'bed', 'sofa', 'chair', 'tv'].includes(item.class) || item.score < 0.25) return;
                    
                    const bW = item.bbox[2]*sX; const bH = item.bbox[3]*sY;
                    if (bW > w * 0.7) return; // Se for gigante, ignora
                    
                    const cX = (item.bbox[0]*sX) + bW/2; const cY = (item.bbox[1]*sY) + bH/2;
                    // Se estiver perto do centro
                    if (Math.hypot(cX - cx, cY - cy) < Math.min(w, h) * 0.3) {
                        isObjectInFront = true;
                        aiFoundBox = { x: item.bbox[0]*sX, y: item.bbox[1]*sY, w: bW, h: bH, label: item.class };
                    }
                });
            }

            // ==========================================
            // MÁQUINA DE ESTADOS DO JOGO FÍSICO
            // ==========================================
            if (this.state === 'SCANNING') {
                // Desenha mira neutra e limpa
                ctx.strokeStyle = "rgba(0, 255, 255, 0.4)"; ctx.lineWidth = 2;
                ctx.strokeRect(cx - 30, cy - 30, 60, 60);

                if (isObjectInFront) {
                    this.detectTimer += dt;
                    // Desenha barrinha de travamento sutil
                    ctx.fillStyle = this.colors.warn;
                    ctx.fillRect(cx - 30, cy + 40, 60 * (this.detectTimer/0.8), 5);
                    
                    if (this.detectTimer > 0.8) { // Confirma por 0.8s
                        this.changeState('WAITING_PICKUP');
                    }
                } else {
                    this.detectTimer = 0;
                }
            } 
            else if (this.state === 'WAITING_PICKUP') {
                // TELA VERMELHA - ESPERANDO A MÃO DO JOGADOR TIRAR O CARRINHO
                ctx.fillStyle = "rgba(255, 0, 60, 0.15)"; ctx.fillRect(0, 0, w, h);
                
                ctx.strokeStyle = this.colors.danger; ctx.lineWidth = 4;
                ctx.strokeRect(cx - 40, cy - 40, 80, 80);
                
                ctx.fillStyle = this.colors.danger; ctx.textAlign = "center";
                ctx.font = "bold clamp(18px, 4vw, 24px) 'Russo One'";
                ctx.fillText("BRINQUEDO DETECTADO!", cx, cy - 60);
                
                ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial";
                ctx.fillText("PARE, PEGUE COM A MÃO E COLOQUE NA CAÇAMBA!", cx, cy + 70);

                // O segredo: Se a câmera PARAR de ver o objeto (isObjectInFront = false)
                // significa que o jogador tirou o objeto da frente da lente!
                if (!isObjectInFront) {
                    this.pickupTimer += dt;
                    // Animação de sucesso
                    ctx.fillStyle = this.colors.success;
                    ctx.fillRect(cx - 40, cy + 90, 80 * (this.pickupTimer/1.0), 8);
                    
                    if (this.pickupTimer > 1.0) { // Ficou 1 segundo sem ver o objeto
                        this.cargo++;
                        this.changeState('RETURNING');
                        window.System.msg("NA CAÇAMBA!");
                        if(window.Gfx) window.Gfx.shakeScreen(10);
                    }
                } else {
                    this.pickupTimer = 0; // Se o objeto voltou, reseta
                }

                // Se o caminhão se afastar fisicamente (velocidade alta), cancela
                if (this.virtualSpeed > 15) {
                    this.changeState('SCANNING');
                    window.System.msg("ALVO ABANDONADO");
                }
            }

            // Desenha caixa da IA se houver (útil para debug visual limpo)
            if (aiFoundBox && this.state !== 'RETURNING') {
                ctx.strokeStyle = "rgba(0, 255, 255, 0.6)"; ctx.lineWidth = 2;
                ctx.strokeRect(aiFoundBox.x, aiFoundBox.y, aiFoundBox.w, aiFoundBox.h);
                ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(aiFoundBox.x, aiFoundBox.y - 20, ctx.measureText(aiFoundBox.label).width + 10, 20);
                ctx.fillStyle = "#0ff"; ctx.textAlign="left"; ctx.font="12px Arial";
                ctx.fillText(aiFoundBox.label.toUpperCase(), aiFoundBox.x + 5, aiFoundBox.y - 5);
            }
        },

        drawHUD: function(ctx, w, h) {
            // PAINEL SUPERIOR
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, 0, w, 50);
            ctx.strokeStyle = this.colors.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(w, 50); ctx.stroke();

            ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Chakra Petch'"; ctx.textAlign = "left";
            ctx.fillText(`FROTA NÍVEL: ${this.level}`, 15, 30);
            
            ctx.textAlign = "right"; ctx.fillStyle = this.colors.success; ctx.font = "bold 18px 'Russo One'";
            ctx.fillText(`R$ ${this.money}`, w - 15, 32);

            // MODO RETORNO (RADAR PARA A BASE)
            if (this.state === 'RETURNING') {
                let dx = 0 - this.vPos.x; let dy = 0 - this.vPos.y;
                let distToBase = Math.hypot(dx, dy);
                let radHead = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
                let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2);
                
                // Bússola na Tela
                ctx.save(); ctx.translate(w/2, 120);
                ctx.fillStyle = "rgba(0, 20, 10, 0.8)"; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = this.colors.success; ctx.lineWidth = 3; ctx.stroke();
                
                ctx.rotate(angle);
                ctx.fillStyle = this.colors.success;
                ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(15, 10); ctx.lineTo(-15, 10); ctx.fill();
                ctx.restore();

                ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 16px 'Chakra Petch'";
                ctx.fillText(`VOLTE AO DEPÓSITO: ${Math.floor(distToBase)}m`, w/2, 185);

                // Botão de Forçar Entrega (Útil para crianças)
                ctx.fillStyle = "rgba(0, 255, 100, 0.3)"; ctx.fillRect(w/2 - 120, h - 100, 240, 50);
                ctx.strokeStyle = this.colors.success; ctx.strokeRect(w/2 - 120, h - 100, 240, 50);
                ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; 
                ctx.fillText("DESCARREGAR NA BASE (FORÇAR)", w/2, h - 70);

                // Entrega automática se chegar muito perto
                if (distToBase < 15) {
                    this.deliverCargo();
                }
            }

            // PAINEL INFERIOR
            if (this.state !== 'RETURNING') {
                ctx.fillStyle = this.colors.panel; ctx.fillRect(0, h - 50, w, 50);
                ctx.strokeStyle = this.colors.main; ctx.beginPath(); ctx.moveTo(0, h - 50); ctx.lineTo(w, h - 50); ctx.stroke();
                
                ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 16px 'Chakra Petch'";
                ctx.fillText(`CAÇAMBA: ${this.cargo}/${this.maxCargo}`, 15, h - 20);
                
                ctx.textAlign = "right"; ctx.fillStyle = this.colors.main; ctx.font = "12px Arial";
                ctx.fillText("ESCANEANDO CHÃO...", w - 15, h - 20);
            }
        },

        deliverCargo: function() {
            if (this.cargo > 0) {
                let reward = this.cargo * 500;
                this.money += reward;
                this.score += reward / 10;
                this.cargo = 0;
                this.vPos = { x: 0, y: 0 }; // Reseta a base
                window.System.msg(`+ R$${reward}`);
                if(window.Sfx) window.Sfx.coin();
                this.spawnParticles(window.innerWidth/2, window.innerHeight/2, 50, this.colors.success);
                this.changeState('DEPOT');
            }
        },

        drawDepot: function(ctx, w, h) {
            ctx.fillStyle = "#0a192f"; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "rgba(0, 255, 255, 0.1)"; ctx.lineWidth = 1;
            for(let i=0; i<w; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
            for(let i=0; i<h; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }

            const cx = w/2;
            ctx.fillStyle = this.colors.main; ctx.textAlign = "center";
            ctx.font = "bold clamp(30px, 6vw, 50px) 'Russo One'"; ctx.fillText("DEPÓSITO CENTRAL", cx, 80);
            
            ctx.fillStyle = this.colors.success; ctx.font = "bold 24px Arial";
            ctx.fillText(`CAIXA: R$ ${this.money.toLocaleString()}`, cx, 120);

            // Botão para voltar
            ctx.fillStyle = this.colors.main; ctx.fillRect(cx - 150, h - 100, 300, 60);
            ctx.fillStyle = "#000"; ctx.textAlign="center"; ctx.font="bold 20px 'Russo One'";
            ctx.fillText("NOVA PATRULHA", cx, h - 62);
        },

        drawOverlay: function(ctx, w, h, title, sub) {
            ctx.fillStyle = "rgba(0, 5, 10, 0.95)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = this.colors.main; ctx.textAlign = "center";
            ctx.font = "bold clamp(24px, 6vw, 50px) 'Russo One'"; ctx.fillText(title, w/2, h/2 - 20);
            ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; ctx.fillText(sub, w/2, h/2 + 30);
        },

        spawnParticles: function(x, y, count, color) {
            for(let i=0; i<count; i++) {
                particles.push({
                    x: x, y: y,
                    vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15,
                    life: 1.0, color: color, size: Math.random()*6+3
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
            if (this.aiIntervalId !== null) clearInterval(this.aiIntervalId);
            if (this._deviceOrientationHandler) window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            if (this._deviceMotionHandler) window.removeEventListener('devicemotion', this._deviceMotionHandler);
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('ar_truck_sim', 'AR Ops Real', '🚚', Game, {
                camera: 'environment',
                phases: [
                    { id: 'f1', name: 'COLETA FÍSICA', desc: 'Pilote o RC, encontre brinquedos e coloque-os na caçamba!', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();