export class InputManager {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Bindings para manter o contexto 'this'
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
    }

    activate() {
        window.addEventListener("mousedown", this._onMouseDown, true);
        window.addEventListener("mousemove", this._onMouseMove, true);
        window.addEventListener("mouseup", this._onMouseUp, true);
    }

    deactivate() {
        window.removeEventListener("mousedown", this._onMouseDown, true);
        window.removeEventListener("mousemove", this._onMouseMove, true);
        window.removeEventListener("mouseup", this._onMouseUp, true);
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
