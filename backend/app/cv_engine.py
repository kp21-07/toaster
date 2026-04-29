import cv2
import numpy as np
from ultralytics import YOLO
from typing import List, Tuple, Dict, Union, Optional
from collections import deque
import math

# --- Type Definitions ---
Point = Tuple[float, float]
HoleCoord = Tuple[int, int]
WireConnection = Tuple[HoleCoord, HoleCoord]
GreyCode = List[float]
RawComponent = Tuple[int, str, List[List[float]]] # (class_id, class_name, corners)
ComponentTerminals = Tuple[int, str, List[Point], List[List[float]]] # (class_id, class_name, [pin1, pin2, ...], original_box)
MappedComponent = Tuple[int, str, List[str], List[HoleCoord]] # (class_id, class_name, [id1, id2, ...], [hole1, hole2, ...])

def warp_with_points(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """
    Standardizes output to 928x586.
    """
    output_dim = (928, 586)
    # Destination points match the absolute corners of the 928x586 board area
    dst_rect = np.array([
        [0, 0],         # TL
        [928, 0],       # TR
        [928, 586],     # BR
        [0, 586]        # BL
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(corners.astype("float32"), dst_rect)
    warped = cv2.warpPerspective(image, M, output_dim)
    return warped

def detect_and_warp(image: np.ndarray) -> Tuple[np.ndarray, List[List[float]]]:
    """
    Finds corner markers and applies a 4-point perspective transform.
    Returns (warped_image, detected_corners).
    """
    imgray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    imgray = cv2.GaussianBlur(imgray, (5, 5), 0)

    ret, thresh = cv2.threshold(imgray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, hierarchy = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    if hierarchy is None:
        raise ValueError("No markers found - could not detect hierarchy.")

    mask = ((hierarchy[0][:, 0] == -1) & (hierarchy[0][:, 1] == -1) & (hierarchy[0][:, 2] == -1))
    markers = np.where(mask)[0]
    
    if len(markers) < 4:
        # Fallback: try to find corners of the largest rectangle if markers fail
        raise ValueError(f"Could not find at least 4 markers. Found {len(markers)}.")

    moments = [cv2.moments(contours[i-1]) for i in markers]
    areas = np.array([i['m00'] for i in moments])
    areamean = np.mean(areas)

    filtered_moments = [m for m in moments if m['m00'] > areamean]
    
    if len(filtered_moments) < 4:
         sorted_indices = np.argsort(areas)[-4:]
         filtered_moments = [moments[i] for i in sorted_indices]

    centers = np.array([[int(i['m10']/i['m00']), int(i['m01']/i['m00'])] for i in filtered_moments])
    
    # Order centers: TL, TR, BR, BL
    s = centers.sum(axis=1)
    diff = np.diff(centers, axis=1)
    
    ordered_centers = np.array([
        centers[np.argmin(s)],
        centers[np.argmin(diff)],
        centers[np.argmax(s)],
        centers[np.argmax(diff)]
    ], dtype="float32")

    warped = warp_with_points(image, ordered_centers)
    return warped, ordered_centers.tolist()

def detect_holes(warped_image: np.ndarray, anchors: Optional[List[List[float]]] = None) -> Tuple[List[HoleCoord], float, float, float]:
    """
    Stable 6-point anchor grid calculation.
    """
    # Default Fallbacks
    pitch = 14.15
    paddingX = 26
    paddingY = 22

    if anchors and len(anchors) == 2:
        p1 = anchors[0] # A1 (Col 0, Row 4)
        p2 = anchors[1] # J63 (Col 62, Row 35)
        
        # 62 cols apart, 31 rows apart (35 - 4)
        pitch_h = (p2[0] - p1[0]) / 62.0
        pitch_v = (p2[1] - p1[1]) / 31.0
        pitch = (pitch_h + pitch_v) / 2.0
        
        paddingX = p1[0]
        paddingY = p1[1] - (4 * pitch)
        
    rows_relative = [1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 17, 18]
    row_targets = []
    for yBase in [0, 20]:
        for r in rows_relative:
            row_targets.append(paddingY + (yBase + r) * pitch)
            
    final_holes = []
    for ry in row_targets:
        for cx in range(63):
            rx = paddingX + cx * pitch
            final_holes.append((int(rx), int(ry)))
            
    return final_holes, pitch, paddingX, paddingY

def map_to_breadboard_ids(hole_coords: List[HoleCoord], pitch: float, paddingX: float, paddingY: float) -> List[str]:
    """
    Maps dynamic hole coordinates to standard breadboard labels.
    """
    ids = []
    for (hx, hy) in hole_coords:
        col = round((hx - paddingX) / pitch)
        row = round((hy - paddingY) / pitch)
        
        # Canonical labels for both boards
        if row == 1: label = 'Power+'
        elif row == 2: label = 'PowerTop-'
        elif 4 <= row <= 8: label = f'TopTerminal_{col}'
        elif 11 <= row <= 15: label = f'BotTerminal_{col}'
        elif row == 17: label = 'PowerBot+'
        elif row == 18: label = 'Ground-'
        elif row == 21: label = 'B2_Power+'
        elif row == 22: label = 'B2_PowerTop-'
        elif 24 <= row <= 28: label = f'B2_TopTerminal_{col}'
        elif 31 <= row <= 35: label = f'B2_BotTerminal_{col}'
        elif row == 37: label = 'B2_PowerBot+'
        elif row == 38: label = 'B2_Ground-'
        else: label = f'Unknown_{col}_{row}'
              
        ids.append(label)
    return ids

def detect_components(image: np.ndarray, model: YOLO) -> List[RawComponent]:
    """
    Runs YOLO object detection to find components on the breadboard.
    """
    results = model.predict(source=image, save=False, conf=0.20, iou=0.25)
    components = []

    for r in results:
        boxes = r.obb  
        names = model.names 
        for box in boxes:
            cls_id = int(box.cls[0].item())
            class_name = names[cls_id]
            coords = box.xyxyxyxy[0].tolist() # tensors to list
            print(f"DEBUG: YOLO Detected '{class_name}' ({cls_id}) with box: {coords[:2]}...")
            components.append((cls_id, class_name, coords))
    return components

def get_equally_spaced_points(p1: Point, pn: Point, n: int) -> List[Point]:
    x1, y1 = p1
    xn, yn = pn
    points = []
    for i in range(n):
        t = i / (n - 1)
        x = x1 + t * (xn - x1)
        y = y1 + t * (yn - y1)
        points.append((x, y))
    return points

def extract_component_terminals(components: List[RawComponent]) -> List[ComponentTerminals]:
    """
    Determines the exact termination points (pins) for each component based on orientation and type.
    """
    component_endpoints_list = []

    for component in components:
        pq = []
        cls_id, class_name, coords = component

        if cls_id == 0: continue # Skip wire class if detected by component model

        for i in range(len(coords)):
            p1, p2 = coords[i], coords[(i+1)%len(coords)]
            d = math.sqrt(((p1[0]-p2[0])**2) + ((p1[1]-p2[1])**2))
            pq.append((d, (p1, p2)))

        endedge1, endedge2 = None, None

        if cls_id in [4, 5, 7]: # MOSFET, Transistor, IC
            if cls_id in [4, 5]:
                if pq[0][0] < pq[1][0]:
                    _, endedge1 = pq[0]; _, endedge2 = pq[2]
                else: 
                    _, endedge1 = pq[1]; _, endedge2 = pq[3]

                endpoint1 = ((endedge1[0][0]+endedge1[1][0])//2, (endedge1[0][1]+endedge1[1][1])//2)
                endpoint2 = ((endedge2[0][0]+endedge2[1][0])//2, (endedge2[0][1]+endedge2[1][1])//2)
                endedge1 = get_equally_spaced_points(endpoint1, endpoint2, 3)
            else: # IC Logic
                if pq[0][0] > pq[1][0]:
                     d1, endedge1 = pq[0]; _, endedge2 = pq[2]; d2, _ = pq[1]
                else:
                     d1, endedge1 = pq[1]; _, endedge2 = pq[3]; d2, _ = pq[0]

                if (d1/d2) < 2:
                    endedge1 = get_equally_spaced_points(endedge1[0], endedge1[1], 4)
                    endedge2 = get_equally_spaced_points(endedge2[0], endedge2[1], 4)
                else:
                    endedge1 = get_equally_spaced_points(endedge1[0], endedge1[1], 8)
                    endedge2 = get_equally_spaced_points(endedge2[0], endedge2[1], 8)
                endedge1.extend(endedge2)

            component_endpoints_list.append((cls_id, class_name, endedge1, coords))

        else: # Simple 2-terminal component
            if pq[0][0] < pq[1][0]:
                _, endedge1 = pq[0]; _, endedge2 = pq[2]
            else:
                _, endedge1 = pq[1]; _, endedge2 = pq[3]

            endpoint1 = ((endedge1[0][0]+endedge1[1][0])/2, (endedge1[0][1]+endedge1[1][1])/2)
            endpoint2 = ((endedge2[0][0]+endedge2[1][0])/2, (endedge2[0][1]+endedge2[1][1])/2)
            component_endpoints_list.append((cls_id, class_name, [endpoint1, endpoint2], coords))

    return component_endpoints_list

def map_terminals_to_holes(components: List[ComponentTerminals], holes: List[HoleCoord], pitch: float, paddingX: float, paddingY: float) -> List[MappedComponent]:
    """
    Maps floating-point terminal coordinates to the nearest snapped breadboard holes.
    """
    hole_labels = map_to_breadboard_ids(holes, pitch, paddingX, paddingY)
    hole_to_label = {holes[i]: hole_labels[i] for i in range(len(holes))}

    mapped_components = []
    for comp in components:
        cls_id, name, terminals, coords = comp
        mapped_terminals = []
        terminal_coords = []

        for t_pt in terminals:
            closest_h = min(holes, key=lambda h: (h[0]-t_pt[0])**2 + (h[1]-t_pt[1])**2)
            mapped_terminals.append(hole_to_label.get(closest_h, "UNK"))
            terminal_coords.append(closest_h)

        mapped_components.append((cls_id, name, mapped_terminals, terminal_coords, coords))

    return mapped_components

def detect_wires_yolo(image: np.ndarray, model: YOLO, holes: List[HoleCoord], pitch: float, paddingX: float, paddingY: float) -> List[Dict]:
    """
    Detects jumper wires using Keypoint detection and maps endpoints to breadboard hole labels.
    """
    results = model(image)[0]
    all_wire_data = []
    
    # Pre-map holes for lookups
    hole_labels = map_to_breadboard_ids(holes, pitch, paddingX, paddingY)
    hole_to_label = {holes[i]: hole_labels[i] for i in range(len(holes))}
    
    for idx, kpts in enumerate(results.keypoints.xy):
        if kpts.shape[0] < 2: continue
        x1, y1 = float(kpts[0][0]), float(kpts[0][1])
        x2, y2 = float(kpts[1][0]), float(kpts[1][1])
        
        # Find closest holes
        def nearest_hole(pt):
            return min(holes, key=lambda h: (h[0]-pt[0])**2 + (h[1]-pt[1])**2)
            
        H1 = nearest_hole((x1, y1))
        H2 = nearest_hole((x2, y2))
        
        if H1 != H2:
             # Standard orthogonal path: H1 -> (H2_x, H1_y) -> H2
             mid_point = (H2[0], H1[1])
             path = [H1, mid_point, H2]

             all_wire_data.append({
                 "color": "unknown",
                 "endpoints": [hole_to_label.get(H1, "UNK"), hole_to_label.get(H2, "UNK")],
                 "path": path
             })

    return all_wire_data
