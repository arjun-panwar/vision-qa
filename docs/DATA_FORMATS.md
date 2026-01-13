# Data Formats Guide

This guide explains the data formats supported by the YOLO Visualization Tool and how to generate them.

## Supported Formats

The tool currently supports two primary formats for model predictions and ground truth annotations:

### 1. Default (JSON)
This is the standard format used by this visualization tool for model predictions. It provides rich metadata including bounding boxes, confidence scores, and class names.

**File Structure:**
- Files should be named exactly like their corresponding image files but with a `.json` extension (e.g., `image1.jpg` -> `image1.json`).
- Located in the directory specified by `jsons_dir` in `model_config.yaml`.

**JSON Schema:**
```json
{
    "rawDetectorOutput": [
        {
            "bbox": [x_min, y_min, x_max, y_max],  // Absolute coordinates
            "score": 0.85,                         // Confidence (0.0 - 1.0)
            "classIdx": 0,                         // Class ID (optional)
            "className": "person"                  // Class Name (REQUIRED)
        },
        ...
    ],
    "metadata": {
        "frameFilePath": "/path/to/image.jpg"
    }
}
```

### 2. YOLO (TXT)
This format is commonly used for Ground Truth datasets in YOLO training. It is a simple text format containing normalized bounding box coordinates.

**File Structure:**
- Files should be named like the image file with a `.txt` extension (e.g., `image1.jpg` -> `image1.txt`).
- Located in the directory specified by `jsons_dir` in `model_config.yaml`.

**Content Format:**
Each line represents one object:
```text
<class_id> <x_center> <y_center> <width> <height>
```
- **class_id**: Integer representing the object class (mapped to names via `labels` in `model_config.yaml`).
- **x_center, y_center*: Normalized coordinates (0.0 - 1.0) of the box center.
- **width, height**: Normalized width and height (0.0 - 1.0) of the box.

**Example:**
```text
0 0.53 0.29 0.12 0.45
2 0.88 0.45 0.10 0.22
```

> **Note:** For YOLO format, it is CRITICAL to have the `labels` map correctly defined in your `model_config.yaml` so the tool can convert IDs like `0` to names like `person`.

---

## Generating Annotations

We provide a helper script to easily generate "Default" JSON annotations from a trained YOLO model.

### Using `helper_script/detect.py`

This script runs inference on a folder of images using a YOLO model (e.g., `yolo11n.pt`, `yolov8n.pt`) and saves the detections in the supported JSON format.

**Location:** `helper_script/detect.py`

**Usage:**

1.  **Activate your environment** (ensure `ultralytics` is installed):
    ```bash
    conda activate yolo_viz
    ```

2.  **Run the script**:
    ```bash
    python helper_script/detect.py --model <model_path_or_name> --source <image_dir> --output <output_dir>
    ```

**Arguments:**
- `--model`: Path to your `.pt` file or a simpler model name (default: `yolo11n.pt`).
- `--source`: Directory containing the images you want to process.
- `--output`: Directory where the resulting JSON files will be saved.

**Example:**
To generate detections for images in `project2/images` using `yolo11n` and save them to `project2/yolo11n_json`:

```bash
python helper_script/detect.py \
    --model yolo11n.pt \
    --source project2/images \
    --output project2/yolo11n_json
```

After running this, update your `model_config.yaml` to point to the new `yolo11n_json` directory.
