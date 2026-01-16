/**
 * PaperBox VTT - Main Entry Point
 * Author: Tasso Augusto
 */

import { MODULE_ID } from "./utils/constants.js";
import { PaperBox } from "./core/PaperBox.js";
import { registerPatches } from "./core/patcher.js";
import { getWall3DConfigHTML } from "./utils/dom.js";

// Global Singleton Instance
let paperbox;

Hooks.once('init', () => {
    registerPatches();

    // 1. Register Client Settings
    game.settings.register(MODULE_ID, "enabled", {
        name: "Enable 2.5D Mode",
        hint: "Activates isometric/perspective visualization.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: value => paperbox?.toggle(value)
    });

    game.settings.register(MODULE_ID, "savedTilt", {
        scope: "client", config: false, type: Number, default: 0
    });
    game.settings.register(MODULE_ID, "savedRotation", {
        scope: "client", config: false, type: Number, default: 0
    });

    // HUD Position Settings
    game.settings.register(MODULE_ID, "hudPosTilt", {
        scope: "client", config: false, type: Object, default: { top: "20%", right: "20px" }
    });
    game.settings.register(MODULE_ID, "hudPosRot", {
        scope: "client", config: false, type: Object, default: { bottom: "20px", left: "50%" }
    });

    // 2. Instantiate Core
    paperbox = new PaperBox();
    
    // Expose API globally for macros and other modules
    game.paperbox = paperbox;
});

Hooks.on('ready', () => {
    paperbox.initialize();
});

// --- PaperBox 3D: Wall Configuration Injection ---
Hooks.on("renderWallConfig", (app, html, data) => {

    const doc = app?.document || app?.object?.document || app?.object;
    if (!doc) return;

    /**
     * Helper to read flags safely
     */
    function getFlag(field, fallback = undefined) {
        try {
            return doc.getFlag(MODULE_ID, field) ?? fallback;
        } catch (e) { return fallback; }
    }

    const is3D = !!getFlag("is3D", false);
    const texture = getFlag("texture", "");
    const vertices = getFlag("vertices", null);
    
    // UI Logic: If we have no vertices but height was used previously, 
    // we show that, otherwise default to 100.
    const currentHeight = getFlag("height", 100);

    // Build the standardized HTML block
    const content = getWall3DConfigHTML({
        label: "Enable 3D Wall",
        is3D,
        texture,
        height: currentHeight,
        moduleId: MODULE_ID
    });

    let $html = html instanceof jQuery ? html : $(html);

    // Prevent duplicates
    $html.find(`fieldset legend:contains("PaperBox 3D")`).parent().remove();

    // Inject into the form
    const scrollable = $html.find(".standard-form.scrollable");
    if (scrollable.length) {
        scrollable.append(content);
    } else {
        $html.append(content);
    }

    // Texture File Picker
    $html.find(`button.file-picker[data-target="flags.${MODULE_ID}.texture"]`).off("click").on("click", (event) => {
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

    // Handle form submission to generate the vertices3D array
    let $form = $html.closest('form');
    $form.off('submit.paperbox3d').on('submit.paperbox3d', async function (event) {
        const isCurrently3D = $html.find(`input[name="flags.${MODULE_ID}.is3D"]`).is(':checked');
        if (!isCurrently3D) return;

        // Current Foundry wall coordinates
        const x1 = doc.c[0];
        const y1 = doc.c[1];
        const x2 = doc.c[2];
        const y2 = doc.c[3];
        
        const height = Number($html.find(`input[name="flags.${MODULE_ID}.height"]`).val() || 100);

        // Logic: Only generate new vertices if they don't exist 
        // OR if you want the config window to always reset to the wall line.
        // For "Free Stretching", you'd usually keep the existing vertices3D.
        const existingVertices = getFlag("vertices");
        
        if (!existingVertices) {
            const vertices = [
                { x: x1, y: y1, z: height }, // V0: Top Start
                { x: x2, y: y2, z: height }, // V1: Top End
                { x: x2, y: y2, z: 0 },      // V2: Bottom End
                { x: x1, y: y1, z: 0 }       // V3: Bottom Start
            ];
            
            // Note: Use setFlag directly on the document
            await doc.setFlag(MODULE_ID, "vertices", vertices);
        }
    });
});