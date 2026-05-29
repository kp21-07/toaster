# Toaster

Toaster is an engineering tool designed to convert physical breadboard photographs into digital SPICE netlists. By utilizing a computer vision pipeline consisting of FastAPI, OpenCV, and YOLO, Toaster detects electronic components and wiring, rendering an interactive virtual breadboard for circuit verification and simulation.

---

## Features

- **Component Detection:** Automates the identification of Resistors, Capacitors, LEDs, Transistors, and Integrated Circuits (ICs) from images.
- **Interactive Virtual Breadboard:** Provides a dynamic user interface to drag, drop, rotate, and edit components to reflect or modify physical layouts.
- **Wire Tracing:** Identifies physical jumper wires and maps their connections directly to the breadboard coordinate grid.
- **SPICE Generation:** Produces simulated netlists (`.cir` files) compatible with LTspice, Ngspice, and other standard solvers.
- **Perspective Calibration:** Includes a 4-point calibration sequence to correct perspective distortion introduced during image capture.

---

## Technical Stack

- **Frontend:** React, TypeScript, Vite, Lucide Icons.
- **Backend:** FastAPI (Python), OpenCV, YOLOv8 (Ultralytics), NumPy.
- **Solver Logic:** Custom graph-based routing and SPICE template engine.

---

## Setup and Installation

### Backend

1. **Prerequisites:** Install [uv](https://astral.sh/uv/) to manage Python packages and environments efficiently.
2. **Installation and Execution:**
   ```bash
   cd backend
   uv sync
   uv run uvicorn app.main:app --reload
   ```
3. **Model Weights:** Place the YOLO model weight files (`best_components.pt`, `best_wires.pt`) in the `backend/weights/` directory.

### Frontend

1. **Prerequisites:** Ensure Node.js (v18 or higher) is installed.
2. **Installation and Execution:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
