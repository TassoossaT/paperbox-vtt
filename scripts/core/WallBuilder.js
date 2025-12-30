import { MODULE_ID } from "../utils/constants.js";
import { findIntersectionT, getProjectionVector, getSegmentProjection, compareSegments, getWallGeometry, getWallLength, getWallSubSegment } from "../utils/math.js";

export class WallBuilder {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.sprites = new Map(); // Map<WallID or subId, PIXI.Sprite>
        this.container = new PIXI.Container();
        this.container.sortableChildren = true;
        this.container.zIndex = 100; 
        this._refreshId = 0; // To track active refresh cycles
    }

    init() {
        const onCanvasReady = () => {
            // Só adiciona se canvas.primary existir
            if (!canvas.primary) return;
            // Se já existe, destrói o container antigo
            if (this.container && this.container.parent) {
                this.container.parent.removeChild(this.container);
            }
            // Sempre cria um novo container e novo mapa de sprites
            this.container = new PIXI.Container();
            this.container.sortableChildren = true;
            this.container.zIndex = 100;
            this.container.cullable = false;
            this.sprites = new Map();
            if (canvas.primary.mask) canvas.primary.mask = null;
            if (canvas.primary.sprite?.mask) canvas.primary.sprite.mask = null;
            try {
                canvas.primary.addChild(this.container);
            } catch (e) {
                return;
            }
            this.refresh();
        };

        Hooks.on("canvasReady", onCanvasReady);
        if (canvas.ready) onCanvasReady();

        Hooks.on("renderWallConfig", this._onRenderWallConfig.bind(this));
        Hooks.on("createWall", this._onCreateWall.bind(this));
        Hooks.on("updateWall", this._onUpdateWall.bind(this));
        Hooks.on("deleteWall", this._onDeleteWall.bind(this));
    }

    activate() {
        this.container.visible = true;
        this.refresh();
    }

    deactivate() {
        this.container.visible = false;
    }

    async refresh() {
        this._refreshId++;
        // Destroi todos os sprites antigos antes de limpar
        for (const sprite of this.sprites.values()) {
            sprite.destroy();
        }
        this.container.removeChildren();
        this.sprites.clear();

        if (!canvas.walls) return;

        const walls = canvas.walls.placeables.filter(w => w.document.getFlag(MODULE_ID, "is3D"));
        const currentRefreshId = this._refreshId;

        // 1. Mapa de Interseções: WallID -> Set de pontos de corte (t)
        const intersectionMap = new Map();
        walls.forEach(w => intersectionMap.set(w.id, new Set([0, 1])));

        // 2. Cálculo de Interseções entre todas as paredes 3D
        for (let i = 0; i < walls.length; i++) {
            for (let j = i + 1; j < walls.length; j++) {
                const wA = walls[i];
                const wB = walls[j];
                const t = findIntersectionT(
                    {x: wA.document.c[0], y: wA.document.c[1]}, {x: wA.document.c[2], y: wA.document.c[3]},
                    {x: wB.document.c[0], y: wB.document.c[1]}, {x: wB.document.c[2], y: wB.document.c[3]}
                );
                if (t !== null) {
                    intersectionMap.get(wA.id).add(t);
                    const tB = findIntersectionT(
                        {x: wB.document.c[0], y: wB.document.c[1]}, {x: wB.document.c[2], y: wB.document.c[3]},
                        {x: wA.document.c[0], y: wA.document.c[1]}, {x: wA.document.c[2], y: wA.document.c[3]}
                    );
                    if (tB !== null) intersectionMap.get(wB.id).add(tB);
                }
            }
        }

        // 3. Criação de Sprites baseada nos segmentos cortados
        const promises = [];
        for (const wall of walls) {
            const tPoints = Array.from(intersectionMap.get(wall.id)).sort((a, b) => a - b);
            const coords = wall.document.c;
            const fullLength = getWallLength(coords);
            for (let k = 0; k < tPoints.length - 1; k++) {
                const tStart = tPoints[k];
                const tEnd = tPoints[k+1];
                const subCoords = getWallSubSegment(coords, tStart, tEnd);
                const offset = tStart * fullLength;
                const subId = `${wall.id}-p${k}`;
                const promise = this.createWallSprite(wall, currentRefreshId, subCoords, subId, offset);
                promises.push(promise);
            }
        }
        await Promise.all(promises);
        const state = this.paperbox.state;
        this.updateAllTransforms(state.tilt, state.rotation);
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
        
        sprite.anchor.set(0.5, 1);
        sprite.cullable = false;

        sprite._wallData = {
            c: customCoords || doc.c,
            height: doc.getFlag(MODULE_ID, "height") || 100,
            textureOffset: offset // Guardamos o deslocamento para o updateTransform
        };

        this.sprites.set(spriteId, sprite);
        this.container.addChild(sprite);
        this.updateWallSprite(wall, sprite);
    }

    updateWallSprite(wall, sprite) {

        const state = this.paperbox.state;
        this.updateTransform(sprite, state.tilt, state.rotation);
    }

    updateAllTransforms(tilt, rotation) {
        // 1. Primeiro atualizamos as matrizes e calculamos a profundidade de cada sprite
        const segments = [];
        for (const sprite of this.sprites.values()) {
            this.updateTransform(sprite, tilt, rotation);
            segments.push({
                sprite,
                proj: getSegmentProjection(sprite._wallData.c, rotation)
            });
        }
        segments.sort((A, B) => compareSegments(A.proj, B.proj));
        segments.forEach((seg, index) => {
            seg.sprite.zIndex = index;
        });
        // this.container.sortChildren();
    }

    updateTransform(sprite, tilt, rotation) {
        if (!sprite._wallData || !sprite.texture || !sprite.texture.valid) return;
        sprite.visible = true;

        const { c: coords, height, textureOffset = 0 } = sprite._wallData;
        const p0 = { x: coords[0], y: coords[1] };
        const p1 = { x: coords[2], y: coords[3] };

        // 1. Calculate Wall Geometry
        const { length, angle: wallAngle, midX, midY } = getWallGeometry(p0, p1);
        sprite.width = length;
        sprite.height = sprite.texture.height;
        sprite.tilePosition.x = -textureOffset;

        const { x: upX, y: upY } = getProjectionVector(height, tilt, rotation);

        // Matrix components
        // X-axis (Wall Vector)
        const a = Math.cos(wallAngle);
        const b = Math.sin(wallAngle);
        const c = -upX / sprite.height;
        const d = -upY / sprite.height;

        sprite.transform.setFromMatrix(new PIXI.Matrix(a, b, c, d, midX, midY));
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

        const getFlag = (key, field) => {
            try {
                if (typeof doc.getFlag === "function") return doc.getFlag(key, field);
                return doc.flags?.[key]?.[field];
            } catch (e) { return null; }
        };

        const is3D = getFlag(MODULE_ID, "is3D") || false;
        const texture = getFlag(MODULE_ID, "texture") || "";
        const height = getFlag(MODULE_ID, "height") || 100;
        
        const content = `
            <fieldset>
                <legend>PaperBox 3D</legend>
                <div class="form-group">
                    <label>Enable 3D Wall</label>
                    <input type="checkbox" name="flags.${MODULE_ID}.is3D" ${is3D ? "checked" : ""}>
                </div>
                <div class="form-group">
                    <label>Texture</label>
                    <div class="form-fields">
                        <button type="button" class="file-picker" data-type="image" data-target="flags.${MODULE_ID}.texture" title="Browse Files" tabindex="-1">
                            <i class="fas fa-file-import fa-fw"></i>
                        </button>
                        <input class="image" type="text" name="flags.${MODULE_ID}.texture" placeholder="path/to/image.png" value="${texture}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Height (px)</label>
                    <input type="number" name="flags.${MODULE_ID}.height" value="${height}">
                </div>
            </fieldset>
        `;

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
}

