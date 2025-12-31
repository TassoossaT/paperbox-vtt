import { MODULE_ID } from "../../utils/constants.js";
import { getTokenConfigHTML } from "../../utils/dom.js";

export class TokenBuilder {
    constructor(paperbox, container) {
        this.paperbox = paperbox;
        this.container = container; 
        this.tokens = new Map(); 
    }

    init() {
        Hooks.on("renderTokenConfig", this._onRenderTokenConfig.bind(this));
        Hooks.on("updateToken", (tokenDoc, changes, context) => {
            if (changes.flags?.[MODULE_ID] || changes.texture) {
                this.createToken(tokenDoc); 
            }
        });
    }

    async createToken(tokenDoc) {
        if (this.tokens.has(tokenDoc.id)) {
            this.tokens.get(tokenDoc.id).destroy();
            this.tokens.delete(tokenDoc.id);
        }
        
        const type = tokenDoc.getFlag(MODULE_ID, "tokenType") || "default";
        if (type === "default") {
            const tokenObject = tokenDoc.object; 
            if (tokenObject && tokenObject.mesh) tokenObject.mesh.visible = true;
            return;
        }
        if (tokenDoc.object?.mesh) tokenDoc.object.mesh.visible = false;

        const container = new PIXI.Container();
        container.pivot.set(0.5, 1); // Pivô no pé

        let visual;
        
        switch (type) {
            case "billboard":
                visual = await this._createBillboardVisual(tokenDoc);
                break;
            case "spine":
                visual = await this._createSpineVisual(tokenDoc);
                break;
            case "spritesheet":
                visual = await this._createAnimatedVisual(tokenDoc);
                break;
        }

        if (visual) {
            // Adiciona sombra projetada (exceto se voar muito alto, lógica futura)
            const shadow = this._createShadow(tokenDoc); 
            container.addChild(shadow);
            container.addChild(visual);
            
            // Link reverso para facilitar updateTransform
            container._tokenDoc = tokenDoc; 

            this.tokens.set(tokenDoc.id, container);
            this.container.addChild(container);
        }
    }
    
    _onRenderTokenConfig(app, html) {
        const $html = $(html); // Simplificado
        const appearanceTab = $html.find('div[data-tab="appearance"]');
        
        if (!appearanceTab.length) return;

        // Busca flags de forma direta
        const flags = app.document.getFlag(MODULE_ID, "paperbox") || {};
        
        // Injeta o HTML
        const injectHTML = getTokenConfigHTML({ 
            ...flags, // Passa todas as flags de uma vez
            moduleId: MODULE_ID 
        });
        appearanceTab.append(injectHTML);

        // Lógica de UI
        const typeSelect = $html.find(`select[name="flags.${MODULE_ID}.tokenType"]`);
        const pathField = $html.find("#paperbox-config-path");

        const updateVisibility = (val) => {
            pathField.toggleClass("hidden", val === "standard");
            app.setPosition({ height: "auto" });
        };

        typeSelect.on("change", ev => updateVisibility(ev.target.value));
        
        updateVisibility(typeSelect.val());
    }

    async _createBillboardVisual(tokenDoc) {
        const texturePath = tokenDoc.texture.src;
        const texture = await loadTexture(texturePath); // Helper do Foundry
        
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5, 1); // Pé no chão

        const aspect = texture.height / texture.width;
        const worldBaseWidth = canvas.grid.size * tokenDoc.width;
        const scale = tokenDoc.texture.scaleX; 

        sprite.width = worldBaseWidth * scale;
        sprite.height = (worldBaseWidth * aspect) * scale;

        return sprite;
    }
}