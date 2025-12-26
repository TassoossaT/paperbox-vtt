export function registerPatches() {
    console.log("PaperBox VTT | Registering PIXI Patches...");

    // Patch PIXI EventSystem to correct mouse coordinates
    // This affects clicks, hovers, and all interaction events
    if (typeof PIXI !== "undefined" && PIXI.EventSystem) {
        const originalMap = PIXI.EventSystem.prototype.mapPositionToPoint;
        
        PIXI.EventSystem.prototype.mapPositionToPoint = function(point, x, y) {
            // Only apply if PaperBox is active and initialized
            if (document.body.classList.contains("paperbox-active") && game.paperbox?.projector) {
                const projected = game.paperbox.projector.getProjectedCoordinates(x, y);
                
                // projected contains {x, y} in Canvas Pixel Space (relative to top-left of canvas element)
                // We need to map this to the Stage World Space (accounting for Pan/Zoom)
                // Usually this.root is the stage.
                
                if (this.root && this.root.worldTransform) {
                    this.root.worldTransform.applyInverse(projected, point);
                } else {
                    // Fallback if root is not defined (unlikely)
                    point.x = projected.x;
                    point.y = projected.y;
                }
                return;
            }
            
            return originalMap.call(this, point, x, y);
        };
    } else {
        console.warn("PaperBox VTT | PIXI.EventSystem not found. Mouse correction may fail.");
    }
}
