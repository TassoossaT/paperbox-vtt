import { MODULE_ID } from "../../../utils/constants.js";
import { Wall3D } from "./Wall3D.js";

export class Door3D extends Wall3D {
    constructor(wallDoc, paperbox, container) {
        super(wallDoc, paperbox, container);
        this.type = "door";
    }

    get isDouble() {
        const anim = this.doc.animation || {};
        return !!(anim.double || this.doc.getFlag(MODULE_ID, "animation.double"));
    }

    async rebuild() {
        const animData = this.doc.animation || {};
        const animType = (animData.type || "none").toLowerCase();
        const isVertical = ["ascend", "descend"].includes(animType);

        if (!this.isDouble || isVertical) {
            await super.rebuild(); 
        } else {
            this.clearVisuals();
            if (!this.doc.getFlag(MODULE_ID, "is3D")) return;

            const [x1, y1, x2, y2] = this.doc.c;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const texture = this.doc.getFlag(MODULE_ID, "texture");
            const height = this.doc.getFlag(MODULE_ID, "height") || 100;

            await this.createVisual(this.doc.id + "_L", [x1, y1, midX, midY], texture, height, "left");
            await this.createVisual(this.doc.id + "_R", [midX, midY, x2, y2], texture, height, "right");
        }

        if (this.doc.ds === 1) {
            this.animate(true, 0); 
        } else {
            this.refresh();
        }
    }

    onUpdate(changes) {
        if ("ds" in changes) {
            this.animate(changes.ds === 1);
        }
        super.onUpdate(changes);
    }

    animate(open, forceDuration = null) {
        const animData = this.doc.animation || {};
        const animType = (animData.type || "none").toLowerCase();
        
        // Se forceDuration for 0, ele ignora a duração da flag
        const durationMs = forceDuration !== null ? forceDuration : (Number(animData.duration) || 750);
        const durationInFrames = durationMs / 16.6;

        const strength = Number(animData.strength) || 1;
        const direction = Number(animData.direction) || 1;

        let targets = { angle: 0, slide: 0, lift: 0, alpha: 1 };

        if (open) {
            switch (animType) {
                case "swivel":
                case "swing":   targets.angle = (Math.PI / 2) * strength * direction; break;
                case "slide":     targets.slide = - 0.9 * strength * direction; break;
                case "ascend":    targets.lift = 1.0 * strength; targets.alpha = 0.3; break;
                case "descend":   targets.lift = -1.0 * strength; targets.alpha = 0.3; break;
                default:          targets.alpha = 0; break;
            }
        }

        this.visuals.forEach(v => v.animateTo(targets, durationInFrames));
    }
}