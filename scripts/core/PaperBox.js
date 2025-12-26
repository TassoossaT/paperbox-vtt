import { DEFAULTS, MODULE_ID } from "../utils/constants.js";
import { RenderEngine } from "./RenderEngine.js";
import { InputManager } from "./InputManager.js";
import { HUD } from "../ui/HUD.js";
import { Projector } from "./Projector.js";

export class PaperBox {
    constructor() {
        this.state = { ...DEFAULTS };
        
        // Sub-sistemas
        this.renderEngine = new RenderEngine(this);
        this.inputManager = new InputManager(this);
        this.hud = new HUD(this);
        this.projector = new Projector(this);
        
        this._saveTimeout = null;
    }

    initialize() {
        console.log(`${MODULE_ID} | Initializing Core...`);
        
        // Carregar estado salvo
        this.state.tilt = game.settings.get(MODULE_ID, "savedTilt");
        this.state.rotation = game.settings.get(MODULE_ID, "savedRotation");

        // Verificar se está ativo
        const enabled = game.settings.get(MODULE_ID, "enabled");
        this.toggle(enabled);
    }

    toggle(enabled) {
        if (enabled) {
            document.body.classList.add("paperbox-active");
            this.hud.render();
            this.renderEngine.update();
            this.inputManager.activate();
        } else {
            document.body.classList.remove("paperbox-active");
            this.hud.remove();
            this.inputManager.deactivate();
        }
    }

    setState(updates) {
        // Atualiza o estado local
        this.state = { ...this.state, ...updates };
        
        // Propaga mudanças
        this.renderEngine.update();
        this._saveSettings();
    }

    _saveSettings() {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
            game.settings.set(MODULE_ID, "savedTilt", this.state.tilt);
            game.settings.set(MODULE_ID, "savedRotation", this.state.rotation);
        }, 1000);
    }
}
