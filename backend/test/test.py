import cv2
import numpy as np
from typing import List, Tuple, Dict

HoleCoord = Tuple[int, int]
EdgeList = List[str]
NodeData = Tuple[HoleCoord, EdgeList]
WireConnection = Tuple[HoleCoord, HoleCoord]
WirePath = List[HoleCoord]

def generate_global_grid(holes: List[HoleCoord]) -> List[HoleCoord]:
    if not holes:
        return []
        
    def cluster_1d(coords, tol=10):
        coords = np.sort(coords)
        splits = np.where(np.diff(coords) >= tol)[0] + 1
        return [int(np.median(c)) for c in np.split(coords, splits)]

    unique_y = cluster_1d([p[1] for p in holes])
    unique_x = cluster_1d([p[0] for p in holes])
        
    # Fill missing X columns
    x_gaps = np.diff(unique_x)
    med_x_gap = np.median(x_gaps)
    
    cont_x = [unique_x[0]]
    for x, gap in zip(unique_x[1:], x_gaps):
        if gap > med_x_gap * 1.5:
            steps = int(round(gap / med_x_gap))
            cont_x.extend([int(cont_x[-1] + j * (gap / steps)) for j in range(1, steps)])
        cont_x.append(x)

    # Fill the plastic parts with symmetric rows
    y_gaps = np.diff(unique_y)
    med_y_gap = np.median(y_gaps)
    
    cont_y = [unique_y[0]]
    for y, gap in zip(unique_y[1:], y_gaps):
        if gap > med_y_gap * 1.5:
            steps = int(round(gap / med_y_gap))
            cont_y.extend([int(cont_y[-1] + j * (gap / steps)) for j in range(1, steps)])
        cont_y.append(y)
        
    print(f"Projecting global symmetric grid from detected layout: {len(cont_x)} columns by {len(cont_y)} rows.")
    return [(x, y) for y in cont_y for x in cont_x]

def detect_holes(image: np.ndarray) -> List[HoleCoord]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    hole_centers = []
    
    for c in contours:
        area = cv2.contourArea(c)
        if 5 < area < 100:
            x,y,w,h = cv2.boundingRect(c)
            if 0.5 < w/h < 2.0:
                M = cv2.moments(c)
                if M["m00"] != 0:
                    cX = int(M["m10"] / M["m00"])
                    cY = int(M["m01"] / M["m00"])
                    hole_centers.append((cX, cY))
    
    return generate_global_grid(hole_centers)

def draw_grid(vis_image: np.ndarray, holes: List[HoleCoord], cell_w: int, cell_h: int) -> None:
    height, width, _ = vis_image.shape
    for (hx, hy) in holes:
        x1 = max(0, hx - cell_w // 2)
        y1 = max(0, hy - cell_h // 2)
        x2 = min(width - 1, hx + cell_w // 2)
        y2 = min(height - 1, hy + cell_h // 2)
        cv2.rectangle(vis_image, (x1, y1), (x2, y2), (0, 255, 0), 1)
        
def extract_color_masks(image: np.ndarray) -> Dict[str, np.ndarray]:
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
            (np.array([10, 70, 30]), np.array([24, 255, 99])) # Same hue as orange, much lower brightness
        ],
        'Black': [
            (np.array([0, 0, 0]), np.array([180, 255, 40])) # Extremely low brightness across all hues
        ]
    }
    
    color_masks = {}
    kernel = np.ones((3, 3), np.uint8)
    for color_name, ranges in color_ranges.items():
        color_mask = np.zeros((height, width), dtype=np.uint8)
        for lower, upper in ranges:
            mask = cv2.inRange(hsv, lower, upper)
            color_mask = cv2.bitwise_or(color_mask, mask)
        color_mask = cv2.morphologyEx(color_mask, cv2.MORPH_OPEN, kernel)
        color_masks[color_name] = color_mask
    return color_masks

def analyze_nodes(mask: np.ndarray, holes: List[HoleCoord], cell_w: int, cell_h: int) -> Tuple[List[NodeData], List[NodeData]]:
    """Analyzes perimeter crossings of each grid cell to find Endpoints and Path Nodes."""
    height, width = mask.shape
    endpoints = []
    pass_throughs = []
    
    # Contour bounding box optimization
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bounding_rects = [cv2.boundingRect(c) for c in contours if cv2.contourArea(c) > 10]
    
    for (hx, hy) in holes:
        inside_bbox = False
        for (rx, ry, rw, rh) in bounding_rects:
            if (rx - cell_w) <= hx <= (rx + rw + cell_w) and (ry - cell_h) <= hy <= (ry + rh + cell_h):
                inside_bbox = True
                break
                
        if not inside_bbox:
            continue
            
        x1 = max(0         , hx - cell_w // 2)
        y1 = max(0         , hy - cell_h // 2)
        x2 = min(width  - 1, hx + cell_w // 2)
        y2 = min(height - 1, hy + cell_h // 2)
        
        cell_roi = mask[y1:y2+1, x1:x2+1]
        area = np.count_nonzero(cell_roi)
        if area == 0:
            continue
            
        top    = mask[y1, x1:x2+1]
        bottom = mask[y2, x1:x2+1]
        left   = mask[y1:y2+1, x1]
        right  = mask[y1:y2+1, x2]
        
        # Helper to check if an edge has an active crossing
        def has_crossing(edge_array):
            binary = (edge_array > 127).astype(np.int8)
            # A crossing is when there is at least one transition from 0 to 1, or if the edge starts active
            closed = np.append(binary, 0) # Close it to force a drop off
            return np.sum(np.diff(closed) == 1) > 0 or binary[0] == 1
            
        active_edges = []
        if has_crossing(top)   : active_edges.append('top')
        if has_crossing(bottom): active_edges.append('bottom')
        if has_crossing(left)  : active_edges.append('left')
        if has_crossing(right) : active_edges.append('right')
        
        crossings = len(active_edges)
                
        if crossings == 1:
            if area > 50:
                M = cv2.moments(cell_roi)
                if M["m00"] != 0:
                    cX = int(M["m10"] / M["m00"])
                    cY = int(M["m01"] / M["m00"])
                    h_roi, w_roi = cell_roi.shape
                    dist_to_center = np.sqrt((cX - w_roi // 2)**2 + (cY - h_roi // 2)**2)
                    
                    if dist_to_center < 8:
                        endpoints.append(((hx, hy), active_edges))
        elif crossings >= 2:
            if area > 5:
                pass_throughs.append(((hx, hy), active_edges))
                
    return endpoints, pass_throughs

def trace_wires(endpoints_data: List[NodeData], pass_throughs_data: List[NodeData]) -> Tuple[List[WireConnection], List[WirePath]]:
    """DFS search across nodes to connect Endpoints, enforcing momentum at intersections."""
    import math
    node_edges = {pos: edges for pos, edges in endpoints_data + pass_throughs_data}
    all_coords = set(node_edges.keys())
    
    # Exclude endpoints that start as intersections (4-way overlapping directly on a hole)
    # as they don't have a clear starting momentum.
    unvisited_endpoints = set(pos for pos, edges in endpoints_data if len(edges) <= 2)
    
    wire_connections = []
    node_traversals = [] 
    
    while unvisited_endpoints:
        start_node = unvisited_endpoints.pop()
        current_path = [start_node]
        visited = {start_node}
        
        curr = start_node
        found_end = None
        prev_dir = (0, 0)
        
        while True:
            neighbors = []
            active_edges = node_edges[curr]
            is_intersection = len(active_edges) > 2
            
            for node in all_coords:
                if node not in visited:
                    dist = math.hypot(node[0] - curr[0], node[1] - curr[1])
                    if dist < 65:
                        dx = node[0] - curr[0]
                        dy = node[1] - curr[1]
                        
                        valid = True
                        if is_intersection and prev_dir != (0, 0):
                            # Enforce straight momentum
                            if abs(prev_dir[0]) > abs(prev_dir[1]): # Moving horizontally
                                expected_dx = 1 if prev_dir[0] > 0 else -1
                                if (dx > 0 and expected_dx < 0) or (dx < 0 and expected_dx > 0) or abs(dy) > abs(dx):
                                    valid = False
                            else: # Moving vertically
                                expected_dy = 1 if prev_dir[1] > 0 else -1
                                if (dy > 0 and expected_dy < 0) or (dy < 0 and expected_dy > 0) or abs(dx) > abs(dy):
                                    valid = False
                                    
                        if valid:
                            neighbors.append((dist, node, (dx, dy)))
            
            if not neighbors:
                break
                
            neighbors.sort(key=lambda x: x[0])
            next_node = neighbors[0][1]
            prev_dir = neighbors[0][2]
            
            visited.add(next_node)
            current_path.append(next_node)
            curr = next_node
            
            # Check against original endpoints_data to see if we reached a valid terminal
            if curr in [pos for pos, _ in endpoints_data] and curr != start_node:
                found_end = curr
                break
                
        if found_end:
            wire_connections.append((start_node, found_end))
            if found_end in unvisited_endpoints:
                unvisited_endpoints.remove(found_end)
        node_traversals.append(current_path)
        
    return wire_connections, node_traversals

def main(image_path: str):
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: Could not read image at {image_path}")
        return
        
    print("Detecting holes dynamically...")
    holes = detect_holes(image)
    print(f"Detected {len(holes)} holes.")
    
    cell_w, cell_h = 20, 20
    vis_image = image.copy()
    
    print("Drawing grid overlay...")
    draw_grid(vis_image, holes, cell_w, cell_h)
    
    print("Extracting color masks...")
    color_masks = extract_color_masks(image)
    
    for color_name, mask in color_masks.items():
        print(f"\n--- {color_name} Wires ---")
        endpoints, pass_throughs = analyze_nodes(mask, holes, cell_w, cell_h)
        print(f"Found {len(endpoints)} Endpoints and {len(pass_throughs)} Path Nodes.")
        
        for ep, edges in endpoints:
            cv2.circle(vis_image, ep, 6, (0, 0, 255), 2)
        for pt, edges in pass_throughs:
            cv2.circle(vis_image, pt, 2, (0, 255, 0), -1)
            
        connections, traversals = trace_wires(endpoints, pass_throughs)
        
        for path in traversals:
            for i in range(len(path)-1):
                cv2.line(vis_image, path[i], path[i+1], (0, 255, 255), 2)
                
        for start_node, end_node in connections:
            print(f"  -> Traced Wire: {start_node} <-> {end_node}")
                
    output_path = "test/debug_detected_grid.jpg"
    cv2.imwrite(output_path, vis_image)
    print(f"\nSaved analysis visualization to {output_path}")

if __name__ == "__main__":
    main("test/image4.png")
