import { MODULE_ID } from "../utils/constants.js";

export class RenderEngine {
    constructor(paperbox) {
        this.paperbox = paperbox;
    }

    update() {
        const root = document.documentElement;
        const state = this.paperbox.state;
        
        // Atualiza CSS Variables
        root.style.setProperty('--pb-angle', `${state.tilt}deg`);
        root.style.setProperty('--pb-counter-angle', `-${state.tilt}deg`);
        root.style.setProperty('--pb-rotation', `${state.rotation}deg`);
        root.style.setProperty('--pb-counter-rotation', `-${state.rotation}deg`);

        // Notifica a UI para atualizar também
        if (this.paperbox.hud) {
            this.paperbox.hud.updateVisuals();
        }
    }
}
