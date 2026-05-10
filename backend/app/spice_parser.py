import re
from typing import List, Dict, Any

class SpiceParser:
    """
    Parses a standard .cir SPICE netlist file into a structured format.
    """
    
    # Mapping SPICE prefixes to readable component types
    PREFIX_MAP = {
        'R': 'resistor',
        'C': 'capacitor',
        'L': 'inductor',
        'D': 'diode', 
        'Q': 'transistor',
        'M': 'transistor',
        'V': 'voltage_source',
        'I': 'current_source',
        'U': 'ic',
        'X': 'ic'
    }

    @staticmethod
    def parse_netlist(netlist_text: str) -> List[Dict[str, Any]]:
        """
        Parses SPICE text and returns a list of component dictionaries.
        
        Example line: R1 NetA NetB 10k
        Returns: { 'name': 'R1', 'type': 'resistor', 'nodes': ['NetA', 'NetB'], 'value': '10k' }
        """
        components = []
        lines = netlist_text.splitlines()
        
        for line in lines:
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith('*') or line.startswith('.'):
                continue
            
            parts = line.split()
            if len(parts) < 3:
                continue
            
            name = parts[0]
            upper_name = name.upper()
            
            # Heuristic: Check for multi-char prefix 'LED' first
            if upper_name.startswith('LED'):
                comp_type = 'led'
                num_nodes = 2
            else:
                prefix = upper_name[0]
                comp_type = SpiceParser.PREFIX_MAP.get(prefix, 'unknown')
                
                # Determine how many nodes to expect based on type
                if prefix in ['R', 'C', 'L', 'V', 'I', 'D']:
                    num_nodes = 2
                elif prefix == 'Q':
                    num_nodes = 3
                elif prefix == 'M':
                    num_nodes = 4
                else:
                    num_nodes = len(parts) - 2 # Assuming last part is value/model
            
            nodes = parts[1:1+num_nodes]
            value = parts[1+num_nodes] if len(parts) > 1+num_nodes else ""
            
            components.append({
                'name': name,
                'type': comp_type,
                'nodes': nodes,
                'value': value
            })
            
        return components

def normalize_node(node: str) -> str:
    """
    Normalizes node names (e.g., '0' is always GND).
    """
    if node == '0' or node.upper() == 'GND':
        return '0'
    return node
