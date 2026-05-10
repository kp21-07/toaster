import React, { useState, useRef, useEffect } from 'react';
import { Target, X } from 'lucide-react';
import { detectCorners, preWarpImage } from '../api/client';

interface CalibrationOverlayProps {
  imageFile: File;
  onCalibrationComplete: (markers: number[][], cropBox?: any) => void;
  onCancel: () => void;
}

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({ imageFile, onCalibrationComplete, onCancel }) => {
  const [step, setStep] = useState<1 | 2>(1); // 1: Markers, 2: Crop Box
  const [corners, setCorners] = useState<[number, number][]>([]);
  const [cropBoxPoints, setCropBoxPoints] = useState<[number, number][]>([]);
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  
  const imgRef = useRef<HTMLImageElement>(null);

  // Initial mount: load original image and detect corners
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImgUrl(url);
    
    const fetchCorners = async () => {
      setIsDetecting(true);
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

  const handleNextStep = async () => {
      // Check for saved crop box
      const savedCropBoxStr = localStorage.getItem('breadboardCropBox');
      if (savedCropBoxStr) {
          // Skip step 2 if we already have the plastic offset!
          onCalibrationComplete(corners);
          return;
      }

      // If no crop box, we need to pre-warp and ask the user to draw it
      try {
          setIsDetecting(true);
          const result = await preWarpImage(imageFile, corners);
          setImgUrl(`data:image/jpeg;base64,${result.image}`);
          setCropBoxPoints([[300, 450], [1300, 1150]]); // Pre-fill with a default box slightly larger than markers
          setStep(2);
          setImageLoaded(false);
      } catch (err) {
          console.error("Pre-warp failed", err);
      } finally {
          setIsDetecting(false);
      }
  };

  const handleComplete = () => {
      if (cropBoxPoints.length !== 2) return;
      const x1 = Math.min(cropBoxPoints[0][0], cropBoxPoints[1][0]);
      const y1 = Math.min(cropBoxPoints[0][1], cropBoxPoints[1][1]);
      const x2 = Math.max(cropBoxPoints[0][0], cropBoxPoints[1][0]);
      const y2 = Math.max(cropBoxPoints[0][1], cropBoxPoints[1][1]);
      const cropBox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
      onCalibrationComplete(corners, cropBox);
  };

  const handleContainerClick = (_e: React.MouseEvent) => {
    // Disabled click-to-draw, we now use drag handles for cropBoxPoints
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (draggingIdx === null || !imgRef.current) return;
        
        const rect = imgRef.current.getBoundingClientRect();
        const xRatio = imgRef.current.naturalWidth / rect.width;
        const yRatio = imgRef.current.naturalHeight / rect.height;

        const x = Math.max(0, Math.min(imgRef.current.naturalWidth, (e.clientX - rect.left) * xRatio));
        const y = Math.max(0, Math.min(imgRef.current.naturalHeight, (e.clientY - rect.top) * yRatio));

        if (step === 1) {
            setCorners(prev => {
                const next = [...prev];
                next[draggingIdx] = [x, y];
                return next as [number, number][];
            });
        } else if (step === 2) {
            setCropBoxPoints(prev => {
                const next = [...prev];
                next[draggingIdx] = [x, y];
                return next as [number, number][];
            });
        }
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

  return (
    <div className="calibration-modal-overlay">
      <div className="calibration-content">
        <div className="calibration-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={18} className="text-blue-500" />
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>{step === 1 ? 'Marker Alignment' : 'Breadboard Boundaries'}</h2>
          </div>
          <button className="icon-btn-close" onClick={onCancel}><X size={20} /></button>
        </div>

        <div className="calibration-body">
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            {isDetecting ? "Processing..." : 
             step === 1 ? "Drag markers to the four printed black dots." : 
             "Drag the Top-Left and Bottom-Right corners to fit the physical plastic breadboard."}
          </div>

          <div 
            className="calibration-image-container" 
            onClick={handleContainerClick}
            style={{ position: 'relative', cursor: step === 2 ? 'crosshair' : 'default' }}
          >
            {imgUrl && (
              <img 
                ref={imgRef}
                src={imgUrl} 
                alt="Board" 
                onLoad={() => setImageLoaded(true)}
                onDragStart={(e) => e.preventDefault()}
                style={{ display: 'block', maxWidth: '100%', borderRadius: '8px', opacity: isDetecting || !imageLoaded ? 0.5 : 1 }} 
              />
            )}

            {/* Magnifying Loupe during dragging */}
            {draggingIdx !== null && imgRef.current && imageLoaded && (
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
                {imgUrl && (
                  <img 
                     src={imgUrl}
                     style={{
                       position: 'absolute',
                       width: imgRef.current.naturalWidth * 3, // 3x zoom
                       height: imgRef.current.naturalHeight * 3,
                       left: -((step === 1 ? corners[draggingIdx][0] : cropBoxPoints[draggingIdx][0]) * 3) + 90,
                       top: -((step === 1 ? corners[draggingIdx][1] : cropBoxPoints[draggingIdx][1]) * 3) + 90,
                       maxWidth: 'none'
                     }}
                  />
                )}
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 20, background: '#3b82f6', transform: 'translate(-50%, -50%)' }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 20, height: 2, background: '#3b82f6', transform: 'translate(-50%, -50%)' }} />
                <div style={{ position: 'absolute', bottom: 10, left: 0, width: '100%', textAlign: 'center', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 'bold', textShadow: '0 1px 2px white' }}>
                    PRECISION VIEW (3X)
                </div>
              </div>
            )}

            {/* Step 1: Bounding Box Polygon & Draggable Markers */}
            {step === 1 && corners.length === 4 && (
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

            {/* Step 2: Draggable Crop Box */}
            {step === 2 && cropBoxPoints.length === 2 && (() => {
                const p1 = getVisualPosition(cropBoxPoints[0]);
                const p2 = getVisualPosition(cropBoxPoints[1]);
                const left = Math.min(p1.left, p2.left);
                const top = Math.min(p1.top, p2.top);
                const width = Math.abs(p2.left - p1.left);
                const height = Math.abs(p2.top - p1.top);
                return (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', left, top, width, height, border: '3px solid #3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)' }} />
                    </div>
                );
            })()}

            {step === 2 && imageLoaded && cropBoxPoints.map((p, i) => {
              const pos = getVisualPosition(p);
              const label = i === 0 ? "Top-Left" : "Bottom-Right";
              return (
                <div 
                  key={`crop-${i}`} 
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
                  <div className="marker-dot" style={{ backgroundColor: '#3b82f6', width: '16px', height: '16px', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.3)', borderRadius: '50%' }} />
                  <span className="marker-label">{label}</span>
                </div>
              );
            })}
          </div>

          <div className="calibration-footer">
            {step === 1 ? (
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'flex-end' }}>
                <button 
                  onClick={handleNextStep}
                  disabled={corners.length < 4 || isDetecting}
                  style={{ padding: '0.5rem 1.5rem', background: '#2563eb', border: 'none', borderRadius: '6px', color: 'white', cursor: (corners.length < 4 || isDetecting) ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: (corners.length < 4 || isDetecting) ? 0.5 : 1 }}
                >
                  {isDetecting ? 'Processing...' : 'Next'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => { setCropBoxPoints([[300, 450], [1300, 1150]]); }}
                  style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  Reset Box
                </button>
                <button 
                  disabled={cropBoxPoints.length < 2}
                  onClick={handleComplete}
                  style={{ padding: '0.5rem 1.5rem', background: '#10b981', border: 'none', borderRadius: '6px', color: 'white', cursor: cropBoxPoints.length < 2 ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: cropBoxPoints.length < 2 ? 0.5 : 1 }}
                >
                  Save & Complete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
