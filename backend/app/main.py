from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import cv2
import numpy as np
import base64
import os
import json

from app.models import AnalysisResponse, CircuitComponent, Wire, NetlistRequest, VerificationRequest, VerificationResponse
from app.spice_parser import SpiceParser
from app.graph_utils import CircuitGraphBuilder, compare_circuits
from app.ml_manager import ml_engine
from app.cv_engine import (
    detect_and_warp,
    detect_holes,
    detect_components,
    extract_component_terminals,
    map_terminals_to_holes,
    detect_wires_yolo,
    warp_with_points,
    extract_breadboard,
    pre_warp_image,
    detect_wires_classic
)
from app.circuit_solver import generate_spice_netlist, build_node_map

app = FastAPI(title="Toaster Backend")

# Debug Mode: Set TOASTER_DEBUG=1 in environment to enable debug image writing
DEBUG_MODE = os.getenv("TOASTER_DEBUG", "0") == "1"

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

@app.post("/solve-circuit")
async def solve_circuit(req: NetlistRequest):
    """
    Accepts updated components and wires from the frontend and returns the updated SPICE netlist.
    """
    try:
        def map_type_to_cls_id(type_str: str) -> int:
            ts = type_str.lower()
            if "resistor" in ts: return 1
            if "capacitor" in ts: return 2
            if "led" in ts: return 6
            if "transistor" in ts or "most" in ts: return 4
            if "ic" in ts: return 7
            if "voltage" in ts: return -1
            return 7
            
        solver_components = []
        for c in req.components:
            cls_id = map_type_to_cls_id(c.type)
            solver_components.append((cls_id, c.type, c.terminals, c.value))
        
        solver_wires = []
        for w in req.wires:
            solver_wires.append([w.id, f"Wire_{w.id}", w.endpoints])
            
        netlist = generate_spice_netlist(solver_components, solver_wires, req.grounds)
        return {"netlist": netlist}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Netlist generation failed: {str(e)}")

@app.post("/verify-circuit", response_model=VerificationResponse)
async def verify_circuit(req: VerificationRequest):
    """
    Verifies the detected circuit against a reference SPICE netlist.
    """
    try:
        # 1. Parse Reference SPICE
        ref_components = SpiceParser.parse_netlist(req.reference_spice)
        G_ref = CircuitGraphBuilder.build_from_spice(ref_components)
        
        # 2. Prepare Detected Data for Graph Builder
        # Need to merge nets based on wires
        solver_wires = []
        for w in req.wires:
            solver_wires.append([w.id, f"Wire_{w.id}", w.endpoints])
            
        node_map, _ = build_node_map(solver_wires, req.grounds)
        
        # 3. Build Detected Graph
        G_det = CircuitGraphBuilder.build_from_detected(req.components, node_map)
        
        # 4. Compare
        is_matched, report = compare_circuits(G_ref, G_det)
        
        return VerificationResponse(is_matched=is_matched, report=report)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@app.post("/pre-warp")
async def get_pre_warped_image(
    file: UploadFile = File(...),
    markers: str = Form(...)
):
    """
    Returns an orthorectified 1600x1600 image based on 4 markers, used for drawing the crop box.
    """
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        pts = json.loads(markers)
        warped = pre_warp_image(image, pts)
        
        _, buffer = cv2.imencode('.jpg', warped)
        b64_image = base64.b64encode(buffer).decode('utf-8')
        
        return {"image": b64_image}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-image", response_model=AnalysisResponse)
async def analyze_image(
    file: UploadFile = File(...),
    calibration_points: Optional[str] = Form(None), # The 4 markers
    crop_box: Optional[str] = Form(None) # The breadboard boundaries
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
        if calibration_points and crop_box:
            pts = np.array(json.loads(calibration_points), dtype="float32")
            box = json.loads(crop_box)
            warped = extract_breadboard(image, pts.tolist(), box)
            detected_corners = pts.tolist()
        elif calibration_points:
            # Legacy fallback
            pts = np.array(json.loads(calibration_points), dtype="float32")
            if len(pts) >= 4:
                warp_corners = pts[:4]
                warped = warp_with_points(image, warp_corners)
                detected_corners = warp_corners.tolist()
        else:
            warped, detected_corners = detect_and_warp(image)

        # DEBUG: Generate Step-by-Step Verification Images
        debug_dir = "debug_outputs"
        if DEBUG_MODE:
            os.makedirs(debug_dir, exist_ok=True)
            cv2.imwrite(f"{debug_dir}/1_warped_board.jpg", warped)
        
        _, buffer = cv2.imencode('.jpg', warped)
        warped_b64 = base64.b64encode(buffer).decode('utf-8')
        
        # B. Detect Holes (using static offsets)
        holes_grid, pitch, padX, padY = detect_holes(warped)
        
        if DEBUG_MODE:
            debug_holes = warped.copy()
            for h in holes_grid:
                cv2.circle(debug_holes, h, 2, (0, 255, 0), -1)
            cv2.imwrite(f"{debug_dir}/2_holes.jpg", debug_holes)
        
        # C. Detect YOLO Components
        comp_model = ml_engine.get_component_model()
        raw_components = detect_components(warped, comp_model)
        
        if DEBUG_MODE:
            debug_components = warped.copy()
            for comp in raw_components:
                _, class_name, coords = comp
                pts = np.array(coords, np.int32).reshape((-1, 1, 2))
                cv2.polylines(debug_components, [pts], True, (255, 0, 0), 2)
                cv2.putText(debug_components, class_name, (int(coords[0][0]), int(coords[0][1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
            cv2.imwrite(f"{debug_dir}/4_components.jpg", debug_components)

        # D. Detect Wires using Classic Color Masks
        # We pass raw_components so the engine can ignore those regions
        wires_data = detect_wires_classic(warped, holes_grid, pitch, padX, padY, raw_components, debug=DEBUG_MODE)
        
        if DEBUG_MODE:
            debug_wires = warped.copy()
            for w in wires_data:
                path = w.get("path", [])
                for i in range(len(path)-1):
                    pt1 = (int(path[i][0]), int(path[i][1]))
                    pt2 = (int(path[i+1][0]), int(path[i+1][1]))
                    cv2.line(debug_wires, pt1, pt2, (0, 165, 255), 3)
            cv2.imwrite(f"{debug_dir}/3_wires.jpg", debug_wires)
        
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

        # DEBUG: Final Verification Plots
        if DEBUG_MODE:
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