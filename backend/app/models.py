from pydantic import BaseModel
from typing import Annotated, List, Tuple, Optional

# Base Geometry Models
class Point(BaseModel):
    """
    Represents a 2D point with x and y coordinates.
    """
    x: float
    y: float

class BoundingBox(BaseModel):
    """
    Represents a bounding box defined by 4 corner points.
    """
    corner: List[Point] # [TL, TR, BR, BL]

# Component Models
class DetectedComponent(BaseModel):
    """
    Represents a component detected by the computer vision model.
    """
    id: int
    label: str # 'Register' , 'Capacitor' , etc
    box: BoundingBox
    confidence: float

class CircuitComponent(BaseModel):
    """
    Represents a parsed circuit component suitable for netlist generation.
    """
    id: int
    type: str # 'R' , 'C' , 'LED' , etc
    name: str # 'R1' , 'C3' , etc
    terminals: List[str]
    value: str # '10k' , '100uF' , etc
    box: List[List[float]]

class Wire(BaseModel):
    """
    Represents a jumper wire on the breadboard.
    """
    id: int
    color: str = "unknown"
    endpoints: List[str] # of size 2

# API requests / Response Models 
class AnalysisResponse(BaseModel):
    """
    Response model for the image analysis endpoint.
    """
    components: List[CircuitComponent]
    wires: List[Wire]
    netlist: str
    annotated_image: Optional[str] = None # Optional Base64 encoded debug image
    warped_image: Optional[str] = None # Optional Base64 encoded warped image

class NetlistRequest(BaseModel):
    """
    Request model for generating a netlist.
    """
    components: List[CircuitComponent]
    wires: List[Wire]
    grounds: List[str] = []

# Additional Metadata if we want to send any. For now leaving this out
# class AnalysisRequest(BaseModel):
#     timestamp: float
