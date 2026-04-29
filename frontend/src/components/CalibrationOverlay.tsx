import React, { useState, useRef, useEffect } from 'react';
import { Target, X, RefreshCw, Check } from 'lucide-react';
import { detectCorners } from '../api/client';

interface CalibrationOverlayProps {
  imageFile: File;
  onCalibrationComplete: (points: number[][]) => void;
  onCancel: () => void;
}

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({ imageFile, onCalibrationComplete, onCancel }) => {
  const [step, setStep] = useState<1 | 2>(1); // 1: Plastic Corners, 2: Anchor Holes
  const [corners, setCorners] = useState<[number, number][]>([]);
  const [holes, setHoles] = useState<[number, number][]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [imgUrl, setImgUrl] = useState<string>('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImgUrl(url);
    
    // Auto-detect corners on mount
    const fetchCorners = async () => {
      setIsDetecting(true);
      
      // Fallback timer: if AI fails or backend is down, provide defaults after 1.5s
      const fallbackTimer = setTimeout(() => {
        setCorners(prev => {
          if (prev.length === 4) return prev;
          const w = imgRef.current?.naturalWidth || 1000;
          const h = imgRef.current?.naturalHeight || 600;
          return [
            [w*0.15, h*0.15], [w*0.85, h*0.15],
            [w*0.85, h*0.85], [w*0.15, h*0.85]
          ];
        });
        setIsDetecting(false);
      }, 1500);

      try {
        const result = await detectCorners(imageFile);
        clearTimeout(fallbackTimer);
        if (result.corners && result.corners.length === 4) {
          setCorners(result.corners as [number, number][]);
        }
      } catch (err) {
        console.error("AI Corner Detection failed:", err);
      } finally {
        setIsDetecting(false);
      }
    };
    fetchCorners();

    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleContainerClick = (e: React.MouseEvent) => {
    if (step !== 2 || holes.length >= 2) return;
    
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const xRatio = imgRef.current!.naturalWidth / rect.width;
    const yRatio = imgRef.current!.naturalHeight / rect.height;

    const x = (e.clientX - rect.left) * xRatio;
    const y = (e.clientY - rect.top) * yRatio;

    setHoles([...holes, [x, y]]);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (draggingIdx === null || step !== 1 || !imgRef.current) return;
        
        const rect = imgRef.current.getBoundingClientRect();
        const xRatio = imgRef.current.naturalWidth / rect.width;
        const yRatio = imgRef.current.naturalHeight / rect.height;

        const x = Math.max(0, Math.min(imgRef.current.naturalWidth, (e.clientX - rect.left) * xRatio));
        const y = Math.max(0, Math.min(imgRef.current.naturalHeight, (e.clientY - rect.top) * yRatio));

        setCorners(prev => {
            const next = [...prev];
            next[draggingIdx] = [x, y];
            return next as [number, number][];
        });
    };

    const handleGlobalMouseUp = () => setDraggingIdx(null);

    if (draggingIdx !== null) {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggingIdx, step]);

  const getVisualPosition = (p: [number, number]) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return { left: 0, top: 0 };
    
    const xRatio = rect.width / imgRef.current!.naturalWidth;
    const yRatio = rect.height / imgRef.current!.naturalHeight;

    return {
      left: p[0] * xRatio,
      top: p[1] * yRatio
    };
  };

  const cornerLabels = ['Top-Left', 'Top-Right', 'Bottom-Right', 'Bottom-Left'];
  const holeLabels = ['Hole A1', 'Hole J63'];

  return (
    <div className="calibration-modal-overlay">
      <div className="calibration-content">
        <div className="calibration-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={20} className="text-blue-500" />
            <h2 style={{ margin: 0 }}>Manual Calibration</h2>
          </div>
          <button className="icon-btn-close" onClick={onCancel}><X size={20} /></button>
        </div>

        <div className="calibration-body">
          <div className="calibration-stepper">
            <div className={`step-item ${step === 1 ? 'active' : ''}`}>1. Corners</div>
            <div className={`step-item ${step === 2 ? 'active' : ''}`}>2. Anchors</div>
          </div>

          <p className="calibration-instructions">
            {isDetecting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={16} className="animate-spin" /> AI is detecting corners...
              </span>
            ) : step === 1 ? (
              "Step 1: Adjust the 4 corners of the breadboard plastic. Drag the markers to fit correctly."
            ) : (
              `Step 2: Locate terminal holes. Target: ${holeLabels[holes.length] || 'Finalize'}`
            )}
          </p>

          <div 
            className="calibration-image-container" 
            onClick={handleContainerClick}
            style={{ position: 'relative', cursor: step === 2 ? 'crosshair' : 'default' }}
          >
            <img 
              ref={imgRef}
              src={imgUrl} 
              alt="Raw board" 
              onLoad={() => setImageLoaded(true)}
              onDragStart={(e) => e.preventDefault()}
              style={{ display: 'block', maxWidth: '100%', borderRadius: '8px', opacity: isDetecting || !imageLoaded ? 0.5 : 1 }} 
            />

            {/* Magnifying Loupe during dragging */}
            {draggingIdx !== null && corners[draggingIdx] && imgRef.current && imageLoaded && (
              <div style={{
                position: 'fixed',
                top: 80,
                right: 40,
                width: 180,
                height: 180,
                borderRadius: '50%',
                border: '4px solid #3b82f6',
                overflow: 'hidden',
                zIndex: 1000,
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                backgroundColor: 'white',
                pointerEvents: 'none'
              }}>
                <img 
                   src={imgUrl}
                   style={{
                     position: 'absolute',
                     width: imgRef.current.naturalWidth * 3, // 3x zoom
                     height: imgRef.current.naturalHeight * 3,
                     left: -(corners[draggingIdx][0] * 3) + 90,
                     top: -(corners[draggingIdx][1] * 3) + 90,
                     maxWidth: 'none'
                   }}
                />
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 20, background: '#3b82f6', transform: 'translate(-50%, -50%)' }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 20, height: 2, background: '#3b82f6', transform: 'translate(-50%, -50%)' }} />
                <div style={{ position: 'absolute', bottom: 10, left: 0, width: '100%', textAlign: 'center', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 'bold', textShadow: '0 1px 2px white' }}>
                    PRECISION VIEW (3X)
                </div>
              </div>
            )}

            {/* Bounding Box Polygon */}
            {corners.length === 4 && (
              <svg 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                viewBox={`0 0 ${imgRef.current?.naturalWidth || 0} ${imgRef.current?.naturalHeight || 0}`}
                preserveAspectRatio="none"
              >
                <polygon 
                  points={corners.map(c => `${c[0]},${c[1]}`).join(' ')} 
                  fill="rgba(59, 130, 246, 0.2)" 
                  stroke="#3b82f6" 
                  strokeWidth="2" 
                  strokeDasharray="4"
                />
              </svg>
            )}
            
            {/* Draggable Corner Markers */}
            {step === 1 && imageLoaded && corners.map((p, i) => {
              const pos = getVisualPosition(p);
              return (
                <div 
                  key={`corner-${i}`} 
                  className={`calibration-marker draggable ${draggingIdx === i ? 'dragging' : ''}`}
                  onMouseDown={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    setDraggingIdx(i); 
                  }}
                  style={{ 
                    position: 'absolute', 
                    left: `${pos.left}px`, 
                    top: `${pos.top}px`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: draggingIdx === i ? 100 : 10,
                    cursor: 'grab'
                  }}
                >
                  <div className="marker-dot" style={{ backgroundColor: '#3b82f6', width: '14px', height: '14px', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
                  <span className="marker-label">{cornerLabels[i]}</span>
                </div>
              );
            })}

            {/* Projected Grid (Step 1 Visual Aid) */}
            {step === 1 && showGrid && corners.length === 4 && imageLoaded && imgRef.current && (
              <svg 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}
                viewBox={`0 0 ${imgRef.current.naturalWidth} ${imgRef.current.naturalHeight}`}
                preserveAspectRatio="none"
              >
                {/* Draw 63 vertical lines and 20 horizontal lines via bilinear interpolation */}
                {Array.from({ length: 63 }).map((_, col) => {
                   const t = col / 62;
                   const xTop = corners[0][0] + t * (corners[1][0] - corners[0][0]);
                   const yTop = corners[0][1] + t * (corners[1][1] - corners[0][1]);
                   const xBot = corners[3][0] + t * (corners[2][0] - corners[3][0]);
                   const yBot = corners[3][1] + t * (corners[2][1] - corners[3][1]);
                   return <line key={`v-${col}`} x1={xTop} y1={yTop} x2={xBot} y2={yBot} stroke="#3b82f6" strokeWidth="2" opacity="0.5" />;
                })}
                {Array.from({ length: 20 }).map((_, row) => {
                   const t = row / 19;
                   const xLeft = corners[0][0] + t * (corners[3][0] - corners[0][0]);
                   const yLeft = corners[0][1] + t * (corners[3][1] - corners[0][1]);
                   const xRight = corners[1][0] + t * (corners[2][0] - corners[1][0]);
                   const yRight = corners[1][1] + t * (corners[2][1] - corners[1][1]);
                   return <line key={`h-${row}`} x1={xLeft} y1={yLeft} x2={xRight} y2={yRight} stroke="#3b82f6" strokeWidth="2" opacity="0.5" />;
                })}
              </svg>
            )}

            {/* Hole Markers (Static) */}
            {step === 2 && holes.map((p, i) => {
              const pos = getVisualPosition(p);
              return (
                <div 
                  key={`hole-${i}`} 
                  className="calibration-marker"
                  style={{ 
                    position: 'absolute', 
                    left: `${pos.left}px`, 
                    top: `${pos.top}px`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className="marker-dot" style={{ backgroundColor: '#ef4444' }} />
                  <span className="marker-label">{holeLabels[i]}</span>
                </div>
              );
            })}
          </div>

          <div className="calibration-footer">
            {step === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                <button 
                  className={`btn-secondary ${showGrid ? 'active' : ''}`}
                  onClick={() => setShowGrid(!showGrid)}
                  style={{ background: showGrid ? '#dbeafe' : '', color: showGrid ? '#1e40af' : '', border: showGrid ? '1px solid #1e40af' : '' }}
                >
                  {showGrid ? 'Hide Alignment Grid' : 'Show Alignment Grid'}
                </button>
                <button 
                  className="btn-primary" 
                  onClick={() => setStep(2)}
                  disabled={corners.length < 4}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Accept Corners & Move to Holes
                </button>
              </div>
            ) : (
              <>
                <button className="btn-secondary" onClick={() => { setStep(1); setHoles([]); }}>
                  Back to Corners
                </button>
                <button 
                  className="btn-primary" 
                  disabled={holes.length < 2}
                  onClick={() => onCalibrationComplete([...corners, ...holes])}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check size={16} /> Finalize Calibration
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
