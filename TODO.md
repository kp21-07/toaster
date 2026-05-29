# Toaster Project Roadmap

This document outlines the remaining development objectives, features, and resolved/unresolved issues for the Toaster project.

## Core Logic and Verification

- [x] **Circuit Verification Engine:** Implement a backend comparison route to analyze isomorphic graphs between detected and reference netlists.
- [x] **SPICE Solver Integration:** Automatically build electrical node maps and export standard `.cir` netlist payloads.
- [x] **Graph Isomorphism Check:** Implement an algorithm to compare the detected physical circuit graph against a user-defined intended schematic to verify correctness.
- [x] **Wire Pathing Improvement:** Refine CV wire detection to consistently output 90-degree orthogonal paths for cleaner virtual representation.
- [ ] **Component Pin Verification:** Improve accuracy of terminal label mapping (e.g., ensuring Base/Collector/Emitter are correctly identified for all transistor packages).

## Machine Learning and Backend

- [x] **Component Detection Pipeline:** Load and run YOLOv8 object detection to locate capacitors, resistors, LEDs, and IC packages.
- [x] **Computer Vision Wire Segmentation:** Extract and isolate jumper wires from physical boards using adaptive HSV color space filters and morphological operations.
- [x] **Graph-Based BFS Path Tracing:** Run Breadth-First Search on connected color components to resolve wire terminal points on the coordinate grid.
- [ ] **Model Retraining:** Improve YOLOv8 model for better detection of small components and overlapping wires in poor lighting.
- [ ] **Auto-Value Detection:** Attempt to read resistor color bands or IC text markings using secondary OCR/Color models.

## Frontend and User Interface

- [x] **Interactive Virtual Breadboard Canvas:** Render a dynamic grid-snapping virtual board supporting component dragging, manual additions, and wire drawings.
- [x] **Undo / Redo Navigation:** Track user canvas edits with a full keyboard-accessible (`Ctrl+Z` / `Ctrl+Y`) historic state stack.
- [x] **Calibration and Perspective Cropper:** Introduce a 4-point orthorectification sequence to calibrate physical photos onto the virtual grid coordinates.
- [ ] **Visual Realism:** Replace generic component boxes with realistic SVG icons (resistors with bands, LEDs that glow).
- [ ] **Z-Index Layering:** Implement better layering so wires always appear above components but under floating labels.

## Operations and Deployment

- [x] **Local Mock Testing Suites:** Provide quick-load JSON templates for standard circuits (series LEDs, RC filters, voltage dividers) to debug UI rendering instantly.
- [ ] **Dockerization:** Create a multi-stage Dockerfile for the full-stack app.
- [ ] **API Hardening:** Add request validation and rate limiting.

## Identified Bugs

- [ ] **Incorrect IC & Rotated Component Auto-Routing:**
  - **Issue:** In the frontend, the auto-router in `breadboardRouter.ts` uses a custom `getComponentPinPixels` function that is limited to 3 pins and ignores component rotations. This causes DIP ICs and rotated parts to map incorrect coordinates or truncate pins during netlist generation.
  - **Fix Required:** Import and utilize the correct, existing `getGridPinPixels` function from `componentFootprints.ts` instead.
- [ ] **Unused Netlist Ground Normalization Function:**
  - **Issue:** The `normalize_node` helper function in `spice_parser.py` is defined but never called in the netlist parsing pipeline. 
  - **Fix Required:** Apply `normalize_node` to standardize all input ground references (like `GND` or `gnd`) to `'0'`, preventing false failures during graph isomorphism verification.
- [ ] **Non-Standard SPICE LED Primitive Prefix:**
  - **Issue:** The circuit solver maps LED components to the custom prefix `LED` (e.g. `LED1`) in generated `.cir` files. This is not recognized by standard SPICE engines (which require `D` for diodes/LEDs or `X` for subcircuits).
  - **Fix Required:** Map LED components to the standard `D` prefix or format as subcircuits to prevent syntax errors in simulators.
- [ ] **Missing Diode Pin Role Definition:**
  - **Issue:** In `graph_utils.py`, `CircuitGraphBuilder` explicitly sets pin roles for `led` (`anode`/`cathode`), but omits setting roles for `diode` types.
  - **Fix Required:** Map standard diodes to explicit `anode` and `cathode` pin roles to prevent mismatched isomorphic comparisons.

---
*Last updated: May 29, 2026*
