import { MODULE_ID } from "../../../utils/constants.js";
import { getWall3DConfigHTML } from "../../../utils/dom.js";
import { calculateWallTransform, getWallLength, getWallSubSegment } from "../../../utils/math.js";

export class WallBuilder {
    /**
     * @param {any} paperbox
     * @param {"wall"|"door"} type - Define se é builder de parede ou porta
     */
    constructor(paperbox, container) {
        this.type = "wall"; // "wall" ou "door"
        this.paperbox = paperbox;
        this.sprites = new Map(); // Map<WallID or subId, PIXI.Sprite>
        this.container = container; // container global compartilhado
        this._refreshId = 0; // To track active refresh cycles
        
        // Guardar referências dos handlers para poder desregistrar depois
        this._hookIds = [];
    }

    init() {
        // Registrar hooks e guardar IDs
        this._hookIds.push(Hooks.on("renderWallConfig", this._onRenderWallConfig.bind(this)));
        this._hookIds.push(Hooks.on("createWall", this._onCreateWall.bind(this)));
        this._hookIds.push(Hooks.on("updateWall", this._onUpdateWall.bind(this)));
        this._hookIds.push(Hooks.on("deleteWall", this._onDeleteWall.bind(this)));
    }

    activate() {
        if (this.container) this.container.visible = true;
        this.refresh();
    }

    deactivate() {
        if (this.container) this.container.visible = false;
    }

    destroy() {
        // Desregistrar todos os hooks
        for (const id of this._hookIds) {
            Hooks.off("renderWallConfig", id);
            Hooks.off("createWall", id);
            Hooks.off("updateWall", id);
            Hooks.off("deleteWall", id);
        }
        this._hookIds = [];
        
        // Limpar sprites
        this._clearSprites();
    }

    async refresh() {
        this._refreshId++;
        this._clearSprites();
        if (!canvas.walls) return;

        const walls = canvas.walls.placeables.filter(w => 
            this.type === "wall" ? (w.document.door == 0) : (w.document.door > 0) && 
            w.document.getFlag(MODULE_ID, "is3D")
        );

        const promises = [];
        for (const wall of walls) {
            const tPoints = Array.from(this.paperbox.orchestrator.intersectionMap.get(wall.id) || [0, 1]).sort((a, b) => a - b);

            const coords = wall.document.c;
            const fullLength = getWallLength(coords);

            for (let k = 0; k < tPoints.length - 1; k++) {
                const subCoords = getWallSubSegment(coords, tPoints[k], tPoints[k+1]);
                const offset = tPoints[k] * fullLength;
                const subId = `${wall.id}-p${k}`;

                const promise = this.createWallSprite(wall, this._refreshId, subCoords, subId, offset).then(() => {
                    const s = this.sprites.get(subId);
                    if (s) s._segmentIndex = k;
                });
                promises.push(promise);
            }
        }
        await Promise.all(promises);
    }


    // Adicionado customCoords e customId para lidar com os pedaços
    async createWallSprite(wall, refreshId = null, customCoords = null, customId = null, offset = 0) {
        if (refreshId === null) refreshId = this._refreshId;
        const doc = wall.document;
        const spriteId = customId || doc.id;
        const texturePath = doc.getFlag(MODULE_ID, "texture");
        if (!texturePath) return;

        let texture;
        try {
            if (foundry?.canvas?.TextureLoader?.loader) {
                texture = await foundry.canvas.TextureLoader.loader.loadTexture(texturePath);
            } else if (typeof loadTexture === "function") {
                texture = await loadTexture(texturePath);
            }
        } catch (e) {}
        if (!texture || !texture.baseTexture) {
            texture = PIXI.Texture.from(texturePath);
        }
        if (!texture || refreshId !== this._refreshId) return;

        if (this.sprites.has(spriteId)) {
            this.sprites.get(spriteId).destroy();
        }

        const sprite = new PIXI.TilingSprite(texture, 1, texture.height);
        sprite._builder = this;
        sprite.anchor.set(0.5, 1);
        sprite.cullable = false;
        sprite._wallData = {
            c: customCoords || doc.c,
            height: doc.getFlag(MODULE_ID, "height") || 100,
            textureOffset: offset
        };

        this.sprites.set(spriteId, sprite);
        
        if (this.container) this.container.addChild(sprite);
        this.updateWallSprite(sprite);
        if (this.type === "door") {
            const ds = typeof doc.ds === "number" ? doc.ds : (doc.getFlag(MODULE_ID, "ds") ?? 0);
            this.animateDoor(doc, ds === 1);
        }
    }

    updateWallSprite(sprite, pivot = null) {
        const state = this.paperbox.state;
        // Usa pivot salvo no sprite, se não for passado
        const usePivot = pivot || sprite._doorPivot || null;
        this.updateTransform(sprite, state.tilt, state.rotation, usePivot);
    }

    async updateTransform(sprite, tilt, rotation) {
        if (!sprite._wallData || !sprite.texture?.valid) return null; // Importante retornar null se falhar
        sprite.visible = true;

        const { c: coords, height, textureOffset = 0 } = sprite._wallData;

        const transform = calculateWallTransform({
            coords,
            height,
            tilt,
            rotation,
            doorAngle: sprite._doorAngle,
            doorPivot: sprite._doorPivot,
            slide: sprite._doorSlide,
            lift: sprite._doorLift
        });

        sprite.width = transform.length;
        sprite.height = height;
        sprite.tilePosition.x = -textureOffset;

        const { a, b, c, d, tx, ty } = transform.matrixParams;
        sprite.transform.setFromMatrix(new PIXI.Matrix(a, b, c, d, tx, ty));

        // CORREÇÃO AQUI: Retorne as coordenadas vivas (pos-transformação)
        return transform.liveCoords; 
    }
    
    _getInitialCutPoints(wall) {
        return new Set([0, 1]);
    }

    _onCreateWall(doc) {
        if (doc.getFlag(MODULE_ID, "is3D")) this.createWallSprite(doc.object);
    }

    _onUpdateWall(doc) {
        // Remove all sprites related to this wall (main and subIds)
        const wallId = doc.id;
        const toRemove = [];
        for (const [id, sprite] of this.sprites.entries()) {
            if (id === wallId || id.startsWith(wallId + "-")) {
                sprite.destroy();
                toRemove.push(id);
            }
        }
        for (const id of toRemove) this.sprites.delete(id);
        if (doc.getFlag(MODULE_ID, "is3D")) {this.refresh();}
    }

    _onDeleteWall(doc) {
        const sprite = this.sprites.get(doc.id);
        if (sprite) {
            sprite.destroy();
            this.sprites.delete(doc.id);
        }
    }

    _onRenderWallConfig(app, html, data) {
        const doc = app.document || app.object?.document || app.object;
        if (!doc) return;

        // Only inject for the correct type: wall (door==0) or door (door>0)
        const isDoor = doc.door > 0;
        if ((this.type === "wall" && isDoor) || (this.type === "door" && !isDoor)) return;

        const getFlag = (key, field) => {
            try {
                if (typeof doc.getFlag === "function") return doc.getFlag(key, field);
                return doc.flags?.[key]?.[field];
            } catch (e) { return null; }
        };

        const is3D = getFlag(MODULE_ID, "is3D") || false;
        const texture = getFlag(MODULE_ID, "texture") || "";
        const height = getFlag(MODULE_ID, "height") || 100;
        // Label dinâmico
        const label = this.type === "door" ? "Enable 3D Door" : "Enable 3D Wall";
        const content = getWall3DConfigHTML({ label, is3D, texture, height, moduleId: MODULE_ID });

        let $html = html;
        if (!(html instanceof jQuery)) $html = $(html);

        const scrollable = $html.find(".standard-form.scrollable");
        if (scrollable.length) {scrollable.append(content);}
        
        $html.find(`button.file-picker[data-target="flags.${MODULE_ID}.texture"]`).on("click", (event) => {
            event.preventDefault();
            const target = event.currentTarget.dataset.target;
            const input = $html.find(`input[name="${target}"]`);
            const FilePickerClass = foundry.applications?.apps?.FilePicker || FilePicker;
            new FilePickerClass({
                type: "image",
                current: input.val(),
                callback: (path) => input.val(path)
            }).browse();
        });
        
        if (typeof app.setPosition === "function") app.setPosition({ height: "auto" });
    }

    _clearSprites() {
        for (const sprite of this.sprites.values()) sprite.destroy();
        if (this.container) {
            for (const sprite of this.sprites.values()) {
                this.container.removeChild(sprite);
            }
        }
        this.sprites.clear();
    }
}