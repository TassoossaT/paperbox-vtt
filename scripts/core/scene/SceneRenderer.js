import { World3DOrchestrator } from "./world3DContainer.js";
import { WallBuilder } from "./worldContainers/WallBuilder.js";
import { DoorBuilder } from "./worldContainers/DoorBuilder.js";
import { TokenBuilder } from "./worldContainers/TokenBuilder.js";
import { MODULE_ID } from "../../utils/constants.js";

/**
 * SceneRenderer - Gerenciador Completo de Uma Cena
 * 
 * Responsabilidades:
 * - Criar e gerenciar builders específicos desta cena
 * - Manter o state visual da cena (via orchestrator)
 * - Sincronizar com eventos do Foundry relativos a esta cena
 * - Limpar recursos ao sair da cena
 */
export class SceneRenderer {
    constructor(paperbox, sceneId) {
        this.paperbox = paperbox;           // Referência ao orquestrador principal
        this.sceneId = sceneId;             // ID da cena (canvas.scene.id)
        this.isActive = false;              // Está renderizando agora?

        // --- ORQUESTRADOR E BUILDERS (específicos desta cena) ---
        this.orchestrator = new World3DOrchestrator(this.paperbox);
        this.wallBuilder = new WallBuilder(this.paperbox, this.orchestrator.container);
        this.doorBuilder = new DoorBuilder(this.paperbox, this.orchestrator.container);
        this.tokenBuilder = new TokenBuilder(this.paperbox, this.orchestrator.container);
    }

    /**
     * Inicializar dados da cena (carregar paredes, portas, tokens do Foundry)
     * Esta função é ASYNC porque carrega texturas
     */
    async init() {
        console.log(`${MODULE_ID} | Inicializando SceneRenderer para: ${this.sceneId}`);
        
        try {
            // Inicializar builders (carrega dados do Foundry)
            this.wallBuilder.init();
            this.doorBuilder.init();
            this.tokenBuilder.init();
            
            // Carregar texturas e montar sprites (async)
            await this.fullRefresh();
        } catch (err) {
            console.error(`${MODULE_ID} | Erro ao inicializar SceneRenderer:`, err);
            throw err;
        }
    }

    /**
     * Ativar renderização desta cena
     * Torna builders visíveis e registra listeners
     */
    activate() {
        if (this.isActive) return;
        this.isActive = true;
        
        console.log(`${MODULE_ID} | Ativando SceneRenderer para: ${this.sceneId}`);
        
        // Mostrar container PIXI
        this.orchestrator.container.visible = true;
        
        // Ativar listeners dos builders
        this.wallBuilder.activate();
        this.doorBuilder.activate();
        this.tokenBuilder.activate();
        
        // Registrar hooks específicos desta cena (se necessário)
        this._registerHooks();
    }

    /**
     * Desativar renderização desta cena
     * Desativa builders e remove listeners
     */
    deactivate() {
        if (!this.isActive) return;
        this.isActive = false;
        
        console.log(`${MODULE_ID} | Desativando SceneRenderer para: ${this.sceneId}`);
        
        // Esconder container PIXI
        this.orchestrator.container.visible = false;
        
        // Desativar listeners dos builders
        this.wallBuilder.deactivate();
        this.doorBuilder.deactivate();
        this.tokenBuilder.deactivate();
        
        // Desregistrar hooks
        this._unregisterHooks();
    }

    /**
     * Destruir completamente esta cena
     * Limpar sprites, containers e referências
     * Libera memória RAM e GPU
     */
    destroy() {
        this.deactivate();
        
        console.log(`${MODULE_ID} | Destruindo SceneRenderer para: ${this.sceneId}`);

        try {
            // Limpar builders
            if (this.wallBuilder) {
                this.wallBuilder.destroy?.();
                this.wallBuilder = null;
            }
            if (this.doorBuilder) {
                this.doorBuilder.destroy?.();
                this.doorBuilder = null;
            }
            if (this.tokenBuilder) {
                this.tokenBuilder.destroy?.();
                this.tokenBuilder = null;
            }

            // Destruir container PIXI
            if (this.orchestrator?.container) {
                this.orchestrator.container.destroy({ children: true, texture: false });
                this.orchestrator = null;
            }
        } catch (err) {
            console.error(`${MODULE_ID} | Erro ao destruir SceneRenderer:`, err);
        }
    }

    /**
     * Recarregar completo: detectar intersecções e recalcular tudo
     */
    async fullRefresh() {
        if (!this.orchestrator) return;
        
        console.log(`${MODULE_ID} | Refrescando SceneRenderer completo para: ${this.sceneId}`);
        
        try {
            // 1. Detectar intersecções entre paredes
            this.orchestrator.globalIntersections();
            
            // 2. Recarregar dados e texturas (em paralelo)
            await Promise.all([
                this.wallBuilder.refresh(),
                this.doorBuilder.refresh(),
                this.tokenBuilder.refresh()
            ]);
            
            // 3. Recalcular profundidade
            await this.orchestrator.depthUpdate();
        } catch (err) {
            console.error(`${MODULE_ID} | Erro no fullRefresh:`, err);
        }
    }

    /**
     * Atualizar transformação (tilt/rotation mudou)
     * Recalcula profundidade sem recarregar texturas
     */
    updateTransform(tilt, rotation) {
        if (!this.orchestrator) return;
        
        // Apenas recalcular profundidade (builders já têm dados)
        this.orchestrator.depthUpdate();
    }

    /**
     * Registrar hooks específicos desta cena
     * (detectar mudanças em paredes, portas, tokens)
     */
    _registerHooks() {
        // TODO: Registrar listeners de mudança de paredes/tokens
        // this._wallUpdateHandler = this._onWallUpdate.bind(this);
        // Hooks.on("updateWall", this._wallUpdateHandler);
    }

    /**
     * Desregistrar hooks específicos desta cena
     */
    _unregisterHooks() {
        // TODO: Remover listeners
        // Hooks.off("updateWall", this._wallUpdateHandler);
    }
}