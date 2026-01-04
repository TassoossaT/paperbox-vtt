import { getProjectionVector } from '../utils/math.js';
/**
 * PaperBox 3D Grid - Configurações suportadas (Aba Grid da Scene)
 *
 * Configurações nativas do Foundry:
 *   - grid.type:         Tipo de grid (0=Gridless, 1=Square, 2-5=Hex)
 *   - grid.size:         Tamanho do grid em pixels
 *   - width:             Largura da cena em pixels
 *   - height:            Altura da cena em pixels
 *   - padding:           Porcentagem de padding extra ao redor da cena
 *   - background.offsetX: Offset horizontal do background
 *   - background.offsetY: Offset vertical do background
 *   - grid.distance:     Distância real de cada célula (ex: 1)
 *   - grid.units:        Unidade de medida (ex: m, ft, yd)
 *   - grid.style:        Estilo visual do grid (linhas, pontos, etc)
 *   - grid.thickness:    Espessura das linhas do grid
 *   - grid.color:        Cor do grid
 *   - grid.alpha:        Opacidade do grid
 *
 * Configurações PaperBox 3D (via updateConfig ou renderConfig):
 *   - maxLevels:         Quantos planos de elevação (andares) o grid terá (inclui o piso)
 *   - showFloor:         Exibe o grid no chão (elevação 0)
 *   - showElevations:    Exibe planos acima do piso (andares superiores)
 *   - showWalls:         Exibe linhas verticais conectando os planos
 *   - allowedLevels:     Lista de elevações específicas (em px) a serem desenhadas. Se definido, substitui maxLevels
 *   - levelMasks:        Máscara circular por elevação: { [elevPx]: raioPx }
 *   - maskEnabled:       Ativa/desativa o recorte por máscara circular
 *   - maskFollowMouse:   Faz a máscara seguir o mouse (foco dinâmico)
 *   - maskDefaultRadius: Raio padrão da máscara quando não definido em levelMasks
 *   - floorMaskOverride: Máscara exclusiva para o piso (elevação 0)
 *   - revealMode:        Modo de revelação: 'mouse' (clip dinâmico), 'always' (tudo visível), 'manual' (foco externo)
 *
 * Observação: As opções nativas são configuradas na aba Grid da Scene. As opções PaperBox podem ser passadas via updateConfig ou alteradas em tempo real.
 */
/**
 * GridManager - Gerenciador de Grid 3D
 * Responsável por esconder o grid nativo e desenhar um grid customizado em perspectiva 3D
 *
 * Métodos do GridLayer (Foundry VTT) para referência:
 * ['constructor', 'calculateDimensions', 'getOffset', 'getOffsetRange', 'getAdjacentOffsets',
 *  'testAdjacency', 'getShiftedOffset', 'getShiftedPoint', 'getTopLeftPoint', 'getCenterPoint',
 *  'getShape', 'getVertices', 'getSnappedPoint', '_measurePath', 'getDirectPath',
 *  'getTranslatedPoint', 'getCircle', 'getCone']
 *
 * Observação: para grid quadrado, o Foundry desenha linhas de x=0 até x<=sceneWidth e y=0 até y<=sceneHeight, incremento de gridSize.
 */
export class GridManager {
    constructor(paperbox, rotationContainer) {
        this.paperbox = paperbox;
        this.rotationContainer = rotationContainer;
        this.nativeGridLayer = null;
        this.customGridContainer = null;
        this.gridLines = []; // Array de linhas do grid {x0, y0, x1, y1}
        this.graphics = null; // PIXI.Graphics para grid estático (plano de trabalho)
        this.cursorGraphics = null; // PIXI.Graphics para cursor 3D dinâmico
        this.activeElevation = 0; // Altura Z do plano de trabalho atual
        this._active = false;
        this._regenHandle = null; // RAF id para regenerar com dimensões atualizadas
        this.renderConfig = {
            maxLevels: 5,         // quantas elevações (inclui piso)
            showFloor: true,      // desenha grid no chão (elevation 0)
            showElevations: true, // desenha planos acima do piso
            showWalls: true,      // desenha linhas verticais no perímetro
            allowedLevels: null,  // lista opcional de elevações específicas (em px). Se setada, substitui maxLevels.
            levelMasks: null,     // mapa { elevPx: raioPx } para máscara circular por elevação
            maskEnabled: true,    // habilita/disable recorte por máscara
            maskFollowMouse: true,// segue o mouse para posicionar foco
            maskDefaultRadius: null, // raio padrão quando não houver raio definido para a elevação
            floorMaskOverride: null, // máscara exclusiva do piso (único lugar permitido para mascarar o chão)
            revealMode: 'mouse'   // 'mouse' (clip), 'always' (tudo visível), 'manual' (usa focusPoint definido externamente)
        };
    }

    /**
     * Inicializa o gerenciador (chamado pelo RenderEngine)
     */
    activate() {
        if (this._active) return;
        this._active = true;
        this._hideNativeGrid();
        this._createCustomGrid();
        // Desenha grid inicial
        const initialState = this.paperbox.state;
        this._drawGrid3D(initialState.tilt, initialState.rotation);
        // Registra listener de pointermove no inputManager global
        const inputManager = this.paperbox?.inputManager;
        if (inputManager) {
            this._pointerMoveListener = (ev, global) => {
                const target = this.rotationContainer || canvas.stage;
                const world = target.toLocal(global);
                this.updateCursor(world.x, world.y);
            };
            inputManager.addPointerMoveListener(this._pointerMoveListener);
        }
    }

    /**
     * Força a destruição e recriação do grid customizado, útil ao trocar de cena
     */
    forceGridRebuild() {
        this._destroyCustomGrid();
        this._createCustomGrid();
    }

    /**
     * Desativa o gerenciador
     * Restaura o grid nativo e limpa o grid customizado
     */
    deactivate() {
        if (!this._active) return;
        this._active = false;
        this._showNativeGrid();
        this._destroyCustomGrid();
        // Remove listener de pointermove
        const inputManager = this.paperbox?.inputManager;
        if (inputManager && this._pointerMoveListener) {
            inputManager.removePointerMoveListener(this._pointerMoveListener);
            this._pointerMoveListener = null;
        }
    }

    /**
     * Atualiza configuração de renderização do grid 3D e regenera.
     *
     * @param {Object} options - Opções de configuração do grid 3D. Todas são opcionais.
     * @param {number} [options.maxLevels]         - Quantos planos de elevação (andares) o grid terá (inclui o piso). Default: 5
     * @param {boolean} [options.showFloor]        - Exibe o grid no chão (elevação 0). Default: true
     * @param {boolean} [options.showElevations]   - Exibe planos acima do piso (andares superiores). Default: true
     * @param {boolean} [options.showWalls]        - Exibe linhas verticais conectando os planos. Default: true
     * @param {number[]} [options.allowedLevels]   - Lista de elevações específicas (em px) a serem desenhadas. Se definido, substitui maxLevels.
     * @param {Object} [options.levelMasks]        - Máscara circular por elevação: { [elevPx]: raioPx }. Só afeta planos acima do piso.
     * @param {boolean} [options.maskEnabled]      - Ativa/desativa o recorte por máscara circular. Default: true
     * @param {boolean} [options.maskFollowMouse]  - Faz a máscara seguir o mouse (foco dinâmico). Default: true
     * @param {number} [options.maskDefaultRadius] - Raio padrão da máscara quando não definido em levelMasks. Default: null (sem máscara)
     * @param {number} [options.floorMaskOverride] - Máscara exclusiva para o piso (elevação 0). Default: null (sem máscara no chão)
     * @param {string} [options.revealMode]        - Modo de revelação: 'mouse' (clip dinâmico), 'always' (tudo visível), 'manual' (foco externo). Default: 'mouse'
     */
    updateConfig(options = {}) {
        Object.assign(this.renderConfig, options);
        // Segurança: mínimo 1 nível
        this.renderConfig.maxLevels = Math.max(1, Number(this.renderConfig.maxLevels) || 1);
        // Piso sempre ligado por padrão
        this.renderConfig.showFloor = true;
        this.renderConfig.maskEnabled = options.maskEnabled !== undefined ? !!options.maskEnabled : this.renderConfig.maskEnabled;
        this.renderConfig.maskFollowMouse = options.maskFollowMouse !== undefined ? !!options.maskFollowMouse : this.renderConfig.maskFollowMouse;
        if (options.maskDefaultRadius !== undefined) {
            const r = Number(options.maskDefaultRadius);
            this.renderConfig.maskDefaultRadius = Number.isFinite(r) && r > 0 ? r : null;
        }
        if (options.revealMode) {
            const allowed = ['mouse','always','manual'];
            this.renderConfig.revealMode = allowed.includes(options.revealMode) ? options.revealMode : 'mouse';
        }
        if (Array.isArray(this.renderConfig.allowedLevels)) {
            this.renderConfig.allowedLevels = this.renderConfig.allowedLevels
                .map(n => Number(n))
                .filter(n => !Number.isNaN(n));
            if (this.renderConfig.allowedLevels.length === 0) {
                this.renderConfig.allowedLevels = null;
            }
        } else {
            this.renderConfig.allowedLevels = null;
        }

        // Normaliza levelMasks
        if (this.renderConfig.levelMasks && typeof this.renderConfig.levelMasks === 'object') {
            const normalized = {};
            for (const [k, v] of Object.entries(this.renderConfig.levelMasks)) {
                const elev = Number(k);
                const radius = Number(v);
                // Piso não é mascarável via levelMasks; apenas via floorMaskOverride
                if (elev === 0) continue;
                if (Number.isFinite(elev) && Number.isFinite(radius) && radius > 0) {
                    normalized[elev] = radius;
                }
            }
            this.renderConfig.levelMasks = Object.keys(normalized).length ? normalized : null;
        } else {
            this.renderConfig.levelMasks = null;
        }
        this._scheduleRegenerate();
    }



    /**
     * Atualiza o grid 3D baseado em tilt e rotação
     */
    update(tilt, rotation) {
        if (!this.customGridContainer) return;
        
        // Limpa graphics anterior
        if (this.graphics) {
            this.graphics.clear();
        }
        
        // Desenha grid 3D com nova perspectiva
        this._drawGrid3D(tilt, rotation);
    }

    /**
     * Encontra o GridLayer nativo na hierarquia
     */
    _findGridLayer(container) {
        if (container.name === 'GridLayer') return container;
        if (container.children) {
            for (const child of container.children) {
                const found = this._findGridLayer(child);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Esconde o grid nativo do Foundry
     */
    _hideNativeGrid() {
        // Tenta encontrar o GridLayer na hierarquia do rotationContainer
        this.nativeGridLayer = this._findGridLayer(this.rotationContainer);
        // Se não encontrar, tenta a partir do canvas.stage (garante ocultação mesmo se a ordem mudou)
        if (!this.nativeGridLayer && canvas?.stage) {
            this.nativeGridLayer = this._findGridLayer(canvas.stage);
        }
        if (this.nativeGridLayer) {
            this.nativeGridLayer.visible = false;
        }
    }

    /**
     * Restaura o grid nativo do Foundry
     */
    _showNativeGrid() {
        if (this.nativeGridLayer) {
            this.nativeGridLayer.visible = true;
            this.nativeGridLayer = null;
        }
    }

    /**
     * Cria o container para o grid customizado 3D
     */
    _createCustomGrid() {
        this.customGridContainer = new PIXI.Container();
        this.customGridContainer.name = "PaperBox3DGrid";
        this.customGridContainer.eventMode = 'none'; // não intercepta cliques
        this.rotationContainer.addChild(this.customGridContainer);
        
        // Gera os dados das linhas do grid
        this._generateGridLines();
        
        // Cria camada estática (grid do plano)
        this.graphics = new PIXI.Graphics();
        this.customGridContainer.addChild(this.graphics);

        // Cria camada dinâmica (cursor 3D)
        this.cursorGraphics = new PIXI.Graphics();
        this.customGridContainer.addChild(this.cursorGraphics);

        // Desenha grid inicial
        const state = this.paperbox.state;
        this._drawGrid3D(state.tilt, state.rotation);
    }

    /**
     * Destroi o container do grid customizado
     */
    _destroyCustomGrid() {
        if (this.customGridContainer) {
            this.customGridContainer.destroy({ children: true });
            this.customGridContainer = null;
        }
        this.graphics = null;
        this.gridLines = [];
    }

    /**
     * Regenera o grid quando configurações da cena mudarem
     */
    _regenerateGrid() {
        if (!this.customGridContainer) return;
        if (!canvas?.dimensions) return;
        
        // Destroi graphics anterior
        if (this.graphics) {
            this.graphics.destroy();
            this.graphics = null;
        }
        
        // Gera novos dados das linhas
        this._generateGridLines();
        
        // Cria novo graphics
        this.graphics = new PIXI.Graphics();
        this.customGridContainer.addChild(this.graphics);
        
        // Redesenha
        const state = this.paperbox.state;
        this._drawGrid3D(state.tilt, state.rotation);
    }

    /**
     * Agenda a regeneração para o próximo frame, garantindo que canvas.dimensions
     * já esteja atualizado após uma mudança de cena/grid.
     */
    _scheduleRegenerate() {
        if (this._regenHandle) cancelAnimationFrame(this._regenHandle);
        this._regenHandle = requestAnimationFrame(() => {
            this._regenHandle = null;
            this._regenerateGrid();
        });
    }

    /**
     * Gera as coordenadas de todas as linhas do grid 3D volumétrico
     * Cria grids em múltiplas elevações + linhas verticais conectando
     */
    _generateGridLines() {
        this.gridLines = [];
        if (!canvas.grid || !canvas.scene) return;
        // Gera o grid de (0,0) até (boardWidth, boardHeight), cobrindo todo o board (área jogável)
        const gridSize = canvas.grid.size;
        const boardWidth = canvas.dimensions.width;
        const boardHeight = canvas.dimensions.height;
        const cols = Math.ceil(boardWidth / gridSize);
        const rows = Math.ceil(boardHeight / gridSize);
        const endX = cols * gridSize;
        const endY = rows * gridSize;
        const gridTypeRaw = canvas.scene.grid.type;
        const gridType = gridTypeRaw === 0 ? 1 : gridTypeRaw; // fallback: gridless vira square

        // Níveis de elevação baseados no tamanho do grid (formando cubos)
        let elevations;
        if (Array.isArray(this.renderConfig.allowedLevels) && this.renderConfig.allowedLevels.length) {
            const set = new Set(this.renderConfig.allowedLevels);
            set.add(0); // garante piso sempre
            elevations = [...set].sort((a, b) => a - b);
        } else {
            const levels = Math.max(1, Number(this.renderConfig.maxLevels) || 1);
            elevations = Array.from({ length: levels }, (_, i) => i * gridSize);
        }

        // Por enquanto, suporta apenas Square grid (tipo 1)
        // TODO: Implementar hexagonal grids (tipos 2-5)
        if (gridType !== 1) {
            console.warn(`GridManager: Grid tipo ${gridType} não suportado ainda. Usando Square.`);
        }

        // Para cada nível de elevação, cria um grid horizontal completo
        for (const elevation of elevations) {
            // Linhas verticais (direção Y) em cada elevação
            for (let i = 0; i <= cols; i++) {
                const x = i * gridSize;
                if (x > endX) continue;
                if (elevation !== 0 && !this.renderConfig.showElevations) continue;
                this.gridLines.push({
                    x0: x,
                    y0: 0,
                    x1: x,
                    y1: endY,
                    lift: elevation // Altura Z desta linha
                });
            }
            // Linhas horizontais (direção X) em cada elevação
            for (let j = 0; j <= rows; j++) {
                const y = j * gridSize;
                if (y > endY) continue;
                if (elevation !== 0 && !this.renderConfig.showElevations) continue;
                this.gridLines.push({
                    x0: 0,
                    y0: y,
                    x1: endX,
                    y1: y,
                    lift: elevation // Altura Z desta linha
                });
            }
        }

        // Linhas verticais (direção Z) conectando as elevações
        if (this.renderConfig.showWalls && elevations.length > 1) {
            for (let i = 0; i <= cols; i++) {
                const x = i * gridSize;
                if (x > endX) continue;
                for (let j = 0; j <= rows; j++) {
                    const y = j * gridSize;
                    if (y > endY) continue;
                    for (let k = 0; k < elevations.length - 1; k++) {
                        // Respeita ocultar elevações: só conecta se ambos níveis existem
                        const liftA = elevations[k];
                        const liftB = elevations[k + 1];
                        const aVisible = liftA === 0 ? true : this.renderConfig.showElevations;
                        const bVisible = liftB === 0 ? this.renderConfig.showFloor : this.renderConfig.showElevations;
                        if (!aVisible || !bVisible) continue;
                        this.gridLines.push({
                            x0: x,
                            y0: y,
                            x1: x,
                            y1: y,
                            lift: liftA,
                            liftEnd: liftB,
                            isVertical: true
                        });
                    }
                }
            }
        }
    }

    /**
     * Desenha o grid estático: chão referência + plano de trabalho ativo
     */
    _drawGrid3D(tilt, rotation) {
        if (!this.graphics) return;
        this.graphics.clear();
        
        // Sincroniza com configurações nativas do grid
        const gridConfig = canvas.scene.grid;
        const color = typeof gridConfig.color === 'string' 
            ? parseInt(gridConfig.color.replace('#', '0x'))
            : gridConfig.color;
        // Garante que alpha seja um número entre 0 e 1
        let alpha = Number(gridConfig.alpha);
        if (!Number.isFinite(alpha)) alpha = 1;
        alpha = Math.max(0, Math.min(1, alpha));
        const thickness = gridConfig.thickness;

        const drawLine = (x0, y0, x1, y1, lift) => {
            const { x: dx, y: dy } = getProjectionVector(lift, tilt, rotation);
            this.graphics.moveTo(x0 + dx, y0 + dy);
            this.graphics.lineTo(x1 + dx, y1 + dy);
        };

        // FASE 1: Grid de referência (chão Z=0) - sempre visível, mas fraco
        this.graphics.lineStyle(1, color, alpha);
        for (const line of this.gridLines) {
            if (!line.isVertical && line.lift === 0) {
                drawLine(line.x0, line.y0, line.x1, line.y1, 0);
            }
        }

        // FASE 2: Grid do plano de trabalho ativo (Z = activeElevation)
        if (this.activeElevation !== 0 && this.renderConfig.showElevations) {
            this.graphics.lineStyle(2, 0x00FFFF, alpha * 0.4); // Ciano para destaque
            for (const line of this.gridLines) {
                if (!line.isVertical && line.lift === this.activeElevation) {
                    drawLine(line.x0, line.y0, line.x1, line.y1, this.activeElevation);
                }
            }
        }
    }


    /**
     * Atualiza o cursor 3D do grid (chamado externamente pelo InputManager)
     * @param {number} x - posição X no mundo (snap opcional)
     * @param {number} y - posição Y no mundo (snap opcional)
     */
    updateCursor(x, y) {
        if (!this._active) return;
        const gridSize = canvas.grid.size;
        // Snap relativo ao início do board
        const snappedX = Math.floor(x / gridSize) * gridSize;
        const snappedY = Math.floor(y / gridSize) * gridSize;
        this._drawCursorUI(snappedX, snappedY, gridSize);
    }



    /**
     * Desenha o cursor volumétrico 3D com âncora visual
     */
    _drawCursorUI(x, y, size) {
        if (!this.cursorGraphics) return;
        const cg = this.cursorGraphics;
        cg.clear();
        
        const z = this.activeElevation;
        const cursorColor = 0xFF5500; // Laranja vibrante
        const state = this.paperbox.state;

        // Helper para projetar ponto 3D
        const project = (px, py, pz) => {
            const { x: dx, y: dy } = getProjectionVector(pz, state.tilt, state.rotation);
            return { x: px + dx, y: py + dy };
        };

        // A. CHÃO DA CÉLULA (onde o objeto ficará)
        // Garante alinhamento com origem do board
        const p0 = project(x, y, z);
        const p1 = project(x + size, y, z);
        const p2 = project(x + size, y + size, z);
        const p3 = project(x, y + size, z);

        cg.lineStyle(3, cursorColor, 1);
        cg.beginFill(cursorColor, 0.25);
        cg.moveTo(p0.x, p0.y);
        cg.lineTo(p1.x, p1.y);
        cg.lineTo(p2.x, p2.y);
        cg.lineTo(p3.x, p3.y);
        cg.lineTo(p0.x, p0.y);
        cg.endFill();

        // B. RÉGUA DE PROFUNDIDADE (anchor line ao chão)
        if (z !== 0) {
            const pGround = project(x + size/2, y + size/2, 0);
            
            cg.lineStyle(2, cursorColor, 0.6);
            const pCenter = project(x + size/2, y + size/2, z);
            cg.moveTo(pCenter.x, pCenter.y);
            cg.lineTo(pGround.x, pGround.y);
            
            // Sombra no chão para ancorar
            cg.beginFill(0x000000, 0.4);
            cg.drawCircle(pGround.x, pGround.y, 4);
            cg.endFill();
        }
    }

    // APIs externas
    setActiveElevation(heightPx) {
        const h = Number(heightPx);
        if (!Number.isFinite(h) || h < 0) return;
        this.activeElevation = h;
        const state = this.paperbox.state;
        this._drawGrid3D(state.tilt, state.rotation);
    }


    /**
     * Método de debug - chame do console: game.modules.get('paperbox-vtt').gridManager.debug()
     */
    debug() {
        console.log('📐 GridManager Debug:', {
            active: !!this.customGridContainer,
            totalLines: this.gridLines.length,
            nativeGridHidden: this.nativeGridLayer?.visible === false,
            graphicsExists: !!this.graphics,
            graphicsVisible: this.graphics?.visible,
            graphicsBounds: this.graphics?.getBounds(),
            currentState: {
                tilt: this.paperbox.state.tilt,
                rotation: this.paperbox.state.rotation
            },
            sceneInfo: {
                gridSize: canvas.dimensions.size,
                gridType: canvas.scene.grid.type,
                startX: canvas.dimensions.sceneX,
                startY: canvas.dimensions.sceneY,
                width: canvas.dimensions.sceneWidth,
                height: canvas.dimensions.sceneHeight
            },
            sampleLines: {
                firstHorizontal: this.gridLines.find(l => !l.isVertical && l.lift === 0),
                firstAtElevation100: this.gridLines.find(l => !l.isVertical && l.lift === 100),
                firstVertical: this.gridLines.find(l => l.isVertical)
            }
        });
        
        // Mostra quantas linhas por elevação
        const byElevation = {};
        for (const line of this.gridLines) {
            const key = line.isVertical ? 'vertical' : `lift_${line.lift}`;
            byElevation[key] = (byElevation[key] || 0) + 1;
        }
        console.log('📐 Linhas por elevação:', byElevation);
    }
}
