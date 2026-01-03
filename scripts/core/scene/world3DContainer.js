import { MODULE_ID } from "../../utils/constants.js";
import { getSegmentProjection, compareSegments, findIntersectionT } from "../../utils/math.js";
export class World3DOrchestrator {
    constructor(renderer) {
        this.renderer = renderer;
        this.paperbox = renderer.paperbox;
        this._pendingDepthUpdate = false;
        this._world3DContainer = new PIXI.Container();
        this.intersectionMap = new Map();
        this._world3DContainer.sortableChildren = true;
        this._world3DContainer.cullable = false;
        this._world3DContainer.mask = null;
        if (canvas.primary.mask) canvas.primary.mask = null;
        if (canvas.primary.sprite?.mask) canvas.primary.sprite.mask = null;
        canvas.primary.addChild(this._world3DContainer);
        
        // Cache de posições para detectar movimento de tokens
        this._tokenPositionCache = new Map();
    }

    get container() {return this._world3DContainer;}


    syncMovingTokens() {
        if (!this.renderer.tokenBuilder) return false;
        
        let needsDepthUpdate = false;
        
        // Limpa cache de tokens que não existem mais (mudança de cena)
        const currentTokenIds = new Set(this.renderer.tokenBuilder.tokens.keys());
        for (const cachedId of this._tokenPositionCache.keys()) {
            if (!currentTokenIds.has(cachedId)) {
                this._tokenPositionCache.delete(cachedId);
            }
        }
        
        for (const [tokenId, container] of this.renderer.tokenBuilder.tokens.entries()) {
            const doc = container._tokenDoc;
            if (!doc?.object) continue;
            
            const cached = this._tokenPositionCache.get(tokenId);
            const current = {
                x: doc.x,
                y: doc.y,
                elevation: doc.elevation || 0
            };
            
            // Se mudou de posição, marca para atualizar depth
            if (!cached || cached.x !== current.x || cached.y !== current.y || cached.elevation !== current.elevation) {
                this._tokenPositionCache.set(tokenId, current);
                needsDepthUpdate = true;
            }
        }
        
        return needsDepthUpdate;
    }

    async depthUpdate() {
        const { wallBuilder, doorBuilder, tokenBuilder, tileBuilder } = this.renderer;
        const { state } = this.paperbox;
        const { tilt, rotation } = state;

        // 1. Snapshot Síncrono: Pegamos todos os sprites de uma vez
        const allSprites = [
            ...Array.from(wallBuilder.sprites.values()),
            ...Array.from(doorBuilder.sprites.values()),
            ...Array.from(tokenBuilder.tokens.values()),
            ...Array.from(tileBuilder.sprites.values())
        ];

        // 2. Fase de Transformação: Atualizamos as matrizes de todos ANTES de calcular profundidade
        // Agora suportando funções assíncronas
        const spriteData = (await Promise.all(allSprites.map(async sprite => {
            if (!sprite._builder) return null;

            // O builder atualiza a matriz visual e retorna as coordenadas NO CHÃO
            const liveCoords = await sprite._builder.updateTransform(sprite, tilt, rotation);
            
            // Se liveCoords for null, o sprite é inválido (pode ser de cena antiga)
            if (!liveCoords) return null;
            
            return {
                sprite,
                // Criamos a projeção baseada no estado FINAL da matriz neste frame
                proj: getSegmentProjection(liveCoords, rotation)
            };
        }))).filter(item => item !== null); // Remove elementos nulos

        // 3. Fase de Ordenação: Agora que todos estão estáticos neste frame, ordenamos
        spriteData.sort((A, B) => compareSegments(A.proj, B.proj));

        // 4. Fase de Aplicação: Aplicamos o zIndex
        for (let i = 0; i < spriteData.length; i++) {
            spriteData[i].sprite.zIndex = i;
        }
        this._world3DContainer.sortChildren();
    }

    globalIntersections() {
        this.intersectionMap.clear();
        
        // Pega todos os objetos 3D do mapa de uma vez
        const all3D = canvas.walls.placeables.filter(w => w.document.getFlag(MODULE_ID, "is3D"));

        // Inicializa os pontos básicos [0, 1] e cortes de porta dupla para cada ID
        for (const w of all3D) {
            const cuts = new Set([0, 1]);
            if (w.document.getFlag(MODULE_ID, "animation.double")) cuts.add(0.5);
            this.intersectionMap.set(w.id, cuts);
        }

        // Loop de colisão: Compara cada objeto 3D contra todos os outros
        for (let i = 0; i < all3D.length; i++) {
            for (let j = i + 1; j < all3D.length; j++) {
                const wA = all3D[i];
                const wB = all3D[j];

                // Ponto de interseção em relação à parede A
                const tA = findIntersectionT(
                    {x: wA.document.c[0], y: wA.document.c[1]}, {x: wA.document.c[2], y: wA.document.c[3]},
                    {x: wB.document.c[0], y: wB.document.c[1]}, {x: wB.document.c[2], y: wB.document.c[3]}
                );
                if (tA !== null) this.intersectionMap.get(wA.id).add(tA);

                // Ponto de interseção em relação à parede B
                const tB = findIntersectionT(
                    {x: wB.document.c[0], y: wB.document.c[1]}, {x: wB.document.c[2], y: wB.document.c[3]},
                    {x: wA.document.c[0], y: wA.document.c[1]}, {x: wA.document.c[2], y: wA.document.c[3]}
                );
                if (tB !== null) this.intersectionMap.get(wB.id).add(tB);
            }
        }
        console.log(`${MODULE_ID} | Interseções globais calculadas para ${all3D.length} objetos.`);
    }
}