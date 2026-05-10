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
    defaultSpan: 7, // A 14-pin IC spans 7 columns (0 to 6)
    bodyRatio: 0.95,
    pins: 14,
    minSpan: 4,
    maxSpan: 20,
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
  const cx = paddingX + col * pitch + (span / 2) * pitch;
  const cy = paddingY + row * pitch + (isDIP ? 1.5 * pitch : 0);
  const halfSpanPx = (span / 2) * pitch;

  const rad = (rotation * Math.PI) / 180;
  const rot = (ox: number, oy: number) => ({
    x: cx + ox * Math.cos(rad) - oy * Math.sin(rad),
    y: cy + ox * Math.sin(rad) + oy * Math.cos(rad),
  });

  if (isDIP) {
    const res: { x: number; y: number }[] = [];
    const pinsPerSide = Math.floor(pins / 2);
    const colSpacingPx = pitch;
    const startX = -((pinsPerSide - 1) / 2) * colSpacingPx;
    
    // Bottom row pins (1 to N/2) - reading left to right
    for (let i = 0; i < pinsPerSide; i++) {
      res.push(rot(startX + i * colSpacingPx, 1.5 * pitch));
    }
    // Top row pins (N/2 + 1 to N) - reading right to left
    for (let i = pinsPerSide - 1; i >= 0; i--) {
      res.push(rot(startX + i * colSpacingPx, -1.5 * pitch));
    }
    return res;
  }

  if (pins === 2) {
    return [rot(-halfSpanPx, 0), rot(halfSpanPx, 0)];
  }
  if (pins === 3) {
    return [rot(-halfSpanPx, 0), rot(halfSpanPx, 0), rot(0, -halfSpanPx)];
  }
  return [rot(-halfSpanPx, 0), rot(halfSpanPx, 0)];
}
