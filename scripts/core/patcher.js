export function registerPatches() {
    // 1. Patch PIXI getLocalPosition
    // This fixes tools (Ruler, Dragging) that call event.data.getLocalPosition(canvas.stage) directly.
    // We redirect requests for 'canvas.stage' coordinates to 'rotationContainer' coordinates when active.
    const patchPixiMethod = (proto, methodName) => {
        if (!proto || !proto[methodName]) return;
        const original = proto[methodName];
        proto[methodName] = function(displayObject, point, globalPos) {
            if (game.paperbox?.renderEngine?.rotationContainer && displayObject === canvas.stage) {
                displayObject = game.paperbox.renderEngine.rotationContainer;
            }
            return original.call(this, displayObject, point, globalPos);
        };
    };
    
    if (typeof PIXI !== "undefined") {
        if (PIXI.InteractionData) patchPixiMethod(PIXI.InteractionData.prototype, "getLocalPosition");
        if (PIXI.FederatedEvent) patchPixiMethod(PIXI.FederatedEvent.prototype, "getLocalPosition");
        if (PIXI.FederatedPointerEvent) patchPixiMethod(PIXI.FederatedPointerEvent.prototype, "getLocalPosition");
    }
}