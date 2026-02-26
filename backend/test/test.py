import cv2
import numpy as np

def generate_global_grid(holes):
    if not holes:
        return []
        
    def cluster_1d(coords, tol=10):
        coords = np.sort(coords)
        splits = np.where(np.diff(coords) >= tol)[0] + 1
        return [int(np.median(c)) for c in np.split(coords, splits)]

    unique_y = cluster_1d([p[1] for p in holes])
    unique_x = cluster_1d([p[0] for p in holes])
        
    # Interpolate synthetic Y rows across large plastic trenches
    y_gaps = np.diff(unique_y)
    med_gap = np.median(y_gaps)
    
    cont_y = [unique_y[0]]
    for y, gap in zip(unique_y[1:], y_gaps):
        if gap > med_gap * 1.5:
            steps = int(round(gap / med_gap))
            cont_y.extend([int(cont_y[-1] + j * (gap / steps)) for j in range(1, steps)])
        cont_y.append(y)
        
    print(f"Projecting global symmetric grid from detected layout: {len(unique_x)} columns by {len(cont_y)} rows.")
    return [(x, y) for y in cont_y for x in unique_x]

def detect_holes(image):
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

def draw_grid(vis_image, holes, cell_w, cell_h):
    """Draws bounding boxes around every grid cell to visualize the matrix structure."""
    height, width, _ = vis_image.shape
    for (hx, hy) in holes:
        x1 = max(0, hx - cell_w // 2)
        y1 = max(0, hy - cell_h // 2)
        x2 = min(width - 1, hx + cell_w // 2)
        y2 = min(height - 1, hy + cell_h // 2)
        cv2.rectangle(vis_image, (x1, y1), (x2, y2), (0, 255, 0), 1)
        
def extract_color_masks(image):
    """Isolates the Red, Blue, and Green wires using HSV thresholding."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    height, width, _ = image.shape
    
    color_ranges = {
        'Red': [
            (np.array([0, 100, 100]), np.array([10, 255, 255])),
            (np.array([160, 100, 100]), np.array([180, 255, 255]))
        ],
        'Blue': [
            (np.array([90, 100, 100]), np.array([130, 255, 255]))
        ],
        'Green': [
            (np.array([40, 50, 50]), np.array([90, 255, 255]))
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

def analyze_nodes(mask, holes, cell_w, cell_h):
    """Analyzes perimeter crossings of each grid cell to find Endpoints and Path Nodes."""
    height, width = mask.shape
    endpoints = []
    pass_throughs = []
    
    # Contour bounding box optimization
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bounding_rects = [cv2.boundingRect(c) for c in contours if cv2.contourArea(c) > 10]
    
    for (hx, hy) in holes:
        # Check if the hole is near any wire blob
        inside_bbox = False
        for (rx, ry, rw, rh) in bounding_rects:
            if (rx - cell_w) <= hx <= (rx + rw + cell_w) and (ry - cell_h) <= hy <= (ry + rh + cell_h):
                inside_bbox = True
                break
                
        if not inside_bbox:
            continue
            
        x1 = max(0, hx - cell_w // 2)
        y1 = max(0, hy - cell_h // 2)
        x2 = min(width - 1, hx + cell_w // 2)
        y2 = min(height - 1, hy + cell_h // 2)
        
        cell_roi = mask[y1:y2+1, x1:x2+1]
        if np.count_nonzero(cell_roi) == 0:
            continue
            
        top = mask[y1, x1:x2+1]
        bottom = mask[y2, x1:x2+1]
        left = mask[y1:y2+1, x1]
        right = mask[y1:y2+1, x2]
        
        perimeter = np.concatenate([top, right[1:-1], bottom[::-1], left[::-1][1:-1]])
        
        # Vectorized Numpy crossing detection
        binary_perimeter = (perimeter > 127).astype(np.int8)
        # Pad with the first element to form a closed loop to catch crossings over the seam
        closed_perimeter = np.append(binary_perimeter, binary_perimeter[0])
        crossings = np.sum(np.diff(closed_perimeter) == 1)
                
        if crossings == 1:
            if np.count_nonzero(cell_roi) > 50:
                M = cv2.moments(cell_roi)
                if M["m00"] != 0:
                    cX = int(M["m10"] / M["m00"])
                    cY = int(M["m01"] / M["m00"])
                    h_roi, w_roi = cell_roi.shape
                    dist_to_center = np.sqrt((cX - w_roi // 2)**2 + (cY - h_roi // 2)**2)
                    
                    if dist_to_center < 8:
                        endpoints.append((hx, hy))
        elif crossings == 2 or crossings >= 3:
            if np.count_nonzero(cell_roi) > 5:
                pass_throughs.append((hx, hy))
                
    return endpoints, pass_throughs

def trace_wires(endpoints, pass_throughs):
    """DFS search across nodes to connect Endpoints."""
    all_nodes = set(endpoints + pass_throughs)
    unvisited_endpoints = set(endpoints)
    wire_connections = []
    node_traversals = [] # Store path lists for drawing
    
    while unvisited_endpoints:
        start_node = unvisited_endpoints.pop()
        current_path = [start_node]
        visited = {start_node}
        
        curr = start_node
        found_end = None
        
        while True:
            neighbors = []
            for node in all_nodes:
                if node not in visited:
                    dist = np.sqrt((node[0] - curr[0])**2 + (node[1] - curr[1])**2)
                    if dist < 65:
                        neighbors.append((dist, node))
            
            if not neighbors:
                break
                
            neighbors.sort()
            next_node = neighbors[0][1]
            
            visited.add(next_node)
            current_path.append(next_node)
            curr = next_node
            
            if curr in endpoints:
                found_end = curr
                break
                
        if found_end:
            wire_connections.append((start_node, found_end))
            if found_end in unvisited_endpoints:
                unvisited_endpoints.remove(found_end)
                
        node_traversals.append(current_path)
        
    return wire_connections, node_traversals

def compute_turn_penalty(prev_dir, dx, dy):
    """Calculates the angle between the previous step vector and the proposed step vector."""
    if prev_dir == (0, 0):
        return 0.0
        
    dot_product = prev_dir[0]*dx + prev_dir[1]*dy
    import math
    mag_prev = math.hypot(prev_dir[0], prev_dir[1])
    mag_new = math.hypot(dx, dy)
    
    if mag_prev > 0 and mag_new > 0:
        cos_angle = max(-1.0, min(1.0, dot_product / (mag_prev * mag_new)))
        angle = math.acos(cos_angle)
        return (angle / math.pi) * 100 
    return 0.0

def trace_wires_astar(endpoints, pass_throughs):
    """A* Search (Dijkstra with Turn Penalty) to prevent doubling back in slack loops."""
    import heapq
    import math
    
    all_nodes = set(endpoints + pass_throughs)
    unvisited_endpoints = set(endpoints)
    wire_connections = []
    node_traversals = []
    
    while unvisited_endpoints:
        start_node = unvisited_endpoints.pop()
        
        # Priority queue stores: (cost, current_node, path, previous_direction)
        # previous_direction is a vector (dx, dy)
        queue = [(0, start_node, [start_node], (0, 0))]
        visited_costs = {start_node: 0}
        
        found_end = None
        final_path = []
        
        while queue:
            cost, curr, path, prev_dir = heapq.heappop(queue)
            
            if curr in endpoints and curr != start_node:
                found_end = curr
                final_path = path
                break
                
            for node in all_nodes:
                if node not in path: # Don't loop back on our own exact path
                    dist = math.hypot(node[0] - curr[0], node[1] - curr[1])
                    if dist < 65: # Reachable neighbor
                        
                        dx = node[0] - curr[0]
                        dy = node[1] - curr[1]
                        
                        turn_penalty = compute_turn_penalty(prev_dir, dx, dy)
                        new_cost = cost + dist + turn_penalty
                        
                        if node not in visited_costs or new_cost < visited_costs[node]:
                            visited_costs[node] = new_cost
                            heapq.heappush(queue, (new_cost, node, path + [node], (dx, dy)))
                            
        if found_end:
            wire_connections.append((start_node, found_end))
            if found_end in unvisited_endpoints:
                unvisited_endpoints.remove(found_end)
            node_traversals.append(final_path)
            
    return wire_connections, node_traversals

def main():
    img_path = "test/image.png"
    image = cv2.imread(img_path)
    if image is None:
        print(f"Error: Could not read image at {img_path}")
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
        
        for ep in endpoints:
            cv2.circle(vis_image, ep, 6, (0, 0, 255), 2)
        for pt in pass_throughs:
            cv2.circle(vis_image, pt, 2, (0, 255, 0), -1)
            
        connections, traversals = trace_wires_astar(endpoints, pass_throughs)
        
        for path in traversals:
            for i in range(len(path)-1):
                cv2.line(vis_image, path[i], path[i+1], (0, 255, 255), 2)
                
        for start_node, end_node in connections:
             print(f"  -> Traced Wire: {start_node} <-> {end_node}")
                
    output_path = "test/debug_detected_grid.jpg"
    cv2.imwrite(output_path, vis_image)
    print(f"\nSaved analysis visualization to {output_path}")

if __name__ == "__main__":
    main()
