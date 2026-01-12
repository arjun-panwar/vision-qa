# Application Configuration Guide

The `app_config.json` file controls the global settings of the **VisionQA** application. These settings affect the UI appearance and interaction limits, independent of the loaded project.

## File Structure

The configuration file is a standard JSON file located at the root of the application directory.

### 1. General Settings

| Key | Type | Description |
| :--- | :--- | :--- |
| `app_name` | `string` | **Optional.** Sets the browser tab title and the application name displayed in the top-left corner of the header. Defaults to "VisionQA" if omitted. |

### 2. UI Constraints (`ui_constraints`)

This section defines the minimum and maximum allowed values for various UI controls. This is useful for restricting user adjustments to reasonable ranges.

| Sub-Key | Parameter | Description |
| :--- | :--- | :--- |
| `thickness` | `min`, `max` | Controls the bounding box line width slider range (pixels). |
| `opacity` | `min`, `max` | Controls the bounding box fill opacity slider range (0.0 - 1.0). |
| `fontSize` | `min`, `max` | Controls the label font size slider range (pixels). |

**Example:**
```json
"ui_constraints": {
    "thickness": { "min": 1, "max": 10 },
    "opacity": { "min": 0.1, "max": 0.8 },
    "fontSize": { "min": 12, "max": 32 }
}
```

### 3. Preset Colors (`preset_colors`)

| Key | Type | Description |
| :--- | :--- | :--- |
| `preset_colors` | `array<string>` | A list of hex color codes (e.g., `"#ff0000"`) that appear in the color picker palette when customizing class colors. |

**Example:**
```json
"preset_colors": [
    "#FF5733",
    "#33FF57",
    "#3357FF"
]
```

## Complete Example

```json
{
    "app_name": "My Custom Vision Tool",
    "ui_constraints": {
        "thickness": {
            "min": 1,
            "max": 20
        },
        "opacity": {
            "min": 0.1,
            "max": 1.0
        },
        "fontSize": {
            "min": 10,
            "max": 40
        }
    },
    "preset_colors": [
        "#ff0000",
        "#00ff00",
        "#0000ff",
        "#ffff00",
        "#00ffff"
    ]
}
```
