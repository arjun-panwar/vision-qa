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
    transform: { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },

    // Sidebar States (Persisted separately or part of settings?)
    // Let's persist sidebar states too if we can
    leftSidebarOpen: true,
    rightSidebarOpen: true,

    // Flagging
    flagMode: false,
    flaggedBoxes: new Set(), // Set of string IDs

    // Comparison Mode
    comparisonMode: false,
    compareModelLeft: null, // modelKey
    compareModelRight: null // modelKey
};

// DOM Elements
const els = {
    sidebarLeft: document.querySelector('.sidebar'),
    sidebarRight: document.querySelector('.controls'),
    btnToggleLeft: document.getElementById('btn-toggle-left'),
    btnToggleRight: document.getElementById('btn-toggle-right'),
    imageList: document.getElementById('image-list'),

    // Split View Elements
    imgLeft: document.getElementById('source-image-left'),
    canvasLeft: document.getElementById('overlay-canvas-left'),
    containerLeft: document.getElementById('canvas-container-left'),

    imgRight: document.getElementById('source-image-right'),
    canvasRight: document.getElementById('overlay-canvas-right'),
    containerRight: document.getElementById('canvas-container-right'),

    // New Canvas Selectors
    selectModelLeft: document.getElementById('model-select-left'),
    selectModelRight: document.getElementById('model-select-right'),

    mainView: document.querySelector('.main-view'),

    // Comparison Controls
    btnCompare: document.getElementById('btn-compare'),
    // Comparison Controls
    btnCompare: document.getElementById('btn-compare'),

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
    btnFlagMode: document.getElementById('btn-flag-mode'),
    filterQA: document.getElementById('filter-qa'),
    btnPrev: document.getElementById('btn-prev'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    imageNameDisplay: document.getElementById('image-name-display'),
    copyTooltip: document.getElementById('copy-tooltip'),

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

// Two contexts
const ctxLeft = els.canvasLeft.getContext('2d');
const ctxRight = els.canvasRight.getContext('2d');

// -- Initialization --

async function init() {
    // -- Setup Canvas Styles --
    // We already have them in HTML/CSS, but let's ensure they are positioned correctly within their wrappers
    // The previous logic moved canvas to mainView. In split view, canvases MUST stay in their wrappers.
    // So we remove the logic that moved els.canvas to mainView.

    // Ensure wrappers are relative (CSS handles this via .canvas-wrapper)
    // Ensure canvases are absolute top-left
    [els.canvasLeft, els.canvasRight].forEach(c => {
        c.style.position = 'absolute';
        c.style.top = '0';
        c.style.left = '0';
        c.style.width = '100%';
        c.style.height = '100%';
        c.style.pointerEvents = 'auto'; // Catch events
        c.style.zIndex = '100'; // Force on top of transformed image
    });

    // Ensure Images display block
    if (els.imgLeft) els.imgLeft.style.display = 'block';
    if (els.imgRight) els.imgRight.style.display = 'block';

    // Force styles to avoid CSS caching issues (resetting wrapper styles)
    [els.containerLeft, els.containerRight].forEach(c => {
        c.style.transformOrigin = '0 0';
        // c.style.position = 'absolute'; // Removed: CSS handles this (relative for split, absolute for single)
        // Actually, for SINGLE view (default), we want absolute top left.
        // For SPLIT view, we want them relative/flex.
        // Let's defer layout to CSS classes, but ensure defaults here.
    });

    await fetchConfig();
    await fetchImageList(); // Also fetches QA data implicitly if tied, but we'll fetch QA separately first
    await fetchQAStatus();
    setupEventListeners();

    // Initial resize to match viewport
    resizeCanvas();
}

async function fetchConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();

        state.modelsConfig = data.models || {};
        state.labelsConfig = data.labels || {};

        // Load Settings
        if (data.settings) {
            applyVisualSettings(data.settings);
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

        if (els.imageNameDisplay) {
            els.imageNameDisplay.onclick = () => {
                if (!state.currentImage) return;
                navigator.clipboard.writeText(state.currentImage).then(() => {
                    // Feedback via Tooltip
                    if (els.copyTooltip) {
                        els.copyTooltip.style.opacity = '1';
                        setTimeout(() => {
                            els.copyTooltip.style.opacity = '0';
                        }, 1000);
                    }
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            };
        }

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
        await fetchConfig(); // Reload models, labels, and SETTINGS for the new project
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
    state.qaData[state.currentImage] = {
        status,
        comment,
        flags: JSON.stringify(Array.from(state.flaggedBoxes))
    };
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
                comment: comment,
                flags: JSON.stringify(Array.from(state.flaggedBoxes))
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
        els.qaSavedStatus.textContent = "";
        if (els.imgLeft) els.imgLeft.src = "";
        if (els.imgRight) els.imgRight.src = "";
        state.flaggedBoxes.clear();
        return;
    }
    const data = state.qaData[state.currentImage] || { status: null, comment: "" };

    els.qaCorrect.classList.toggle('active', data.status === 'correct');
    els.qaIncorrect.classList.toggle('active', data.status === 'incorrect');
    els.qaDoubtful.classList.toggle('active', data.status === 'doubtful');

    els.qaComment.value = data.comment || "";

    // Load Flags
    state.flaggedBoxes.clear();
    try {
        if (data.flags) {
            const flags = JSON.parse(data.flags);
            flags.forEach(f => state.flaggedBoxes.add(f));
        }
    } catch (e) {
        console.error("Failed to parse flags:", e);
    }
    draw();
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

    // -- Calculate Counts --
    const counts = {
        all: state.images.length,
        unreviewed: 0,
        correct: 0,
        incorrect: 0,
        doubtful: 0
    };

    state.images.forEach(imgName => {
        const qa = state.qaData[imgName];
        const status = qa ? qa.status : 'unreviewed';
        if (!status || status === 'unreviewed') counts.unreviewed++;
        else if (counts.hasOwnProperty(status)) counts[status]++;
    });

    // -- Update Filter Dropdown Labels --
    const options = els.filterQA.options;
    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const val = opt.value;
        if (val === 'all') opt.textContent = `Filter: All (${counts.all})`;
        else if (val === 'unreviewed') opt.textContent = `Unreviewed (${counts.unreviewed})`;
        else if (val === 'correct') opt.textContent = `Correct (${counts.correct})`;
        else if (val === 'incorrect') opt.textContent = `Incorrect (${counts.incorrect})`;
        else if (val === 'doubtful') opt.textContent = `Doubtful (${counts.doubtful})`;
    }

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
    if (!filename) return;
    state.currentImage = filename;

    // Reset hidden boxes on image change? Yes usually
    state.hiddenBoxes.clear();

    renderImageList(); // Update active class
    updateQAUI(); // Update footer

    renderImageList(); // Update active class
    updateQAUI(); // Update footer

    // Set src for BOTH images
    const src = `/api/images/${filename}`;
    if (els.imgLeft) els.imgLeft.src = src;
    if (els.imgRight) els.imgRight.src = src;

    // Update Name Display
    if (els.imageNameDisplay) {
        els.imageNameDisplay.textContent = filename;
        els.imageNameDisplay.title = `Click to copy: ${filename}`;
    }

    state.transform = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };

    // Use imgLeft as the primary for sizing
    if (els.imgLeft) {
        els.imgLeft.onload = () => {
            resizeCanvas();
            fitImageToScreen();
            fetchAnnotations(filename);
        };
    }
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

function fitImageToScreen(force = false) {
    // Use lef image as reference
    const img = els.imgLeft;
    if (!img || !els.mainView) return;

    const viewW = els.mainView.clientWidth; // In split view, this is full width. 
    // Wait, if split view, available width for one image is 50%.
    // But wrapper width should handle that? 
    // container transform applies to wrapper? No, container IS inside wrapper.
    // Actually, els.mainView is the parent of wrappers.
    // Wrappers are 100% or 50%.
    // Determine viewport dimensions
    let viewWidth, viewHeight;
    if (els.mainView.classList.contains('split-view')) {
        // In split view, the container is the viewport (50% width)
        viewWidth = els.containerLeft.clientWidth;
        viewHeight = els.containerLeft.clientHeight;
    } else {
        // In single view, the container is absolute and wraps the image (so it's huge).
        // The viewport is the main view.
        viewWidth = els.mainView.clientWidth;
        viewHeight = els.mainView.clientHeight;
    }

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    if (imgW === 0 || imgH === 0) return;

    const availW = viewWidth - 40;
    const availH = viewHeight - 40;

    const scaleX = availW / imgW;
    const scaleY = availH / imgH;
    const fitScale = Math.min(scaleX, scaleY);

    // Only fit to screen if forced or if we are in a default/reset state (scale 1).
    // This allows persisted views (loaded from config) to be respected.
    if (force || (state.transform.scale === 1 && state.transform.x === 0 && state.transform.y === 0)) {
        state.transform.scale = fitScale;
        state.transform.x = (viewWidth - imgW * fitScale) / 2;
        state.transform.y = (viewHeight - imgH * fitScale) / 2;
    }

    updateTransform();
}

function resizeCanvas() {
    // Canvas should match the wrapper size
    [els.canvasLeft, els.canvasRight].forEach(cvs => {
        if (!cvs) return;
        const wrapper = cvs.parentElement;
        const rect = wrapper.getBoundingClientRect();
        // Set canvas internal resolution to match display size
        cvs.width = rect.width;
        cvs.height = rect.height;
    });
    draw();
}

function toggleSidebar(side) {
    if (side === 'left') {
        state.leftSidebarOpen = !state.leftSidebarOpen;
        els.sidebarLeft.classList.toggle('collapsed', !state.leftSidebarOpen);
    } else if (side === 'right') {
        state.rightSidebarOpen = !state.rightSidebarOpen;
        els.sidebarRight.classList.toggle('collapsed', !state.rightSidebarOpen);
    }

    // Wait for transition to end before refitting? Or just let it happen?
    // Transition matches CSS (0.3s)
    setTimeout(() => {
        fitImageToScreen();
        resizeCanvas();
    }, 350);

    saveSettings();
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

    // -- Update Header with Toggle & Count --
    const header = document.getElementById('header-classes');
    if (header) {
        header.innerHTML = ''; // Clear to rebuild
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '8px';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'checkbox-toggle-all-header';
        toggleInput.style.cursor = 'pointer';

        // Determine initial state
        const allSelected = sortedLabels.every(cls => state.filters.classes.has(cls));
        const someSelected = sortedLabels.some(cls => state.filters.classes.has(cls));

        toggleInput.checked = allSelected;
        toggleInput.indeterminate = someSelected && !allSelected;

        toggleInput.onchange = (e) => {
            if (e.target.checked) {
                sortedLabels.forEach(cls => state.filters.classes.add(cls));
            } else {
                state.filters.classes.clear();
            }
            draw();
            saveSettings();
            renderClassFilters();
        };

        // Prevent header click from triggering anything unwanted if we had other listeners
        // But here we just want the input to work.

        const labelSpan = document.createElement('span');
        labelSpan.textContent = `Classes (${sortedLabels.length})`;

        header.appendChild(toggleInput);
        header.appendChild(labelSpan);
    }


    // -- Individual Class Checkboxes --
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
            saveSettings();

            // Re-render essentially to update header state? 
            // Or just update header input directly?
            // Re-rendering is safest to keep count/state in sync if logic changes.
            // But strict re-render might lose focus/scroll? 
            // renderClassFilters calls innerHTML='' so it rebuilds entire list.
            // If list is long, might annoy user. 
            // Let's just update the header checkbox directly here.

            const headerCheckbox = document.getElementById('checkbox-toggle-all-header');
            if (headerCheckbox) {
                const allNow = sortedLabels.every(c => state.filters.classes.has(c));
                const someNow = sortedLabels.some(c => state.filters.classes.has(c));
                headerCheckbox.checked = allNow;
                headerCheckbox.indeterminate = someNow && !allNow;
            }
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

function toggleComparisonMode() {
    state.comparisonMode = !state.comparisonMode;

    // UI Updates
    els.btnCompare.classList.toggle('active', state.comparisonMode);
    // compareControls removed
    els.containerRight.style.display = state.comparisonMode ? 'block' : 'none';
    // Wait, els definition is els.containerRight defined in Step 47-ish.
    // Check definition: els.containerRight. In index.html: style="display: none; ..."

    if (state.comparisonMode) {
        els.mainView.classList.add('split-view');
        els.containerRight.style.display = 'block'; // Show right view

        // Show canvas selectors
        if (els.selectModelLeft) els.selectModelLeft.style.display = 'block';
        if (els.selectModelRight) els.selectModelRight.style.display = 'block';

        if (els.selectModelRight) els.selectModelRight.style.display = 'block';

        // compareControls logic removed

        // Populate selects if empty
        if (els.selectModelLeft.options.length === 0) populateModelSelects();

        // Default selections if null
        const modelKeys = Object.keys(state.modelsConfig).sort();
        if (!state.compareModelLeft && modelKeys.length > 0) state.compareModelLeft = modelKeys[0];
        if (!state.compareModelRight && modelKeys.length > 0) state.compareModelRight = modelKeys.length > 1 ? modelKeys[1] : modelKeys[0];

        els.selectModelLeft.value = state.compareModelLeft;
        els.selectModelRight.value = state.compareModelRight;

    } else {
        els.mainView.classList.remove('split-view');
        els.containerRight.style.display = 'none';

        // Hide canvas selectors
        if (els.selectModelLeft) els.selectModelLeft.style.display = 'none';
        if (els.selectModelRight) els.selectModelRight.style.display = 'none';
    }

    // Refit after layout change
    // Force a re-fit by resetting transform state momentarily if needed, 
    // or we can just bypass the check in fitImageToScreen by passing a flag.
    // Simpler: Reset state, then fit.
    state.transform = { x: 0, y: 0, scale: 1, isDragging: false };
    updateTransform();

    setTimeout(() => {
        resizeCanvas();
        fitImageToScreen();
    }, 50);
}

function populateModelSelects() {
    els.selectModelLeft.innerHTML = '';
    els.selectModelRight.innerHTML = '';

    const keys = Object.keys(state.modelsConfig).sort();

    keys.forEach(key => {
        const name = state.modelsConfig[key].name || key;

        const opt1 = document.createElement('option');
        opt1.value = key;
        opt1.textContent = name;
        els.selectModelLeft.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = key;
        opt2.textContent = name;
        els.selectModelRight.appendChild(opt2);
    });

    els.selectModelLeft.onchange = (e) => {
        state.compareModelLeft = e.target.value;
        draw();
    };
    els.selectModelRight.onchange = (e) => {
        state.compareModelRight = e.target.value;
        draw();
    };
}


function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// -- Helper Functions for Settings --

function getVisualSettings() {
    return {
        // Core Visuals
        lineWidth: state.lineWidth,
        fontSize: state.fontSize,
        ghostOpacity: state.ghostOpacity,
        showLabels: state.showLabels,
        showScores: state.showScores,

        // Colors
        classColors: state.classColors,

        // Filters
        visibleClasses: Array.from(state.filters.classes),

        // View State
        transform: state.transform,

        // Sidebar State
        leftSidebarOpen: state.leftSidebarOpen,
        rightSidebarOpen: state.rightSidebarOpen,

        // Flagging
        flagMode: state.flagMode
    };
}

function applyVisualSettings(settings) {
    if (!settings) return;

    if (settings.lineWidth !== undefined) state.lineWidth = settings.lineWidth;
    if (settings.fontSize !== undefined) state.fontSize = settings.fontSize;
    if (settings.ghostOpacity !== undefined) state.ghostOpacity = settings.ghostOpacity;
    if (settings.showLabels !== undefined) state.showLabels = settings.showLabels;
    if (settings.showScores !== undefined) state.showScores = settings.showScores;

    if (settings.classColors) state.classColors = settings.classColors;

    if (settings.visibleClasses && Array.isArray(settings.visibleClasses)) {
        state.filters.classes = new Set(settings.visibleClasses);
    }

    if (settings.transform) {
        state.transform = settings.transform;
        // Ensure some defaults if broken
        if (state.transform.scale === undefined) state.transform.scale = 1;
        state.transform.isDragging = false;
    }

    // Sidebars
    if (settings.leftSidebarOpen !== undefined) {
        state.leftSidebarOpen = settings.leftSidebarOpen;
        els.sidebarLeft.classList.toggle('collapsed', !state.leftSidebarOpen);
    }
    if (settings.rightSidebarOpen !== undefined) {
        state.rightSidebarOpen = settings.rightSidebarOpen;
        els.sidebarRight.classList.toggle('collapsed', !state.rightSidebarOpen);
    }

    // Flag Mode
    if (settings.flagMode !== undefined) {
        state.flagMode = settings.flagMode;
        if (els.btnFlagMode) els.btnFlagMode.classList.toggle('active', state.flagMode);
        const cursor = state.flagMode ? 'crosshair' : (state.transform.isDragging ? 'grabbing' : 'grab');
        if (els.canvasLeft) els.canvasLeft.style.cursor = cursor;
        if (els.canvasRight) els.canvasRight.style.cursor = cursor;
    }

    // Update UI controls to match loaded state
    updateVisualControls();
}

function updateVisualControls() {
    if (els.sliderThickness) {
        els.sliderThickness.value = state.lineWidth;
        els.valThickness.textContent = state.lineWidth;
    }
    if (els.sliderFontSize) {
        els.sliderFontSize.value = state.fontSize;
        els.valFontSize.textContent = state.fontSize;
    }
    if (els.sliderOpacity) {
        els.sliderOpacity.value = state.ghostOpacity;
        if (els.valOpacity) els.valOpacity.textContent = state.ghostOpacity;
    }
    if (els.checkLabels) els.checkLabels.checked = state.showLabels;
    if (els.checkScores) els.checkScores.checked = state.showScores;

    // Re-render class filters if needed (colors might have changed)
    renderClassFilters();
}

// Debounce Utility to prevent spamming the API
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const debouncedSaveSettings = debounce(saveSettings, 1000);

async function saveSettings() {
    try {
        await fetch('/api/project/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: getVisualSettings() })
        });
    } catch (err) {
        console.error("Failed to save settings:", err);
    }
}

function draw() {
    if (state.comparisonMode) {
        // Draw Left
        renderCanvasView(ctxLeft, els.canvasLeft, state.compareModelLeft ? [state.compareModelLeft] : []);
        // Draw Right
        renderCanvasView(ctxRight, els.canvasRight, state.compareModelRight ? [state.compareModelRight] : []);
    } else {
        // Draw Single (Left Canvas is primary)
        const visibleKeys = Object.keys(state.modelsConfig).filter(k => state.visibleModels[k]);
        renderCanvasView(ctxLeft, els.canvasLeft, visibleKeys);
    }
}

function renderCanvasView(context, canvasEl, modelKeys) {
    // Clear the viewport
    context.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Apply transform to context
    context.save();
    context.translate(state.transform.x, state.transform.y);
    context.scale(state.transform.scale, state.transform.scale);

    // Scale Logic
    const scaleFactor = 1 / state.transform.scale;

    modelKeys.forEach(key => {
        // If specific key passed, draw it. 
        // Note: visibleModels check is done by caller for single view. 
        // For compare view, we force the selected model.

        const boxes = state.annotations[key];
        const modelColor = state.modelsConfig[key] ? state.modelsConfig[key].renderColor : 'white';

        if (!boxes) return;

        boxes.forEach(box => {
            // Skip if this is the hovered box (drawn last)
            if (box === state.hoverBox) {
                state.hoverModelColor = modelColor;
                return;
            }
            drawSingleBox(context, key, box, modelColor, scaleFactor, false);
        });
    });

    // Draw hovered box last (only if it belongs to one of the active models)
    if (state.hoverBox) {
        // We need to know which model the hover box belongs to.
        // We can infer or store it.
        // If generic hover, just draw it?
        // Issue: hoverBox might be from a model NOT in this view?
        // We should check if hoverBox model is in modelKeys.
        // BUT modelKey is not easily stored on box object implicitly.
        // We'll rely on global "hoverModelColor" or just draw it.
        // Better: check ownership or just draw. To avoid ghosting on wrong view:
        // We need to know if state.hoverBox belongs to one of modelKeys.

        const hoverModelKey = getModelKeyForBox(state.hoverBox);
        if (hoverModelKey && modelKeys.includes(hoverModelKey)) {
            drawSingleBox(context, hoverModelKey, state.hoverBox, state.hoverModelColor || 'white', scaleFactor, true);
        }
    }

    // Restore context
    context.restore();
}

function getModelKeyForBox(box) {
    for (const [key, boxes] of Object.entries(state.annotations)) {
        if (boxes.includes(box)) return key;
    }
    return null;
}

function drawSingleBox(context, modelKey, box, modelColor, scaleFactor, isHovered) {
    if (!state.filters.classes.has(box.class)) return;
    if (box.conf < state.confidence) return;

    const isHidden = state.hiddenBoxes.has(box);
    let color = state.classColors[box.class] || modelColor;

    context.save();

    // Line Widths
    const baseLineWidth = state.lineWidth * scaleFactor;
    const baseFontSize = state.fontSize * scaleFactor;

    context.font = `bold ${baseFontSize}px Arial`;

    // Flag Check
    const boxId = getBoxId(modelKey, box);
    const isFlagged = state.flaggedBoxes.has(boxId);

    if (isFlagged) {
        context.setLineDash([8 * scaleFactor, 4 * scaleFactor]);
    } else {
        context.setLineDash([]);
    }

    if (isHidden) {
        context.globalAlpha = state.ghostOpacity;
        context.strokeStyle = '#888';
        context.fillStyle = 'transparent';
    } else {
        context.globalAlpha = 1.0;
        context.strokeStyle = color;
        context.fillStyle = color;
    }

    if (isHovered) {
        context.lineWidth = baseLineWidth + (2 * scaleFactor);
        if (isHidden) {
            context.strokeStyle = '#fff';
            context.globalAlpha = state.ghostOpacity + 0.3;
        }
    } else {
        context.lineWidth = baseLineWidth;
    }

    const [x, y, w, h] = box.bbox;
    context.strokeRect(x, y, w, h);

    // Draw Label
    if (!isHidden && (state.showLabels || state.showScores)) {
        let labelText = "";
        if (state.showLabels) labelText += box.class;
        if (state.showScores) labelText += (labelText ? " " : "") + box.conf.toFixed(2);

        context.fillStyle = color;

        const textMetrics = context.measureText(labelText);
        const textHeight = baseFontSize * 1.2;
        const pad = 5 * scaleFactor;
        const textWidth = textMetrics.width + (pad * 2);

        let lblY = y - textHeight;
        let textY = y - (textHeight * 0.2);

        // Flip label if it goes off top
        if (y < textHeight) {
            lblY = y;
            textY = y + textHeight - (textHeight * 0.2);
        }

        context.fillRect(x, lblY, textWidth, textHeight);
        context.fillStyle = '#000';
        context.fillText(labelText, x + pad, textY);
    }
    context.restore();
}

function updateTransform() {
    // Only apply transform to the IMAGE, NOT the canvas, and NOT the wrapper (container)
    // The wrapper defines the viewport/clipping area.
    // The canvas is fixed to the wrapper. We transform the context in 'draw'.

    // Apply transform to BOTH images
    if (els.imgLeft) els.imgLeft.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
    if (els.imgRight) els.imgRight.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;

    // Ensure containers are NOT transformed (clean up if previously set)
    els.containerLeft.style.transform = 'none';
    els.containerRight.style.transform = 'none';

    draw(); // Re-draw with new transform
}

// Check if x,y is inside box OR label
function getBoxAt(screenX, screenY, modelKeys, onlyVisible = false) {
    let hitBox = null;

    // Convert screen coordinates to IMAGE coordinates
    const imgX = (screenX - state.transform.x) / state.transform.scale;
    const imgY = (screenY - state.transform.y) / state.transform.scale;

    // Scale factor for label calc (labels are in image space)
    const scaleFactor = 1 / state.transform.scale;
    const baseFontSize = state.fontSize * scaleFactor;

    modelKeys.forEach(key => {
        // If passed modelKeys, we assume they are visible/active for this query
        const boxes = state.annotations[key];
        if (!boxes) return;

        boxes.forEach(box => {
            if (!state.filters.classes.has(box.class)) return;
            if (box.conf < state.confidence) return;
            if (onlyVisible && state.hiddenBoxes.has(box)) return;

            const [bx, by, bw, bh] = box.bbox;

            // 1. Box Hit
            let isHit = (imgX >= bx && imgX <= bx + bw && imgY >= by && imgY <= by + bh);

            // 2. Label Hit (if showing)
            if (!isHit && !state.hiddenBoxes.has(box) && (state.showLabels || state.showScores)) {
                // ... label calc same as before ...
                ctxLeft.font = `bold ${baseFontSize}px Arial`; // Use any ctx for measure
                let labelText = "";
                if (state.showLabels) labelText += box.class;
                if (state.showScores) labelText += (labelText ? " " : "") + box.conf.toFixed(2);
                const textMetrics = ctxLeft.measureText(labelText);
                const textHeight = baseFontSize * 1.2;
                const pad = 5 * scaleFactor;
                const textWidth = textMetrics.width + (pad * 2);

                let lblY = by - textHeight;
                if (by < textHeight) { lblY = by; }

                if (imgX >= bx && imgX <= bx + textWidth && imgY >= lblY && imgY <= lblY + textHeight) {
                    isHit = true;
                }
            }

            if (isHit) {
                hitBox = box;
            }
        });
    });
    return hitBox;
}

function handleCanvasClick(e, targetCanvas) {
    const rect = targetCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Determine relevant models based on targetCanvas
    let modelKeys = [];
    if (state.comparisonMode) {
        if (targetCanvas === els.canvasLeft && state.compareModelLeft) modelKeys = [state.compareModelLeft];
        else if (targetCanvas === els.canvasRight && state.compareModelRight) modelKeys = [state.compareModelRight];
    } else {
        modelKeys = Object.keys(state.modelsConfig).filter(k => state.visibleModels[k]);
    }

    const box = getBoxAt(x, y, modelKeys, false);
    console.log("Click at", x, y, "Found box:", box);

    if (box) {
        // ... existing box logic ...
        // COPY EXISTING LOGIC HERE but use box directly
        if (state.flagMode) {
            // ... flag logic ...
            let foundKey = getModelKeyForBox(box);
            if (foundKey) {
                const id = getBoxId(foundKey, box);
                if (state.flaggedBoxes.has(id)) state.flaggedBoxes.delete(id);
                else state.flaggedBoxes.add(id);

                const currentQA = state.qaData[state.currentImage] || {};
                updateQAState(currentQA.status, currentQA.comment);
                draw();
            }
        } else {
            if (state.hiddenBoxes.has(box)) state.hiddenBoxes.delete(box);
            else state.hiddenBoxes.add(box);
            draw();
        }
    }
}

function toggleFlagMode() {
    state.flagMode = !state.flagMode;
    els.btnFlagMode.classList.toggle('active', state.flagMode);
    // Optional: Change cursor?
    const cursor = state.flagMode ? 'crosshair' : 'grab';
    if (els.canvasLeft) els.canvasLeft.style.cursor = cursor;
    if (els.canvasRight) els.canvasRight.style.cursor = cursor;
    saveSettings();
}

function handleCanvasDblClick(e) {
    // Maybe deprecated if single click toggles? 
    // Old logic: Single click -> hide. Dbl click -> unhide.
    // Ideally we merge into single click toggle for better UX?
    // User request: "I can hide using bbox, but not with the label".
    // Does not explicitly ask for toggle, but standard UX is toggle.
    // I will stick to the existing behavior or improve it. 
    // The previous code had `handleCanvasClick` doing `add` (hide) and `handleCanvasDblClick` doing `delete` (unhide).
    // I will preserve that separation if standard, BUT `getBoxAt(..., onlyVisible=true)` in click prevented unhiding via single click.
    // Let's actually make single click TOGGLE, it's easier.
    // Wait, let's keep it safe. 
    // Re-implementing exactly as before but with label support:

    // Re-implementing exactly as before but with label support:

    // Use event target to get rect
    const target = e.target; // Should be the canvas
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Double click to UNHIDE
    const box = getBoxAt(x, y, false);
    if (box && state.hiddenBoxes.has(box)) {
        state.hiddenBoxes.delete(box);
        draw();
    }
}

function getBoxId(modelKey, box) {
    // Generate a unique ID for the box. 
    // Using modelKey + bbox coords + class.
    // bbox is [x,y,w,h]
    const [x, y, w, h] = box.bbox;
    // Precision might be an issue, fixed to 2 decimals
    return `${modelKey}|${x.toFixed(2)},${y.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}|${box.class}`;
}

// -- Event Listeners --

function setupEventListeners() {
    els.btnLoadProject.onclick = handleLoadProject;

    if (els.btnToggleLeft) {
        els.btnToggleLeft.onclick = () => toggleSidebar('left');
    }
    if (els.btnToggleRight) {
        els.btnToggleRight.onclick = () => toggleSidebar('right');
    }

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
            debouncedSaveSettings();
        };
    }
    if (els.sliderFontSize) {
        els.sliderFontSize.oninput = (e) => {
            state.fontSize = parseInt(e.target.value);
            els.valFontSize.textContent = state.fontSize;
            draw();
            debouncedSaveSettings();
        };
    }
    if (els.sliderOpacity) {
        els.sliderOpacity.oninput = (e) => {
            state.ghostOpacity = parseFloat(e.target.value);
            if (els.valOpacity) els.valOpacity.textContent = state.ghostOpacity;
            draw();
            debouncedSaveSettings();
        };
    }

    if (els.checkLabels) {
        els.checkLabels.onchange = (e) => {
            state.showLabels = e.target.checked;
            draw();
            saveSettings(); // Immediate save for toggles
        };
    }
    if (els.checkScores) {
        els.checkScores.onchange = (e) => {
            state.showScores = e.target.checked;
            draw();
            saveSettings(); // Immediate save for toggles
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
            fitImageToScreen(true);
        };
    }

    els.btnCompare.onclick = toggleComparisonMode;

    const container = els.container; // Legacy or unused?
    let rawStartX = 0;
    let rawStartY = 0;

    // Attach listeners to BOTH canvases
    [els.canvasLeft, els.canvasRight].forEach(canvas => {
        canvas.ondblclick = (e) => {
            e.preventDefault();
            // Handle double click? same logic as single/toggle? 
            // Reuse handleCanvasClick essentially or ignore.
        };

        canvas.onwheel = (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const scaleAmount = -e.deltaY * 0.001;
            let newScale = state.transform.scale + (scaleAmount * state.transform.scale);
            newScale = Math.min(Math.max(0.1, newScale), 10);

            const pX = (mx - state.transform.x) / state.transform.scale;
            const pY = (my - state.transform.y) / state.transform.scale;

            state.transform.x = mx - pX * newScale;
            state.transform.y = my - pY * newScale;
            state.transform.scale = newScale;

            updateTransform();
        };

        canvas.onmousedown = (e) => {
            e.preventDefault();
            state.transform.isDragging = true;
            state.transform.startX = e.clientX - state.transform.x;
            state.transform.startY = e.clientY - state.transform.y;
            rawStartX = e.clientX;
            rawStartY = e.clientY;

            els.canvasLeft.style.cursor = 'grabbing';
            els.canvasRight.style.cursor = 'grabbing';
        };
    });

    window.onmousemove = (e) => {
        // Dragging Logic (Global)
        if (state.transform.isDragging) {
            state.transform.x = e.clientX - state.transform.startX;
            state.transform.y = e.clientY - state.transform.startY;
            updateTransform();
            return;
        }

        // Hover Logic (Check which canvas we are over)
        // Find which canvas is under mouse
        const rectLeft = els.canvasLeft.getBoundingClientRect();
        const rectRight = els.canvasRight.getBoundingClientRect();

        let targetCanvas = null;
        if (e.clientX >= rectLeft.left && e.clientX <= rectLeft.right && e.clientY >= rectLeft.top && e.clientY <= rectLeft.bottom) {
            targetCanvas = els.canvasLeft;
        } else if (state.comparisonMode && e.clientX >= rectRight.left && e.clientX <= rectRight.right && e.clientY >= rectRight.top && e.clientY <= rectRight.bottom) {
            targetCanvas = els.canvasRight;
        }

        if (targetCanvas) {
            const x = e.clientX - targetCanvas.getBoundingClientRect().left;
            const y = e.clientY - targetCanvas.getBoundingClientRect().top;

            let modelKeys = [];
            if (state.comparisonMode) {
                if (targetCanvas === els.canvasLeft && state.compareModelLeft) modelKeys = [state.compareModelLeft];
                else if (targetCanvas === els.canvasRight && state.compareModelRight) modelKeys = [state.compareModelRight];
            } else {
                modelKeys = Object.keys(state.modelsConfig).filter(k => state.visibleModels[k]);
            }

            const box = getBoxAt(x, y, modelKeys, false);
            if (box !== state.hoverBox) {
                state.hoverBox = box;
                draw();
            }
        } else {
            if (state.hoverBox) {
                state.hoverBox = null;
                draw();
            }
        }
    };

    window.onmouseup = (e) => {
        if (state.transform.isDragging) {
            const dist = Math.abs(e.clientX - rawStartX) + Math.abs(e.clientY - rawStartY);
            if (dist < 5) {
                // Determine which canvas was clicked
                // We can check boundaries again
                const rectLeft = els.canvasLeft.getBoundingClientRect();
                const rectRight = els.canvasRight.getBoundingClientRect();

                if (e.clientX >= rectLeft.left && e.clientX <= rectLeft.right && e.clientY >= rectLeft.top && e.clientY <= rectLeft.bottom) {
                    handleCanvasClick(e, els.canvasLeft);
                } else if (state.comparisonMode && e.clientX >= rectRight.left && e.clientX <= rectRight.right && e.clientY >= rectRight.top && e.clientY <= rectRight.bottom) {
                    handleCanvasClick(e, els.canvasRight);
                }
            }
        }
        state.transform.isDragging = false;

        els.canvasLeft.style.cursor = state.flagMode ? 'crosshair' : 'grab';
        els.canvasRight.style.cursor = state.flagMode ? 'crosshair' : 'grab';

        debouncedSaveSettings();
    };
    // els.canvas.style.cursor = 'grab'; // Removed undefined ref

    const ro = new ResizeObserver(() => {
        // Observe main view resize, not just img
        resizeCanvas();
    });
    // if (els.img) ro.observe(els.img); // els.img is undefined
    if (els.mainView) ro.observe(els.mainView);
}

// Start
init();
