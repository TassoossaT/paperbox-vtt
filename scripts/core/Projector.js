export class Projector {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this._cachedPivot = null;
        
        // Invalidate cache on resize
        window.addEventListener("resize", () => this._cachedPivot = null);
    }

    /**
     * Projects screen coordinates (clientX, clientY) to the board's local coordinate system (canvas space).
     * @param {number} clientX 
     * @param {number} clientY 
     * @returns {Object} {x, y}
     */
    getProjectedCoordinates(clientX, clientY) {
        const board = document.getElementById("board");
        if (!board) return { x: 0, y: 0 };

        // Cache the pivot calculation to avoid layout thrashing
        if (!this._cachedPivot) {
            let el = board;
            let pivotX = 0;
            let pivotY = 0;

            while (el) {
                pivotX += el.offsetLeft;
                pivotY += el.offsetTop;
                el = el.offsetParent;
            }

            // Add half dimensions to find the center
            pivotX += board.offsetWidth / 2;
            pivotY += board.offsetHeight / 2;
            
            this._cachedPivot = { x: pivotX, y: pivotY };
        }

        let pivotX = this._cachedPivot.x;
        let pivotY = this._cachedPivot.y;

        // Adjust for viewport scroll to get client coordinates
        pivotX -= window.pageXOffset;
        pivotY -= window.pageYOffset;

        // 1. Screen Coordinates relative to Pivot
        // Adjust for Scale (1.5) defined in CSS
        const scale = 1.5;
        const screenX = (clientX - pivotX) / scale;
        const screenY = (clientY - pivotY) / scale;

        // 2. Get State
        const state = this.paperbox.state;
        const tiltRad = state.tilt * (Math.PI / 180);
        const rotRad = state.rotation * (Math.PI / 180);

        // 3. Orthographic Un-Projection
        // Visual Transform: Scale -> RotateX(tilt) -> RotateZ(rotation)
        //
        // In Orthographic projection (no perspective), the Z coordinate is simply dropped.
        // However, the Tilt (RotateX) compresses the Y axis visually.
        // y_screen = y_board * cos(tilt)
        // x_screen = x_board
        //
        // So to reverse Tilt:
        // y_untilted = y_screen / cos(tilt)
        // x_untilted = x_screen

        // Avoid division by zero if tilt is 90 degrees
        const cosTilt = Math.cos(tiltRad);
        const safeCosTilt = Math.abs(cosTilt) < 0.001 ? 0.001 : cosTilt;

        const x_untilted = screenX;
        const y_untilted = screenY / safeCosTilt;

        // 4. Reverse Rotation (RotateZ)
        // To reverse a rotation of angle A, we rotate by -A.
        // x_final = x * cos(-A) - y * sin(-A)
        // y_final = x * sin(-A) + y * cos(-A)
        
        const cosRot = Math.cos(-rotRad);
        const sinRot = Math.sin(-rotRad);

        const finalX = x_untilted * cosRot - y_untilted * sinRot;
        const finalY = x_untilted * sinRot + y_untilted * cosRot;

        // 5. Return to Top-Left Coordinates
        // The calculations were done relative to center (0,0).
        // We need to add the board's half-width/height back to get coordinates relative to top-left (0,0) of the canvas.
        
        return {
            x: finalX + (board.offsetWidth / 2),
            y: finalY + (board.offsetHeight / 2)
        };
    }
}