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
    
    return {
        "models": state.models,
        "labels": state.labels,
        "settings": getattr(state, "viz_settings", {}),
        "loaded": state.root_dir is not None
    }

@app.post("/api/project/settings")
async def save_settings(req: SaveSettingsRequest):
    if not state.root_dir:
        raise HTTPException(status_code=400, detail="No project loaded")
    
    settings_path = os.path.join(state.root_dir, "viz_config.json")
    try:
        with open(settings_path, "w") as f:
            json.dump(req.settings, f, indent=4)
        
        # Update in-memory state
        state.viz_settings = req.settings
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
    status: str
    comment: str = ""

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
            # Ensure columns exist
            if 'image' not in df.columns:
                df = pd.DataFrame(columns=['image', 'status', 'comment', 'timestamp'])
        else:
            df = pd.DataFrame(columns=['image', 'status', 'comment', 'timestamp'])

        # Check if row exists
        mask = df['image'] == req.image
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if mask.any():
            # Update existing
            df.loc[mask, 'status'] = req.status
            df.loc[mask, 'comment'] = req.comment
            df.loc[mask, 'timestamp'] = timestamp
        else:
            # Append new
            new_row = pd.DataFrame([{
                'image': req.image,
                'status': req.status,
                'comment': req.comment,
                'timestamp': timestamp
            }])
            df = pd.concat([df, new_row], ignore_index=True)
            
        # Save back
        df.to_excel(qa_path, index=False)
        return {"status": "success", "message": "QA status saved"}
        
    except Exception as e:
        print(f"QA Save Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save QA status: {str(e)}")

@app.get("/api/qa/load")
async def load_qa_status():
    qa_path = get_qa_file_path()
    if not qa_path or not os.path.exists(qa_path):
        return {}
        
    try:
        df = pd.read_excel(qa_path)
        # Convert to dict: { image: { status, comment } }
        result = {}
        for _, row in df.iterrows():
            result[row['image']] = {
                "status": row['status'],
                "comment": row['comment'] if pd.notna(row['comment']) else ""
            }
        return result
    except Exception as e:
        print(f"QA Load Error: {e}")
        return {}

