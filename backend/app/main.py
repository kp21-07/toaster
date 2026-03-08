from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import base64

from app.models import AnalysisResponse, CircuitComponent, Wire
from app.ml_manager import ml_engine
from app.cv_engine import (
    detect_breadboard, 
    detect_components, 
    pixel_map, 
    extract_component_terminals, 
    detect_wires,
    map_terminals_to_holes
)
from app.circuit_solver import generate_spice_netlist

app = FastAPI(title="Toaster Backend")

# CORS (Allow frontend to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Event: Load Models
@app.on_event("startup")
async def startup_event():
    # IMPORTANT: Update these paths to where your .pt files actually are!
    # passing dummy paths for now; app will warn if not found.
    comp_model_path = "weights/best_components.pt" 
    wire_model_path = "weights/best_wires.pt"
    
    try:
        ml_engine.load_models(comp_model_path, wire_model_path)
    except Exception as e:
        print(f"Warning: Could not load models: {e}")

@app.get("/")
def read_root():
    return {"message": "Toaster Backend is running"}

@app.post("/analyze-image", response_model=AnalysisResponse)
async def analyze_image(file: UploadFile = File(...)):
    # 1. Read Image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        # 2. CV Pipeline
        # A. Detect & Warp Breadboard
        warped = detect_breadboard(image)
        _, buffer = cv2.imencode('.jpg', warped)
        warped_b64 = base64.b64encode(buffer).decode('utf-8')
        
        # B. Get Component & Wire Models
        comp_model = ml_engine.get_component_model()
        wire_model = ml_engine.get_wire_model()
        
        # C. Generate Holes Grid
        holes_grid = pixel_map(warped)
        
        # D. Detect Components
        raw_components = detect_components(warped, comp_model)
        comp_terminals = extract_component_terminals(raw_components)
        mapped_components = map_terminals_to_holes(comp_terminals, holes_grid)
        
        # E. Detect Wires
        raw_wires = detect_wires(warped, wire_model, holes_grid)
        
        # 3. Solver Pipeline
        
        # Prepare data for solver & API response
        solver_components = []
        api_components = []
        
        for i, comp in enumerate(mapped_components):
            cls_id, name, legs = comp
            
            # Get the original box from raw_components (matches by index 'i')
            # raw_components[i] is (cls_id, name, coords)
            original_box = raw_components[i][2] 
            
            # Default Data for now
            spec = "1k" 
            if "Resistor" in name: spec = "1k"
            elif "LED" in name: spec = "Red"
            
            # (id, name, [legs], spec)
            solver_components.append((cls_id, name, legs, spec))
            
            # API Model
            api_components.append(CircuitComponent(
                id=cls_id,
                type=name,
                name=f"{name}_{len(api_components)+1}", 
                terminals=legs,
                value=spec,
                box=original_box # <--- Pass the box here
            ))
            
        api_wires = []
        for w in raw_wires:
             # w is [id, name, [hole1, hole2]]
            api_wires.append(Wire(
                id=0,
                color="unknown",
                endpoints=w[2] 
            ))

        # Generate Netlist
        # We assume empty grounds list for now unless detected otherwise
        grounds = [] 
        netlist = generate_spice_netlist(solver_components, raw_wires, grounds)
        
        return AnalysisResponse(
            components=api_components,
            wires=api_wires,
            netlist=netlist,
            annotated_image=None ,
            warped_image=warped_b64
        )

    except ValueError as ve:
        raise HTTPException(status_code=422, detail=f"CV Error: {str(ve)}")
    except Exception as e:
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail="Internal processing error")