const CONFIG = {
    // Colors for N models. Cycle through these.
    colors: ['cyan', 'magenta', 'lime', 'yellow', 'orange', 'red', 'purple', 'white']
};

const state = {
    currentImage: null,
    images: [],
    // annotations map: model_key -> array of boxes
    annotations: {},
    // models config: loaded from backend
    modelsConfig: {},
    // labels config: loaded from backend {id: name}
    labelsConfig: {},

    // UI selections
    filters: {
        classes: new Set() // stores Class Names
    },
    // model_key -> boolean
    visibleModels: {},
    confidence: 0.35, // Default from config prompt

    // Counts per class: { className: count }
    classCounts: {},
    classColors: {}, // className -> hexColor

    // Visual Settings Defaults
    lineWidth: 2,
    fontSize: 20,
    showLabels: true,
    showScores: true,
    transform: { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 }
};

// DOM Elements
const els = {
    imageList: document.getElementById('image-list'),
    img: document.getElementById('source-image'),
    canvas: document.getElementById('overlay-canvas'),
    container: document.getElementById('canvas-container'),
    mainView: document.querySelector('.main-view'),
    modelToggles: document.getElementById('model-toggles'),
    confSlider: document.getElementById('conf-slider'),
    confValue: document.getElementById('conf-value'),
    classFilters: document.getElementById('class-filters'),
    btnLoadProject: document.getElementById('btn-load-project'),

    // Visual Settings
    sliderThickness: document.getElementById('slider-thickness'),
    valThickness: document.getElementById('val-thickness'),
    sliderFontSize: document.getElementById('slider-fontsize'),
    valFontSize: document.getElementById('val-fontsize'),
    checkLabels: document.getElementById('check-labels'),
    checkScores: document.getElementById('check-scores')
};

const ctx = els.canvas.getContext('2d');

// -- Initialization --

async function init() {
    await fetchConfig();
    await fetchImageList();
    setupEventListeners();
}

async function fetchConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();

        state.modelsConfig = data.models || {};
        state.labelsConfig = data.labels || {};

        // Load Settings
        if (data.settings && data.settings.classColors) {
            state.classColors = data.settings.classColors;
        }

        // Initialize visible models (all true by default)
        Object.keys(state.modelsConfig).forEach(key => {
            state.visibleModels[key] = true;
        });

        // Initialize Class Filters from Global Labels
        state.filters.classes.clear();
        Object.values(state.labelsConfig).forEach(label => {
            state.filters.classes.add(label);
        });

        renderModelToggles();
        renderClassFilters(); // Initial render with 0 counts

    } catch (err) {
        console.error("Failed to fetch config:", err);
    }
}

// -- Project Loading --

async function handleLoadProject() {
    try {
        // 1. Ask server to open browser
        const browseRes = await fetch('/api/system/browse');
        const browseData = await browseRes.json();

        if (browseData.error) {
            // Fallback: prompt user for path if server cannot open dialog
            const manualPath = prompt("Server could not open file dialog.\nPlease enter absolute path to project folder:", "");
            if (manualPath) {
                loadProjectFunc(manualPath);
            } else {
                alert(browseData.error);
            }
            return;
        }

        if (browseData.cancelled) return;

        // 2. Load the project
        await loadProjectFunc(browseData.path);

    } catch (err) {
        console.error("Error loading project:", err);
        alert("Failed to initiate project load.");
    }
}

async function loadProjectFunc(path) {
    try {
        const res = await fetch('/api/project/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Unknown error");
        }

        const data = await res.json();
        alert(`Successfully loaded: ${data.message}`);

        // Refresh
        state.currentImage = null;
        await fetchImageList();

    } catch (err) {
        console.error("Load Project Failed:", err);
        alert(`Load Project Failed: ${err.message}`);
    }
}

// -- API Interaction --

async function fetchImageList() {
    try {
        const res = await fetch('/api/list');
        const data = await res.json();
        state.images = data.images;
        renderImageList();

        if (state.images.length > 0) {
            loadImage(state.images[0]);
        } else {
            els.img.src = "";
        }
    } catch (err) {
        console.error("Failed to fetch image list:", err);
    }
}

async function fetchAnnotations(filename) {
    try {
        const res = await fetch(`/api/data/${filename}`);
        const data = await res.json();
        state.annotations = data;

        // Calculate Counts
        state.classCounts = {};
        // Initialize all known labels to 0
        Object.values(state.labelsConfig).forEach(lbl => state.classCounts[lbl] = 0);

        Object.entries(data).forEach(([modelKey, boxes]) => {
            if (!boxes) return;
            boxes.forEach(box => {
                const cls = box.class;
                state.classCounts[cls] = (state.classCounts[cls] || 0) + 1;
            });
        });

        renderClassFilters(); // Update counts
        draw();
    } catch (err) {
        console.error("Failed to fetch annotations:", err);
    }
}

// -- Rendering --

function renderImageList() {
    els.imageList.innerHTML = '';
    state.images.forEach(imgName => {
        const li = document.createElement('li');
        li.textContent = imgName;
        li.onclick = () => loadImage(imgName);
        if (state.currentImage === imgName) li.classList.add('active');
        els.imageList.appendChild(li);
    });
}

function loadImage(filename) {
    state.currentImage = filename;

    // Update active class in list
    Array.from(els.imageList.children).forEach(li => {
        li.classList.toggle('active', li.textContent === filename);
    });

    els.img.src = `/api/images/${filename}`;

    // Reset transform (will be calculated in fitImageToScreen)
    state.transform = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
    // Don't update transform yet, wait for load

    els.img.onload = () => {
        resizeCanvas();
        fitImageToScreen(); // Calculate fit
        fetchAnnotations(filename);
    };
}

function fitImageToScreen() {
    if (!els.img || !els.mainView) return;

    const viewW = els.mainView.clientWidth;
    const viewH = els.mainView.clientHeight;
    const imgW = els.img.naturalWidth;
    const imgH = els.img.naturalHeight;

    if (imgW === 0 || imgH === 0) return;

    // Add some padding (e.g., 40px visible space)
    const availW = viewW - 40;
    const availH = viewH - 40;

    const scaleX = availW / imgW;
    const scaleY = availH / imgH;

    // Fit entire image
    const fitScale = Math.min(scaleX, scaleY);

    // Apply logic: if image is smaller than screen, maybe scale=1 is fine? 
    // User requested "By default image should be zoomed in to the complete canvas...".
    // "Complete canvas" usually means "fit visible area".
    // So we use fitScale regardless of if it's < 1 or > 1 (upscale small images, downscale large).

    state.transform.scale = fitScale;
    state.transform.x = 0;
    state.transform.y = 0;

    updateTransform();
}

function resizeCanvas() {
    els.canvas.width = els.img.naturalWidth;
    els.canvas.height = els.img.naturalHeight;
    els.canvas.style.width = els.img.clientWidth + 'px';
    els.canvas.style.height = els.img.clientHeight + 'px';
}

function renderModelToggles() {
    els.modelToggles.innerHTML = '';
    const keys = Object.keys(state.modelsConfig).sort();

    keys.forEach((key, idx) => {
        const info = state.modelsConfig[key];
        const color = CONFIG.colors[idx % CONFIG.colors.length];
        // Store assigned color in state for drawing
        state.modelsConfig[key].renderColor = color;

        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.style.color = color;

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = state.visibleModels[key];
        input.onchange = (e) => {
            state.visibleModels[key] = e.target.checked;
            draw();
        };

        label.appendChild(input);
        label.appendChild(document.createTextNode(` ${info.name || key}`));
        els.modelToggles.appendChild(label);
    });
}

async function saveSettings() {
    try {
        await fetch('/api/project/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: { classColors: state.classColors } })
        });
    } catch (err) {
        console.error("Failed to save settings:", err);
    }
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function renderClassFilters() {
    els.classFilters.innerHTML = '';

    // Union of configured labels and actually detected classes
    const allLabels = new Set([
        ...Object.values(state.labelsConfig),
        ...Object.keys(state.classCounts)
    ]);
    const sortedLabels = Array.from(allLabels).sort();

    sortedLabels.forEach(cls => {
        const count = state.classCounts[cls] || 0;

        // Ensure color exists
        if (!state.classColors[cls]) {
            state.classColors[cls] = getRandomColor();
        }
        const color = state.classColors[cls];

        // Main container: Flex row, full width
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.marginBottom = '4px';
        container.style.justifyContent = 'space-between';

        // Left side: Checkbox + Class Name
        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.gap = '8px'; // Space between checkbox and text

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = state.filters.classes.has(cls);
        input.style.cursor = 'pointer';
        // Set checkbox color to match class color
        input.style.accentColor = color;

        input.onchange = (e) => {
            if (e.target.checked) state.filters.classes.add(cls);
            else state.filters.classes.delete(cls);
            draw();
        };

        const span = document.createElement('span');
        span.textContent = `${cls} (${count})`;
        span.style.fontSize = '0.9rem';
        if (count === 0) span.style.opacity = '0.5';

        leftGroup.appendChild(input);
        leftGroup.appendChild(span);

        // Right side: Color Picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = color;
        colorPicker.style.border = 'none';
        colorPicker.style.width = '24px';
        colorPicker.style.height = '24px';
        colorPicker.style.padding = '0';
        colorPicker.style.cursor = 'pointer';
        colorPicker.style.background = 'none'; // Clean look

        colorPicker.onchange = (e) => {
            const newColor = e.target.value;
            state.classColors[cls] = newColor;
            input.style.accentColor = newColor; // Update checkbox color immediately
            draw();
            saveSettings();
        };

        container.appendChild(leftGroup);
        container.appendChild(colorPicker);
        els.classFilters.appendChild(container);
    });
}

function draw() {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

    Object.keys(state.modelsConfig).forEach(key => {
        if (state.visibleModels[key]) {
            drawBoxes(state.annotations[key], state.modelsConfig[key].renderColor);
        }
    });
}

function drawBoxes(boxes, modelColor) {
    if (!boxes) return;

    ctx.lineWidth = state.lineWidth;
    ctx.font = `bold ${state.fontSize}px Arial`;

    boxes.forEach(box => {
        if (!state.filters.classes.has(box.class)) return;
        if (box.conf < state.confidence) return;

        // Color priority: Class Color > Model Color
        const color = state.classColors[box.class] || modelColor;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        const [x, y, w, h] = box.bbox;

        ctx.strokeRect(x, y, w, h);

        if (state.showLabels || state.showScores) {
            let labelText = "";
            if (state.showLabels) labelText += box.class;
            if (state.showScores) labelText += (labelText ? " " : "") + box.conf.toFixed(2);

            ctx.save();
            ctx.fillStyle = color;
            const textMetrics = ctx.measureText(labelText);
            const textHeight = state.fontSize * 1.2;
            const pad = 5;
            const textWidth = textMetrics.width + (pad * 2);

            // Smart Positioning: If box is at top, draw label inside/below
            let lblY = y - textHeight;
            let textY = y - (textHeight * 0.2);

            if (y < textHeight) {
                // Not enough space above, draw inside at top
                lblY = y;
                textY = y + textHeight - (textHeight * 0.2);
            }

            ctx.fillRect(x, lblY, textWidth, textHeight);

            ctx.fillStyle = '#000'; // Black text
            ctx.fillText(labelText, x + pad, textY);
            ctx.restore();
        }
    });
}

function updateTransform() {
    // Apply CSS transform to the WRAPPER (container)
    // Scale and Translate
    els.container.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
}

// -- Event Listeners --

function setupEventListeners() {
    els.btnLoadProject.onclick = handleLoadProject;

    els.confSlider.oninput = (e) => {
        state.confidence = parseFloat(e.target.value);
        els.confValue.textContent = state.confidence;
        draw();
    };

    // Visual Settings
    if (els.sliderThickness) {
        els.sliderThickness.oninput = (e) => {
            state.lineWidth = parseInt(e.target.value);
            els.valThickness.textContent = state.lineWidth;
            draw();
        };
    }
    if (els.sliderFontSize) {
        els.sliderFontSize.oninput = (e) => {
            state.fontSize = parseInt(e.target.value);
            els.valFontSize.textContent = state.fontSize;
            draw();
        };
    }
    if (els.checkLabels) {
        els.checkLabels.onchange = (e) => {
            state.showLabels = e.target.checked;
            draw();
        };
    }
    if (els.checkScores) {
        els.checkScores.onchange = (e) => {
            state.showScores = e.target.checked;
            draw();
        };
    }

    // Zoom Buttons
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnResetView = document.getElementById('btn-reset-view');

    if (btnZoomIn) {
        btnZoomIn.onclick = () => {
            state.transform.scale = Math.min(state.transform.scale * 1.2, 10);
            updateTransform();
        };
    }
    if (btnZoomOut) {
        btnZoomOut.onclick = () => {
            state.transform.scale = Math.max(state.transform.scale / 1.2, 0.1);
            updateTransform();
        };
    }
    if (btnResetView) {
        btnResetView.onclick = () => {
            state.transform.scale = 1;
            state.transform.x = 0;
            state.transform.y = 0;
            updateTransform();
        };
    }

    // Zoom / Pan on Container
    const container = els.container;

    container.onwheel = (e) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        state.transform.scale += scaleAmount * state.transform.scale; // Logarithmic-ish
        // Clamp
        state.transform.scale = Math.min(Math.max(0.1, state.transform.scale), 10);
        updateTransform();
    };

    container.onmousedown = (e) => {
        e.preventDefault();
        state.transform.isDragging = true;
        state.transform.startX = e.clientX - state.transform.x;
        state.transform.startY = e.clientY - state.transform.y;
        container.style.cursor = 'grabbing';
    };

    window.onmousemove = (e) => {
        if (!state.transform.isDragging) return;
        state.transform.x = e.clientX - state.transform.startX;
        state.transform.y = e.clientY - state.transform.startY;
        updateTransform();
    };

    window.onmouseup = () => {
        state.transform.isDragging = false;
        container.style.cursor = 'grab';
    };

    const ro = new ResizeObserver(() => {
        if (!els.img) return;
        els.canvas.style.width = els.img.clientWidth + 'px';
        els.canvas.style.height = els.img.clientHeight + 'px';
    });
    ro.observe(els.img);
}

// Start
init();
