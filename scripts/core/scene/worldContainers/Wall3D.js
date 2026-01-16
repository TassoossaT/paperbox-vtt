import { MODULE_ID } from "../../../utils/constants.js";
import { VisualComponent } from "./VisualComponent.js";

/**
 * Wall3D - Arbitrary Mesh Component
 * Manages 3D surfaces defined by an array of N-vertices.
 */
export class Wall3D {
    constructor(wallDoc, paperbox, container) {
        this.doc = wallDoc;
        this.paperbox = paperbox;
        this.container = container;
        this.type = "wall";
        this.visuals = []; 

        this.init();
    }

    init() {
        this.rebuild();
    }

    /**
     * Instantiates a VisualComponent to handle the specific mesh rendering.
     */
    async createVisualFromGeometry(geometry) {
        const vc = new VisualComponent(
            this.doc.id,
            this.container,
            this.paperbox.orchestrator,
            this
        );
        await vc.buildFromGeometry(geometry);
        this.visuals.push(vc);
        return vc;
    }

    /**
     * Reconstructs the 3D mesh using the document's vertex data.
     */
    async rebuild() {
        this.clearVisuals();
        
        // Ensure 3D rendering is enabled
        if (!this.doc.getFlag(MODULE_ID, "is3D")) return;

        // Retrieve the vertex array from the concatenated flag
        // Expected structure: [{x: number, y: number, z: number}, ...]
        const vertices = this.doc.getFlag(MODULE_ID, "vertices");

        // STRICT VALIDATION: Error if data is missing or insufficient (less than a triangle)
        if (!Array.isArray(vertices) || vertices.length < 3) {
            console.error(
                `[Wall3D] Critical error on doc ${this.doc.id}: ` +
                `The 'vertices' flag is missing or contains insufficient data. ` +
                `A minimum of 3 points is required for rendering.`, 
                vertices
            );
            return; 
        }

        const texturePath = this.doc.getFlag(MODULE_ID, "texture");
        const storedUVs = this.doc.getFlag(MODULE_ID, "uvs");

        // Map mesh data for the VisualComponent
        const geometryData = [{
            texture: texturePath,
            vertices: vertices,
            // Uses stored UVs or falls back to basic procedural mapping
            uvs: Array.isArray(storedUVs) ? storedUVs : this._generateDefaultUVs(vertices.length),
            indices: this._generateFanIndices(vertices.length)
        }];

        await this.createVisualFromGeometry(geometryData);
    }

    /**
     * Dynamic triangulation for N-vertices using a Triangle Fan approach.
     * This connects all vertices into a single solid polygon.
     */
    _generateFanIndices(count) {
        const indices = [];
        for (let i = 1; i < count - 1; i++) {
            indices.push(0, i, i + 1);
        }
        return indices;
    }

    /**
     * Basic procedural UV mapping.
     */
    _generateDefaultUVs(count) {
        return Array.from({ length: count }, (_, i) => [i % 2, Math.floor(i / 2) % 2]);
    }

    /**
     * Handles document updates, specifically monitoring changes to 3D data flags.
     */
    onUpdate(changes) {
        // 1. If the 2D coordinates changed, we need to shift the 3D vertices
        if (changes.c) {
            this._syncMovement(changes.c);
            return; // _syncMovement will call setFlag, which triggers another update
        }

        // 2. If flags or other structural data changed, rebuild the mesh
        const hasFlagChange = changes.flags && (MODULE_ID in changes.flags);
        if (hasFlagChange) {
            this.rebuild();
        }
    }

    /**
     * Atualiza a flag 'vertices' dinamicamente ao mover a parede 2D.
     * Aplica translação para todos os vértices originais, mantendo N-vértices.
     * @param {Array} c - Novo array de coordenadas 2D [x1, y1, x2, y2]
     */
    _syncMovement(c) {
        // Recupera os vértices originais
        const oldVertices = this.doc.getFlag(MODULE_ID, "vertices");
        if (!Array.isArray(oldVertices) || oldVertices.length < 3) return;

        // Atualiza cada vértice conforme c, mantendo z
        // c: [x1, y1, x2, y2, x3, y3, ...]
        const newVertices = oldVertices.map((v, i) => ({
            x: c[i * 2] !== undefined ? c[i * 2] : v.x,
            y: c[i * 2 + 1] !== undefined ? c[i * 2 + 1] : v.y,
            z: v.z
        }));

        // Atualiza a flag 'vertices' no documento
        this.doc.setFlag(MODULE_ID, "vertices", newVertices);
    }

    /**
     * Disposes of existing visual components.
     */
    clearVisuals() {
        this.visuals.forEach(v => v && v.destroy());
        this.visuals = [];
    }

    destroy() {
        this.clearVisuals();
    }
}