import { MODULE_ID } from "../../../utils/constants.js";
import { WallBuilder } from "./WallBuilder.js";

export class DoorBuilder extends WallBuilder {
    constructor(paperbox, container) {
        super(paperbox, container);
        this.type = "door";
    }

    animateDoor(wallDoc, open) {

        // --- Lê todas as opções relevantes do wallDoc/flags ---
        const animType = wallDoc.animation?.type || wallDoc.getFlag(MODULE_ID, "animation.type") || "none";
        const duration = Number(wallDoc.getFlag(MODULE_ID, "animation.duration")) || 30;
        const isDouble = !!wallDoc.getFlag(MODULE_ID, "animation.double");
        const animStrength = Number(wallDoc.getFlag(MODULE_ID, "animation.strength")) || 1;
        // Garante que animDirection seja sempre 1 (padrão) ou -1 (invertido)
        let animDirection = wallDoc.animation?.direction;
        if (animDirection === undefined || animDirection === null) {
            animDirection = wallDoc.getFlag(MODULE_ID, "animation.direction");
        }
        animDirection = Number(animDirection);
        if (isNaN(animDirection) || ![1, -1].includes(animDirection)) animDirection = 1;
        const animFlip = !!wallDoc.getFlag(MODULE_ID, "animation.flip");
        const animTexture = wallDoc.getFlag(MODULE_ID, "animation.texture") || null;
        const doorSound = wallDoc.getFlag(MODULE_ID, "doorSound") || null;
        // O tipo correto da porta é wallDoc.door (0: nenhuma, 1: porta, 2: secreta)
        const doorType = typeof wallDoc.door === "number" ? wallDoc.door : Number(wallDoc.getFlag(MODULE_ID, "door")) || 0;
        const doorState = Number(wallDoc.getFlag(MODULE_ID, "ds"));
        const moveRestriction = Number(wallDoc.getFlag(MODULE_ID, "move"));
        const lightRestriction = Number(wallDoc.getFlag(MODULE_ID, "light"));
        const sightRestriction = Number(wallDoc.getFlag(MODULE_ID, "sight"));
        const soundRestriction = Number(wallDoc.getFlag(MODULE_ID, "sound"));
        const height3D = Number(wallDoc.getFlag("paperbox-vtt", "height")) || 0;
        const texture3D = wallDoc.getFlag("paperbox-vtt", "texture") || null;

        this._stopAnimations(wallDoc.id);

        // --- Aplica textura, flip, altura, etc. nos sprites ---
        for (const [id, sprite] of this.sprites.entries()) {
            if (id.startsWith(wallDoc.id)) {
                // Textura 2D/3D
                if (animTexture) sprite.texture = PIXI.Texture.from(animTexture);
                if (texture3D) sprite.texture = PIXI.Texture.from(texture3D);
                // Flip
                sprite.scale.x = animFlip ? -Math.abs(sprite.scale.x) : Math.abs(sprite.scale.x);
                // Altura 3D
                if (height3D) sprite.height = height3D;
                // Restrições (pode ser usado para lógica futura)
                sprite._moveRestriction = moveRestriction;
                sprite._lightRestriction = lightRestriction;
                sprite._sightRestriction = sightRestriction;
                sprite._soundRestriction = soundRestriction;
                // Tipo/estado da porta
                sprite._doorType = doorType;
                sprite._doorState = doorState;
            }
        }

        // --- Porta sem animação: só esconde/exibe ---
        if (animType === "none" || animType === "") {
            // Apenas remove/adiciona o sprite do container, sem destruir/recriar
            for (const [id, sprite] of this.sprites.entries()) {
                if (id.startsWith(wallDoc.id)) {
                    // Se for secret door (doorType==2), nunca remove do container e sempre visível
                    if (doorType === 2) {
                        sprite.visible = true;
                        if (this.container && sprite.parent !== this.container) {
                            try { sprite.parent?.removeChild(sprite); } catch(e){}
                            this.container.addChild(sprite);
                        }
                        continue;
                    }
                    // Portas normais
                    if (open) {
                        if (this.container && this.container.children.includes(sprite)) {
                            this.container.removeChild(sprite);
                        }
                    } else {
                        if (this.container && !this.container.children.includes(sprite)) {
                            this.container.addChild(sprite);
                        }
                        sprite.visible = true;
                    }
                }
            }
            return;
        }

        // --- Porta com animação ---
        switch (animType) {
            case "swivel": this._animSwing(wallDoc, open, duration, isDouble, true, animStrength, animDirection); break;
            case "swing":  this._animSwing(wallDoc, open, duration, isDouble, false, animStrength, animDirection); break;
            case "slide":  this._animSlide(wallDoc, open, duration, isDouble, animStrength, animDirection); break;
            case "ascend": this._animLift(wallDoc, open, duration, 1, animStrength); break;
            case "descend": this._animLift(wallDoc, open, duration, -1, animStrength); break;
        }
    }

    _getInitialCutPoints(wall) {
        const points = new Set([0, 1]);
        if (wall.document.getFlag(MODULE_ID, "animation.double")) {
            points.add(0.5);
        }
        return points;
    }

    _animSwing(wallDoc, open, duration, isDouble, isReversed) {
        // Parâmetros extras: força (amplitude) e direção
        let baseRad = (90 * Math.PI / 180);
        // Recebe animStrength e animDirection se passados
        let animStrength = arguments[5] !== undefined ? arguments[5] : 1;
        let animDirection = arguments[6] !== undefined ? arguments[6] : 1;
        baseRad *= animStrength;

        this._runTicker(wallDoc, duration, open, "_doorAngle", (progress, sprite) => {
            const coords = wallDoc.c;
            if (isDouble) {
                // Garante que cada lado abre para fora do centro
                const dx = coords[2] - coords[0];
                const dy = coords[3] - coords[1];
                const isHorizontal = Math.abs(dx) > Math.abs(dy);
                let isLeftOrTop = false;
                if (isHorizontal) {
                    isLeftOrTop = (sprite._doorPivot?.x ?? coords[0]) <= (coords[0] + coords[2]) / 2;
                } else {
                    isLeftOrTop = (sprite._doorPivot?.y ?? coords[1]) <= (coords[1] + coords[3]) / 2;
                }
                sprite._doorPivot = sprite._segmentIndex === 0 
                    ? { x: coords[0], y: coords[1] } 
                    : { x: coords[2], y: coords[3] };
                // Cada lado abre para fora do centro, direction/reverse inverte ambos
                const sideSign = isLeftOrTop ? 1 : -1;
                const target = open ? baseRad * sideSign * animDirection : 0;
                return sprite._startVal + (target - sprite._startVal) * progress;
            } else {
                sprite._doorPivot = { x: coords[0], y: coords[1] };
                const target = open ? baseRad * animDirection : 0;
                return sprite._startVal + (target - sprite._startVal) * progress;
            }
        });
    }


    _animSlide(wallDoc, open, duration, isDouble) {
        // Parâmetros extras: força (amplitude) e direção
        let animStrength = arguments[4] !== undefined ? arguments[4] : 1;
        let animDirection = arguments[5] !== undefined ? arguments[5] : 1;
        this._runTicker(wallDoc, duration, open, "_doorSlide", (progress, sprite) => {
            let target = 0;
            if (open) {
                if (!isDouble) target = 0.9 * animStrength * animDirection;
                else target = (sprite._segmentIndex === 0 ? -0.9 : 0.9) * animStrength * animDirection;
            }
            return sprite._startVal + (target - sprite._startVal) * progress;
        });
    }

    _animLift(wallDoc, open, duration, direction) {
        // Parâmetro extra: força (amplitude)
        let animStrength = arguments[4] !== undefined ? arguments[4] : 1;
        this._runTicker(wallDoc, duration, open, "_doorLift", (progress, sprite) => {
            const target = open ? direction * animStrength : 0;
            // Opcional: fade out enquanto sobe/desce
            sprite.alpha = 1 - (progress * 0.7 * (open ? 1 : 0)); 
            return sprite._startVal + (target - sprite._startVal) * progress;
        });
    }

    // Motor de Ticker genérico
    _runTicker(wallDoc, duration, open, propName, updateFn) {
        const wallId = wallDoc.id;
        for (const [id, sprite] of this.sprites.entries()) {
            if (id.startsWith(wallId)) {
                if (sprite._animTicker) sprite._animTicker.destroy();

                sprite._startVal = sprite[propName] || 0;
                let elapsed = 0;

                sprite._animTicker = new PIXI.Ticker();
                sprite._animTicker.add((delta) => {
                    elapsed += delta;
                    const progress = Math.min(1, elapsed / duration);
                    const ease = 1 - Math.pow(1 - progress, 3); // Cubic Out

                    sprite[propName] = updateFn(ease, sprite);
                    this.updateTransform(sprite, this.paperbox.state.tilt, this.paperbox.state.rotation);

                    if (progress >= 1) {
                        sprite._animTicker.destroy();
                        sprite._animTicker = null;
                    }
                });
                sprite._animTicker.start();
            }
        }
    }
    
    _onUpdateWall(doc, changes) {
        if ("ds" in changes) {
            this.animateDoor(doc, changes.ds === 1);
            return;
        }
        super._onUpdateWall(doc, changes);
    }

    _stopAnimations(wallId) {
        for (const [id, sprite] of this.sprites.entries()) {
            if (id.startsWith(wallId) && sprite._animTicker) {
                sprite._animTicker.destroy();
                sprite._animTicker = null;
            }
        }
    }
}
