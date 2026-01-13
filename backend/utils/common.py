from typing import List, Dict, Union, Any

def normalize_data(data: Union[List, Dict[str, Any]], format: str = "default", img_size: tuple = (640, 640), labels_map: Dict = None) -> List[Dict[str, Any]]:
    """
    Normalizes annotation data to the format:
    [ { "class": str, "bbox": [x, y, w, h], "conf": float }, ... ]
    """
    if isinstance(data, list):
        if not data:
            return data
        if isinstance(data[0], dict):
            return data
        # If list of strings (YOLO lines), fall through to processing logic
    
    # Check if dict wrapper (for some reason passing list as dict?)
    # or proceed if it fell through above check
    
    if isinstance(data, dict):
        # Default/YOLO format
        if format == "default" and "rawDetectorOutput" in data:
            normalized = []
            for item in data["rawDetectorOutput"]:
                bbox_raw = item.get("bbox", [0, 0, 0, 0])
                # Convert x1,y1,x2,y2 -> x,y,w,h
                x1, y1, x2, y2 = bbox_raw[0], bbox_raw[1], bbox_raw[2], bbox_raw[3]
                w = x2 - x1
                h = y2 - y1
                
                normalized.append({
                    "class": item.get("className", "unknown"),
                    "bbox": [x1, y1, w, h],
                    "conf": item.get("score", 0.0)
                })
            return normalized
        
        # LabelMe format
        elif format == "labelme" and "shapes" in data:
            normalized = []
            for shape in data["shapes"]:
                label = shape.get("label", "unknown")
                points = shape.get("points", [])
                
                if not points:
                    continue
                    
                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                x_min, x_max = min(xs), max(xs)
                y_min, y_max = min(ys), max(ys)
                
                w = x_max - x_min
                h = y_max - y_min
                
                normalized.append({
                    "class": label,
                    "bbox": [x_min, y_min, w, h],
                    "conf": 1.0
                })
            return normalized

    # YOLO .txt format (normalized)
    if format == "yolo" and isinstance(data, list):
        # Expecting data to be a list of strings: "class x y w h"
        normalized = []
        img_w, img_h = img_size
        
        for line in data:
            parts = line.strip().split()
            if len(parts) >= 5:
                try:
                    cls_id = int(parts[0])
                    cx, cy, nw, nh = map(float, parts[1:5])
                    
                    # Convert normalized center-wh to absolute top-left-wh
                    w = nw * img_w
                    h = nh * img_h
                    x = (cx * img_w) - (w / 2)
                    y = (cy * img_h) - (h / 2)
                    
                    # Resolve class name if labels provided
                    cls_name = str(cls_id)
                    if labels_map:
                        # Try int key first, then string
                        if cls_id in labels_map:
                            cls_name = labels_map[cls_id]
                        elif str(cls_id) in labels_map:
                            cls_name = labels_map[str(cls_id)]
                        else:
                            from backend.utils._logger import logger
                            logger.warning(f"Class ID {cls_id} not found in labels_map: {list(labels_map.keys())[:5]}... (Types: {[type(k) for k in list(labels_map.keys())[:3]]})")
                    
                    normalized.append({
                        "class": cls_name,
                        "bbox": [x, y, w, h],
                        "conf": 1.0 
                    })
                except ValueError:
                    continue
        return normalized

    return []
