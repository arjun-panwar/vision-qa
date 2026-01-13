import json
import os
import yaml
from pathlib import Path
from typing import Dict, Optional, Any
from backend.utils._logger import logger
from backend.utils.constants import load_config

CACHE_FILE = Path(".project_cache.json")

class ProjectState:
    def __init__(self):
        self.root_dir: Optional[Path] = None
        self.images_dir: Optional[Path] = None
        # self.models will be a dict: { "model_key": { "name": "...", "dir": "..." } }
        self.models: Dict[str, Dict[str, Any]] = {}
        self.labels: Dict[str, str] = {}
        self.config: Dict[str, Any] = {}
        self.viz_settings: Dict[str, Any] = {}
        self.load_cache()

    def load_cache(self):
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "r") as f:
                    data = json.load(f)
                    path_str = data.get("last_project")
                    if path_str:
                        path = Path(path_str)
                        if path.exists() and (path / "model_config.yaml").exists():
                            logger.info(f"Restoring cached project: {path}")
                            config = load_config(path / "model_config.yaml")
                            self.update(path, config, save=False)
            except Exception as e:
                logger.error(f"Failed to load cache: {e}")

    def save_cache(self):
        try:
            with open(CACHE_FILE, "w") as f:
                # Store absolute string path
                json.dump({"last_project": str(self.root_dir.resolve()) if self.root_dir else None}, f)
        except Exception as e:
            logger.error(f"Failed to save cache: {e}")

    def update(self, root_path: Path, config: Dict[str, Any], save: bool = True):
        self.root_dir = root_path
        self.config = config
        
        if "image_directory" in config:
            custom_img_dir = config["image_directory"]
            # Handle absolute/relative checking with Path
            # Path(custom_img_dir).is_absolute() works 
            p_img = Path(custom_img_dir)
            if p_img.is_absolute():
                self.images_dir = p_img
            else:
                self.images_dir = self.root_dir / custom_img_dir
        else:
            self.images_dir = self.root_dir / "images"
        
        # Parse global labels
        self.labels = config.get("labels", {})
        
        # Load visualization settings (class colors)
        self.viz_settings = {}
        settings_path = self.root_dir / "viz_config.json"
        if settings_path.exists():
            try:
                with open(settings_path, "r") as f:
                    self.viz_settings = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load viz_settings: {e}")

        # Parse models dynamically
        self.models = {}
        for key, val in config.items():
            if key.startswith("model_") and isinstance(val, dict):
                # jsons_dir logic
                # Default: key + "_json"
                json_dir_name = val.get("jsons_dir", key + "_json")
                json_dir = self.root_dir / json_dir_name
                
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
            config_path = self.root_dir / "model_config.yaml"
            if config_path.exists():
                try:
                    config = load_config(config_path)
                    # Update without overwriting root_dir, and don't trigger save_cache unnecessarily
                    self.update(self.root_dir, config, save=False)
                except Exception as e:
                    logger.error(f"Failed to refresh config: {e}")

state = ProjectState()
