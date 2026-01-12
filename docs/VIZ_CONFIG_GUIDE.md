# Visual Configuration Guide

The `viz_config.json` file stores the user's personal visual preferences and interface state. Unlike `model_config.yaml` (which is shared project data) or `app_config.json` (which is global app policy), this file is typically auto-generated and updated as you interact with the UI.

It is located dynamically:
- If a project is loaded, it is saved as `viz_config.json` inside the project root directory.

## File Structure

This file is a JSON object containing state persistence for the frontend.

### 1. Rendering Settings

These settings directly affect how bounding boxes and labels are drawn on the canvas.

| Key | Type | Description |
| :--- | :--- | :--- |
| `lineWidth` | `number` | Thickness of bounding box lines (in pixels). |
| `fontSize` | `number` | Size of the label text (in pixels). |
| `ghostOpacity` | `number` | Opacity (0.0 - 1.0) of "hidden" boxes when ghost mode is active. |
| `showLabels` | `boolean` | Whether to render text labels above boxes. |
| `showScores` | `boolean` | Whether to include confidence scores in the labels. |

### 2. Class Filters & Colors

| Key | Type | Description |
| :--- | :--- | :--- |
| `classColors` | `object` | A map of ClassName -> HexColor logic. This persists your color customizations. |
| `visibleClasses` | `array<string>` | A list of class names that are currently checked (visible) in the sidebar filter. |

### 3. View State

| Key | Type | Description |
| :--- | :--- | :--- |
| `transform` | `object` | Stores the current Zoom (`scale`) and Pan (`x`, `y`) coordinates of the canvas. |
| `leftSidebarOpen` | `boolean` | State of the left image list sidebar. |
| `rightSidebarOpen` | `boolean` | State of the right controls sidebar. |
| `flagMode` | `boolean` | Whether the "Flag Mode" tool is currently active. |

## Auto-Save Behavior

The application automatically saves this file triggered by specific events:
- **Toggling Sidebars**: Saves immediately.
- **Changing Colors**: Saves immediately.
- **Toggling Classes**: Saves immediately.
- **Zoom/Pan**: Saved via a debounce mechanism (waiting for 1 second of inactivity).

## Example

```json
{
    "lineWidth": 2,
    "fontSize": 20,
    "ghostOpacity": 0.2,
    "showLabels": true,
    "showScores": true,
    "classColors": {
        "person": "#ff0000",
        "car": "#00ff00"
    },
    "visibleClasses": [
        "person",
        "car"
    ],
    "transform": {
        "scale": 1.5,
        "x": -100,
        "y": -50,
        "isDragging": false,
        "startX": 0,
        "startY": 0
    },
    "leftSidebarOpen": true,
    "rightSidebarOpen": true,
    "flagMode": false
}
```
