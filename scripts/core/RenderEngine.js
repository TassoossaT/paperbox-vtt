import { MODULE_ID } from "../utils/constants.js";
import { LightManager } from "./LightManager.js";

export class RenderEngine {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.lightManager = paperbox.lightManager;
        this._isActive = false;
        this.tiltContainer = null;
        this.rotationContainer = null;
        // State tracking for optimization
        this._lastTilt = null;
        this._lastRotation = null;
    }

    activate() {
        if (this._isActive) return;
        this._isActive = true;

        // 1. Setup Containers
        this.tiltContainer = new PIXI.Container();
        this.tiltContainer.name = "PaperBoxTiltContainer";
        this.tiltContainer.sortableChildren = false;
        
        this.rotationContainer = new PIXI.Container();
        this.rotationContainer.name = "PaperBoxRotationContainer";
        this.rotationContainer.sortableChildren = true;

        // 2. Move Stage Children
        // We move everything from canvas.stage to our rotation container
        // This includes canvas.primary (background, drawings, tokens), canvas.grid, etc.
        const children = [...canvas.stage.children];
        for (const child of children) {
            this.rotationContainer.addChild(child);
        }
        this.tiltContainer.addChild(this.rotationContainer);
        canvas.stage.mask = null;
        canvas.stage.addChild(this.tiltContainer);

        // 4. Start Loop
        canvas.app.ticker.add(this._onTick, this, PIXI.UPDATE_PRIORITY.LOW);
        
        // Hook into canvasPan to ensure immediate sync when panning/zooming
        Hooks.on("canvasPan", this._onCanvasPan.bind(this));

        // 5. Initial Update
        this._updateVisuals(true); // Force update
    }

    deactivate() {
        if (!this._isActive) return;
        this._isActive = false;

        canvas.app.ticker.remove(this._onTick, this);
        Hooks.off("canvasPan", this._onCanvasPan.bind(this));

        // Restore Hierarchy
        if (this.rotationContainer) {
            const children = [...this.rotationContainer.children];
            for (const child of children) {
                canvas.stage.addChild(child);
            }
            
            this.rotationContainer.destroy({ children: false });
            this.tiltContainer.destroy({ children: false });
            
            this.rotationContainer = null;
            this.tiltContainer = null;
        }

        if (this.border) {
            this.border.destroy();
            this.border = null;
        }
        
        // Reset state trackers
        this._lastTilt = null;
        this._lastRotation = null;
    }

    update() {
        // Called when state changes manually (e.g. settings)
        this._updateVisuals();  
    }

    _onTick() {
        if (!this._isActive) return;
        
        // 1. Sync Position with Camera (Every frame)
        this._syncPivot();

        // 2. Check if we need to update visuals (Only if state changed)
        this._updateVisuals();

        // 2.5. Atualiza iluminação do Foundry
        if (this.lightManager) {
            this.lightManager.refresh();
        }

        // 3. Sync HUD Transform (Every frame to override Foundry)
        this._syncHudTransform();
    }

    _onCanvasPan() {
        if (this._isActive) {
            this._syncPivot();
        }
    }

    _syncPivot() {
        if (!this.tiltContainer || !this.rotationContainer) return;
        
        const pivot = canvas.stage.pivot;
        const scale = canvas.stage.scale;

        // Sincroniza a posição dos containers com a câmera do Foundry
        // Usamos o pivot para garantir que a rotação ocorra em volta do centro da tela
        this.tiltContainer.position.set(pivot.x, pivot.y);
        this.tiltContainer.pivot.set(pivot.x, pivot.y);

        this.rotationContainer.position.set(pivot.x, pivot.y);
        this.rotationContainer.pivot.set(pivot.x, pivot.y);
    }

    _updateVisuals(force = false) {
        const state = this.paperbox.state;
        
        if (!force && state.tilt === this._lastTilt && state.rotation === this._lastRotation) {
            return;
        }

        this._lastTilt = state.tilt;
        this._lastRotation = state.rotation;

        const rad = Math.PI / 180;
        const tiltRad = state.tilt * rad;

        if (this.tiltContainer) {
            // O Scale Y cria o efeito de achatamento (perspectiva isométrica)
            const cosTilt = Math.max(0.01, Math.cos(tiltRad)); 
            this.tiltContainer.scale.y = cosTilt;
        }

        if (this.rotationContainer) {
            this.rotationContainer.rotation = state.rotation * rad;
        }
        if (this.paperbox.orchestrator?.depthUpdate) {
            this.paperbox.orchestrator.depthUpdate();
        }
        // if (this.paperbox.wallBuilder?.updateAllTransforms) {
        //     this.paperbox.wallBuilder.updateAllTransforms(state.tilt, state.rotation);
        // }
        // if (this.paperbox.doorBuilder?.updateAllTransforms) {
        //     this.paperbox.doorBuilder.updateAllTransforms(state.tilt, state.rotation);
        // }
        if (canvas.ready && canvas.hud) {
            canvas.hud.align();
        }
    }

    _syncHudTransform() {
        const hud = document.getElementById("hud");
        if (!hud) return;

        // Apenas atualizamos as variáveis. O CSS !important cuida do resto.
        // Aplica a transformação visual diretamente ao HUD
        const state = this.paperbox.state;
        const scale = canvas.stage.scale.x;
        hud.style.transform = `scale(${scale}) rotateX(${state.tilt}deg) rotateZ(${state.rotation}deg)`;
    }


    /**
     * Calculates the screen coordinates for a given world point.
     * This is the EXACT INVERSE of Projector.getProjectedCoordinates.
     */
    getScreenCoordinates(worldX, worldY) {
        // Ensure the container exists
        if (!this.rotationContainer) return { x: worldX, y: worldY };

        // Ensure the container's pivot/position are synced with the camera
        // This is crucial because Foundry updates the camera (canvas.stage.pivot) 
        // independently of our render loop.
        this._syncPivot();

        // Use PIXI's internal transform engine to calculate the screen position.
        // This guarantees that the HUD position matches the visual position exactly,
        // including all rotations, tilts, scales, and parent transforms.
        const globalPos = this.rotationContainer.toGlobal(new PIXI.Point(worldX, worldY));

        return {
            x: globalPos.x,
            y: globalPos.y
        };
    }
}
