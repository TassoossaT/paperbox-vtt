export class Projector {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this._cachedPivot = null;
        
        // Invalidate cache on resize
        window.addEventListener("resize", () => this._cachedPivot = null);
    }

    /**
     * Projects screen coordinates (clientX, clientY) to the board's local coordinate system (canvas space).
     * @param {number} clientX 
     * @param {number} clientY 
     * @returns {Object} {x, y}
     */
    getProjectedCoordinates(clientX, clientY) {
        const engine = this.paperbox.renderEngine;
        if (!engine || !engine.rotationContainer) return { x: 0, y: 0 };

        // 1. Converter coordenadas do ecrã para coordenadas globais do PIXI
        // O Foundry mapeia o ecrã para o canvas desta forma:
        const globalPoint = new PIXI.Point(clientX, clientY);

        // 2. Usar a função nativa toLocal do container que sofreu as transformações
        // Isso inverte automaticamente a Escala, o Tilt e a Rotação usando matrizes.
        const localPoint = engine.rotationContainer.toLocal(globalPoint);

        return {
            x: localPoint.x,
            y: localPoint.y
        };
    }
}