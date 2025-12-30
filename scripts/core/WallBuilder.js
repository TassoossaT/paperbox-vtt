import { MODULE_ID } from "../utils/constants.js";
import { findIntersectionT, getProjectionVector, getSegmentProjection, compareSegments, getWallGeometry } from "../utils/math.js";

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
            if (!canvas.primary) return;
            // Avoid adding multiple times
            if (this.container.parent) return;
            if (canvas.primary.mask) canvas.primary.mask = null;
            if (canvas.primary.sprite?.mask) canvas.primary.sprite.mask = null;
            this.container.cullable = false;
            canvas.primary.addChild(this.container);
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

    refresh() {
        this._refreshId++;
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
                    // Encontramos um cruzamento: marca o ponto t em A e calcula o t correspondente em B
                    intersectionMap.get(wA.id).add(t);
                    // Calcula o t para wB também
                    const tB = findIntersectionT(
                        {x: wB.document.c[0], y: wB.document.c[1]}, {x: wB.document.c[2], y: wB.document.c[3]},
                        {x: wA.document.c[0], y: wA.document.c[1]}, {x: wA.document.c[2], y: wA.document.c[3]}
                    );
                    if (tB !== null) intersectionMap.get(wB.id).add(tB);
                }
            }
        }

        // 3. Criação de Sprites baseada nos segmentos cortados
        for (const wall of walls) {
            const tPoints = Array.from(intersectionMap.get(wall.id)).sort((a, b) => a - b);
            const coords = wall.document.c;

            for (let k = 0; k < tPoints.length - 1; k++) {
                const tStart = tPoints[k];
                const tEnd = tPoints[k+1];

                // Calcula as coordenadas do sub-segmento
                const subCoords = [
                    coords[0] + tStart * (coords[2] - coords[0]),
                    coords[1] + tStart * (coords[3] - coords[1]),
                    coords[0] + tEnd * (coords[2] - coords[0]),
                    coords[1] + tEnd * (coords[3] - coords[1])
                ];

                const subId = `${wall.id}-p${k}`;
                this.createWallSprite(wall, currentRefreshId, subCoords, subId);
            }
        }

        const state = this.paperbox.state;
        this.updateAllTransforms(state.tilt, state.rotation);
    }

    // Adicionado customCoords e customId para lidar com os pedaços
    async createWallSprite(wall, refreshId = null, customCoords = null, customId = null) {
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

        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5, 1);
        sprite.cullable = false;

        // CRITICAL: Guardamos as coordenadas específicas deste pedaço
        sprite._wallData = {
            c: customCoords || doc.c,
            height: doc.getFlag(MODULE_ID, "height") || 100
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
    }

    updateTransform(sprite, tilt, rotation) {
        if (!sprite._wallData || !sprite.texture.valid) return;
        sprite.visible = true;

        const { c: coords, height } = sprite._wallData;
        const p0 = { x: coords[0], y: coords[1] };
        const p1 = { x: coords[2], y: coords[3] };

        // 1. Calculate Wall Geometry
        const { length, angle: wallAngle, midX, midY } = getWallGeometry(p0, p1);

        // 2. Calculate Projection Vector (The "Up" direction on the floor)
        const { x: upX, y: upY } = getProjectionVector(height, tilt, rotation);
        
        // 3. Construct Transformation Matrix
        // We want to map the sprite's local rectangle to the parallelogram defined by WallVector and UpVector.
        // Sprite Local: Width = texture.width, Height = texture.height
        // We want Sprite Width to map to Wall Length.
        // We want Sprite Height to map to UpLen.
        
        // Scale factors to normalize texture dimensions
        const scaleX = length / sprite.texture.width;
        const scaleY = 1 / sprite.texture.height; // We handle height via UpVector directly

        // Matrix components
        // X-axis (Wall Vector)
        const a = Math.cos(wallAngle) * scaleX;
        const b = Math.sin(wallAngle) * scaleX;
        const c = -upX / sprite.texture.height;
        const d = -upY / sprite.texture.height;

        sprite.transform.setFromMatrix(new PIXI.Matrix(a, b, c, d, midX, midY));
        
        // // 2. ORDENAÇÃO POR EXTREMOS TOTAIS
        // // Calculamos a profundidade dos 4 cantos do volume da parede
        // const d0 = getProjectedDepth(p0.x, p0.y, 0, tilt, rotation);
        // const d1 = getProjectedDepth(p1.x, p1.y, 0, tilt, rotation);
        // const t0 = getProjectedDepth(p0.x, p0.y, height, tilt, rotation);
        // const t1 = getProjectedDepth(p1.x, p1.y, height, tilt, rotation);
        // const maxDepth = Math.max(d0, d1, t0, t1);
        // sprite.zIndex = maxDepth;
    }

    _onCreateWall(doc) {
        if (doc.getFlag(MODULE_ID, "is3D")) this.createWallSprite(doc.object);
    }

    _onUpdateWall(doc) {
        // Ensure we have the latest data from the document
        const sprite = this.sprites.get(doc.id);
        
        if (sprite) {
            if (!doc.getFlag(MODULE_ID, "is3D")) {
                sprite.destroy();
                this.sprites.delete(doc.id);
            } else {
                // Pass the document directly to ensure we use the latest coordinates
                this.updateWallSprite({ document: doc }, sprite);
            }
        } else if (doc.getFlag(MODULE_ID, "is3D")) {
            // If it's a new 3D wall (or was toggled to 3D), create it
            // We need a mock object structure if doc.object is not available, but usually it is.
            // createWallSprite expects { document: doc } structure.
            this.createWallSprite({ document: doc });
        }
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

