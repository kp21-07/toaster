// Basic Geometry
export interface Point {
    x: number;
    y: number;
}

// Bounding Box (list of corners)
export type BoundingBox = Point[];

// Component detected by CV
export interface DetectedComponent {
    id: number;
    label: string;
    box: BoundingBox;
    confidence: number;
}

// Final Circuit Component (for SPICE)
export interface CircuitComponent {
    id: number;
    type: string;
    name: string;
    terminals: string[];
    value: string;

    // Grid-native position — the source of truth for rendering
    col?: number;    // anchor column index (left pin for horizontal, top pin for vertical)
    row?: number;    // anchor row index
    span?: number;   // number of holes the component spans (e.g. 3 for a standard resistor)

    // Legacy: pixel bounding box from CV output. Used only for one-time migration to col/row/span.
    box?: number[][];
    rotation?: number;
}

// Wire
export interface Wire {
    id: number;
    color: string;
    endpoints: string[];
    points?: number[][];
}

// API Response
export interface AnalysisResponse {
    components: CircuitComponent[];
    wires: Wire[];
    grey_codes: any[]; // Anchors list
    netlist: string;
    detected_corners?: number[][] | null;
    annotated_image?: string | null;
    warped_image?: string | null;
}

export interface VerificationResponse {
    is_matched: boolean;
    report: any;
}
