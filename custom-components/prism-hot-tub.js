/**
 * Prism Hot Tub Card  v3
 * Styled to match the Prism Dashboard aesthetic (prism-creality reference).
 *
 * INSTALLATION:
 *   1. Copy to /config/www/community/Prism-Dashboard/prism-hot-tub.js
 *   2. HA → Settings → Dashboards → Resources → add:
 *        URL:  /local/community/Prism-Dashboard/prism-hot-tub.js
 *        Type: JavaScript module
 *
 * YAML config example:
 *   type: custom:prism-hot-tub
 *   name: Hot Tub
 *   power_entity:            switch.hot_tub
 *   pump_entity:             switch.hot_tub_pump
 *   heater_entity:           switch.hot_tub_heater
 *   bubbles_entity:          switch.hot_tub_bubbles
 *   target_temp_entity:      input_number.hot_tub_target_temp
 *   automation_entity:       input_boolean.hot_tub_automation
 *   temp_sensor_entity:      sensor.hot_tub_water_temp
 *   calculated_temp_entity:  sensor.hot_tub_feels_like
 *   calculated_temp_label:   Feels Like
 *   ready_time_entity:       sensor.hot_tub_ready_time
 *   ready_time_label:        Ready At
 *   history_hours:           24            # hours of temperature history to show in the graph
 *   temp_unit:               C
 */

class PrismHotTubCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass           = null;
    this._config         = {};
    this._historyData    = [];
    this._historyFetched = 0;
    this._fetchPending   = false;
  }

  // ── Config / stub ──────────────────────────────────────────────────────────
  static getStubConfig() {
    return {
      name:                   'Hot Tub',
      power_entity:           'switch.hot_tub',
      pump_entity:            'switch.hot_tub_pump',
      heater_entity:          'switch.hot_tub_heater',
      bubbles_entity:         'switch.hot_tub_bubbles',
      target_temp_entity:     'input_number.hot_tub_target_temp',
      automation_entity:      'input_boolean.hot_tub_automation',
      temp_sensor_entity:     'sensor.hot_tub_water_temp',
      calculated_temp_entity: '',
      calculated_temp_label:  'Feels Like',
      ready_time_entity:      '',
      ready_time_label:       'Ready At',
      history_hours:          24,
      temp_unit:              'C',
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'name',                   label: 'Card name',                             selector: { text: {} } },
        { name: 'power_entity',           label: 'Power switch',              required: true, selector: { entity: { domain: 'switch' } } },
        { name: 'pump_entity',            label: 'Pump switch',               required: true, selector: { entity: { domain: 'switch' } } },
        { name: 'heater_entity',          label: 'Heater switch',             required: true, selector: { entity: { domain: 'switch' } } },
        { name: 'bubbles_entity',         label: 'Bubbles / jets switch',     required: true, selector: { entity: { domain: 'switch' } } },
        { name: 'target_temp_entity',     label: 'Target temperature',        required: true, selector: { entity: { domain: 'input_number' } } },
        { name: 'automation_entity',      label: 'Automation toggle',         required: true, selector: { entity: { domain: 'input_boolean' } } },
        { name: 'temp_sensor_entity',     label: 'Water temp sensor',         required: true, selector: { entity: { domain: 'sensor', device_class: 'temperature' } } },
        { name: 'calculated_temp_entity', label: 'Calculated temp sensor (optional)',         selector: { entity: { domain: 'sensor' } } },
        { name: 'calculated_temp_label',  label: 'Calculated temp label',                     selector: { text: {} } },
        { name: 'ready_time_entity',      label: 'Ready-time sensor (optional)',               selector: { entity: { domain: 'sensor' } } },
        { name: 'ready_time_label',       label: 'Ready-time label',                           selector: { text: {} } },
        {
          name:     'history_hours',
          label:    'Graph timeframe (hours)',
          selector: { number: { min: 1, max: 168, step: 1, mode: 'slider', unit_of_measurement: 'h' } },
        },
        {
          name:     'temp_unit',
          label:    'Temperature unit',
          selector: { select: { options: [{ value: 'C', label: 'Celsius (°C)' }, { value: 'F', label: 'Fahrenheit (°F)' }] } },
        },
      ],
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  setConfig(config) {
    if (!config) throw new Error('PrismHotTub: missing config');
    this._config = {
      temp_unit:             'C',
      calculated_temp_label: 'Feels Like',
      ready_time_label:      'Ready At',
      history_hours:         24,
      ...config,
    };
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    const now  = Date.now();
    if (now - this._historyFetched > 5 * 60 * 1000 && !this._fetchPending) {
      this._fetchHistory();
    }
    this.render();
  }

  // ── History fetch ──────────────────────────────────────────────────────────
  async _fetchHistory() {
    if (!this._hass || !this._config.temp_sensor_entity) return;
    this._fetchPending   = true;
    this._historyFetched = Date.now();
    try {
      const end    = new Date();
      const hours  = Math.max(1, parseInt(this._config.history_hours ?? 24, 10));
      const start  = new Date(end.getTime() - hours * 60 * 60 * 1000);
      const entity = this._config.temp_sensor_entity;
      const data   = await this._hass.callApi(
        'GET',
        `history/period/${start.toISOString()}?filter_entity_id=${entity}&end_time=${end.toISOString()}&minimal_response=true`
      );
      if (data && Array.isArray(data[0])) {
        this._historyData = data[0];
        this.render();
      }
    } catch (e) {
      console.warn('PrismHotTub: history fetch failed –', e);
    } finally {
      this._fetchPending = false;
    }
  }

  // ── HA helpers ─────────────────────────────────────────────────────────────
  _toggle(entityId) {
    if (!this._hass || !entityId) return;
    const state = this._hass.states[entityId];
    if (!state) return;
    this._hass.callService(
      entityId.split('.')[0],
      state.state === 'on' ? 'turn_off' : 'turn_on',
      { entity_id: entityId }
    );
  }

  _adjustTemp(delta) {
    if (!this._hass || !this._config.target_temp_entity) return;
    const state   = this._hass.states[this._config.target_temp_entity];
    if (!state) return;
    const current = parseFloat(state.state) || 0;
    const min     = parseFloat(state.attributes?.min)  ?? 10;
    const max     = parseFloat(state.attributes?.max)  ?? 45;
    const step    = parseFloat(state.attributes?.step) ?? 0.5;
    const newVal  = Math.min(max, Math.max(min, +(current + delta * step).toFixed(1)));
    this._hass.callService('input_number', 'set_value', {
      entity_id: this._config.target_temp_entity,
      value:     newVal,
    });
  }

  // ── Sparkline ──────────────────────────────────────────────────────────────
  _buildSparkline(tempColor) {
    const raw = this._historyData;
    if (!raw || raw.length < 2) return `<div class="graph-empty">Fetching history…</div>`;

    const points = raw.map(p => parseFloat(p.s ?? p.state)).filter(v => !isNaN(v));
    if (points.length < 2) return `<div class="graph-empty">Not enough data yet</div>`;

    const unit    = this._config.temp_unit === 'F' ? '°F' : '°C';
    const min     = Math.min(...points);
    const max     = Math.max(...points);
    const pad     = Math.max((max - min) * 0.15, 0.5);
    const lo      = min - pad, hi = max + pad;
    const W       = 300, H = 56;
    const px      = i => ((i / (points.length - 1)) * W).toFixed(2);
    const py      = v => (H - ((v - lo) / (hi - lo)) * H).toFixed(2);
    const linePts = points.map((v, i) => `${px(i)},${py(v)}`).join(' ');
    const areaD   = `M0,${H} ` + points.map((v, i) => `L${px(i)},${py(v)}`).join(' ') + ` L${W},${H} Z`;
    const minIdx  = points.indexOf(min);
    const maxIdx  = points.indexOf(max);
    const cx      = px(points.length - 1);
    const cy      = py(points[points.length - 1]);

    return `
      <svg viewBox="0 0 ${W} ${H + 16}" preserveAspectRatio="none"
           style="width:100%;height:72px;overflow:visible">
        <defs>
          <linearGradient id="htGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="${tempColor}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${tempColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#htGrad)"/>
        <polyline points="${linePts}" fill="none" stroke="${tempColor}" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${cx}" cy="${cy}" r="4" fill="${tempColor}"
                filter="drop-shadow(0 0 4px ${tempColor}99)"/>
        <text x="${px(minIdx)}" y="${H + 13}" text-anchor="middle"
              font-size="9" fill="rgba(255,255,255,0.35)" font-family="monospace">
          ${min.toFixed(1)}${unit}
        </text>
        <text x="${px(maxIdx)}" y="${H + 13}" text-anchor="middle"
              font-size="9" fill="rgba(255,255,255,0.35)" font-family="monospace">
          ${max.toFixed(1)}${unit}
        </text>
      </svg>`;
  }

  // ── Main render ────────────────────────────────────────────────────────────
  render() {
    if (!this._config || !this.shadowRoot) return;

    const hass = this._hass;
    const cfg  = this._config;
    const unit = cfg.temp_unit === 'F' ? '°F' : '°C';

    const getState = id => (id && hass) ? hass.states[id] : null;
    const isOn     = id => getState(id)?.state === 'on';
    const getNum   = id => parseFloat(getState(id)?.state ?? 'NaN');

    const powerOn   = isOn(cfg.power_entity);
    const pumpOn    = isOn(cfg.pump_entity);
    const heaterOn  = isOn(cfg.heater_entity);
    const bubblesOn = isOn(cfg.bubbles_entity);
    const autoOn    = isOn(cfg.automation_entity);

    const waterTemp  = getNum(cfg.temp_sensor_entity);
    const targetTemp = getNum(cfg.target_temp_entity);
    const calcTemp   = cfg.calculated_temp_entity ? getNum(cfg.calculated_temp_entity) : NaN;
    const calcLabel  = cfg.calculated_temp_label  || 'Feels Like';

    // Ready-time sensor — display raw state string (e.g. "21:45" or "1h 23m")
    const readyState = cfg.ready_time_entity ? getState(cfg.ready_time_entity) : null;
    const readyVal   = readyState?.state ?? null;
    const readyLabel = cfg.ready_time_label || 'Ready At';

    const tempState = getState(cfg.target_temp_entity);
    const minTemp   = parseFloat(tempState?.attributes?.min  ?? 10);
    const maxTemp   = parseFloat(tempState?.attributes?.max  ?? 45);

    const imgH         = 320; // fixed image height
    const historyHours  = Math.max(1, parseInt(cfg.history_hours ?? 24, 10));

    const name       = cfg.name || 'Hot Tub';
    const waterValid = !isNaN(waterTemp) && waterTemp > 0;
    const tgtValid   = !isNaN(targetTemp) && targetTemp > 0;
    const calcValid  = cfg.calculated_temp_entity && !isNaN(calcTemp);

    const statusText = !powerOn  ? 'STANDBY'
                     : heaterOn  ? 'HEATING'
                     : pumpOn    ? 'CIRCULATING'
                     : bubblesOn ? 'JETS ACTIVE'
                     : 'ACTIVE';

    const tempColor  = !waterValid      ? '#60a5fa'
                     : waterTemp >= 38  ? '#ef4444'
                     : waterTemp >= 35  ? '#f97316'
                     : waterTemp >= 30  ? '#0096FF'
                     : '#60a5fa';

    const calcColor  = !calcValid      ? '#22d3ee'
                     : calcTemp >= 38  ? '#ef4444'
                     : calcTemp >= 35  ? '#f97316'
                     : '#22d3ee';

    const dotColor   = !powerOn ? 'rgba(255,255,255,0.2)' : heaterOn ? '#f97316' : '#22c55e';
    const dotAnim    = powerOn  ? 'animation: pulse 2s infinite;' : '';
    const statColor  = !powerOn ? 'rgba(255,255,255,0.4)' : heaterOn ? '#fb923c' : '#4ade80';

    // Target temp badge colour follows heater state
    const tgtBadgeColor = heaterOn ? '#f97316' : tgtValid ? '#0096FF' : '#60a5fa';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, -apple-system, sans-serif; }

        /* ── Card shell ─────────────────────────────────────────────────── */
        .card {
          position: relative; width: 100%; border-radius: 32px; padding: 24px;
          display: flex; flex-direction: column; overflow: hidden;
          background-color: rgba(30, 32, 36, 0.95);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.6);
          color: white; box-sizing: border-box; user-select: none;
        }
        .noise {
          position: absolute; inset: 0; opacity: 0.03; pointer-events: none;
          background-image: url('https://grainy-gradients.vercel.app/noise.svg');
          mix-blend-mode: overlay;
        }

        /* ── Header ─────────────────────────────────────────────────────── */
        .header {
          display: flex; justify-content: space-between; align-items: center;
          z-index: 20; margin-bottom: 20px;
        }
        .header-left  { display: flex; align-items: center; gap: 12px; }
        .header-right { display: flex; align-items: center; gap: 8px; }

        .printer-icon {
          width: 44px; height: 44px; min-width: 44px; border-radius: 14px;
          background: linear-gradient(145deg, #2d3038, #22252b);
          display: flex; align-items: center; justify-content: center; color: #0096FF;
          box-shadow:
            3px 3px 6px rgba(0,0,0,0.4),
            -2px -2px 4px rgba(255,255,255,0.03),
            inset 1px 1px 2px rgba(255,255,255,0.05);
        }
        .printer-icon ha-icon { width: 22px; height: 22px; display: flex; filter: drop-shadow(0 0 4px rgba(0,150,255,0.5)); }
        .printer-icon.on {
          background: linear-gradient(145deg, #1c1e24, #25282e);
          box-shadow: inset 2px 2px 4px rgba(0,0,0,0.4), inset -1px -1px 3px rgba(255,255,255,0.03);
        }
        .printer-icon.on ha-icon { filter: drop-shadow(0 0 6px rgba(0,150,255,0.8)); }

        .title       { font-size: 1.125rem; font-weight: 700; line-height: 1; color: rgba(255,255,255,0.9); }
        .status-row  { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
        .status-dot  { width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; ${dotAnim} }
        .status-text { font-size: 0.75rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: ${statColor}; }

        /* Neumorphic circle buttons (header-right) */
        .header-icon-btn {
          width: 36px; height: 36px; min-width: 36px; border-radius: 50%;
          background: linear-gradient(145deg, #2d3038, #22252b); border: none;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.35); cursor: pointer;
          transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1); flex-shrink: 0;
          box-shadow:
            3px 3px 6px rgba(0,0,0,0.4),
            -2px -2px 4px rgba(255,255,255,0.03),
            inset 1px 1px 2px rgba(255,255,255,0.05);
        }
        .header-icon-btn ha-icon { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }
        .header-icon-btn:hover   { color: rgba(255,255,255,0.7); }
        .header-icon-btn:active  { transform: scale(0.95); box-shadow: inset 3px 3px 6px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(255,255,255,0.03); }

        .btn-power-on { background: linear-gradient(145deg, #1c1e24, #25282e); color: #4ade80; box-shadow: inset 3px 3px 6px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(255,255,255,0.03), 0 0 14px rgba(74,222,128,0.2); }
        .btn-power-on ha-icon { filter: drop-shadow(0 0 5px rgba(74,222,128,0.7)); }
        .btn-power-on:hover   { color: #f87171; }
        .btn-power-on:hover ha-icon  { filter: drop-shadow(0 0 6px rgba(248,113,113,0.7)); }
        .btn-power-off:hover  { color: #4ade80; }
        .btn-power-off:hover ha-icon { filter: drop-shadow(0 0 6px rgba(74,222,128,0.7)); }
        .btn-auto-on { background: linear-gradient(145deg, #1c1e24, #25282e); color: #4ade80; box-shadow: inset 3px 3px 6px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(255,255,255,0.03); }
        .btn-auto-on ha-icon { filter: drop-shadow(0 0 5px rgba(74,222,128,0.6)); }

        /* ── Main visual panel ──────────────────────────────────────────── */
        .main-visual {
          position: relative; border-radius: 24px;
          background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05);
          margin-bottom: 20px; overflow: hidden;
        }
        .main-visual-inner {
          position: relative; width: 100%;
          height: ${imgH}px;
          display: flex; align-items: stretch; justify-content: center;
        }

        /* Tub photo */
        .tub-img {
          width: 100%; height: 100%;
          object-fit: cover; object-position: center; display: block;
          filter: brightness(${powerOn ? '0.82' : '0.32'}) drop-shadow(0 0 20px rgba(0,150,255,0.08));
          transition: filter 0.4s ease;
        }
        .tub-img-fallback {
          display: none; width: 100%; height: ${imgH}px;
          align-items: center; justify-content: center; color: rgba(255,255,255,0.15);
        }
        .tub-img-fallback ha-icon { --mdc-icon-size: 80px; }

        /* ── Target temp badge — centred at bottom of image ─────────────── */
        /* Layout: [−] [38°C TARGET] [+] */
        .tgt-badge {
          position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 0;
          background: linear-gradient(135deg, rgba(0,0,0,0.82), rgba(10,10,10,0.9));
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          border: 1px solid ${tgtBadgeColor}44; border-radius: 999px; z-index: 20;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          overflow: hidden; /* keep children inside pill */
        }
        .tgt-badge-btn {
          width: 36px; height: 36px; border: none; cursor: pointer;
          background: transparent; color: rgba(255,255,255,0.55);
          font-size: 22px; font-weight: 300; line-height: 1; font-family: inherit;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s; flex-shrink: 0;
        }
        .tgt-badge-btn:hover  { background: rgba(255,255,255,0.1); color: white; }
        .tgt-badge-btn:active { background: rgba(255,255,255,0.05); transform: scale(0.9); }
        .tgt-badge-center {
          display: flex; flex-direction: column; align-items: center; padding: 6px 10px;
          border-left: 1px solid rgba(255,255,255,0.08); border-right: 1px solid rgba(255,255,255,0.08);
          min-width: 76px;
        }
        .tgt-badge-val {
          font-size: 1.2rem; font-weight: 700; font-family: 'SF Mono', Monaco, monospace;
          color: ${tgtBadgeColor}; text-shadow: 0 0 8px ${tgtBadgeColor}44; white-space: nowrap; line-height: 1;
        }
        .tgt-badge-lbl {
          font-size: 8px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: rgba(255,255,255,0.35); margin-top: 3px;
        }

        /* ── Overlay pill helpers ───────────────────────────────────────── */
        .overlay-left {
          position: absolute; left: 12px; top: 0; bottom: 0;
          display: flex; flex-direction: column; justify-content: center; gap: 8px; z-index: 20;
        }
        .overlay-right {
          position: absolute; right: 12px; top: 0; bottom: 0;
          display: flex; flex-direction: column; justify-content: center; gap: 8px; z-index: 20;
        }
        .overlay-pill {
          display: flex; align-items: center; gap: 8px;
          background: rgba(0,0,0,0.52); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 999px;
          padding: 6px 12px 6px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
          transition: border-color 0.2s, background 0.2s;
        }
        .overlay-pill.right   { flex-direction: row-reverse; padding: 6px 8px 6px 12px; text-align: right; }
        .overlay-pill.toggle  { cursor: pointer; }
        .overlay-pill.toggle:hover  { background: rgba(0,0,0,0.68); }
        .overlay-pill.toggle:active { transform: scale(0.97); }

        .pill-icon-container {
          width: 24px; height: 24px; min-width: 24px; border-radius: 50%;
          background: rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .pill-icon-container ha-icon { width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; }
        .pill-content { display: flex; flex-direction: column; line-height: 1; }
        .pill-value   { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.9); }
        .pill-label   { font-size: 8px; font-weight: 700; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-top: 2px; }

        /* ── Graph ──────────────────────────────────────────────────────── */
        .graph-section {
          background: rgba(0,0,0,0.2); border-radius: 20px;
          padding: 14px 16px; border: 1px solid rgba(255,255,255,0.05);
        }
        .graph-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .graph-title  { font-size: 0.7rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
        .graph-val    { font-size: 0.875rem; font-family: monospace; color: ${tempColor}; font-weight: 700; filter: drop-shadow(0 0 4px ${tempColor}66); }
        .graph-empty  { text-align: center; color: rgba(255,255,255,0.2); font-size: 12px; padding: 18px 0; }

        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      </style>

      <div class="card">
        <div class="noise"></div>

        <!-- ══ HEADER ════════════════════════════════════════════════════ -->
        <div class="header">
          <div class="header-left">
            <div class="printer-icon ${powerOn ? 'on' : ''}">
              <ha-icon icon="mdi:hot-tub"></ha-icon>
            </div>
            <div>
              <div class="title">${name}</div>
              <div class="status-row">
                <div class="status-dot"></div>
                <span class="status-text">${statusText}</span>
              </div>
            </div>
          </div>
          <div class="header-right">
            <button class="header-icon-btn ${powerOn ? 'btn-power-on' : 'btn-power-off'} js-power"
                    title="Power ${powerOn ? 'Off' : 'On'}">
              <ha-icon icon="mdi:power"></ha-icon>
            </button>
            <button class="header-icon-btn ${autoOn ? 'btn-auto-on' : ''} js-auto"
                    title="Automation: ${autoOn ? 'On' : 'Off'}">
              <ha-icon icon="mdi:robot-outline"></ha-icon>
            </button>
          </div>
        </div>

        <!-- ══ MAIN VISUAL ════════════════════════════════════════════════ -->
        <div class="main-visual">
          <div class="main-visual-inner">

            <!-- Tub photo -->
            <img class="tub-img"
                 src="/local/images/hollywood-tub.png"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                 alt="${name}" />
            <div class="tub-img-fallback">
              <ha-icon icon="mdi:hot-tub"></ha-icon>
            </div>

            <!-- ── Target temp badge with − / + controls ──────────────── -->
            <div class="tgt-badge">
              <button class="tgt-badge-btn js-temp-down" title="Decrease target">−</button>
              <div class="tgt-badge-center">
                <span class="tgt-badge-val">${tgtValid ? targetTemp + unit : '—'}</span>
                <span class="tgt-badge-lbl">Target</span>
              </div>
              <button class="tgt-badge-btn js-temp-up" title="Increase target">+</button>
            </div>

            <!-- ── LEFT pills: Pump | Heater | Jets (all clickable) ───── -->
            <div class="overlay-left">

              <div class="overlay-pill toggle js-pump"
                   style="border-color:${pumpOn ? '#0096FF55' : 'rgba(255,255,255,0.1)'}">
                <div class="pill-icon-container">
                  <ha-icon icon="mdi:pump"
                    style="color:${pumpOn ? '#0096FF' : 'rgba(255,255,255,0.3)'}"></ha-icon>
                </div>
                <div class="pill-content">
                  <span class="pill-value"
                    style="color:${pumpOn ? '#60a5fa' : 'rgba(255,255,255,0.9)'}">
                    ${pumpOn ? 'ON' : 'OFF'}
                  </span>
                  <span class="pill-label">Pump</span>
                </div>
              </div>

              <div class="overlay-pill toggle js-heater"
                   style="border-color:${heaterOn ? '#f9731655' : 'rgba(255,255,255,0.1)'}">
                <div class="pill-icon-container">
                  <ha-icon icon="mdi:fire"
                    style="color:${heaterOn ? '#f97316' : 'rgba(255,255,255,0.3)'}"></ha-icon>
                </div>
                <div class="pill-content">
                  <span class="pill-value"
                    style="color:${heaterOn ? '#fb923c' : 'rgba(255,255,255,0.9)'}">
                    ${heaterOn ? 'ON' : 'OFF'}
                  </span>
                  <span class="pill-label">Heater</span>
                </div>
              </div>

              <div class="overlay-pill toggle js-bubbles"
                   style="border-color:${bubblesOn ? '#22d3ee55' : 'rgba(255,255,255,0.1)'}">
                <div class="pill-icon-container">
                  <ha-icon icon="mdi:waves"
                    style="color:${bubblesOn ? '#22d3ee' : 'rgba(255,255,255,0.3)'}"></ha-icon>
                </div>
                <div class="pill-content">
                  <span class="pill-value"
                    style="color:${bubblesOn ? '#67e8f9' : 'rgba(255,255,255,0.9)'}">
                    ${bubblesOn ? 'ON' : 'OFF'}
                  </span>
                  <span class="pill-label">Jets</span>
                </div>
              </div>

            </div><!-- .overlay-left -->

            <!-- ── RIGHT pills: Water | Calculated | Ready time ──────── -->
            <div class="overlay-right">

              <!-- Water temp — read only -->
              <div class="overlay-pill right">
                <div class="pill-icon-container">
                  <ha-icon icon="mdi:thermometer-water"
                    style="color:${tempColor}"></ha-icon>
                </div>
                <div class="pill-content">
                  <span class="pill-value">${waterValid ? waterTemp.toFixed(1) + '°' : '—'}</span>
                  <span class="pill-label">Water</span>
                </div>
              </div>

              <!-- Calculated temp — only shown if entity configured -->
              ${cfg.calculated_temp_entity ? `
              <div class="overlay-pill right">
                <div class="pill-icon-container">
                  <ha-icon icon="mdi:thermometer-lines"
                    style="color:${calcColor}"></ha-icon>
                </div>
                <div class="pill-content">
                  <span class="pill-value">${calcValid ? calcTemp.toFixed(1) + '°' : '—'}</span>
                  <span class="pill-label">${calcLabel}</span>
                </div>
              </div>` : ''}

              <!-- Ready time — only shown if entity configured -->
              ${cfg.ready_time_entity ? `
              <div class="overlay-pill right">
                <div class="pill-icon-container">
                  <ha-icon icon="mdi:clock-check-outline"
                    style="color:${readyVal && readyVal !== 'unavailable' ? '#a78bfa' : 'rgba(255,255,255,0.3)'}"></ha-icon>
                </div>
                <div class="pill-content">
                  <span class="pill-value"
                    style="color:${readyVal && readyVal !== 'unavailable' ? '#c4b5fd' : 'rgba(255,255,255,0.4)'}">
                    ${readyVal && readyVal !== 'unavailable' && readyVal !== 'unknown' ? readyVal : '—'}
                  </span>
                  <span class="pill-label">${readyLabel}</span>
                </div>
              </div>` : ''}

            </div><!-- .overlay-right -->

          </div><!-- .main-visual-inner -->
        </div><!-- .main-visual -->

        <!-- ══ 24h TEMPERATURE GRAPH ══════════════════════════════════════ -->
        <div class="graph-section">
          <div class="graph-header">
            <span class="graph-title">${historyHours}h Temperature</span>
            <span class="graph-val">${waterValid ? waterTemp.toFixed(1) + unit : '—'}</span>
          </div>
          ${this._buildSparkline(tempColor)}
        </div>

      </div><!-- .card -->
    `;

    this._attachListeners();
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  _attachListeners() {
    const r  = this.shadowRoot;
    const on = (sel, fn) => r.querySelector(sel)?.addEventListener('click', fn);

    on('.js-power',     () => this._toggle(this._config.power_entity));
    on('.js-auto',      () => this._toggle(this._config.automation_entity));
    on('.js-pump',      () => this._toggle(this._config.pump_entity));
    on('.js-heater',    () => this._toggle(this._config.heater_entity));
    on('.js-bubbles',   () => this._toggle(this._config.bubbles_entity));
    on('.js-temp-up',   e  => { e.stopPropagation(); this._adjustTemp(+1); });
    on('.js-temp-down', e  => { e.stopPropagation(); this._adjustTemp(-1); });
  }

  getCardSize() { return 7; }
}

customElements.define('prism-hot-tub', PrismHotTubCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'prism-hot-tub',
  name:        'Prism Hot Tub',
  preview:     true,
  description: 'Hot tub control card – Prism Dashboard aesthetic',
});