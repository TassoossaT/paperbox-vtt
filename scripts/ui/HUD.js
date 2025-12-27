export class HUD {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.elementTilt = null;
        this.elementRot = null;
    }

    render() {
        if (document.getElementById("pb-hud-tilt")) return;

        const state = this.paperbox.state;

        // Load saved positions
        const posTilt = game.settings.get('paperbox-vtt', 'hudPosTilt') || { top: '20%', right: '20px' };
        const posRot = game.settings.get('paperbox-vtt', 'hudPosRot') || { bottom: '20px', left: '50%' };

        // Helper to format style string
        const getStyle = (pos) => {
            let s = '';
            if (pos.top) s += `top: ${pos.top}; `;
            if (pos.bottom) s += `bottom: ${pos.bottom}; `;
            if (pos.left) s += `left: ${pos.left}; `;
            if (pos.right) s += `right: ${pos.right}; `;
            // Ensure transform is handled for rot if it was centered originally
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
                           min="0" max="85" value="${state.tilt}" step="1">
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
                           min="-180" max="180" value="${Math.round(normRot)}" step="1">
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
        const $ = window.jQuery;
        if (!$) return;

        const state = this.paperbox.state;

        // --- TILT (Vertical) ---
        // Range 0 to 85
        const ratioTilt = state.tilt / 85;
        const pctTilt = ratioTilt * 100;
        
        $('#pb-slider-tilt').css('--pb-val-pct', `${pctTilt}%`);
        
        // Sync Text with Thumb Center
        // Thumb is 20px. Track is full height.
        // The thumb center moves from 10px (min) to Height-10px (max).
        // Formula: Center = 10 + (Height - 20) * ratio
        // In percentage of track (assuming track is container):
        // We can use calc in CSS, or calculate pixels here. 
        // Let's use the calc formula for precision: calc(Ratio% + (10 - Ratio*20)px)
        const offsetTilt = 10 - (ratioTilt * 20);

        $('#pb-val-tilt')
            .find('span').text(Math.round(state.tilt)).end()
            .css('bottom', `calc(${pctTilt}% + ${offsetTilt}px)`);
        
        // Visual Indicator for Tilt (Side view arc)
        $('#pb-vis-tilt .pb-vis-needle').css('transform', `rotate(${-state.tilt}deg)`);

        // --- ROTATION (Horizontal) ---
        let normRot = ((state.rotation % 360) + 360) % 360;
        if (normRot > 180) normRot -= 360;
        
        // Range -180 to 180 (Total 360)
        const ratioRot = (normRot + 180) / 360;
        const pctRot = ratioRot * 100;

        $('#pb-slider-rot').css('--pb-val-pct', `${pctRot}%`);
        
        const offsetRot = 10 - (ratioRot * 20);

        $('#pb-val-rot')
            .find('span').text(Math.round(normRot)).end()
            .css('left', `calc(${pctRot}% + ${offsetRot}px)`);

        // Visual Indicator for Rotation (Compass)
        $('#pb-vis-rot .pb-vis-needle').css('transform', `rotate(${normRot}deg)`);

        // Sliders (sync)
        const sTilt = $('#pb-slider-tilt');
        const sRot = $('#pb-slider-rot');

        if (sTilt.length && !sTilt.is(':active')) sTilt.val(state.tilt);
        if (sRot.length && !sRot.is(':active')) sRot.val(normRot);
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
        const $ = window.jQuery;
        // Helper for snapping
        const snap = (val, step = 15, threshold = 5) => {
            const remainder = val % step;
            if (Math.abs(remainder) < threshold) return val - remainder;
            if (Math.abs(remainder) > step - threshold) return val + (step * Math.sign(val)) - remainder;
            return val;
        };

        // Sliders
        $('#pb-slider-tilt').on('input', (e) => {
            if (this.paperbox.state.lockedTilt) return;
            let val = parseInt(e.target.value);
            val = snap(val);
            // Update visual if snapped
            if (val !== parseInt(e.target.value)) {
                // We don't force the slider value immediately to avoid "fighting" the user, 
                // but we update the state which updates the visual.
                // Actually, for snapping to feel "magnetic", we might want to update the state to the snapped value.
            }
            this.paperbox.setState({ tilt: val });
        });

        $('#pb-slider-rot').on('input', (e) => {
            if (this.paperbox.state.lockedRotation) return;
            let val = parseInt(e.target.value);
            val = snap(val);
            this.paperbox.setState({ rotation: val });
        });

        // Locks
        $('#pb-lock-tilt').on('click', (e) => this._toggleLock('tilt', e.currentTarget));
        $('#pb-lock-rot').on('click', (e) => this._toggleLock('rotation', e.currentTarget));
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
