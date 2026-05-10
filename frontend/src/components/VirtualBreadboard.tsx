import React, { useState, useMemo, useCallback } from 'react';
import { Cpu, Hash, Tag, Trash2, Crosshair, RotateCcw, RotateCw } from 'lucide-react';
import type { CircuitComponent } from '../types';
import './VirtualBreadboard.css';
import { BreadboardBackground } from './BreadboardBackground';
import { ComponentVisuals } from './ComponentVisuals';
import { pitch, paddingX, paddingY, pixelXToCol, pixelYToRowIndex, holeToPixel, snapToHole } from '../utils/breadboardMath';
import { buildRoutingGraph, getPhysicalNodeId } from '../utils/breadboardRouter';
import { generateVisualPath, manhattanize } from '../utils/wirePathing';
import { getFootprint, normaliseComponent, getGridPinPixels } from '../utils/componentFootprints';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VirtualBreadboardProps {
  components: CircuitComponent[];
  wires?: import('../types').Wire[];
  isDrawingWire?: boolean;
  onWireDrawn?: () => void;
  onComponentsUpdate: (newComponents: CircuitComponent[]) => void;
  onWiresUpdate?: (newWires: import('../types').Wire[]) => void;
  warpedImage?: string;
  /** When set, board is in cursor-mount mode: place this component on click */
  mountingComponent?: Partial<CircuitComponent> | null;
  onMountComplete?: (placed: CircuitComponent) => void;
  onMountCancel?: () => void;
}

type DragState =
  | { kind: 'component'; id: number; startCol: number; startRow: number }
  | { kind: 'pin1'; id: number }
  | { kind: 'pin2'; id: number }
  | { kind: 'wirePoint'; wireId: number; pointIndex: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMouseGridPos(e: React.MouseEvent | MouseEvent, boardRef: React.RefObject<HTMLDivElement | null>) {
  if (!boardRef.current) return { col: 0, row: 4, px: 0, py: 0 };
  const rect = boardRef.current.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * 928;
  const py = ((e.clientY - rect.top) / rect.height) * 586;
  return { col: pixelXToCol(px), row: pixelYToRowIndex(py), px, py };
}

const BOARD_W = 928;
const BOARD_H = 586;

// ─── Component ────────────────────────────────────────────────────────────────

export const VirtualBreadboard: React.FC<VirtualBreadboardProps> = ({
  components,
  wires = [],
  isDrawingWire,
  onWireDrawn,
  onComponentsUpdate,
  onWiresUpdate,
  warpedImage,
  mountingComponent,
  onMountComplete,
  onMountCancel,
}) => {
  const boardRef = React.useRef<HTMLDivElement>(null);

  // Normalise components (migrate box → col/row/span) once on receipt
  const normComponents = useMemo(() => components.map(normaliseComponent), [components]);
  const normWires: import('../types').Wire[] = useMemo(() => wires.map(w => ({
    ...w,
    points: w.points ? w.points.map(p => {
      const snapped = snapToHole(p[0], p[1]);
      return [snapped.x, snapped.y];
    }) : undefined
  })), [wires]);

  const [localComponents, setLocalComponents] = useState<CircuitComponent[]>(normComponents);
  const [localWires, setLocalWires] = useState(normWires);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghostPos, setGhostPos] = useState<{ col: number; row: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CircuitComponent>>({});
  const [pickingTerminalIdx, setPickingTerminalIdx] = useState<number | null>(null);
  const [hoverHole, setHoverHole] = useState<{ x: number; y: number; id: string; name: string } | null>(null);
  const [drawingTempWire, setDrawingTempWire] = useState<{ id: number; color: string; points: number[][] } | null>(null);
  const [mountGhost, setMountGhost] = useState<{ col: number; row: number } | null>(null);

  // Sync props → local when props change
  React.useEffect(() => { setLocalComponents(normComponents); }, [normComponents]);
  React.useEffect(() => { setLocalWires(normWires); }, [normWires]);

  // Routing for hole hover labels
  const routing = useMemo(() => buildRoutingGraph(localComponents, localWires), [localComponents, localWires]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'Escape') { onMountCancel?.(); setSelectedId(null); }
      if (e.key.toLowerCase() === 'r' && selectedId !== null) {
        setEditForm(prev => ({ ...prev, rotation: ((prev.rotation ?? 0) + 90) % 360 }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onMountCancel]);

  // ── Coordinate helper ─────────────────────────────────────────────────────
  const getGrid = useCallback((e: React.MouseEvent | MouseEvent) => getMouseGridPos(e, boardRef), []);

  // ── Mouse down ────────────────────────────────────────────────────────────
  const handleBoardMouseDown = (e: React.MouseEvent) => {
    const { col, row } = getGrid(e);

    // Wire drawing mode
    if (isDrawingWire) {
      const snapped = { x: paddingX + col * pitch, y: paddingY + row * pitch };
      const newId = Math.max(0, ...localWires.map(w => w.id)) + 1;
      setDrawingTempWire({ id: newId, color: '#2563eb', points: [[snapped.x, snapped.y], [snapped.x, snapped.y]] });
      return;
    }

    // Terminal picking mode
    if (pickingTerminalIdx !== null && hoverHole) {
      const newTerminals = [...(editForm.terminals ?? [])];
      newTerminals[pickingTerminalIdx] = hoverHole.id;
      setEditForm(prev => ({ ...prev, terminals: newTerminals }));
      setPickingTerminalIdx(null);
      return;
    }

    // Cursor-mount mode — place the component
    if (mountingComponent && mountGhost) {
      const fp = getFootprint(mountingComponent.type ?? 'resistor');
      const newId = Math.max(0, ...localComponents.map(c => c.id)) + 1;
      const placed: CircuitComponent = {
        id: newId,
        type: mountingComponent.type ?? 'resistor',
        name: mountingComponent.name ?? `${(mountingComponent.type ?? 'R').charAt(0).toUpperCase()}${newId}`,
        value: mountingComponent.value ?? '',
        terminals: Array(fp.pins).fill('?'),
        col: mountGhost.col,
        row: mountGhost.row,
        span: fp.defaultSpan,
        rotation: 0,
      };
      onMountComplete?.(placed);
      return;
    }
  };

  // ── Mouse move ────────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent) => {
    const { col, row, px, py } = getGrid(e);

    // Mount ghost
    if (mountingComponent) {
      setMountGhost({ col, row });
      return;
    }

    // Wire drawing
    if (isDrawingWire && drawingTempWire) {
      const snapped = { x: paddingX + col * pitch, y: paddingY + row * pitch };
      setDrawingTempWire(prev => prev ? { ...prev, points: [prev.points[0], [snapped.x, snapped.y]] } : null);
      return;
    }

    // Hole hover
    if (!drag) {
      const snapPx = holeToPixel(col, row);
      const dist = Math.hypot(px - snapPx.x, py - snapPx.y);
      if (dist < 8) {
        const physId = getPhysicalNodeId(snapPx.x, snapPx.y);
        if (!physId.includes('Unknown')) {
          setHoverHole({ x: snapPx.x, y: snapPx.y, id: physId, name: routing.getNodeName(physId) });
        }
      } else {
        setHoverHole(null);
      }
      return;
    }

    if (!hasMoved) setHasMoved(true);
    setGhostPos({ col, row });

    // Live wire point drag
    if (drag.kind === 'wirePoint') {
      setLocalWires(prev => prev.map(w => {
        if (w.id !== drag.wireId || !w.points) return w;
        const pts = [...w.points];
        pts[drag.pointIndex] = [paddingX + col * pitch, paddingY + row * pitch];
        return { ...w, points: pts };
      }));
    }
  };

  // ── Mouse up ──────────────────────────────────────────────────────────────
  const handleMouseUp = () => {
    // Finish wire drawing
    if (isDrawingWire && drawingTempWire) {
      const [p1, p2] = drawingTempWire.points;
      if (p1[0] !== p2[0] || p1[1] !== p2[1]) {
        const updated = [...localWires, { ...drawingTempWire, endpoints: [] } as import('../types').Wire];
        setLocalWires(updated);
        onWiresUpdate?.(updated);
      }
      setDrawingTempWire(null);
      onWireDrawn?.();
      return;
    }

    if (!drag) return;

    if (drag.kind === 'component' && hasMoved && ghostPos) {
      const deltaCol = ghostPos.col - drag.startCol;
      const deltaRow = ghostPos.row - drag.startRow;
      const updated = localComponents.map(c => {
        if (c.id !== drag.id) return c;
        return { ...c, col: (c.col ?? 0) + deltaCol, row: (c.row ?? 4) + deltaRow };
      });
      setLocalComponents(updated);
      onComponentsUpdate(updated);
    }

    if (drag.kind === 'pin1' && ghostPos) {
      const updated = localComponents.map(c => {
        if (c.id !== drag.id) return c;
        const newCol = ghostPos.col;
        const newSpan = (c.col ?? 0) + (c.span ?? 3) - newCol;
        return { ...c, col: newCol, span: Math.max(1, newSpan) };
      });
      setLocalComponents(updated);
      onComponentsUpdate(updated);
    }

    if (drag.kind === 'pin2' && ghostPos) {
      const updated = localComponents.map(c => {
        if (c.id !== drag.id) return c;
        const newSpan = ghostPos.col - (c.col ?? 0);
        return { ...c, span: Math.max(1, newSpan) };
      });
      setLocalComponents(updated);
      onComponentsUpdate(updated);
    }

    if (drag.kind === 'wirePoint') {
      const updated = localWires.map(w => {
        if (w.id !== drag.wireId || !w.points) return w;
        const pts = [...w.points];
        const [rawX, rawY] = pts[drag.pointIndex];
        const col = pixelXToCol(rawX);
        const row = pixelYToRowIndex(rawY);
        pts[drag.pointIndex] = [paddingX + col * pitch, paddingY + row * pitch];
        return { ...w, points: pts };
      });
      setLocalWires(updated);
      onWiresUpdate?.(updated);
    }

    setDrag(null);
    setGhostPos(null);
    setHasMoved(false);
  };

  // ── Edit panel ────────────────────────────────────────────────────────────
  const handleSave = () => {
    const updated = localComponents.map(c => c.id === selectedId ? { ...c, ...editForm } as CircuitComponent : c);
    setLocalComponents(updated);
    onComponentsUpdate(updated);
    setSelectedId(null);
    setPickingTerminalIdx(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="virtual-breadboard-container" style={{ userSelect: 'none' }}>
      <div
        className="breadboard-board"
        ref={boardRef}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setHoverHole(null); setMountGhost(null); }}
        style={{ cursor: (isDrawingWire || mountingComponent) ? 'crosshair' : 'default' }}
      >
        {/* ── SVG canvas: background + all interactive content ── */}
        <svg
          viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, overflow: 'visible' }}
          preserveAspectRatio="none"
        >
          {/* Background holes grid */}
          <BreadboardBackground warpedImage={warpedImage} />

          {/* ── Hole hover net highlight ── */}
          {hoverHole && !drag && (() => {
            const allHoles: { x: number; y: number; id: string }[] = [];
            // gather all physical holes (simplified — reuse existing allHoles logic)
            for (let col = 0; col < 63; col++) {
              [4,5,6,7,8,11,12,13,14,15,24,25,26,27,28,31,32,33,34,35].forEach(r => {
                allHoles.push({ x: paddingX + col * pitch, y: paddingY + r * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + r * pitch) });
              });
            }
            return allHoles.filter(h => routing.isConnected(hoverHole.id, h.id)).map((h, i) => (
              <circle key={i} cx={h.x} cy={h.y} r="5" fill="#22c55e" opacity="0.6" style={{ filter: 'drop-shadow(0 0 3px #22c55e)' }} />
            ));
          })()}
          {hoverHole && (
            <text x={hoverHole.x} y={hoverHole.y - 12} fill="#166534" fontSize="11" fontWeight="bold" textAnchor="middle" style={{ filter: 'drop-shadow(0 1px 1px white)' }}>
              {hoverHole.name}
            </text>
          )}

          {/* ── Components (ghosted if being dragged) ── */}
          {localComponents.map(comp => {
            const isSelected = selectedId === comp.id;
            const display = isSelected ? { ...comp, ...editForm } as CircuitComponent : comp;
            const isDragging = drag?.kind === 'component' && drag.id === comp.id;

            return (
              <g
                key={comp.id}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={e => {
                  e.stopPropagation();
                  setDrag({ kind: 'component', id: comp.id, startCol: comp.col ?? 0, startRow: comp.row ?? 4 });
                  setHasMoved(false);
                  setGhostPos({ col: comp.col ?? 0, row: comp.row ?? 4 });
                }}
                onClick={e => {
                  e.stopPropagation();
                  if (hasMoved) return;
                  setSelectedId(comp.id);
                  setEditForm(comp);
                }}
              >
                {/* Ghost: original position dimmed while dragging */}
                {isDragging && (
                  <ComponentVisuals component={display} isGhost={true} />
                )}
                {/* Live: follows ghost position or stays put */}
                {isDragging && ghostPos ? (
                  <ComponentVisuals component={display} overrideCol={ghostPos.col} overrideRow={ghostPos.row} />
                ) : (
                  <ComponentVisuals component={display} isGhost={isDragging} />
                )}

                {/* Selection ring */}
                {isSelected && (() => {
                  const col = (display.col ?? 10);
                  const row = (display.row ?? 6);
                  const span = display.span ?? getFootprint(display.type).defaultSpan;
                  const cx = paddingX + col * pitch + (span / 2) * pitch;
                  const cy = paddingY + row * pitch;
                  const rw = (span / 2) * pitch + 12;
                  return <ellipse cx={cx} cy={cy} rx={rw} ry={10} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.8" />;
                })()}
              </g>
            );
          })}

          {/* ── Cursor-mount ghost ── */}
          {mountingComponent && mountGhost && (
            <ComponentVisuals
              component={{
                id: -1,
                type: mountingComponent.type ?? 'resistor',
                name: mountingComponent.name ?? '?',
                value: mountingComponent.value ?? '',
                terminals: [],
                col: mountGhost.col,
                row: mountGhost.row,
                span: getFootprint(mountingComponent.type ?? 'resistor').defaultSpan,
              }}
              isGhost={true}
            />
          )}

          {/* ── Snap target previews during drag ── */}
          {drag?.kind === 'component' && ghostPos && (() => {
            const comp = localComponents.find(c => c.id === (drag as any).id);
            if (!comp) return null;
            const fp = getFootprint(comp.type);
            const span = comp.span ?? fp.defaultSpan;
            const pins = getGridPinPixels(ghostPos.col, ghostPos.row, span, comp.rotation ?? 0, fp.pins, fp.isDIP);
            
            return (
              <>
                {pins.map((p: any, i: number) => (
                  <circle key={`snap-${i}`} cx={p.x} cy={p.y} r="6" fill="rgba(250,204,21,0.5)" stroke="#eab308" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 3px #eab308)' }} />
                ))}
              </>
            );
          })()}

          {/* ── Wires ── */}
          {drawingTempWire && (
            <g>
              <path d={generateVisualPath(manhattanize(drawingTempWire.points, localComponents))}
                fill="none" stroke={drawingTempWire.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: 'drop-shadow(1px 3px 3px rgba(0,0,0,0.4))' }} />
              <circle cx={drawingTempWire.points[0][0]} cy={drawingTempWire.points[0][1]} r="4" fill="white" stroke={drawingTempWire.color} strokeWidth="2" />
              <circle cx={drawingTempWire.points[1][0]} cy={drawingTempWire.points[1][1]} r="4" fill="white" stroke={drawingTempWire.color} strokeWidth="2" />
            </g>
          )}
          {localWires.map(w => {
            if (!w.points || w.points.length < 2) return null;
            const pathData = generateVisualPath(manhattanize(w.points, localComponents));
            return (
              <g key={`wire-${w.id}`}>
                <path d={pathData} fill="none" stroke={w.color || '#cbd5e1'} strokeWidth="4"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(1px 3px 3px rgba(0,0,0,0.4))', transition: 'stroke 0.2s' }} />
                {w.points.map((p, i) => {
                  return (
                    <g key={i}>
                      <circle cx={p[0]} cy={p[1]} r="4" fill="white" stroke={w.color ?? '#94a3b8'} strokeWidth="2" style={{ pointerEvents: 'none' }} />
                      <circle cx={p[0]} cy={p[1]} r="12" fill="transparent" style={{ cursor: 'grab', pointerEvents: 'auto' }}
                        onMouseDown={ev => { ev.stopPropagation(); setDrag({ kind: 'wirePoint', wireId: w.id, pointIndex: i }); setHasMoved(false); }}
                        onContextMenu={ev => {
                          ev.preventDefault(); ev.stopPropagation();
                          const updated = localWires.filter(x => x.id !== w.id);
                          setLocalWires(updated); onWiresUpdate?.(updated);
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Edit popover ── */}
      {selectedId && (
        <>
          <div className="modal-backdrop" onClick={() => { setSelectedId(null); setPickingTerminalIdx(null); }} />
          <div className="edit-popover">
            <div className="edit-header"><Cpu size={20} color="#3b82f6" /><h4>Edit Component</h4></div>
            <div className="edit-field">
              <label><Tag size={14} /> Name</label>
              <input type="text" value={editForm.name ?? ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label><Hash size={14} /> Value</label>
              <input type="text" value={editForm.value ?? ''} onChange={e => setEditForm(p => ({ ...p, value: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label><Crosshair size={14} /> Terminals</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
                {(editForm.terminals ?? []).map((t, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.4rem' }}>
                    <input type="text" value={t} style={{ flex: 1 }} className={pickingTerminalIdx === idx ? 'picking-mode' : ''}
                      onChange={e => { const next = [...(editForm.terminals ?? [])]; next[idx] = e.target.value; setEditForm(p => ({ ...p, terminals: next })); }} />
                    <button onClick={() => setPickingTerminalIdx(pickingTerminalIdx === idx ? null : idx)}
                      style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: pickingTerminalIdx === idx ? '#f59e0b' : 'white', color: pickingTerminalIdx === idx ? 'white' : '#64748b', cursor: 'pointer' }}>
                      <Crosshair size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="edit-field">
              <label><Cpu size={14} /> Type</label>
              <select value={editForm.type ?? 'resistor'} onChange={e => {
                const newType = e.target.value;
                const fp = getFootprint(newType);
                setEditForm(p => {
                  const currentTerminals = p.terminals ?? [];
                  let newTerminals = [...currentTerminals];
                  // Pad or truncate terminals array to match the new footprint pins
                  if (newTerminals.length < fp.pins) {
                    newTerminals = newTerminals.concat(Array(fp.pins - newTerminals.length).fill('?'));
                  } else if (newTerminals.length > fp.pins) {
                    newTerminals = newTerminals.slice(0, fp.pins);
                  }
                  return { ...p, type: newType, terminals: newTerminals };
                });
              }}>
                <option value="resistor">Resistor</option>
                <option value="capacitor">Capacitor</option>
                <option value="transistor">Transistor</option>
                <option value="voltage_source">Voltage Source</option>
                <option value="led">LED</option>
                <option value="diode">Diode</option>
                <option value="ic">IC (DIP-14)</option>
                <option value="ic_dip8">IC (DIP-8)</option>
              </select>
            </div>
            <div className="edit-field">
              <label><RotateCcw size={14} /> Rotation</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => setEditForm(p => ({ ...p, rotation: ((p.rotation ?? 0) - 90 + 360) % 360 }))}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                  <RotateCcw size={18} />
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, width: '40px', textAlign: 'center' }}>{editForm.rotation ?? 0}°</span>
                <button onClick={() => setEditForm(p => ({ ...p, rotation: ((p.rotation ?? 0) + 90) % 360 }))}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                  <RotateCw size={18} />
                </button>
              </div>
            </div>
            <div className="edit-actions">
              <button className="btn-save" onClick={handleSave}>Apply Changes</button>
              <button className="btn-delete" title="Delete"
                onClick={() => {
                  if (!window.confirm('Delete this component?')) return;
                  const updated = localComponents.filter(c => c.id !== selectedId);
                  setLocalComponents(updated); onComponentsUpdate(updated); setSelectedId(null);
                }}>
                <Trash2 size={18} />
              </button>
              <button className="btn-cancel" onClick={() => { setSelectedId(null); setPickingTerminalIdx(null); }}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
