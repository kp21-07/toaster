import React, { useState, useMemo } from 'react';
import { Cpu, Hash, Tag, Trash2, Crosshair, RotateCcw, RotateCw } from 'lucide-react';
import type { CircuitComponent } from '../types';
import './VirtualBreadboard.css';
import { BreadboardBackground } from './BreadboardBackground';
import { ComponentVisuals } from './ComponentVisuals';
import { snapToHole, pitch, paddingX, paddingY } from '../utils/breadboardMath';
import { buildRoutingGraph, getPhysicalNodeId } from '../utils/breadboardRouter';
import { generateVisualPath, manhattanize } from '../utils/wirePathing';

const getComponentTips = (c: CircuitComponent) => {
  if (!c.box) return [];
  const xs = c.box.map(p => p[0]);
  const ys = c.box.map(p => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  const rad = ((c.rotation || 0) * Math.PI) / 180;

  const getRotated = (ox: number, oy: number) => ({
    x: cx + ox * Math.cos(rad) - oy * Math.sin(rad),
    y: cy + ox * Math.sin(rad) + oy * Math.cos(rad)
  });

  const tips = [];
  if (c.terminals && c.terminals.length >= 1) {
    tips.push(getRotated(-w / 2 - 20, 0));
  }
  if (c.terminals && c.terminals.length >= 2) {
    tips.push(getRotated(w / 2 + 20, 0));
  }
  if (c.terminals && c.terminals.length >= 3) {
    tips.push(getRotated(0, -h / 2 - 20));
  }
  return tips;
};



interface VirtualBreadboardProps {
  components: CircuitComponent[];
  wires?: import('../types').Wire[];
  isDrawingWire?: boolean;
  onWireDrawn?: () => void;
  onComponentsUpdate: (newComponents: CircuitComponent[]) => void;
  onWiresUpdate?: (newWires: import('../types').Wire[]) => void;
  warpedImage?: string;
}

export const VirtualBreadboard: React.FC<VirtualBreadboardProps> = ({ 
  components, 
  wires = [], 
  isDrawingWire, 
  onWireDrawn, 
  onComponentsUpdate, 
  onWiresUpdate,
  warpedImage 
}) => {
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CircuitComponent>>({});
  const [pickingTerminalIdx, setPickingTerminalIdx] = useState<number | null>(null);

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
           [0, 20].forEach(offset => {
               holes.push({ x: paddingX + col * pitch, y: paddingY + (1 + offset) * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + (1 + offset) * pitch) });
               holes.push({ x: paddingX + col * pitch, y: paddingY + (2 + offset) * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + (2 + offset) * pitch) });
               holes.push({ x: paddingX + col * pitch, y: paddingY + (17 + offset) * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + (17 + offset) * pitch) });
               holes.push({ x: paddingX + col * pitch, y: paddingY + (18 + offset) * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + (18 + offset) * pitch) });
           });
        }
     }
     for(let col=0; col<63; col++) {
        [0, 20].forEach(offset => {
           [4,5,6,7,8,11,12,13,14,15].forEach(r => {
              const row = r + offset;
              holes.push({ x: paddingX + col * pitch, y: paddingY + row * pitch, id: getPhysicalNodeId(paddingX + col * pitch, paddingY + row * pitch) });
           });
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

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r' && selectedCompId !== null && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        const nextRotation = ((editForm.rotation || 0) + 90) % 360;
        setEditForm(prev => ({ ...prev, rotation: nextRotation }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCompId, editForm.rotation]);

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
          const tips = getComponentTips(c);
          return tips.map(t => {
            const snapped = snapToHole(t.x, t.y);
            return { x: snapped.x, y: snapped.y };
          });
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
        y: ((e.clientY - rect.top) / rect.height) * 586
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
        return;
     }

     if (pickingTerminalIdx !== null && hoverHole) {
        const newTerminals = [...(editForm.terminals || [])];
        newTerminals[pickingTerminalIdx] = hoverHole.id;
        setEditForm({ ...editForm, terminals: newTerminals });
        setPickingTerminalIdx(null);
        return;
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
              const tips = getComponentTips(c);
              if (tips.length > 0) {
                  const primaryTip = tips[0];
                  const snappedTip = snapToHole(primaryTip.x, primaryTip.y);
                  const dx = snappedTip.x - primaryTip.x;
                  const dy = snappedTip.y - primaryTip.y;
                  return { ...c, box: c.box!.map(p => [p[0] + dx, p[1] + dy]) };
              }
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
    const updated = localComponents.map(c => 
      c.id === selectedCompId ? { ...c, ...editForm } as CircuitComponent : c
    );
    setLocalComponents(updated);
    onComponentsUpdate(updated);
    setSelectedCompId(null);
    setPickingTerminalIdx(null);
  };

  const handleCancel = () => {
    setSelectedCompId(null);
    setPickingTerminalIdx(null);
  };

  const handleRotate = () => {
    const nextRotation = ((editForm.rotation || 0) + 90) % 360;
    setEditForm({ ...editForm, rotation: nextRotation });
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
        <BreadboardBackground warpedImage={warpedImage} />

        {/* Network Connection Highlights */}
        {hoverHole && !draggingItem && (
          <svg viewBox="0 0 928 586" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }} preserveAspectRatio="none">
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
        <svg viewBox="0 0 928 586" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 7, pointerEvents: 'none' }} preserveAspectRatio="none">
           {drawingTempWire && (
             <g>
               <path 
                 d={generateVisualPath(manhattanize(drawingTempWire.points, localComponents))} 
                 fill="none" 
                 stroke={drawingTempWire.color} 
                 strokeWidth="4" 
                 strokeLinecap="round" 
                 strokeLinejoin="round" 
                 style={{ filter: 'drop-shadow(1px 3px 3px rgba(0,0,0,0.4))' }} 
               />
               <circle cx={drawingTempWire.points[0][0]} cy={drawingTempWire.points[0][1]} r="4" fill="white" stroke={drawingTempWire.color} strokeWidth="2" />
               <circle cx={drawingTempWire.points[1][0]} cy={drawingTempWire.points[1][1]} r="4" fill="white" stroke={drawingTempWire.color} strokeWidth="2" />
             </g>
           )}
           {localWires.map(w => {
              if(!w.points || w.points.length < 2) return null;
              
              const endpoints = [w.points![0], w.points![w.points!.length - 1]];
              const manhattanPoints = manhattanize(endpoints, localComponents);
              const pathData = generateVisualPath(manhattanPoints);
              
              return (
                <g key={`wire-group-${w.id}`}>
                  <path 
                    d={pathData} 
                    fill="none" 
                    stroke={w.color || '#cbd5e1'} 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    style={{ 
                       filter: 'drop-shadow(1px 3px 3px rgba(0,0,0,0.4))',
                       transition: 'stroke 0.2s ease'
                    }}
                  />
                  {w.points!.map((p: number[], i: number) => {
                    const isEndpoint = i === 0 || i === w.points!.length - 1;
                    if (!isEndpoint) return null;

                    return (
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
                    );
                  })}
                 </g>
              );
           })}
        </svg>

        {/* Snap Previews Overlay */}
        {snapPreviews.length > 0 && (
          <svg viewBox="0 0 928 586" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 6, pointerEvents: 'none' }} preserveAspectRatio="none">
             {snapPreviews.map((pre, i) => (
                 <circle key={`snap-${i}`} cx={pre.x} cy={pre.y} r="6" fill="rgba(250, 204, 21, 0.4)" stroke="#eab308" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 2px #eab308)' }} />
             ))}
          </svg>
        )}
        
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }}>
          {localComponents.map(comp => {
            const isSelected = selectedCompId === comp.id;
            const displayComp = isSelected ? { ...comp, ...editForm } as CircuitComponent : comp;
            
            let style: React.CSSProperties = { position: 'relative' };
            let isSlim = false;

            if (displayComp.box && displayComp.box.length === 4) {
              const xs = displayComp.box.map(p => p[0]);
              const ys = displayComp.box.map(p => p[1]);
              
              let minX = Math.min(...xs);
              let minY = Math.min(...ys);
              const wPx = Math.max(...xs) - minX;
              const hPx = Math.max(...ys) - minY;

              isSlim = hPx <= 35 || wPx > hPx * 2;

              const left = (minX / 928) * 100;
              const top = (minY / 586) * 100;
              const wPercent = (wPx / 928) * 100;
              const hPercent = (hPx / 586) * 100;

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
                cursor: draggingItem?.itemId === displayComp.id ? 'grabbing' : 'grab'
              };
            }

            return (
              <div 
                key={displayComp.id} 
                className={`board-component ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                   if (hasDragged) return;
                   handleComponentClick(comp);
                }}
                onMouseDown={(e) => {
                   e.stopPropagation();
                   if ((e.target as HTMLElement).tagName === 'INPUT') return;
                   
                   const coords = getCoords(e);
                   const xs = displayComp.box!.map(p => p[0]);
                   const ys = displayComp.box!.map(p => p[1]);
                   setDraggingItem({ type: 'component', itemId: displayComp.id, offsetX: coords.x - Math.min(...xs), offsetY: coords.y - Math.min(...ys) });
                   setHasDragged(false);
                }}
                style={{
                  ...style,
                  transform: `rotate(${displayComp.rotation || 0}deg)`,
                  transformOrigin: 'center center'
                }}
              >
                <ComponentVisuals component={displayComp} isSlim={isSlim} />
              </div>
            );
          })}
        </div>
      </div>

      {selectedCompId && (
        <>
          <div className="modal-backdrop" onClick={handleCancel} />
          <div className="edit-popover">
            <div className="edit-header">
              <Cpu size={20} color="#3b82f6" />
              <h4>Edit Component</h4>
            </div>
            
            <div className="edit-field">
              <label><Tag size={14} /> Name</label>
              <input 
                type="text" 
                value={editForm.name || ''} 
                onChange={e => setEditForm({...editForm, name: e.target.value})}
                placeholder="e.g. R1"
              />
            </div>
            
            <div className="edit-field">
              <label><Hash size={14} /> Value</label>
              <input 
                type="text" 
                value={editForm.value || ''} 
                onChange={e => setEditForm({...editForm, value: e.target.value})}
                placeholder="e.g. 10k"
              />
            </div>

            <div className="edit-field">
              <label><Crosshair size={14} /> Terminals</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                {(editForm.terminals || []).map((t, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.4rem' }}>
                    <input 
                      type="text" 
                      value={t} 
                      onChange={e => {
                        const next = [...(editForm.terminals || [])];
                        next[idx] = e.target.value;
                        setEditForm({...editForm, terminals: next});
                      }}
                      className={pickingTerminalIdx === idx ? 'picking-mode' : ''}
                      style={{ flex: 1 }}
                    />
                    <button 
                      onClick={() => setPickingTerminalIdx(pickingTerminalIdx === idx ? null : idx)}
                      style={{ 
                        padding: '0.4rem', 
                        borderRadius: '8px', 
                        border: '1px solid #cbd5e1', 
                        background: pickingTerminalIdx === idx ? '#f59e0b' : 'white',
                        color: pickingTerminalIdx === idx ? 'white' : '#64748b',
                        cursor: 'pointer'
                      }}
                      title="Click to pick from board"
                    >
                      <Crosshair size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="edit-field">
              <label><Cpu size={14} /> Type</label>
              <select 
                value={editForm.type || 'resistor'} 
                onChange={e => setEditForm({...editForm, type: e.target.value})}
              >
                <option value="resistor">Resistor</option>
                <option value="capacitor">Capacitor</option>
                <option value="transistor">Transistor</option>
                <option value="voltage_source">Voltage Source</option>
                <option value="LED">LED</option>
                <option value="IC">IC / Integrated Circuit</option>
              </select>
            </div>

            <div className="edit-field">
              <label><RotateCcw size={14} /> Rotation</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button 
                  onClick={() => setEditForm({...editForm, rotation: ((editForm.rotation || 0) - 90 + 360) % 360})}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                  title="Rotate Left 90°"
                >
                  <RotateCcw size={18} />
                </button>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, width: "40px", textAlign: 'center' }}>{editForm.rotation || 0}°</span>
                <button 
                  onClick={() => setEditForm({...editForm, rotation: ((editForm.rotation || 0) + 90) % 360})}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                  title="Rotate Right 90°"
                >
                  <RotateCw size={18} />
                </button>
              </div>
            </div>

            <div className="edit-actions">
              <button className="btn-save" onClick={handleSave}>
                Apply Changes
              </button>
              <button 
                className="btn-delete" 
                onClick={() => {
                   if (window.confirm("Delete this component?")) {
                      const updated = localComponents.filter(c => c.id !== selectedCompId);
                      setLocalComponents(updated);
                      onComponentsUpdate(updated);
                      setSelectedCompId(null);
                   }
                }} 
                title="Delete Component"
              >
                <Trash2 size={18} />
              </button>
              <button className="btn-cancel" onClick={handleCancel}>Cancel</button>
              <button 
                className="btn-rotate" 
                onClick={handleRotate}
                title="Rotate 90°"
                style={{
                   padding: '0.4rem',
                   borderRadius: '8px',
                   border: '1px solid #cbd5e1',
                   background: 'white',
                   color: '#64748b',
                   cursor: 'pointer',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center'
                }}
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
