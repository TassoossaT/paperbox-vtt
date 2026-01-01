export class LightManager {
    constructor(paperbox) {
        this.paperbox = paperbox;
    }

    /**
     * Força o Foundry a recalcular a iluminação e o campo de visão (FOV).
     * Chame este método dentro do seu loop de rotação/tilt.
     */
    refresh() {
        if (!canvas.ready || !canvas.perception) return;

        // O parâmetro 'true' no final força a atualização imediata (imediate: true)
        canvas.perception.update({
            refreshVision: true,
            refreshLighting: true,
            refreshSounds: false,
            refreshTiles: false
        }, true);
    }
}
