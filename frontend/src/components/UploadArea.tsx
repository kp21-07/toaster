import React, { useState, useRef } from 'react'
import { UploadCloud } from 'lucide-react'
import './UploadArea.css'

interface UploadAreaProps {
	onFileSelect: (file: File) => void;
	isLoading?: boolean;
}

export const UploadArea: React.FC<UploadAreaProps> = ({ onFileSelect, isLoading = false }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };
  const handleClick = () => {
    inputRef.current?.click();
  };
  return (
    <div 
      className={`upload-area ${isDragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input 
        ref={inputRef}
        type="file" 
        className="hidden" 
        onChange={handleChange}
        accept="image/*"
        style={{ display: 'none' }} 
      />
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <UploadCloud className="upload-icon" />
        {isLoading ? (
          <p className="upload-text">Processing image...</p>
        ) : (
          <>
            <p className="upload-text">Click or drag & drop breadboard image</p>
            <p className="upload-subtext">Supports JPG, PNG</p>
          </>
        )}
      </div>
    </div>
  );
};
