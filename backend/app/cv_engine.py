import cv2
import numpy as np
import math
from ultralytics import YOLO
from typing import List, Tuple, Union

# --- Type Definitions ---
Point = Tuple[float, float]
HoleCoord = Tuple[int, int]
BoundingBox = List[Point] # [TL, TR, BR, BL] usually
RawComponent = Tuple[int, str, List[List[float]]] # (class_id, class_name, corners)
ComponentTerminals = Tuple[int, str, List[Point]] # (class_id, class_name, [pin1, pin2, ...])
WireData = List[Union[int, str, List[str]]] # [id, name, [hole_id1, hole_id2]]
HoleGrid = List[List[HoleCoord]]

def perspective_transform(image : np.ndarray, contour : np.ndarray) -> np.ndarray:
    """
    Applies a 4-point perspective transform to crop and straighten the breadboard from the image.
    
    Args:
        image (np.ndarray): The source image.
        contour (np.ndarray): The 4 points of the detected breadboard outline.
        
    Returns:
        np.ndarray: The warped, top-down view of the breadboard.
    """
    pts = contour.reshape(4, 2)
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
 
    (tl, tr, br, bl) = rect
 
    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))
 
    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))
 
    dst = np.array([[0, 0], [maxWidth - 1, 0], [maxWidth - 1, maxHeight - 1], [0, maxHeight - 1]], dtype="float32")
 
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
 
    return warped

def detect_breadboard(image : np.ndarray) -> np.ndarray:
    """
    Detects the breadboard in the input image and returns a straightened version.
    
    Args:
        image (np.ndarray): The raw input image.
        
    Returns:
        np.ndarray: The warped top-down view of the breadboard.
        
    Raises:
        ValueError: If no suitable breadboard contour is found.
    """
    orig = image.copy()
    scale = 800 / max(image.shape[:2])
    image_resized = cv2.resize(image, None, fx=scale, fy=scale)
    ratio = orig.shape[0] / image_resized.shape[0]

    gray = cv2.cvtColor(image_resized, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray,  (5,5), 0)

    edges = cv2.Canny(gray, 50, 150)

    kernel = cv2.getStructuringElement(cv2.MOPRH_RECT, (5, 5))
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("No contours found in image.")

    contours = sorted(contours, key = cv2.contourArea, reverse=True)

    breadboard_contour = None
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            breadboard_contour = approx
            break
    
    if breadboard_contour is None:
        raise ValueError("Could not find a rectangular breadboard contour.")

    warped = perspective_transform(orig, breadboard_contour.reshape(4, 2) * ratio)
    
    return warped

def pixel_map(image : np.ndarray) -> HoleGrid:
    """
    Calculates the pixel coordinates of every hole on the breadboard based on standard spacing.
    
    Args:
        image (np.ndarray): The warped breadboard image (used for dimensions).
        
    Returns:
        List[List[Tuple[int, int]]]: A matrix where each element is the (x, y) coordinate
                                     of a hole. Order follows the breadboard rows logic.
    """
    height, width, _ = image.shape

    # BREADBOARD CONSTANTS
    MID_LR_MARGIN = 4/165 * width
    MID_TD_MARGIN = 13/54 * height

    EDGE_LR_MARGIN = 8.5/165 * width
    EDGE_TD_MARGIN = 3/54 * height

    HOLE_VERT_GAP = 2.5/54 * height
    HOLE_HORIZ_GAP = 2.5/165 * width

    EDGE_PER5_GAP = 3/165 * width

    holes_matrix = []   # This is the matrix returned

    # TOP RAIL (2 rows, 50 holes each)
    for i in range(2):
        row_coords = []
        jump = 0

        for j in range(50):
            if j % 5 == 0 and j != 0:
                jump += 1

            basex = int(EDGE_LR_MARGIN + j * HOLE_HORIZ_GAP + jump * 0.94 * EDGE_PER5_GAP)
            basey = int(EDGE_TD_MARGIN + i * HOLE_VERT_GAP)

            row_coords.append((basex, basey))
        holes_matrix.append(row_coords)

    # MIDDLE SECTION (5 rows, 63 holes each)
    for i in range(5):
        row_coords = []
        for j in range(63):
            basex = int(MID_LR_MARGIN + (1.014 * j) * HOLE_HORIZ_GAP)
            basey = int(MID_TD_MARGIN + i * HOLE_HORIZ_GAP)

            row_coords.append((basex, basey))
        holes_matrix.append(row_coords)
    for i in range(5):
        row_coords = []
        for j in range(63):
            basex = int(MID_LR_MARGIN + (1.014 * j) * HOLE_HORIZ_GAP)
            basey = int(MID_TD_MARGIN + i * HOLE_HORIZ_GAP)

            row_coords.append((basex, height-basey))
        holes_matrix.append(row_coords)

    # BOTTOM RAIL (mirror of top rail)
    for i in range(2):
        row_coords = []
        jump = 0

        for j in range(50):
            if j % 5 == 0 and j != 0:
                jump += 1

            basex = int(EDGE_LR_MARGIN + j * HOLE_HORIZ_GAP + jump * 0.94 * EDGE_PER5_GAP)
            basey = int(height - (EDGE_TD_MARGIN + i * HOLE_VERT_GAP))

            row_coords.append((basex, basey))
        holes_matrix.append(row_coords)

    return holes_matrix

def detect_components(image: np.ndarray, model: YOLO) -> List[RawComponent]:
    """
    Runs YOLO object detection to find components on the breadboard.
    
    Args:
        image (np.ndarray): The warped breadboard image.
        model (YOLO): The loaded YOLOv8 model instance.
        
    Returns:
        List[Tuple[int, str, List[List[float]]]]: A list of detected components.
                                                  Format: (class_id, class_name, [box_corners])
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
            components.append((cls_id,class_name,coords))
    return components

def get_equally_spaced_points(p1: Point, pn: Point, n: int) -> List[Point]:
    """
    Interpolates N equally spaced points between two coordinates.
    Used for determining pin locations on multi-pin components like ICs.
    """
    x1, y1 = p1
    xn, yn = pn
    points = []
    for i in range(n):
        t = i / (n - 1)  # goes from 0 to 1
        x = x1 + t * (xn - x1)
        y = y1 + t * (yn - y1)
        points.append((x, y))
    return points

def extract_component_terminals(components: List[RawComponent]) -> List[ComponentTerminals]:
    """
    Determines the exact termination points (pins) for each component.
    
    Args:
        components (List): Raw component detections from detect_components.
        
    Returns:
        List: Components with pin coordinates instead of bounding boxes.
              Format: (class_id, class_name, [(x, y), (x, y), ...])
    """
    component_endpoints_list = []

    for component in components:
        pq = []
        cls_id, class_name, coords = component

        if cls_id == 0: continue # Skip wire class if detected by component model

        # Logic to find shortest/longest edges to determine orientation
        for i in range(len(coords)):
            p1 = coords[i]
            p2 = coords[(i+1)%len(coords)]
            d = math.sqrt(((p1[0]-p2[0])**2) + ((p1[1]-p2[1])**2))
            pq.append((d, (p1, p2)))

        # Specific logic based on component type ID (resistors vs transistors etc)
        # 4: MOSFET, 5: CIRT, 7: IC
        endedge1, endedge2 = None, None

        if cls_id in [4, 5, 7]:
            # Complex component logic (transistor/IC)
            if cls_id in [4, 5]:
                if pq[0][0] < pq[1][0]:
                    _, endedge1 = pq[0]
                    _, endedge2 = pq[2]
                else: 
                    _, endedge1 = pq[1]
                    _, endedge2 = pq[3]

                # Midpoints
                endpoint1 = ((endedge1[0][0]+endedge1[1][0])//2, (endedge1[0][1]+endedge1[1][1])//2)
                endpoint2 = ((endedge2[0][0]+endedge2[1][0])//2, (endedge2[0][1]+endedge2[1][1])//2)
                endedge1 = get_equally_spaced_points(endpoint1, endpoint2, 3)
            else:
                # IC Logic
                if pq[0][0] > pq[1][0]:
                     d1, endedge1 = pq[0]
                     _, endedge2 = pq[2]
                     d2, _ = pq[1]
                else:
                     d1, endedge1 = pq[1]
                     _, endedge2 = pq[3]
                     d2, _ = pq[0]

                if (d1/d2) < 2:
                    endedge1 = get_equally_spaced_points(endedge1[0], endedge1[1], 4)
                    endedge2 = get_equally_spaced_points(endedge2[0], endedge2[1], 4)
                else:
                    endedge1 = get_equally_spaced_points(endedge1[0], endedge1[1], 8)
                    endedge2 = get_equally_spaced_points(endedge2[0], endedge2[1], 8)
                endedge1.extend(endedge2)

            component_endpoints_list.append((cls_id, class_name, endedge1))

        else:
            # Simple 2-terminal component logic
            if pq[0][0] < pq[1][0]:
                _, endedge1 = pq[0]
                _, endedge2 = pq[2]
            else:
                _, endedge1 = pq[1]
                _, endedge2 = pq[3]

            endpoint1 = ((endedge1[0][0]+endedge1[1][0])/2, (endedge1[0][1]+endedge1[1][1])/2)
            endpoint2 = ((endedge2[0][0]+endedge2[1][0])/2, (endedge2[0][1]+endedge2[1][1])/2)
            component_endpoints_list.append((cls_id, class_name, [endpoint1, endpoint2]))

    return component_endpoints_list

def detect_wires(image: np.ndarray, model: YOLO, holes: HoleGrid) -> List[WireData]:
    """
    Detects jumper wires using Keypoint detection and maps endpoints to breadboard hole IDs.

    Args:
        image (np.ndarray): The warped breadboard image.
        model (YOLO): The wire endpoint detection model.
        holes (List[List[Tuple]]): The grid of hole coordinates (from pixel_map).

    Returns:
        List: A list of wires with their connected holes.
              Format: [0, "Wire N", ["A1", "J63"]]
    """
    y_to_letter = {0:'U-',1:'U+',2:'A',3:'B',4:'C',5:'D',6:'E',7:'J',8:'I',9:'H',10:'G',11:'F',12:'L+',13:'L-'}
    results = model(image)[0]
    endpoints = []

    for kpts in results.keypoints.xy:
        if kpts.shape[0] < 2: continue
        x1, y1 = kpts[0]
        x2, y2 = kpts[1]
        endpoints.append(((x1, y1), (x2, y2)))

    wire_data = []

    for idx, end_pair in enumerate(endpoints):
        brdbord_coords = []
        for coords in end_pair:
            # Find closest hole
            closest_y = 0
            closest_x = 0
            smallest_gap = float('inf')

            # Find row
            for i in range(14):
                if abs(holes[i][0][1] - coords[1]) < smallest_gap:
                    smallest_gap = abs(holes[i][0][1] - coords[1])
                    closest_y = i

            # Find col
            smallest_gap = float('inf')
            for j in range(len(holes[closest_y])):
                if abs(holes[closest_y][j][0] - coords[0]) < smallest_gap:
                    smallest_gap = abs(holes[closest_y][j][0] - coords[0])
                    closest_x = j

            brdbord_coords.append(y_to_letter[closest_y] + str(closest_x))

        wire_data.append([0, f"Wire {idx+1}", brdbord_coords])

    return wire_data

def map_terminals_to_holes(components: List[ComponentTerminals], holes: HoleGrid) -> List[Tuple[int, str, List[str]]]:
    """
    Maps component terminal coordinates to the nearest breadboard holes.

    Args:
        components: List of components with (x,y) pin coordinates.
        holes: The grid of hole coordinates.
 
    Returns:
        List of (class_id, class_name, ["A1", "B2", ...])
    """
    y_to_letter = {0:'U-',1:'U+',2:'A',3:'B',4:'C',5:'D',6:'E',7:'J',8:'I',9:'H',10:'G',11:'F',12:'L+',13:'L-'}
    mapped_components = []

    for comp in components:
        cls_id, name, terminals = comp
        mapped_terminals = []

        for coords in terminals:
            closest_y = 0
            closest_x = 0
            smallest_gap = float('inf')

            # Find row
            for i in range(14):
                if abs(holes[i][0][1] - coords[1]) < smallest_gap:
                    smallest_gap = abs(holes[i][0][1] - coords[1])
                    closest_y = i

            # Find col
            smallest_gap = float('inf')
            for j in range(len(holes[closest_y])):
                if abs(holes[closest_y][j][0] - coords[0]) < smallest_gap:
                    smallest_gap = abs(holes[closest_y][j][0] - coords[0])
                    closest_x = j

            mapped_terminals.append(y_to_letter[closest_y] + str(closest_x))

        mapped_components.append((cls_id, name, mapped_terminals))

    return mapped_components
