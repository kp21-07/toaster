from pydantic import BaseModel
from typing import Annotated, List, Tuple, Optional

# Base Geometry Models
class Point(BaseModel):
    x: float
    y: float

class BoundingBox(BaseModel):
    corner: List[Point] # [TL, TR, BR, BL]

# Component Models
class DetectedComponent(BaseModel):
    id: int
    label: str # 'Register' , 'Capacitor' , etc
    box: BoundingBox
    confidence: float

class CircuitComponent(BaseModel):
    id: int
    type: str # 'R' , 'C' , 'LED' , etc
    name: str # 'R1' , 'C3' , etc
    terminals: List[str]
    value: str # '10k' , '100uF' , etc

class Wire(BaseModel):
    id: int
    color: str = "unknown"
    endpoints: List[str] # of size 2

# API requests / Response Models 
class AnalysisResponse(BaseModel):
    components: List[CircuitComponent]
    wires: List[Wire]
    netlist: str
    annotated_image: Optional[str] = None # Optional Base64 encoded debug image

# Additional Metadata if we want to send any. For now leaving this out
# class AnalysisRequest(BaseModel):
#     timestamp: float
