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
    box?: number[][];
}

// Wire
export interface Wire {
    id: number;
    color: string;
    endpoints: string[];
}

// API Response
export interface AnalysisResponse {
    components: CircuitComponent[];
    wires: Wire[];
    netlist: string;
    annotated_image?: string | null;
    warped_image?: string | null;
}
