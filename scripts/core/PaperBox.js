import { DEFAULTS, MODULE_ID } from "../utils/constants.js";
import { RenderEngine } from "./RenderEngine.js";
import { InputManager } from "./InputManager.js";
import { HUD } from "../ui/HUD.js";
import { WallBuilder } from "./worldContainers/WallBuilder.js";
import { DoorBuilder } from "./worldContainers/DoorBuilder.js";
import { World3DOrchestrator } from "./world3DContainer.js";

export class PaperBox {
    constructor() {
        this._saveTimeout = null;
        this.state = { ...DEFAULTS };
        // Sub-sistemas só serão inicializados após carregar o estado salvo
        this.renderEngine = null;
        this.inputManager = null;
        this.hud = null;
        this.orchestrator = null;
        this.wallBuilder = null;
        this.doorBuilder = null;
    }

    initialize() {
        // Carregar estado salvo antes de inicializar subsistemas
        this.state.tilt = game.settings.get(MODULE_ID, "savedTilt") ?? DEFAULTS.tilt;
        this.state.rotation = game.settings.get(MODULE_ID, "savedRotation") ?? DEFAULTS.rotation;

        // Agora inicialize os subsistemas
        this.renderEngine = new RenderEngine(this);
        this.inputManager = new InputManager(this);
        this.hud = new HUD(this);
        this.orchestrator = new World3DOrchestrator(this);
        this.wallBuilder = new WallBuilder(this, this.orchestrator.container);
        this.doorBuilder = new DoorBuilder(this, this.orchestrator.container);

        try {
            this.wallBuilder.init();
        } catch (err) {console.error(`${MODULE_ID} | WallBuilder Init Failed:`, err);}

        try {
            this.doorBuilder.init();
        } catch (err) {console.error(`${MODULE_ID} | DoorBuilder Init Failed:`, err);}

        if (canvas.ready) {this.fullRefresh(); }
        // Verificar se está ativo
        const enabled = game.settings.get(MODULE_ID, "enabled");
        this.toggle(enabled);
    }

    async fullRefresh() {
        if (!this.wallBuilder || !this.doorBuilder || !this.orchestrator) return;
        console.log(`${MODULE_ID} | Executando Full Refresh Orquestrado...`);
        this.orchestrator.globalIntersections();
        await Promise.all([
            this.wallBuilder.refresh(),
            this.doorBuilder.refresh()
        ]);
        this.orchestrator.depthUpdate();
    }

    toggle(enabled) {
        if (enabled) {
            document.body.classList.add("paperbox-active");
            this.hud.render();
            this.renderEngine.activate();
            this.inputManager.activate();
            this.wallBuilder.activate();
            this.doorBuilder.activate();
            this.fullRefresh();
        } else {
            document.body.classList.remove("paperbox-active");
            this.hud.remove();
            this.renderEngine.deactivate();
            this.inputManager.deactivate();
            this.wallBuilder.deactivate();
            this.doorBuilder.deactivate();
        }
    }

    setState(updates) {
        // Atualiza o estado local
        this.state = { ...this.state, ...updates };

        // Atualiza HUD se existir
        if (this.hud && typeof this.hud.updateVisuals === 'function') {
            this.hud.updateVisuals();
        }

        // Propaga mudanças
        this.renderEngine.update();
        this._saveSettings();
    }

    _saveSettings() {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
            game.settings.set(MODULE_ID, "savedTilt", Number(this.state.tilt));
            game.settings.set(MODULE_ID, "savedRotation", Number(this.state.rotation));
        }, 1000);
    }
}
