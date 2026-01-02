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

    // QA Data: { filename: { status: 'correct'|'incorrect'|'doubtful', comment: '...' } }
    qaData: {},
    filterQA: 'all', // all, unreviewed, correct, incorrect, doubtful

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

    // Hidden Boxes
    hiddenBoxes: new Set(),
    hoverBox: null, // Box under cursor

    // Visual Settings Defaults
    lineWidth: 2,
    fontSize: 20,
    ghostOpacity: 0.2, // Default
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
    btnUnhideAll: document.getElementById('btn-unhide-all'),

    // QA Elements
    qaCorrect: document.querySelector('.qa-btn.correct'),
    qaIncorrect: document.querySelector('.qa-btn.incorrect'),
    qaDoubtful: document.querySelector('.qa-btn.doubtful'),
    qaComment: document.getElementById('qa-comment'),
    qaSavedStatus: document.getElementById('qa-saved-status'),
    filterQA: document.getElementById('filter-qa'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),

    // Visual Settings
    sliderThickness: document.getElementById('slider-thickness'),
    valThickness: document.getElementById('val-thickness'),
    sliderFontSize: document.getElementById('slider-fontsize'),
    valFontSize: document.getElementById('val-fontsize'),
    sliderOpacity: document.getElementById('slider-opacity'),
    valOpacity: document.getElementById('val-opacity'),
    checkLabels: document.getElementById('check-labels'),
    checkScores: document.getElementById('check-scores')
};

const ctx = els.canvas.getContext('2d');

// -- Initialization --

async function init() {
    await fetchConfig();
    await fetchImageList(); // Also fetches QA data implicitly if tied, but we'll fetch QA separately first
    await fetchQAStatus();
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
        const browseRes = await fetch('/api/system/browse');
        const browseData = await browseRes.json();

        if (browseData.error) {
            const manualPath = prompt("Enter absolute path to project folder:", "");
            if (manualPath) loadProjectFunc(manualPath);
            else alert(browseData.error);
            return;
        }

        if (browseData.cancelled) return;
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

        state.currentImage = null;
        state.qaData = {};
        await fetchQAStatus();
        await fetchImageList();

    } catch (err) {
        console.error("Load Project Failed:", err);
        alert(`Load Project Failed: ${err.message}`);
    }
}

// -- QA Logic --

async function fetchQAStatus() {
    try {
        const res = await fetch('/api/qa/load');
        if (res.ok) {
            state.qaData = await res.json();
            renderImageList();
        }
    } catch (err) {
        console.error("Failed to load QA status:", err);
    }
}

async function setQAStatus(status) {
    if (!state.currentImage) return;

    // Toggle logic: if clicking same status, un-set it? No, explicit 'correct'/'incorrect' usually sticks.
    // Let's allow switching. To clear, maybe we need a clear button? 
    // For now, simple switch.

    updateQAState(status, els.qaComment.value);
}

async function updateQAState(status, comment) {
    if (!state.currentImage) return;

    // Optimistic Update
    state.qaData[state.currentImage] = { status, comment };
    updateQAUI();
    renderImageList(); // Update sidebar icon/color

    els.qaSavedStatus.textContent = "Saving...";

    try {
        const res = await fetch('/api/qa/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: state.currentImage,
                status: status,
                comment: comment
            })
        });

        if (res.ok) {
            els.qaSavedStatus.textContent = "Saved";
            setTimeout(() => els.qaSavedStatus.textContent = "Synced", 2000);
        } else {
            els.qaSavedStatus.textContent = "Error!";
        }
    } catch (err) {
        console.error("QA Save Failed:", err);
        els.qaSavedStatus.textContent = "Error!";
    }
}

function updateQAUI() {
    if (!state.currentImage) {
        els.qaCorrect.classList.remove('active');
        els.qaIncorrect.classList.remove('active');
        els.qaDoubtful.classList.remove('active');
        els.qaComment.value = "";
        return;
    }

    const data = state.qaData[state.currentImage] || { status: null, comment: "" };

    els.qaCorrect.classList.toggle('active', data.status === 'correct');
    els.qaIncorrect.classList.toggle('active', data.status === 'incorrect');
    els.qaDoubtful.classList.toggle('active', data.status === 'doubtful');

    els.qaComment.value = data.comment || "";
}


// -- API Interaction --

async function fetchImageList() {
    try {
        const res = await fetch('/api/list');
        const data = await res.json();
        state.images = data.images;
        renderImageList();

        if (state.images.length > 0 && !state.currentImage) {
            loadImage(state.images[0]);
        } else if (state.currentImage) {
            // reload current (e.g. annotations might have changed? unlikely but ok)
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
        Object.values(state.labelsConfig).forEach(lbl => state.classCounts[lbl] = 0);

        Object.entries(data).forEach(([modelKey, boxes]) => {
            if (!boxes) return;
            boxes.forEach(box => {
                const cls = box.class;
                state.classCounts[cls] = (state.classCounts[cls] || 0) + 1;
            });
        });

        renderClassFilters();
        draw();
    } catch (err) {
        console.error("Failed to fetch annotations:", err);
    }
}

// -- Rendering --

function renderImageList() {
    els.imageList.innerHTML = '';

    const filter = state.filterQA;

    state.images.forEach(imgName => {
        const qa = state.qaData[imgName];
        const status = qa ? qa.status : 'unreviewed';

        // Filter Logic
        if (filter !== 'all') {
            if (filter === 'unreviewed' && status !== 'unreviewed') return;
            if (filter !== 'unreviewed' && status !== filter) return;
        }

        const li = document.createElement('li');
        li.textContent = imgName;
        li.onclick = () => loadImage(imgName);
        if (state.currentImage === imgName) li.classList.add('active');

        // Add QA Class
        if (status && status !== 'unreviewed') {
            li.classList.add(`qa-${status}`);
        }

        els.imageList.appendChild(li);
    });
}

function loadImage(filename) {
    state.currentImage = filename;

    // Reset hidden boxes on image change? Yes usually
    state.hiddenBoxes.clear();

    renderImageList(); // Update active class
    updateQAUI(); // Update footer

    els.img.src = `/api/images/${filename}`;

    state.transform = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };

    els.img.onload = () => {
        resizeCanvas();
        fitImageToScreen();
        fetchAnnotations(filename);
    };
}

function navigateImage(offset) {
    if (!state.images.length) {
        console.log("No images to navigate");
        return;
    }

    let currentIndex = state.images.indexOf(state.currentImage);
    if (currentIndex === -1) currentIndex = 0;

    const newIndex = currentIndex + offset;

    // Bounds check
    if (newIndex >= 0 && newIndex < state.images.length) {
        loadImage(state.images[newIndex]);
        // Scroll sidebar to keep active item in view
        // Simple way:
        setTimeout(() => {
            const activeLi = els.imageList.querySelector('li.active');
            if (activeLi) {
                activeLi.scrollIntoView({ block: 'nearest' });
            }
        }, 100);
    }
}

function fitImageToScreen() {
    if (!els.img || !els.mainView) return;

    const viewW = els.mainView.clientWidth;
    const viewH = els.mainView.clientHeight;
    const imgW = els.img.naturalWidth;
    const imgH = els.img.naturalHeight;

    if (imgW === 0 || imgH === 0) return;

    const availW = viewW - 40;
    const availH = viewH - 40;

    const scaleX = availW / imgW;
    const scaleY = availH / imgH;
    const fitScale = Math.min(scaleX, scaleY);

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
    const allLabels = new Set([
        ...Object.values(state.labelsConfig),
        ...Object.keys(state.classCounts)
    ]);
    const sortedLabels = Array.from(allLabels).sort();

    sortedLabels.forEach(cls => {
        const count = state.classCounts[cls] || 0;
        if (!state.classColors[cls]) {
            state.classColors[cls] = getRandomColor();
        }
        const color = state.classColors[cls];
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.marginBottom = '4px';
        container.style.justifyContent = 'space-between';

        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.gap = '8px';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = state.filters.classes.has(cls);
        input.style.cursor = 'pointer';
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

        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = color;
        colorPicker.style.border = 'none';
        colorPicker.style.width = '24px';
        colorPicker.style.height = '24px';
        colorPicker.style.padding = '0';
        colorPicker.style.cursor = 'pointer';
        colorPicker.style.background = 'none';

        colorPicker.onchange = (e) => { // Auto-save color settings
            const newColor = e.target.value;
            state.classColors[cls] = newColor;
            input.style.accentColor = newColor;
            draw();
            saveSettings();
        };

        container.appendChild(leftGroup);
        container.appendChild(colorPicker);
        els.classFilters.appendChild(container);
    });
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
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

function draw() {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    const sortedKeys = Object.keys(state.modelsConfig).sort();
    sortedKeys.forEach(key => {
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

        const isHidden = state.hiddenBoxes.has(box);
        const isHovered = (box === state.hoverBox);
        let color = state.classColors[box.class] || modelColor;

        ctx.save();
        if (isHidden) {
            ctx.globalAlpha = state.ghostOpacity;
            ctx.strokeStyle = '#888';
            ctx.fillStyle = 'transparent';
        } else {
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
        }

        if (isHovered) {
            ctx.lineWidth = state.lineWidth + 2;
            if (isHidden) {
                ctx.strokeStyle = '#fff';
                ctx.globalAlpha = state.ghostOpacity + 0.3;
            }
        } else {
            ctx.lineWidth = state.lineWidth;
        }

        const [x, y, w, h] = box.bbox;
        ctx.strokeRect(x, y, w, h);

        if (!isHidden && (state.showLabels || state.showScores)) {
            let labelText = "";
            if (state.showLabels) labelText += box.class;
            if (state.showScores) labelText += (labelText ? " " : "") + box.conf.toFixed(2);

            ctx.fillStyle = color;
            const textMetrics = ctx.measureText(labelText);
            const textHeight = state.fontSize * 1.2;
            const pad = 5;
            const textWidth = textMetrics.width + (pad * 2);

            let lblY = y - textHeight;
            let textY = y - (textHeight * 0.2);
            if (y < textHeight) {
                lblY = y;
                textY = y + textHeight - (textHeight * 0.2);
            }
            ctx.fillRect(x, lblY, textWidth, textHeight);
            ctx.fillStyle = '#000';
            ctx.fillText(labelText, x + pad, textY);
        }
        ctx.restore();
    });
}

function updateTransform() {
    els.container.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
}

function getBoxAt(x, y, onlyVisible = false) {
    let hitBox = null;
    const sortedKeys = Object.keys(state.modelsConfig).sort();

    sortedKeys.forEach(key => {
        if (!state.visibleModels[key]) return;
        const boxes = state.annotations[key];
        if (!boxes) return;

        boxes.forEach(box => {
            if (!state.filters.classes.has(box.class)) return;
            if (box.conf < state.confidence) return;
            if (onlyVisible && state.hiddenBoxes.has(box)) return;

            const [bx, by, bw, bh] = box.bbox;
            if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
                hitBox = box;
            }
        });
    });
    return hitBox;
}

function handleCanvasClick(e) {
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const box = getBoxAt(x, y, true);
    if (box) {
        state.hiddenBoxes.add(box);
        draw();
    }
}

function handleCanvasDblClick(e) {
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const box = getBoxAt(x, y, false);
    if (box && state.hiddenBoxes.has(box)) {
        state.hiddenBoxes.delete(box);
        draw();
    }
}

// -- Event Listeners --

function setupEventListeners() {
    els.btnLoadProject.onclick = handleLoadProject;

    if (els.btnUnhideAll) {
        els.btnUnhideAll.onclick = () => {
            state.hiddenBoxes.clear();
            draw();
        };
    }

    // QA Listeners
    if (els.qaComment) {
        els.qaComment.onchange = (e) => {
            const currentStatus = state.qaData[state.currentImage]?.status || 'unreviewed';
            updateQAState(currentStatus, e.target.value);
        };
    }

    if (els.filterQA) {
        els.filterQA.onchange = (e) => {
            state.filterQA = e.target.value;
            renderImageList();
        };
    }

    if (els.btnPrev) {
        els.btnPrev.onclick = () => navigateImage(-1);
    }
    if (els.btnNext) {
        els.btnNext.onclick = () => navigateImage(1);
    }

    // We attach global window functions for HTML onclick if needed, but better here
    window.setQAStatus = setQAStatus;

    els.confSlider.oninput = (e) => {
        state.confidence = parseFloat(e.target.value);
        els.confValue.textContent = state.confidence;
        draw();
    };

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
    if (els.sliderOpacity) {
        els.sliderOpacity.oninput = (e) => {
            state.ghostOpacity = parseFloat(e.target.value);
            if (els.valOpacity) els.valOpacity.textContent = state.ghostOpacity;
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

    const container = els.container;
    let rawStartX = 0;
    let rawStartY = 0;

    container.ondblclick = (e) => {
        e.preventDefault();
        handleCanvasDblClick(e);
    };

    container.onwheel = (e) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        state.transform.scale += scaleAmount * state.transform.scale;
        state.transform.scale = Math.min(Math.max(0.1, state.transform.scale), 10);
        updateTransform();
    };

    container.onmousedown = (e) => {
        e.preventDefault();
        state.transform.isDragging = true;
        state.transform.startX = e.clientX - state.transform.x;
        state.transform.startY = e.clientY - state.transform.y;
        rawStartX = e.clientX;
        rawStartY = e.clientY;
        container.style.cursor = 'grabbing';
    };

    window.onmousemove = (e) => {
        if (!state.transform.isDragging) {
            const rect = els.canvas.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                const scaleX = els.canvas.width / rect.width;
                const scaleY = els.canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;

                const box = getBoxAt(x, y, false);
                if (box !== state.hoverBox) {
                    state.hoverBox = box;
                    draw();
                }
            } else if (state.hoverBox) {
                state.hoverBox = null;
                draw();
            }
        }

        if (!state.transform.isDragging) return;
        state.transform.x = e.clientX - state.transform.startX;
        state.transform.y = e.clientY - state.transform.startY;
        updateTransform();
    };

    window.onmouseup = (e) => {
        if (state.transform.isDragging) {
            const dist = Math.abs(e.clientX - rawStartX) + Math.abs(e.clientY - rawStartY);
            if (dist < 5) {
                handleCanvasClick(e);
            }
        }
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
