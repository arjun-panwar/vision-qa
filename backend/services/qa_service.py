import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
from backend.utils._logger import logger

from backend.core.state import state
from backend.schemas import QARequest

def get_qa_file_path() -> Optional[Path]:
    if not state.root_dir:
        return None
    return state.root_dir / "qa_status.xlsx"

def save_qa_status(req: QARequest) -> Dict[str, str]:
    qa_path = get_qa_file_path()
    if not qa_path:
        raise ValueError("No project loaded")

    try:
        if qa_path.exists():
            df = pd.read_excel(qa_path)
            if 'image' not in df.columns:
                df = pd.DataFrame(columns=['image', 'timestamp'])
        else:
            df = pd.DataFrame(columns=['image', 'timestamp'])

        # Determine column prefix
        model_info = state.models.get(req.model)
        if model_info and "name" in model_info:
             raw_name = model_info["name"]
             safe_name = "".join([c if c.isalnum() else "_" for c in raw_name])
             prefix = safe_name
        else:
             prefix = req.model

        col_status = f"{prefix}_status"
        col_comment = f"{prefix}_comment"
        col_flags = f"{prefix}_flags"
        col_box_comments = f"{prefix}_box_comments"
        col_duration = f"{prefix}_duration"

        # Ensure columns exist
        for col in [col_status, col_comment, col_flags, col_box_comments, col_duration]:
            if col not in df.columns:
                df[col] = "" 

        mask = df['image'] == req.image
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if mask.any():
            df.loc[mask, col_status] = req.status
            df.loc[mask, col_comment] = req.comment
            df.loc[mask, col_flags] = req.flags
            df.loc[mask, col_box_comments] = req.box_comments
            df.loc[mask, col_duration] = req.duration
            df.loc[mask, 'timestamp'] = timestamp
        else:
            new_row_data = {
                'image': req.image,
                'timestamp': timestamp,
                col_status: req.status,
                col_comment: req.comment,
                col_flags: req.flags,
                col_box_comments: req.box_comments,
                col_duration: req.duration
            }
            new_row = pd.DataFrame([new_row_data])
            df = pd.concat([df, new_row], ignore_index=True)
            
        df.to_excel(qa_path, index=False)
        return {"status": "success", "message": f"QA status saved for {req.model} ({prefix})"}
        
    except Exception as e:
        logger.error(f"QA Save Error: {e}")
        raise e

def load_qa_status() -> Dict[str, Any]:
    qa_path = get_qa_file_path()
    if not qa_path or not qa_path.exists():
        return {}
        
    try:
        df = pd.read_excel(qa_path).fillna('')
        result = {}
        
        # Prepare reverse lookup: Name (safe) -> Key
        lookup = {}
        for k, v in state.models.items():
            lookup[k] = k # Support key match
            if "name" in v:
                raw_name = v["name"]
                safe_name = "".join([c if c.isalnum() else "_" for c in raw_name])
                lookup[safe_name] = k
        
        for _, row in df.iterrows():
            img = row['image']
            result[img] = {}
            
            # 1. Parse dynamic columns
            for col in df.columns:
                if col.endswith("_status"):
                    prefix = col[:-7] # remove _status
                    
                    # Resolve prefix to model key
                    model_key = lookup.get(prefix)
                    if not model_key:
                        model_key = prefix

                    status = row[col]
                    comment = row.get(f"{prefix}_comment", "")
                    flags = row.get(f"{prefix}_flags", "")
                    box_comments = row.get(f"{prefix}_box_comments", "")
                    
                    if status or comment or flags or box_comments:
                        result[img][model_key] = {
                            "status": str(status),
                            "comment": str(comment),
                            "flags": str(flags),
                            "box_comments": str(box_comments)
                        }
            
            # 2. Handle legacy columns if strictly present and not empty
            if 'status' in df.columns and row['status']:
                 result[img]["legacy"] = {
                    "status": str(row['status']),
                    "comment": str(row.get('comment', "")),
                    "flags": str(row.get('flags', "")),
                    "box_comments": ""
                }
                
        return result
    except Exception as e:
        logger.error(f"QA Load Error: {e}")
        return {}

def get_qa_stats() -> Dict[str, Any]:
    # 1. Total Images
    total_images = 0
    if state.images_dir and state.images_dir.exists():
        extensions = ['*.jpg', '*.jpeg', '*.png', '*.bmp', '*.JPG', '*.JPEG', '*.PNG']
        images = []
        for ext in extensions:
            # glob matches are strings
            images.extend(list(state.images_dir.glob(ext)))
        
        # Handle case sensitivity manually if needed (pathlib glob is case sensitive on linux)
        # But for now assuming simple glob
        total_images = len(set([p.name for p in images]))

    # 2. QA Stats
    qa_path = get_qa_file_path()
    
    stats = {
        "total_images": total_images,
        "reviewed_images": 0,
        "models": {} 
    }
    
    if not qa_path or not qa_path.exists():
        return stats

    try:
        df = pd.read_excel(qa_path)
        stats["reviewed_images"] = len(df)
        
        # Determine models from columns AND configuration
        # Pattern: {model}_status
        
        # 1. Start with configured models
        final_models = set(state.models.keys())
        
        # Helper: Resolve prefix to key
        def resolve_model_key(prefix):
            if prefix in state.models: return prefix
            for k, v in state.models.items():
                if v.get("name") == prefix: return k
                safe = "".join([c if c.isalnum() else "_" for c in v.get("name", "")])
                if safe == prefix: return k
            return None

        # 2. Add any ORPHANED models found in Excel (legacy)
        for col in df.columns:
            if col.endswith("_status"):
                 prefix = col[:-7]
                 mapped_key = resolve_model_key(prefix)
                 if not mapped_key:
                     final_models.add(prefix)
        
        for model_key in sorted(list(final_models)):
            model_info = state.models.get(model_key, {})
            model_name_human = model_info.get("name", model_key)
            
            # Generate potential prefixes
            possible_prefixes = [model_key]
            if "name" in model_info:
                safe_name = "".join([c if c.isalnum() else "_" for c in model_info["name"]])
                possible_prefixes.insert(0, safe_name) # Prefer name
            
            # Find which prefix is in df
            found_prefix = None
            for p in possible_prefixes:
                if f"{p}_status" in df.columns:
                    found_prefix = p
                    break
            
            col_status = f"{found_prefix}_status" if found_prefix else None
            col_duration = f"{found_prefix}_duration" if found_prefix else None
            
            # Status Counts
            status_counts = {"correct": 0, "incorrect": 0, "doubtful": 0}
            
            # Additional Stats
            flagged_count = 0
            comment_count = 0
            reviewed_count = 0
            
            if col_status and col_status in df.columns:
                 # Filter for non-empty status for reviewed count
                 reviewed_mask = df[col_status].notna() & (df[col_status] != "")
                 reviewed_count = int(reviewed_mask.sum())
                 
                 counts = df[df[col_status].notna()][col_status].value_counts().to_dict()
                 # Merge safely
                 for k, v in counts.items():
                     k_str = str(k).lower() # ensure keys are normalized
                     if k_str in status_counts:
                         status_counts[k_str] = int(v)

            # Flagged Count
            col_flags = f"{found_prefix}_flags" if found_prefix else None
            if col_flags and col_flags in df.columns:
                # Count rows where flags is not empty strings
                flagged_count = int((df[col_flags].notna() & (df[col_flags].astype(str).str.strip() != "")).sum())

            # Comment Count (Image-level + Box-level)
            col_comment = f"{found_prefix}_comment" if found_prefix else None
            col_box_comments = f"{found_prefix}_box_comments" if found_prefix else None
            
            # We treat "comment count" as number of images with ANY comment (box or image level)
            # OR we can sum them up? User said "number of comments". 
            # Let's count *images* with comments for now, or just sum of fields?
            # "number of comments" usually implies total comments.
            # But here we have 1 text field per image for image_comment and 1 text field for box_comments (JSON string?)
            # Let's just count how many images have comments for now as a simple metric.
            
            has_img_comment = pd.Series([False] * len(df))
            if col_comment and col_comment in df.columns:
                has_img_comment = df[col_comment].notna() & (df[col_comment].astype(str).str.strip() != "")
                
            has_box_comment = pd.Series([False] * len(df))
            if col_box_comments and col_box_comments in df.columns:
                has_box_comment = df[col_box_comments].notna() & (df[col_box_comments].astype(str).str.strip() != "")
            
            # Union of images with either
            comment_count = int((has_img_comment | has_box_comment).sum())

            
            # Duration Stats
            avg_duration = 0
            if col_duration and col_duration in df.columns:
                 # Convert to numeric, errors='coerce' turns non-numbers to NaN
                durations = pd.to_numeric(df[col_duration], errors='coerce')
                avg_duration = durations.mean()
                if pd.isna(avg_duration):
                    avg_duration = 0
            
            # Additional Details
            raw_config = state.config.get(model_key, {})
            details = {
                "Version": raw_config.get("version", "N/A"),
                "Weights": raw_config.get("weights_file", "N/A")
            }

            stats["models"][model_key] = {
                "name": model_name_human,
                "counts": status_counts,
                "stats": {
                    "reviewed": reviewed_count,
                    "unreviewed": max(0, total_images - reviewed_count),
                    "flagged": flagged_count,
                    "comments": comment_count
                },
                "avg_duration": round(avg_duration, 2),
                "details": details
            }
            
    except Exception as e:
        logger.error(f"Stats Error: {e}")
        
    return stats
