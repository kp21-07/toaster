import networkx as nx
from networkx.algorithms import isomorphism
from typing import List, Dict, Any, Tuple

class CircuitGraphBuilder:
    """
    Builds bipartite graphs from circuit descriptions.
    A bipartite graph has two types of nodes: 'component' and 'net'.
    """

    @staticmethod
    def build_from_spice(spice_components: List[Dict[str, Any]]) -> nx.Graph:
        G = nx.Graph()
        
        for comp in spice_components:
            comp_name = comp['name']
            comp_type = comp['type']
            nodes = comp['nodes']
            value = comp.get('value', '')
            
            # Add component node
            G.add_node(comp_name, type='component', comp_type=comp_type, value=str(value))
            
            # Add net nodes and edges
            for i, net in enumerate(nodes):
                net_name = f"net_{net}"
                if not G.has_node(net_name):
                    # Store the original net ID (e.g. '0' for ground)
                    G.add_node(net_name, type='net', net_id=str(net))
                
                # Assign pin roles for non-symmetric components
                pin_role = str(i + 1)
                if comp_type == 'led':
                    pin_role = 'anode' if i == 0 else 'cathode'
                elif comp_type == 'transistor':
                    pin_role = ['collector', 'base', 'emitter'][i] if i < 3 else str(i+1)
                
                G.add_edge(comp_name, net_name, pin_role=pin_role)
                
        return G

    @staticmethod
    def build_from_detected(components: List[Any], node_map: Dict[str, int]) -> nx.Graph:
        """
        Builds graph from CV detected components.
        """
        G = nx.Graph()
        
        for comp in components:
            # Handle Pydantic models or dicts
            if hasattr(comp, 'name'):
                name, ctype, terminals, value = comp.name, comp.type, comp.terminals, comp.value
            else:
                name, ctype, terminals, value = comp.get('name'), comp.get('type'), comp.get('terminals'), comp.get('value', '')
            
            # Normalize type
            ctype = ctype.lower()
            if 'resistor' in ctype: ctype = 'resistor'
            elif 'led' in ctype: ctype = 'led'
            elif 'transistor' in ctype: ctype = 'transistor'
            
            G.add_node(name, type='component', comp_type=ctype, value=str(value))
            
            for i, hole in enumerate(terminals):
                net_id = str(node_map.get(hole, hole))
                net_name = f"net_{net_id}"
                
                if not G.has_node(net_name):
                    G.add_node(net_name, type='net', net_id=net_id)
                
                pin_role = str(i + 1)
                if ctype == 'led':
                    pin_role = 'anode' if i == 0 else 'cathode'
                elif ctype == 'transistor':
                    pin_role = ['collector', 'base', 'emitter'][i] if i < 3 else str(i+1)
                
                G.add_edge(name, net_name, pin_role=pin_role)
                
        return G

def normalize_val(v):
    if not v or v.lower() == 'none': return ""
    v = v.lower().strip()
    v = v.replace('ohm', '').replace('ω', '').replace('v', '').replace('a', '').strip()
    
    # Handle multipliers
    multipliers = {'k': 1e3, 'm': 1e-3, 'u': 1e-6, 'n': 1e-9, 'p': 1e-12, 'meg': 1e6}
    
    try:
        # Check for suffix
        for suffix, mult in multipliers.items():
            if v.endswith(suffix):
                num_part = v[:-len(suffix)].strip()
                return float(num_part) * mult
        return float(v)
    except ValueError:
        return v

def node_match(n1, n2):
    """
    n1: Reference Node, n2: Detected Node
    """
    if n1['type'] != n2['type']:
        return False
    
    if n1['type'] == 'component':
        # 1. Type Match
        if n1['comp_type'] != n2['comp_type']:
            return False
        
        # 2. Value Match
        v1 = n1.get('value', '')
        v2 = n2.get('value', '')
        
        # If reference has a value, detected MUST have a matching value
        if v1 and v1.lower() != 'none':
            norm1 = normalize_val(v1)
            norm2 = normalize_val(v2)
            if norm1 != norm2:
                # print(f"Value mismatch: {v1} ({norm1}) != {v2} ({norm2})")
                return False
        
        return True
        
    if n1['type'] == 'net':
        id1 = n1.get('net_id')
        id2 = n2.get('net_id')
        # Ground anchoring
        if id1 == '0' or id2 == '0':
            return id1 == id2
        return True
    return True

def edge_match(e1, e2):
    return e1['pin_role'] == e2['pin_role']

def compare_circuits(G_ref: nx.Graph, G_det: nx.Graph) -> Tuple[bool, Dict]:
    """
    Compares two circuit graphs.
    Returns (is_matched, report).
    """
    
    def get_report(mapping, isomorphic, polarity_errors=None):
        ref_components = [n for n in G_ref.nodes if G_ref.nodes[n]['type'] == 'component']
        ref_vals = {}
        det_vals = {}
        errors = polarity_errors or []
        
        for ref_n in ref_components:
            ref_vals[ref_n] = G_ref.nodes[ref_n].get('value', '')
            if mapping and ref_n in mapping:
                det_n = mapping[ref_n]
                det_vals[ref_n] = G_det.nodes[det_n].get('value', '')
            else:
                det_vals[ref_n] = "Missing"
                
        return {
            "is_isomorphic": isomorphic,
            "ref_values": ref_vals,
            "det_values": det_vals,
            "polarity_errors": errors,
            "mapping": mapping if isomorphic else None
        }

    # 1. Normalize symmetric components in original graphs
    for G in [G_ref, G_det]:
        for u, v, data in G.edges(data=True):
            comp_node = u if G.nodes[u]['type'] == 'component' else v
            if G.nodes[comp_node]['comp_type'] in ['resistor', 'capacitor', 'inductor']:
                data['pin_role'] = 'symmetric'

    # 2. Try Strict Match
    matcher = isomorphism.GraphMatcher(G_ref, G_det, node_match=node_match, edge_match=edge_match)
    if matcher.is_isomorphic():
        return True, get_report(matcher.mapping, True)

    # 3. Try Relaxed Match (Polarity Ignored)
    G_ref_rel = G_ref.copy()
    G_det_rel = G_det.copy()
    for G in [G_ref_rel, G_det_rel]:
        for u, v, data in G.edges(data=True):
            comp_node = u if G.nodes[u]['type'] == 'component' else v
            if G.nodes[comp_node]['comp_type'] in ['led', 'diode']:
                data['pin_role'] = 'symmetric'
    
    matcher_rel = isomorphism.GraphMatcher(G_ref_rel, G_det_rel, node_match=node_match, edge_match=edge_match)
    if matcher_rel.is_isomorphic():
        mapping = matcher_rel.mapping
        polarity_errors = []
        for ref_n, det_n in mapping.items():
            if G_ref.nodes[ref_n]['type'] == 'component' and G_ref.nodes[ref_n]['comp_type'] in ['led', 'diode']:
                # Check if edges match in strict mode
                for net_ref in G_ref[ref_n]:
                    net_det = mapping[net_ref]
                    if G_ref[ref_n][net_ref]['pin_role'] != G_det[det_n][net_det]['pin_role']:
                        polarity_errors.append(ref_n)
                        break
        
        return False, get_report(mapping, False, polarity_errors)

    # 4. Failed completely
    return False, get_report(None, False)
