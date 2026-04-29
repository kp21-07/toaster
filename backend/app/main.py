from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import cv2
import numpy as np
import base64
import os
import json

from app.models import AnalysisResponse, CircuitComponent, Wire
from app.ml_manager import ml_engine
from app.cv_engine import (
    detect_and_warp,
    detect_holes,
    detect_components,
    extract_component_terminals,
    map_terminals_to_holes,
    detect_wires_yolo,
    warp_with_points
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
    comp_model_path = "weights/best_components.pt" 
    wire_model_path = "weights/best_wires.pt" 
    
    try:
        ml_engine.load_models(comp_model_path, wire_model_path)
    except Exception as e:
        print(f"Warning: Could not load models: {e}")

@app.get("/")
def read_root():
    return {"message": "Toaster Backend is running"}

@app.post("/detect-corners")
async def get_detected_corners(file: UploadFile = File(...)):
    """
    Analyzes the image and returns suggested plastic corner coordinates for calibration.
    """
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")
            
        # Use our existing CV logic to find the markers
        try:
            _, corners = detect_and_warp(image)
            return {"corners": corners}
        except Exception:
            # If AI fails, return reasonable defaults (center-ish)
            h, w = image.shape[:2]
            defaults = [
                [w*0.1, h*0.1], [w*0.9, h*0.1],
                [w*0.9, h*0.9], [w*0.1, h*0.9]
            ]
            return {"corners": defaults}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-image", response_model=AnalysisResponse)
async def analyze_image(
    file: UploadFile = File(...),
    calibration_points: Optional[str] = Form(None) # Make it a Form field!
):
    # 1. Read Image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        # 2. CV Pipeline
        
        # A. Detect & Warp
        grid_anchors = None
        if calibration_points:
            try:
                pts = np.array(json.loads(calibration_points), dtype="float32")
                if len(pts) >= 4:
                    warp_corners = pts[:4]
                    warped = warp_with_points(image, warp_corners)
                    detected_corners = warp_corners.tolist()
                    
                    if len(pts) == 6:
                        # Convert grid anchors from original image space to WARPED space!
                        # We need the transform matrix M used for warping
                        M = cv2.getPerspectiveTransform(warp_corners.astype("float32"), np.array([
                            [0, 0], [928, 0], [928, 586], [0, 586]
                        ], dtype="float32"))
                        
                        raw_anchors = pts[4:] # TL Hole, BR Hole
                        # Transform raw image points to warped points
                        ones = np.ones((len(raw_anchors), 1))
                        raw_anchors_h = np.hstack([raw_anchors, ones])
                        warped_anchors = (M @ raw_anchors_h.T).T
                        warped_anchors = warped_anchors[:, :2] / warped_anchors[:, 2:]
                        grid_anchors = warped_anchors.tolist()
                else:
                    raise ValueError("Calibration points must be at least 4 points")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid calibration points format: {e}")
        else:
            warped, detected_corners = detect_and_warp(image)

        # DEBUG: Generate Step-by-Step Verification Images
        debug_dir = "debug_outputs"
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(f"{debug_dir}/last_warped.jpg", warped)
        
        _, buffer = cv2.imencode('.jpg', warped)
        warped_b64 = base64.b64encode(buffer).decode('utf-8')
        
        # B. Detect Holes (using anchors if provided)
        holes_grid, pitch, padX, padY = detect_holes(warped, grid_anchors)
        
        # C. Detect Wires using YOLO Keypoints
        wire_model = ml_engine.get_wire_model()
        wires_data = detect_wires_yolo(warped, wire_model, holes_grid, pitch, padX, padY)
        
        # D. Detect YOLO Components
        comp_model = ml_engine.get_component_model()
        raw_components = detect_components(warped, comp_model)
        comp_terminals = extract_component_terminals(raw_components)
        mapped_components = map_terminals_to_holes(comp_terminals, holes_grid, pitch, padX, padY)
        
        # 3. Solver Pipeline & Response Formatting
        solver_components = []
        api_components = []
        
        for i, comp in enumerate(mapped_components):
            cls_id, name, labels, terminal_coords, original_box = comp
            spec = "1k" 
            if "Resistor" in name: spec = "1k"
            elif "LED" in name: spec = "Red"
            
            solver_components.append((cls_id, name, labels, spec))
            api_components.append(CircuitComponent(
                id=cls_id,
                type=name,
                name=f"{name}_{len(api_components)+1}",
                terminals=labels,
                value=spec,
                box=original_box
            ))
            
        api_wires = []
        solver_wires = []
        for idx, w in enumerate(wires_data):
            api_wires.append(Wire(
                id=idx,
                color=w.get("color", "unknown"),
                endpoints=w["endpoints"],
                points=[[p[0], p[1]] for p in w["path"]] 
            ))
            solver_wires.append([idx, f"Wire_{idx}", w["endpoints"]])
 
        # Generate Netlist
        netlist = generate_spice_netlist(solver_components, solver_wires, [])

        # DEBUG: Generate Step-by-Step Verification Images
        debug_dir = "debug_outputs"
        os.makedirs(debug_dir, exist_ok=True)
        
        # 1. Warped
        cv2.imwrite(f"{debug_dir}/1_warped.jpg", warped)
        
        # 2. Holes Grid
        holes_img = warped.copy()
        for h in holes_grid:
            cv2.circle(holes_img, h, 2, (0, 255, 0), -1)
        cv2.imwrite(f"{debug_dir}/2_holes.jpg", holes_img)
        
        # 3. Components
        comp_img = warped.copy()
        for comp in mapped_components:
            _, name, _, _, box = comp
            pts = np.array(box, np.int32).reshape((-1, 1, 2))
            cv2.polylines(comp_img, [pts], True, (0, 0, 255), 2)
            cv2.putText(comp_img, name, (int(box[0][0]), int(box[0][1]-5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
        cv2.imwrite(f"{debug_dir}/3_components.jpg", comp_img)
        
        # 4. Wires
        wire_img = warped.copy()
        for w in wires_data:
            for i in range(len(w["path"]) - 1):
                cv2.line(wire_img, w["path"][i], w["path"][i+1], (255, 0, 0), 2)
            cv2.circle(wire_img, w["path"][0], 3, (255, 255, 0), -1)
            cv2.circle(wire_img, w["path"][-1], 3, (255, 255, 0), -1)
        cv2.imwrite(f"{debug_dir}/4_wires.jpg", wire_img)

        return AnalysisResponse(
            components=api_components,
            wires=api_wires,
            grey_codes=[], 
            netlist=netlist,
            detected_corners=detected_corners,
            annotated_image=None,
            warped_image=warped_b64
        )

    except ValueError as ve:
        raise HTTPException(status_code=422, detail=f"CV Error: {str(ve)}")
    except Exception as e:
        print(f"Server Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal processing error: {str(e)}")