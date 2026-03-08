import React from 'react';
import type { CircuitComponent } from '../types';
import './ComponentList.css';
interface ComponentListProps {
  components: CircuitComponent[];
}
export const ComponentList: React.FC<ComponentListProps> = ({ components }) => {
  if (!components || components.length === 0) {
    return <div className="component-list-empty">No components detected.</div>;
  }
  return (
    <div className="component-list-container">
      <table className="component-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Terminals</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {components.map((comp) => (
            <tr key={comp.id}>
              <td style={{ fontWeight: 500 }}>{comp.name}</td>
              <td>
                <span className="comp-type-badge">{comp.type}</span>
              </td>
              <td>{comp.terminals.join(', ')}</td>
              <td>{comp.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
