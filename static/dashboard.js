// Dashboard Logic

document.addEventListener("DOMContentLoaded", () => {
    fetchStats();
    fetchAppConfig();
});

// Help Modal Logic
function openHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('help-modal');
    if (event.target === modal) {
        modal.style.display = "none";
    }
}


async function fetchAppConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.settings && data.settings.app_name) {
            const titleEl = document.querySelector('.dash-title span');
            if (titleEl) {
                titleEl.textContent = `${data.settings.app_name} - Dashboard`;
                document.title = `${data.settings.app_name} - Dashboard`;
            }
        }
    } catch (e) {
        console.error("Failed to fetch app config:", e);
    }
}

async function fetchStats() {
    try {
        const response = await fetch("/api/qa/stats");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        renderDashboard(data);
    } catch (e) {
        console.error("Failed to fetch stats:", e);
        document.getElementById("loading").innerText = "Failed to load statistics.";
    }
}

function renderDashboard(data) {
    // 1. Top Level Metrics
    const total = data.total_images || 0;
    const reviewed = data.reviewed_images || 0;
    let completion = total > 0 ? ((reviewed / total) * 100) : 0;
    if (completion > 100) completion = 100;
    completion = completion.toFixed(1);

    document.getElementById("metric-total-images").innerText = total;
    document.getElementById("metric-reviewed-images").innerText = reviewed;
    document.getElementById("metric-completion").innerText = `${completion}%`;

    // 2. Clear Loading
    const chartsContainer = document.getElementById("charts");
    chartsContainer.innerHTML = ""; // Clear loading

    // 3. Render per-model cards
    const models = data.models || {};
    const modelNames = Object.keys(models);

    if (modelNames.length === 0) {
        chartsContainer.innerHTML = `<div class="loading">No model data found yet. Start reviewing images!</div>`;
        return;
    }

    modelNames.forEach(modelName => {
        const modelData = models[modelName];
        createModelSection(chartsContainer, modelName, modelData);
    });
}

function createModelSection(container, modelName, data) {
    // Create Card
    const card = document.createElement("div");
    card.className = "chart-card";

    // Header with Model Name and Avg Duration
    const header = document.createElement("div");
    header.className = "chart-header";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const title = document.createElement("h3");
    title.className = "chart-title";
    // Data now includes 'name' field from backend
    title.innerText = `Model: ${data.name || modelName}`;

    header.appendChild(title);

    // Details Container
    const detailsDiv = document.createElement("div");
    detailsDiv.style.textAlign = "right";

    // Duration (moved to stats grid)


    // Extra Details from Config
    if (data.details) {
        Object.entries(data.details).forEach(([key, val]) => {
            const detailItem = document.createElement("div");
            detailItem.style.fontSize = "0.8rem";
            detailItem.style.color = "#888"; // slightly darker than muted
            detailItem.innerText = `${key}: ${val}`;
            detailsDiv.appendChild(detailItem);
        });
    }

    header.appendChild(detailsDiv);
    card.appendChild(header);

    // Progress Bar
    const total = data.stats.reviewed + data.stats.unreviewed;
    let completion = total > 0 ? ((data.stats.reviewed / total) * 100) : 0;
    if (completion > 100) completion = 100;

    const progressContainer = document.createElement("div");
    progressContainer.style.marginBottom = "15px";

    const progressLabel = document.createElement("div");
    progressLabel.style.display = "flex";
    progressLabel.style.justifyContent = "space-between";
    progressLabel.style.marginBottom = "5px";
    progressLabel.style.fontSize = "0.9rem";
    progressLabel.style.color = "var(--text-muted)";
    progressLabel.innerHTML = `<span>Progress</span><span>${completion.toFixed(1)}%</span>`;

    const progressBarBg = document.createElement("div");
    progressBarBg.style.width = "100%";
    progressBarBg.style.height = "8px";
    progressBarBg.style.backgroundColor = "var(--bg-secondary)";
    progressBarBg.style.borderRadius = "4px";
    progressBarBg.style.overflow = "hidden";

    const progressBarFill = document.createElement("div");
    progressBarFill.style.width = `${completion}%`;
    progressBarFill.style.height = "100%";
    progressBarFill.style.backgroundColor = "var(--accent)";
    progressBarFill.style.transition = "width 0.5s ease";

    progressBarBg.appendChild(progressBarFill);
    progressContainer.appendChild(progressLabel);
    progressContainer.appendChild(progressBarBg);

    card.appendChild(progressContainer);

    // Stats Container
    const statsContainer = document.createElement("div");
    statsContainer.style.display = "flex";
    statsContainer.style.flexDirection = "column";
    statsContainer.style.gap = "15px";
    statsContainer.style.marginBottom = "15px";
    statsContainer.style.marginTop = "10px";
    statsContainer.style.padding = "10px";
    statsContainer.style.background = "var(--bg-secondary)";
    statsContainer.style.borderRadius = "8px";

    const createStatItem = (label, value, color) => {
        const div = document.createElement("div");
        div.style.textAlign = "center";
        div.style.flex = "1"; // Distribute evenly

        const valDiv = document.createElement("div");
        valDiv.style.fontSize = "1.2rem";
        valDiv.style.fontWeight = "bold";
        valDiv.style.color = color || "var(--text-primary)";
        valDiv.innerText = value;

        const labelDiv = document.createElement("div");
        labelDiv.style.fontSize = "0.8rem";
        labelDiv.style.color = "var(--text-muted)";
        labelDiv.innerText = label;

        div.appendChild(valDiv);
        div.appendChild(labelDiv);
        return div;
    };

    const createRow = () => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-around";
        row.style.gap = "10px";
        row.style.paddingBottom = "5px";
        row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        return row;
    };

    if (data.stats) {
        // Section 1: Reviewed, Unreviewed, Avg Time
        const row1 = createRow();
        row1.appendChild(createStatItem("Reviewed", data.stats.reviewed, "var(--success)"));
        row1.appendChild(createStatItem("Unreviewed", data.stats.unreviewed, "var(--text-muted)"));
        const avgTime = typeof data.avg_duration === 'number' ? data.avg_duration.toFixed(2) : data.avg_duration;
        row1.appendChild(createStatItem("Avg Time (s)", avgTime, "var(--text-primary)"));
        statsContainer.appendChild(row1);

        // Section 2: Correct, Incorrect, Doubtful
        const row2 = createRow();
        const getCount = (k) => data.counts[k] || data.counts[k.toLowerCase()] || 0;
        row2.appendChild(createStatItem("Correct", getCount("correct"), "rgba(34, 197, 94, 1)"));
        row2.appendChild(createStatItem("Incorrect", getCount("incorrect"), "rgba(239, 68, 68, 1)"));
        row2.appendChild(createStatItem("Doubtful", getCount("doubtful"), "rgba(234, 179, 8, 1)"));
        statsContainer.appendChild(row2);

        // Section 3: General Comments, BBox Comments
        const row3 = createRow();
        if (data.stats.comment_details) {
            row3.appendChild(createStatItem("General Comments", data.stats.comment_details.general, "var(--warning)"));
            row3.appendChild(createStatItem("BBox Comments", data.stats.comment_details.bbox, "var(--warning)"));
        } else {
            // Fallback
            row3.appendChild(createStatItem("Comments", data.stats.comments, "var(--warning)"));
        }
        statsContainer.appendChild(row3);

        // Section 4: Flagged Img, Flagged BBox
        const row4 = createRow();
        row4.style.borderBottom = "none"; // Last row
        row4.appendChild(createStatItem("Flagged Img", data.stats.flagged, "var(--error)"));
        if (data.stats.bbox_stats) {
            const percentageVal = `${data.stats.bbox_stats.percentage}%`;
            const labelText = `Flagged BBox (${data.stats.bbox_stats.flagged}/${data.stats.bbox_stats.total})`;
            const item = createStatItem(labelText, percentageVal, "var(--error)");
            item.title = `Flagged: ${data.stats.bbox_stats.flagged} / Total: ${data.stats.bbox_stats.total}`;
            row4.appendChild(item);
        }
        statsContainer.appendChild(row4);
    }

    card.appendChild(statsContainer);

    // Canvas Container
    const canvasContainer = document.createElement("div");
    canvasContainer.style.position = "relative";
    canvasContainer.style.height = "250px"; // Fixed height for chart
    canvasContainer.style.width = "100%";

    const canvas = document.createElement("canvas");
    canvasContainer.appendChild(canvas);
    card.appendChild(canvasContainer);

    container.appendChild(card);

    // Render Chart
    renderChart(canvas, data.counts);
}

function renderChart(canvas, counts) {
    const ctx = canvas.getContext('2d');

    // Data Preparation
    const labels = ["Correct", "Incorrect", "Doubtful"];
    // Map keys safely (case insensitive match potential?)
    // Our keys are usually lowercase but let's be robust
    const getData = (key) => counts[key] || counts[key.toLowerCase()] || 0;

    const values = [
        getData("correct"),
        getData("incorrect"),
        getData("doubtful")
    ];

    // Colors
    const colors = [
        'rgba(34, 197, 94, 0.7)',   // Green (Correct)
        'rgba(239, 68, 68, 0.7)',   // Red (Incorrect)
        'rgba(234, 179, 8, 0.7)'    // Yellow (Doubtful)
    ];

    const borderColors = [
        'rgba(34, 197, 94, 1)',
        'rgba(239, 68, 68, 1)',
        'rgba(234, 179, 8, 1)'
    ];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: values,
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: '#888'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#888'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}
