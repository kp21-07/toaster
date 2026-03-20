import { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import './App.css';
import { UploadArea } from './components/UploadArea';
import { NetlistViewer } from './components/NetlistViewer';
import { ComponentList } from './components/ComponentList';
import { VirtualBreadboard } from './components/VirtualBreadboard';
import { analyzeImage } from './api/client';
import type { AnalysisResponse, CircuitComponent } from './types';
import { RefreshCw, Plus, Undo, Redo, Download, Upload } from 'lucide-react';
import { autoRouteCircuit } from './utils/breadboardRouter';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [history, setHistory] = useState<AnalysisResponse[]>([]);
  const [future, setFuture] = useState<AnalysisResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawingWire, setIsDrawingWire] = useState(false);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', type: 'resistor', value: '1k' });

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

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setData(null);
    setHistory([]);
    setFuture([]);

    try {
      // Send the image to the backend and grab the response directly 
      const result = await analyzeImage(selectedFile);
      setData(result);
      toast.success("Analysis complete!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || err.message || "Failed to process the input.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setData(null);
    setHistory([]);
    setFuture([]);
  };

  const handleComponentsUpdate = (updatedComponents: CircuitComponent[]) => {
    updateDataWithHistory(prev => prev ? { ...prev, components: updatedComponents } : prev);
  };

  const generateSpiceNetlist = (components: CircuitComponent[]) => {
    let spice = "* Auto-generated Netlist from Interactive Board\n";
    components.forEach(c => {
       const terminals = c.terminals ? c.terminals.join(' ') : '';
       spice += `${c.name} ${terminals} ${c.value}\n`;
    });
    spice += ".end\n";
    return spice;
  };

  const handleUpdateBoard = () => {
    if (data) {
      const electricallyRoutedComponents = autoRouteCircuit(data.components, data.wires || []);
      const newNetlist = generateSpiceNetlist(electricallyRoutedComponents);
      updateDataWithHistory({ ...data, components: electricallyRoutedComponents, netlist: newNetlist });
      toast.success("Electrical paths routed & Netlist updated.");
    }
  };

  const confirmUpdateBoard = () => {
     if (window.confirm("Update Board and recalculate SPICE Netlist nodes natively?")) {
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
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${url} (has the backend written it yet?)`);
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
           toast.success("Project imported successfully.");
        } else {
           toast.error("Invalid project file.");
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
     
     const newCompId = Math.max(0, ...(data.components || []).map(c => c.id)) + 1;
     const componentX = 200;
     const componentY = 150;
     
     let name = customName.trim();
     let numTerminals = 2;
     
     if (type === 'transistor') numTerminals = 3;

     if (!name) {
       if (type === 'resistor') { name = `R${newCompId}_new`; }
       else if (type === 'capacitor') { name = `C${newCompId}_new`; }
       else if (type === 'voltage_source') { name = `V${newCompId}_new`; }
       else if (type === 'transistor') { name = `Q${newCompId}_new`; }
       else { name = `U${newCompId}_new`; }
     }

     const newComp: CircuitComponent = {
         id: newCompId,
         name,
         type,
         value,
         box: [
           [componentX, componentY],
           [componentX + 60, componentY],
           [componentX + 60, componentY + 20],
           [componentX, componentY + 20]
         ],
         terminals: Array(numTerminals).fill('?')
     };
     
     updateDataWithHistory(prev => prev ? {
       ...prev,
       components: [...(prev.components || []), newComp]
     } : prev);
  };

  return (
    <div className="app-container">
      {/* Global Modals */}
      {showAddPopover && (
        <div className="modal-backdrop" onClick={() => setShowAddPopover(false)}>
          <div className="edit-popover" onClick={e => e.stopPropagation()}>
            <div className="edit-header" style={{ display: 'flex', justifyContent: 'center' }}>
               <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Add Component</h3>
            </div>
            <div className="edit-body">
              <div className="edit-field">
                <label>Name (Optional)</label>
                <input 
                  type="text" 
                  value={addForm.name} 
                  onChange={e => setAddForm({...addForm, name: e.target.value})}
                  placeholder="Auto-generated if empty"
                />
              </div>
              <div className="edit-field">
                <label>Value</label>
                <input 
                  type="text" 
                  value={addForm.value} 
                  onChange={e => setAddForm({...addForm, value: e.target.value})}
                  placeholder="e.g. 1k"
                />
              </div>
              <div className="edit-field">
                <label>Type</label>
                <select 
                  value={addForm.type} 
                  onChange={e => setAddForm({...addForm, type: e.target.value})}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: 'white' }}
                >
                  <option value="resistor">Resistor</option>
                  <option value="capacitor">Capacitor</option>
                  <option value="transistor">Transistor</option>
                  <option value="voltage_source">Voltage Source</option>
                </select>
              </div>
              <div className="edit-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn-save" onClick={() => {
                    handleAddComponent(addForm.type, addForm.value, addForm.name);
                    setShowAddPopover(false);
                    setAddForm({ name: '', type: 'resistor', value: '1k' }); // reset
                }} style={{ flex: 1 }}>Apply</button>
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
             <button onClick={handleExportJson} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '0.5rem 1rem', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }} title="Save Project locally">
               <Download size={16} /> Save
             </button>
             <label htmlFor="import-json" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', padding: '0.5rem 1rem', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }} title="Load Project">
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
        gap: '2rem',
        transition: 'all 0.3s ease'
      }}>

        {/* Top Content: Input / Visualization */}
        <Toaster position="bottom-center" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: data ? '100%' : '600px', margin: '0 auto' }}>

          {!data ? (
            // State A: Upload Mode
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <UploadArea onFileSelect={handleFileSelect} isLoading={isLoading} />
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                <button 
                  onClick={() => handleLoadJson('/test.json')}
                  style={{ padding: '0.6rem 1.2rem', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 500, color: '#374151' }}
                >
                  Load test.json
                </button>
              </div>

              {file && !isLoading && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Processing: <strong>{file.name}</strong>
                </div>
              )}
            </div>
          ) : (
            // State B: Result Mode (Virtual Breadboard)
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.5s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h2 style={{ margin: 0 }}>Virtual Breadboard</h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                     <span style={{fontWeight: 500, color: '#3b82f6'}}>Guide:</span> Click a component to edit/delete. Right-click any wire handle to delete it.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button 
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    style={{ opacity: history.length === 0 ? 0.5 : 1, background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: history.length === 0 ? 'default' : 'pointer' }}
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo size={16} />
                  </button>
                  <button 
                    onClick={handleRedo}
                    disabled={future.length === 0}
                    style={{ opacity: future.length === 0 ? 0.5 : 1, background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: future.length === 0 ? 'default' : 'pointer' }}
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo size={16} />
                  </button>
                  <button 
                    onClick={() => setShowAddPopover(true)}
                    style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={16} /> Component
                  </button>
                  <button  
                    onClick={() => setIsDrawingWire(!isDrawingWire)}
                    style={{ background: isDrawingWire ? '#3b82f6' : '#f1f5f9', color: isDrawingWire ? 'white' : '#334155', border: '1px solid #cbd5e1', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={16} /> {isDrawingWire ? 'Drawing...' : 'Wire'}
                  </button>
                  <button  
                    onClick={confirmUpdateBoard}
                    style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                  >
                    Update Board
                  </button>
                </div>
              </div>

              <VirtualBreadboard 
                components={data.components} 
                wires={data.wires}
                isDrawingWire={isDrawingWire}
                onWireDrawn={() => setIsDrawingWire(false)}
                onComponentsUpdate={handleComponentsUpdate} 
                onWiresUpdate={(newWires) => updateDataWithHistory(prev => prev ? { ...prev, wires: newWires } : prev)}
              />
            </div>
          )}
        </div>

        {/* Bottom Section: Split vertically */}
        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem', animation: 'fadeIn 0.5s', alignItems: 'start', paddingBottom: '2rem' }}>

            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0' }}>Detected Components</h2>
              <ComponentList components={data.components} />
            </div>

            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0' }}>SPICE Output</h2>
              <NetlistViewer netlist={data.netlist} />
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default App;
