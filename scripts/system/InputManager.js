
export class InputManager {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Listeners para pointermove
        this.pointerMoveListeners = [];

        // Bindings para manter o contexto 'this'
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
    }
    /**
     * Permite que outros módulos registrem callbacks para pointermove (ex: gridManager)
     * @param {function(ev, world)} callback
     */
    addPointerMoveListener(callback) {
        if (typeof callback === 'function') {
            this.pointerMoveListeners.push(callback);
        }
    }

    removePointerMoveListener(callback) {
        this.pointerMoveListeners = this.pointerMoveListeners.filter(fn => fn !== callback);
    }


    activate() {
        window.addEventListener("mousedown", this._onMouseDown, true);
        window.addEventListener("mousemove", this._onMouseMove, true);
        window.addEventListener("mouseup", this._onMouseUp, true);
        window.addEventListener("pointermove", this._onPointerMove, { passive: true });
    }


    deactivate() {
        window.removeEventListener("mousedown", this._onMouseDown, true);
        window.removeEventListener("mousemove", this._onMouseMove, true);
        window.removeEventListener("mouseup", this._onMouseUp, true);
        window.removeEventListener("pointermove", this._onPointerMove, { passive: true });
    }
    /**
     * Handler para pointermove: converte mouse para mundo e atualiza cursor do grid
     */
    _onPointerMove(ev) {
        // Obtém posição global do mouse
        let global = ev?.data?.global || ev?.global;
        const interaction = canvas?.app?.renderer?.plugins?.interaction;
        if (!global && interaction) {
            global = interaction.pointer?.global || interaction.mouse?.global;
        }
        if (!global && interaction && ev?.clientX !== undefined) {
            const pt = new PIXI.Point();
            interaction.mapPositionToPoint(pt, ev.clientX, ev.clientY);
            global = pt;
        }
        if (!global && ev?.clientX !== undefined && ev?.clientY !== undefined) {
            const rect = canvas.app.view.getBoundingClientRect();
            const x = ev.clientX - rect.left;
            const y = ev.clientY - rect.top;
            global = new PIXI.Point(x * (canvas.app.renderer.resolution || 1), y * (canvas.app.renderer.resolution || 1));
        }
        if (!global) return;
        // O target deve ser passado pelo listener, mas por padrão usa canvas.stage
        // Listeners podem decidir como interpretar global
        const world = global; // listeners podem converter se quiserem
        for (const cb of this.pointerMoveListeners) {
            try { cb(ev, world); } catch (e) { /* ignore */ }
        }
    }

    _onMouseDown(event) {
        // Botão do Meio (Scroll Click) é o código 1
        if (event.button === 1 && document.body.classList.contains("paperbox-active")) {
            this.isDragging = true;
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
            
            event.preventDefault();
            event.stopPropagation();
        }
    }

    _onMouseMove(event) {
        if (!this.isDragging) return;

        event.preventDefault();
        event.stopPropagation();

        const deltaX = event.clientX - this.lastMouseX;
        const deltaY = event.clientY - this.lastMouseY;
        const sensitivity = 0.2;
        const state = this.paperbox.state;

        // Tilt (Eixo Y do mouse)
        if (!state.lockedTilt) {
            // Math.clamped deprecated in V12 -> Math.clamp
            const clamp = Math.clamp || Math.clamped;
            const newTilt = clamp(state.tilt - (deltaY * sensitivity), 0, 90);
            this.paperbox.setState({ tilt: newTilt });
        }

        // Rotação (Eixo X do mouse)
        if (!state.lockedRotation) {
            const newRotation = state.rotation - (deltaX * sensitivity);
            this.paperbox.setState({ rotation: newRotation });
        }

        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
    }

    _onMouseUp(event) {
        if (this.isDragging && event.button === 1) {
            this.isDragging = false;
        }
    }
}
