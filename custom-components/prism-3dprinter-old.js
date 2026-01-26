class Prism3DPrinterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.showCamera = false;
    this._hasRendered = false;
  }

  static getStubConfig() {
    return {
      entity: "sensor.3d_printer",
      name: "3D Printer",
      camera_entity: "camera.3d_printer",
      image: "/local/community/Prism-Dashboard/images/printer-blank.jpg",
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: { entity: {} },
        },
        {
          name: "name",
          selector: { text: {} },
        },
        {
          name: "camera_entity",
          selector: { entity: { domain: "camera" } },
        },
        {
          name: "image",
          selector: { text: {} },
        },
      ],
    };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("Please define an entity");
    }
    // Shallow copy to avoid read-only issues
    this.config = { ...config };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._hasRendered) {
      this.render();
      this._hasRendered = true;
      this._setupListeners();
    } else {
      this.render();
      this._setupListeners();
    }
  }

  getCardSize() {
    return 6;
  }

  connectedCallback() {
    if (!this._hasRendered) {
      this.render();
      this._hasRendered = true;
      this._setupListeners();
    }
  }

  _getPrinterState() {
    const hass = this._hass;
    const cfg = this.config || {};

    const entityId = cfg.entity;
    const stateObj = hass && entityId ? hass.states[entityId] : null;
    const stateStr = stateObj ? stateObj.state : "unavailable";
    const attr = stateObj ? stateObj.attributes : {};

    const progress = attr.progress ?? 0;
    const printTimeLeft = attr.print_time_left ?? "0h 0m";
    const nozzleTemp = attr.nozzle_temp ?? 0;
    const targetNozzleTemp = attr.target_nozzle_temp ?? 0;
    const bedTemp = attr.bed_temp ?? 0;
    const targetBedTemp = attr.target_bed_temp ?? 0;
    const fanSpeed = attr.fan_speed ?? 0;
    const currentLayer = attr.current_layer ?? 0;
    const totalLayers = attr.total_layers ?? 0;
    const name = cfg.name || attr.friendly_name || "3D Printer";

    const cameraEntity = cfg.camera_entity;
    const cameraState =
      hass && cameraEntity ? hass.states[cameraEntity] : null;
    const cameraImage =
      cameraState?.attributes?.entity_picture ||
      cfg.image ||
      "/local/community/Prism-Dashboard/images/printer-blank.jpg";

    const isLightOn = attr.light === "on" || true; // keep bright look by default

    return {
      stateStr,
      progress,
      printTimeLeft,
      nozzleTemp,
      targetNozzleTemp,
      bedTemp,
      targetBedTemp,
      fanSpeed,
      currentLayer,
      totalLayers,
      name,
      cameraEntity,
      cameraImage,
      isLightOn,
    };
  }

  render() {
    const {
      stateStr,
      progress,
      printTimeLeft,
      nozzleTemp,
      targetNozzleTemp,
      bedTemp,
      targetBedTemp,
      fanSpeed,
      currentLayer,
      totalLayers,
      name,
      cameraEntity,
      cameraImage,
      isLightOn,
    } = this._getPrinterState();

    const layerInfo =
      totalLayers && currentLayer
        ? `Layer ${currentLayer}/${totalLayers}`
        : "";

    const wrapper = `
      <style>
        .card {
          position: relative;
          width: 100%;
          min-height: 400px;
          border-radius: 32px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          transition: all 0.2s ease-in-out;
          overflow: hidden;
          background-color: rgba(30, 32, 36, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: white;
          box-sizing: border-box;
        }
        .noise {
          position: absolute;
          inset: 0;
          opacity: 0.03;
          pointer-events: none;
          background-image: url("https://grainy-gradients.vercel.app/noise.svg");
          mix-blend-mode: overlay;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          z-index: 20;
          margin-bottom: 8px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .icon-container {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
          transition: all 0.3s;
        }
        .icon-printing {
          background-color: rgba(34, 197, 94, 0.2);
          color: rgb(74, 222, 128);
          filter: drop-shadow(0 0 6px rgba(74, 222, 128, 0.6));
        }
        .icon-paused {
          background-color: rgba(234, 179, 8, 0.2);
          color: rgb(250, 204, 21);
          filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.6));
        }
        .icon-idle {
          background-color: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.4);
        }
        .title {
          color: rgba(255, 255, 255, 0.9);
          font-weight: 700;
          font-size: 1.125rem;
          line-height: 1.25;
          margin: 0;
        }
        .subtitle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }
        .status-badge {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: currentColor;
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .layer-badge {
          color: rgba(255, 255, 255, 0.3);
          font-size: 0.75rem;
          padding: 2px 6px;
          border-radius: 4px;
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .main-visual {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 12px;
        }
        .image-container {
          position: relative;
          width: 100%;
          max-width: 280px;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .printer-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 20px 30px rgba(0,0,0,0.5));
          z-index: 10;
          transition: filter 0.5s ease;
        }
        .light-on {
          filter: drop-shadow(0 0 15px rgba(59,130,246,0.3)) brightness(1.1);
        }
        .light-off {
          filter: drop-shadow(0 20px 30px rgba(0,0,0,0.5)) brightness(0.7);
        }
        .progress-section {
          width: 100%;
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .progress-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.6);
        }
        .progress-track {
          width: 100%;
          background-color: rgba(20, 20, 20, 0.8);
          height: 12px;
          border-radius: 9999px;
          overflow: hidden;
          position: relative;
          box-shadow: inset 2px 2px 5px rgba(0,0,0,0.8), inset -1px -1px 2px rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          border-top: 1px solid rgba(0, 0, 0, 0.2);
        }
        .progress-bar {
          height: 100%;
          background-color: rgb(59, 130, 246);
          border-radius: 9999px;
          position: relative;
          box-shadow: 2px 0 5px rgba(59,130,246,0.4);
          width: ${progress}%;
          transition: width 0.5s ease-out;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin: 16px 0;
          z-index: 10;
        }
        .stat-card {
          background-color: rgba(20, 20, 20, 0.8);
          border-radius: 12px;
          padding: 8px;
          box-shadow: inset 2px 2px 5px rgba(0,0,0,0.8), inset -1px -1px 2px rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          border-top: 1px solid rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .stat-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.625rem;
          text-transform: uppercase;
        }
        .stat-label ha-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .stat-value {
          font-size: 0.875rem;
          font-weight: 700;
          color: white;
          font-family: monospace;
        }
        .stat-target {
          font-size: 0.625rem;
          color: rgba(255, 255, 255, 0.3);
        }
        .controls-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          z-index: 10;
        }
        .btn {
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          outline: none;
          font-family: inherit;
        }
        .btn ha-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-pause {
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.6);
          box-shadow: 0 4px 10px -2px rgba(0,0,0,0.3);
        }
        .btn-stop {
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.6);
          box-shadow: 0 4px 10px -2px rgba(0,0,0,0.3);
        }
        .btn-light {
          background-color: rgba(20, 20, 20, 0.8);
          color: white;
          box-shadow: inset 2px 2px 5px rgba(0,0,0,0.8), inset -1px -1px 2px rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          border-top: 1px solid rgba(0, 0, 0, 0.2);
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      </style>

      <div class="card">
        <div class="noise"></div>

        <div class="header">
          <div class="header-left">
            <div class="icon-container ${
              stateStr === "printing"
                ? "icon-printing"
                : stateStr === "paused"
                ? "icon-paused"
                : "icon-idle"
            }">
              <ha-icon icon="mdi:printer-3d-nozzle"></ha-icon>
            </div>
            <div>
              <h3 class="title">${name}</h3>
              <div class="subtitle-row">
                <span class="status-badge" style="color: ${
                  stateStr === "printing"
                    ? "#4ade80"
                    : stateStr === "paused"
                    ? "#facc15"
                    : "rgba(255,255,255,0.6)"
                }">
                  <span class="status-dot"></span>
                  ${stateStr}
                </span>
                ${
                  layerInfo
                    ? `<span class="layer-badge">${layerInfo}</span>`
                    : ""
                }
              </div>
            </div>
          </div>
        </div>

        <div class="main-visual">
          <div class="image-container" id="image-toggle">
            <img src="${
              this.showCamera && cameraEntity ? cameraImage : cameraImage
            }" class="printer-img ${
      isLightOn ? "light-on" : "light-off"
    }" alt="Printer" />
          </div>

          <div class="progress-section">
            <div class="progress-label">
              <span>Progress</span>
              <span style="font-family: monospace; color: white;">${progress}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-bar"></div>
            </div>
            <div class="progress-label" style="justify-content: flex-end; font-family: monospace; font-size: 0.625rem; opacity: 0.6; margin-top: 4px;">
              -${printTimeLeft} remaining
            </div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">
              <ha-icon icon="mdi:thermometer" style="width: 12px; height: 12px;"></ha-icon> Nozzle
            </div>
            <span class="stat-value">${nozzleTemp}°</span>
            <span class="stat-target">${targetNozzleTemp}°</span>
          </div>
          <div class="stat-card">
            <div class="stat-label">
              <ha-icon icon="mdi:radiator" style="width: 12px; height: 12px;"></ha-icon> Bed
            </div>
            <span class="stat-value">${bedTemp}°</span>
            <span class="stat-target">${targetBedTemp}°</span>
          </div>
          <div class="stat-card">
            <div class="stat-label">
              <ha-icon icon="mdi:fan" style="width: 12px; height: 12px;"></ha-icon> Fan
            </div>
            <span class="stat-value">${fanSpeed}%</span>
            <span class="stat-target">${layerInfo || "-"}</span>
          </div>
        </div>

        <div class="controls-grid">
          <button class="btn btn-pause" id="pause-btn">
            <ha-icon icon="${
              stateStr === "printing" ? "mdi:pause" : "mdi:play"
            }" style="width: 16px; height: 16px;"></ha-icon>
            <span style="font-size: 0.75rem; font-weight: 700;">${
              stateStr === "printing" ? "Pause" : "Resume"
            }</span>
          </button>

          <button class="btn btn-stop" id="stop-btn">
            <ha-icon icon="mdi:stop" style="width: 16px; height: 16px;"></ha-icon>
            <span style="font-size: 0.75rem; font-weight: 700;">Stop</span>
          </button>

          <button class="btn btn-light" id="light-btn">
            <ha-icon icon="mdi:lightbulb" style="width: 16px; height: 16px;"></ha-icon>
          </button>
        </div>
      </div>
    `;

    this.shadowRoot.innerHTML = wrapper;
  }

  _setupListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    const imgToggle = root.getElementById("image-toggle");
    if (imgToggle) {
      imgToggle.onclick = () => {
        this.showCamera = !this.showCamera;
        this.render();
        this._setupListeners();
      };
    }

    const pauseBtn = root.getElementById("pause-btn");
    if (pauseBtn) {
      pauseBtn.onclick = (e) => {
        e.stopPropagation();
        // Placeholder: user can hook to printer services here if needed
        console.debug("prism-3dprinter: pause/resume clicked");
      };
    }

    const stopBtn = root.getElementById("stop-btn");
    if (stopBtn) {
      stopBtn.onclick = (e) => {
        e.stopPropagation();
        console.debug("prism-3dprinter: stop clicked");
      };
    }

    const lightBtn = root.getElementById("light-btn");
    if (lightBtn) {
      lightBtn.onclick = (e) => {
        e.stopPropagation();
        console.debug("prism-3dprinter: light toggle clicked");
      };
    }
  }
}

customElements.define("prism-3dprinter", Prism3DPrinterCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "prism-3dprinter",
  name: "Prism 3D Printer",
  preview: true,
  description:
    "3D printer status card with glassmorphism styling for temperature, progress and layers",
});


