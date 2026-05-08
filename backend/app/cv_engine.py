import cv2
import numpy as np
from ultralytics import YOLO
from typing import List, Tuple, Dict, Union, Optional
from collections import deque
import math
import os

# Debug Mode: Set TOASTER_DEBUG=1 in environment to enable debug image writing
DEBUG_MODE = os.getenv("TOASTER_DEBUG", "0") == "1"

# --- Type Definitions ---
Point = Tuple[float, float]
HoleCoord = Tuple[int, int]
WireConnection = Tuple[HoleCoord, HoleCoord]
GreyCode = List[float]
RawComponent = Tuple[int, str, List[List[float]]] # (class_id, class_name, corners)
ComponentTerminals = Tuple[int, str, List[Point], List[List[float]]] # (class_id, class_name, [pin1, pin2, ...], original_box)
MappedComponent = Tuple[int, str, List[str], List[HoleCoord]] # (class_id, class_name, [id1, id2, ...], [hole1, hole2, ...])

def pre_warp_image(image: np.ndarray, markers: List[List[float]]) -> np.ndarray:
    """
    Warps the image so the markers form a perfect 800x500 rectangle in the center of a 1600x1600 canvas.
    This orthorectifies the image without cutting off the edges.
    """
    canvas_size = (1600, 1600)
    dst_rect = np.array([
        [400, 550],         # TL
        [1200, 550],        # TR
        [1200, 1050],       # BR
        [400, 1050]         # BL
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(np.array(markers, dtype="float32"), dst_rect)
    return cv2.warpPerspective(image, M, canvas_size)

def extract_breadboard(image: np.ndarray, markers: List[List[float]], crop_box: Dict) -> np.ndarray:
    """
    Pre-warps the image, crops using the user-defined box, and resizes to standard 928x586.
    """
    pre_warped = pre_warp_image(image, markers)
    
    x = int(crop_box['x'])
    y = int(crop_box['y'])
    w = int(crop_box['width'])
    h = int(crop_box['height'])
    
    # Safety bounds
    x = max(0, x)
    y = max(0, y)
    w = min(1600 - x, w)
    h = min(1600 - y, h)
    
    cropped = pre_warped[y:y+h, x:x+w]
    return cv2.resize(cropped, (928, 586))

def warp_with_points(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """
    Legacy fallback. Standardizes output to 928x586.
    """
    output_dim = (928, 586)
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

def detect_holes(warped_image: np.ndarray) -> Tuple[List[HoleCoord], float, float, float]:
    """
    Stable 6-point anchor grid calculation.
    """
    pitch = 14.15
    paddingX = 26
    paddingY = 22

    rows_relative = [1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 17, 18]
    row_targets = []
    for yBase in [0, 20]:
        for r in rows_relative:
            row_targets.append(paddingY + (yBase + r) * pitch)
            
    final_holes = []
    for ry in row_targets:
        for cx in range(63):
            final_holes.append((int(rx), int(ry)))
            
    if DEBUG_MODE:
        print(f"Calculated {len(final_holes)} holes on grid.")
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
            if DEBUG_MODE:
                print(f"YOLO Detected '{class_name}' ({cls_id}) at {coords[0]}")
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

        if DEBUG_MODE:
            print(f"Mapped {name} terminals to: {mapped_terminals}")
        mapped_components.append((cls_id, name, mapped_terminals, terminal_coords, coords))

    return mapped_components

def detect_wires_yolo(image: np.ndarray, model: YOLO, holes: List[HoleCoord], pitch: float, paddingX: float, paddingY: float) -> List[Dict]:
    """
    Detects jumper wires using Keypoint detection and maps endpoints to breadboard hole labels.
    """
    # Lowered confidence threshold (conf=0.15) to help detect low-contrast wires like white-on-white
    results = model.predict(source=image, conf=0.15)[0]
    all_wire_data = []
    
    # Pre-map holes for lookups
    hole_labels = map_to_breadboard_ids(holes, pitch, paddingX, paddingY)
    hole_to_label = {holes[i]: hole_labels[i] for i in range(len(holes))}
    
    if not hasattr(results, 'keypoints') or results.keypoints is None:
        return all_wire_data
        
    for idx, kpts in enumerate(results.keypoints.xy):
        if kpts.shape[0] < 2: continue
        x1, y1 = float(kpts[0][0]), float(kpts[0][1])
        x2, y2 = float(kpts[1][0]), float(kpts[1][1])
        
        # Skip if keypoints are missing (Ultralytics returns [0, 0] for unseen keypoints)
        if (x1 == 0 and y1 == 0) or (x2 == 0 and y2 == 0):
            continue
        
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

def extract_color_masks_engine(image: np.ndarray, components: List = [], debug: bool = False) -> dict:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    height, width, _ = image.shape
    
    color_ranges = {
        'Red': [
            (np.array([0, 70, 70]), np.array([9, 255, 255])),
            (np.array([170, 70, 70]), np.array([180, 255, 255]))
        ],
        'Orange': [
            (np.array([10, 70, 100]), np.array([24, 255, 255]))
        ],
        'Yellow': [
            (np.array([25, 70, 70]), np.array([35, 255, 255]))
        ],
        'Green': [
            (np.array([36, 70, 70]), np.array([85, 255, 255]))
        ],
        'Blue': [
            (np.array([86, 70, 70]), np.array([125, 255, 255]))
        ],
        'Purple': [
            (np.array([126, 70, 70]), np.array([150, 255, 255]))
        ],
        'Pink': [
            (np.array([151, 70, 70]), np.array([169, 255, 255]))
        ],
        'Brown': [
            (np.array([10, 70, 30]), np.array([24, 255, 99]))
        ],
        'Black': [
            (np.array([0, 0, 0]), np.array([180, 150, 85]))
        ]
    }
    
    color_masks = {}
    if debug:
        debug_mask_dir = "debug_outputs/masks"
        os.makedirs(debug_mask_dir, exist_ok=True)
    
    for color_name, bounds in color_ranges.items():
        mask = np.zeros((height, width), dtype=np.uint8)
        for lower, upper in bounds:
            current_mask = cv2.inRange(hsv, lower, upper)
            mask = cv2.bitwise_or(mask, current_mask)
        
        kernel_open = np.ones((3,3), np.uint8)
        # Use a CROSS kernel for closing. It is less likely to merge parallel wires
        # while still being able to bridge perpendicular gaps.
        kernel_close = cv2.getStructuringElement(cv2.MORPH_CROSS, (15, 15))
        
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)
        
        # Zero out the outer 25 pixels to ignore the green/red/blue painted stencils on the plastic border
        mask[0:25, :] = 0
        mask[-25:, :] = 0
        mask[:, 0:25] = 0
        mask[:, -25:] = 0
        
        color_masks[color_name] = mask
        if debug:
            cv2.imwrite(f"{debug_mask_dir}/{color_name}_mask.jpg", mask)
        
    # --- Component Masking Logic ---
    # Zero out the regions occupied by detected components (resistors, LEDs, etc.)
    # to prevent them from being detected as wires.
    for color_name in color_masks:
        mask = color_masks[color_name]
        for comp in components:
            cls_id, name, coords = comp 
            # SKIP if the component is the breadboard itself!
            if name.lower() == "breadboard":
                continue
                
            pts = np.array(coords, np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(mask, [pts], 0)
            
    # --- Mask Healing Logic ---
    # Create a union of all detected wire colors
    combined_wire_mask = np.zeros((height, width), dtype=np.uint8)
    for m in color_masks.values():
        combined_wire_mask = cv2.bitwise_or(combined_wire_mask, m)
        
    # For each mask, heal gaps by performing a large closing, but ONLY allowing it
    # to 'steal' pixels from the combined_wire_mask. This bridges overlaps without
    # bleeding into the white breadboard plastic.
    kernel_heal = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 21))
    for color_name in color_masks:
        m = color_masks[color_name]
        # Bridge the gaps
        healed = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel_heal)
        # Constrain to only where SOME color was detected
        color_masks[color_name] = cv2.bitwise_and(healed, combined_wire_mask)
        
    return color_masks

def detect_wires_classic(image: np.ndarray, holes: List[HoleCoord], pitch: float, paddingX: float, paddingY: float, components: List = [], debug: bool = False) -> List[Dict]:
    hole_labels = map_to_breadboard_ids(holes, pitch, paddingX, paddingY)
    hole_to_label = {holes[i]: hole_labels[i] for i in range(len(holes))}
    
    color_masks = extract_color_masks_engine(image, components, debug=debug)
    
    all_wire_data = []
    
    for color_name, mask in color_masks.items():
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        
        connections = []
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            if area < 100:
                continue
                
            comp_mask = (labels == i).astype(np.uint8)
            pts = np.argwhere(comp_mask > 0)
            if len(pts) == 0:
                continue
            start_pt = (int(pts[0][1]), int(pts[0][0]))
            
            from collections import deque
            def bfs_furthest(m, start):
                h, w = m.shape
                visited = np.zeros((h, w), dtype=bool)
                q = deque([start])
                visited[start[1], start[0]] = True
                last_pt = start
                dx = [-1, 1, 0, 0, -1, -1, 1, 1]
                dy = [0, 0, -1, 1, -1, 1, -1, 1]
                while q:
                    x, y = q.popleft()
                    last_pt = (x, y)
                    for j in range(8):
                        nx, ny = x + dx[j], y + dy[j]
                        if 0 <= nx < w and 0 <= ny < h:
                            if m[ny, nx] > 0 and not visited[ny, nx]:
                                visited[ny, nx] = True
                                q.append((nx, ny))
                return last_pt
                
            E1 = bfs_furthest(comp_mask, start_pt)
            E2 = bfs_furthest(comp_mask, E1)
            
            def nearest_hole(pt):
                return min(holes, key=lambda h: (h[0]-pt[0])**2 + (h[1]-pt[1])**2)
                
            if holes:
                H1 = nearest_hole(E1)
                H2 = nearest_hole(E2)
                if H1 != H2:
                    connections.append((H1, H2))
        
        # Smart Merge: Join segments of the same color that are collinear and close to each other.
        # This "heals" wires that are split into two blobs by an overlapping wire of a different color.
        smart_merged = True
        while smart_merged:
            smart_merged = False
            for i in range(len(connections)):
                for j in range(i + 1, len(connections)):
                    p1, p2 = connections[i]
                    p3, p4 = connections[j]
                    
                    # Try all 4 endpoint pairings to find the closest gap between segments
                    pairings = [
                        (p1, p2, p3, p4), (p1, p2, p4, p3),
                        (p2, p1, p3, p4), (p2, p1, p4, p3)
                    ]
                    
                    for A, B, C, D in pairings:
                        # B and C are the internal endpoints facing the gap
                        gap_dist = math.sqrt((B[0]-C[0])**2 + (B[1]-C[1])**2)
                        
                        # If the gap is small (e.g. less than 4 hole pitches)
                        if gap_dist < 4 * pitch:
                            # Check for collinearity: is the path A -> B -> C -> D roughly a straight line?
                            d_AB = math.sqrt((B[0]-A[0])**2 + (B[1]-A[1])**2)
                            d_CD = math.sqrt((D[0]-C[0])**2 + (D[1]-C[1])**2)
                            d_AD = math.sqrt((D[0]-A[0])**2 + (D[1]-A[1])**2)
                            
                            # If they are collinear, then dist(A,B) + dist(B,C) + dist(C,D) ≈ dist(A,D)
                            if abs((d_AB + gap_dist + d_CD) - d_AD) < 0.5 * pitch:
                                connections.pop(j)
                                connections.pop(i)
                                connections.append((A, D))
                                if DEBUG_MODE:
                                    print(f"Smart Merge: Combined split segments of color {color_name}")
                                smart_merged = True
                                break
                    if smart_merged: break
                
        for H1, H2 in connections:
            mid_point = (H2[0], H1[1])
            path = [H1, mid_point, H2]
            all_wire_data.append({
                "color": color_name,
                "endpoints": [hole_to_label.get(H1, "UNK"), hole_to_label.get(H2, "UNK")],
                "path": path
            })
            
    return all_wire_data
