from typing import Optional
from pydantic import BaseModel

class LoadProjectRequest(BaseModel):
    path: str

class SaveSettingsRequest(BaseModel):
    settings: dict

class QARequest(BaseModel):
    image: str
    model: str
    status: Optional[str] = None
    comment: Optional[str] = ""
    flags: Optional[str] = ""  # JSON string of flagged boxes
    box_comments: Optional[str] = "" # JSON string of box comments: {box_id: comment}
    duration: Optional[float] = 0.0  # Time spent reviewing in seconds
    box_count: Optional[int] = 0 # Total boxes in the image for this model
