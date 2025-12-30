export class HUD {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.elementTilt = null;
        this.elementRot = null;
        // Centralized config
        this.TILT_RANGE = { min: 0, max: 90, step: 1 };
        this.ROT_RANGE = { min: -180, max: 180, step: 1 };
        this.SNAP_STEP = 1;
        this.SNAP_THRESHOLD = 5;
    }

    render() {
        if (document.getElementById("pb-hud-tilt")) return;

        const state = this.paperbox.state;
        const posTilt = game.settings.get('paperbox-vtt', 'hudPosTilt') || { top: '20%', right: '20px' };
        const posRot = game.settings.get('paperbox-vtt', 'hudPosRot') || { bottom: '20px', left: '50%' };

        // Helper to format style string
        const getStyle = (pos) => {
            let s = '';
            if (pos.top) s += `top: ${pos.top}; `;
            if (pos.bottom) s += `bottom: ${pos.bottom}; `;
            if (pos.left) s += `left: ${pos.left}; `;
            if (pos.right) s += `right: ${pos.right}; `;
            if (pos.left === '50%' && !pos.left.includes('px')) s += 'transform: translateX(-50%); ';
            else s += 'transform: none; ';
            return s;
        };

        // 1. Painel Vertical (Tilt)
        const htmlTilt = `
            <div id="pb-hud-tilt" class="pb-hud-panel" style="${getStyle(posTilt)}">
                <div class="pb-slider-container" id="pb-cont-tilt">
                    <div class="pb-value-display" id="pb-val-tilt"><span>${Math.round(state.tilt)}</span></div>
                    <div class="pb-ruler" id="pb-ruler-tilt"></div>
                    <input type="range" class="pb-slider" id="pb-slider-tilt" 
                        min="${this.TILT_RANGE.min}" max="${this.TILT_RANGE.max}" value="${state.tilt}" step="${this.TILT_RANGE.step}">
                </div>
                <div class="pb-angle-visual" id="pb-vis-tilt">
                    <div class="pb-vis-needle"></div>
                </div>
                <button class="pb-lock-btn" id="pb-lock-tilt" title="Travar Inclinação"><i class="fas fa-unlock"></i></button>
            </div>
        `;

        // 2. Painel Horizontal (Rotação)
        let normRot = ((state.rotation % 360) + 360) % 360;
        if (normRot > 180) normRot -= 360;

        const htmlRot = `
            <div id="pb-hud-rot" class="pb-hud-panel" style="${getStyle(posRot)}">
                <button class="pb-lock-btn" id="pb-lock-rot" title="Travar Rotação"><i class="fas fa-unlock"></i></button>
                <div class="pb-angle-visual" id="pb-vis-rot">
                    <div class="pb-vis-needle"></div>
                </div>
                <div class="pb-slider-container" id="pb-cont-rot">
                    <div class="pb-value-display" id="pb-val-rot"><span>${Math.round(normRot)}</span></div>
                    <div class="pb-ruler" id="pb-ruler-rot"></div>
                    <input type="range" class="pb-slider" id="pb-slider-rot" 
                           min="${this.ROT_RANGE.min}" max="${this.ROT_RANGE.max}" value="${Math.round(normRot)}" step="${this.ROT_RANGE.step}">
                </div>
            </div>
        `;

        // Append to body (default) or Sidebar if requested (future feature)
        const $body = window.jQuery ? window.jQuery('body') : document.body;
        if ($body instanceof jQuery) {
            $body.append(htmlTilt);
            $body.append(htmlRot);
        } else {
            // Fallback for vanilla JS if jQuery is somehow missing (unlikely in Foundry)
            const div = document.createElement('div');
            div.innerHTML = htmlTilt + htmlRot;
            while (div.firstChild) document.body.appendChild(div.firstChild);
        }

        this.elementTilt = window.jQuery ? window.jQuery('#pb-hud-tilt') : document.getElementById('pb-hud-tilt');
        this.elementRot = window.jQuery ? window.jQuery('#pb-hud-rot') : document.getElementById('pb-hud-rot');

        this._generateTicks('pb-ruler-tilt', 0, 85, 15);
        this._generateTicks('pb-ruler-rot', -180, 180, 15);
        
        this._activateListeners();
        this._setupDraggable("pb-hud-tilt", 'hudPosTilt');
        this._setupDraggable("pb-hud-rot", 'hudPosRot');
        this._setupResizeObserver();
    }

    remove() {
        if (window.jQuery) {
            window.jQuery('#pb-hud-tilt').remove();
            window.jQuery('#pb-hud-rot').remove();
        } else {
            document.getElementById('pb-hud-tilt')?.remove();
            document.getElementById('pb-hud-rot')?.remove();
        }
        this.elementTilt = null;
        this.elementRot = null;
    }

    updateVisuals() {
        // Prefer vanilla JS for robustness
        const state = this.paperbox.state;

        // --- TILT (Vertical) ---
        const tiltSlider = document.getElementById('pb-slider-tilt');
        const tiltVal = document.getElementById('pb-val-tilt');
        const tiltNeedle = document.querySelector('#pb-vis-tilt .pb-vis-needle');
        if (tiltSlider && tiltVal && tiltNeedle) {
            const ratioTilt = state.tilt / this.TILT_RANGE.max;
            const pctTilt = ratioTilt * 100;
            tiltSlider.style.setProperty('--pb-val-pct', `${pctTilt}%`);
            tiltVal.querySelector('span').textContent = Math.round(state.tilt);
            tiltVal.style.bottom = `calc(${pctTilt}% + ${10 - (ratioTilt * 20)}px)`;
            tiltNeedle.style.transform = `rotate(${-state.tilt}deg)`;
            if (!tiltSlider.matches(':active')) tiltSlider.value = state.tilt;
        }

        // --- ROTATION (Horizontal) ---
        let normRot = ((state.rotation % 360) + 360) % 360;
        if (normRot > 180) normRot -= 360;
        const rotSlider = document.getElementById('pb-slider-rot');
        const rotVal = document.getElementById('pb-val-rot');
        const rotNeedle = document.querySelector('#pb-vis-rot .pb-vis-needle');
        if (rotSlider && rotVal && rotNeedle) {
            const ratioRot = (normRot + 180) / (this.ROT_RANGE.max - this.ROT_RANGE.min);
            const pctRot = ratioRot * 100;
            rotSlider.style.setProperty('--pb-val-pct', `${pctRot}%`);
            rotVal.querySelector('span').textContent = Math.round(normRot);
            rotVal.style.left = `calc(${pctRot}% + ${10 - (ratioRot * 20)}px)`;
            rotNeedle.style.transform = `rotate(${normRot}deg)`;
            if (!rotSlider.matches(':active')) rotSlider.value = normRot;
        }
    }

    _generateTicks(containerId, min, max, step) {
        const $ = window.jQuery;
        const container = $(`#${containerId}`);
        container.empty();
        
        const totalRange = max - min;
        const values = [];
        for (let v = min; v <= max; v += step) {
            values.push(v);
        }
        // Ensure max is included if not hit by step
        if (values[values.length - 1] !== max) values.push(max);

        values.forEach(val => {
            let pct = ((val - min) / totalRange) * 100;
            const tick = $('<div class="pb-tick"></div>');
            
            if (containerId.includes('tilt')) {
                tick.css('bottom', `${pct}%`); 
            } else {
                tick.css('left', `${pct}%`);
            }

            // Major ticks every 45 degrees or 0
            if (val % 45 === 0 || val === 0) {
                tick.addClass('major');
            }
            container.append(tick);
        });
    }

    _activateListeners() {
        // Função auxiliar para lidar com scroll do mouse nos sliders
        const handleSliderWheel = (slider, stateKey, range, lockKey, step) => {
            slider.addEventListener('wheel', (e) => {
                if (this.paperbox.state[lockKey]) return;
                e.preventDefault();
                let val = parseInt(slider.value);
                // deltaY > 0 = scroll para baixo (diminuir), < 0 = para cima (aumentar)
                val += (e.deltaY > 0 ? -step : step);
                // Snap
                val = snap(val, step, this.SNAP_THRESHOLD);
                val = Math.max(range.min, Math.min(range.max, val));
                this.paperbox.setState({ [stateKey]: val });
                this.updateVisuals();
            });
        };
        // Helper for snapping
        const snap = (val, step = this.SNAP_STEP, threshold = this.SNAP_THRESHOLD) => {
            const remainder = val % step;
            if (Math.abs(remainder) < threshold) return val - remainder;
            if (Math.abs(remainder) > step - threshold) return val + (step * Math.sign(val)) - remainder;
            return val;
        };

        // Sliders
        const tiltSlider = document.getElementById('pb-slider-tilt');
        if (tiltSlider) {
            tiltSlider.addEventListener('input', (e) => {
                if (this.paperbox.state.lockedTilt) return;
                let val = parseInt(e.target.value);
                val = snap(val, this.TILT_RANGE.step, this.SNAP_THRESHOLD);
                this.paperbox.setState({ tilt: val });
                this.updateVisuals();
            });
            handleSliderWheel(tiltSlider, 'tilt', this.TILT_RANGE, 'lockedTilt', this.TILT_RANGE.step);
        }
        const rotSlider = document.getElementById('pb-slider-rot');
        if (rotSlider) {
            rotSlider.addEventListener('input', (e) => {
                if (this.paperbox.state.lockedRotation) return;
                let val = parseInt(e.target.value);
                val = snap(val, this.ROT_RANGE.step, this.SNAP_THRESHOLD);
                this.paperbox.setState({ rotation: val });
                this.updateVisuals();
            });
            handleSliderWheel(rotSlider, 'rotation', this.ROT_RANGE, 'lockedRotation', this.ROT_RANGE.step);
        }

        // Locks
        const tiltLock = document.getElementById('pb-lock-tilt');
        if (tiltLock) tiltLock.addEventListener('click', (e) => this._toggleLock('tilt', e.currentTarget));
        const rotLock = document.getElementById('pb-lock-rot');
        if (rotLock) rotLock.addEventListener('click', (e) => this._toggleLock('rotation', e.currentTarget));
    }

    _toggleLock(type, btn) {
        const $ = window.jQuery;
        const key = type === 'tilt' ? 'lockedTilt' : 'lockedRotation';
        const newState = !this.paperbox.state[key];
        
        this.paperbox.setState({ [key]: newState });
        
        $(btn).toggleClass('active');
        const icon = $(btn).find('i');
        
        if (newState) {
            icon.removeClass('fa-unlock').addClass('fa-lock');
            $(`#pb-slider-${type}`).prop('disabled', true).parent().css('opacity', '0.5');
        } else {
            icon.removeClass('fa-lock').addClass('fa-unlock');
            $(`#pb-slider-${type}`).prop('disabled', false).parent().css('opacity', '1');
        }
    }

    _setupDraggable(id, settingKey) {
        const elm = document.getElementById(id);
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        elm.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.target.tagName === 'INPUT' || e.target.closest('button')) return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            elm.style.top = (elm.offsetTop - pos2) + "px";
            elm.style.left = (elm.offsetLeft - pos1) + "px";
            elm.style.right = 'auto';
            elm.style.bottom = 'auto';
            // Remove transform if we are dragging, to avoid confusion with centered elements
            elm.style.transform = 'none';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            
            // Save position
            if (settingKey) {
                const pos = {
                    top: elm.style.top,
                    left: elm.style.left,
                    bottom: 'auto',
                    right: 'auto'
                };
                game.settings.set('paperbox-vtt', settingKey, pos);
            }
        }
    }

    _setupResizeObserver() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.target.id === 'pb-hud-tilt') {
                    const container = $('#pb-cont-tilt');
                    const h = container.height();
                    $('#pb-slider-tilt').css('width', `${h}px`);
                }
            }
        });
        const el = document.getElementById('pb-hud-tilt');
        if (el) {
            resizeObserver.observe(el);
            setTimeout(() => $(el).trigger('resize'), 100);
        }
    }
}
