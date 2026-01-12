# Model Configuration Guide

The `model_config.yaml` file is the heart of a **VisionQA** project. It defines where images are located, what labels are used, and which models are available for visualization and comparison.

## File Structure

The configuration file is a standard YAML file. It relies on specific keys to configure the application.

### 1. Global Settings

These settings apply to the entire project.

| Key | Type | Description |
| :--- | :--- | :--- |
| `image_directory` | `string` | **Required.** Path to the folder containing images. Can be an absolute path or relative to the project folder. |
| `labels` | `dict` | **Required.** A mapping of class IDs (integers) to class names (strings). This is used for mapping model outputs to human-readable names and assigning consistent colors. |

**Example:**
```yaml
image_directory: images
labels:
  0: person
  1: bicycle
  2: car
```

### 2. Model Definitions

You can define any number of models. The application identifies a model by looking for keys that start with `model_`.

| Key | Type | Description |
| :--- | :--- | :--- |
| `model_name` | `string` | **Required.** The human-readable name displayed in the UI. |
| `jsons_dir` | `string` | **Optional.** Directory containing the JSON annotation files for this model. Defaults to `{key}_json` if omitted. |
| `color` | `string` | **Optional.** A specific hex color (e.g., `#ff0000`) to use for this model's bounding boxes. If omitted, a color is assigned automatically. |
| `version` | `string` | **Metadata.** Displayed in the Dashboard details. |
| `weights_file` | `string` | **Metadata.** Displayed in the Dashboard details. |

**Example:**
```yaml
model_v1:
  model_name: "YOLOv8 Base"
  jsons_dir: "predictions_v1"
  version: "v8.0.0"
  weights_file: "yolov8n.pt"

model_v2:
  model_name: "YOLOv8 Fine-tuned"
  jsons_dir: "predictions_v2"
  color: "#00ff00"
```

### 3. Metadata Fields
The following fields are often found in the config file for record-keeping but are **not currently used** by the application logic:

- `task` (e.g., `detect`)
- `img_size` (e.g., `640`)
- `confidence_threshold` (e.g., `0.35`) - *Note: Threshold is currently controlled via the UI slider.*

## Complete Example

```yaml
task: detect
img_size: 640
description: "Comparison of Base vs Fine-tuned models"

# 1. Global Config
image_directory: /data/datasets/coco/val2017
labels:
  0: person
  1: bicycle
  2: car

# 2. Models
model_base:
  model_name: YOLO Base
  jsons_dir: runs/detect/base_predictions
  version: v1.0
  weights_file: base.pt

model_finetune:
  model_name: YOLO FT
  jsons_dir: runs/detect/ft_predictions
  version: v1.1
  weights_file: ft_best.pt
```
