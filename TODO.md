# Toaster Project Roadmap 🚀

This list tracks the remaining tasks and features for the Toaster project.

## 🔴 Critical & Core Logic
- [ ] **Graph Isomorphism Check:** Implement an algorithm to compare the *detected* physical circuit graph against a *user-defined* intended schematic to verify correctness.
- [ ] **Wire Pathing Improvement:** Refine CV wire detection to consistently output 90-degree orthogonal paths for cleaner virtual representation.
- [ ] **Component Pin Verification:** Improve accuracy of terminal label mapping (e.g., ensuring Base/Collector/Emitter are correctly identified for all transistor packages).

## 🟡 Backend & ML
- [ ] **Model Retraining:** Improve YOLOv8 models for better detection of small components and overlapping wires in poor lighting.
- [ ] **Auto-Value Detection:** Attempt to read resistor color bands or IC text markings using secondary OCR/Color models.

## 🟢 Frontend & UI
- [ ] **Visual Realism:** Replace generic component boxes with realistic SVG icons (resistors with bands, LEDs that glow).
- [ ] **Z-Index Layering:** Implement better layering so wires always appear "above" components but "under" floating labels.

## 🔵 DevOps & Deployment
- [ ] **Dockerization:** Create a multi-stage Dockerfile for the full-stack app.
- [ ] **API Hardening:** Add request validation and rate limiting.

---
*Last updated: May 2026*
