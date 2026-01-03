# Technical Flow Documentation

This document outlines the architecture and data flow of the YOLO Visualization Tool.

## Architecture Overview

The application is built with a **FastAPI** backend and a **Vanilla JavaScript** frontend.

- **Backend**: Handles file system access, serves static files, and processes API requests.
- **Frontend**: Renders images and annotations on an HTML5 Canvas and manages user interaction.

## Backend (`backend/main.py`)

The backend is responsible for:

1.  **Static File Serving**:
    - Mounts the `/static` directory to serve HTML, CSS, and JS files.
    - Serves `index.html` at the root `/`.

2.  **Project State Management**:
    - `ProjectState` class manages the currently loaded project, configuration, image paths, and model details.
    - Caches the last loaded project in `.project_cache.json` for persistence across restarts.

3.  **API Endpoints**:
    - **Configuration**:
        - `GET /api/config`: Returns the current project state (models, labels, visual settings).
        - `POST /api/project/settings`: Saves visual settings (e.g., class colors) to `viz_config.json`.
        - `POST /api/project/load`: Loads a new project from a specified path.
    - **File System**:
        - `GET /api/system/browse`: Opens a server-side directory picker (supports Zenity or Tkinter).
        - `GET /api/list`: Lists all supported image files in the project's `images` directory.
        - `GET /api/images/{filename}`: Streams the image file to the client.
    - **Data/Annotations**:
        - `GET /api/data/{filename}`: Reads JSON annotation files for the given image from all configured models. It normalizes distinct model outputs into a standard format: `[{ "class": ..., "bbox": [x, y, w, h], "conf": ... }]`.
    - **QA Workflow**:
        - `GET /api/qa/load`: Reads the QA status from `qa_status.xlsx`.
        - `POST /api/qa/save`: Updates the QA status/comment for an image in the Excel file.

## Frontend (`static/`)

The frontend handles the visualization and user interaction.

### Files
- **`index.html`**: Main structure including sidebars, canvas container, and controls.
- **`style.css`**: Styling for the application (dark mode theme).
- **`app.js`**: Core logic.

### Key Logic Flow (`app.js`)

1.  **Initialization (`init`)**:
    - Fetches configuration from `/api/config`.
    - Fetches the list of images from `/api/list`.
    - Fetches existing QA data from `/api/qa/load`.

2.  **Image Loading**:
    - On selection, updates `img.src` via `/api/images/{filename}`.
    - Fetches annotations via `/api/data/{filename}`.
    - Resizes canvas to match image dimensions.

3.  **Rendering (`draw` loop)**:
    - Clears the canvas.
    - Iterates through visible models and annotations.
    - Filters boxes based on selected classes, confidence threshold, and hidden status.
    - Draws valid bounding boxes and labels on the canvas.
    - Handles "ghost" styling for hidden boxes.

4.  **Interactions**:
    - **Zoom/Pan**: CSS `transform` on the container div.
    - **Click/Double Click**: Hides/Unhides specific bounding boxes at cursor position.
    - **Controls**: Updates state (e.g., `confidence`, `visibleModels`) and triggers `draw()`.
    - **QA**: Sends updates to `/api/qa/save` and updates local UI state.

## Data Flow Diagram

```mermaid
graph TD
    User[User] -->|Browser| Frontend[Frontend (app.js)]
    Frontend -->|HTTP Requests| Backend[Backend (FastAPI)]
    
    subgraph Backend Services
        Backend -->|Serve| StaticFiles[Static Files]
        Backend -->|Read/Write| FileSystem[File System]
        Backend -->|Read/Write| QAFile[qa_status.xlsx]
        Backend -->|Read| ModelConfig[model_config.yaml]
        Backend -->|Read| Annotations[JSON Annotations]
    end
    
    subgraph Frontend Logic
        Frontend -->|Draw| Canvas[HTML5 Canvas]
        Frontend -->|Manage| State[App State]
    end
```
