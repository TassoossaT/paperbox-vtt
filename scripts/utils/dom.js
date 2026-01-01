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
