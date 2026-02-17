import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import './NetlistViewer.css'

interface NetlistViewerProps {
	netlist : string;
}

export const NetlistViewer: React.FC<NetlistViewerProps> = ({ netlist }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(netlist);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
    <div className="netlist-container">
      <div className="netlist-header">
        <span className="netlist-title">SPICE Netlist</span>
        <button className="copy-button" onClick={handleCopy} title="Copy to clipboard">
          {copied ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={14} /> Copied
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Copy size={14} /> Copy
            </span>
          )}
        </button>
      </div>
      <pre className="netlist-code">
        <code>{netlist}</code>
      </pre>
    </div>
  );
};
