import { MODULE_ID } from "../utils/constants.js";

export class RenderEngine {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this._pendingUpdate = false;
    }

    update() {
        if (this._pendingUpdate) return;
        
        this._pendingUpdate = true;
        requestAnimationFrame(() => {
            this._doUpdate();
            this._pendingUpdate = false;
        });
    }

    _doUpdate() {
        const root = document.documentElement;
        const state = this.paperbox.state;
        
        // Atualiza CSS Variables
        root.style.setProperty('--pb-angle', `${state.tilt}deg`);
        root.style.setProperty('--pb-counter-angle', `-${state.tilt}deg`);
        root.style.setProperty('--pb-rotation', `${state.rotation}deg`);
        root.style.setProperty('--pb-counter-rotation', `-${state.rotation}deg`);

        // Atualiza as paredes (PIXI)
        if (this.paperbox.wallBuilder) {
            this.paperbox.wallBuilder.updateAllTransforms(state.tilt, state.rotation);
        }

        // Notifica a UI para atualizar também
        if (this.paperbox.hud) {
            this.paperbox.hud.updateVisuals();
        }
    }
}
