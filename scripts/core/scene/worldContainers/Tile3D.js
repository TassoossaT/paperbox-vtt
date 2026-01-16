import { MODULE_ID } from "../../../utils/constants.js";
import { VisualComponent } from "./VisualComponent.js";
import { ObjData } from "./ObjData.js";

/**
 * Controller class that manages the 3D representation of a Tile.
 * It bridges the Foundry TileDocument with our internal ObjData structure.
 */
export class Tile3D {
    constructor(tileDoc, paperbox, container) {
        this.doc = tileDoc;
        this.paperbox = paperbox;
        this.container = container;
        this.type = "tile";
        this.visuals = []; 
        this._hookId = null; // Para guardar o ID do evento
        this.init();
    }

    init() {
        this.rebuild();
    }

    /**
     * Creates a VisualComponent from a data instance.
     * @param {ObjData|Object} inputData - The data to build the visual from.
     */
    async createVisualFromGeometry(inputData) {
        const vc = new VisualComponent(this.doc.id, this.container, this.paperbox.orchestrator, this);
        await vc.buildFromGeometry(inputData);
        this.visuals.push(vc);
        return vc;
    }

    /**
     * Rebuilds the 3D object.
     * Called on init and whenever the tile updates (moves, rotates, changes texture).
     */
    async rebuild() {
        // 1. Cleanup old visuals
        this.clearVisuals();
        
        // 2. Check if this tile should be 3D
        if (!this.doc.getFlag(MODULE_ID, "is3D")) return;

        this._hideOriginalTile(true);
        const texturePath = this.doc.texture?.src;
        if (!texturePath) return;

        // 3. Load Data Strategy
        const savedData = this.doc.getFlag(MODULE_ID, "data");
        let objData;

        if (savedData) {
            // === PATH A: LOAD SAVED GEOMETRY ===
            // The user has edited vertices before. Load that shape.
            objData = new ObjData(savedData);

            // [CRITICAL FIX] Update the Transform to match the CURRENT Foundry State.
            // We keep the saved 'faces' (the custom shape), but we must update 
            // the rotation and position because the user might have moved the tile.
            objData.transform.x = this.doc.width / 2;
            objData.transform.y = this.doc.height / 2;
            
            // Sync rotation from Foundry Doc to our Data
            // We overwrite whatever was saved in 'rotation' with the current live value.
            objData.transform.rotation = { z: Math.toRadians(this.doc.rotation) };

            // Sync Texture (in case user changed image but kept the mesh)
            if (objData.material.texturePath !== texturePath) {
                    objData.material.texturePath = texturePath;
                    objData.faces.forEach(f => f.texture = texturePath);
            }

        } else {
            // === PATH B: CREATE DEFAULT GEOMETRY ===
            // First time this tile is becoming 3D.
            objData = new ObjData({
                id: this.doc.id,
                type: 'tile'
            });

            // Set Initial Transform (Centered pivot)
            objData.transform = {
                x: this.doc.width / 2,
                y: this.doc.height / 2,
                z: 0, 
                rotation: { z: Math.toRadians(this.doc.rotation) },
                scale: { x: 1, y: 1, z: 1 }
            };

            // Set Material
            objData.material = {
                texturePath: texturePath,
                alpha: this.doc.hidden ? 0.5 : (this.doc.alpha ?? 1),
                color: this.doc.tint || 0xFFFFFF,
                doubleSided: true
            };

            // Calculate initial flat square based on elevation flags
            const localVertices = this._getLocalVerticesWithElevation();

            objData.faces = [{
                vertices: localVertices,
                uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], // Standard Quad UVs
                indices: [0, 1, 2, 0, 2, 3],           // Two triangles
                texture: texturePath
            }];
        }

        // 4. Build the Visuals
        await this.createVisualFromGeometry(objData);
    }

    /**
     * Watch for updates in the Foundry Document.
     */
    onUpdate(changes) {
        // List of properties that require a full rebuild
        const structural = [
            "width", "height", "rotation", "texture", "flags", "alpha", "hidden"
        ];
        
        // Note: We removed "x" and "y" from structural rebuilds!
        // Why? Because VisualComponent tracks X/Y in its ticker. 
        // Rebuilding on X/Y change is expensive and unnecessary unless dimensions change.
        
        const flagChange = changes.flags?.[MODULE_ID];
        const hasStructural = structural.some(k => foundry.utils.hasProperty(changes, k)) || flagChange;
        
        if (hasStructural) {
            this.rebuild();
        }
    }

    /**
     * Generates local vertices (relative to center 0,0) based on corner elevations.
     */
    _getLocalVerticesWithElevation() {
        const width = this.doc.width;
        const height = this.doc.height;
        
        // Retrieve elevation flags (default 0)
        const el = {
            tl: this.doc.getFlag(MODULE_ID, "elevationTL") || 0,
            tr: this.doc.getFlag(MODULE_ID, "elevationTR") || 0,
            bl: this.doc.getFlag(MODULE_ID, "elevationBL") || 0,
            br: this.doc.getFlag(MODULE_ID, "elevationBR") || 0
        };

        const hw = width / 2;
        const hh = height / 2;

        // Return array of {x, y, z}
        // These are LOCAL coordinates. 0,0 is the center of the tile.
        return [
            { x: -hw, y: -hh, z: el.tl }, // Top-Left
            { x:  hw, y: -hh, z: el.tr }, // Top-Right
            { x:  hw, y:  hh, z: el.br }, // Bottom-Right
            { x: -hw, y:  hh, z: el.bl }  // Bottom-Left
        ];
    }

    /**
     * Hides the original 2D rendering of the tile to avoid "ghosting".
     */
    // No arquivo Tile3D.js

    // Tile3D.js

    _hideOriginalTile(hide) {
        const tileObj = this.doc.object;
        if (!tileObj) return;

        if (hide) {
            // Esconde mesh 2D
            if (tileObj.mesh) tileObj.mesh.visible = false;

            // Registra Hook
            if (!this._hookId) {
                this._hookId = Hooks.on("refreshTile", (tile) => {
                    if (tile.id !== this.doc.id) return;

                    // 1. Esconde a imagem 2D
                    if (tile.mesh) {
                        tile.mesh.visible = false;
                        tile.mesh.alpha = 0;
                    }

                    // 2. Manipula o Frame (Borda + Sombra + Handles)
                    if (tile.frame) {
                        this._drawShadowFrame(tile);

                        // === AQUI ESTÁ A SOLUÇÃO DA BOLINHA ===
                        
                        // Esconde a bolinha de rotação
                        if (tile.frame.handle) {
                            tile.frame.handle.visible = false; 
                            // Dica: Se quiser MOVER ela em vez de esconder:
                            // tile.frame.handle.position.set(novoX, novoY);
                        }

                        // (Opcional) Esconde os quadrados de redimensionamento (Resize Handles)
                        // Se você não esconder isso, eles vão ficar flutuando no quadrado original
                        if (tile.frame.handles) {
                            // handles é um objeto {tl, tr, bl, br...}
                            Object.values(tile.frame.handles).forEach(h => h.visible = false);
                        }
                    }
                });
            }
            
            tileObj.refresh();

        } else {
            // RESTAURAR TUDO
            if (this._hookId) {
                Hooks.off("refreshTile", this._hookId);
                this._hookId = null;
            }

            if (tileObj.mesh) {
                tileObj.mesh.visible = true;
                tileObj.mesh.alpha = this.doc.alpha ?? 1;
            }
            
            // Restaura a bolinha e handles originais
            if (tileObj.frame) {
                // O refresh nativo do Foundry vai recriar/reexibir os handles automaticamente
                // Mas por segurança podemos limpar nossa sujeira:
                if (tileObj.frame.border) tileObj.frame.border.clear(); 
                tileObj.refresh(); 
            }
        }
    }

    /**
     * Desenha a forma do objeto como uma sombra no chão (HitArea)
     */
    _drawShadowFrame(tile) {
        // 1. Tenta pegar os vértices editados do VisualComponent
        // Se não tiver (ainda carregando), pega os padrões do Tile3D
        const visual = this.visuals[0];
        let vertices = [];
        let scale = { x: 1, y: 1 };

        if (visual && visual.data && visual.data.faces[0]) {
            // Pega a geometria REAL que você editou/moveu
            vertices = visual.data.faces[0].vertices;
            scale = visual.data.transform.scale;
        } else {
            // Fallback: Quadrado padrão
            vertices = this._getLocalVerticesWithElevation();
        }

        const w = this.doc.width;
        const h = this.doc.height;

        // 2. Converte coordenadas:
        // De: Local Centralizado (ObjData: 0,0 é o centro)
        // Para: Local do Tile (Frame: 0,0 é o Top-Left)
        // Nota: Não aplicamos rotação aqui porque o container 'tile' JÁ ESTÁ rotacionado pelo Foundry.
        const framePoints = vertices.map(v => ({
            x: (v.x * scale.x) + (w / 2),
            y: (v.y * scale.y) + (h / 2)
        }));

        // Cria array plano [x, y, x, y...] para o PIXI
        const polyPoints = framePoints.flatMap(p => [p.x, p.y]);

        // 3. Desenha no Frame (Borda + Sombra)
        const g = tile.frame.border || tile.frame; // Compatibilidade V11/V12
        g.clear();

        
        // Estilo da Borda (Laranja padrão do Foundry ou outra cor)
        g.lineStyle(2, 0xFF9829, 1);
        
        g.drawPolygon(polyPoints);
        g.endFill();
    }

    clearVisuals() {
        this.visuals.forEach(v => v.destroy());
        this.visuals = [];
        this._hideOriginalTile(false);
    }

    destroy() {
        this._hideOriginalTile(false); // Isso já desliga o Hook
        this.clearVisuals();
    }
}