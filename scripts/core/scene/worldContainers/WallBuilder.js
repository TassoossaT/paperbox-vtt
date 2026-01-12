import { Wall3D } from "./Wall3D.js";
import { Door3D } from "./Door3D.js";

export class WallBuilder {
    constructor(paperbox, container) {
        this.paperbox = paperbox;
        this.container = container;
        
        // Armazena as instâncias de objetos (Wall3D ou Door3D)
        this.elements = new Map(); // Map<ID, Wall3D|Door3D>
    }

    init() {
        // Hooks do Foundry
        Hooks.on("createWall", this._onUpdate.bind(this));
        Hooks.on("updateWall", this._onUpdate.bind(this));
        Hooks.on("deleteWall", this._onDelete.bind(this));
        
        // Sincronização inicial
        this.syncAll();
    }

    /**
     * Decide qual classe instanciar baseada no documento do Foundry
     */
    _factory(wallDoc) {
        const isDoor = wallDoc.door > 0;
        if (isDoor) {
            console.log(`[WallBuilder] Criando Door3D para doc:`, wallDoc.id, wallDoc);
            return new Door3D(wallDoc, this.paperbox, this.container);
        } else {
            console.log(`[WallBuilder] Criando Wall3D para doc:`, wallDoc.id, wallDoc);
            return new Wall3D(wallDoc, this.paperbox, this.container);
        }
    }

    syncAll() {
        this.clearAll();
        if (!canvas.walls) return;

        for (let wall of canvas.walls.placeables) {
            this._onUpdate(wall.document);
        }
    }

    /**
     * Atualiza ou cria Wall3D/Door3D, repassando mudanças de estado (ex: ds) para portas animadas
     * @param {object} doc - Documento da parede
     * @param {object} [changes] - Mudanças do Foundry (ex: {ds: 1})
     */
    _onUpdate(doc, changes = undefined) {
        const existing = this.elements.get(doc.id);

        // Se o tipo mudou (ex: parede virou porta), precisamos destruir e recriar
        const isDoor = doc.door > 0;
        const typeChanged = existing && ((isDoor && existing.type === "wall") || (!isDoor && existing.type === "door"));

        if (typeChanged) {
            console.log(`[WallBuilder] Tipo mudou para doc:`, doc.id, `| Novo tipo:`, isDoor ? 'door' : 'wall', doc);
            this._onDelete(doc);
        }

        if (this.elements.has(doc.id)) {
            const el = this.elements.get(doc.id);
            // Se for Door3D e houver mudanças, repassa para onUpdate
            if (el.type === "door" && typeof el.onUpdate === "function" && changes && typeof changes === "object") {
                el.onUpdate(changes);
            } else {
                el.rebuild();
            }
        } else {
            // Se não existe, cria usando a fábrica
            const newElement = this._factory(doc);
            this.elements.set(doc.id, newElement);
        }
    }

    _onDelete(doc) {
        const element = this.elements.get(doc.id);
        if (element) {
            console.log(`[WallBuilder] Destruindo elemento`, element.type, '| doc:', doc.id, element);
            element.destroy();
            this.elements.delete(doc.id);
        }
    }

    clearAll() {
        for (let el of this.elements.values()) el.destroy();
        this.elements.clear();
    }
}