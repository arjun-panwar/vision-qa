from typing import List, Dict, Union, Any

def normalize_data(data: Union[List, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Normalizes annotation data to the format:
    [ { "class": str, "bbox": [x, y, w, h], "conf": float }, ... ]
    """
    if isinstance(data, list):
        return data
    
    if isinstance(data, dict):
        if "rawDetectorOutput" in data:
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
            
    return []
