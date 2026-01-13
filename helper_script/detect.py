import os
import json
from pathlib import Path
from ultralytics import YOLO

import argparse

def run_detection(model_name, img_dir, output_dir):
    img_dir = Path(img_dir)
    output_dir = Path(output_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Loading model: {model_name}")
    try:
        model = YOLO(model_name)
    except Exception as e:
        print(f"Error loading {model_name}, falling back to yolov8n.pt. Error: {e}")
        model = YOLO('yolov8n.pt')

    # Get list of images
    image_files = list(img_dir.glob('*.jpg')) + list(img_dir.glob('*.png'))
    
    print(f"Found {len(image_files)} images in {img_dir}")
    
    for img_path in image_files:
        # Run inference
        results = model(img_path)
        
        for result in results:
            # Generate JSON output
            boxes = result.boxes
            
            raw_detector_output = []
            if boxes is not None:
                for box in boxes:
                    # box.xyxy is [x1, y1, x2, y2]
                    # box.conf is confidence score
                    # box.cls is class index
                    
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    score = float(box.conf[0])
                    class_idx = int(box.cls[0])
                    class_name = result.names[class_idx]
                    
                    detection = {
                        "bbox": [x1, y1, x2, y2],
                        "score": score,
                        "classIdx": class_idx,
                        "className": class_name
                    }
                    raw_detector_output.append(detection)
            
            # Use image filename for JSON as requested by user
            # e.g. image.jpg -> image.json
            json_filename = img_path.with_suffix('.json').name
            
            output_path = output_dir / json_filename
            
            output_data = {
                "rawDetectorOutput": raw_detector_output,
                "metadata": {
                    "frameFilePath": str(img_path)
                }
            }
            
            with open(output_path, 'w') as f:
                json.dump(output_data, f, indent=4)
                
            print(f"Saved {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run YOLO object detection and save detections to JSON.")
    parser.add_argument("--model", type=str, default="yolo11n.pt", help="Path to YOLO model file or model name (default: yolo11n.pt)")
    parser.add_argument("--source", type=str, required=True, help="Directory containing images to process")
    parser.add_argument("--output", type=str, required=True, help="Directory to save output JSON files")
    
    args = parser.parse_args()
    
    run_detection(args.model, args.source, args.output)
