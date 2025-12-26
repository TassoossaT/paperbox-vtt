export class HUD {
    constructor(paperbox) {
        this.paperbox = paperbox;
        this.elementTilt = null;
        this.elementRot = null;
    }

    render() {
        if (document.getElementById("pb-hud-tilt")) return;

        const state = this.paperbox.state;

        // 1. Painel Vertical (Tilt)
        const htmlTilt = `
            <div id="pb-hud-tilt" class="pb-hud-panel">
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
            <div id="pb-hud-rot" class="pb-hud-panel">
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

        $('body').append(htmlTilt);
        $('body').append(htmlRot);

        this.elementTilt = $('#pb-hud-tilt');
        this.elementRot = $('#pb-hud-rot');

        this._generateTicks('pb-ruler-tilt', [0, 15, 30, 45, 60, 75, 85]);
        this._generateTicks('pb-ruler-rot', [-180, -135, -90, -45, 0, 45, 90, 135, 180]);
        
        this._activateListeners();
        this._setupDraggable("pb-hud-tilt");
        this._setupDraggable("pb-hud-rot");
        this._setupResizeObserver();
    }

    remove() {
        $('#pb-hud-tilt').remove();
        $('#pb-hud-rot').remove();
        this.elementTilt = null;
        this.elementRot = null;
    }

    updateVisuals() {
        const state = this.paperbox.state;

        // --- TILT (Vertical) ---
        const pctTilt = (state.tilt / 85) * 100;
        
        $('#pb-slider-tilt').css('--pb-val-pct', `${pctTilt}%`);
        $('#pb-val-tilt')
            .find('span').text(Math.round(state.tilt)).end()
            .css('bottom', `${pctTilt}%`);
        
        // Visual Indicator for Tilt (Side view arc)
        // Rotate needle from 0 (flat) to -85 (upright)
        $('#pb-vis-tilt .pb-vis-needle').css('transform', `rotate(${-state.tilt}deg)`);

        // --- ROTATION (Horizontal) ---
        let normRot = ((state.rotation % 360) + 360) % 360;
        if (normRot > 180) normRot -= 360;
        
        const pctRot = ((normRot + 180) / 360) * 100;

        $('#pb-slider-rot').css('--pb-val-pct', `${pctRot}%`);
        $('#pb-val-rot')
            .find('span').text(Math.round(normRot)).end()
            .css('left', `${pctRot}%`);

        // Visual Indicator for Rotation (Compass)
        $('#pb-vis-rot .pb-vis-needle').css('transform', `rotate(${normRot}deg)`);

        // Sliders (sync)
        const sTilt = $('#pb-slider-tilt');
        const sRot = $('#pb-slider-rot');

        if (sTilt.length && !sTilt.is(':active')) sTilt.val(state.tilt);
        if (sRot.length && !sRot.is(':active')) sRot.val(normRot);
    }

    _generateTicks(containerId, values) {
        const container = $(`#${containerId}`);
        container.empty();
        
        const min = values[0];
        const max = values[values.length - 1];
        const totalRange = max - min;

        values.forEach(val => {
            let pct = ((val - min) / totalRange) * 100;
            const tick = $('<div class="pb-tick"></div>');
            
            if (containerId.includes('tilt')) {
                tick.css('bottom', `${pct}%`); 
            } else {
                tick.css('left', `${pct}%`);
            }

            if ([0, 45, -45, 90, -90].includes(val)) {
                tick.addClass('major');
            }
            container.append(tick);
        });
    }

    _activateListeners() {
        // Sliders
        $('#pb-slider-tilt').on('input', (e) => {
            if (this.paperbox.state.lockedTilt) return;
            this.paperbox.setState({ tilt: parseInt(e.target.value) });
        });

        $('#pb-slider-rot').on('input', (e) => {
            if (this.paperbox.state.lockedRotation) return;
            this.paperbox.setState({ rotation: parseInt(e.target.value) });
        });

        // Locks
        $('#pb-lock-tilt').on('click', (e) => this._toggleLock('tilt', e.currentTarget));
        $('#pb-lock-rot').on('click', (e) => this._toggleLock('rotation', e.currentTarget));
    }

    _toggleLock(type, btn) {
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

    _setupDraggable(id) {
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
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
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
