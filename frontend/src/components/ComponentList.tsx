import React from 'react';
import type { CircuitComponent } from '../types';
import './ComponentList.css';
interface ComponentListProps {
  components: CircuitComponent[];
  onUpdate: (id: number, field: keyof CircuitComponent, value: string) => void;
}

export const ComponentList: React.FC<ComponentListProps> = ({ components, onUpdate }) => {
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
              <td className="editable-cell">
                <input
                  className="component-edit-input"
                  type="text"
                  value={comp.name}
                  onChange={(e) => onUpdate(comp.id, 'name', e.target.value)}
                />
              </td>
              <td>
                <select
                  className="comp-type-badge component-type-select"
                  value={comp.type}
                  onChange={(e) => onUpdate(comp.id, 'type', e.target.value)}
                >
                  <option value="Resistor">Resistor</option>
                  <option value="Capacitor">Capacitor</option>
                  <option value="Inductor">Inductor</option>
                  <option value="LED">LED</option>
                  <option value="Source">Source</option>
                  <option value="Diode">Diode</option>
                  <option value="Transistor">Transistor</option>
                  <option value="IC">IC</option>
                  <option value="Wire">Wire</option>
                </select>
              </td>
              <td>{comp.terminals.join(', ')}</td>
              <td className="editable-cell">
                <input
                  className="component-edit-input"
                  type="text"
                  value={comp.value}
                  onChange={(e) => onUpdate(comp.id, 'value', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
