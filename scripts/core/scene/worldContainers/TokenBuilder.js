import { calculateTransform } from "../../../utils/math.js";
import { MODULE_ID } from "../../../utils/constants.js";
import { getTokenConfigHTML } from "../../../utils/dom.js";

export class TokenBuilder {
    constructor(paperbox, container) {
        this.paperbox = paperbox;
        this.container = container; 
        this.tokens = new Map(); 
        this._refreshId = 0;
        
        // Guardar referências dos handlers para poder desregistrar depois
        this._hookIds = [];
    }

    init() {
        this._hookIds.push(Hooks.on("renderTokenConfig", this._onRenderTokenConfig.bind(this)));
        
        this._hookIds.push(Hooks.on("updateToken", (tokenDoc, changes, context) => {
            // Verifica mudanças estruturais
            const structuralChanges = ["flags", "texture", "width", "height"].some(k => k in changes);
            // Verifica flags específicas do módulo (nested flags requerem flatten ou verificação manual simples)
            const flagChanges = changes.flags?.[MODULE_ID];

            if (structuralChanges || flagChanges) {
                this.createToken(tokenDoc, this._refreshId); 
            }
            // Apenas movimento/rotação
            else if (["x", "y", "rotation", "elevation"].some(k => k in changes)) {
                this._updateTokenTransform(tokenDoc);
            }
        }));

        this._hookIds.push(Hooks.on("canvasReady", () => this.refresh()));
        this._hookIds.push(Hooks.on("createToken", (doc) => this.createToken(doc, this._refreshId)));
        this._hookIds.push(Hooks.on("deleteToken", (doc) => this._onDeleteToken(doc)));
    }

    activate() {
        if (this.container) this.container.visible = true;
        this.refresh();
    }

    deactivate() {
        if (this.container) this.container.visible = false;
        // Opcional: Restaurar visibilidade dos tokens nativos ao desativar
    }

    destroy() {
        // Desregistrar todos os hooks
        for (const id of this._hookIds) {
            Hooks.off("renderTokenConfig", id);
            Hooks.off("updateToken", id);
            Hooks.off("canvasReady", id);
            Hooks.off("createToken", id);
            Hooks.off("deleteToken", id);
        }
        this._hookIds = [];
        
        // Limpar tokens
        for (const [id, sprite] of this.tokens) {
            sprite.destroy();
        }
        this.tokens.clear();
    }

    async refresh() {
        this._refreshId++;
        // Não limpamos tudo brutalmente para evitar flicker global. 
        // Vamos atualizar um por um e limpar sobras depois se necessário, 
        // mas no seu caso, recriar a cena é mais seguro para garantir ordem.
        this._clearTokens();
        
        if (!canvas.tokens) return;

        const tokensToBuild = canvas.tokens.placeables.filter(t => {
            const type = t.document.getFlag(MODULE_ID, "tokenType") || "standard";
            return type !== "standard";
        });

        // Executa em paralelo
        await Promise.all(tokensToBuild.map(t => this.createToken(t.document, this._refreshId)));
    }

    async createToken(tokenDoc, refreshId = null) {
        if (refreshId === null) refreshId = this._refreshId;
        
        const type = tokenDoc.getFlag(MODULE_ID, "tokenType") || "standard";
        
        // --- Lógica STANDARD ---
        if (type === "standard") {
            this._restoreNativeToken(tokenDoc);
            this._removeCustomToken(tokenDoc.id);
            return;
        }

        // --- Lógica CUSTOM ---
        this._hideNativeToken(tokenDoc);

        let visual;
        try {
            // Carregamento ASSÍNCRONO acontece aqui
            if (type === "billboard") {
                visual = await this._createBillboardVisual(tokenDoc);
            }
            // Outros cases...
        } catch (err) {
            console.error(`[PaperBox] Erro ao criar token ${tokenDoc.name}:`, err);
            return;
        }

        // Check de Concorrência: Se o refresh mudou enquanto carregava, aborta
        if (this._refreshId !== refreshId) return;

        if (visual) {
            // [OTIMIZAÇÃO 1] Só destrói o antigo AGORA, que temos o novo pronto
            this._removeCustomToken(tokenDoc.id);

            const container = new PIXI.Container();
            container._tokenDoc = tokenDoc;
            container._builder = this; 
            container._visual = visual; 
            
            // Flags de configuração para uso no updateTransform
            container._config = {
                scale: tokenDoc.getFlag(MODULE_ID, "scale") || 1,
                elevation: tokenDoc.elevation || 0
            };

            container.addChild(visual);

            this.tokens.set(tokenDoc.id, container);
            this.container.addChild(container);

            // Força o primeiro posicionamento
            this._updateTokenTransform(tokenDoc);
        }
    }

    // --- Helpers de Visibilidade ---
    
    _hideNativeToken(tokenDoc) {
        if (tokenDoc.object?.mesh) tokenDoc.object.mesh.visible = false;
    }

    _restoreNativeToken(tokenDoc) {
        if (tokenDoc.object?.mesh) tokenDoc.object.mesh.visible = true;
    }

    _removeCustomToken(tokenId) {
        if (this.tokens.has(tokenId)) {
            const container = this.tokens.get(tokenId);
            container.destroy({ children: true }); // Limpa texturas/sprites
            this.tokens.delete(tokenId);
        }
    }

    // --- Transformação ---

    _updateTokenTransform(tokenDoc) {
        if (this.paperbox?.orchestrator) {
            this.paperbox.orchestrator.depthUpdate();
        }
    }

    // Chamado pelo Orchestrator a cada frame (ou quando necessário)
    async updateTransform(container, tilt, cameraRotation) {
        const doc = container._tokenDoc;
        const sprite = container._visual;
        
        // Fail-safe
        if (!doc || !sprite || !container.visible) return null;

        // [OTIMIZAÇÃO 2] Cache de configurações
        // Acessar flags é "lento". Usamos o cache salvo no container em createToken
        // Se o usuário mudar a escala, o hook updateToken recria o container, atualizando o cache.
        const userScale = container._config.scale; 

        // Cálculos de Grade
        const gridSize = canvas.grid.size;
        
        // Aplica a ESCALA do usuário aqui na dimensão base
        const widthPx = doc.width * gridSize * userScale;
        const heightPx = doc.height * gridSize * userScale;

        // Centro (precisa considerar o deslocamento se a escala mudou o tamanho visual, 
        // mas geralmente queremos o centro do quadrado lógico do grid)
        // Nota: Se você quer que o token gigante fique centralizado no quadrado dele:
        const cx = doc.x + (doc.width * gridSize) / 2; 
        const cy = doc.y + (doc.height * gridSize) / 2;

        // --- Cardboard Math ---
        const halfW = widthPx / 2;
        const tokenRotationRad = Math.toRadians(doc.rotation); // Rotação do Token (não Câmera)
        
        // Otimização: Pre-calculate sin/cos se possível, mas JS moderno lida bem com isso
        const cosT = Math.cos(tokenRotationRad);
        const sinT = Math.sin(tokenRotationRad);

        const dx = cosT * halfW;
        const dy = sinT * halfW;

        const p0x = cx - dx;
        const p0y = cy - dy;
        const p1x = cx + dx;
        const p1y = cy + dy;

        const transform = calculateTransform({
            coords: [p0x, p0y, p1x, p1y],
            height: heightPx,
            tilt: tilt,
            rotation: cameraRotation, // Rotação da Câmera
            lift: doc.elevation || 0,
            doorAngle: 0, doorPivot: null, slide: 0
        });

        // Aplicação
        // Anchor 0.5, 1.0 é crucial para ele ficar "em pé" no ponto (tx, ty)
        sprite.anchor.set(0.5, 1.0);
        
        // width/height aplicados antes da matriz
        sprite.width = transform.length; 
        sprite.height = heightPx;

        const { a, b, c, d, tx, ty } = transform.matrixParams;
        sprite.transform.setFromMatrix(new PIXI.Matrix(a, b, c, d, tx, ty)); 

        return transform.liveCoords;
    }

    async _createBillboardVisual(tokenDoc) {
        // loadTexture já lida com cache interno do Foundry/PIXI
        const texture = await foundry.canvas.loadTexture(tokenDoc.texture.src);
        const sprite = new PIXI.Sprite(texture);
        
        // Apenas configuração inicial, o resto é no updateTransform
        return sprite;
    }
    
    // ... (Métodos de UI e Cleanup mantidos iguais) ...
    
    _clearTokens() {
        for (const [id, container] of this.tokens) {
            container.destroy({ children: true });
        }
        this.tokens.clear();
        if (this.container) this.container.removeChildren();
    }
    
    _onDeleteToken(tokenDoc) {
        this._removeCustomToken(tokenDoc.id);
    }

    _onRenderTokenConfig(app, html) {
        const $html = $(html);
        const appearanceTab = $html.find('div[data-tab="appearance"]');
        if (!appearanceTab.length) return;

        const flags = app.token.flags[MODULE_ID] || {};
        
        const injectHTML = getTokenConfigHTML({
            tokenType: flags.tokenType || "standard",
            scale: flags.scale || 1,
            configPath: flags.configPath || "",
            hasShadow: flags.hasShadow !== false,
            visualHeight: flags.visualHeight || 0,
            moduleId: MODULE_ID
        });
        
        appearanceTab.append(injectHTML);

        const typeSelect = $html.find(`select[name="flags.${MODULE_ID}.tokenType"]`);
        const pathField = $html.find("#paperbox-config-path");
        const scaleField = $html.find("#paperbox-scale-field");

        function updateFields() {
            const val = typeSelect.val();
            
            if (val === 'billboard') {
                if (scaleField.length) scaleField.removeClass("hidden");
            } else {
                if (scaleField.length) scaleField.addClass("hidden");
            }

            if (val === 'spine' || val === 'spritesheet') {
                if (pathField.length) pathField.removeClass("hidden");
            } else {
                if (pathField.length) pathField.addClass("hidden");
            }
            
            app.setPosition({ height: "auto" });
        }

        typeSelect.on("change", () => updateFields());
        updateFields();
    }

    _clearTokens() {
        for (const container of this.tokens.values()) {
            container.destroy({ children: true });
        }
        this.tokens.clear();
        if (this.container) this.container.removeChildren();
    }

    _onDeleteToken(tokenDoc) {
        if (this.tokens.has(tokenDoc.id)) {
            const container = this.tokens.get(tokenDoc.id);
            container.destroy();
            this.tokens.delete(tokenDoc.id);
        }
    }
}