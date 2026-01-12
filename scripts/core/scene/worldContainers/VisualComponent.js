import { getWallLength, getWallSubSegment, calculateTransform } from "../../../utils/math.js";

export class VisualComponent {
    constructor(objectId, container, orchestrator, parent = null) {
        this.objectId = objectId;
        this.container = container;
        this.parent = parent;
        this.orchestrator = orchestrator;
        this.sprites = [];
        this.texture = null;

        // Estado genérico para animações
        this.state = {
            angle: 0,
            slide: 0,
            lift: 0,
            alpha: 1,
            scale: 1
        };

        this._coords = null;
        this._height = null;
        this.isReady = false;
        this._ticker = null;

        if (this.orchestrator?.registerComponent) {
            this.orchestrator.registerComponent(this);
        }
    }

    get coords() { return this._coords; }
    set coords(val) { this._coords = val; this._autoUpdate(); }

    get height() { return this._height; }
    set height(val) { this._height = val; this._autoUpdate(); }

    /**
     * Motor de Animação Genérico
     */
    animateTo(targetProps, duration = 30) {
        if (duration <= 0) {
            Object.assign(this.state, targetProps);
            return this._autoUpdate();
        }

        if (this._ticker) {
            this._ticker.destroy();
            this._ticker = null;
        }

        const startValues = {};
        const props = Object.keys(targetProps);
        props.forEach(p => startValues[p] = this.state[p] ?? 0);

        let elapsed = 0;
        this._ticker = new PIXI.Ticker();
        this._ticker.add((delta) => {
            elapsed += delta;
            const progress = Math.min(1, elapsed / duration);
            const ease = 1 - Math.pow(1 - progress, 3);

            props.forEach(p => {
                this.state[p] = startValues[p] + (targetProps[p] - startValues[p]) * ease;
            });

            this._autoUpdate();
            if (progress >= 1) {
                this._ticker.destroy();
                this._ticker = null;
            }
        });
        this._ticker.start();
    }

    /**
     * Reconstrói a geometria
     */
    async buildFromGeometry({ coords, tPoints, height, texturePath }) {
        this._coords = coords;
        this._height = height;

        // 1. Carrega a textura usando a lógica que funcionava anteriormente
        this.texture = await this._loadTexture(texturePath);

        this.clearSprites();

        const fullLength = getWallLength(coords);
        const sortedPoints = Array.from(tPoints || [0, 1]).sort((a, b) => a - b);

        for (let k = 0; k < sortedPoints.length - 1; k++) {
            const t0 = sortedPoints[k];
            const t1 = sortedPoints[k+1];
            const subCoords = getWallSubSegment(coords, t0, t1);
            const offset = t0 * fullLength;

            const sprite = this._createTilingSprite(height, offset);
            if (sprite) {
                sprite._segmentIndex = k;
                this.sprites.push(sprite);
                this.container.addChild(sprite);
            }
        }

        this.isReady = true;
        this._autoUpdate();
    }

    _createTilingSprite(height, textureOffset) {
        // Recupera a textura carregada
        let tex = this.texture;

        // Garante que é uma PIXI.Texture (lógica do seu código anterior)
        if (!tex || !(tex instanceof PIXI.Texture)) {
            tex = tex ? PIXI.Texture.from(tex) : PIXI.Texture.WHITE;
        }

        // Fallback final para evitar o erro de 'reading x'
        if (!tex.baseTexture) tex = PIXI.Texture.WHITE;

        // No seu código anterior, você usava texture.height, mas aqui usamos a altura da parede
        const sprite = new PIXI.TilingSprite(tex, 1, height || tex.height || 100);
        
        sprite.anchor.set(0.5, 1);
        sprite._wallData = { textureOffset };
        return sprite;
    }

    async _loadTexture(path) {
        try {
            if (window.foundry?.canvas?.TextureLoader?.loader) {
                return await foundry.canvas.TextureLoader.loader.loadTexture(path);
            }
            return PIXI.Texture.from(path);
        } catch (e) {
            console.error("VisualComponent | Erro ao carregar textura:", path, e);
            return PIXI.Texture.WHITE;
        }
    }

    update(cameraState = { tilt: 0, rotation: 0 }) {
        if (!this.isReady || !this._coords) return;

        const { tilt, rotation } = cameraState;

        for (const sprite of this.sprites) {
            // --- Lógica de Espelhamento para Portas Duplas ---
            const sideConfig = this.side === "right"
            ? { angle: -this.state.angle, slide: -this.state.slide, pivot: { x: this._coords[2], y: this._coords[3] } }
            : { angle: this.state.angle, slide: this.state.slide, pivot: { x: this._coords[0], y: this._coords[1] } };

            let angle = sideConfig.angle;
            let slide = sideConfig.slide;
            let pivot = sideConfig.pivot;
            let lift = this.state.lift;

            // --- Chamada para o seu math.js ---
            const transform = calculateTransform({
                coords: this._coords,
                height: this._height,
                tilt,
                rotation,
                angle,   // Valor já tratado/invertido
                pivot, // Pivot na ponta correta
                slide,       // Valor já tratado/invertido
                lift
            });

            // Salva o transform para o Orchestrator (Z-Index)
            sprite.lastTransform = transform;

            // Aplica a matriz de transformação no PIXI
            const { a, b, c, d, tx, ty } = transform.matrixParams;
            sprite.transform.setFromMatrix(new PIXI.Matrix(a, b, c, d, tx, ty));
            
            sprite.width = transform.length;
            sprite.height = this._height * this.state.scale;
            sprite.alpha = this.state.alpha;
            
            sprite.tilePosition.x = -(sprite._wallData?.textureOffset || 0);
        }
    }

    _autoUpdate() {
        if (this.isReady && this.parent?.paperbox?.state) {
            this.update(this.parent.paperbox.state);
        }
    }

    clearSprites() {
        for (const sprite of this.sprites) {
            if (sprite.parent) sprite.parent.removeChild(sprite);
            sprite.destroy();
        }
        this.sprites = [];
    }

    destroy() {
        if (this._ticker) this._ticker.destroy();
        this.clearSprites();
    }
}