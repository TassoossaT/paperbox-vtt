// ==========================================
// 1. O MODELO DE DADOS (VisualComponentData.js)
// ==========================================
export class ObjData {
    #id;
    #type;
    #faces;
    #transform;
    #material;
    #behaviors;

    constructor(data = {}) {
        this.#id = data.id || foundry.utils.randomID();
        this.type = data.type || 'mesh';
        
        // Inicializa via setters
        this.faces = data.faces;
        this.transform = data.transform;
        this.material = data.material;
        this.behaviors = data.behaviors;
    }

    // --- GEOMETRIA ---
    get faces() { return this.#faces; }
    set faces(input) {
        if (!Array.isArray(input)) { this.#faces = []; return; }
        this.#faces = input.map(face => ({
            id: face.id || foundry.utils.randomID(),
            vertices: Array.isArray(face.vertices) ? face.vertices.map(v => ({
                x: Number(v.x) || 0, y: Number(v.y) || 0, z: Number(v.z) || 0,
                nx: v.nx ?? 0, ny: v.ny ?? 0, nz: v.nz ?? 1
            })) : [],
            indices: Array.isArray(face.indices) ? [...face.indices] : [],
            uvs: Array.isArray(face.uvs) ? [...face.uvs] : [],
            texture: typeof face.texture === 'string' ? face.texture : null
        }));
    }

    setVertex(faceIndex, vertexIndex, { x, y, z }) {
        const face = this.#faces[faceIndex];
        if (!face || !face.vertices[vertexIndex]) return false;
        const v = face.vertices[vertexIndex];
        if (x !== undefined) v.x = x;
        if (y !== undefined) v.y = y;
        if (z !== undefined) v.z = z;
        return true;
    }

    // --- TRANSFORM (Posição Local + Lógica de Voo) ---
    get transform() { return this.#transform; }
    set transform(val) {
        const t = val || {};
        this.#transform = {
            x: Number(t.x) || 0,
            y: Number(t.y) || 0,
            z: Number(t.z) || 0, // Offset visual (flutuar)
            rotation: { 
                x: Number(t.rotation?.x) || 0, 
                y: Number(t.rotation?.y) || 0, 
                z: Number(t.rotation?.z) || 0 
            },
            scale: { 
                x: Number(t.scale?.x) ?? 1, 
                y: Number(t.scale?.y) ?? 1, 
                z: Number(t.scale?.z) ?? 1 
            },
            pivot: { 
                x: Number(t.pivot?.x) ?? 0.5, 
                y: Number(t.pivot?.y) ?? 0.5, 
                z: Number(t.pivot?.z) ?? 0 
            }
        };
    }

    // --- MATERIAL & BEHAVIORS ---
    get material() { return this.#material; }
    set material(val) {
        const m = val || {};
        this.#material = {
            shader: m.shader || 'standard',
            texturePath: m.texturePath || null,
            color: m.color ?? 0xFFFFFF,
            alpha: m.alpha ?? 1.0,
            doubleSided: !!m.doubleSided
        };
    }

    get behaviors() { return this.#behaviors; }
    set behaviors(val) { this.#behaviors = { ...val }; }

    get type() { return this.#type; }
    set type(val) { this.#type = val; }

    // --- O CÁLCULO MÁGICO ---
    /**
     * Calcula a posição absoluta no mundo somando:
     * Posição do Foundry + Elevação do Jogo + Ajustes do Transform Local
     */
    computeWorldPosition(parentObj, localVertex, pixelPerUnit = 1) {
        const parentX = parentObj.x || 0;
        const parentY = parentObj.y || 0;
        
        // Pega elevação do token/tile (Regra do Jogo)
        // Se parentObj.document existir (Token), usa elevation. Se for Tile, usa elevation ou zIndex
        const doc = parentObj.document || parentObj; 
        const gameElevation = (doc.elevation || 0) * pixelPerUnit;

        const t = this.#transform;

        // 1. Escala
        let vx = localVertex.x * t.scale.x;
        let vy = localVertex.y * t.scale.y;
        let vz = localVertex.z * t.scale.z;

        // 2. Rotação Local (Z) usando utilitário em uma linha
        if (t.rotation.z !== 0) ({ x: vx, y: vy } = rotatePointAround({ x: vx, y: vy }, { x: 0, y: 0 }, t.rotation.z));

        // 3. Soma Tudo (Posição + Offset + Elevação)
        return {
            x: parentX + vx + t.x,
            y: parentY + vy + t.y,
            z: gameElevation + vz + t.z 
        };
    }

    toJSON() {
        return {
            id: this.#id, 
            type: this.#type, 
            faces: this.#faces,
            transform: this.#transform, 
            material: this.#material, 
            behaviors: this.#behaviors
        };
    }
    
    static fromFlags(flagData) { return new ObjData(flagData); }
}