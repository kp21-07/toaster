import React from 'react';
import type { CircuitComponent } from '../types';

interface ComponentVisualsProps {
  component: CircuitComponent;
  isSlim: boolean;
}

export const ComponentVisuals: React.FC<ComponentVisualsProps> = ({ component, isSlim }) => {
  return (
    <>
      {/* Floating terminal labels securely anchored via explicit logical drops */}
      {component.terminals && component.terminals.length >= 1 && (
        <>
          <div style={{ position: 'absolute', top: '50%', left: '-20px', width: '20px', height: '4px', backgroundColor: '#94a3b8', transform: 'translateY(-50%)', zIndex: -1, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)', borderRadius: '2px 0 0 2px' }} />
          <div style={{ position: 'absolute', top: '50%', left: '-20px', width: '6px', height: '6px', backgroundColor: '#cbd5e1', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: -1, border: '1px solid #475569' }} />
          <div className="comp-pin-label" style={{ position: 'absolute', top: '50%', left: '-20px', transform: 'translate(-100%, -50%)', background: '#fef08a', color: '#854d0e', padding: '1px 6px', fontSize: '0.65rem', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600, border: '1px solid #fde047', pointerEvents: 'none' }}>
            {component.terminals[0]}
          </div>
        </>
      )}
      {component.terminals && component.terminals.length >= 2 && (
        <>
          <div style={{ position: 'absolute', top: '50%', right: '-20px', width: '20px', height: '4px', backgroundColor: '#94a3b8', transform: 'translateY(-50%)', zIndex: -1, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)', borderRadius: '0 2px 2px 0' }} />
          <div style={{ position: 'absolute', top: '50%', right: '-20px', width: '6px', height: '6px', backgroundColor: '#cbd5e1', borderRadius: '50%', transform: 'translate(50%, -50%)', zIndex: -1, border: '1px solid #475569' }} />
          <div className="comp-pin-label" style={{ position: 'absolute', top: '50%', right: '-20px', transform: 'translate(100%, -50%)', background: '#fef08a', color: '#854d0e', padding: '1px 6px', fontSize: '0.65rem', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600, border: '1px solid #fde047', pointerEvents: 'none' }}>
            {component.terminals[1]}
          </div>
        </>
      )}
      {component.terminals && component.terminals.length >= 3 && (
        <>
          <div style={{ position: 'absolute', top: '-20px', left: '50%', width: '4px', height: '20px', backgroundColor: '#94a3b8', transform: 'translateX(-50%)', zIndex: -1, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)', borderRadius: '2px 2px 0 0' }} />
          <div style={{ position: 'absolute', top: '-20px', left: '50%', width: '6px', height: '6px', backgroundColor: '#cbd5e1', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: -1, border: '1px solid #475569' }} />
          <div className="comp-pin-label" style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translate(-50%, -100%)', background: '#fef08a', color: '#854d0e', padding: '1px 6px', fontSize: '0.65rem', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600, border: '1px solid #fde047', pointerEvents: 'none' }}>
            {component.terminals[2]}
          </div>
        </>
      )}

      <span className="comp-name" style={{ fontSize: '1rem', textAlign: 'center', lineHeight: 1.2 }}>{component.name}</span>
      <span className="comp-value" style={{ fontSize: '0.8rem', marginTop: isSlim ? 0 : 2 }}>{component.value}</span>
    </>
  );
};
