# YOLO Object Detection Helper Script

This script allows you to run YOLO object detection on a directory of images and save the detection results in a specific JSON format.

## Prerequisites

- Python 3.8+
- `ultralytics` package
- A valid YOLO model weight file (e.g., `yolo11n.pt`, `yolov12m.pt`)

Install dependencies:
```bash
pip install ultralytics
```

## Usage

```bash
python helper_script/detect.py --source <IMAGE_DIR> --output <OUTPUT_DIR> --model <MODEL_WEIGHTS>
```

### Arguments

- `--source`: Path to the directory containing images (jpg, png).
- `--output`: Path to the directory where JSON files will be saved.
- `--model`: Path to the YOLO model weights file (default: `yolo11n.pt`).

### Example

```bash
python helper_script/detect.py --source project2/images --output project2/yolov12m_json --model yolov12m.pt
```

## Output Format

The script generates one JSON file per image with the same filename (e.g., `image.jpg` -> `image.json`).

JSON Structure:
```json
{
    "rawDetectorOutput": [
        {
            "bbox": [x1, y1, x2, y2],
            "score": 0.95,
            "classIdx": 2,
            "className": "car"
        },
        ...
    ],
    "metadata": {
        "frameFilePath": "/absolute/path/to/image.jpg"
    }
}
```
