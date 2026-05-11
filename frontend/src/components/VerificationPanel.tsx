import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, ShieldCheck, Play, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import type { VerificationResponse } from '../types';

interface VerificationPanelProps {
    onVerify: (spice: string) => Promise<void>;
    result: VerificationResponse | null;
    isLoading: boolean;
    initialSpice?: string;
    cheatSpice?: string;
}

export const VerificationPanel: React.FC<VerificationPanelProps> = ({ onVerify, result, isLoading, initialSpice, cheatSpice }) => {
    const [spice, setSpice] = useState(initialSpice || '');

    useEffect(() => {
        if (initialSpice) setSpice(initialSpice);
    }, [initialSpice]);

    const handleVerify = () => {
        if (!spice.trim()) return;
        onVerify(spice);
    };

    return (
        <div className="verification-panel" style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck className="text-blue-500" size={20} />
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Circuit Verification</h2>
            </div>

            <div className="spice-input-area">
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.5rem' }}>
                    Reference SPICE Netlist (.cir)
                </label>
                <textarea
                    value={spice}
                    onChange={(e) => setSpice(e.target.value)}
                    placeholder="Paste reference netlist here... (e.g. R1 N1 N2 1k)"
                    style={{
                        width: '100%',
                        height: '120px',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        resize: 'vertical'
                    }}
                />
            </div>

            <button
                onClick={handleVerify}
                disabled={isLoading || !spice.trim()}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: (isLoading || !spice.trim()) ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    opacity: (isLoading || !spice.trim()) ? 0.6 : 1
                }}
            >
                {isLoading ? 'Verifying...' : <><Play size={16} /> Verify Circuit</>}
            </button>

            {result && (
                <div style={{
                    marginTop: '0.5rem',
                    padding: '1rem',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: result.is_matched ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${result.is_matched ? '#bbf7d0' : '#fecaca'}`,
                    animation: 'fadeIn 0.3s ease'
                }}>
                    {result.is_matched ? (
                        <>
                            <CheckCircle size={24} color="#22c55e" />
                            <div>
                                <strong style={{ color: '#166534', display: 'block' }}>Circuit Verified</strong>
                                <span style={{ fontSize: '0.85rem', color: '#166534' }}>Topology matches the reference.</span>
                            </div>
                        </>
                    ) : (
                        <div style={{ width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <XCircle size={24} color="#ef4444" />
                                <div>
                                    <strong style={{ color: '#991b1b', display: 'block' }}>Verification Failed</strong>
                                    <span style={{ fontSize: '0.85rem', color: '#991b1b' }}>Circuit topology or values do not match the reference.</span>
                                </div>
                            </div>
                            
                            {result.report && result.report.ref_values && result.report.det_values && (
                                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '0.85rem' }}>
                                    <strong style={{ display: 'block', marginBottom: '0.25rem', color: '#7f1d1d' }}>Value Diagnostic:</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontWeight: 600, borderBottom: '1px solid #fecaca', paddingBottom: '0.25rem' }}>
                                        <span>Component</span>
                                        <span>Reference SPICE</span>
                                        <span>Detected Board</span>
                                    </div>
                                    {Object.keys(result.report.ref_values).map(comp => {
                                        const refVal = result.report.ref_values[comp];
                                        const detVal = result.report.det_values[comp] || 'Missing';
                                        const isPolarityError = result.report.polarity_errors && result.report.polarity_errors.includes(comp);
                                        
                                        // Simple string comparison for UI highlighting, backend does the real check
                                        const refStr = String(refVal || '').toLowerCase().trim();
                                        const detStr = String(detVal || '').toLowerCase().trim();
                                        const isValueMismatch = refStr && refStr !== 'none' && refStr !== detStr;
                                        
                                        const isError = isPolarityError || isValueMismatch || detVal === 'Missing';

                                        return (
                                            <div key={comp} style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: '1fr 1fr 1fr', 
                                                gap: '0.5rem', 
                                                padding: '0.25rem 0', 
                                                color: isError ? '#dc2626' : '#166534',
                                                backgroundColor: isPolarityError ? '#fff1f2' : 'transparent',
                                                borderRadius: '4px'
                                            }}>
                                                <span>{comp}</span>
                                                <span>{refVal || 'None'}</span>
                                                <span>{isPolarityError ? <span style={{fontWeight: 700}}>Polarity Error</span> : detVal}</span>
                                            </div>
                                        );
                                    })}
                                    <div style={{ marginTop: '0.5rem', fontStyle: 'italic', color: '#94a3b8', fontSize: '0.75rem' }}>
                                        * Note: If values match but it still fails, the wire connections (topology) or polarities are wrong.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            {cheatSpice && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div>
                            <strong style={{ fontSize: '0.85rem', color: '#475569', display: 'block' }}>Test Circuit Reference String</strong>
                        </div>
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(cheatSpice);
                                toast.success('Copied test string to clipboard!');
                            }}
                            title="Copy to clipboard"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', color: '#475569' }}
                        >
                            <Copy size={14} /> Copy
                        </button>
                    </div>
                    <pre style={{ fontSize: '0.85rem', color: '#334155', margin: 0, padding: '0.5rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{cheatSpice}</pre>
                </div>
            )}
        </div>
    );
};
