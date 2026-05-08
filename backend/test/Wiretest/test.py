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
    cv2.imwrite("test/Wiretest/debug/0_gray.jpg", gray)
    
    _, thresh = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)
    cv2.imwrite("test/Wiretest/debug/1_thresh.jpg", thresh)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    debug_contours = image.copy()
    cv2.drawContours(debug_contours, contours, -1, (0, 0, 255), 1)
    cv2.imwrite("test/Wiretest/debug/2_contours.jpg", debug_contours)
    
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
                    
    debug_filtered = image.copy()
    for (cX, cY) in hole_centers:
        cv2.circle(debug_filtered, (cX, cY), 2, (0, 255, 0), -1)
    cv2.imwrite("test/Wiretest/debug/3_holes.jpg", debug_filtered)
    
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
    kernel_open = np.ones((3, 3), np.uint8)
    kernel_close = np.ones((15, 15), np.uint8)
    for color_name, bounds in color_ranges.items():
        mask = np.zeros((height, width), dtype=np.uint8)
        for lower, upper in bounds:
            current_mask = cv2.inRange(hsv, lower, upper)
            mask = cv2.bitwise_or(mask, current_mask)
        
        # Morphological operations to clean up masks
        kernel = np.ones((3,3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        color_masks[color_name] = mask
        cv2.imwrite(f"test/Wiretest/debug/4_mask_{color_name}.jpg", mask)
        
    return color_masks

def extract_wires(mask: np.ndarray, holes: List[HoleCoord]) -> List[WireConnection]:
    """
    Finds individual wires in a color mask by identifying connected components,
    finding their endpoints using BFS, and snapping to the nearest hole.
    """
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    
    connections = []
    
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 100: # Ignore noise
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
        else:
            # Fallback for debugging: if no holes were detected, just return the raw endpoints
            if E1 != E2:
                connections.append((E1, E2))
                
    # Post-processing: Merge broken segments of occluded wires that snapped to the same hole
    merged = True
    while merged:
        merged = False
        for i in range(len(connections)):
            for j in range(i + 1, len(connections)):
                c1 = connections[i]
                c2 = connections[j]
                
                shared = False
                if c1[0] == c2[0]:
                    new_conn = (c1[1], c2[1])
                    shared = True
                elif c1[0] == c2[1]:
                    new_conn = (c1[1], c2[0])
                    shared = True
                elif c1[1] == c2[0]:
                    new_conn = (c1[0], c2[1])
                    shared = True
                elif c1[1] == c2[1]:
                    new_conn = (c1[0], c2[0])
                    shared = True
                    
                if shared:
                    connections.pop(j)
                    connections.pop(i)
                    if new_conn[0] != new_conn[1]:
                        connections.append(new_conn)
                    merged = True
                    break
            if merged:
                break
                
    return connections

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
    
    all_connections = []
    
    for color_name, mask in color_masks.items():
        connections = extract_wires(mask, holes)
        
        for start_node, end_node in connections:
            cv2.circle(vis_image, start_node, 6, (0, 0, 255), 2)
            cv2.circle(vis_image, end_node, 6, (0, 0, 255), 2)
            
        all_connections.extend(connections)
        
    for start_node, end_node in all_connections:
        cv2.line(vis_image, start_node, end_node, (0, 255, 255), 2)
            
    print(f"\nFound {len(all_connections)} valid wire connections across all colors.")
    for start_node, end_node in all_connections:
        print(f"  -> Traced Wire: {start_node} <-> {end_node}")
                
    output_path = "test/Wiretest/debug/detected_grid.jpg"
    cv2.imwrite(output_path, vis_image)
    print(f"\nSaved analysis visualization to {output_path}")

if __name__ == "__main__":
    # main("test/Wiretest/test_data/image6.png")
    main("debug_outputs/1_warped_board.jpg")