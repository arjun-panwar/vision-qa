// Dashboard Logic

document.addEventListener("DOMContentLoaded", () => {
    fetchStats();
});

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
    const completion = total > 0 ? ((reviewed / total) * 100).toFixed(1) : 0;

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

    // Stats Grid
    const statsGrid = document.createElement("div");
    statsGrid.style.display = "grid";
    // Responsive grid: auto-fit with min width
    statsGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(100px, 1fr))";
    statsGrid.style.gap = "10px";
    statsGrid.style.marginBottom = "15px";
    statsGrid.style.marginTop = "10px";
    statsGrid.style.padding = "10px";
    statsGrid.style.background = "var(--bg-secondary)";
    statsGrid.style.borderRadius = "8px";

    const createStatItem = (label, value, color) => {
        const div = document.createElement("div");
        div.style.textAlign = "center";

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

    if (data.stats) {
        // Row 1: General Stats
        statsGrid.appendChild(createStatItem("Reviewed", data.stats.reviewed, "var(--success)"));
        statsGrid.appendChild(createStatItem("Unreviewed", data.stats.unreviewed, "var(--text-muted)"));
        statsGrid.appendChild(createStatItem("Flagged", data.stats.flagged, "var(--error)"));
        statsGrid.appendChild(createStatItem("Comments", data.stats.comments, "var(--warning)"));

        // Row 2 (implicitly via grid auto-flow): Results
        // Get counts safely
        const getCount = (k) => data.counts[k] || data.counts[k.toLowerCase()] || 0;

        statsGrid.appendChild(createStatItem("Correct", getCount("correct"), "rgba(34, 197, 94, 1)"));
        statsGrid.appendChild(createStatItem("Incorrect", getCount("incorrect"), "rgba(239, 68, 68, 1)"));
        statsGrid.appendChild(createStatItem("Doubtful", getCount("doubtful"), "rgba(234, 179, 8, 1)"));
        statsGrid.appendChild(createStatItem("Avg Time (s)", data.avg_duration, "var(--text-primary)"));
    }

    card.appendChild(statsGrid);

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
