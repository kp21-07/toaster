import { useState } from 'react';
import './App.css';
import { UploadArea } from './components/UploadArea';
import { NetlistViewer } from './components/NetlistViewer';
import { ComponentList } from './components/ComponentList';
import { ImageOverlay } from './components/ImageOverlay';
import { analyzeImage } from './api/client';
import type { AnalysisResponse } from './types';
import { AlertCircle, RefreshCw } from 'lucide-react';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      // Call the API
      const result = await analyzeImage(selectedFile);
      setData(result);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to analyze image. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setData(null);
    setError(null);
  };

  return (
    <div className="app-container">
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Toaster</h1>
        <p>Breadboard to SPICE Netlist Converter</p>
      </header>

      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: data ? 'minmax(400px, 45%) 1fr' : '1fr',
        gap: '2rem',
        alignItems: 'start',
        transition: 'all 0.3s ease'
      }}>

        {/* Left Column: Input / Visualization */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: data ? 'auto' : '600px', margin: data ? '0' : '0 auto' }}>

          {!data ? (
            // State A: Upload Mode
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <UploadArea onFileSelect={handleFileSelect} isLoading={isLoading} />
              {file && !isLoading && !error && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Processing: <strong>{file.name}</strong>
                </div>
              )}
            </div>
          ) : (
            // State B: Result Mode (Overlay)
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.5s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Visual Analysis</h2>
                <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                  <RefreshCw size={16} /> New Upload
                </button>
              </div>

              <ImageOverlay
                imageFile={file}
                warpedImageBase64={data.warped_image}
                components={data.components}
              />

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Hover over the blue boxes to identify components.
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#ef4444',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center'
            }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right Column: Results Table & Netlist */}
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.5s' }}>

            <div>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Detected Components</h2>
              <ComponentList components={data.components} />
            </div>

            <div>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>SPICE Output</h2>
              <NetlistViewer netlist={data.netlist} />
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default App;
