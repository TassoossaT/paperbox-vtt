export class Projector {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this._cachedPivot = null;
        this._lastResize = 0;
        
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
        const tilt = state.tilt * (Math.PI / 180); // Rotate X
        const rotation = state.rotation * (Math.PI / 180); // Rotate Z
        const perspective = 2000; // Fixed in CSS as --pb-perspective

        // 3. Raycasting Logic
        // Camera is at (0, 0, perspective)
        const rayOrigin = { x: 0, y: 0, z: perspective };
        const rayDir = { x: screenX, y: screenY, z: -perspective }; // Vector from Camera to Screen Point

        // 4. Rotate Ray into Board Space (Inverse Transform)
        // Correct Inverse Order: 
        // The CSS is: rotateX(tilt) * rotateZ(rotation)
        // This means the object is rotated Z first, then X.
        // To invert, we must Un-Rotate X first, then Un-Rotate Z.
        // Inverse = InvZ * InvX

        // Step A: Un-Rotate X (-tilt)
        // y' = y cos(-a) - z sin(-a)
        // z' = y sin(-a) + z cos(-a)
        const cosT = Math.cos(-tilt);
        const sinT = Math.sin(-tilt);

        let o1 = {
            x: rayOrigin.x,
            y: rayOrigin.y * cosT - rayOrigin.z * sinT,
            z: rayOrigin.y * sinT + rayOrigin.z * cosT
        };
        let d1 = {
            x: rayDir.x,
            y: rayDir.y * cosT - rayDir.z * sinT,
            z: rayDir.y * sinT + rayDir.z * cosT
        };

        // Step B: Un-Rotate Z (-rotation)
        // x' = x cos(-a) - y sin(-a)
        // y' = x sin(-a) + y cos(-a)
        const cosR = Math.cos(-rotation);
        const sinR = Math.sin(-rotation);

        let o2 = {
            x: o1.x * cosR - o1.y * sinR,
            y: o1.x * sinR + o1.y * cosR,
            z: o1.z
        };
        let d2 = {
            x: d1.x * cosR - d1.y * sinR,
            y: d1.x * sinR + d1.y * cosR,
            z: d1.z
        };

        // 5. Intersect with Plane z=0
        if (Math.abs(d2.z) < 0.0001) return { x: screenX, y: screenY }; // Parallel ray?

        const t = -o2.z / d2.z;
        
        const hitX = o2.x + t * d2.x;
        const hitY = o2.y + t * d2.y;

        // Convert back to Canvas Space (Top-Left origin)
        const finalX = hitX + (board.offsetWidth / 2);
        const finalY = hitY + (board.offsetHeight / 2);

        // Apply correction based on angle sensitivity
        // The user reported that the error scales with the angle.
        // This suggests a slight mismatch in the perspective projection math vs CSS.
        // We can try to compensate for the "parallax" effect.
        
        return { x: finalX, y: finalY };
    }
}
