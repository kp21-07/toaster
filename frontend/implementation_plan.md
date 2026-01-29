# Frontend Implementation Plan (Toaster)

## Goal
Build a modern, responsive web interface for **Toaster** that allows users to upload breadboard images and view the generated SPICE netlist and circuit analysis.

## Tech Stack
*   **Build Tool**: Vite (Fast, modern)
*   **Framework**: React (TypeScript)
*   **Styling**: Vanila CSS
*   **State/Data Fetching**: TanStack Query (React Query) + Axios
*   **Icons**: Lucide React

## User Flow
1.  **Landing**: User sees a clean "Upload" area.
2.  **Action**: User drags & drops a breadboard image or selects a file.
3.  **Processing**: Show a loading state/skeleton while the Backend processes the image.
4.  **Result**:
    *   **Split View**:
        *   **Left**: Original Image with interactive overlays (bounding boxes for components/wires).
        *   **Right**: Generated SPICE Netlist (editable/copyable) and a list of detected components.

## Architecture

### Directory Structure
```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/             # Reusable UI atoms (Button, Card, Input)
│   │   ├── UploadArea.tsx  # Drag & drop zone
│   │   ├── ResultsView.tsx # Container for results
│   │   ├── NetlistViewer.tsx # Code block display for SPICE
│   │   └── ImageOverlay.tsx # Canvas/SVG overlay for bbox visualization
│   ├── api/
│   │   └── client.ts       # Axios instance & API functions
│   ├── App.tsx             # Main layout & router
│   └── main.tsx            # Entry point
```

### Data Types (Matching Backend)
*   `AnalysisResponse`
*   `CircuitComponent`
*   `Wire`

## Step-by-Step Implementation

### Phase 1: Setup & Scaffolding
- [ ] Initialize Vite project: `npm create vite@latest . -- --template react-ts`
- [ ] Install dependencies: `npm install axios @tanstack/react-query clsx lucide-react`
- [ ] Configure Proxy (vite.config.ts) to forward `/api` to `http://localhost:8000`.

### Phase 2: Core Components
- [ ] **UploadArea**: Create a drag-and-drop file input component.
- [ ] **API Client**: Setup `analyzeImage` function connecting to `POST /analyze-image`.
- [ ] **State**: Setup React Query mutation for the upload action.

### Phase 3: Results Display
- [ ] **NetlistViewer**: Create a polished code block component to display the string output.
- [ ] **ComponentList**: A structured list/table showing detected parts (Resistors, LEDs, etc.).
- [ ] **Main Layout**: Assemble the "Upload" and "Results" states in `App.tsx`.

### Phase 4: Polish (Bonus)
- [ ] **Image Overlays**: Use the `box` coordinates from the backend to draw SVG rectangles over the uploaded image to show what was detected.
- [ ] **Error Handling**: Graceful error messages if the backend rejects the image.
