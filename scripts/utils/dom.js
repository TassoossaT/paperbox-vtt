import { MODULE_ID } from "./constants.js";
/**
 * Gera o HTML do fieldset de configuração 3D para paredes/portas.
 * @param {object} opts - { label, is3D, texture, height, moduleId }
 * @returns {string}
 */
export function getWall3DConfigHTML({ label, is3D, texture, height, moduleId }) {
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
        </fieldset>
    `;
}
// utils/dom.js
// Centraliza manipulação e extração de elementos HTML para o PaperBox



/**
 * Gera o HTML do fieldset de configuração de Token 2.5D/3D para PaperBox
 * @param {object} opts - { tokenType, configPath, hasShadow, visualHeight, moduleId }
 * @returns {string}
 */
export function getTokenConfigHTML({ tokenType, configPath, hasShadow, visualHeight, moduleId }) {
    return `
        <fieldset class="paperbox-token-config">
            <legend><i class="fa-solid fa-cube"></i> PaperBox 3D - HD-2D Options</legend>
            <div class="form-group">
                <label>2.5D Token Type</label>
                <div class="form-fields">
                    <select name="flags.${moduleId}.tokenType">
                        <option value="standard" ${tokenType === 'standard' ? 'selected' : ''}>Standard (Foundry)</option>
                        <option value="spritesheet" ${tokenType === 'spritesheet' ? 'selected' : ''}>Spritesheet (Animated)</option>
                        <option value="spine" ${tokenType === 'spine' ? 'selected' : ''}>Spine (Skeletal)</option>
                    </select>
                </div>
                <p class="hint">Octopath Style: Spine provides the smoothest animations.</p>
            </div>
            <div class="form-group ${tokenType === 'standard' ? 'hidden' : ''}" id="paperbox-config-path">
                <label>Data Config (JSON)</label>
                <div class="form-fields">
                    <file-picker name="flags.${moduleId}.configPath" type="any">
                        <input class="image" type="text" value="${configPath}" placeholder="path/to/spine-or-sheet.json">
                        <button class="fa-solid fa-file-import fa-fw icon" type="button"></button>
                    </file-picker>
                </div>
            </div>
            <div class="form-group slim">
                <label>Visual Lift (Pixels)</label>
                <div class="form-fields">
                    <input type="number" name="flags.${moduleId}.visualHeight" value="${visualHeight}" step="1">
                </div>
                <p class="hint">Offsets the sprite vertically without changing floor depth.</p>
            </div>
            <div class="form-group">
                <label>Cast 2.5D Shadow</label>
                <div class="form-fields">
                    <input type="checkbox" name="flags.${moduleId}.hasShadow" ${hasShadow ? 'checked' : ''}>
                </div>
            </div>
        </fieldset>
    `;
}
