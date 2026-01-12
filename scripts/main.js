/**
 * PaperBox VTT - Main Entry Point
 * Author: Tasso ossaT
 */


import { MODULE_ID } from "./utils/constants.js";
import { PaperBox } from "./core/PaperBox.js";
import { registerPatches } from "./core/patcher.js";
import { getWall3DConfigHTML } from "./utils/dom.js";

// Instância Global (Singleton)
let paperbox;

Hooks.once('init', () => {
    registerPatches();

    // 1. Registrar Configurações
    game.settings.register(MODULE_ID, "enabled", {
        name: "Ativar Modo 2.5D",
        hint: "Ativa a visualização isométrica/perspectiva.",
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

    // Settings for HUD Position
    game.settings.register(MODULE_ID, "hudPosTilt", {
        scope: "client", config: false, type: Object, default: { top: "20%", right: "20px" }
    });
    game.settings.register(MODULE_ID, "hudPosRot", {
        scope: "client", config: false, type: Object, default: { bottom: "20px", left: "50%" }
    });

    // 2. Instanciar Core
    paperbox = new PaperBox();
    
    // Expor API globalmente para macros/outros módulos
    game.paperbox = paperbox;
});

Hooks.on('ready', () => {
    paperbox.initialize();
});

// --- PaperBox 3D: Opções extras no formulário de parede ---
Hooks.on("renderWallConfig", (app, html, data) => {

    // Obtém o documento da parede de forma robusta
    const doc = app?.document || app?.object?.document || app?.object;
    if (!doc) return;

    // Utilitário para ler flags de forma segura
    function getFlag(key, field, fallback = undefined) {
        try {
            if (typeof doc.getFlag === "function") return doc.getFlag(key, field) ?? fallback;
            return doc.flags?.[key]?.[field] ?? fallback;
        } catch (e) { return fallback; }
    }


    const is3D = !!getFlag(MODULE_ID, "is3D", false);
    const texture = getFlag(MODULE_ID, "texture", "");
    const height = getFlag(MODULE_ID, "height", 100);
    const renderMode = getFlag(MODULE_ID, "renderMode", "tile");

    // Usa utilitário para montar o HTML padronizado
    const content = getWall3DConfigHTML({
        label: "Enable 3D Wall",
        is3D,
        texture,
        height,
        renderMode,
        moduleId: MODULE_ID
    });

  // Garante que $html é um objeto jQuery
    let $html = html instanceof jQuery ? html : $(html);

  // Evita duplicidade: remove bloco antigo se já existir
    $html.find('fieldset legend:contains("PaperBox 3D")').parent().remove();

  // Insere o bloco no final do formulário scrollável, ou no final do formulário
    const scrollable = $html.find(".standard-form.scrollable");
    if (scrollable.length) {
    scrollable.append(content);
    } else {
        $html.append(content);
    }

  // Ativa o file picker para textura
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

  // Ajusta altura do app se possível
    if (typeof app.setPosition === "function") app.setPosition({ height: "auto" });
});
// --- Fim PaperBox 3D ---
