import { MODULE_ID } from "../../utils/constants.js";
import { getSegmentProjection, compareSegments, findIntersectionT } from "../../utils/math.js";

export class World3DOrchestrator {
    constructor(renderer) {
        this.renderer = renderer;
        this.paperbox = renderer.paperbox;
        this._world3DContainer = new PIXI.Container();
        this._world3DContainer.sortableChildren = true;
        
        this.intersectionMap = new Map();
        this._tokenPositionCache = new Map();
        this.visualComponents = new Set();

        canvas.primary.addChild(this._world3DContainer);
        this.setupFoundryCanvas();
    }

    setupFoundryCanvas() {
        const setup = () => {
            if (!canvas.primary) return;
            // Limpa máscaras que podem interferir na renderização 3D
            if (canvas.primary.mask) canvas.primary.mask = null;
            if (canvas.primary.sprite?.mask) canvas.primary.sprite.mask = null;

            canvas.primary.addChild(this._world3DContainer);
        };

        Hooks.on("canvasReady", setup);
        if (canvas.ready) setup();
    }

    registerComponent(vc) {
        this.visualComponents.add(vc);
    }

    unregisterComponent(vc) {
        this.visualComponents.delete(vc);
    }

    get container() { return this._world3DContainer; }

    /**
     * Sincroniza tokens apenas para detectar se houve movimento global
     */
    syncMovingTokens() {
        const tokenBuilder = this.renderer.tokenBuilder;
        if (!tokenBuilder || !tokenBuilder.tokens) return false;
        
        let needsDepthUpdate = false;
        const currentIds = new Set(tokenBuilder.tokens.keys());

        for (const cachedId of this._tokenPositionCache.keys()) {
            if (!currentIds.has(cachedId)) this._tokenPositionCache.delete(cachedId);
        }
        
        for (const [id, token3d] of tokenBuilder.tokens.entries()) {
            const doc = token3d.doc;
            const cached = this._tokenPositionCache.get(id);
            const current = { x: doc.x, y: doc.y, elevation: doc.elevation || 0 };
            
            if (!cached || cached.x !== current.x || cached.y !== current.y || cached.elevation !== current.elevation) {
                this._tokenPositionCache.set(id, current);
                needsDepthUpdate = true;
            }
        }
        return needsDepthUpdate;
    }

    /**
     * O ORQUESTRADOR PURO: 
     * Apenas lê as transformações já calculadas pelos VisualComponents e ordena.
     */
    async depthUpdate() {
        const { rotation } = this.paperbox.state;
        const spriteData = [];

        // 1. Coleta e Projeção
        for (const visual of this.visualComponents) {
            // Assumimos que o VisualComponent já executou seu próprio 'update' 
            // internamente e guardou o resultado em sprite.lastTransform
            for (const sprite of visual.sprites) {
                const transform = sprite.lastTransform; 
                if (!transform || !transform.liveCoords) continue;

                spriteData.push({
                    sprite,
                    // Projetamos o segmento transformado para o eixo de profundidade (Z-Order)
                    proj: getSegmentProjection(transform.liveCoords, rotation)
                });
            }
        }

        // 2. Ordenação Baseada na Projeção
        spriteData.sort((A, B) => compareSegments(A.proj, B.proj));

        // 3. Aplicação do Z-Index
        for (let i = 0; i < spriteData.length; i++) {
            spriteData[i].sprite.zIndex = i;
        }

        // 4. Trigger do PIXI para reordenar os filhos visualmente
        this._world3DContainer.sortChildren();
    }

    /**
     * Mantém o cálculo de interseções para rebuild (lógica de malha)
     */
    globalIntersections() {
        this.intersectionMap.clear();
        const all3DWalls = canvas.walls.placeables.filter(w => w.document.getFlag(MODULE_ID, "is3D"));

        for (const w of all3DWalls) {
            const cuts = new Set([0, 1]);
            if (w.document.getFlag(MODULE_ID, "animation.double")) cuts.add(0.5);
            this.intersectionMap.set(w.id, cuts);
        }

        for (let i = 0; i < all3DWalls.length; i++) {
            for (let j = i + 1; j < all3DWalls.length; j++) {
                const wA = all3DWalls[i];
                const wB = all3DWalls[j];

                const tA = findIntersectionT(
                    {x: wA.document.c[0], y: wA.document.c[1]}, {x: wA.document.c[2], y: wA.document.c[3]},
                    {x: wB.document.c[0], y: wB.document.c[1]}, {x: wB.document.c[2], y: wB.document.c[3]}
                );
                if (tA !== null) this.intersectionMap.get(wA.id).add(tA);

                const tB = findIntersectionT(
                    {x: wB.document.c[2], y: wB.document.c[3]}, {x: wB.document.c[0], y: wB.document.c[1]},
                    {x: wA.document.c[0], y: wA.document.c[1]}, {x: wA.document.c[2], y: wA.document.c[3]}
                );
                if (tB !== null) this.intersectionMap.get(wB.id).add(tB);
            }
        }
    }
}