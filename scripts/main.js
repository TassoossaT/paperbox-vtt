/**
 * PaperBox VTT - Main Entry Point
 * Author: Tasso Augusto
 */

import { MODULE_ID } from "./utils/constants.js";
import { PaperBox } from "./core/PaperBox.js";
import { registerPatches } from "./patcher.js";

// Instância Global (Singleton)
let paperbox;

Hooks.once('init', () => {
    console.log(`${MODULE_ID} | Bootstrapping...`);

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

    // 2. Instanciar Core
    paperbox = new PaperBox();
    
    // Expor API globalmente para macros/outros módulos
    game.paperbox = paperbox;
});

Hooks.on('ready', () => {
    paperbox.initialize();
});
