import os
import json
import glob
import yaml
from fastapi import FastAPI, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import subprocess
import shutil

# Global State
CACHE_FILE = ".project_cache.json"

class ProjectState:
    def __init__(self):
        self.root_dir = None
        self.images_dir = None
        # self.models will be a dict: { "model_key": { "name": "...", "dir": "..." } }
        self.models = {}
        self.labels = {}
        self.config = {}
        self.load_cache()

    def load_cache(self):
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r") as f:
                    data = json.load(f)
                    path = data.get("last_project")
                    if path and os.path.exists(path) and os.path.exists(os.path.join(path, "model_config.yaml")):
                        print(f"Restoring cached project: {path}")
                        with open(os.path.join(path, "model_config.yaml"), "r") as cf:
                            config = yaml.safe_load(cf)
                        self.update(path, config, save=False)
            except Exception as e:
                print(f"Failed to load cache: {e}")

    def save_cache(self):
        try:
            with open(CACHE_FILE, "w") as f:
                json.dump({"last_project": self.root_dir}, f)
        except Exception as e:
            print(f"Failed to save cache: {e}")

    def update(self, root_path, config, save=True):
        self.root_dir = root_path
        self.config = config
        self.images_dir = os.path.join(self.root_dir, "images")
        
        # Parse global labels
        self.labels = config.get("labels", {})
        
        # Load visualization settings (class colors)
        self.viz_settings = {}
        settings_path = os.path.join(self.root_dir, "viz_config.json")
        if os.path.exists(settings_path):
            try:
                with open(settings_path, "r") as f:
                    self.viz_settings = json.load(f)
            except Exception as e:
                print(f"Failed to load viz_settings: {e}")

        # Parse models dynamically
        self.models = {}
        for key, val in config.items():
            if key.startswith("model_") and isinstance(val, dict):
                json_dir = os.path.join(self.root_dir, val.get("jsons_dir", key + "_json"))
                self.models[key] = {
                    "name": val.get("model_name", key),
                    "dir": json_dir,
                    "color": val.get("color", None)
                }
        
        if save:
            self.save_cache()

    def refresh(self):
        """Re-reads the config file from disk if a project is loaded."""
        if self.root_dir:
            config_path = os.path.join(self.root_dir, "model_config.yaml")
            if os.path.exists(config_path):
                try:
                    with open(config_path, "r") as f:
                        config = yaml.safe_load(f)
                    # Update without overwriting root_dir, and don't trigger save_cache unnecessarily
                    self.update(self.root_dir, config, save=False)
                except Exception as e:
                    print(f"Failed to refresh config: {e}")

state = ProjectState()

class LoadProjectRequest(BaseModel):
    path: str

class SaveSettingsRequest(BaseModel):
    settings: dict

@app.get("/")
async def read_index():
    return FileResponse("static/index.html")

@app.get("/api/config")
async def get_config():
    """Returns the current project configuration including known models and labels."""
    # Always refresh on config fetch to catch manual edits
    state.refresh()

    # Load global app config dynamically to catch updates
    app_config = {}
    if os.path.exists("app_config.json"):
        try:
            with open("app_config.json", "r") as f:
                app_config = json.load(f)
        except Exception as e:
            print(f"Failed to reload app_config.json: {e}")
    
    # Merge global APP_CONFIG into settings for frontend
    settings = getattr(state, "viz_settings", {}).copy()
    settings.update(app_config)
    
    return {
        "models": state.models,
        "labels": state.labels,
        "settings": settings,
        "loaded": state.root_dir is not None
    }

@app.post("/api/project/settings")
async def save_settings(req: SaveSettingsRequest):
    if not state.root_dir:
        raise HTTPException(status_code=400, detail="No project loaded")
    
    settings_path = os.path.join(state.root_dir, "viz_config.json")
    try:
        # We only save visual settings. APP_CONFIG is read-only from backend perspective here.
        # Frontend might send back app_name merged in settings, so we should ideally filter it out?
        # But for now, let's just save what frontend sends minus known global keys if we want to be strict.
        # OR: Just trust frontend? 
        # Better: Filter out keys that belong to APP_CONFIG to keep viz_config.json clean.
        
        data_to_save = req.settings.copy()
        # Remove global config keys to prevent them from leaking into project config
        keys_to_remove = ["app_name", "ui_constraints"]
        for k in keys_to_remove:
            if k in data_to_save:
                del data_to_save[k]
                
        with open(settings_path, "w") as f:
            json.dump(data_to_save, f, indent=4)
        
        # Update in-memory state
        state.viz_settings = data_to_save
        return {"status": "success", "message": "Settings saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/project/load")
async def load_project(req: LoadProjectRequest):
    project_path = req.path
    if not os.path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project path does not exist")
    
    config_path = os.path.join(project_path, "model_config.yaml")
    if not os.path.exists(config_path):
        raise HTTPException(status_code=400, detail="model_config.yaml not found in directory")
    
    try:
        with open(config_path, "r") as f:
            config = yaml.safe_load(f)
        
        state.update(project_path, config)
        return {"status": "success", "message": f"Loaded project from {project_path}", "config": config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/system/browse")
async def browse_folder():
    """
    Opens a server-side directory picker. 
    Uses 'zenity' if available (native Linux/GNOME), falls back to tkinter.
    """
    # 1. Try Zenity (Native Linux)
    if shutil.which("zenity"):
        try:
            result = subprocess.run(
                ["zenity", "--file-selection", "--directory", "--title=Select Project Folder"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                return {"path": result.stdout.strip(), "cancelled": False}
            else:
                return {"path": None, "cancelled": True}
        except Exception as e:
            print(f"Zenity failed: {e}")

    # 2. Fallback to Tkinter
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        
        folder_selected = filedialog.askdirectory()
        root.destroy()
        
        if not folder_selected:
            return {"path": None, "cancelled": True}
            
        return {"path": folder_selected, "cancelled": False}
    except Exception as e:
        print(f"Browse Error: {e}")
        return {"error": "Cannot open file dialog on server. Please manually enter path.", "details": str(e)}

@app.get("/api/list")
async def list_images():
    if not state.images_dir or not os.path.exists(state.images_dir):
        return {"images": []}
    
    extensions = ['*.jpg', '*.jpeg', '*.png', '*.bmp', '*.JPG', '*.JPEG', '*.PNG']
    images = []
    for ext in extensions:
        images.extend(glob.glob(os.path.join(state.images_dir, ext)))
    
    image_filenames = sorted(list(set([os.path.basename(img) for img in images])))
    return {"images": image_filenames}

@app.get("/api/images/{filename}")
async def get_image(filename: str):
    if not state.images_dir:
        raise HTTPException(status_code=404, detail="No project loaded")
    
    file_path = os.path.join(state.images_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(file_path)

def normalize_data(data):
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
                bbox_raw = item.get("bbox", [0,0,0,0])
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

@app.get("/api/data/{filename}")
async def get_annotations(filename: str):
    base_name = os.path.splitext(filename)[0]
    json_name = f"{base_name}.json"
    
    response = {}
    
    for model_key, model_info in state.models.items():
        json_dir = model_info["dir"]
        json_path = os.path.join(json_dir, json_name)
        response[model_key] = []
        
        if os.path.exists(json_path):
            try:
                with open(json_path, "r") as f:
                    raw_data = json.load(f)
                    response[model_key] = normalize_data(raw_data)
            except Exception as e:
                print(f"Error reading {json_path}: {e}")
                
    return response

# -- QA Workflow --
import pandas as pd
from datetime import datetime

class QARequest(BaseModel):
    image: str
    model: str  # New field: which model is being graded
    status: str
    comment: str = ""
    flags: str = ""  # JSON string of flagged boxes

def get_qa_file_path():
    if not state.root_dir:
        return None
    return os.path.join(state.root_dir, "qa_status.xlsx")

@app.post("/api/qa/save")
async def save_qa_status(req: QARequest):
    qa_path = get_qa_file_path()
    if not qa_path:
        raise HTTPException(status_code=400, detail="No project loaded")

    try:
        # Load existing or create new
        if os.path.exists(qa_path):
            df = pd.read_excel(qa_path)
            if 'image' not in df.columns:
                df = pd.DataFrame(columns=['image', 'timestamp'])
        else:
            df = pd.DataFrame(columns=['image', 'timestamp'])

        # Define columns for this model
        # Logic: {model}_status, {model}_comment, {model}_flags
        # If req.model is empty or specific "general" case, we could stick to old cols, 
        # but the plan is to be model-specific.
        # If req.model is missing (legacy frontend?), we might fallback to generic checks, 
        # but we updated frontend plan to send it.
        
        prefix = req.model
        col_status = f"{prefix}_status"
        col_comment = f"{prefix}_comment"
        col_flags = f"{prefix}_flags"

        # Ensure columns exist
        for col in [col_status, col_comment, col_flags]:
            if col not in df.columns:
                df[col] = "" # Initialize new column

        # Check if row exists
        mask = df['image'] == req.image
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if mask.any():
            # Update existing row
            df.loc[mask, col_status] = req.status
            df.loc[mask, col_comment] = req.comment
            df.loc[mask, col_flags] = req.flags
            df.loc[mask, 'timestamp'] = timestamp
        else:
            # Append new row
            new_row_data = {
                'image': req.image,
                'timestamp': timestamp,
                col_status: req.status,
                col_comment: req.comment,
                col_flags: req.flags
            }
            new_row = pd.DataFrame([new_row_data])
            df = pd.concat([df, new_row], ignore_index=True)
            
        # Save back
        df.to_excel(qa_path, index=False)
        return {"status": "success", "message": f"QA status saved for {req.model}"}
        
    except Exception as e:
        print(f"QA Save Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save QA status: {str(e)}")

@app.get("/api/qa/load")
async def load_qa_status():
    qa_path = get_qa_file_path()
    if not qa_path or not os.path.exists(qa_path):
        return {}
        
    try:
        df = pd.read_excel(qa_path).fillna('')
        
        # Result format:
        # { 
        #   "image_name": {
        #       "model_name": { "status": "...", "comment": "...", "flags": "..." },
        #       ...
        #   }
        # }
        
        result = {}
        
        # Identify model columns
        # They end with _status, _comment, _flags
        # We can scan columns to find models
        # Also support legacy 'status', 'comment', 'flags' as "legacy" or "general" model?
        # Let's map them to a "default" key or keep them if they exist?
        # The plan implies we transition to model-specific.
        
        for _, row in df.iterrows():
            img = row['image']
            result[img] = {}
            
            # 1. Parse dynamic columns
            for col in df.columns:
                if col.endswith("_status"):
                    model = col[:-7] # remove _status
                    status = row[col]
                    comment = row.get(f"{model}_comment", "")
                    flags = row.get(f"{model}_flags", "")
                    
                    if status or comment or flags:
                        result[img][model] = {
                            "status": str(status),
                            "comment": str(comment),
                            "flags": str(flags)
                        }
            
            # 2. Handle legacy columns if strictly present and not empty
            if 'status' in df.columns and row['status']:
                # Save as "legacy" or mix in? 
                # Let's put it under key "default" or "legacy"
                 result[img]["legacy"] = {
                    "status": str(row['status']),
                    "comment": str(row.get('comment', "")),
                    "flags": str(row.get('flags', ""))
                }
                
        return result
    except Exception as e:
        print(f"QA Load Error: {e}")
        return {}

