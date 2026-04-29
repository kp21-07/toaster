import React from 'react';
import { pitch, paddingX, paddingY } from '../utils/breadboardMath';

interface BreadboardBackgroundProps {
  warpedImage?: string;
}

export const BreadboardBackground: React.FC<BreadboardBackgroundProps> = ({ warpedImage }) => {
  const width = 928;
  const height = 586;

  const powerHoles: number[] = [];
  for (let g = 0; g < 10; g++) {
    for (let h = 0; h < 5; h++) {
      powerHoles.push(2 + g * 6 + h); 
    }
  }

  const terminalCols = Array.from({ length: 63 }, (_, i) => i);
  const topTerminalRows = [4, 5, 6, 7, 8];
  const botTerminalRows = [11, 12, 13, 14, 15];

  return (
    <svg 
      viewBox={`0 0 ${width} ${height}`} 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, opacity: 0.9 }}
      preserveAspectRatio="none"
    >
        <rect width="100%" height="100%" fill="#f8fafc" />
        
        {warpedImage && (
          <image 
            href={`data:image/jpeg;base64,${warpedImage}`} 
            width="100%" 
            height="100%" 
            preserveAspectRatio="none"
            opacity="0.6"
          />
        )}

        {[0, 20].map(yBase => (
          <g key={`breadboard-segment-${yBase}`} transform={`translate(0, ${yBase * pitch})`}>
            {/* Power Lines */}
            <line x1={paddingX + 2*pitch - 10} y1={paddingY} x2={paddingX + 60*pitch + 10} y2={paddingY} stroke="#ef4444" strokeWidth="3" opacity="0.8" />
            <line x1={paddingX + 2*pitch - 10} y1={paddingY + 3 * pitch} x2={paddingX + 60*pitch + 10} y2={paddingY + 3 * pitch} stroke="#3b82f6" strokeWidth="3" opacity="0.8" />

            <line x1={paddingX + 2*pitch - 10} y1={paddingY + 16 * pitch} x2={paddingX + 60*pitch + 10} y2={paddingY + 16 * pitch} stroke="#ef4444" strokeWidth="3" opacity="0.8" />
            <line x1={paddingX + 2*pitch - 10} y1={paddingY + 19 * pitch} x2={paddingX + 60*pitch + 10} y2={paddingY + 19 * pitch} stroke="#3b82f6" strokeWidth="3" opacity="0.8" />

            <g fill="#475569">
                {/* Top Power Rows */}
                {powerHoles.map(col => (
                   <circle key={`tpr-${col}`} cx={paddingX + col * pitch} cy={paddingY + pitch} r="2.5" />
                ))}
                {powerHoles.map(col => (
                   <circle key={`tpb-${col}`} cx={paddingX + col * pitch} cy={paddingY + 2 * pitch} r="2.5" />
                ))}
                {/* Top Terminal Strip */}
                {terminalCols.map(col => topTerminalRows.map(row => (
                   <circle key={`tt-${col}-${row}`} cx={paddingX + col * pitch} cy={paddingY + row * pitch} r="2.5" />
                )))}
                {/* Bottom Terminal Strip */}
                {terminalCols.map(col => botTerminalRows.map(row => (
                   <circle key={`bt-${col}-${row}`} cx={paddingX + col * pitch} cy={paddingY + row * pitch} r="2.5" />
                )))}
                {/* Bottom Power Rows */}
                {powerHoles.map(col => (
                   <circle key={`bpr-${col}`} cx={paddingX + col * pitch} cy={paddingY + 17 * pitch} r="2.5" />
                ))}
                {powerHoles.map(col => (
                   <circle key={`bpb-${col}`} cx={paddingX + col * pitch} cy={paddingY + 18 * pitch} r="2.5" />
                ))}
            </g>

            <g fill="#94a3b8" fontSize="8" fontFamily="sans-serif" textAnchor="middle">
              {terminalCols.filter(c => c % 5 === 0).map(col => (
                 <React.Fragment key={`lbl-col-${col}`}>
                    <text x={paddingX + col * pitch} y={paddingY + 3.5 * pitch}>{col}</text>
                    <text x={paddingX + col * pitch} y={paddingY + 10.5 * pitch}>{col}</text>
                    <text x={paddingX + col * pitch} y={paddingY + 15.5 * pitch}>{col}</text>
                 </React.Fragment>
              ))}
            </g>

            <g fill="#94a3b8" fontSize="9" fontFamily="sans-serif" textAnchor="start" dominantBaseline="middle">
              {['A','B','C','D','E'].map((letter, i) => (
                 <text key={`right-${letter}`} x={paddingX + 62 * pitch + 10} y={paddingY + (4 + i) * pitch}>{letter}</text>
              ))}
              {['F','G','H','I','J'].map((letter, i) => (
                 <text key={`right-${letter}`} x={paddingX + 62 * pitch + 10} y={paddingY + (11 + i) * pitch}>{letter}</text>
              ))}
              {['A','B','C','D','E'].map((letter, i) => (
                 <text key={`left-${letter}`} x={paddingX - 15} y={paddingY + (4 + i) * pitch}>{letter}</text>
              ))}
              {['F','G','H','I','J'].map((letter, i) => (
                 <text key={`left-${letter}`} x={paddingX - 15} y={paddingY + (11 + i) * pitch}>{letter}</text>
              ))}
            </g>

            <g fill="#ef4444" fontSize="12" fontWeight="bold">
               <text x={paddingX + 2*pitch - 22} y={paddingY + 4}>+</text>
               <text x={paddingX + 60*pitch + 22} y={paddingY + 4}>+</text>
               <text x={paddingX + 2*pitch - 22} y={paddingY + 16 * pitch + 4}>+</text>
               <text x={paddingX + 60*pitch + 22} y={paddingY + 16 * pitch + 4}>+</text>
            </g>
            <g fill="#3b82f6" fontSize="16" fontWeight="bold">
               <text x={paddingX + 2*pitch - 22} y={paddingY + 3 * pitch + 5}>-</text>
               <text x={paddingX + 60*pitch + 22} y={paddingY + 3 * pitch + 5}>-</text>
               <text x={paddingX + 2*pitch - 22} y={paddingY + 19 * pitch + 5}>-</text>
               <text x={paddingX + 60*pitch + 22} y={paddingY + 19 * pitch + 5}>-</text>
            </g>
          </g>
        ))}
    </svg>
  );
};
