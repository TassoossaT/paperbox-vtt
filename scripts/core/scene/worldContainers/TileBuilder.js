import { MODULE_ID } from "../../../utils/constants.js";

export class TileBuilder {
    constructor(paperbox) {
        this.paperbox = paperbox;
        
        // Guardar referências dos handlers para poder desregistrar depois
        this._hookIds = [];
    }

    init() {
        this._hookIds.push(Hooks.on("renderTileConfig", this._onRenderTileConfig.bind(this)));
        this._hookIds.push(Hooks.on("refreshTile", this._onRefreshTile.bind(this)));
    }

    destroy() {
        // Desregistrar todos os hooks
        for (const id of this._hookIds) {
            Hooks.off("renderTileConfig", id);
            Hooks.off("refreshTile", id);
        }
        this._hookIds = [];
    }

    _onRefreshTile(tile) {
        if (tile.document.getFlag(MODULE_ID, "is3D")) {
            this.updateTileTransform(tile);
        }
    }

    updateTileTransform(tile) {
        const state = this.paperbox.state;
        const doc = tile.document;
        
        // Get 3D properties
        const elevation = doc.getFlag(MODULE_ID, "elevation") || 0;
        // const thickness = doc.getFlag(MODULE_ID, "thickness") || 0; // Future: Add thickness/sides to tiles

        // Calculate Projection
        // We need to project the Tile's center and scale based on the tilt
        
        // 1. Get original 2D center
        const center = tile.center; // {x, y}
        
        // 2. Calculate Elevation Offset (Same logic as WallBuilder)
        const rad = Math.PI / 180;
        const upAngle = (-90 - state.rotation) * rad;
        const safeTilt = Math.max(state.tilt, 0);
        const factor = 1 / Math.max(0.01, Math.cos(safeTilt * rad));
        
        const elevLen = elevation * factor;
        const elevX = elevLen * Math.cos(upAngle);
        const elevY = elevLen * Math.sin(upAngle);

        // Store offset for bounds calculation
        tile._pbOffset = { x: elevX, y: elevY };

        // 3. Apply to Tile Mesh/Sprite
        // Reset position to original + offset
        tile.position.set(doc.x + elevX, doc.y + elevY);
        
        // Apply Z-Index sorting
        tile.zIndex = doc.y + doc.height + (elevation * 10);
        if (tile.mesh) {
            tile.mesh.zIndex = tile.zIndex; // V11+ uses mesh
        }

        // 4. Patch Bounds for Selection (Quadtree)
        // We need to override the bounds getter on this instance so Foundry knows where it is
        if (!tile.hasOwnProperty("_pbPatchedBounds")) {
            Object.defineProperty(tile, "bounds", {
                get: function() {
                    const { x, y, width, height } = this.document;
                    const offX = this._pbOffset?.x || 0;
                    const offY = this._pbOffset?.y || 0;
                    return new PIXI.Rectangle(x + offX, y + offY, width, height);
                },
                configurable: true
            });
            tile._pbPatchedBounds = true;
        }

        // Force Quadtree update to recognize new position
        if (canvas.tiles?.quadtree) {
            canvas.tiles.quadtree.update(tile);
        }
    }

    updateAllTiles() {
        if (!canvas.tiles) return;
        for (const tile of canvas.tiles.placeables) {
            if (tile.document.getFlag(MODULE_ID, "is3D")) {
                this.updateTileTransform(tile);
            }
        }
    }

    _onRenderTileConfig(app, html, data) {
        const doc = app.document;
        const is3D = doc.getFlag(MODULE_ID, "is3D") || false;
        const elevation = doc.getFlag(MODULE_ID, "elevation") || 0;

        const content = `
            <fieldset>
                <legend>PaperBox 3D</legend>
                <div class="form-group">
                    <label>Enable 3D Layer</label>
                    <input type="checkbox" name="flags.${MODULE_ID}.is3D" ${is3D ? "checked" : ""}>
                </div>
                <div class="form-group">
                    <label>Elevation (px)</label>
                    <input type="number" name="flags.${MODULE_ID}.elevation" value="${elevation}">
                    <p class="notes">Height from the ground. Use to stack floors.</p>
                </div>
            </fieldset>
        `;

        let $html = html;
        if (!(html instanceof jQuery)) $html = $(html);
        
        // 1. Try to inject into the "Basic" tab if it exists (common in Tile Config)
        const basicTab = $html.find(".tab[data-tab='basic']");
        
        if (basicTab.length) {
            basicTab.append(content);
        } else {
            // 2. Fallback: Try to find the scrollable body (V12/V13 standard)
            const scrollable = $html.find(".standard-form.scrollable, [data-application-part='body']");
            
            if (scrollable.length) {
                scrollable.append(content);
            } else {
                // 3. Last Resort: Inject before the footer or at end of form
                const target = $html.find("button[type='submit']").closest(".form-group, footer");
                if (target.length) {
                    target.before(content);
                } else {
                    $html.find("form").append(content);
                }
            }
        }
        
        if (typeof app.setPosition === "function") app.setPosition({ height: "auto" });
    }
}
