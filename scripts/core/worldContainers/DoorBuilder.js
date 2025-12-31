import { MODULE_ID } from "../../utils/constants.js";
import { WallBuilder } from "./WallBuilder.js";

export class DoorBuilder extends WallBuilder {
    constructor(paperbox, container) {
        super(paperbox, container);
        this.type = "door";
    }

    animateDoor(wallDoc, open) {

        const animType = wallDoc.animation?.type || wallDoc.getFlag(MODULE_ID, "animation.type") || "none";
        const duration = wallDoc.getFlag(MODULE_ID, "animation.duration") || 30;
        const isDouble = wallDoc.getFlag(MODULE_ID, "animation.double");

        this._stopAnimations(wallDoc.id);

        if (animType === "none" || animType === "") {
            for (const [id, sprite] of this.sprites.entries()) {
                if (id.startsWith(wallDoc.id)) {
                    sprite.visible = !open;
                }
            }
            return;
        }
        switch (animType) {
            case "swivel": this._animSwing(wallDoc, open, duration, isDouble, true); break;
            case "swing":  this._animSwing(wallDoc, open, duration, isDouble, false); break;
            case "slide":  this._animSlide(wallDoc, open, duration, isDouble); break;
            case "ascend": this._animLift(wallDoc, open, duration, 1); break;
            case "descend": this._animLift(wallDoc, open, duration, -1); break;
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
        let baseRad = (90 * Math.PI / 180);
        if (isReversed) baseRad *= -1;

        this._runTicker(wallDoc, duration, open, "_doorAngle", (progress, sprite) => {
            const coords = wallDoc.c;
            
            if (isDouble) {
                sprite._doorPivot = sprite._segmentIndex === 0 
                    ? { x: coords[0], y: coords[1] } 
                    : { x: coords[2], y: coords[3] };
                
                const target = open ? (sprite._segmentIndex === 0 ? baseRad : -baseRad) : 0;
                return sprite._startVal + (target - sprite._startVal) * progress;
            } else {
                sprite._doorPivot = { x: coords[0], y: coords[1] };
                const target = open ? baseRad : 0;
                return sprite._startVal + (target - sprite._startVal) * progress;
            }
        });
    }


    _animSlide(wallDoc, open, duration, isDouble) {
        this._runTicker(wallDoc, duration, open, "_doorSlide", (progress, sprite) => {
            let target = 0;
            if (open) {
                if (!isDouble) target = 0.9;
                else target = (sprite._segmentIndex === 0 ? -0.9 : 0.9);
            }
            return sprite._startVal + (target - sprite._startVal) * progress;
        });
    }

    _animLift(wallDoc, open, duration, direction) {
        this._runTicker(wallDoc, duration, open, "_doorLift", (progress, sprite) => {
            const target = open ? direction : 0;
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
