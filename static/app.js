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
    classCounts: {}
};

// DOM Elements
const els = {
    imageList: document.getElementById('image-list'),
    img: document.getElementById('source-image'),
    canvas: document.getElementById('overlay-canvas'),
    container: document.getElementById('canvas-container'),
    modelToggles: document.getElementById('model-toggles'),
    confSlider: document.getElementById('conf-slider'),
    confValue: document.getElementById('conf-value'),
    classFilters: document.getElementById('class-filters'),
    btnLoadProject: document.getElementById('btn-load-project')
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

    Array.from(els.imageList.children).forEach(li => {
        li.classList.toggle('active', li.textContent === filename);
    });

    els.img.src = `/api/images/${filename}`;
    els.img.onload = () => {
        resizeCanvas();
        fetchAnnotations(filename);
    };
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

function renderClassFilters() {
    els.classFilters.innerHTML = '';

    // Sort labels usually makes sense
    const sortedLabels = Object.values(state.labelsConfig).sort();

    sortedLabels.forEach(cls => {
        const count = state.classCounts[cls] || 0;

        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = state.filters.classes.has(cls);
        input.onchange = (e) => {
            if (e.target.checked) state.filters.classes.add(cls);
            else state.filters.classes.delete(cls);
            draw();
        };

        // Add count to label
        const span = document.createElement('span');
        span.textContent = ` ${cls} (${count})`;
        // Dim opacity if count is 0
        if (count === 0) span.style.opacity = '0.5';

        label.appendChild(input);
        label.appendChild(span);
        els.classFilters.appendChild(label);
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

function drawBoxes(boxes, color) {
    if (!boxes) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3; // Hardcoded or config
    ctx.font = 'bold 20px Arial';

    boxes.forEach(box => {
        if (!state.filters.classes.has(box.class)) return;
        if (box.conf < state.confidence) return;

        const [x, y, w, h] = box.bbox;

        ctx.strokeRect(x, y, w, h);

        const label = `${box.class} ${box.conf.toFixed(2)}`;

        ctx.save();
        ctx.fillStyle = color;
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x, y - 25, textWidth + 10, 25);
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 5, y - 5);
        ctx.restore();
    });
}

// -- Event Listeners --

function setupEventListeners() {
    els.btnLoadProject.onclick = handleLoadProject;

    els.confSlider.oninput = (e) => {
        state.confidence = parseFloat(e.target.value);
        els.confValue.textContent = state.confidence;
        draw();
    };

    window.addEventListener('resize', () => {
        if (state.currentImage) {
            els.canvas.style.width = els.img.clientWidth + 'px';
            els.canvas.style.height = els.img.clientHeight + 'px';
        }
    });

    const ro = new ResizeObserver(() => {
        if (!els.img) return;
        els.canvas.style.width = els.img.clientWidth + 'px';
        els.canvas.style.height = els.img.clientHeight + 'px';
    });
    ro.observe(els.img);
}

// Start
init();
