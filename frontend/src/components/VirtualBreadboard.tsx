import React, { useState, useMemo } from 'react';
import type { CircuitComponent } from '../types';
import './VirtualBreadboard.css';
import { BreadboardBackground } from './BreadboardBackground';
import { snapToHole, pitch, paddingX, paddingY } from '../utils/breadboardMath';
import { buildRoutingGraph, getPhysicalNodeId } from '../utils/breadboardRouter';



interface VirtualBreadboardProps {
  components: CircuitComponent[];
  wires?: import('../types').Wire[];
  isDrawingWire?: boolean;
  onWireDrawn?: () => void;
  onComponentsUpdate: (newComponents: CircuitComponent[]) => void;
  onWiresUpdate?: (newWires: import('../types').Wire[]) => void;
}

export const VirtualBreadboard: React.FC<VirtualBreadboardProps> = ({ components, wires = [], isDrawingWire, onWireDrawn, onComponentsUpdate, onWiresUpdate }) => {
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CircuitComponent>>({});

  const boardRef = React.useRef<HTMLDivElement>(null);
  const [localComponents, setLocalComponents] = useState<CircuitComponent[]>(components);
  const [localWires, setLocalWires] = useState<import('../types').Wire[]>(wires);
  const [hasDragged, setHasDragged] = useState(false);
  const [hoverHole, setHoverHole] = useState<{ x: number, y: number, id: string, name: string } | null>(null);
  const [drawingTempWire, setDrawingTempWire] = useState<{ id: number, color: string, points: number[][] } | null>(null);

  const routing = useMemo(() => buildRoutingGraph(localComponents, localWires), [localComponents, localWires]);
  
  const allHoles = useMemo(() => {
     const holes: {x: number, y: number, id: string}[] = [];
     for(let g=0; g<10; g++) {
        for(let h=0; h<5; h++) {
           const col = 2 + g*6 + h;
           holes.push({ x: paddingX + col * pitch, y: paddingY + 1 * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + 1 * pitch) });
           holes.push({ x: paddingX + col * pitch, y: paddingY + 2 * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + 2 * pitch) });
           holes.push({ x: paddingX + col * pitch, y: paddingY + 17 * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + 17 * pitch) });
           holes.push({ x: paddingX + col * pitch, y: paddingY + 18 * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + 18 * pitch) });
        }
     }
     for(let col=0; col<63; col++) {
        [4,5,6,7,8,11,12,13,14,15].forEach(row => {
           holes.push({ x: paddingX + col * pitch, y: paddingY + row * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + row * pitch) });
        });
     }
     return holes;
  }, []);

  const [draggingItem, setDraggingItem] = useState<{
    type: 'component' | 'wirePoint';
    itemId: number;
    pointIndex?: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  React.useEffect(() => { setLocalComponents(components); }, [components]);
  React.useEffect(() => { setLocalWires(wires); }, [wires]);

  const getSnapPreviews = () => {
    if (!draggingItem) return [];
    
    if (draggingItem.type === 'wirePoint') {
       const w = localWires.find(w => w.id === draggingItem.itemId);
       if (w && w.points) {
          const p = w.points[draggingItem.pointIndex!];
          const snapped = snapToHole(p[0], p[1]);
          return [{ x: snapped.x, y: snapped.y }];
       }
    } else if (draggingItem.type === 'component') {
       const c = localComponents.find(c => c.id === draggingItem.itemId);
       if (c && c.box) {
          const xs = c.box.map(p => p[0]);
          const ys = c.box.map(p => p[1]);
          let minX = Math.min(...xs);
          let minY = Math.min(...ys);
          const wPx = Math.max(...xs) - minX;
          const hPx = Math.max(...ys) - minY;

          const centerY = minY + hPx / 2;
          const snappedY = snapToHole(0, centerY).y;
          
          const previews = [];
          if (c.terminals && c.terminals.length >= 1) {
             const leftTip = minX - 20;
             previews.push({ x: snapToHole(leftTip, 0).x, y: snappedY });
          }
          if (c.terminals && c.terminals.length >= 2) {
             const rightTip = minX + wPx + 20;
             previews.push({ x: snapToHole(rightTip, 0).x, y: snappedY });
          }
          if (c.terminals && c.terminals.length >= 3) {
             const topTipX = minX + wPx / 2;
             const topTipY = minY - 20;
             previews.push({ x: snapToHole(topTipX, 0).x, y: snapToHole(0, topTipY).y });
          }
          return previews;
       }
    }
    return [];
  };
  const snapPreviews = getSnapPreviews();

  const getCoords = (e: React.MouseEvent | MouseEvent) => {
     if (!boardRef.current) return { x: 0, y: 0 };
     const rect = boardRef.current.getBoundingClientRect();
     return {
        x: ((e.clientX - rect.left) / rect.width) * 928,
        y: ((e.clientY - rect.top) / rect.height) * 306
     };
  };

  const handleBoardMouseDown = (e: React.MouseEvent) => {
     if (isDrawingWire) {
        const coords = getCoords(e);
        const snapped = snapToHole(coords.x, coords.y);
        if (Math.hypot(coords.x - snapped.x, coords.y - snapped.y) < 15) {
           const newWireId = Math.max(0, ...localWires.map(w => w.id)) + 1;
           setDrawingTempWire({ id: newWireId, color: '#2563eb', points: [[snapped.x, snapped.y], [snapped.x, snapped.y]] });
        }
     }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
     const coords = getCoords(e);
     
     if (isDrawingWire && drawingTempWire) {
         const snapped = snapToHole(coords.x, coords.y);
         setDrawingTempWire(prev => prev ? { ...prev, points: [prev.points[0], [snapped.x, snapped.y]] } : null);
         return;
     }
     
     if (!draggingItem) {
         const snapped = snapToHole(coords.x, coords.y);
         const dist = Math.hypot(coords.x - snapped.x, coords.y - snapped.y);
         if (dist < 8) {
             const physId = getPhysicalNodeId(snapped.x, snapped.y);
             if (!physId.includes('Unknown')) {
                setHoverHole({ x: snapped.x, y: snapped.y, id: physId, name: routing.getNodeName(physId) });
             }
         } else {
             setHoverHole(null);
         }
         return;
     }
     
     if (!hasDragged) setHasDragged(true);
     
     if (draggingItem.type === 'component') {
        setLocalComponents(prev => prev.map(c => {
           if (c.id === draggingItem.itemId && c.box) {
              const xs = c.box.map(p => p[0]);
              const ys = c.box.map(p => p[1]);
              const w = Math.max(...xs) - Math.min(...xs);
              const h = Math.max(...ys) - Math.min(...ys);
              const newX = coords.x - draggingItem.offsetX;
              const newY = coords.y - draggingItem.offsetY;
              return { ...c, box: [[newX, newY], [newX + w, newY], [newX + w, newY + h], [newX, newY + h]] };
           }
           return c;
        }));
     } else if (draggingItem.type === 'wirePoint') {
        setLocalWires(prev => prev.map(w => {
           if (w.id === draggingItem.itemId && w.points) {
              const newPts = [...w.points];
              newPts[draggingItem.pointIndex!] = [coords.x, coords.y];
              return { ...w, points: newPts };
           }
           return w;
        }));
     }
  };

  const handleMouseUp = () => {
    if (isDrawingWire && drawingTempWire) {
        const p1 = drawingTempWire.points[0];
        const p2 = drawingTempWire.points[1];
        if (p1[0] !== p2[0] || p1[1] !== p2[1]) {
           const newWire = { ...drawingTempWire, endpoints: [] } as import('../types').Wire;
           const updated = [...localWires, newWire];
           setLocalWires(updated);
           if (onWiresUpdate) onWiresUpdate(updated);
        }
        setDrawingTempWire(null);
        if (onWireDrawn) onWireDrawn();
        return;
    }

    if (!draggingItem) return;
    
    if (draggingItem.type === 'component') {
       let updatedComps = [...localComponents].map(c => {
          if (c.id === draggingItem.itemId && c.box) {
              const xs = c.box.map(p => p[0]);
              const ys = c.box.map(p => p[1]);
              let minX = Math.min(...xs);
              let minY = Math.min(...ys);
              const wPx = Math.max(...xs) - minX;
              const hPx = Math.max(...ys) - minY;

              const centerY = minY + hPx / 2;
              const snappedY = snapToHole(0, centerY).y;
              minY = snappedY - hPx / 2;

              // Snap left leg horizontally
              const tipX = minX - 20;
              const snappedTipX = snapToHole(tipX, 0).x;
              minX = snappedTipX + 20;
              
              return { ...c, box: [[minX, minY], [minX + wPx, minY], [minX + wPx, minY + hPx], [minX, minY + hPx]] };
          }
          return c;
       });
       setLocalComponents(updatedComps);
       onComponentsUpdate(updatedComps);
    } else if (draggingItem.type === 'wirePoint') {
       let updatedWires = [...localWires].map(w => {
          if (w.id === draggingItem.itemId && w.points) {
             const p = w.points[draggingItem.pointIndex!];
             const snapped = snapToHole(p[0], p[1]);
             const newPts = [...w.points];
             newPts[draggingItem.pointIndex!] = [snapped.x, snapped.y];
             return { ...w, points: newPts };
          }
          return w;
       });
       setLocalWires(updatedWires);
       if (onWiresUpdate) onWiresUpdate(updatedWires);
    }
    
    setDraggingItem(null);
  };

  const handleComponentClick = (comp: CircuitComponent) => {
    setSelectedCompId(comp.id);
    setEditForm(comp);
  };

  const handleSave = () => {
    const updated = components.map(c => 
      c.id === selectedCompId ? { ...c, ...editForm } as CircuitComponent : c
    );
    onComponentsUpdate(updated);
    setSelectedCompId(null);
  };

  const handleCancel = () => {
    setSelectedCompId(null);
  };

  return (
    <div className="virtual-breadboard-container" style={{ userSelect: 'none' }}>
      <div 
        className="breadboard-board"
        ref={boardRef}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
            handleMouseUp();
            setHoverHole(null);
        }}
        style={{ cursor: isDrawingWire ? 'crosshair' : 'default' }}
      >
        <BreadboardBackground />

        {/* Network Connection Highlights */}
        {hoverHole && !draggingItem && (
          <svg viewBox="0 0 928 306" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }} preserveAspectRatio="none">
             {allHoles.filter(h => routing.isConnected(hoverHole.id, h.id)).map((h, i) => (
                 <circle key={`net-${i}`} cx={h.x} cy={h.y} r="5" fill="#22c55e" opacity="0.6" style={{ filter: 'drop-shadow(0 0 3px #22c55e)' }} />
             ))}
             {/* Text indicator floating slightly above logic */}
             <text x={hoverHole.x} y={hoverHole.y - 12} fill="#166534" fontSize="11" fontWeight="bold" textAnchor="middle" style={{ filter: 'drop-shadow(0 1px 1px white)', background: 'white' }}>
                {hoverHole.name}
             </text>
          </svg>
        )}

        {/* Wires Overlay */}
        <svg viewBox="0 0 928 306" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 7, pointerEvents: 'none' }} preserveAspectRatio="none">
           {drawingTempWire && (
             <g>
               <path d={`M ${drawingTempWire.points[0][0]} ${drawingTempWire.points[0][1]} L ${drawingTempWire.points[1][0]} ${drawingTempWire.points[1][1]}`} fill="none" stroke={drawingTempWire.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.3))' }} />
               <circle cx={drawingTempWire.points[0][0]} cy={drawingTempWire.points[0][1]} r="4" fill="white" stroke={drawingTempWire.color} strokeWidth="2" />
               <circle cx={drawingTempWire.points[1][0]} cy={drawingTempWire.points[1][1]} r="4" fill="white" stroke={drawingTempWire.color} strokeWidth="2" />
             </g>
           )}
           {localWires.map(w => {
              if(!w.points || w.points.length < 2) return null;
              
              const pathData = (w.points as number[][]).map((p: number[], i: number) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
              
              return (
                <g key={`wire-group-${w.id}`}>
                  <path 
                    d={pathData} 
                    fill="none" 
                    stroke={w.color || '#cbd5e1'} 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    style={{ filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.3))' }}
                  />
                  {w.points.map((p: number[], i: number) => (
                    <g key={`handle-group-${i}`}>
                      {/* Subtle Visual Handle */}
                      <circle cx={p[0]} cy={p[1]} r="4" fill="white" stroke={w.color || '#94a3b8'} strokeWidth="2" style={{ pointerEvents: 'none' }} />
                      
                      {/* Invisible Responsive Hitbox */}
                      <circle 
                        cx={p[0]} cy={p[1]} 
                        r="12" 
                        fill="transparent"
                        style={{ cursor: 'grab', pointerEvents: 'auto' }}
                        onMouseDown={(e) => {
                           e.stopPropagation();
                           setDraggingItem({ type: 'wirePoint', itemId: w.id, pointIndex: i, offsetX: 0, offsetY: 0 });
                           setHasDragged(false);
                        }}
                        onContextMenu={(e) => {
                           e.preventDefault();
                           e.stopPropagation();
                           const updated = localWires.filter(wire => wire.id !== w.id);
                           setLocalWires(updated);
                           if (onWiresUpdate) onWiresUpdate(updated);
                        }}
                      />
                    </g>
                  ))}
                </g>
              );
           })}
        </svg>

        {/* Snap Previews Overlay */}
        {snapPreviews.length > 0 && (
          <svg viewBox="0 0 928 306" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 6, pointerEvents: 'none' }} preserveAspectRatio="none">
             {snapPreviews.map((pre, i) => (
                 <circle key={`snap-${i}`} cx={pre.x} cy={pre.y} r="6" fill="rgba(250, 204, 21, 0.4)" stroke="#eab308" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 2px #eab308)' }} />
             ))}
          </svg>
        )}
        
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }}>
          {localComponents.map(comp => {
            let style: React.CSSProperties = { position: 'relative' };
            let isSlim = false;

            if (comp.box && comp.box.length === 4) {
              const xs = comp.box.map(p => p[0]);
              const ys = comp.box.map(p => p[1]);
              
              let minX = Math.min(...xs);
              let minY = Math.min(...ys);
              const wPx = Math.max(...xs) - minX;
              const hPx = Math.max(...ys) - minY;

              isSlim = hPx <= 35 || wPx > hPx * 2;

              const left = (minX / 928) * 100;
              const top = (minY / 306) * 100;
              const wPercent = (wPx / 928) * 100;
              const hPercent = (hPx / 306) * 100;

              style = {
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                width: `${wPercent}%`,
                height: `${hPercent}%`,
                margin: 0,
                flexDirection: isSlim ? 'row' : 'column',
                gap: isSlim ? '0.4rem' : '0',
                pointerEvents: 'auto',
                cursor: draggingItem?.itemId === comp.id ? 'grabbing' : 'grab'
              };
            }

            return (
              <div 
                key={comp.id} 
                className={`board-component ${selectedCompId === comp.id ? 'selected' : ''}`}
                onClick={() => {
                   if (hasDragged) return;
                   handleComponentClick(comp);
                }}
                onMouseDown={(e) => {
                   e.stopPropagation();
                   if ((e.target as HTMLElement).tagName === 'INPUT') return;
                   
                   const coords = getCoords(e);
                   const xs = comp.box!.map(p => p[0]);
                   const ys = comp.box!.map(p => p[1]);
                   setDraggingItem({ type: 'component', itemId: comp.id, offsetX: coords.x - Math.min(...xs), offsetY: coords.y - Math.min(...ys) });
                   setHasDragged(false);
                }}
                style={style}
              >
                {/* Floating terminal labels securely anchored via explicit logical drops */}
                {comp.terminals && comp.terminals.length >= 1 && (
                  <>
                    <div style={{ position: 'absolute', top: '50%', left: '-20px', width: '20px', height: '4px', backgroundColor: '#94a3b8', transform: 'translateY(-50%)', zIndex: -1, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)', borderRadius: '2px 0 0 2px' }} />
                    <div style={{ position: 'absolute', top: '50%', left: '-20px', width: '6px', height: '6px', backgroundColor: '#cbd5e1', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: -1, border: '1px solid #475569' }} />
                    <div className="comp-pin-label" style={{ position: 'absolute', top: '50%', left: '-20px', transform: 'translate(-100%, -50%)', background: '#fef08a', color: '#854d0e', padding: '1px 6px', fontSize: '0.65rem', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600, border: '1px solid #fde047', pointerEvents: 'none' }}>
                      {comp.terminals[0]}
                    </div>
                  </>
                )}
                {comp.terminals && comp.terminals.length >= 2 && (
                  <>
                    <div style={{ position: 'absolute', top: '50%', right: '-20px', width: '20px', height: '4px', backgroundColor: '#94a3b8', transform: 'translateY(-50%)', zIndex: -1, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)', borderRadius: '0 2px 2px 0' }} />
                    <div style={{ position: 'absolute', top: '50%', right: '-20px', width: '6px', height: '6px', backgroundColor: '#cbd5e1', borderRadius: '50%', transform: 'translate(50%, -50%)', zIndex: -1, border: '1px solid #475569' }} />
                    <div className="comp-pin-label" style={{ position: 'absolute', top: '50%', right: '-20px', transform: 'translate(100%, -50%)', background: '#fef08a', color: '#854d0e', padding: '1px 6px', fontSize: '0.65rem', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600, border: '1px solid #fde047', pointerEvents: 'none' }}>
                      {comp.terminals[1]}
                    </div>
                  </>
                )}
                {comp.terminals && comp.terminals.length >= 3 && (
                  <>
                    <div style={{ position: 'absolute', top: '-20px', left: '50%', width: '4px', height: '20px', backgroundColor: '#94a3b8', transform: 'translateX(-50%)', zIndex: -1, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)', borderRadius: '2px 2px 0 0' }} />
                    <div style={{ position: 'absolute', top: '-20px', left: '50%', width: '6px', height: '6px', backgroundColor: '#cbd5e1', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: -1, border: '1px solid #475569' }} />
                    <div className="comp-pin-label" style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translate(-50%, -100%)', background: '#fef08a', color: '#854d0e', padding: '1px 6px', fontSize: '0.65rem', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600, border: '1px solid #fde047', pointerEvents: 'none' }}>
                      {comp.terminals[2]}
                    </div>
                  </>
                )}

                <span className="comp-name" style={{ fontSize: '1rem', textAlign: 'center', lineHeight: 1.2 }}>{comp.name}</span>
                <span className="comp-value" style={{ fontSize: '0.8rem', marginTop: isSlim ? 0 : 2 }}>{comp.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {selectedCompId && (
        <>
          <div className="modal-backdrop" onClick={handleCancel} />
          <div className="edit-popover">
            <h4>Edit Component</h4>
            <div className="edit-field">
              <label>Name</label>
              <input 
                type="text" 
                value={editForm.name || ''} 
                onChange={e => setEditForm({...editForm, name: e.target.value})}
              />
            </div>
            <div className="edit-field">
              <label>Value</label>
              <input 
                type="text" 
                value={editForm.value || ''} 
                onChange={e => setEditForm({...editForm, value: e.target.value})}
              />
            </div>
            <div className="edit-field">
              <label>Terminals (comma separated)</label>
              <input 
                type="text" 
                value={editForm.terminals ? editForm.terminals.join(', ') : ''} 
                onChange={e => setEditForm({...editForm, terminals: e.target.value.split(',').map(s => s.trim())})}
              />
            </div>
            <div className="edit-field">
              <label>Type</label>
              <select 
                value={editForm.type || 'resistor'} 
                onChange={e => setEditForm({...editForm, type: e.target.value})}
                style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: 'white' }}
              >
                <option value="resistor">Resistor</option>
                <option value="capacitor">Capacitor</option>
                <option value="transistor">Transistor</option>
                <option value="voltage_source">Voltage Source</option>
              </select>
            </div>
            <div className="edit-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn-save" onClick={handleSave} style={{ flex: 1 }}>Apply</button>
              <button className="btn-cancel" onClick={handleCancel} style={{ flex: 1 }}>Cancel</button>
              <button 
                className="btn-cancel" 
                onClick={() => {
                   const updated = localComponents.filter(c => c.id !== selectedCompId);
                   setLocalComponents(updated);
                   onComponentsUpdate(updated);
                   setSelectedCompId(null);
                }} 
                style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', flex: 1 }}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
