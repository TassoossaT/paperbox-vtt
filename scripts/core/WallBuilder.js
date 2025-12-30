import { MODULE_ID } from "../utils/constants.js";

export class WallBuilder {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.sprites = new Map(); // Map<WallID, PIXI.Sprite>
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
        // Increment refresh ID to invalidate any pending async creations from previous cycles
        this._refreshId++;
        
        this.container.removeChildren();
        this.sprites.clear();

        if (!canvas.walls) return;

        const walls = canvas.walls.placeables;
        const currentRefreshId = this._refreshId;

        for (const wall of walls) {
            if (wall.document.getFlag(MODULE_ID, "is3D")) {
                this.createWallSprite(wall, currentRefreshId);
            }
        }
        
        // Force update transforms immediately
        const state = this.paperbox.state;
        this.updateAllTransforms(state.tilt, state.rotation);
    }

    async createWallSprite(wall, refreshId = null) {
        // If no refreshId provided, use current (for single creations)
        if (refreshId === null) refreshId = this._refreshId;

        const doc = wall.document;
        const texturePath = doc.getFlag(MODULE_ID, "texture");
        if (!texturePath) return;

        let texture;
        try {
            // Try Foundry's loader first (handles caching/video)
            if (foundry?.canvas?.TextureLoader?.loader) {
                texture = await foundry.canvas.TextureLoader.loader.loadTexture(texturePath);
            } else if (typeof loadTexture === "function") {
                texture = await loadTexture(texturePath);
            }
        } catch (e) {
            // Ignore loader errors, fall back below
        }

        // Fallback
        if (!texture || !texture.baseTexture) {
            texture = PIXI.Texture.from(texturePath);
        }

        if (!texture) return;

        // CRITICAL: Check if this operation is still valid
        // 1. If refresh cycle changed, abort
        if (refreshId !== this._refreshId) return;
        
        // 2. If sprite already exists for this ID (race condition), destroy old one
        if (this.sprites.has(doc.id)) {
            const old = this.sprites.get(doc.id);
            old.destroy();
            this.sprites.delete(doc.id);
        }

        let sprite;
        try {
            sprite = new PIXI.Sprite(texture);
        } catch (err) {
            console.error(`PaperBox | Error creating sprite for ${doc.id}:`, err);
            return;
        }

        sprite.anchor.set(0.5, 1); 
        sprite.cullable = false;
        this.sprites.set(doc.id, sprite);
        this.container.addChild(sprite);

        // Handle texture loading async
        const updateFn = () => {
            // Ensure sprite is still valid and part of our system
            if (!sprite.destroyed && this.sprites.get(doc.id) === sprite) {
                this.updateWallSprite(wall, sprite);
            }
        };

        if (texture.baseTexture && !texture.baseTexture.valid) {
            texture.baseTexture.once("loaded", updateFn);
        } else if (!texture.valid) {
            texture.once("update", updateFn);
        }

        // Initial update
        this.updateWallSprite(wall, sprite);
    }

    updateWallSprite(wall, sprite) {
        // Just store the wall data on the sprite for easy access during transform update
        sprite._wallData = {
            c: wall.document.c,
            height: wall.document.getFlag(MODULE_ID, "height") || 100
        };
        
        // Trigger a transform update
        const state = this.paperbox.state;
        this.updateTransform(sprite, state.tilt, state.rotation);
    }

    updateAllTransforms(tilt, rotation) {
        for (const sprite of this.sprites.values()) {
            this.updateTransform(sprite, tilt, rotation);
        }
    }

    updateTransform(sprite, tilt, rotation) {
        if (!sprite._wallData) return;
        
        // Check if texture is valid
        if (!sprite.texture.valid) return;

        const { c: coords, height } = sprite._wallData;
        const p0 = { x: coords[0], y: coords[1] };
        const p1 = { x: coords[2], y: coords[3] };

        // 1. Calculate Wall Geometry
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const wallAngle = Math.atan2(dy, dx);
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;

        // 2. Calculate Projection Vector (The "Up" direction on the floor)
        // Screen Up is -90 degrees relative to North (0 degrees).
        // If board is rotated by R, Screen Up is rotated by -R.
        // So UpAngle = -90 - R (in degrees)
        const rad = Math.PI / 180;
        const upAngle = (-90 - rotation) * rad;
        
        // Projection Factor: How long is the shadow of a unit height?
        // If we want visual height H on screen, we need floor length L = H / cos(tilt)
        const safeTilt = Math.max(tilt, 0);
        const factor = 1 / Math.max(0.01, Math.cos(safeTilt * rad));
        
        const upLen = height * factor;
        
        const upX = upLen * Math.cos(upAngle);
        const upY = upLen * Math.sin(upAngle);

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

        // Y-axis (Up Vector) - Note: Local Y is negative (up), so we map -1 to UpVector
        // But sprite height is positive. Anchor is at bottom (y=1*H). Top is at y=0?
        // No, anchor (0.5, 1).
        // Local coords: Bottom=(0, 0 relative to anchor), Top=(0, -Height).
        // We want Top to be at (UpX, UpY).
        // So -Height * c = UpX => c = -UpX / Height
        // -Height * d = UpY => d = -UpY / Height
        // But we are using the texture's native height for the matrix calculation if we don't pre-scale.
        // Let's use the 'height' value we want.
        
        const c = -upX / sprite.texture.height;
        const d = -upY / sprite.texture.height;

        // Position
        const tx = midX;
        const ty = midY;

        // Apply Matrix
        const matrix = new PIXI.Matrix(a, b, c, d, tx, ty);
        sprite.transform.setFromMatrix(matrix);
        
        // Ensure visibility properties are set
        sprite.visible = true;
        sprite.alpha = 1;
        sprite.zIndex = 1000;
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
