# Toaster 🍞

**Toaster** is an AI-powered tool that converts physical breadboard photos into digital SPICE netlists. It uses Computer Vision (FastAPI + OpenCV + YOLO) to detect components and wires, providing an interactive virtual breadboard for circuit verification and simulation.

---

## 🚀 Features

- **AI Detection:** Automatically identifies Resistors, Capacitors, LEDs, Transistors, and ICs from a photo.
- **Interactive Virtual Breadboard:** Drag, drop, rotate, and edit components to match your physical layout.
- **Smart Wire Tracing:** Detects jumper wires and maps them to the breadboard grid.
- **SPICE Generation:** Instantly generates a `.cir` netlist compatible with LTSpice, NGSpice, and other solvers.
- **Calibration Wizard:** Simple 4-point calibration to correct perspective distortion from any camera angle.

---

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, Vite, Lucide Icons.
- **Backend:** FastAPI (Python), OpenCV, YOLOv8 (Ultralytics), NumPy.
- **Solver Logic:** Custom graph-based routing and SPICE template engine.

---

## 📦 Setup & Installation

### Backend
1. **Prerequisites:** Install [uv](https://astral.sh/uv/) for high-performance package management.
2. **Install & Run:**
   ```bash
   cd backend
   uv sync
   uv run uvicorn app.main:app --reload
   ```
3. **Weights:** Place your YOLO models (`best_components.pt`, `best_wires.pt`) in `backend/weights/`.

### Frontend
1. **Prerequisites:** Node.js (v18+).
2. **Install & Run:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
