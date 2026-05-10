import { pitch, paddingX, paddingY, pixelXToCol, pixelYToRowIndex } from './breadboardMath';
import type { CircuitComponent } from '../types';

// ─── Footprint Definitions ────────────────────────────────────────────────────

export interface Footprint {
  /** How many holes the component spans by default (from pin1 to pin2) */
  defaultSpan: number;
  /** Fraction of span occupied by the body (the rest are wire leads) */
  bodyRatio: number;
  /** Number of pins */
  pins: number;
  /** Is this a Dual In-line Package (DIP) that straddles the trench? */
  isDIP?: boolean;
  /** Min / max allowed span when the user stretches leads */
  minSpan: number;
  maxSpan: number;
  /** Body fill colour for the visual */
  bodyColor: string;
  /** Stripe colours for resistors (null = no stripes) */
  stripes?: string[];
}

export const FOOTPRINTS: Record<string, Footprint> = {
  resistor: {
    defaultSpan: 4,
    bodyRatio: 0.45,
    pins: 2,
    minSpan: 2,
    maxSpan: 10,
    bodyColor: '#d4a76a',        // tan ceramic
    stripes: ['#1a1a1a', '#ef4444', '#f59e0b'],
  },
  capacitor: {
    defaultSpan: 3,
    bodyRatio: 0.4,
    pins: 2,
    minSpan: 2,
    maxSpan: 8,
    bodyColor: '#60a5fa',        // light blue
  },
  led: {
    defaultSpan: 3,
    bodyRatio: 0.38,
    pins: 2,
    minSpan: 2,
    maxSpan: 6,
    bodyColor: '#f87171',        // red (will be overridden by LED color if known)
  },
  diode: {
    defaultSpan: 3,
    bodyRatio: 0.38,
    pins: 2,
    minSpan: 2,
    maxSpan: 6,
    bodyColor: '#64748b',        // grey glass
  },
  transistor: {
    defaultSpan: 3,             // all 3 pins in a row, 1 hole apart
    bodyRatio: 0.5,
    pins: 3,
    minSpan: 2,
    maxSpan: 6,
    bodyColor: '#1e293b',        // black plastic TO-92
  },
  voltage_source: {
    defaultSpan: 5,
    bodyRatio: 0.5,
    pins: 2,
    minSpan: 3,
    maxSpan: 10,
    bodyColor: '#16a34a',        // green battery
  },
  ic: {
    defaultSpan: 6, // 14 pins = 7 per side = 6 pitch gaps
    bodyRatio: 0.95,
    pins: 14,
    minSpan: 6,
    maxSpan: 6,
    bodyColor: '#1e293b',
    isDIP: true,
  },
  ic_dip8: {
    defaultSpan: 3, // 8 pins = 4 per side = 3 pitch gaps
    bodyRatio: 0.95,
    pins: 8,
    minSpan: 3,
    maxSpan: 3,
    bodyColor: '#1e293b',
    isDIP: true,
  },
};

export const getFootprint = (type: string): Footprint =>
  FOOTPRINTS[type] ?? FOOTPRINTS['resistor'];

// ─── Box → Grid Converter ─────────────────────────────────────────────────────
// Used once on load for components that came from the CV backend (have box but no col/row/span).

export function boxToGrid(box: number[][], type: string): { col: number; row: number; span: number } {
  const xs = box.map(p => p[0]);
  const ys = box.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

  // The "lead tips" extend 20px beyond the box edge (same as getComponentTips in VirtualBreadboard)
  const leftTipX = minX - 20;
  const rightTipX = maxX + 20;

  const col = pixelXToCol(leftTipX);
  const row = pixelYToRowIndex(centerY);
  const rawSpan = Math.round((rightTipX - leftTipX) / pitch);
  const fp = getFootprint(type);
  const span = Math.max(fp.minSpan, Math.min(fp.maxSpan, rawSpan));

  return { col, row, span };
}

// ─── Component Normaliser ─────────────────────────────────────────────────────
// Ensures every component has col/row/span, migrating from box if needed.

export function normaliseComponent(c: CircuitComponent): CircuitComponent {
  const normalizedType = c.type.toLowerCase();
  
  if (c.col !== undefined && c.row !== undefined && c.span !== undefined) {
    return { ...c, type: normalizedType };
  }

  if (c.box && c.box.length >= 2) {
    const { col, row, span } = boxToGrid(c.box, normalizedType);
    return { ...c, type: normalizedType, col, row, span };
  }

  // Absolute fallback: place at a sensible default spot
  const fp = getFootprint(normalizedType);
  return { ...c, type: normalizedType, col: 10, row: 6, span: fp.defaultSpan };
}

// ─── Terminal Computation ─────────────────────────────────────────────────────
// Given grid position, compute the pixel (x,y) of each pin tip — used by routing.

export function getGridPinPixels(
  col: number,
  row: number,
  span: number,
  rotation: number,
  pins: number,
  isDIP: boolean = false
): { x: number; y: number }[] {
  const actualSpan = isDIP ? Math.floor(pins / 2) - 1 : span;
  const rad = (rotation * Math.PI) / 180;

  if (isDIP) {
    const cx = paddingX + col * pitch + (actualSpan / 2) * pitch;
    const cy = paddingY + row * pitch + 1.5 * pitch;
    const res: { x: number; y: number }[] = [];
    const pinsPerSide = Math.floor(pins / 2);
    const startX = -(actualSpan / 2) * pitch;
    
    const rot = (ox: number, oy: number) => ({
      x: cx + ox * Math.cos(rad) - oy * Math.sin(rad),
      y: cy + ox * Math.sin(rad) + oy * Math.cos(rad),
    });
    
    // Bottom row pins (1 to N/2) - reading left to right
    for (let i = 0; i < pinsPerSide; i++) {
      res.push(rot(startX + i * pitch, 1.5 * pitch));
    }
    // Top row pins (N/2 + 1 to N) - reading right to left
    for (let i = pinsPerSide - 1; i >= 0; i--) {
      res.push(rot(startX + i * pitch, -1.5 * pitch));
    }
    return res;
  }

  // Standard components pivot around Pin 1 at (col, row)
  const p1X = paddingX + col * pitch;
  const p1Y = paddingY + row * pitch;
  const p2X = p1X + actualSpan * pitch * Math.cos(rad);
  const p2Y = p1Y + actualSpan * pitch * Math.sin(rad);

  if (pins === 2) {
    return [{ x: p1X, y: p1Y }, { x: p2X, y: p2Y }];
  }
  
  if (pins === 3) {
    const midX = (p1X + p2X) / 2;
    const midY = (p1Y + p2Y) / 2;
    const half = (actualSpan / 2) * pitch;
    // Middle pin bent outward orthogonally
    const p3X = midX + half * Math.sin(rad);
    const p3Y = midY - half * Math.cos(rad);
    return [{ x: p1X, y: p1Y }, { x: p2X, y: p2Y }, { x: p3X, y: p3Y }];
  }

  return [{ x: p1X, y: p1Y }, { x: p2X, y: p2Y }];
}
