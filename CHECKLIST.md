# Toaster QA & Testing Checklist ✅

This document tracks potential bugs, architectural risks, and testing scenarios for the Toaster project.

---

## 🐞 Potential Bugs & Risks

### Frontend
- [ ] **Coordinate Scaling:** Ensure the 928x586 coordinate system remains synchronized between `VirtualBreadboard.tsx` and `cv_engine.py`.
- [ ] **Terminal Assignment:** Manually added components default to `?` terminals. Verify that the Netlist generator handles (or errors on) unassigned terminals gracefully.
- [ ] **State Desync:** Check if `localComponents` and `data.components` ever drift during rapid Undo/Redo actions.
- [ ] **Rotation Snapping:** Verify that rotated components (90°, 270°) snap their pins to the correct row/column holes.

### Backend
- [ ] **Model Loading:** The server fails to start if weights are missing. Add a fallback or clearer error message for missing `.pt` files.
- [ ] **Warping Failures:** If markers aren't found, the "center crop" fallback may produce a 928x586 image that doesn't align with the internal grid.
- [ ] **Color Mask Sensitivity:** Hardcoded HSV ranges for wire detection (especially **Black** and **Yellow**) may fail under warm/cool lighting.
- [ ] **Debug Disk Usage:** `cv2.imwrite` is used for every request. In a production environment, this could fill the disk.

---

## 🧪 Testing Scenarios

### 1. Calibration Wizard
- [x] **Correct Order:** Click corners in TL -> TR -> BR -> BL order. Verify warped image is straight.
- [ ] **Random Order:** Click corners in a random order. Verify if the backend's sorting logic recovers the correct orientation.
- [ ] **Off-Board Clicks:** Click points far outside the breadboard. Verify crop safety bounds.

### 2. Component Recognition
- [ ] **Crowded Board:** Place 5+ resistors in a single column. Check for YOLO "double detections" or misses.
- [ ] **Orientation Test:** Place an IC vertically (spanning the gap) vs. horizontally. Verify terminal mapping.
- [ ] **Unknown Parts:** Upload a photo with a component not in the model (e.g., a Potentiometer). Verify it is either ignored or labeled as "Unknown".

### 3. Wire Tracing
- [ ] **Crossed Wires:** Cross a Red wire over a Blue wire. Verify they are detected as two separate connections.
- [ ] **Wire Color:** Use a color not in the `color_ranges` (e.g., White or Grey). Verify if the YOLO wire model picks it up as a fallback.
- [ ] **Long Wires:** Connect a wire from the far left to the far right. Verify the 90-degree pathing logic.

### 4. Circuit Solver (SPICE)
- [ ] **Manual Edit:** Manually change a Resistor value from `1k` to `10k`. Verify the SPICE `.cir` file updates immediately.
- [ ] **Broken Circuit:** Intentionally leave a component with "Unknown" terminals. Check if the backend returns a valid error or a partial netlist.
- [ ] **Grounding:** Verify that connections to the `Ground-` rail are correctly identified as node `0` in the SPICE output.

### 5. UI/UX
- [ ] **Responsiveness:** Test on a smaller laptop screen. Ensure the "Terminals" list scrollbar works.
- [ ] **Touch/Drag:** Test on a tablet. Ensure components can be dragged smoothly.

---
*Created: May 2026*
