
import cv2
import numpy as np
import sys
import os

# Ensure we can import from backend/app
# Assuming this script is run from backend/ directory
sys.path.append(os.getcwd())

try:
    from app.cv_engine import pixel_map
except ImportError:
    print("Error: Could not import pixel_map. Run this from 'backend/' directory using 'uv run test/test.py'")
    sys.exit(1)

def get_wire_mask(image):
    # Convert to HSV
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    
    lower_red1 = np.array([0, 100, 100])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 100, 100])
    upper_red2 = np.array([180, 255, 255])
    
    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
    
    mask = cv2.bitwise_or(mask1, mask2)
    
    # Morphological Closing to fill gaps in the wire mask
    kernel = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    
    return mask

def find_wire_seeds(image, holes, mask):
    seeds = []
    height, width = mask.shape
    radius = 8
    threshold = 0.1

    for row_idx, row in enumerate(holes):
        for col_idx, (hx, hy) in enumerate(row):
            if hx - radius < 0 or hx + radius >= width or hy - radius < 0 or hy + radius >= height:
                continue

            # Extract small ROI (Region of Interest) around the hole
            roi = mask[hy-radius:hy+radius+1, hx-radius:hx+radius+1]
            
            if np.count_nonzero(roi) / roi.size > threshold:
                seeds.append(((row_idx, col_idx), hx, hy))

    return seeds

def get_closest_hole(pixel, holes, max_dist=30):
    px, py = pixel
    best_dist = float('inf')
    best_hole = None
    
    # Optimization: Could use spatial index, but brute force is fine for 300 holes
    for row_idx, row in enumerate(holes):
        for col_idx, (hx, hy) in enumerate(row):
            dist = np.sqrt((px - hx)**2 + (py - hy)**2)
            if dist < best_dist:
                best_dist = dist
                best_hole = (row_idx, col_idx)
    
    if best_dist <= max_dist:
        return best_hole
    return None

def get_direction_score(current_dir, candidate_dir):
    """
    Returns a score based on how similar candidate_dir is to current_dir.
    High score = straight line. Low score = sharp turn.
    """
    if current_dir is None: return 0
    
    # normalize vectors
    norm_curr = np.linalg.norm(current_dir)
    norm_cand = np.linalg.norm(candidate_dir)
    
    if norm_curr == 0 or norm_cand == 0: return 0
    
    curr_unit = (current_dir[0]/norm_curr, current_dir[1]/norm_curr)
    cand_unit = (candidate_dir[0]/norm_cand, candidate_dir[1]/norm_cand)

    # return dot product
    return np.dot(curr_unit, cand_unit)

def trace_wire(mask, start_pixel):
    """
    Simulates an 'ant' walking along the wire pixels with momentum.
    """
    path = [start_pixel]
    current_pos = start_pixel
    current_dir = None # No direction initially
    visited = set([start_pixel])
    
    height, width = mask.shape

    for _ in range(2000): # To avoid infinite loops
        neighbors = []
        
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue
                
                nx, ny = current_pos[0] + dx, current_pos[1] + dy
                
                if 0 <= nx < width and 0 <= ny < height:
                    if mask[ny, nx] == 255 and (nx, ny) not in visited:
                        neighbors.append((nx, ny))
        
        if not neighbors:
            break # Dead end

        next_pos = None

        if len(neighbors) == 1:
            next_pos = neighbors[0]
        else:
            if current_dir is None:
                next_pos = neighbors[0] 
            else:
                best_score = -float('inf')
                best_n = None
                
                for n in neighbors:
                    step_dir = (n[0] - current_pos[0], n[1] - current_pos[1])
                    score = get_direction_score(current_dir, step_dir)
                    
                    if score > best_score:
                        best_score = score
                        best_n = n
                next_pos = best_n
        
        visited.add(next_pos)
        
        new_dir = (next_pos[0] - current_pos[0], next_pos[1] - current_pos[1])
        
        current_dir = new_dir 
            
        current_pos = next_pos
        path.append(current_pos)
            
    return path

def main():
    img_path = "test/image.png"

    image = cv2.imread(img_path)
    
    # 2. Get Wire Mask
    print("Generating mask")
    mask = get_wire_mask(image)
    cv2.imwrite("test/debug_mask.jpg", mask)
    
    # 3. Get Holes (Pixel Map)
    print("Generating pixel map")
    holes = pixel_map(image)
    
    # 4. Find Seeds (Start Points)
    print("Finding seed holes...")
    seeds = find_wire_seeds(image, holes, mask)
    print(f"Found {len(seeds)} potential wire seeds.")
    
    vis_image = image.copy()
    
    # 5. Trace
    print("Tracing wires...")
    
    processed_pixels = set()
    wires_found = [] # List of (StartHole, EndHole, Path)

    for i, seed in enumerate(seeds):
        # seed is ((row, col), x, y)
        start_hole_idx = seed[0]
        start_coord = (seed[1], seed[2])
        
        # Snap to nearest wire pixel within radius=12
        snapped_start = None
        sx, sy = start_coord
        snap_radius = 12
        height, width = mask.shape

        # Check center
        if mask[sy, sx] == 255:
            snapped_start = start_coord
        else:
            # Search outward
            found = False
            for r in range(1, snap_radius + 1):
                for dy in range(-r, r + 1):
                    for dx in range(-r, r + 1):
                        nx, ny = sx + dx, sy + dy
                        if 0 <= nx < width and 0 <= ny < height:
                            if mask[ny, nx] == 255:
                                snapped_start = (nx, ny)
                                found = True
                                break
                    if found: break
                if found: break
        
        if snapped_start is None:
            continue
            
        if snapped_start in processed_pixels:
            continue
            
        path = trace_wire(mask, snapped_start)
        
        # If path length > 100 (filter tiny noise), we found something
        if len(path) > 100:
            # Mark all pixels in this path as processed so we don't start tracing from them again
            for p in path:
                processed_pixels.add(p)
            
            end_pixel = path[-1]
            end_hole_idx = get_closest_hole(end_pixel, holes)
            
            if end_hole_idx:
                # Filter out the red power rail which traces up to ~2000 length
                if len(path) < 1800:
                    wires_found.append({
                        "start": start_hole_idx,
                        "end": end_hole_idx,
                        "length": len(path),
                        "path": path
                    })

    # Post-processing to extract exactly the unique 4 wires
    print("\n--- WIRE COORDINATES ---")
    
    # Sort ALL wires by length descending so we process the best ones first
    wires_found.sort(key=lambda x: x['length'], reverse=True)
    
    def same_wire(w1, w2):
        s1, e1 = w1['start'], w1['end']
        s2, e2 = w2['start'], w2['end']
        
        def dist(h1, h2):
            return ((h1[0]-h2[0])**2 + (h1[1]-h2[1])**2)**0.5
            
        # Wires are duplicates if their ends are near each other (<= 3 grid distance)
        return (dist(s1, s2) <= 3 and dist(e1, e2) <= 3) or \
               (dist(s1, e2) <= 3 and dist(e1, s2) <= 3)

    final_wires = []
    
    for w in wires_found:
        is_duplicate = False
        for fw in final_wires:
            if same_wire(w, fw):
                is_duplicate = True
                break
        if not is_duplicate:
            final_wires.append(w)
            
    final_4_wires = final_wires[:4]
    
    # Draw specifically the top 4 wires to highlight them
    for i, w in enumerate(final_4_wires):
        print(f"Wire {i+1}: {w['start']} <-> {w['end']} (Trace Len: {w['length']})")
        pts = np.array(w['path'], np.int32)
        pts = pts.reshape((-1, 1, 2))
        cv2.polylines(vis_image, [pts], False, (0, 255, 0), 2)
        
        # Draw endpoints
        sh_px = holes[w['start'][0]][w['start'][1]]
        eh_px = holes[w['end'][0]][w['end'][1]]
        cv2.circle(vis_image, sh_px, 5, (0, 0, 255), -1) # Red Start
        cv2.circle(vis_image, eh_px, 5, (255, 0, 0), -1) # Blue End
        
        # We can also add text label
        midpoint = w['path'][len(w['path'])//2]
        cv2.putText(vis_image, f"W{i+1}", midpoint, cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
        cv2.putText(vis_image, f"W{i+1}", midpoint, cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
    cv2.imwrite("test/debug_result.jpg", vis_image)
    print("------------------------------\nSaved debug_result.jpg")

if __name__ == "__main__":
    main()
