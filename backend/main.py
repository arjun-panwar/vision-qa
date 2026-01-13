import os
import shutil
import json
import yaml
import subprocess
from typing import List, Dict, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.utils._logger import logger

from backend.schemas import LoadProjectRequest, SaveSettingsRequest, QARequest
from backend.core.state import state
from backend.utils.common import normalize_data
from backend.services import qa_service
from backend.utils.constants import load_config

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
            logger.error(f"Failed to reload app_config.json: {e}")
    
    # Merge global APP_CONFIG into settings for frontend
    settings = state.viz_settings.copy()
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
    
    settings_path = state.root_dir / "viz_config.json"
    try:
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
        logger.error(f"Save Settings Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/project/load")
async def load_project(req: LoadProjectRequest):
    project_path = Path(req.path)
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Project path does not exist")
    
    config_path = project_path / "model_config.yaml"
    if not config_path.exists():
        raise HTTPException(status_code=400, detail="model_config.yaml not found in directory")
    
    try:
        config = load_config(config_path)
        
        state.update(project_path, config)
        return {"status": "success", "message": f"Loaded project from {project_path}", "config": config}
    except Exception as e:
        logger.error(f"Load Project Error: {e}")
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
            logger.warning(f"Zenity failed: {e}")

    # 2. Fallback to Tkinter
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        # Must run in main thread usually, but here likely running in threadpool by FastAPI
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        
        folder_selected = filedialog.askdirectory()
        root.destroy()
        
        if not folder_selected:
            return {"path": None, "cancelled": True}
            
        return {"path": folder_selected, "cancelled": False}
    except Exception as e:
        logger.error(f"Browse Error: {e}")
        return {"error": "Cannot open file dialog on server. Please manually enter path.", "details": str(e)}

@app.get("/api/list")
async def list_images():
    if not state.images_dir or not state.images_dir.exists():
        return {"images": []}
    
    extensions = ['*.jpg', '*.jpeg', '*.png', '*.bmp', '*.JPG', '*.JPEG', '*.PNG']
    images = []
    for ext in extensions:
        # glob returns strings in pathlib if using os.path logic, but we are using pathlib glob now
        # Actually state.images_dir IS a Path object
        images.extend(list(state.images_dir.glob(ext)))
    
    image_filenames = sorted(list(set([p.name for p in images])))
    return {"images": image_filenames}

@app.get("/api/images/{filename}")
async def get_image(filename: str):
    if not state.images_dir:
        raise HTTPException(status_code=404, detail="No project loaded")
    
    file_path = state.images_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(file_path)

@app.get("/api/data/{filename}")
async def get_annotations(filename: str):
    base_name = os.path.splitext(filename)[0]
    base_name = os.path.splitext(filename)[0]
    
    response = {}
    
    # Get image size from config as fallback
    default_img_size = state.config.get("img_size", 640)
    # If it's a single int, convert to tuple
    if isinstance(default_img_size, int):
        img_dims = (default_img_size, default_img_size)
    else:
        img_dims = (640, 640)

    for model_key, model_info in state.models.items():
        json_dir = model_info["dir"] # This is a Path object from state
        model_format = model_info.get("format", "default")
        
        # Determine file extension based on format
        ext = ".txt" if model_format == "yolo" else ".json"
        file_path = json_dir / f"{base_name}{ext}"
        
        response[model_key] = []
        
        if file_path.exists():
            try:
                # Read content
                content = None
                if ext == ".txt":
                    with open(file_path, "r") as f:
                        content = f.readlines()
                else:
                    with open(file_path, "r") as f:
                        content = json.load(f)
                
                response[model_key] = normalize_data(content, format=model_format, img_size=img_dims, labels_map=state.labels)
            except Exception as e:
                logger.error(f"Error reading {file_path}: {e}")
                
    return response

# -- QA Workflow Delegates --

@app.post("/api/qa/save")
async def save_qa_status(req: QARequest):
    try:
        return qa_service.save_qa_status(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/qa/load")
async def load_qa_status():
    return qa_service.load_qa_status()

@app.get("/api/qa/stats")
async def get_qa_stats():
    return qa_service.get_qa_stats()

@app.get("/dashboard")
async def dashboard_page():
    return FileResponse("static/dashboard.html")


