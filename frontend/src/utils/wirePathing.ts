import type { CircuitComponent } from '../types';
import { pitch, paddingX, paddingY } from './breadboardMath';
import { getFootprint, normaliseComponent } from './componentFootprints';

/**
 * Checks if a line segment (p1 -> p2) intersects a bounding box.
 * Only handles axis-aligned segments (Manhattan).
 */
function intersectsComponent(p1: [number, number], p2: [number, number], components: CircuitComponent[]): boolean {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const padding = 2; // Small padding for the collision

    for (const rawComp of components) {
        const comp = normaliseComponent(rawComp);
        const fp = getFootprint(comp.type);
        
        const spanPx = (comp.span ?? fp.defaultSpan) * pitch;
        const bodyW = spanPx * fp.bodyRatio;
        const pin1x = paddingX + (comp.col ?? 0) * pitch;
        const pin1y = paddingY + (comp.row ?? 0) * pitch;
        
        const cx = pin1x + spanPx / 2;
        const cy = pin1y;
        const hPx = 20;
        
        const minX = cx - bodyW / 2 - padding;
        const maxX = cx + bodyW / 2 + padding;
        const minY = cy - hPx / 2 - padding;
        const maxY = cy + hPx / 2 + padding;

        if (x1 === x2) { // Vertical segment
            const segMinY = Math.min(y1, y2);
            const segMaxY = Math.max(y1, y2);
            if (x1 >= minX && x1 <= maxX) {
                if (!(segMaxY < minY || segMinY > maxY)) return true;
            }
        } else if (y1 === y2) { // Horizontal segment
            const segMinX = Math.min(x1, x2);
            const segMaxX = Math.max(x1, x2);
            if (y1 >= minY && y1 <= maxY) {
                if (!(segMaxX < minX || segMinX > maxX)) return true;
            }
        }
    }
    return false;
}

/**
 * Converts a sparse list of points into a 90-degree Manhattan path.
 * Currently optimized for 2-point wires (Standard).
 */
export function manhattanize(points: number[][], components: CircuitComponent[]): number[][] {
    if (points.length < 2) return points;

    const result: number[][] = [points[0]];
    
    for (let i = 0; i < points.length - 1; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[i + 1];

        if (x1 === x2 || y1 === y2) {
            result.push([x2, y2]);
            continue;
        }

        // Option A: Horizontal then Vertical
        const midA: [number, number] = [x2, y1];
        // Option B: Vertical then Horizontal
        const midB: [number, number] = [x1, y2];

        const hitA = intersectsComponent([x1, y1], midA, components) || intersectsComponent(midA, [x2, y2], components);
        const hitB = intersectsComponent([x1, y1], midB, components) || intersectsComponent(midB, [x2, y2], components);

        if (!hitA) {
            result.push(midA, [x2, y2]);
        } else if (!hitB) {
            result.push(midB, [x2, y2]);
        } else {
            // Both L-shapes hit. Try Z-shapes with multiple offsets.
            const offsets = [pitch, -pitch, pitch * 2, -pitch * 2, pitch * 3, -pitch * 3];
            let doglegSuccess = false;
            
            for (const offset of offsets) {
                const mid1: [number, number] = [x1, y1 + offset];
                const mid2: [number, number] = [x2, y1 + offset];
                
                const hitZ = intersectsComponent([x1, y1], mid1, components) || 
                             intersectsComponent(mid1, mid2, components) || 
                             intersectsComponent(mid2, [x2, y2], components);
                
                if (!hitZ) {
                    result.push(mid1, mid2, [x2, y2]);
                    doglegSuccess = true;
                    break;
                }
            }
            
            if (!doglegSuccess) {
                // Last resort: simple L-shape (Option A) despite collision
                result.push(midA, [x2, y2]);
            }
        }
    }

    // Filter out redundant consecutive points to prevent zero-length segments
    return result.filter((p, idx) => {
        if (idx === 0) return true;
        const prevP = result[idx - 1];
        return Math.abs(p[0] - prevP[0]) > 0.01 || Math.abs(p[1] - prevP[1]) > 0.01;
    });
}

/**
 * Generates an SVG path string with rounded corners and gravity sag.
 */
export function generateVisualPath(points: number[][]): string {
    if (points.length < 2) return "";

    const targetRadius = 13;
    let path = `M ${points[0][0]} ${points[0][1]}`;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];

        const dx = curr[0] - prev[0];
        const dy = curr[1] - prev[1];
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.001) continue; // Skip redundant points

        // Determine actual radius available for this segment
        // It can't be more than half the segment length
        const actualRadius = Math.min(targetRadius, dist / 2);

        let startX = prev[0] + (dx / dist) * (i > 1 ? actualRadius : 0);
        let startY = prev[1] + (dy / dist) * (i > 1 ? actualRadius : 0);
        let endX = curr[0] - (dx / dist) * (next ? actualRadius : 0);
        let endY = curr[1] - (dy / dist) * (next ? actualRadius : 0);

        // Transition to the start of this straight segment if needed 
        // (usually cursor is already there from previous Q)
        if (i > 1) {
            path += ` L ${startX} ${startY}`;
        }

        // Add segment (with sag if horizontal and long)
        const isHorizontal = Math.abs(dy) < 0.1;
        if (isHorizontal && dist > 28) {
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2 + 4; // 4px sag
            path += ` Q ${midX} ${midY} ${endX} ${endY}`;
        } else {
            path += ` L ${endX} ${endY}`;
        }

        // Add corner curve if there's a next point
        if (next) {
            const nextDx = next[0] - curr[0];
            const nextDy = next[1] - curr[1];
            const nextDist = Math.sqrt(nextDx * nextDx + nextDy * nextDy);
            
            if (nextDist > 0.001) {
                const nextRadius = Math.min(targetRadius, nextDist / 2);
                const cornerEndX = curr[0] + (nextDx / nextDist) * nextRadius;
                const cornerEndY = curr[1] + (nextDy / nextDist) * nextRadius;
                path += ` Q ${curr[0]} ${curr[1]} ${cornerEndX} ${cornerEndY}`;
            }
        }
    }

    return path;
}
