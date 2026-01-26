# Toaster Backend Migration - Technical Specification

## 1. Architecture Overview

Transition from monolithic script-based execution to a service-oriented architecture using FastAPI.

### 1.1 Directory Structure
```text
Toaster/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # [Dev B] FastAPI Entrypoint & Routes
│   │   ├── models.py            # [Dev B] Pydantic Data Contract
│   │   ├── ml_manager.py        # [Dev B] Singleton Model Loader
│   │   ├── cv_engine.py         # [Dev A] Core CV Processing Logic
│   │   └── circuit_solver.py    # [Dev A] Netlist Generation Logic
│   ├── models/
│   │   ├── ComponentDetector.pt
│   │   └── WireEndpointDetector.pt
│   └── requirements.txt
```

---

## 2. Developer Responsibilities

### 2.1 Developer A: Core Logic (Algorithms)
**Objective**: Decouple logic from I/O and CLI interactions. Refactor into pure functions.

#### Task A1: Computer Vision Engine (`cv_engine.py`)
*   **Refactoring**: Migrate logic from `api.py`.
*   **Requirements**:
    *   Accept in-memory image data (numpy array/bytes) instead of file paths.
    *   Remove global `YOLO` model initialization; accept model instance as argument.
    *   Extract configuration usage (magic numbers) to constants.
    *   **Function Signature**: `detect_breadboard(image_bytes, model) -> warped_image`

#### Task A2: Circuit Solver (`circuit_solver.py`)
*   **Refactoring**: Migrate logic from `app.py`.
*   **Requirements**:
    *   Decouple from `print()` and `input()` statements.
    *   Implement robust node mapping algorithms.
    *   **Function Signature**: `generate_netlist(components, wires, grounds, power_sources) -> spice_string`

### 2.2 Developer B: Systems Engineering (API & Infrastructure)
**Objective**: Establish API surface, data validation, and resource management.

#### Task B1: API & Data Modeling (`main.py`, `models.py`)
*   **Framework**: FastAPI.
*   **Data Contracts (Pydantic)**:
    *   `Component`: id, type, spec, bounding_box, electrical_nodes.
    *   `Wire`: endpoints, electrical_nodes.
    *   `AnalysisResponse`: List[Component], List[Wire].
    *   `NetlistRequest`: Validated components and connections.

#### Task B2: ML Model Management (`ml_manager.py`)
*   **Pattern**: Singleton.
*   **Requirements**:
    *   Load PyTorch models (`ComponentDetector.pt`, `WireEndpointDetector.pt`) only once at startup.
    *   Provide thread-safe access to predictors.

#### Task B3: Endpoint Implementation (`main.py`)
*   **`POST /analyze`**:
    *   Input: `multipart/form-data` (Image).
    *   Flow: Receive Image -> `ml_manager` -> `cv_engine` -> Return JSON.
*   **`POST /netlist`**:
    *   Input: `application/json` (Confirmed Circuit Data).
    *   Flow: Validate JSON -> `circuit_solver` -> Return SPICE Text.

---

## 3. Migration Phases

1.  **Scaffolding**: Create directory structure and `requirements.txt`.
2.  **Core Logic Migration**: Dev A refactors `api.py` -> `cv_engine.py`.
3.  **API Construction**: Dev B implements `main.py` stubs and `models.py`.
4.  **Integration**: Wire `cv_engine` into `main.py` endpoints.
