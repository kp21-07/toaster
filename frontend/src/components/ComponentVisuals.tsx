import React from 'react';
import type { CircuitComponent } from '../types';
import { pitch, paddingX, paddingY } from '../utils/breadboardMath';
import { getFootprint, getGridPinPixels } from '../utils/componentFootprints';

interface Props {
  component: CircuitComponent;
  /** If true, render at reduced opacity (ghost preview during drag) */
  isGhost?: boolean;
  /** If provided, override the component's actual col/row/span for preview rendering */
  overrideCol?: number;
  overrideRow?: number;
  overrideSpan?: number;
}

// ─── Pin pixel positions from grid ───────────────────────────────────────────

function getPinPositions(
  col: number,
  row: number,
  span: number,
  rotation: number,
  pins: number,
  isDIP: boolean = false
): { pins: { x: number; y: number }[]; cx: number; cy: number } {
  const pinArr = getGridPinPixels(col, row, span, rotation, pins, isDIP);
  
  let cx, cy;
  if (isDIP) {
    const actualSpan = Math.floor(pins / 2) - 1;
    cx = paddingX + col * pitch + (actualSpan / 2) * pitch;
    cy = paddingY + row * pitch + 1.5 * pitch;
  } else {
    cx = (pinArr[0].x + pinArr[1].x) / 2;
    cy = (pinArr[0].y + pinArr[1].y) / 2;
  }
  
  return { pins: pinArr, cx, cy };
}

// ─── 2-pin Generic Fallback Body ──────────────────────────────────────────────

function TwoPinBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const fp = getFootprint(c.type);
  const rotation = c.rotation ?? 0;
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins);
  const pin1 = pins[0];
  const pin2 = pins[1];

  const spanPx = span * pitch;
  const bodyW = spanPx * fp.bodyRatio;
  const bodyH = 20; // taller to fit text neatly
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2;

  const opacity = isGhost ? 0.45 : 1;

  return (
    <g opacity={opacity}>
      {/* Leads */}
      <line x1={pin1.x} y1={pin1.y} x2={bodyX} y2={cy}
        stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1={bodyX + bodyW} y1={cy} x2={pin2.x} y2={pin2.y}
        stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />

      {/* Body */}
      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        <rect
          x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="2"
          fill="#ffffff" stroke="#3b82f6" strokeWidth="2"
          style={{ filter: isGhost ? 'none' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
        />
      </g>

      {/* Pin dots */}
      <circle cx={pin1.x} cy={pin1.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
      <circle cx={pin2.x} cy={pin2.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />

      {/* Labels inside the white box */}
      <text
        x={cx} y={cy - 1}
        textAnchor="middle" fontSize="9" fontWeight="700"
        fill={isGhost ? '#64748b' : '#1e293b'}
        style={{ fontFamily: 'Inter, sans-serif', pointerEvents: 'none' }}
        transform={`rotate(${rotation}, ${cx}, ${cy})`}
      >
        {c.name}
      </text>
      <text
        x={cx} y={cy + 8}
        textAnchor="middle" fontSize="8"
        fill={isGhost ? '#94a3b8' : '#64748b'}
        style={{ fontFamily: 'Inter, sans-serif', pointerEvents: 'none' }}
        transform={`rotate(${rotation}, ${cx}, ${cy})`}
      >
        {c.value}
      </text>
    </g>
  );
}

// ─── Resistor body ────────────────────────────────────────────────────────────

function ResistorBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const fp = getFootprint('resistor');
  const rotation = c.rotation ?? 0;
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins);
  const pin1 = pins[0];
  const pin2 = pins[1];

  const spanPx = span * pitch;
  const bodyW = spanPx * fp.bodyRatio;
  const bodyH = 12;
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2;

  const opacity = isGhost ? 0.45 : 1;
  const stripes = fp.stripes ?? ['#1a1a1a', '#ef4444', '#f59e0b'];

  return (
    <g opacity={opacity}>
      <line x1={pin1.x} y1={pin1.y} x2={bodyX} y2={cy} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1={bodyX + bodyW} y1={cy} x2={pin2.x} y2={pin2.y} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />

      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        <rect
          x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="5"
          fill={fp.bodyColor} stroke="#b45309" strokeWidth="1"
          style={{ filter: isGhost ? 'none' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))' }}
        />
        {/* Color Stripes */}
        {stripes.map((color, i) => (
          <rect key={i} x={bodyX + 6 + i * 8} y={bodyY} width="4" height={bodyH} fill={color} opacity="0.9" />
        ))}
        {/* Value Label (small) */}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="8" fontWeight="600" fill={isGhost ? '#64748b' : '#475569'} style={{ pointerEvents: 'none' }}>
          {c.value}
        </text>
      </g>
      <circle cx={pin1.x} cy={pin1.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
      <circle cx={pin2.x} cy={pin2.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
    </g>
  );
}

// ─── Capacitor body ───────────────────────────────────────────────────────────

function CapacitorBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const fp = getFootprint('capacitor');
  const rotation = c.rotation ?? 0;
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins);
  const pin1 = pins[0];
  const pin2 = pins[1];

  const radius = 12;
  const opacity = isGhost ? 0.45 : 1;

  return (
    <g opacity={opacity}>
      {/* Leads slightly bent to center */}
      <path d={`M ${pin1.x} ${pin1.y} Q ${(pin1.x + cx)/2} ${(pin1.y + cy)/2 + 5} ${cx - 4} ${cy + radius}`} fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <path d={`M ${pin2.x} ${pin2.y} Q ${(pin2.x + cx)/2} ${(pin2.y + cy)/2 + 5} ${cx + 4} ${cy + radius}`} fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />

      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        {/* Ceramic Disc */}
        <circle cx={cx} cy={cy} r={radius} fill={fp.bodyColor} stroke="#2563eb" strokeWidth="1.5"
          style={{ filter: isGhost ? 'none' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }} />
        {/* Value Label */}
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#0f172a" style={{ pointerEvents: 'none' }}>
          {c.value || '104'}
        </text>
      </g>
      <circle cx={pin1.x} cy={pin1.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
      <circle cx={pin2.x} cy={pin2.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
    </g>
  );
}

// ─── LED body ─────────────────────────────────────────────────────────────────

function LedBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const fp = getFootprint('led');
  const rotation = c.rotation ?? 0;
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins);
  const pin1 = pins[0];
  const pin2 = pins[1];

  // Try to parse color from value, fallback to red
  const valLower = (c.value || '').toLowerCase();
  let ledColor = '#ef4444'; // default red
  if (valLower.includes('green')) ledColor = '#22c55e';
  else if (valLower.includes('blue')) ledColor = '#3b82f6';
  else if (valLower.includes('yellow')) ledColor = '#eab308';
  else if (valLower.includes('white')) ledColor = '#f8fafc';

  const opacity = isGhost ? 0.45 : 0.85; // Slightly transparent to look like glass/plastic
  
  return (
    <g opacity={opacity}>
      <line x1={pin1.x} y1={pin1.y} x2={cx - 5} y2={cy - 8} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1={pin2.x} y1={pin2.y} x2={cx + 5} y2={cy - 8} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />

      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        {/* Inner Anvil and Post (Anode/Cathode internal structures) */}
        <rect x={cx - 3} y={cy - 18} width="2" height="10" fill="#94a3b8" />
        <path d={`M ${cx + 1} ${cy - 18} L ${cx + 4} ${cy - 18} L ${cx + 4} ${cy - 8} L ${cx + 1} ${cy - 8} Z`} fill="#94a3b8" />
        
        {/* Glass Dome */}
        <path 
          d={`M ${cx - 10} ${cy - 10} 
              A 10 10 0 0 1 ${cx + 10} ${cy - 10} 
              L ${cx + 10} ${cy - 8} 
              L ${cx - 10} ${cy - 8} Z`} 
          fill={ledColor} 
          stroke="#000000" strokeWidth="1" strokeOpacity="0.2"
          style={{ filter: isGhost ? 'none' : `drop-shadow(0 2px 6px ${ledColor}80)` }} 
        />
        
        {/* Flat base lip (Cathode side usually flat) */}
        <rect x={cx - 11} y={cy - 8} width="22" height="3" rx="1" fill={ledColor} stroke="#000000" strokeWidth="1" strokeOpacity="0.3" />
      </g>
      <circle cx={pin1.x} cy={pin1.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
      <circle cx={pin2.x} cy={pin2.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
    </g>
  );
}

// ─── Diode body ───────────────────────────────────────────────────────────────

function DiodeBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const fp = getFootprint('diode');
  const rotation = c.rotation ?? 0;
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins);
  const pin1 = pins[0];
  const pin2 = pins[1];

  const spanPx = span * pitch;
  const bodyW = spanPx * fp.bodyRatio;
  const bodyH = 10;
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2;

  const opacity = isGhost ? 0.45 : 1;

  return (
    <g opacity={opacity}>
      <line x1={pin1.x} y1={pin1.y} x2={bodyX} y2={cy} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1={bodyX + bodyW} y1={cy} x2={pin2.x} y2={pin2.y} stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />

      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        {/* Main Body */}
        <rect
          x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="2"
          fill="#1f2937" stroke="#000000" strokeWidth="1"
          style={{ filter: isGhost ? 'none' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}
        />
        {/* Cathode Stripe */}
        <rect x={bodyX + bodyW - 6} y={bodyY} width="3" height={bodyH} fill="#cbd5e1" />
        
        {/* Small label */}
        <text x={cx - 2} y={cy - 7} textAnchor="middle" fontSize="6" fontWeight="600" fill="#94a3b8" style={{ pointerEvents: 'none' }}>
          {c.name}
        </text>
      </g>
      <circle cx={pin1.x} cy={pin1.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
      <circle cx={pin2.x} cy={pin2.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
    </g>
  );
}

// ─── 3-pin body renderer (Transistor) ─────────────────────────────────────────

function TransistorBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const rotation = c.rotation ?? 0;
  const opacity = isGhost ? 0.45 : 1;
  const fp = getFootprint('transistor');
  
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins);

  const spanPx = span * pitch;
  const bodyW = spanPx * fp.bodyRatio;
  const bodyH = 20;
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2;

  const halfSpanPx = (span / 2) * pitch;
  const p1 = pins[0];
  const p2 = pins[1];
  const p3 = pins[2];

  return (
    <g opacity={opacity}>
      {/* Leads */}
      <line x1={p1.x} y1={p1.y} x2={cx - halfSpanPx/2} y2={cy} stroke="#94a3b8" strokeWidth="2" />
      <line x1={p2.x} y1={p2.y} x2={cx + halfSpanPx/2} y2={cy} stroke="#94a3b8" strokeWidth="2" />
      <line x1={p3.x} y1={p3.y} x2={cx} y2={cy} stroke="#94a3b8" strokeWidth="2" />

      {/* Body */}
      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        <rect
          x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="2"
          fill="#ffffff" stroke="#3b82f6" strokeWidth="2"
          style={{ filter: isGhost ? 'none' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
        />
      </g>

      {/* Pin dots */}
      {[p1, p2, p3].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
      ))}

      {/* Labels inside the white box */}
      <text
        x={cx} y={cy - 1}
        textAnchor="middle" fontSize="9" fontWeight="700"
        fill={isGhost ? '#64748b' : '#1e293b'}
        style={{ fontFamily: 'Inter, sans-serif', pointerEvents: 'none' }}
        transform={`rotate(${rotation}, ${cx}, ${cy})`}
      >
        {c.name}
      </text>
      <text
        x={cx} y={cy + 8}
        textAnchor="middle" fontSize="8"
        fill={isGhost ? '#94a3b8' : '#64748b'}
        style={{ fontFamily: 'Inter, sans-serif', pointerEvents: 'none' }}
        transform={`rotate(${rotation}, ${cx}, ${cy})`}
      >
        {c.value}
      </text>
    </g>
  );
}

// ─── Voltage Source body ──────────────────────────────────────────────────────

function VoltageSourceBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const rotation = c.rotation ?? 0;
  const fp = getFootprint('voltage_source');
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins);
  const pin1 = pins[0];
  const pin2 = pins[1];
  const spanPx = span * pitch;
  const bodyW = spanPx * fp.bodyRatio;

  const bodyH = 16;
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2;
  const opacity = isGhost ? 0.45 : 1;

  return (
    <g opacity={opacity}>
      <line x1={pin1.x} y1={pin1.y} x2={bodyX} y2={cy}
        stroke="#94a3b8" strokeWidth="2" />
      <line x1={bodyX + bodyW} y1={cy} x2={pin2.x} y2={pin2.y}
        stroke="#94a3b8" strokeWidth="2" />

      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="3"
          fill="#16a34a" stroke="#14532d" strokeWidth="1.5"
          style={{ filter: isGhost ? 'none' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))' }}
        />
        <text x={bodyX + 6} y={cy + 4} fontSize="9" fill="white" fontWeight="bold">+</text>
        <text x={bodyX + bodyW - 10} y={cy + 4} fontSize="11" fill="white" fontWeight="bold">−</text>
        <text x={cx} y={cy - bodyH / 2 - 5} textAnchor="middle" fontSize="8" fontWeight="600"
          fill={isGhost ? '#64748b' : '#0f172a'} style={{ fontFamily: 'Inter, sans-serif' }}>
          {c.name}
        </text>
        <text x={cx} y={cy + bodyH / 2 + 10} textAnchor="middle" fontSize="7"
          fill={isGhost ? '#94a3b8' : '#475569'} style={{ fontFamily: 'Inter, sans-serif' }}>
          {c.value}
        </text>
      </g>

      <circle cx={pin1.x} cy={pin1.y} r="3" fill="#1e293b" stroke="#ef4444" strokeWidth="1.5" />
      <circle cx={pin2.x} cy={pin2.y} r="3" fill="#1e293b" stroke="#3b82f6" strokeWidth="1.5" />
    </g>
  );
}

// ─── IC body (Multi-pin DIP) ──────────────────────────────────────────────────

function IcBody({ c, col, row, span, isGhost }: {
  c: CircuitComponent; col: number; row: number; span: number; isGhost: boolean;
}) {
  const rotation = c.rotation ?? 0;
  const fp = getFootprint(c.type);
  const { pins, cx, cy } = getPinPositions(col, row, span, rotation, fp.pins, fp.isDIP);
  
  const actualSpan = fp.isDIP ? Math.floor(fp.pins / 2) - 1 : span;
  const spanPx = actualSpan * pitch;
  const bodyW = spanPx + pitch; // The black body spans the width of all pins
  const bodyH = 3 * pitch; // Straddles the trench
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2;
  const opacity = isGhost ? 0.45 : 1;

  // Render leads from the body edge to each pin
  return (
    <g opacity={opacity}>
      {pins.map((p, i) => {
        // Is it a top or bottom pin?
        // Our getGridPinPixels logic outputs bottom pins first (1 to N/2), then top pins.
        const isBottom = i < fp.pins / 2;
        const leadYStart = cy + (isBottom ? bodyH / 2 : -bodyH / 2);
        
        return (
          <line key={`lead-${i}`} x1={p.x} y1={leadYStart} x2={p.x} y2={p.y} 
            stroke="#94a3b8" strokeWidth="2" />
        );
      })}

      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="2"
          fill="#1e293b" stroke="#0f172a" strokeWidth="2"
          style={{ filter: isGhost ? 'none' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }}
        />
        {/* The semi-circle indent on the left side of standard DIP ICs */}
        <path d={`M ${bodyX} ${cy - 4} A 4 4 0 0 0 ${bodyX} ${cy + 4}`} fill="#0f172a" />
        
        <text x={cx} y={cy} textAnchor="middle" fontSize="10" fontWeight="600"
          fill={isGhost ? '#94a3b8' : '#e2e8f0'} style={{ fontFamily: 'Inter, sans-serif', pointerEvents: 'none' }}>
          {c.name}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8"
          fill={isGhost ? '#475569' : '#94a3b8'} style={{ fontFamily: 'Inter, sans-serif', pointerEvents: 'none' }}>
          {c.value}
        </text>
      </g>

      {pins.map((p, i) => (
        <circle key={`pin-${i}`} cx={p.x} cy={p.y} r="2.5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
      ))}
    </g>
  );
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export const ComponentVisuals: React.FC<Props> = ({
  component,
  isGhost = false,
  overrideCol,
  overrideRow,
  overrideSpan,
}) => {
  const col = overrideCol ?? component.col ?? 10;
  const row = overrideRow ?? component.row ?? 6;
  const span = overrideSpan ?? component.span ?? getFootprint(component.type).defaultSpan;

  if (component.type === 'ic' || component.type === 'ic_dip8') {
    return <IcBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
  }
  if (component.type === 'transistor') {
    return <TransistorBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
  }
  if (component.type === 'voltage_source') {
    return <VoltageSourceBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
  }
  if (component.type === 'resistor') {
    return <ResistorBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
  }
  if (component.type === 'capacitor') {
    return <CapacitorBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
  }
  if (component.type === 'led') {
    return <LedBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
  }
  if (component.type === 'diode') {
    return <DiodeBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
  }
  
  return <TwoPinBody c={component} col={col} row={row} span={span} isGhost={isGhost} />;
};
