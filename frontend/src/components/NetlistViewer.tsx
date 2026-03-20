import React from 'react'
import { Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import './NetlistViewer.css'

interface NetlistViewerProps {
	netlist : string;
}

export const NetlistViewer: React.FC<NetlistViewerProps> = ({ netlist }) => {
	const handleCopy = () => {
		navigator.clipboard.writeText(netlist);
		toast.success('Copied to clipboard!');
	};

	// Helper to highlight SPICE syntax simply
	const highlightSyntax = (code: string) => {
		return code.split('\n').map((line, i) => {
			if (line.trim().startsWith('*')) {
				return <div key={i} style={{ color: '#6b7280', fontStyle: 'italic' }}>{line}</div>;
			}
			const parts = line.split(' ').map((word, j) => {
				// Node or component names
				if (j === 0) return <span key={j} style={{ color: '#2563eb', fontWeight: 600 }}>{word} </span>;
				// Values (numbers/multipliers)
				if (/^[\d.]+[A-Za-z]*$/.test(word)) return <span key={j} style={{ color: '#059669' }}>{word} </span>;
				return <span key={j}>{word} </span>;
			});
			return <div key={i} style={{ minHeight: '1.2em' }}>{parts}</div>;
		});
	};

	return (
    <div className="netlist-container">
      <div className="netlist-header">
        <span className="netlist-title">SPICE Netlist</span>
        <button className="copy-button" onClick={handleCopy} title="Copy to clipboard">
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Copy size={14} /> Copy
            </span>
        </button>
      </div>
      <pre className="netlist-code">
        <code>{highlightSyntax(netlist)}</code>
      </pre>
    </div>
  );
};
