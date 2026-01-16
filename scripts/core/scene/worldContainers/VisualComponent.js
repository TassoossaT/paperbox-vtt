import { MODULE_ID } from "../../../utils/constants.js";
import { projectPoint, rotatePoint3D, getProjectionVector } from "../../../utils/math.js";
import { ObjData } from "./ObjData.js";

// ==========================================
// 2. O RENDERIZADOR (VisualComponent.js)
// ==========================================
export class VisualComponent {
    constructor(objectId, container, orchestrator, parent = null) {
        this.objectId = objectId;
        this.container = container;
        this.parent = parent;
        this.orchestrator = orchestrator;
        
        // [INTEGRAÇÃO] O cérebro dos dados
        this.data = new ObjData(); 
        
        // [INTEGRAÇÃO] Array paralelo para guardar os sprites/meshes do PIXI
        this.pixiMeshes = []; 

        this.isReady = false;
        this._dirty = false;
        this.customHandles = [];

        if (this.orchestrator?.registerComponent) {
            this.orchestrator.registerComponent(this);
        }

        // Ticker
        this._tickerFunction = this._tickerUpdate.bind(this);
        if (canvas?.app?.ticker) {
            canvas.app.ticker.add(this._tickerFunction);
        }
        
        // Rastreamento
        this._lastParentX = parent?.doc?.object?.x || 0;
        this._lastParentY = parent?.doc?.object?.y || 0;
        this._lastElevation = parent?.doc?.elevation || 0; // Monitora elevação também
    }

    _tickerUpdate() {
        if (!this.isReady || !this.parent?.doc?.object) return;

        const obj = this.parent.doc.object;
        const doc = this.parent.doc;

        // ============================================================
        // CORREÇÃO DO FANTASMA 2D
        // ============================================================
        // Forçamos a invisibilidade a cada frame para vencer o refresh do Foundry
        if (obj.mesh) {
            obj.mesh.visible = false;
            obj.mesh.alpha = 0; // Garantia extra
        } 
        if (obj.tile) { // Fallback para versões antigas ou compatibilidade
            obj.tile.visible = false; 
            obj.tile.alpha = 0;
        }
        // ============================================================

        // Verifica movimento ou mudança de elevação do PAI (Foundry)
        if (obj.x !== this._lastParentX || obj.y !== this._lastParentY || doc.elevation !== this._lastElevation) {
            this._lastParentX = obj.x;
            this._lastParentY = obj.y;
            this._lastElevation = doc.elevation;
            this._dirty = true;
        }

        const currentState = this.parent?.paperbox?.state;
        
        if (this._dirty || (currentState && this._hasCameraChanged(currentState))) {
            this.update(currentState);
            this._dirty = false;
        }
    }

    _hasCameraChanged(newState) {
        const sig = `${newState.tilt.toFixed(4)}-${newState.rotation.toFixed(4)}`;
        if (this._lastCameraSig !== sig) {
            this._lastCameraSig = sig;
            return true;
        }
        return false;
    }

    /**
     * [INTEGRAÇÃO] Constrói a cena baseada na classe ObjData
     */
    async buildFromGeometry(inputData) {
        this.isReady = false;
        this.clearSprites();

        // Aceita JSON cru ou instância de ObjData
        this.data = inputData instanceof ObjData ? inputData : new ObjData(inputData);

        for (let i = 0; i < this.data.faces.length; i++) {
            const face = this.data.faces[i];
            
            // Carrega textura (usa a da face ou o fallback do material global)
            const texPath = face.texture || this.data.material.texturePath;
            const tex = await this._loadTexture(texPath);

            // Índices e UVs
            let indices = face.indices;
            if (!indices || indices.length === 0) {
                indices = [];
                for (let k = 1; k < face.vertices.length - 1; k++) indices.push(0, k, k + 1);
            }
            
            let uvs = face.uvs;
            if (!uvs || uvs.length === 0) {
                // UVs padrão simples
                uvs = face.vertices.flatMap((_, idx) => [idx % 2, Math.floor(idx/2) % 2]); 
            }

            const geometry = new PIXI.MeshGeometry(
                new Float32Array(face.vertices.flatMap(v => [v.x, v.y])), // Placeholder, será atualizado no update
                new Float32Array(uvs.flat()),
                new Uint16Array(indices)
            );

            const material = new PIXI.MeshMaterial(tex);
            // Aplica cor global se não tiver textura, ou tint
            if (!texPath) material.tint = this.data.material.color;

            const mesh = new PIXI.Mesh(geometry, material);
            
            // Configurações extras de material
            mesh.alpha = this.data.material.alpha;

            this.container.addChild(mesh);
            this.pixiMeshes[i] = mesh; // Guarda referência 1:1
        }
        
        this.isReady = true;
        this._dirty = true; // Força primeiro render
    }

    /**
     * [INTEGRAÇÃO] O Loop de Renderização Principal
     */
    update(cameraState = { tilt: 0, rotation: 0 }) {
        if (!this.isReady) return;
        
        const { tilt, rotation } = cameraState;
        const parentObj = this.parent.doc.object;
        
        // Calculate Unit to Pixel ratio
        const dims = canvas.dimensions;
        const pixelPerUnit = dims ? (dims.size / dims.distance) : 1;

        let allProjectedPoints = [];

        // 1. Project all vertices
        for (let i = 0; i < this.data.faces.length; i++) {
            const face = this.data.faces[i];
            const mesh = this.pixiMeshes[i];

            if (!mesh) continue;

            const projectedPoints = [];

            for (const vertex of face.vertices) {
                // Compute absolute world position (including elevation)
                const worldPos = this.data.computeWorldPosition(parentObj, vertex, pixelPerUnit);

                // Project to 2D Screen Space
                const projected = projectPoint(worldPos.x, worldPos.y, worldPos.z, tilt, rotation);
                projectedPoints.push(projected);
            }

            // Update PIXI Geometry
            const buffer = mesh.geometry.getBuffer('aVertexPosition');
            if (buffer) {
                const data = buffer.data;
                for (let k = 0; k < projectedPoints.length; k++) {
                    data[k * 2] = projectedPoints[k].x;
                    data[k * 2 + 1] = projectedPoints[k].y;
                }
                buffer.update();
            }
            mesh.hitArea = new PIXI.Polygon(projectedPoints.map(p => new PIXI.Point(p.x, p.y)));
            mesh.eventMode = 'static';
            mesh.alpha = this.data.material.alpha;

            // Collect points for the HitArea calculation
            allProjectedPoints = allProjectedPoints.concat(projectedPoints);
        }

        // 2. Update HitArea and Selection Frame
        if (parentObj && allProjectedPoints.length >= 3) {
            
            // [CRITICAL] Convert Global Screen Coordinates -> Local Parent Coordinates
            // The HitArea must be relative to the Tile's (x, y).
            const localFramePoints = allProjectedPoints.map(p => ({
                x: p.x - parentObj.x,
                y: p.y - parentObj.y
            }));

            // [FIX] Create a Polygon HitArea. 
            // Foundry will use this polygon to draw the Orange Selection Border.
            // This ensures the "Frame" follows your 3D shape, not the floor rect.
            // parentObj.hitArea = new PIXI.Polygon(localFramePoints.flatMap(pt => [pt.x, pt.y]));
            parentObj.hitArea = null;
            if (parentObj.controlled) {
                if (this.customHandles.length === 0) this._createCustomFrameHandles(parentObj, localFramePoints);
                else this._syncFrameHandles(parentObj, localFramePoints);
            } else {
                this.customHandles.forEach(h => h.visible = false);
            }
            
            // Desenha a borda visual (laranja) sem afetar o clique
            if (parentObj.frame) {
                this._applyUniversalFrameTransform(parentObj, localFramePoints);
            }
        }
    }

    _createCustomFrameHandles(obj, localPoints) {
        // Destrói anteriores
        this.customHandles.forEach(h => h.destroy());
        this.customHandles = [];

        const faceIndex = 0;
        const gridManager = game.paperbox?.gridManager;
        const targetFace = this.data.faces[faceIndex];
        
        if (!targetFace) return;

        targetFace.vertices.forEach((vertex, i) => {
            if (!localPoints[i]) return;

            const handle = this._buildHandleGraphic();
            handle.vertexIndex = i;
            
            handle.position.set(localPoints[i].x, localPoints[i].y);
            
            // 2. Interatividade explícita na Handle
            handle.eventMode = 'static'; 
            handle.cursor = 'pointer';
            // --- Lógica de Drag (Mantida quase igual, mas ajustada) ---
            let dragData = null;

            const onDragMove = (e) => {
                if (!dragData || !gridManager) return;
                
                // ... (Lógica de matemática inversa mantida igual) ...
                // Apenas certifique-se de que a lógica interna usa as coordenadas corretas
                // O código original de onDragMove já usava gridManager.screenToWorld,
                // então ele deve continuar funcionando bem.

                // ... [CÓDIGO DE CÁLCULO INVERSO EXISTENTE] ...
                
                 // 1. Pega onde o mouse está na TELA e converte para MUNDO
                const global = dragData.global;
                const world = gridManager.screenToWorld(global);
                const state = this.parent.paperbox.state;

                const currentZ = vertex.z + this.data.transform.z; 
                const { x: dx, y: dy } = getProjectionVector(currentZ, state.tilt, state.rotation);
                
                const targetWorldX = world.x - dx;
                const targetWorldY = world.y - dy;

                const t = this.data.transform;
                const parent = this.parent.doc.object;

                let localX = targetWorldX - parent.x - t.x;
                let localY = targetWorldY - parent.y - t.y;

                if (t.rotation.z !== 0) {
                    const cos = Math.cos(-t.rotation.z);
                    const sin = Math.sin(-t.rotation.z);
                    const rx = localX * cos - localY * sin;
                    const ry = localX * sin + localY * cos;
                    localX = rx;
                    localY = ry;
                }

                localX = localX / t.scale.x;
                localY = localY / t.scale.y;

                this.data.setVertex(faceIndex, i, { x: localX, y: localY });
                this._dirty = true;
                this._tickerUpdate(); 
            };

            const onDragEnd = () => {
                if (!dragData) return;
                dragData = null;
                handle.alpha = 1;
                canvas.app.stage.off("pointermove", onDragMove);
                canvas.app.stage.off("pointerup", onDragEnd);
                canvas.app.stage.off("pointerupoutside", onDragEnd);

                if (this.parent?.doc) {
                    this.parent.doc.update({
                        [`flags.${MODULE_ID}.data`]: this.data.toJSON()
                    });
                }
            };

            handle.on("pointerdown", (e) => {
                e.stopPropagation(); // Importante: Impede que o clique selecione o Tile embaixo
                dragData = e.data;
                handle.alpha = 0.5;
                canvas.app.stage.on("pointermove", onDragMove);
                canvas.app.stage.on("pointerup", onDragEnd);
                canvas.app.stage.on("pointerupoutside", onDragEnd);
            });

            obj.frame.addChild(handle);
            this.customHandles.push(handle);
        });
    }

    _buildHandleGraphic() {
        const h = new PIXI.Graphics();
        // Valores de configuração do handle
        h.handleRadius = 6; // Raio visual do handle
        h.hitAreaRadius = 10; // Raio da hitArea
        h.expandedScale = h.hitAreaRadius / h.handleRadius; // Scale para igualar ao hitArea

        const orangeColor = 0xFF9829; // A mesma cor da linha
        const blackColor = 0x000000;

        // Desenha o handle padrão
        h.lineStyle(1, blackColor, 1);
        h.beginFill(orangeColor, 1);
        h.drawCircle(0, 0, h.handleRadius);
        h.endFill();

        // Área de clique maior (invisível) para facilitar o uso
        h.hitArea = new PIXI.Circle(0, 0, h.hitAreaRadius);

        h.interactive = true;
        h.cursor = "pointer";
        h.eventMode = 'static';

        // Efeito de expansão usando scale calculado
        h.on("pointerover", () => {
            h.scale.set(h.expandedScale);
        });
        h.on("pointerout", () => {
            h.scale.set(1);
        });
        return h;
    }

    _syncFrameHandles(obj, localPoints) {
        // Se o objeto não tem frame ou não está "controlado" (selecionado), escondemos as handles
        // Nota: obj.frame geralmente só existe/é visível quando selecionado ou hover
        const isSelected = obj.controlled || (obj.frame && obj.frame.visible);

        if (obj.frame && obj.frame.handle) obj.frame.handle.visible = false;
        if (obj.frame && obj.frame.handles) Object.values(obj.frame.handles).forEach(h => h.visible = false);

        this.customHandles.forEach((h, i) => {
            if (localPoints[i] && isSelected) {
                // Atualiza para posição GLOBAL
                h.position.set(localPoints[i].x, localPoints[i].y); // CORRETO                
                h.visible = true;
            } else {
                h.visible = false;
            }
        });
    }
    
    _applyUniversalFrameTransform(obj, localPoints) {
        if (!obj.frame) return;
        
        // Create a dedicated graphics container if not exists
        if (!this._borderGraphics || this._borderGraphics.destroyed) {
            this._borderGraphics = new PIXI.Graphics();
            // Add at index 0 to be behind the resize handles
            obj.frame.addChildAt(this._borderGraphics, 0);
        }
        
        const border = this._borderGraphics;
        border.clear();
        
        // Style: Orange/Gold standard Foundry selection color
        border.lineStyle(2, 0xFF9829, 1); 
        // Optional: Add a faint fill to make the "footprint" visible
        border.beginFill(0xFF9829, 0.05); 
        
        if (localPoints.length > 0) {
            border.moveTo(localPoints[0].x, localPoints[0].y);
            for (let i = 1; i < localPoints.length; i++) {
                border.lineTo(localPoints[i].x, localPoints[i].y);
            }
            border.closePath();
        }
        border.endFill();
        
        // Sync custom handles positions
        if (this.customHandles.length === 0 && localPoints.length > 0) {
            this._createCustomFrameHandles(obj, localPoints);
        }
        
        this._syncFrameHandles(obj, localPoints);
    }

    async _loadTexture(input) {
        if (!input) return PIXI.Texture.WHITE;
        
        try {
            // Tentativa 1: Método moderno do PIXI (V12+)
            return await PIXI.Assets.load(input);
        } catch (e) {
            // Tentativa 2: Fallback para o método do Foundry (V10/V11)
            // Se PIXI.Assets falhar, usamos o texture loader do Foundry
            const texture = await new Promise((resolve, reject) => {
                // Verifica onde a função existe na versão atual do Foundry
                const loader = foundry.utils?.loadTexture || canvas.app?.renderer?.generateTexture;
                if (loader) {
                    loader(input).then(resolve).catch(reject);
                } else {
                    // Último recurso: Texture.from
                    resolve(PIXI.Texture.from(input));
                }
            });
            return texture;
        }
    }

    clearSprites() {
        this.pixiMeshes.forEach(m => m.destroy({ children: true }));
        this.pixiMeshes = [];
        this.customHandles.forEach(h => h.destroy());
        this.customHandles = [];
        if (this._borderGraphics) {
            this._borderGraphics.destroy();
            this._borderGraphics = null;
        }
    }

    destroy() {
        if (canvas?.app?.ticker && this._tickerFunction) {
            canvas.app.ticker.remove(this._tickerFunction);
        }
        this.clearSprites();
    }
}