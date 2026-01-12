import { MODULE_ID } from "../../../utils/constants.js";
import { getTile3DConfigHTML } from "../../../utils/dom.js";

/**
 * TileBuilder - Gerenciador de Tiles 3D
 * Transforma a textura E o perímetro físico de interação do Tile.
 */
export class TileBuilder {
    constructor(paperbox, container) {
        this.paperbox = paperbox;
        this.container = container;
        this.sprites = new Map(); 
        this._editingTiles = new Set();
        this._refreshId = 0;
        this.debouncedRefresh = foundry.utils.debounce(this.refresh.bind(this), 50);
        this._hooks = [];
    }

    init() {
        const register = (hook, fn) => {
            const id = Hooks.on(hook, fn);
            this._hooks.push({ hook, id });
        };

        // Configuração de hooks
        register("renderTileConfig", this._onRenderTileConfig.bind(this));
        register("closeTileConfig", this._onCloseTileConfig.bind(this));
        
        // Trigger de refresh
        register("createTile", () => this.debouncedRefresh());
        register("canvasReady", () => this.refresh());
        
        register("updateTile", (doc, changes) => {
            const RELEVANT_KEYS = ["x", "y", "width", "height", "rotation", "texture", "flags", "hidden", "alpha"];
            const isRelevant = RELEVANT_KEYS.some(k => 
                k in changes || (changes.flags && MODULE_ID in changes.flags)
            );
            if (isRelevant) this.debouncedRefresh();
        });
        
        register("deleteTile", (doc) => this._removeSprite(doc.id));
        
        // Tile refresh e preview
        register("refreshTile", (tile) => this._onRefreshTile(tile));
        
        // Drag tracking para 3D tiles
        register("preUpdateTile", (doc, changes, options, userId) => {
            if (("x" in changes || "y" in changes) && doc.getFlag(MODULE_ID, "is3D")) {
                options._pb3DDragging = true;
            }
        });
    }

    _onRefreshTile(tile) {
        if (!tile.document.getFlag(MODULE_ID, "is3D")) return;
        
        this._hideOriginalTile(tile.document, true);
        
        const sprite = this.sprites.get(tile.id);
        if (sprite) {
            this.updateTileVisuals(sprite, tile);
        }
        
        if (tile._preview) this._applyPreviewProjection(tile);
        
        // CRÍTICO: O Foundry chama tile.refresh() em várias situações:
        // - Ao selecionar o tile
        // - Ao mover o tile (drag)
        // - Ao redimensionar
        // - Ao rotacionar
        // Isso reseta o frame para o estado padrão (sem transformações)
        // Precisamos SEMPRE reaplicar nossa transformação 3D
        if (sprite && sprite._lastProjectedPoints && tile.frame) {
            // Pequeno delay para garantir que o Foundry terminou de recriar o frame
            requestAnimationFrame(() => {
                // Verifica novamente se frame ainda existe e se tile não foi destruído
                if (!tile || !tile.frame || tile._destroyed) return;
                
                try {
                    // Tenta acessar position para verificar se o frame está válido
                    const pos = tile.frame.position;
                    if (pos) {
                        this._applyInteractionShape(tile, sprite._lastProjectedPoints);
                    }
                } catch (e) {
                    // Frame foi destruído durante o acesso, ignora silenciosamente
                }
            });
        }
    }

    activate() {
        this.refresh();
    }

    deactivate() {
        this._clearSprites();
        if (canvas.tiles) {
            canvas.tiles.placeables.forEach(t => this._restoreOriginalShape(t));
        }
    }

    destroy() {
        this.deactivate();
        for (const h of this._hooks) {
            Hooks.off(h.hook, h.id);
        }
        this._hooks = [];
    }

    async refresh() {
        this._refreshId++;
        const currentId = this._refreshId;

        if (!canvas.tiles) return;

        const tiles3D = canvas.tiles.placeables.filter(t => t.document.getFlag(MODULE_ID, "is3D"));
        
        // 1. Limpeza
        for (const [id, sprite] of this.sprites) {
            if (!tiles3D.find(t => t.id === id)) {
                this._removeSprite(id);
                const tile = canvas.tiles.get(id);
                if (tile && !this._editingTiles.has(id)) {
                    this._restoreOriginalShape(tile);
                }
            }
        }

        // 2. Processamento
        const promises = tiles3D.map(tile => this.createOrUpdateTile(tile, currentId));
        await Promise.all(promises);
    }

    async createOrUpdateTile(tile, refreshId) {
        if (refreshId !== this._refreshId) return;
        const doc = tile.document;

        if (this._editingTiles.has(doc.id)) {
            const existingSprite = this.sprites.get(doc.id);
            if (existingSprite) existingSprite.visible = false;
            this._restoreOriginalShape(tile); 
            return; 
        }

        const texturePath = doc.texture.src;
        if (!texturePath) return;

        this._hideOriginalTile(doc, true);

        let sprite = this.sprites.get(doc.id);

        if (!sprite || sprite._texturePath !== texturePath) {
            if (sprite) sprite.destroy();

            let texture;
            try { texture = await foundry.canvas.loadTexture(texturePath); } catch (e) { return; }
            if (!texture || refreshId !== this._refreshId) return;

            sprite = new PIXI.SimplePlane(texture, 2, 2);
            sprite._texturePath = texturePath;
            sprite._builder = this;
            sprite._tileDoc = doc;
            
            this.container.addChild(sprite);
            this.sprites.set(doc.id, sprite);
        }

        // Adiciona referência ao builder no tile para debug via console
        if (tile && !tile._pb3DBuilder) {
            tile._pb3DBuilder = this;
        }

        this.updateTileVisuals(sprite, tile);
    }

    updateTileVisuals(sprite, tile) {
        const doc = sprite._tileDoc;
        if (!tile) tile = canvas.tiles.get(doc.id);
        if (!tile) return;

        sprite._pbConfig = {
            x: doc.x, y: doc.y,
            width: doc.width, height: doc.height,
            rotation: doc.rotation,
            elevations: this._getElevations(doc)
        };

        const isHidden = doc.hidden;
        sprite.visible = !isHidden || game.user.isGM;
        sprite.alpha = isHidden ? 0.5 : (doc.alpha ?? 1);

        this.updateTransform(sprite, this.paperbox.state.tilt, this.paperbox.state.rotation);
    }

    _getElevations(doc) {
        return {
            tl: doc.getFlag(MODULE_ID, "elevationTL") || 0,
            tr: doc.getFlag(MODULE_ID, "elevationTR") || 0,
            bl: doc.getFlag(MODULE_ID, "elevationBL") || 0,
            br: doc.getFlag(MODULE_ID, "elevationBR") || 0
        };
    }

    calculateProjection(sprite, tilt, cameraRotation) {
        if (!sprite._pbConfig || !sprite.visible) return null;
        const cfg = sprite._pbConfig;
        
        const cx = cfg.x + cfg.width / 2;
        const cy = cfg.y + cfg.height / 2;
        const tileRad = Math.toRadians(cfg.rotation);
        const cosT = Math.cos(tileRad);
        const sinT = Math.sin(tileRad);
        const hw = cfg.width / 2;
        const hh = cfg.height / 2;

        const getCornerWorld = (ox, oy) => ({
            x: cx + (ox * cosT - oy * sinT),
            y: cy + (ox * sinT + oy * cosT)
        });

        const corners = {
            tl: getCornerWorld(-hw, -hh),
            tr: getCornerWorld(hw, -hh),
            bl: getCornerWorld(-hw, hh),
            br: getCornerWorld(hw, hh)
        };

        const { offsetX, offsetY } = this._calculateCameraOffset(tilt, cameraRotation);
        const elevationOffsets = this._calculateElevationOffsets(cfg.elevations, offsetX, offsetY);

        return {
            tl: { x: corners.tl.x + elevationOffsets.tl.x, y: corners.tl.y + elevationOffsets.tl.y },
            tr: { x: corners.tr.x + elevationOffsets.tr.x, y: corners.tr.y + elevationOffsets.tr.y },
            bl: { x: corners.bl.x + elevationOffsets.bl.x, y: corners.bl.y + elevationOffsets.bl.y },
            br: { x: corners.br.x + elevationOffsets.br.x, y: corners.br.y + elevationOffsets.br.y }
        };
    }

    _calculateCameraOffset(tilt, cameraRotation) {
        const rad = Math.PI / 180;
        const upAngle = (-90 - cameraRotation) * rad;
        const factor = 1 / Math.max(0.01, Math.cos(Math.max(tilt, 0) * rad));
        
        return {
            offsetX: factor,
            offsetY: upAngle
        };
    }

    _calculateElevationOffsets(elevations, offsetX, offsetY) {
        const calculateOffset = (elev) => {
            if (elev === 0) return { x: 0, y: 0 };
            const len = elev * offsetX;
            return { 
                x: len * Math.cos(offsetY), 
                y: len * Math.sin(offsetY) 
            };
        };

        return {
            tl: calculateOffset(elevations.tl),
            tr: calculateOffset(elevations.tr),
            bl: calculateOffset(elevations.bl),
            br: calculateOffset(elevations.br)
        };
    }

    applyToSimplePlane(sprite, points) {
        const buffer = sprite.geometry.getBuffer('aVertexPosition').data;
        buffer[0] = points.tl.x; buffer[1] = points.tl.y;
        buffer[2] = points.tr.x; buffer[3] = points.tr.y;
        buffer[4] = points.bl.x; buffer[5] = points.bl.y;
        buffer[6] = points.br.x; buffer[7] = points.br.y;
        sprite.geometry.getBuffer('aVertexPosition').update();
    }

    updateTransform(sprite, tilt, cameraRotation) {
        const points = this.calculateProjection(sprite, tilt, cameraRotation);
        
        if (!points) return null;
        
        this.applyToSimplePlane(sprite, points);
        
        sprite._lastProjectedPoints = points;
        
        const doc = sprite._tileDoc;
        if (doc && doc.object) {
            this._applyInteractionShape(doc.object, points);
        }
        
        return [points.bl.x, points.bl.y, points.br.x, points.br.y];
    }

    _applyInteractionShape(tile, worldPoints) {
        const sprite = this.sprites.get(tile.id);
        
        // Durante drag/movimento, worldPoints são baseados em sprite._pbConfig (posição antiga)
        // MAS queremos que o frame acompanhe a posição ATUAL do tile
        // SOLUÇÃO: Recalcular worldPoints com base na posição atual
        
        if (sprite && sprite._pbConfig) {
            const deltaX = tile.document.x - sprite._pbConfig.x;
            const deltaY = tile.document.y - sprite._pbConfig.y;
            
            // Se o tile foi movido, ajusta os worldPoints
            if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
                worldPoints = {
                    tl: { x: worldPoints.tl.x + deltaX, y: worldPoints.tl.y + deltaY },
                    tr: { x: worldPoints.tr.x + deltaX, y: worldPoints.tr.y + deltaY },
                    bl: { x: worldPoints.bl.x + deltaX, y: worldPoints.bl.y + deltaY },
                    br: { x: worldPoints.br.x + deltaX, y: worldPoints.br.y + deltaY }
                };
            }
        }
        
        const originX = tile.document.x;
        const originY = tile.document.y;
        
        const toLocal = (p) => ({ x: p.x - originX, y: p.y - originY });

        const localPts = [
            toLocal(worldPoints.tl),
            toLocal(worldPoints.tr),
            toLocal(worldPoints.br),
            toLocal(worldPoints.bl)
        ];
        tile.hitArea = new PIXI.Polygon([
            localPts[0].x, localPts[0].y,
            localPts[1].x, localPts[1].y,
            localPts[2].x, localPts[2].y,
            localPts[3].x, localPts[3].y
        ]);
        
        // Aplica transformação de perspectiva no frame (se existir)
        if (tile.frame) {
            // Calcula dimensões originais do tile
            const originalWidth = tile.document.width;
            const originalHeight = tile.document.height;

            // Usa TL como origem
            const origin = localPts[0];

            // Calcula vetores das bordas TOP e LEFT a partir do TL
            const topEdge = {
                x: localPts[1].x - localPts[0].x,
                y: localPts[1].y - localPts[0].y
            };
            const leftEdge = {
                x: localPts[3].x - localPts[0].x,
                y: localPts[3].y - localPts[0].y
            };

            // Calcula a escala de cada eixo
            const scaleX = Math.sqrt(topEdge.x * topEdge.x + topEdge.y * topEdge.y) / originalWidth;
            const scaleY = Math.sqrt(leftEdge.x * leftEdge.x + leftEdge.y * leftEdge.y) / originalHeight;

            // Calcula a rotação principal (baseada na borda superior)
            const rotation = Math.atan2(topEdge.y, topEdge.x);

            // Calcula o ângulo da borda esquerda
            const leftAngle = Math.atan2(leftEdge.y, leftEdge.x);
            
            // Skew é a diferença entre o ângulo esperado (90° da top edge) e o ângulo real
            // Isso captura a distorção de perspectiva causada pela elevação
            const expectedLeftAngle = rotation + Math.PI / 2;
            const skewX = -(leftAngle - expectedLeftAngle); // Invertido

            // Também calcula skewY baseado nas bordas opostas para capturar perspectiva vertical
            const bottomEdge = {
                x: localPts[2].x - localPts[3].x,
                y: localPts[2].y - localPts[3].y
            };
            const rightEdge = {
                x: localPts[2].x - localPts[1].x,
                y: localPts[2].y - localPts[1].y
            };
            
            const bottomAngle = Math.atan2(bottomEdge.y, bottomEdge.x);
            const skewY = -(bottomAngle - rotation) * 0.5; // Invertido

            // Aplica transformação no frame
            if (tile.frame && tile.frame.position && tile.frame.scale && tile.frame.skew) {
                tile.frame.position.set(origin.x, origin.y);
                tile.frame.scale.set(scaleX, scaleY);
                tile.frame.rotation = rotation;
                tile.frame.skew.set(skewX, skewY);
            }
        }
    }


    _hideOriginalTile(doc, hide) {
        const tile = doc.object;
        if (tile?.mesh) tile.mesh.visible = !hide;
    }

    _removeSprite(id) {
        if (this.sprites.has(id)) {
            this.sprites.get(id).destroy();
            this.sprites.delete(id);
        }
    }

    _clearSprites() {
        for (const sprite of this.sprites.values()) sprite.destroy();
        this.sprites.clear();
    }

    _restoreOriginalShape(tile) {
        if (!tile || !tile.document) return;
        
        const doc = tile.document;
        const w = doc.width;
        const h = doc.height;
        
        // Restaura hitArea para o retângulo original 2D
        tile.hitArea = new PIXI.Rectangle(0, 0, w, h);
        
        // Remove transformações do frame se existir
        if (tile.frame) {
            tile.frame.position.set(0, 0);
            tile.frame.scale.set(1, 1);
            tile.frame.rotation = 0;
            tile.frame.skew.set(0, 0);
        }
    }

    // --- HUD MONITORING ---

    _applyPreviewProjection(tile) {
        const doc = tile.document;
        const sprite = this.sprites.get(doc.id);
        
        if (!sprite || !sprite._lastProjectedPoints) return;
        
        // Durante drag, esconde o mesh preview 2D e usa nossa forma 3D
        if (tile._preview && tile._preview.mesh) {
            tile._preview.mesh.visible = false;
        }
        
        // Aplica a forma 3D ao tile original (que está sendo arrastado)
        this._applyInteractionShape(tile, sprite._lastProjectedPoints);
    }

    // --- UI CONFIG ---

    _onRenderTileConfig(app, html, data) {
        const doc = app.document || app.object?.document;
        if (!doc) return;

        this._editingTiles.add(doc.id);
        
        const tile = canvas.tiles.get(doc.id);
        if (tile) this._restoreOriginalShape(tile);

        const sprite = this.sprites.get(doc.id);
        if (sprite) sprite.visible = false;

        this._injectHTML(app, html, doc);
    }

    _onCloseTileConfig(app) {
        const doc = app.document || app.object?.document;
        if (!doc) return;

        this._editingTiles.delete(doc.id);
        this.debouncedRefresh();
    }

    _injectHTML(app, html, doc) {
        const config = this._getTile3DConfig(doc);
        const content = getTile3DConfigHTML({
            ...config,
            moduleId: MODULE_ID
        });

        let $html = html instanceof jQuery ? html : $(html);
        const positionTab = $html.find(".tab[data-tab='position']");
        if (positionTab.length) positionTab.append(content);
        else $html.find(".standard-form").append(content);

        this._attachPresetListeners($html);
        if (typeof app.setPosition === "function") app.setPosition({ height: "auto" });
    }

    _getTile3DConfig(doc) {
        const elevations = this._getElevations(doc);
        return {
            is3D: doc.getFlag(MODULE_ID, "is3D") || false,
            elevTL: elevations.tl,
            elevTR: elevations.tr,
            elevBL: elevations.bl,
            elevBR: elevations.br
        };
    }

    _attachPresetListeners($html) {
        $html.find(`button[data-preset="flat"]`).on("click", (e) => {
            e.preventDefault();
            $html.find(`input[name^="flags.${MODULE_ID}.elevation"]`).val(0);
        });
        $html.find(`button[data-preset="copy"]`).on("click", (e) => {
            e.preventDefault();
            const val = $html.find(`input[name="flags.${MODULE_ID}.elevationTL"]`).val();
            $html.find(`input[name^="flags.${MODULE_ID}.elevation"]`).val(val);
        });
    }
}