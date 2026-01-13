# Structural Integrity & Flow Report

---

## 1. Executive Summary

This application is a **FastAPI-backed Computer Vision Visualization Tool**. It bridges a local filesystem (containing images and model outputs) with a reactive **Vanilla JS/HTML5 Canvas** frontend. The core DNA is **stateless REST API** combined with **stateful client-side rendering**. The primary objective is to visually verify and QA computer vision model predictions.

---

## 2. Module Analysis

### 2.1 Backend Core (`backend/main.py`)

**Purpose**: Acts as the central nervous system, managing project state (`ProjectState`), serving static assets, and providing endpoints for configuration, data retrieval, and QA persistence.  

**Data Flow**: 
- **Input**: HTTP Requests, `model_config.yaml`, `qa_status.xlsx`, JSON Annotation Files.
- **Output**: JSON Responses, File Streams (Images), Excel writes.

**Logic Flow**:
```text
[Requests] --> [FastAPI App] --> [Router]
                                    |
            +-----------------------+-----------------------+
            |                       |                       |
      [Static Serve]          [API Endpoints]        [Global State]
      (index/app.js)          (config/data/qa)       (ProjectState)
                                    |                       |
                            [FileSystem / IO] <-------------+
```

**Bottleneck Risks**: 
- **Global State (`state = ProjectState()`)**: The use of a global instance makes the backend stateful regarding the *currently loaded project*. This limits the server to handling one project at a time for all users (singleton pattern).
- **Synchronous IO**: While FastAPI is async, file operations (opening JSONs/Images) are largely synchronous here. Heavy loads with large JSONs could block the event loop if not handled carefully (though FastAPI creates threads for def paths).

---

### 2.2 Frontend Engine (`static/app.js`)

**Purpose**: A heavy client-side engine that handles all application logic, state management (`state` object), and high-performance rendering on HTML5 Canvas.

**Data Flow**:
- **Input**: User Events, JSON from API (`/config`, `/list`, `/data`, `/qa`).
- **Output**: DOM Updates, Canvas Draws, API Calls (`/qa/save`).

**Logic Flow**:
```text
[Window Load] --> [init()] --> [Fetch Config & Lists]
                                       |
                   +-------------------+-------------------+
                   |                   |                   |
            [Render UI]          [Load Image] <---- [User Select]
           (Sidebar/Filters)           |
                                       V
                            [Fetch Annotations]
                                       |
                              [Canvas Draw Loop]
                                       |
                     [Transform/Scale] + [Filter Logic]
```

**Bottleneck Risks**:
- **`draw()` Complexity**: The render loop iterates through all boxes for all visible models. With a high number of boxes/complex polygons, this could degrade FPS during zoom/pan.
- **State Monolith**: The `state` object creates high coupling. Modifying one part (e.g., `comparisonMode`) requires careful updates across multiple UI functions (`toggle`, `resize`, `highlight`).

---

### 2.3 Dashboard Analytics (`static/dashboard.js`)

**Purpose**: Provides a statistical overview of the QA process, visualizing model performance using Chart.js.

**Data Flow**:
- **Input**: JSON from `/api/qa/stats`.
- **Output**: DOM manipulation, Chart.js rendering.

**Logic Flow**:
```text
[Page Load] --> [fetchStats()] --> [Render Detailed Stats & Charts]
                                         |
                                [Iterate Models]
                                         |
                                [Create Chart Card] --> [Chart.js]
```

**Bottleneck Risks**:
- **Data Aggregation**: The backend calculates stats on-the-fly by reading the Excel file. As the Excel file grows (thousands of rows), the `/api/qa/stats` endpoint latency will increase linearly.

---

## 3. Critical Dependencies & sequencing

### 3.1 Primary User Story: "Happy Path" (Annotate & QA)

**Sequence**:
1.  **Auth/Entry**: User hits `/` -> `index.html` loads -> `app.js` inits.
2.  **Config**: `GET /api/config` loads models and labels.
3.  **Browse**: `GET /api/system/browse` or `POST /api/project/load` sets the `ProjectState`.
4.  **Visualize**: 
    - `GET /api/images/{img}` loads pixel data.
    - `GET /api/data/{img}` loads annotation headers.
    - `draw()` renders overlay.
5.  **Action**: User clicks "Correct".
6.  **Persistence**: 
    - `POST /api/qa/save` writes to `qa_status.xlsx`.
    - Frontend updates local `state.qaData` optimistically.

**ASCII Flow**:
```text
[User] --(Open)--> [Frontend] --(Get Config)--> [Backend] --(Read)--> [YAML]
                       |
                   (Load Proj) --(Post Path)--> [Backend] --(Init)--> [ProjectState]
                       |
[User] --(Select Img)-> [Frontend] --(Get Img/Data)--> [Backend] --(Read)--> [Files]
                       |                                    |
                    (Render) <--------(JSON/Blob)-----------+
                       |
[User] --(Grade)--> [Frontend] --(Post QA)--> [Backend] --(Write)--> [Excel]
```

---

## 4. Structural Integrity Assessment

### 4.1 High Coupling Areas
-   **`ProjectState` in Backend**: The entire backend relies on this single mutable object. Refactoring to support multi-tenancy would require significant dependency injection changes.
-   **`state` object in Frontend**: Acts as a central store but lacks a formal reducer/action pattern (like Redux). Logic is scattered across event handlers that directly mutate this global object.

### 4.2 Entry Points
-   **Backend**: `backend/main.py:app` (FastAPI instance).
-   **Frontend**: `static/index.html` (DOM entry) -> `static/app.js:init()` (Logic entry).

### 4.3 Data Boundaries
-   **JSON Format**: The backend normalizes disparate model outputs into a unified dictionary structure likely defined in `backend/main.py:normalize_data`. This is the critical contract between backend and frontend.
-   **Config Keys**: `model_config.yaml` keys dictate how the frontend renders filters and toggles. Mismatches here will causing rendering failures.

---
**Status**: Analysis Complete.
**Recommendation**: The architecture is lean and suitable for single-user local deployment. For scale, the `ProjectState` singleton and Excel-based persistence are the primary limitations to address.
