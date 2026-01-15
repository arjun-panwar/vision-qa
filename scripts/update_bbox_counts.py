
import pandas as pd
import json
import os
from pathlib import Path
import sys
import yaml

def load_config():
    with open("project2/model_config.yaml", "r") as f:
        return yaml.safe_load(f)

def get_bbox_count(file_path, fmt):
    try:
        if not os.path.exists(file_path):
            return 0
            
        if fmt == 'yolo':
            with open(file_path, 'rb') as f:
                return sum(1 for _ in f)
        else: # json
            with open(file_path, 'r') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return len(data.get("rawDetectorOutput", []))
                elif isinstance(data, list):
                    return len(data)
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return 0
    return 0

def main():
    config = load_config()
    qa_path = Path("project2/qa_status.xlsx")
    
    if not qa_path.exists():
        print("No qa_status.xlsx found")
        return

    df = pd.read_excel(qa_path)
    print(f"Loaded {len(df)} rows")

    # Manually parse models from config keys
    models = {}
    for key, val in config.items():
        if key.startswith("model_") and isinstance(val, dict) and "model_name" in val:
             # Standardize key to model_name (e.g. yolov8n)
             m_name = val["model_name"]
             models[m_name] = val

    updates = 0
    
    for model_key, model_cnf in models.items():
        name = model_cnf.get("model_name", model_key)
        safe_name = "".join([c if c.isalnum() else "_" for c in name])
        
        col_box_count = f"{safe_name}_box_count"
        
        # Ensure column exists
        if col_box_count not in df.columns:
            df[col_box_count] = 0
            print(f"Created column {col_box_count}")

        # Directory logic
        # Config uses jsons_dir
        json_dir = model_cnf.get("jsons_dir")
        if not json_dir:
            print(f"No jsons_dir for {model_key}")
            continue
            
        pred_dir = Path("project2") / json_dir
        
        # Format logic
        # Default to json unless format: yolo
        fmt = model_cnf.get("format", "json")
        ext = ".txt" if fmt == "yolo" else ".json"
        
        print(f"Processing {model_key} in {pred_dir}...")
        
        for idx, row in df.iterrows():
            img_name = row['image']
            base_name = os.path.splitext(img_name)[0]
            pred_file = pred_dir / f"{base_name}{ext}"
            
            count = get_bbox_count(pred_file, fmt)
            
            # Update
            df.at[idx, col_box_count] = count
            updates += 1
            
    df.to_excel(qa_path, index=False)
    print(f"Updated {updates} box counts. Saved to {qa_path}")

if __name__ == "__main__":
    main()
