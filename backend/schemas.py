from pydantic import BaseModel

class LoadProjectRequest(BaseModel):
    path: str

class SaveSettingsRequest(BaseModel):
    settings: dict

class QARequest(BaseModel):
    image: str
    model: str
    status: str
    comment: str = ""
    flags: str = ""  # JSON string of flagged boxes
    box_comments: str = "" # JSON string of box comments: {box_id: comment}
    duration: float = 0.0  # Time spent reviewing in seconds
