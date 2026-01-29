# Toaster Project

## Backend Setup

The backend is built with FastAPI and utilizes `uv` for high-performance Python package management.

### Prerequisites

- **uv**: An extremely fast Python package installer and resolver.
  - Install via curl: `curl -LsSf https://astral.sh/uv/install.sh | sh`
  - Or via pip: `pip install uv`
  - For more installation methods, visit [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/)

### Installation & Running

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Sync dependencies:**
   This command creates the virtual environment and installs all locked dependencies.
   ```bash
   uv sync
   ```

3. **Run the server:**
   Start the backend server with hot-reloading enabled.
   ```bash
   uv run uvicorn app.main:app --reload
   ```

   The API will be available at `http://localhost:8000`.
   API Documentation (Swagger UI) is available at `http://localhost:8000/docs`.

### Specific Notes
- **Weights**: Ensure model weights (`best_components.pt`, `best_wires.pt`) are present in the `backend/weights/` directory.
- **Python Version**: This project requires Python 3.12+ (managed automatically by `uv`).
