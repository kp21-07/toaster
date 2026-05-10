import { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import './App.css';
import { UploadArea } from './components/UploadArea';
import { NetlistViewer } from './components/NetlistViewer';
import { ComponentList } from './components/ComponentList';
import { VirtualBreadboard } from './components/VirtualBreadboard';
import { analyzeImage, solveCircuit, verifyCircuit } from './api/client';
import type { AnalysisResponse, CircuitComponent, VerificationResponse } from './types';
import { RefreshCw, Plus, Undo, Redo, Download, Upload, Target, Image } from 'lucide-react';
import { autoRouteCircuit } from './utils/breadboardRouter';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { VerificationPanel } from './components/VerificationPanel';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [history, setHistory] = useState<AnalysisResponse[]>([]);
  const [future, setFuture] = useState<AnalysisResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawingWire, setIsDrawingWire] = useState(false);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showPhotoOverlay, setShowPhotoOverlay] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', type: 'resistor', value: '1k' });
  const [verificationResult, setVerificationResult] = useState<VerificationResponse | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [mountingComponent, setMountingComponent] = useState<Partial<CircuitComponent> | null>(null);

  const updateDataWithHistory = (newData: AnalysisResponse | ((prev: AnalysisResponse | null) => AnalysisResponse | null)) => {
    setData((prev) => {
       const nextData = typeof newData === 'function' ? newData(prev) : newData;
       if (prev && nextData) {
          setHistory(h => [...h, prev]);
          setFuture([]);
       }
       return nextData;
    });
  };

  const handleUndo = () => {
     if (history.length === 0 || !data) return;
     const previousState = history[history.length - 1];
     setFuture(f => [data, ...f]);
     setHistory(h => h.slice(0, -1));
     setData(previousState);
  };

  const handleRedo = () => {
     if (future.length === 0 || !data) return;
     const nextState = future[0];
     setHistory(h => [...h, data]);
     setFuture(f => f.slice(1));
     setData(nextState);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
       if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
           if (e.shiftKey) handleRedo();
           else handleUndo();
       } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
           handleRedo();
       }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, future, data]);

  const processImage = async (fileToProcess: File, markers?: number[][], cropBox?: any) => {
    setIsLoading(true);
    try {
      const result = await analyzeImage(fileToProcess, markers, cropBox);
      setData(result);
      setHistory([]);
      setFuture([]);
      toast.success(markers ? "Calibration applied and analyzed!" : "Analysis complete!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setData(null);
    setHistory([]);
    setFuture([]);
    setIsCalibrating(true);
  };

  const handleCalibrationComplete = async (markers: number[][], cropBox?: any) => {
    if (!file) return;
    setIsCalibrating(false);
    
    if (cropBox) {
        localStorage.setItem('breadboardCropBox', JSON.stringify(cropBox));
    }
    
    const savedCropBoxStr = localStorage.getItem('breadboardCropBox');
    const finalCropBox = cropBox || (savedCropBoxStr ? JSON.parse(savedCropBoxStr) : undefined);
    
    await processImage(file, markers, finalCropBox);
  };

  const handleReset = () => {
    setFile(null);
    setData(null);
    setHistory([]);
    setFuture([]);
    setVerificationResult(null);
  };

  const handleComponentsUpdate = (updatedComponents: CircuitComponent[]) => {
    updateDataWithHistory(prev => prev ? { ...prev, components: updatedComponents } : prev);
  };

  const handleUpdateBoard = async () => {
    if (data) {
      try {
        const electricallyRoutedComponents = autoRouteCircuit(data.components, data.wires || []);
        const response = await solveCircuit(electricallyRoutedComponents, data.wires || []);
        updateDataWithHistory({ ...data, components: electricallyRoutedComponents, netlist: response.netlist });
        toast.success("Electrical paths routed & Netlist updated.");
      } catch (err: any) {
        console.error(err);
        toast.error("Failed to solve circuit.");
      }
    }
  };

  const handleVerify = async (spice: string) => {
    if (!data) return;
    setIsVerifying(true);
    try {
      const res = await verifyCircuit(data.components, data.wires || [], (data as any).grounds || [], spice);
      setVerificationResult(res);
      if (res.is_matched) {
        toast.success("Circuit verified successfully!");
      } else {
        toast.error("Circuit verification failed. Wrong topology.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Verification failed. Please check your SPICE syntax.");
    } finally {
      setIsVerifying(false);
    }
  };

  const confirmUpdateBoard = () => {
     if (window.confirm("Update Board and recalculate SPICE Netlist via Backend Solver?")) {
        handleUpdateBoard();
     }
  };

  const confirmReset = () => {
     if (window.confirm("Start a New Upload? This will permanently discard the current breadboard layout.")) {
        handleReset();
     }
  };

  const handleLoadJson = async (url: string) => {
    setFile(null);
    setIsLoading(true);
    setData(null);
    setHistory([]);
    setFuture([]);
    setVerificationResult(null); 
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${url}`);
      const jsonResult = await res.json();
      setData(jsonResult);
      toast.success(`Loaded ${url} successfully!`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || `Failed to load ${url}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toaster_project_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Project saved successfully.");
  };

  const handleExportSpice = () => {
    if (!data || !data.netlist) {
      toast.error("No netlist generated yet. Click 'Update Board' first.");
      return;
    }
    const blob = new Blob([data.netlist], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `circuit_${new Date().toISOString().slice(0, 10)}.cir`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SPICE Netlist (.cir) exported.");
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const importedData = JSON.parse(ev.target?.result as string);
        if (importedData && importedData.components) {
           setData(importedData);
           setHistory([]);
           setFuture([]);
           setFile(new File([], "imported.json"));
           setVerificationResult(null);
           toast.success("Project imported successfully.");
        }
      } catch (err) {
        toast.error("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddComponent = (type: string, value: string, customName: string) => {
     if (!data) return;
     // Enter cursor-mount mode: the component ghost follows the cursor until the user clicks to place it
     setMountingComponent({ type, value, name: customName.trim() || undefined });
     setShowAddPopover(false);
  };

  const handleMountComplete = (placed: CircuitComponent) => {
     updateDataWithHistory(prev => prev ? { ...prev, components: [...(prev.components || []), placed] } : prev);
     setMountingComponent(null);
  };

  // Reusable button style
  const btnStyle = { padding: '0.6rem 1.2rem', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 500, color: '#374151' };

  return (
    <div className="app-container">
      {isCalibrating && file && (
        <CalibrationOverlay 
          imageFile={file} 
          onCalibrationComplete={handleCalibrationComplete}
          onCancel={() => setIsCalibrating(false)}
        />
      )}
      
      {showAddPopover && (
        <div className="modal-backdrop" onClick={() => setShowAddPopover(false)}>
          <div className="edit-popover" onClick={e => e.stopPropagation()}>
            <div className="edit-header" style={{ display: 'flex', justifyContent: 'center' }}>
               <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Add Component</h3>
            </div>
            <div className="edit-body">
              <div className="edit-field">
                <label>Name (Optional)</label>
                <input type="text" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
              </div>
              <div className="edit-field">
                <label>Value</label>
                <input type="text" value={addForm.value} onChange={e => setAddForm({...addForm, value: e.target.value})} />
              </div>
              <div className="edit-field">
                <label>Type</label>
                <select value={addForm.type} onChange={e => setAddForm({...addForm, type: e.target.value})} style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.85rem', background: 'white' }}>
                  <option value="resistor">Resistor</option>
                  <option value="capacitor">Capacitor</option>
                  <option value="led">LED</option>
                  <option value="diode">Diode</option>
                  <option value="transistor">Transistor</option>
                  <option value="ic">Integrated Circuit (DIP-14)</option>
                  <option value="ic_dip8">Integrated Circuit (DIP-8)</option>
                  <option value="voltage_source">Voltage Source</option>
                </select>
              </div>
              <div className="edit-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn-save" onClick={() => { handleAddComponent(addForm.type, addForm.value, addForm.name); setShowAddPopover(false); }} style={{ flex: 1 }}>Apply</button>
                <button className="btn-cancel" onClick={() => setShowAddPopover(false)} style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header style={{ position: 'relative', marginBottom: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0' }}>Toaster</h1>
          <p style={{ margin: '0.5rem 0 0 0' }}>Breadboard to SPICE Netlist Converter</p>
        </div>
        {data && (
           <div style={{ position: 'absolute', right: '0', display: 'flex', gap: '0.5rem' }}>
             <button onClick={handleExportJson} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '0.5rem 1rem', background: '#f8fafc', color: '#334155', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }} title="Save Project locally">
               <Download size={16} /> Save
             </button>
             <button onClick={() => setShowPhotoOverlay(!showPhotoOverlay)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '0.5rem 1rem', background: showPhotoOverlay ? '#2563eb' : '#f8fafc', color: showPhotoOverlay ? 'white' : '#2563eb', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }} title="Show original photo under the grid">
               <Image size={16} /> {showPhotoOverlay ? 'Hide Photo' : 'Show Photo'}
             </button>
             <button onClick={() => setIsCalibrating(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '0.5rem 1rem', background: '#f8fafc', color: '#2563eb', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }} title="Manually calibrate board corners">
               <Target size={16} /> Calibrate
             </button>
             <label htmlFor="import-json" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '0.5rem 1rem', background: '#f8fafc', color: '#334155', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }} title="Load Project">
               <Upload size={16} /> Load
               <input id="import-json" type="file" accept=".json" onChange={handleImportJson} style={{ display: 'none' }} />
             </label>
             <button onClick={confirmReset} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '0.5rem 1rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
               <RefreshCw size={16} /> New Upload
             </button>
           </div>
        )}
      </header>

      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem'
      }}>
        <Toaster position="bottom-center" />
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: data ? '100%' : '600px', margin: '0 auto' }}>
          {!data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <UploadArea onFileSelect={handleFileSelect} isLoading={isLoading} />
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => handleLoadJson('/test.json')} style={btnStyle}>Load Transistor</button>
                <button onClick={() => handleLoadJson('/test_led.json')} style={btnStyle}>Load Simple LED</button>
                <button onClick={() => handleLoadJson('/test_divider.json')} style={btnStyle}>Load Voltage Divider</button>
                <button onClick={() => handleLoadJson('/test_parallel.json')} style={btnStyle}>Load Parallel Resistors</button>
                <button onClick={() => handleLoadJson('/test_rc_filter.json')} style={btnStyle}>Load RC Filter</button>
                <button onClick={() => handleLoadJson('/test_series_leds.json')} style={btnStyle}>Load Series LEDs</button>
              </div>
            </div>
          ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.5s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h2 style={{ margin: 0 }}>Virtual Breadboard</h2>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button onClick={handleUndo} disabled={history.length === 0} style={{ opacity: history.length === 0 ? 0.5 : 1, background: '#f8fafc', color: '#334155', border: '1px solid #e5e7eb', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer' }}><Undo size={16} /></button>
                  <button onClick={handleRedo} disabled={future.length === 0} style={{ opacity: future.length === 0 ? 0.5 : 1, background: '#f8fafc', color: '#334155', border: '1px solid #e5e7eb', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer' }}><Redo size={16} /></button>
                  <button onClick={() => setShowAddPopover(true)} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #e5e7eb', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={16} /> Component</button>
                  <button onClick={() => setIsDrawingWire(!isDrawingWire)} style={{ background: isDrawingWire ? '#2563eb' : '#f1f5f9', color: isDrawingWire ? 'white' : '#334155', border: '1px solid #e5e7eb', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={16} /> {isDrawingWire ? 'Drawing...' : 'Wire'}</button>
                  <button onClick={confirmUpdateBoard} style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Update Board</button>
                </div>
              </div>

              <VirtualBreadboard 
                components={data.components} 
                wires={data.wires}
                isDrawingWire={isDrawingWire}
                warpedImage={showPhotoOverlay ? (data.warped_image ?? undefined) : undefined}
                onWireDrawn={() => setIsDrawingWire(false)}
                onComponentsUpdate={handleComponentsUpdate} 
                onWiresUpdate={(newWires) => updateDataWithHistory(prev => prev ? { ...prev, wires: newWires } : prev)}
                mountingComponent={mountingComponent}
                onMountComplete={handleMountComplete}
                onMountCancel={() => setMountingComponent(null)}
              />
            </div>
          )}
        </div>

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem', animation: 'fadeIn 0.5s', alignItems: 'start', paddingBottom: '2rem' }}>
            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0' }}>Detected Components</h2>
              <ComponentList components={data.components} />
            </div>
            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>SPICE Output</h2>
                <button 
                  onClick={handleExportSpice} 
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  <Download size={14} /> .CIR
                </button>
              </div>
              <NetlistViewer netlist={data.netlist} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <VerificationPanel 
                onVerify={handleVerify} 
                result={verificationResult} 
                isLoading={isVerifying} 
                cheatSpice={(data as any).reference_spice}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
