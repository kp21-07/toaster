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
    """Burn a bold label into the top-left or bottom-left corner."""
    overlay = img.copy()
    h, w = img.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale, thick = 0.7, 2
    (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
    pad = 10
    if pos == "tl":
        cv2.rectangle(overlay, (0, 0), (tw + pad * 2, th + pad * 2), (0, 0, 0), -1)
        cv2.putText(overlay, text, (pad, th + pad), font, scale, (255, 255, 255), thick)
    else:
        y0 = h - th - pad * 2
        cv2.rectangle(overlay, (0, y0), (tw + pad * 2, h), (0, 0, 0), -1)
        cv2.putText(overlay, text, (pad, h - pad), font, scale, (255, 255, 255), thick)
    return cv2.addWeighted(overlay, 0.85, img, 0.15, 0)


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
    print(f"  Toaster Slide Visual Generator")
    print(f"  Input: {image_path}  ({image.shape[1]}x{image.shape[0]})")
    print(f"  Output: {OUT_DIR}/")
    print(f"{'='*60}\n")

    # ── STEP 0: Original image ────────────────────────────────────────────────
    save("00_original.jpg", add_label(image, "Original Photo"))

    # ── STEP 1: Perspective warp ──────────────────────────────────────────────
    print("[1/9] Detecting markers & warping...")
    warped, corners = detect_and_warp(image)

    # Draw detected corners on original
    corner_vis = image.copy()
    labels = ["TL", "TR", "BR", "BL"]
    for i, (cx, cy) in enumerate(corners):
        pt = (int(cx), int(cy))
        cv2.circle(corner_vis, pt, 12, (0, 255, 0), 3)
        cv2.putText(corner_vis, labels[i], (pt[0]+15, pt[1]+5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    # Draw polygon
    pts_arr = np.array(corners, dtype=np.int32)
    cv2.polylines(corner_vis, [pts_arr], True, (0, 255, 0), 2)
    save("01_corners_detected.jpg", add_label(corner_vis, "Corner Markers Detected"))
    save("02_warped.jpg", add_label(warped, "Perspective-Corrected (928x586)"))

    # ── STEP 2: Mathematical grid ─────────────────────────────────────────────
    print("[2/9] Generating mathematical grid...")
    holes, pitch, padX, padY = detect_holes(warped)

    grid_vis = warped.copy()
    for (hx, hy) in holes:
        cv2.circle(grid_vis, (hx, hy), 2, (0, 255, 0), -1)
    save("03_grid_holes.jpg", add_label(grid_vis, f"Mathematical Grid ({len(holes)} holes)"))

    # ── STEP 3: YOLO component detection ──────────────────────────────────────
    print("[3/9] Running YOLO component detection...")
    comp_model_path = "weights/best_components.pt"
    wire_model_path = "weights/best_wires.pt"
    try:
        ml_engine.load_models(comp_model_path, wire_model_path)
    except Exception as e:
        print(f"  ⚠ Model loading failed: {e}")
        print("  Continuing without YOLO — component steps will be skipped.")
        raw_components = []

    try:
        comp_model = ml_engine.get_component_model()
        raw_components = detect_components(warped, comp_model)
    except Exception:
        raw_components = []

    comp_vis = warped.copy()
    for _, class_name, coords in raw_components:
        pts = np.array(coords, np.int32).reshape((-1, 1, 2))
        cv2.polylines(comp_vis, [pts], True, (0, 0, 255), 2)
        cx = int(np.mean([c[0] for c in coords]))
        cy = int(np.mean([c[1] for c in coords])) - 10
        cv2.putText(comp_vis, class_name, (cx - 20, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    save("04_yolo_components.jpg",
         add_label(comp_vis, f"YOLO Detection ({len(raw_components)} components)"))

    # ── STEP 4: Component masking ─────────────────────────────────────────────
    print("[4/9] Masking component regions...")
    masked_vis = warped.copy()
    for _, name, coords in raw_components:
        if name.lower() == "breadboard":
            continue
        pts = np.array(coords, np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(masked_vis, [pts], (0, 0, 0))
    save("05_component_masked.jpg",
         add_label(masked_vis, "Component Bodies Masked Black"))

    # ── STEP 5: HSV color segmentation (per-color masks) ──────────────────────
    print("[5/9] HSV color segmentation...")
    hsv = cv2.cvtColor(masked_vis, cv2.COLOR_BGR2HSV)
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

    # Save raw HSV masks
    raw_grid = _make_mask_grid(raw_masks, warped, "Raw HSV")
    save("06_hsv_raw_masks.jpg", add_label(raw_grid, "Raw HSV Color Masks"))

    # ── STEP 6: Morphological cleanup ─────────────────────────────────────────
    print("[6/9] Morphological cleanup (open + cross-close)...")
    cleaned_masks = {}
    for cname, mask in raw_masks.items():
        m = mask.copy()
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3,3), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE,
                             cv2.getStructuringElement(cv2.MORPH_CROSS, (15,15)))
        # Border crop
        m[0:25, :] = 0; m[-25:, :] = 0; m[:, 0:25] = 0; m[:, -25:] = 0
        cleaned_masks[cname] = m

    clean_grid = _make_mask_grid(cleaned_masks, warped, "Cleaned")
    save("07_morphology_cleaned.jpg",
         add_label(clean_grid, "After Morphological Open + Cross-Close"))

    # Overlay active masks on the warped image
    overlay_vis = warped.copy()
    for cname, mask in cleaned_masks.items():
        if cv2.countNonZero(mask) == 0:
            continue
        color = COLORS_BGR.get(cname, (200, 200, 200))
        color_layer = np.zeros_like(overlay_vis)
        color_layer[:] = color
        blended = cv2.addWeighted(overlay_vis, 0.4, color_layer, 0.6, 0)
        overlay_vis[mask > 0] = blended[mask > 0]
    save("08_masks_overlay.jpg",
         add_label(overlay_vis, "All Color Masks Overlaid"))

    # ── STEP 7: BFS endpoint extraction ───────────────────────────────────────
    print("[7/9] BFS endpoint extraction...")
    bfs_vis = warped.copy()
    all_connections: List[Tuple] = []  # (color, H1, H2)

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

            # Snap to grid
            if holes:
                H1 = min(holes, key=lambda h: (h[0]-E1[0])**2 + (h[1]-E1[1])**2)
                H2 = min(holes, key=lambda h: (h[0]-E2[0])**2 + (h[1]-E2[1])**2)
                if H1 != H2:
                    all_connections.append((cname, H1, H2))

    save("09_bfs_endpoints.jpg",
         add_label(bfs_vis, "BFS Endpoints (cyan dots) on Blobs"))

    # ── STEP 8: Grid snapping ─────────────────────────────────────────────────
    print("[8/9] Grid snapping...")
    snap_vis = warped.copy()
    # Draw grid lightly
    for (hx, hy) in holes:
        cv2.circle(snap_vis, (hx, hy), 1, (0, 100, 0), -1)

    hole_labels = map_to_breadboard_ids(holes, pitch, padX, padY)
    hole_to_label = {holes[i]: hole_labels[i] for i in range(len(holes))}

    for cname, H1, H2 in all_connections:
        color = COLORS_BGR.get(cname, (200, 200, 200))
        cv2.circle(snap_vis, H1, 6, color, 2)
        cv2.circle(snap_vis, H2, 6, color, 2)
        cv2.line(snap_vis, H1, H2, color, 2, cv2.LINE_AA)

        l1 = hole_to_label.get(H1, "?")
        l2 = hole_to_label.get(H2, "?")
        mid = ((H1[0]+H2[0])//2, (H1[1]+H2[1])//2 - 8)
        cv2.putText(snap_vis, f"{l1} <-> {l2}", mid,
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)

    save("10_grid_snapped.jpg",
         add_label(snap_vis, f"Snapped to Grid ({len(all_connections)} wires)"))

    # ── STEP 9: Final result ──────────────────────────────────────────────────
    print("[9/9] Compositing final result...")
    final = warped.copy()
    # Grid holes
    for (hx, hy) in holes:
        cv2.circle(final, (hx, hy), 1, (0, 80, 0), -1)
    # Components
    for _, class_name, coords in raw_components:
        pts = np.array(coords, np.int32).reshape((-1, 1, 2))
        cv2.polylines(final, [pts], True, (255, 200, 0), 2)
        cx = int(np.mean([c[0] for c in coords]))
        cy = int(np.mean([c[1] for c in coords])) - 8
        cv2.putText(final, class_name, (cx - 20, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 200, 0), 1)
    # Wires with labels
    for cname, H1, H2 in all_connections:
        color = COLORS_BGR.get(cname, (200, 200, 200))
        cv2.line(final, H1, H2, color, 3, cv2.LINE_AA)
        cv2.circle(final, H1, 5, (255, 255, 255), -1)
        cv2.circle(final, H2, 5, (255, 255, 255), -1)
        cv2.circle(final, H1, 5, color, 2)
        cv2.circle(final, H2, 5, color, 2)

    save("11_final_result.jpg",
         add_label(final, f"Final Result: {len(raw_components)} Components, {len(all_connections)} Wires"))

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  DONE — {len(os.listdir(OUT_DIR))} images saved to {OUT_DIR}/")
    print(f"  Components detected: {len(raw_components)}")
    print(f"  Wire connections:    {len(all_connections)}")
    for cname, H1, H2 in all_connections:
        l1 = hole_to_label.get(H1, "?")
        l2 = hole_to_label.get(H2, "?")
        print(f"    [{cname:>6}] {l1} <-> {l2}")
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


def _make_mask_grid(masks: Dict[str, np.ndarray], base: np.ndarray, title: str) -> np.ndarray:
    """Arrange color masks into a 3x3 labeled grid for a single output image."""
    names = list(masks.keys())
    cell_h, cell_w = base.shape[0], base.shape[1]
    # Scale down each cell to 1/3 size
    sh, sw = cell_h // 3, cell_w // 3
    grid = np.zeros((sh * 3, sw * 3, 3), dtype=np.uint8)

    for idx, cname in enumerate(names[:9]):
        r, c = divmod(idx, 3)
        mask = masks[cname]
        # Colorize the mask
        color = COLORS_BGR.get(cname, (200, 200, 200))
        colored = np.zeros((cell_h, cell_w, 3), dtype=np.uint8)
        colored[mask > 0] = color
        small = cv2.resize(colored, (sw, sh))
        # Label
        cv2.putText(small, cname, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        grid[r*sh:(r+1)*sh, c*sw:(c+1)*sw] = small

    return grid


# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    img_path = sys.argv[1] if len(sys.argv) > 1 else "../../test_images/test6.jpeg"
    main(img_path)
