"""
Toaster — CV Wire Tracing: Step-by-Step Slide Visuals
======================================================
Runs the production CV pipeline from cv_engine.py on a raw breadboard photo,
saving a labeled image at every intermediate stage for use in presentations.

Usage:
    cd backend
    uv run python -m test.slide_visuals [path_to_image]

Output goes to:  test/slide_outputs/
"""

import sys, os, math
import cv2
import numpy as np
from collections import deque
from typing import List, Tuple, Dict

# ── Ensure the backend package is importable ──────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.cv_engine import (
    detect_and_warp,
    detect_holes,
    detect_components,
    extract_component_terminals,
    map_terminals_to_holes,
    map_to_breadboard_ids,
    extract_breadboard,
)
from app.ml_manager import ml_engine

# ── Config ────────────────────────────────────────────────────────────────────
OUT_DIR = os.path.join(os.path.dirname(__file__), "slide_outputs")
COLORS_BGR = {
    "Red": (0, 0, 255), "Orange": (0, 140, 255), "Yellow": (0, 255, 255),
    "Green": (0, 200, 0), "Blue": (255, 100, 0), "Purple": (200, 0, 200),
    "Pink": (180, 105, 255), "Brown": (19, 69, 139), "Black": (80, 80, 80),
}


def save(name: str, img: np.ndarray):
    path = os.path.join(OUT_DIR, name)
    cv2.imwrite(path, img)
    print(f"  ✓ Saved {path}")


def add_label(img: np.ndarray, text: str, pos="tl"):
    """Labels are disabled per user request."""
    return img


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main(image_path: str):
    os.makedirs(OUT_DIR, exist_ok=True)
    image = cv2.imread(image_path)
    if image is None:
        print(f"ERROR: Cannot read {image_path}")
        return

    print(f"\n{'='*60}")
    print(f"  Toaster Slide Visual Generator (Clean)")
    print(f"  Input: {image_path}  ({image.shape[1]}x{image.shape[0]})")
    print(f"  Output: {OUT_DIR}/")
    print(f"{'='*60}\n")

    # ── STEP 1: Perspective warp ──────────────────────────────────────────────
    _, corners = detect_and_warp(image)
    crop_box = {
        "x": 437.4801482265749,
        "y": 587.2031022531763,
        "width": 728.4277395447326,
        "height": 487.8771836950767
    }
    warped = extract_breadboard(image, corners, crop_box)

    # ── STEP 2: Mathematical grid ─────────────────────────────────────────────
    holes, pitch, padX, padY = detect_holes(warped)

    # ── STEP 3: YOLO component detection ──────────────────────────────────────
    comp_model_path = "weights/best_components.pt"
    wire_model_path = "weights/best_wires.pt"
    try:
        ml_engine.load_models(comp_model_path, wire_model_path)
    except Exception as e:
        raw_components = []

    try:
        comp_model = ml_engine.get_component_model()
        raw_components = detect_components(warped, comp_model)
    except Exception:
        raw_components = []

    # ── IMAGE 1: Component Masking (Visual only) ──────────────────────────────
    print("Generating Image 1: Component Masking...")
    # Just for the slide visual, show what is being masked out. 
    # (The actual algorithm zeros out the boolean masks, not the BGR image).
    masked_vis = warped.copy()
    for _, name, coords in raw_components:
        if name.lower() == "breadboard": continue
        pts = np.array(coords, np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(masked_vis, [pts], (0, 0, 0))
    save("1_Component_Masking.jpg", masked_vis)

    # ── IMAGE 2: HSV Color Segmentation ───────────────────────────────────────
    print("Generating Image 2: HSV Color Segmentation...")
    # HSV is computed from the RAW warped image, not the blacked out one!
    hsv = cv2.cvtColor(warped, cv2.COLOR_BGR2HSV)
    height, width = warped.shape[:2]

    color_ranges = {
        'Red': [(np.array([0,70,70]), np.array([9,255,255])),
                (np.array([170,70,70]), np.array([180,255,255]))],
        'Orange': [(np.array([10,70,100]), np.array([24,255,255]))],
        'Yellow': [(np.array([25,70,70]), np.array([35,255,255]))],
        'Green': [(np.array([36,70,70]), np.array([85,255,255]))],
        'Blue': [(np.array([86,70,70]), np.array([125,255,255]))],
        'Purple': [(np.array([126,70,70]), np.array([150,255,255]))],
        'Pink': [(np.array([151,70,70]), np.array([169,255,255]))],
        'Brown': [(np.array([10,70,30]), np.array([24,255,99]))],
        'Black': [(np.array([0,0,0]), np.array([180,150,85]))],
    }

    raw_masks = {}
    for cname, bounds in color_ranges.items():
        mask = np.zeros((height, width), dtype=np.uint8)
        for lo, hi in bounds:
            mask = cv2.bitwise_or(mask, cv2.inRange(hsv, lo, hi))
        raw_masks[cname] = mask

    raw_grid = _make_mask_grid(raw_masks, warped)
    save("2_HSV_Color_Segmentation.jpg", raw_grid)

    # ── PIPELINE: Base Morphology + Component Masking ─────────────────────────
    cleaned_masks = {}
    for cname, mask in raw_masks.items():
        m = mask.copy()
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3,3), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_CROSS, (15,15)))
        m[0:25, :] = 0; m[-25:, :] = 0; m[:, 0:25] = 0; m[:, -25:] = 0
        cleaned_masks[cname] = m

    # Zero out component bodies directly on the binary masks
    for cname in cleaned_masks:
        for _, name, coords in raw_components:
            if name.lower() == "breadboard": continue
            pts = np.array(coords, np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(cleaned_masks[cname], [pts], 0)

    # ── IMAGE 3: Morphological Healing ────────────────────────────────────────
    print("Generating Image 3: Morphological Healing...")
    combined_wire_mask = np.zeros((height, width), dtype=np.uint8)
    for m in cleaned_masks.values():
        combined_wire_mask = cv2.bitwise_or(combined_wire_mask, m)
        
    kernel_heal = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 21))
    for cname in cleaned_masks:
        m = cleaned_masks[cname]
        healed = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel_heal)
        cleaned_masks[cname] = cv2.bitwise_and(healed, combined_wire_mask)

    clean_grid = _make_mask_grid(cleaned_masks, warped)
    save("3_Morphological_Healing.jpg", clean_grid)

    # ── IMAGE 4: BFS Pathtracing ──────────────────────────────────────────────
    print("Generating Image 4: BFS Pathtracing...")
    bfs_vis = warped.copy()
    pre_merge_connections: Dict[str, List[Tuple]] = {cname: [] for cname in cleaned_masks.keys()}

    for cname, mask in cleaned_masks.items():
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        color = COLORS_BGR.get(cname, (200, 200, 200))

        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            if area < 100:
                continue

            comp_mask = (labels == i).astype(np.uint8)
            pts = np.argwhere(comp_mask > 0)
            if len(pts) == 0:
                continue
            start_pt = (int(pts[0][1]), int(pts[0][0]))

            E1 = _bfs_furthest(comp_mask, start_pt)
            E2 = _bfs_furthest(comp_mask, E1)

            # Draw the blob contour
            contours, _ = cv2.findContours(comp_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(bfs_vis, contours, -1, color, 1)

            # Draw raw BFS endpoints
            cv2.circle(bfs_vis, E1, 5, (0, 255, 255), -1)  # cyan
            cv2.circle(bfs_vis, E2, 5, (0, 255, 255), -1)
            cv2.line(bfs_vis, E1, E2, (0, 255, 255), 1, cv2.LINE_AA)

            pre_merge_connections[cname].append((E1, E2))

    save("4_BFS_Pathtracing.jpg", bfs_vis)

    # ── IMAGE 5: Merging (Intersection Handling) ──────────────────────────────
    print("Generating Image 5: Merging (Intersection Handling)...")
    merge_vis = warped.copy()
    all_connections: List[Tuple] = []

    for cname, conns in pre_merge_connections.items():
        color = COLORS_BGR.get(cname, (200, 200, 200))
        
        # Smart Merge Logic
        smart_merged = True
        while smart_merged:
            smart_merged = False
            for i in range(len(conns)):
                for j in range(i + 1, len(conns)):
                    p1, p2 = conns[i]
                    p3, p4 = conns[j]
                    
                    pairings = [
                        (p1, p2, p3, p4), (p1, p2, p4, p3),
                        (p2, p1, p3, p4), (p2, p1, p4, p3)
                    ]
                    
                    for A, B, C, D in pairings:
                        gap_dist = math.sqrt((B[0]-C[0])**2 + (B[1]-C[1])**2)
                        
                        if gap_dist < 4 * pitch:
                            d_AB = math.sqrt((B[0]-A[0])**2 + (B[1]-A[1])**2)
                            d_CD = math.sqrt((D[0]-C[0])**2 + (D[1]-C[1])**2)
                            d_AD = math.sqrt((D[0]-A[0])**2 + (D[1]-A[1])**2)
                            
                            if abs((d_AB + gap_dist + d_CD) - d_AD) < 0.5 * pitch:
                                conns.pop(j)
                                conns.pop(i)
                                conns.append((A, D))
                                smart_merged = True
                                break
                    if smart_merged: break
        
        # Draw merged lines
        for E1, E2 in conns:
            # Snap to grid to finalize
            if holes:
                H1 = min(holes, key=lambda h: (h[0]-E1[0])**2 + (h[1]-E1[1])**2)
                H2 = min(holes, key=lambda h: (h[0]-E2[0])**2 + (h[1]-E2[1])**2)
                if H1 != H2:
                    all_connections.append((cname, H1, H2))
                    cv2.circle(merge_vis, H1, 6, color, 2)
                    cv2.circle(merge_vis, H2, 6, color, 2)
                    cv2.line(merge_vis, H1, H2, color, 3, cv2.LINE_AA)

    save("5_Merging.jpg", merge_vis)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  DONE — 5 slide images saved to {OUT_DIR}/")
    print(f"{'='*60}\n")


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _bfs_furthest(mask: np.ndarray, start: Tuple[int, int]) -> Tuple[int, int]:
    h, w = mask.shape
    visited = np.zeros((h, w), dtype=bool)
    q = deque([start])
    visited[start[1], start[0]] = True
    last = start
    dx = [-1, 1, 0, 0, -1, -1, 1, 1]
    dy = [0, 0, -1, 1, -1, 1, -1, 1]
    while q:
        x, y = q.popleft()
        last = (x, y)
        for j in range(8):
            nx, ny = x + dx[j], y + dy[j]
            if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] > 0 and not visited[ny, nx]:
                visited[ny, nx] = True
                q.append((nx, ny))
    return last


def _make_mask_grid(masks: Dict[str, np.ndarray], base: np.ndarray) -> np.ndarray:
    """Arrange color masks into a 3x3 grid with text labels for each color."""
    names = list(masks.keys())
    cell_h, cell_w = base.shape[0], base.shape[1]
    sh, sw = cell_h // 3, cell_w // 3
    grid = np.zeros((sh * 3, sw * 3, 3), dtype=np.uint8)

    for idx, cname in enumerate(names[:9]):
        r, c = divmod(idx, 3)
        mask = masks[cname]
        color = COLORS_BGR.get(cname, (200, 200, 200))
        colored = np.zeros((cell_h, cell_w, 3), dtype=np.uint8)
        colored[mask > 0] = color
        small = cv2.resize(colored, (sw, sh))
        cv2.rectangle(small, (0, 0), (sw - 1, sh - 1), (255, 255, 255), 2)
        cv2.putText(small, cname, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        grid[r*sh:(r+1)*sh, c*sw:(c+1)*sw] = small

    return grid


# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    img_path = sys.argv[1] if len(sys.argv) > 1 else "../../test_images/test6.jpeg"
    main(img_path)

