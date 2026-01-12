import { MODULE_ID } from "../../../utils/constants.js";
import { VisualComponent } from "./VisualComponent.js";

export class Wall3D {
    constructor(wallDoc, paperbox, container) {
        this.doc = wallDoc;
        this.paperbox = paperbox;
        this.container = container;
        this.type = "wall";
        
        // Inicializamos o array ANTES de qualquer chamada de método
        this.visuals = []; 

        this.init();
    }

    init() {
        this.rebuild();
    }

    /**
     * Helper para criar um componente e registrar na lista
     */
    async createVisual(id, coords, texture, height, side = "single") {
        const vc = new VisualComponent(
            id,
            this.container,
            this.paperbox.orchestrator,
            this
        );
        vc.side = side;
        await vc.buildFromGeometry({ coords, height, texturePath: texture });
        this.visuals.push(vc);
        return vc;
    }

    async rebuild() {
        this.clearVisuals();

        if (!this.doc.getFlag(MODULE_ID, "is3D")) return;

        // Comportamento padrão: Parede simples (Single)
        await this.createVisual(
            this.doc.id,
            this.doc.c,
            this.doc.getFlag(MODULE_ID, "texture"),
            this.doc.getFlag(MODULE_ID, "height") || 100
        );
        
        this.refresh();
    }

    onUpdate(changes) {
        const hasGeometryChange = "c" in changes;
        const hasFlagChange = changes.flags && changes.flags[MODULE_ID];
        const hasAnimationChange = "animation" in changes;

        if (hasGeometryChange || hasFlagChange || hasAnimationChange) {
            this.rebuild();
        }
    }

    refresh() {
        this.visuals.forEach(v => v.update(this.paperbox.state));
    }

    clearVisuals() {
        if (this.visuals) {
            this.visuals.forEach(v => v.destroy());
        }
        this.visuals = [];
    }

    destroy() {
        this.clearVisuals();
    }
}