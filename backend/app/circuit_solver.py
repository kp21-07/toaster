from typing import List, Dict, Tuple, Union

# --- Type Aliases ---
PhysicalHole = str        # e.g., "A5", "U+"
ElectricalNode = str      # e.g., "A5", "F10" (canonical representative)
NodeID = int              # Integer ID used in SPICE (0 for ground)
Wire = List[Union[int, str, List[str]]] # [id, name, [foot1, foot2]]
ComponentData = Tuple[int, str, List[PhysicalHole], str] # (id, name, [foot1, foot2], spec)

def hole_to_node(hole: PhysicalHole) -> ElectricalNode:
    """
    Maps a physical hole coordinate (e.g., 'C5', 'J10') to its canonical electrical node ID.
    On a breadboard, columns A-E are centrally connected row-wise (no, column-wise, rows 1-63),
    and F-J are connected similarly. Power rails are connected lengthwise.
    
    Correction: In standard breadboards:
    - Main area: Columns (vertical strips) A-E are common, F-J are common.
      Usually these are technically "Rows" 1 to 63. Let's stick to the nomenclature
      that 'A1', 'B1', 'C1', 'D1', 'E1' are all electrically connected.
      This function implements that mapping.
    
    Args:
        hole (PhysicalHole): The physical hole ID (e.g., "A5", "G10", "U+").
        
    Returns:
        ElectricalNode: The canonical electrical node ID (e.g., "A5", "F10").
                       Returns empty string if input is invalid.
    """
    if not hole : return ""

    pref = hole[0]

    # Rows 'A-E' are connected column wise (actually row-wise in breadboard terms, but let's say index-wise).
    # Map all of them to 'A' + Column
    if ord('A') <= ord(pref) < ord('F'):
        return 'A' + hole[1:]

    # Rows 'F-J' are connected column wise. Map all of them to 'F' + Column
    elif ord('F') <= ord(pref) < ord('K'):
        return 'F' + hole[1:]

    # Power rails and others are returned as is
    else:
        return hole[:2]

def build_node_map(wires: List[Wire], grounds: List[PhysicalHole]) -> Tuple[Dict[ElectricalNode, NodeID], int]:
    """
    Builds a map of {Electrical_Node_String: Electrical_Node_Int}.
    Handles wires by merging connected nodes into the same integer ID.

    Args:
        wires (List[Wire]): List of jumper wires. 
                           Format: [id, name, [start_hole, end_hole]]
        grounds (List[PhysicalHole]): List of physical holes that are grounded.

    Returns:
        Tuple[Dict[ElectricalNode, NodeID], int]: 
            - A dictionary mapping canonical node strings to SPICE node integers.
            - The next available node integer ID.
    """
    nodemap = {}
    counter = 1

    # Initializing Grounds to Node 0
    for g in grounds:
        node_key = hole_to_node(g)
        nodemap[node_key] = 0

    # Processing the Wires (Short circuits). Loop multiple times to propagate connection (e.g. Wire A->B, Wire B->C means A, B, C are all same node)
    max_passes = len(wires) + 1
    for _ in range(max_passes): 
        for wire in wires:
            # Wire format: [id, name, [foot1, foot2]]
            feet = wire[2]
            # Convert physical feet to canonical rows (e.g. 'A1', 'F10')
            node1 = hole_to_node(feet[0])
            node2 = hole_to_node(feet[1])

            # Case 1: Both form a new isolated node
            if node1 not in nodemap and node2 not in nodemap:
                nodemap[node1] = counter
                nodemap[node2] = counter
                counter += 1

            # Case 2: Connect an existing node to a new point
            elif node1 in nodemap and node2 not in nodemap:
                nodemap[node2] = nodemap[node1]
            elif node2 in nodemap and node1 not in nodemap:
                nodemap[node1] = nodemap[node2]

            # Case 3: Connecting two existing nodes (Merge them)
            elif nodemap[node1] != nodemap[node2]:
                target_id = min(nodemap[node1], nodemap[node2])
                old_id = max(nodemap[node1], nodemap[node2])
                # Remap everything that was old_id to target_id
                for k, v in nodemap.items():
                    if v == old_id:
                        nodemap[k] = target_id

    return nodemap, counter

def generate_spice_netlist(components: List[ComponentData], wires: List[Wire], grounds: List[PhysicalHole]) -> str:
    """
    Generates the final SPICE netlist string from the circuit definition.

    Args:
        components (List[ComponentData]): List of components. Each item is a tuple:
                                          (id, name, [list_of_physical_legs], spec_value).
        wires (List[Wire]): List of jumper wires. 
                            Format: [id, name, [start_hole, end_hole]].
        grounds (List[PhysicalHole]): List of physical holes connected to ground (e.g. ["A1", "J10"]).

    Returns:
        str: The complete SPICE netlist text, including component definitions 
             (e.g., "R1 N0001 N0002 10k") and control commands like ".backanno".
    """
    # Building the connectivity map
    nodemap, counter = build_node_map(wires, grounds)

    # Mapping Component legs to Nodes
    flags = {}

    for component in components:
        feet = component[2]
        for foot in feet:
            node = hole_to_node(foot)
            if node in nodemap:
                flags[node] = True
            else:
                nodemap[node] = counter
                counter += 1

    # Generating SPICE string
    result = ""
    id_to_suffix = {-1: 'V', 0:'wire', 1: 'R', 2: 'C', 3: 'I', 4: 'MOST', 5: 'CIRT', 6: 'LED', 7: 'IC'}
    counts = [0] * 8

    remap= {} # Remap distinct node ids to continous numbers
    newnode = 1

    for component in components:
        comp_id = component[0]
        comp_name = component[1]
        feet = component[2]
        spec= component[3]

        # If id is -1, we assume it is a V source
        prefix = id_to_suffix.get(comp_id, "U")
        if comp_id >= 0:
            counts[comp_id] += 1
            idx = counts[comp_id]
        else:
            idx = 1 # Counter if there are multiple power sources

        line = f"{prefix}{idx}"

        for foot in feet:
            node = hole_to_node(foot)

            if nodemap[node] == 0:
                line += " 0" # Ground
            else:
                mapped_id = nodemap[node]

                if node in flags:
                    if mapped_id in remap:
                        final_node_id = remap[mapped_id]
                    else:
                        final_node_id = newnode
                        remap[mapped_id] = newnode
                        newnode += 1

                    line += f" N{final_node_id:04d}"
                else:
                    line += " NC" # No Connection

        line += f" {spec}\n"
        result += line

    result += ".backanno\n.end\n"
    return result
