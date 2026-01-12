import { DEFAULTS, MODULE_ID } from "../utils/constants.js";
import { RenderEngine } from "../engine/RenderEngine.js";
import { LightManager } from "../engine/LightManager.js";
import { InputManager } from "../system/InputManager.js";
import { HUD } from "../ui/HUD.js";
import { SceneRenderer } from "./scene/SceneRenderer.js";

export class PaperBox {
    constructor() {
        this._saveTimeout = null;
        this.state = { ...DEFAULTS };
        
        // Subsistemas Globais (não dependem de cena)
        this.renderEngine = null;
        this.inputManager = null;
        this.hud = null;
        this.lightManager = null;
        
        // Gerenciamento de Cena (cada cena tem seu próprio SceneRenderer)
        this.currentSceneRenderer = null;  // Cena ativa no momento
        this.sceneCache = new Map();       // Cache opcional de cenas
    }

    initialize() {
        // 1. Carregar estado salvo
        this.state.tilt = game.settings.get(MODULE_ID, "savedTilt") ?? DEFAULTS.tilt;
        this.state.rotation = game.settings.get(MODULE_ID, "savedRotation") ?? DEFAULTS.rotation;

        // 2. Inicializar subsistemas GLOBAIS (não dependem de cena)
        this.lightManager = new LightManager(this);
        this.renderEngine = new RenderEngine(this);
        this.inputManager = new InputManager(this);
        this.hud = new HUD(this);

        // 3. Hooks para troca de cena
        Hooks.on("canvasReady", this._onCanvasReady.bind(this));
        Hooks.on("canvasTearDown", this._onCanvasTearDown.bind(this));

        // 4. Se já houver cena, carrega
        if (canvas.ready) {
            this._onCanvasReady();
        }

        // 5. Ativa ou desativa baseado em settings
        const enabled = game.settings.get(MODULE_ID, "enabled");
        this.toggle(enabled);
    }

    /**
     * Chamado quando o Foundry carrega uma cena
     */
    async _onCanvasReady() {
        const sceneId = canvas.scene?.id;
        if (!sceneId) return;

        // Se já existe renderer para esta cena, reutiliza
        if (this.currentSceneRenderer) {
            if (this.currentSceneRenderer.sceneId !== sceneId) {
                // Cena diferente, destroi a anterior
                this.currentSceneRenderer.destroy();
                this.currentSceneRenderer = null;
            } else {
                // Mesma cena (ex: F5), apenas refresh
                await this.currentSceneRenderer.fullRefresh();
                return;
            }
        }

        console.log(`${MODULE_ID} | Cena mudou. Criando SceneRenderer para: ${canvas.scene.name}`);

        // Criar novo renderer para esta cena
        this.currentSceneRenderer = new SceneRenderer(this, sceneId);
        
        try {
            await this.currentSceneRenderer.init();
            this.currentSceneRenderer.activate();
            this.hud.render();
        } catch (err) {
            console.error(`${MODULE_ID} | Falha ao inicializar SceneRenderer:`, err);
        }
    }

    /**
     * Chamado quando o Foundry descarrega uma cena
     */
    _onCanvasTearDown() {
        if (this.currentSceneRenderer) {
            console.log(`${MODULE_ID} | Descarregando cena...`);
            this.currentSceneRenderer.destroy();
            this.currentSceneRenderer = null;
        }
        this.hud.remove();
    }

    /**
     * Atualiza a cena atual (delega ao SceneRenderer)
     */
    fullRefresh() {
        if (this.currentSceneRenderer) {
            this.currentSceneRenderer.fullRefresh();
        }
    }

    toggle(enabled) {
        if (enabled) {
            document.body.classList.add("paperbox-active");
            this.hud.render();
            this.renderEngine.activate();
            this.inputManager.activate();
            
            // Se já há cena, ativa seus builders
            if (this.currentSceneRenderer) {
                this.currentSceneRenderer.activate();
            } else if (canvas.ready) {
                // Se não há cena mas canvas está pronto, carrega
                this._onCanvasReady();
            }
        } else {
            document.body.classList.remove("paperbox-active");
            this.hud.remove();
            this.renderEngine.deactivate();
            this.inputManager.deactivate();
            
            if (this.currentSceneRenderer) {
                this.currentSceneRenderer.deactivate();
            }
        }
    }

    setState(updates) {
        this.state = { ...this.state, ...updates };

        // Atualizar HUD
        if (this.hud && typeof this.hud.updateVisuals === 'function') {
            this.hud.updateVisuals();
        }

        // Atualizar cena atual
        if (this.currentSceneRenderer) {
            this.currentSceneRenderer.updateTransform(this.state.tilt, this.state.rotation);
        }

        this.renderEngine.update();
        this._saveSettings();
    }

    /**
     * Acesso rápido aos builders (via SceneRenderer)
     */
    get orchestrator() { return this.currentSceneRenderer?.orchestrator; }
    get wallBuilder() { return this.currentSceneRenderer?.wallBuilder; }
    get doorBuilder() { return this.currentSceneRenderer?.doorBuilder; }
    get tokenBuilder() { return this.currentSceneRenderer?.tokenBuilder; }

    _saveSettings() {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
            game.settings.set(MODULE_ID, "savedTilt", Number(this.state.tilt));
            game.settings.set(MODULE_ID, "savedRotation", Number(this.state.rotation));
        }, 1000);

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
