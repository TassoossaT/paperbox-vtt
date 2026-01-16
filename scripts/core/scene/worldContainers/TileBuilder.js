import { MODULE_ID } from "../../../utils/constants.js";
import { Tile3D } from "./Tile3D.js";
import { getTile3DConfigHTML } from "../../../utils/dom.js";

export class TileBuilder {
    constructor(paperbox, container) {
        this.paperbox = paperbox;
        this.container = container;
        this.elements = new Map(); 
        this._editingTiles = new Set();

        
    }

    init() {
        // Hooks do Foundry (Molde da Wall)
        Hooks.on("createTile", (doc) => this._onUpdate(doc));
        Hooks.on("updateTile", (doc, changes) => this._onUpdate(doc, changes));
        Hooks.on("deleteTile", (doc) => this._onDelete(doc));
        Hooks.on("refreshTile", (tile) => this._onRefreshTile(tile));
        Hooks.on("renderTileConfig", (app, html) => this._onRenderConfig(app, html));
        Hooks.on("closeTileConfig", (app) => this._onCloseConfig(app));

        this.syncAll();
    }


    syncAll() {
        if (!canvas.tiles) return;

        // 1. Limpeza de órfãos (tiles que não estão mais no canvas)
        for (const id of this.elements.keys()) {
            if (!canvas.tiles.get(id)) {
                this._onDelete({ id });
            }
        }

        // 2. Sincronização dos tiles que possuem a flag is3D
        for (let tile of canvas.tiles.placeables) {
            if (tile.document.getFlag(MODULE_ID, "is3D")) {
                this._onUpdate(tile.document);
            }
        }
    }

    _factory(doc) {
        return new Tile3D(doc, this.paperbox, this.container);
    }

    _onUpdate(doc, changes = undefined) {
        if (this._editingTiles.has(doc.id)) return;

        const existing = this.elements.get(doc.id);
        if (existing) {
            existing.onUpdate(changes || {});
        } else if (doc.getFlag(MODULE_ID, "is3D")) {
            this.elements.set(doc.id, this._factory(doc));
        }
    }

    _onRefreshTile(tile) {
        const el = this.elements.get(tile.id);
        if (el) {
            el._hideOriginalTile(true);
        }
    }

    _onDelete(doc) {
        const el = this.elements.get(doc.id);
        if (el) {
            el.destroy();
            this.elements.delete(doc.id);
        }
    }

    clearAll() {
        for (let el of this.elements.values()) el.destroy();
        this.elements.clear();
    }

    // --- Métodos de UI (Config) ---

    _onRenderConfig(app, html) {
        const doc = app.document || app.object?.document;
        if (!doc) return;
        this._editingTiles.add(doc.id);
        
        const el = this.elements.get(doc.id);
        if (el) el._hideOriginalTile(false); 

        this._injectHTML(app, html, doc);
    }

    _onCloseConfig(app) {
        const doc = app.document || app.object?.document;
        if (!doc) return;
        this._editingTiles.delete(doc.id);
    }

    _injectHTML(app, html, doc) {
        const content = getTile3DConfigHTML({
            is3D: doc.getFlag(MODULE_ID, "is3D"),
            elevTL: doc.getFlag(MODULE_ID, "elevationTL") || 0,
            elevTR: doc.getFlag(MODULE_ID, "elevationTR") || 0,
            elevBL: doc.getFlag(MODULE_ID, "elevationBL") || 0,
            elevBR: doc.getFlag(MODULE_ID, "elevationBR") || 0,
            moduleId: MODULE_ID
        });
        const $html = $(html);
        $html.find(".tab[data-tab='position']").append(content);
        
        $html.find('[data-preset="flat"]').click((e) => {
            e.preventDefault();
            $html.find('input[name*="elevation"]').val(0);
        });
        
        $html.find('[data-preset="copy"]').click((e) => {
            e.preventDefault();
            const val = $html.find(`input[name*="elevationTL"]`).val();
            $html.find('input[name*="elevation"]').val(val);
        });
    }
}