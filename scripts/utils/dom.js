import { MODULE_ID } from "./constants.js";

/**
 * Gera o HTML do fieldset de configuração 3D para paredes/portas.
 * @param {object} opts - { label, is3D, texture, height, moduleId }
 * @returns {string}
 */
export function getWall3DConfigHTML({ label, is3D, texture, height, renderMode, moduleId }) {
    return `
        <fieldset>
            <legend>PaperBox 3D</legend>
            <div class="form-group">
                <label>${label}</label>
                <input type="checkbox" name="flags.${moduleId}.is3D" ${is3D ? "checked" : ""}>
            </div>
            <div class="form-group">
                <label>Texture</label>
                <div class="form-fields">
                    <button type="button" class="file-picker" data-type="image" data-target="flags.${moduleId}.texture" title="Browse Files" tabindex="-1">
                        <i class="fas fa-file-import fa-fw"></i>
                    </button>
                    <input class="image" type="text" name="flags.${moduleId}.texture" placeholder="path/to/image.png" value="${texture}">
                </div>
            </div>
            <div class="form-group">
                <label>Height (px)</label>
                <input type="number" name="flags.${moduleId}.height" value="${height}">
            </div>
            <div class="form-group">
                <label>Render Mode</label>
                <select name="flags.${moduleId}.renderMode">
                    <option value="tile" ${renderMode === 'tile' ? 'selected' : ''}>🔁 Tile (Repeat)</option>
                    <option value="stretch" ${renderMode === 'stretch' ? 'selected' : ''}>↔️ Stretch (Fit)</option>
                </select>
                <p class="hint">Tile: Repeat texture pattern | Stretch: Fit texture to shape</p>
            </div>
        </fieldset>
    `;
}

/**
 * Gera o HTML do fieldset de configuração 3D para tiles (pisos, telhados, rampas)
 * @param {object} opts - { is3D, elevTL, elevTR, elevBL, elevBR, moduleId }
 * @returns {string}
 */
export function getTile3DConfigHTML({ is3D, elevTL, elevTR, elevBL, elevBR, renderMode, tileX, tileY, moduleId }) {
    return `
        <fieldset>
            <legend>PaperBox 3D - Tile Elevation</legend>
            <div class="form-group">
                <label>Enable 3D Tile</label>
                <input type="checkbox" name="flags.${moduleId}.is3D" ${is3D ? "checked" : ""}>
                <p class="hint">Transform this tile into a 3D surface (floor, roof, ramp)</p>
            </div>
            
            <div class="form-group">
                <label>Render Mode</label>
                <select name="flags.${moduleId}.renderMode">
                    <option value="tile" ${renderMode === 'tile' ? 'selected' : ''}>🔁 Tile (Repeat)</option>
                    <option value="stretch" ${renderMode === 'stretch' ? 'selected' : ''}>↔️ Stretch (Fit)</option>
                </select>
            </div>
            
            <div class="form-group" id="tile-repeat-options" style="${renderMode === 'stretch' ? 'display:none;' : ''}">
                <label>Tile Repeat</label>
                <div style="display: flex; gap: 15px;">
                    <label style="display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" name="flags.${moduleId}.tileX" ${tileX !== false ? 'checked' : ''}>
                        Horizontal (X)
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" name="flags.${moduleId}.tileY" ${tileY !== false ? 'checked' : ''}>
                        Vertical (Y)
                    </label>
                </div>
                <p class="hint">Control texture repeat direction</p>
            </div>
            
            <fieldset style="margin-top: 10px; border: 1px solid #444; padding: 10px;">
                <legend>Corner Elevations (px)</legend>
                <p class="hint" style="margin-bottom: 10px;">
                    Set different elevations for each corner to create ramps and slopes.<br>
                    <strong>TL</strong>=Top-Left, <strong>TR</strong>=Top-Right, <strong>BL</strong>=Bottom-Left, <strong>BR</strong>=Bottom-Right
                </p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group slim">
                        <label>↖️ Top-Left</label>
                        <input type="number" name="flags.${moduleId}.elevationTL" value="${elevTL}" step="1">
                    </div>
                    <div class="form-group slim">
                        <label>↗️ Top-Right</label>
                        <input type="number" name="flags.${moduleId}.elevationTR" value="${elevTR}" step="1">
                    </div>
                    <div class="form-group slim">
                        <label>↙️ Bottom-Left</label>
                        <input type="number" name="flags.${moduleId}.elevationBL" value="${elevBL}" step="1">
                    </div>
                    <div class="form-group slim">
                        <label>↘️ Bottom-Right</label>
                        <input type="number" name="flags.${moduleId}.elevationBR" value="${elevBR}" step="1">
                    </div>
                </div>
                
                <div class="form-group" style="display: flex; gap: 5px;">
                    <button type="button" data-preset="flat" style="flex: 1;">
                        📏 Flat Floor (All 0)
                    </button>
                    <button type="button" data-preset="copy" style="flex: 1;">
                        📋 Copy TL to All
                    </button>
                </div>
            </fieldset>
            
            <p class="hint" style="margin-top: 10px;">
                <strong>Examples:</strong><br>
                • Flat floor: All corners = 0<br>
                • Ramp (left to right): TL=0, TR=100, BL=0, BR=100<br>
                • Pyramid: TL=0, TR=0, BL=0, BR=0 (center elevated via separate tile)
            </p>
        </fieldset>
    `;
}


// /**
//  * Gera o HTML do fieldset de configuração 3D para tiles (pisos, telhados, rampas)
//  * @param {object} opts - { is3D, elevTL, elevTR, elevBL, elevBR, moduleId }
//  * @returns {string}
//  */
// export function getTile3DConfigHTML(data) {
//     const is3D = data.is3D ? "checked" : "";
//     const mode = data.mode || "manual"; 
//     const modelPath = data.modelPath || "";
    
//     const el = {
//         tl: data.elevTL || 0,
//         tr: data.elevTR || 0,
//         bl: data.elevBL || 0,
//         br: data.elevBR || 0
//     };

//     const style = `
//         <style>
//             .paperbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
//             .paperbox-center { text-align: center; font-weight: bold; margin: 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px;}
//             .paperbox-hidden { display: none !important; }
//             .paperbox-input-group { display: flex; flex-direction: column; align-items: center; }
//             .paperbox-input-group label { font-size: 0.8em; margin-bottom: 2px; color: #555; }
//             .paperbox-config-container { background: rgba(0,0,0,0.03); padding: 8px; border-radius: 4px; border: 1px solid #999; margin-top: 5px; }
//         </style>
//     `;

//     return `
//     ${style}
//     <hr>
//     <div class="form-group">
//         <label><i class="fas fa-cube"></i> Habilitar PaperBox 3D</label>
//         <div class="form-fields">
//             <input type="checkbox" name="flags.${data.moduleId}.is3D" class="paperbox-enable-3d" ${is3D}/>
//         </div>
//     </div>

//     <div class="paperbox-config-container ${!data.is3D ? 'paperbox-hidden' : ''}">
        
//         <div class="form-group">
//             <label>Tipo de Geometria</label>
//             <div class="form-fields">
//                 <select name="flags.${data.moduleId}.mode" class="paperbox-mode-select">
//                     <option value="manual" ${mode === 'manual' ? 'selected' : ''}>Manual (4 Pontos)</option>
//                     <option value="model" ${mode === 'model' ? 'selected' : ''}>Modelo Importado (.obj)</option>
//                 </select>
//             </div>
//         </div>

//         <div class="paperbox-mode-manual ${mode !== 'manual' ? 'paperbox-hidden' : ''}">
//             <div class="paperbox-center">Elevação dos Vértices (Z)</div>
            
//             <div class="paperbox-grid">
//                 <div class="paperbox-input-group">
//                     <label>Topo Esq. (TL)</label>
//                     <input type="number" name="flags.${data.moduleId}.elevationTL" value="${el.tl}" step="10">
//                 </div>
//                 <div class="paperbox-input-group">
//                     <label>Topo Dir. (TR)</label>
//                     <input type="number" name="flags.${data.moduleId}.elevationTR" value="${el.tr}" step="10">
//                 </div>
//                 <div class="paperbox-input-group">
//                     <label>Base Esq. (BL)</label>
//                     <input type="number" name="flags.${data.moduleId}.elevationBL" value="${el.bl}" step="10">
//                 </div>
//                 <div class="paperbox-input-group">
//                     <label>Base Dir. (BR)</label>
//                     <input type="number" name="flags.${data.moduleId}.elevationBR" value="${el.br}" step="10">
//                 </div>
//             </div>
//             <p class="notes" style="text-align: center; font-size: 0.8em;">Define a altura Z de cada canto relativo ao centro.</p>
//         </div>

//         <div class="paperbox-mode-model ${mode !== 'model' ? 'paperbox-hidden' : ''}">
//             <div class="form-group">
//                 <label>Arquivo .OBJ</label>
//                 <div class="form-fields">
//                     <file-picker type="any" class="paperbox-obj-path" name="flags.${data.moduleId}.modelPath" value="${modelPath}"></file-picker>
//                 </div>
//             </div>
//              <button type="button" class="paperbox-import-obj">
//                 <i class="fas fa-sync"></i> Recarregar Modelo
//             </button>
//         </div>
//     </div>
//     `;
// }

/**
 * Gera o HTML do fieldset de configuração de Token 2.5D/3D para PaperBox
 * @param {object} opts - { tokenType, configPath, hasShadow, visualHeight, moduleId }
 * @returns {string}
 */
export function getTokenConfigHTML({ tokenType, configPath, scale = 1, moduleId }) {
    return `
        <fieldset class="paperbox-token-config">
            <legend><i class="fa-solid fa-cube"></i> PaperBox 3D - HD-2D Options</legend>
            <div class="form-group">
                <label>Token Type</label>
                <div class="form-fields">
                    <select name="flags.${moduleId}.tokenType" id="paperbox-token-type">
                        <option value="standard" ${tokenType === 'standard' ? 'selected' : ''}>Standard (Foundry)</option>
                        <option value="billboard" ${tokenType === 'billboard' ? 'selected' : ''}>Billboard (2.5D)</option>
                        <option value="spritesheet" ${tokenType === 'spritesheet' ? 'selected' : ''}>Spritesheet (Animated)</option>
                        <option value="spine" ${tokenType === 'spine' ? 'selected' : ''}>Spine (Skeletal)</option>
                    </select>
                </div>
                <p class="hint">Octopath Style: Spine provides the smoothest animations.</p>
            </div>
            <div class="form-group ${(tokenType === 'spine' || tokenType === 'spritesheet') ? '' : 'hidden'}" id="paperbox-config-path">
                <label>Data Config (JSON)</label>
                <div class="form-fields">
                    <file-picker name="flags.${moduleId}.configPath" type="any">
                        <input class="image" type="text" value="${configPath}" placeholder="path/to/spine-or-sheet.json">
                        <button class="fa-solid fa-file-import fa-fw icon" type="button"></button>
                    </file-picker>
                </div>
            </div>
            <div class="form-group slim ${tokenType === 'billboard' ? '' : 'hidden'}" id="paperbox-scale-field">
                <label>Escala</label>
                <div class="form-fields">
                    <input type="number" name="flags.${moduleId}.scale" value="${scale}" step="0.01" min="0.01">
                </div>
                <p class="hint">Ajusta o tamanho do sprite (1 = original).</p>
            </div>
        </fieldset>
    `;
}
