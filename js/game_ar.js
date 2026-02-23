// =============================================================================
// AR TOY TRUCK SIMULATOR: V18 - PURE AR EXPERIENCE
// FOCO TOTAL NA CÂMARA REAL, DETEÇÃO DE BRINQUEDOS E UPGRADES ARCADE
// =============================================================================

(function() {
    "use strict";

    let particles = [];
    
    const Game = {
        state: 'BOOT', // BOOT, PLAY, EXTRACTING, GARAGE
        lastTime: 0,
        timeTotal: 0,
        
        // IA e Radar Óptico (Para apanhar brinquedos pequenos)
        objectModel: null,
        lastAiTime: 0,
        floorColor: { r: 0, g: 0, b: 0 },
        targetColor: { r: 0, g: 0, b: 0 },
        
        // Mecânica de Captura
        extractProgress: 0,
        cooldown: 0,
        
        // Economia e Progressão
        money: 0,
        cargo: 0,
        totalCollected: 0,
        
        // Atributos e Upgrades
        stats: {
            maxCargo: 3,
            vacuumSpeed: 1.0,
            moneyMultiplier: 1.0
        },
        
        upgrades: {
            vacuum: { lvl: 1, max: 5, cost: 500, name: "MOTOR DE SUCÇÃO", desc: "Aspira os carrinhos mais depressa" },
            cargo:  { lvl: 1, max: 5, cost: 800, name: "CAÇAMBA GIGANTE", desc: "Permite carregar mais brinquedos" },
            value:  { lvl: 1, max: 5, cost: 1200, name: "SCANNER DE LUXO", desc: "Aumenta o valor de cada brinquedo" }
        },

        colors: { main: '#00ffff', danger: '#ff003c', success: '#00ff66', panel: 'rgba(0,10,20,0.85)' },

        init: function() {
            this.state = 'BOOT';
            this.lastTime = performance.now();
            this.timeTotal = 0;
            this.money = 0;
            this.cargo = 0;
            this.totalCollected = 0;
            this.extractProgress = 0;
            this.cooldown = 0;
            particles = [];
            
            this.setupInput();
            this.startCameraAndAI();
        },

        startCameraAndAI: async function() {
            // Inicia Câmara Traseira
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                });
                if (window.System && window.System.video) {
                    window.System.video.srcObject = stream;
                    window.System.video.style.transform = "none";
                    await window.System.video.play();
                }
            } catch (e) {
                console.log("Erro na câmara, mas o jogo avança.");
            }

            // Inicia IA COCO-SSD de forma segura
            if (typeof cocoSsd === 'undefined') {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                script.onload = async () => {
                    this.objectModel = await cocoSsd.load().catch(() => null);
                    this.changeState('PLAY');
                };
                script.onerror = () => this.changeState('PLAY'); // Avança mesmo sem IA
                document.head.appendChild(script);
            } else {
                this.objectModel = await cocoSsd.load().catch(() => null);
                this.changeState('PLAY');
            }
        },

        changeState: function(newState) {
            this.state = newState;
            if (newState === 'PLAY') {
                if(window.Sfx && typeof window.Sfx.epic === 'function') window.Sfx.epic();
                window.System.msg("CÂMARA ATIVA! CONDUZA E PROCURE SUCATA.");
            }
        },

        setupInput: function() {
            const canvas = window.System?.canvas;
            if (!canvas) return;

            canvas.onpointerdown = (e) => {
                const r = canvas.getBoundingClientRect();
                const x = e.clientX - r.left; const y = e.clientY - r.top;
                const w = r.width; const h = r.height;

                if (this.state === 'PLAY' || this.state === 'EXTRACTING') {
                    // Botão da Oficina (Canto superior direito)
                    if (x > w - 160 && y < 80) {
                        this.changeState('GARAGE');
                        if(window.Sfx && typeof window.Sfx.click === 'function') window.Sfx.click();
                    }
                }
                else if (this.state === 'GARAGE') {
                    this.handleGarageClicks(x, y, w, h);
                }
            };
        },

        handleGarageClicks: function(x, y, w, h) {
            const cx = w/2;
            
            const buyObj = (cost, callback) => {
                if (this.money >= cost) { 
                    this.money -= cost; 
                    callback(); 
                    if(window.Sfx && typeof window.Sfx.coin === 'function') window.Sfx.coin(); 
                } else {
                    if(window.Sfx && typeof window.Sfx.error === 'function') window.Sfx.error();
                }
            };

            // Hitboxes dos Upgrades
            const checkUpg = (upgKey, btnY) => {
                if (y > btnY && y < btnY + 70 && x > cx - 250 && x < cx + 250) {
                    let u = this.upgrades[upgKey];
                    if (u.lvl < u.max) buyObj(u.cost, () => {
                        u.lvl++; u.cost = Math.floor(u.cost * 1.5); this.applyStats();
                    });
                }
            };

            checkUpg('vacuum', 180);
            checkUpg('cargo', 260);
            checkUpg('value', 340);

            // Botão Vender Carga
            if (y > h - 160 && y < h - 90 && x > cx - 200 && x < cx + 200) {
                if (this.cargo > 0) {
                    let total = this.cargo * 500 * this.stats.moneyMultiplier;
                    this.money += total;
                    this.cargo = 0;
                    window.System.msg(`VENDA CONCLUÍDA: +R$${total}`);
                    if(window.Sfx && typeof window.Sfx.coin === 'function') window.Sfx.coin();
                    this.spawnParticles(cx, h - 125, 30, this.colors.success);
                } else {
                    window.System.msg("A CAÇAMBA ESTÁ VAZIA!");
                }
            }

            // Botão Sair
            if (y > h - 80 && x > cx - 150 && x < cx + 150) {
                this.changeState('PLAY');
                if(window.Sfx && typeof window.Sfx.click === 'function') window.Sfx.click();
            }
        },

        applyStats: function() {
            this.stats.vacuumSpeed = 1.0 + (this.upgrades.vacuum.lvl * 0.4);
            this.stats.maxCargo = 2 + this.upgrades.cargo.lvl;
            this.stats.moneyMultiplier = 1.0 + (this.upgrades.value.lvl * 0.5);
        },

        // ==========================================
        // LÓGICA PRINCIPAL (UPDATE)
        // ==========================================
        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            if (isNaN(dt) || dt > 0.1 || dt < 0) dt = 0.016; 
            this.lastTime = now;
            this.timeTotal += dt;

            // 1. Desenha sempre a câmara de fundo
            if (window.System?.video && window.System.video.readyState === 4) {
                const vW = window.System.video.videoWidth || w; const vH = window.System.video.videoHeight || h;
                const videoRatio = vW / vH; const canvasRatio = w / h;
                let drawW = w, drawH = h, drawX = 0, drawY = 0;
                if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } 
                else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
                ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
            } else {
                ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
            }

            // Filtro AR
            if (this.state !== 'GARAGE') {
                ctx.fillStyle = `rgba(0, 40, 50, ${0.15 + Math.sin(this.timeTotal*2)*0.05})`;
                ctx.fillRect(0, 0, w, h);
            }

            // Máquina de Estados
            switch (this.state) {
                case 'BOOT':
                    this.drawOverlay(ctx, w, h, "A LIGAR O CAMIÃO...", "A carregar sistema de visão");
                    break;
                case 'PLAY':
                case 'EXTRACTING':
                    this.processAR(ctx, w, h, dt);
                    this.drawHUD(ctx, w, h);
                    break;
                case 'GARAGE':
                    this.drawGarage(ctx, w, h);
                    break;
            }

            this.updateParticles(ctx, dt, w, h);
            return this.score || 0; 
        },

        // Pega a cor média de uma zona (Para o Radar Óptico de Brinquedos)
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

        // ==========================================
        // DETEÇÃO AR E ASPIRAÇÃO (O CORE DO JOGO)
        // ==========================================
        processAR: function(ctx, w, h, dt) {
            if (this.cooldown > 0) this.cooldown -= dt;
            const cx = w / 2; const cy = h / 2;
            let objectInCrosshair = false;

            // Só procura se a caçamba não estiver cheia
            if (this.cargo < this.stats.maxCargo && this.cooldown <= 0) {
                
                // 1. RADAR DE COR (Excelente para detetar carrinhos no chão)
                this.floorColor = this.getAverageColor(ctx, cx - 50, h * 0.85, 100, 40); // Chão
                this.targetColor = this.getAverageColor(ctx, cx - 40, cy - 40, 80, 80); // Mira
                
                let colorDiff = Math.abs(this.floorColor.r - this.targetColor.r) + 
                                Math.abs(this.floorColor.g - this.targetColor.g) + 
                                Math.abs(this.floorColor.b - this.targetColor.b);

                // Se a cor na mira for muito diferente da cor do chão, há um brinquedo aí!
                if (colorDiff > 70) objectInCrosshair = true;

                // 2. IA DE SUPORTE (COCO-SSD)
                if (this.objectModel && window.System?.video && (this.timeTotal - this.lastAiTime > 0.5)) {
                    this.objectModel.detect(window.System.video).then(preds => {
                        let found = false;
                        (preds || []).forEach(item => {
                            // Ignora coisas gigantes que não são brinquedos
                            if (['person', 'bed', 'sofa', 'tv', 'door'].includes(item.class)) return;
                            const bW = item.bbox[2] * (w / window.System.video.videoWidth);
                            if (bW > w * 0.7) return; 
                            
                            // Desenha quadrado azul no objeto detetado pela IA
                            const x = item.bbox[0] * (w / window.System.video.videoWidth);
                            const y = item.bbox[1] * (h / window.System.video.videoHeight);
                            ctx.strokeStyle = "rgba(0, 255, 255, 0.5)"; ctx.lineWidth = 2;
                            ctx.strokeRect(x, y, bW, item.bbox[3] * (h / window.System.video.videoHeight));
                            
                            // Se o objeto estiver no meio do ecrã
                            const iCx = x + bW/2; const iCy = y + (item.bbox[3] * (h / window.System.video.videoHeight))/2;
                            if (Math.hypot(iCx - cx, iCy - cy) < 150) found = true;
                        });
                        if (found) objectInCrosshair = true;
                    }).catch(()=>{});
                    this.lastAiTime = this.timeTotal;
                }

                // MUDANÇA DE ESTADO
                if (objectInCrosshair && this.state === 'PLAY') {
                    this.state = 'EXTRACTING';
                    if(window.Sfx && typeof window.Sfx.hover === 'function') window.Sfx.hover();
                }
            }

            // ==========================================
            // MODO DE SUCÇÃO (ASPIRAR O BRINQUEDO)
            // ==========================================
            if (this.state === 'EXTRACTING') {
                if (objectInCrosshair) {
                    // Enche a barra consoante a força do motor de sucção
                    this.extractProgress += (30 * this.stats.vacuumSpeed * dt);
                    if(window.Gfx && typeof window.Gfx.addShake === 'function') window.Gfx.addShake(1);
                } else {
                    // Se o camião se afastar, perde o progresso
                    this.extractProgress -= (40 * dt);
                    if (this.extractProgress <= 0) {
                        this.extractProgress = 0;
                        this.state = 'PLAY';
                    }
                }

                // Efeitos Visuais de Aspiração
                ctx.fillStyle = `rgba(255, 0, 0, ${Math.abs(Math.sin(this.timeTotal*15))*0.3})`;
                ctx.fillRect(0, 0, w, h);
                
                ctx.fillStyle = this.colors.danger; ctx.textAlign = "center";
                ctx.font = "bold clamp(25px, 6vw, 50px) 'Russo One'";
                ctx.fillText("A ASPIRAR MATÉRIA!", cx, cy - 120);

                // Barra central Gigante
                ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(w*0.1, cy - 90, w*0.8, 30);
                ctx.fillStyle = this.colors.danger; ctx.fillRect(w*0.1, cy - 90, (this.extractProgress/100)*(w*0.8), 30);
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(w*0.1, cy - 90, w*0.8, 30);

                // Raio trator
                ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(this.timeTotal*20)*0.5})`; ctx.lineWidth = 25;
                ctx.beginPath(); ctx.moveTo(cx, h); ctx.lineTo(cx, cy); ctx.stroke();

                // Círculo a fechar
                const ringSize = Math.max(30, 200 - (this.extractProgress * 1.5));
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.timeTotal * 8);
                ctx.strokeStyle = this.colors.danger; ctx.lineWidth = 10; ctx.setLineDash([30, 20]);
                ctx.beginPath(); ctx.arc(0, 0, ringSize, 0, Math.PI*2); ctx.stroke(); ctx.restore();

                // CAPTURA COM SUCESSO!
                if (this.extractProgress >= 100) {
                    this.cargo++;
                    this.totalCollected++;
                    this.extractProgress = 0;
                    this.state = 'PLAY';
                    this.cooldown = 2.0; // 2 segundos antes de poder apanhar outro
                    
                    if(window.Gfx && typeof window.Gfx.shakeScreen === 'function') window.Gfx.shakeScreen(20);
                    if(window.Sfx && typeof window.Sfx.coin === 'function') window.Sfx.coin();
                    if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
                    
                    window.System.msg("BRINQUEDO RECOLHIDO!");
                    this.spawnParticles(cx, cy, 60, this.colors.main);
                }
            }
        },

        // ==========================================
        // UI DO CAMIÃO (DESENHO NA TELA)
        // ==========================================
        drawHUD: function(ctx, w, h) {
            const cx = w/2; const cy = h/2;
            let isFull = this.cargo >= this.stats.maxCargo;

            // Mira Central Desligada
            if (this.state === 'PLAY') {
                ctx.strokeStyle = isFull ? this.colors.danger : "rgba(0, 255, 255, 0.4)"; 
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI*2); ctx.stroke();
                // Cruz
                ctx.beginPath(); ctx.moveTo(cx - 150, cy); ctx.lineTo(cx - 90, cy); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx + 90, cy); ctx.lineTo(cx + 150, cy); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx, cy - 150); ctx.lineTo(cx, cy - 90); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx, cy + 90); ctx.lineTo(cx, cy + 150); ctx.stroke();
                
                if (isFull) {
                    ctx.fillStyle = this.colors.danger; ctx.textAlign = "center";
                    ctx.font = "bold 24px 'Russo One'"; ctx.fillText("CAÇAMBA CHEIA!", cx, cy - 140);
                }
            }

            // Barra Superior
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, 0, w, 60);
            ctx.strokeStyle = this.colors.main; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(w, 60); ctx.stroke();

            ctx.fillStyle = "#fff"; ctx.font = "bold 16px 'Chakra Petch'"; ctx.textAlign = "left";
            ctx.fillText(`MÁQUINAS RECOLHIDAS: ${this.totalCollected}`, 20, 35);

            // Botão da Oficina (Fica Verde e Pisca se estiver cheio)
            ctx.fillStyle = isFull ? (Math.sin(this.timeTotal*8)>0 ? this.colors.success : "#222") : "rgba(0,0,0,0.8)";
            ctx.fillRect(w - 160, 10, 150, 45);
            ctx.strokeStyle = isFull ? "#fff" : this.colors.main; ctx.strokeRect(w - 160, 10, 150, 45);
            ctx.fillStyle = isFull ? "#fff" : this.colors.main; ctx.textAlign = "center"; ctx.font = "bold 16px 'Russo One'";
            ctx.fillText("OFICINA 🔧", w - 85, 38);

            // Barra Inferior (Economia)
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, h - 70, w, 70);
            ctx.strokeStyle = this.colors.main; ctx.beginPath(); ctx.moveTo(0, h - 70); ctx.lineTo(w, h - 70); ctx.stroke();
            
            ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 22px 'Chakra Petch'";
            ctx.fillText(`CAÇAMBA: ${this.cargo} / ${this.stats.maxCargo}`, 20, h - 25);
            
            ctx.textAlign = "right"; ctx.fillStyle = this.colors.success; ctx.font = "bold 26px 'Russo One'";
            ctx.fillText(`R$ ${Math.floor(this.money).toLocaleString()}`, w - 20, h - 25);
        },

        // ==========================================
        // MENU DA OFICINA (SOBREPOSTO À CÂMARA)
        // ==========================================
        drawGarage: function(ctx, w, h) {
            const cx = w/2;

            // Fundo semi-transparente para não perder a câmara real completamente
            ctx.fillStyle = "rgba(0, 15, 30, 0.85)"; ctx.fillRect(0, 0, w, h);
            
            ctx.fillStyle = this.colors.main; ctx.textAlign = "center";
            ctx.font = "bold clamp(35px, 8vw, 60px) 'Russo One'";
            ctx.fillText("OFICINA USR", cx, 60);
            
            ctx.fillStyle = this.colors.success; ctx.font = "bold 28px 'Chakra Petch'";
            ctx.fillText(`CONTA BANCÁRIA: R$ ${this.money.toLocaleString()}`, cx, 110);

            // Botões de Upgrades
            const drawUpg = (y, key) => {
                let u = this.upgrades[key];
                let isMax = u.lvl >= u.max;
                let canBuy = this.money >= u.cost && !isMax;

                ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(cx - 250, y, 500, 70);
                ctx.strokeStyle = isMax ? "#555" : (canBuy ? this.colors.main : this.colors.danger);
                ctx.lineWidth = 3; ctx.strokeRect(cx - 250, y, 500, 70);

                ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Chakra Petch'";
                ctx.fillText(`NÍVEL ${u.lvl}: ${u.name}`, cx - 230, y + 30);
                ctx.fillStyle = "#aaa"; ctx.font = "14px Arial";
                ctx.fillText(u.desc, cx - 230, y + 55);

                ctx.textAlign = "right"; ctx.font = "bold 22px 'Russo One'";
                ctx.fillStyle = isMax ? "#555" : (canBuy ? this.colors.success : this.colors.danger);
                ctx.fillText(isMax ? "MÁXIMO" : `R$ ${u.cost}`, cx + 230, y + 42);
            };

            drawUpg(180, 'vacuum');
            drawUpg(260, 'cargo');
            drawUpg(340, 'value');

            // Botão Vender Carga
            let cargoVal = this.cargo * 500 * this.stats.moneyMultiplier;
            let hasCargo = this.cargo > 0;
            ctx.fillStyle = hasCargo ? this.colors.success : "#555"; ctx.fillRect(cx - 200, h - 160, 400, 70);
            ctx.fillStyle = hasCargo ? "#000" : "#aaa"; ctx.textAlign = "center"; ctx.font = "bold 22px 'Russo One'";
            ctx.fillText(hasCargo ? `ESVAZIAR CAÇAMBA (+R$${cargoVal})` : "CAÇAMBA VAZIA", cx, h - 118);

            // Botão Sair
            ctx.fillStyle = this.colors.main; ctx.fillRect(cx - 150, h - 80, 300, 50);
            ctx.fillStyle = "#000"; ctx.font = "bold 20px 'Russo One'";
            ctx.fillText("VOLTAR PARA O CHÃO", cx, h - 47);
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
                    vx: (Math.random()-0.5)*25, vy: (Math.random()-0.5)*25,
                    life: 1.0, color: color, size: Math.random()*10+5
                });
            }
        },

        updateParticles: function(ctx, dt, w, h) {
            ctx.globalCompositeOperation = 'screen';
            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
                p.life -= dt * 2.5;
                if (p.life <= 0) { particles.splice(i, 1); continue; }
                ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life);
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            }
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
        },

        cleanup: function() {
            // Nenhuma limpeza pesada necessária pois não usamos listeners globais complexos
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('ar_truck_sim', 'AR Toy Sweeper', '🚙', Game, {
                camera: 'environment', // Exige câmara traseira!
                phases: [
                    { id: 'f1', name: 'LIMPEZA DO QUARTO', desc: 'Prenda o telemóvel no camião RC e aspire brinquedos reais pelo chão.', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();