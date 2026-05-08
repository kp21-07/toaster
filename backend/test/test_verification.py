import sys
import os
import networkx as nx

# Add backend directory to sys.path to allow imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.spice_parser import SpiceParser
from app.graph_utils import CircuitGraphBuilder, compare_circuits

def test_basic_isomorphism():
    print("Testing basic isomorphism...")
    spice_text = """
    R1 N1 N2 1k
    R2 N2 N3 2k
    V1 N1 0 5V
    """
    
    # Simulate detected components
    components = [
        {'name': 'R1', 'type': 'resistor', 'terminals': ['hole_A1', 'hole_A2']},
        {'name': 'R2', 'type': 'resistor', 'terminals': ['hole_A2', 'hole_A3']},
        {'name': 'V1', 'type': 'voltage_source', 'terminals': ['hole_A1', 'hole_GND']}
    ]
    
    # Mapping holes to nets
    node_map = {
        'hole_A1': 'N1',
        'hole_A2': 'N2',
        'hole_A3': 'N3',
        'hole_GND': '0'
    }
    
    ref_components = SpiceParser.parse_netlist(spice_text)
    G_ref = CircuitGraphBuilder.build_from_spice(ref_components)
    G_det = CircuitGraphBuilder.build_from_detected(components, node_map)
    
    is_matched, report = compare_circuits(G_ref, G_det)
    print(f"Match result: {is_matched}")
    assert is_matched == True

def test_resistor_symmetry():
    print("Testing resistor symmetry...")
    spice_text = "R1 N1 N2 1k"
    
    # Swapped terminals in detected
    components = [{'name': 'R1', 'type': 'resistor', 'terminals': ['hole_A2', 'hole_A1']}]
    node_map = {'hole_A1': 'N1', 'hole_A2': 'N2'}
    
    ref_components = SpiceParser.parse_netlist(spice_text)
    G_ref = CircuitGraphBuilder.build_from_spice(ref_components)
    G_det = CircuitGraphBuilder.build_from_detected(components, node_map)
    
    is_matched, report = compare_circuits(G_ref, G_det)
    print(f"Match result (swapped resistor): {is_matched}")
    assert is_matched == True

def test_led_asymmetry():
    print("Testing LED asymmetry...")
    # Add a voltage source to break symmetry of nets
    spice_text = """
    D1 N_Anode N_Cathode LED
    V1 N_Anode 0 5V
    """
    
    # Correct order
    comp_correct = [
        {'name': 'D1', 'type': 'led', 'terminals': ['hole_A', 'hole_C']},
        {'name': 'V1', 'type': 'voltage_source', 'terminals': ['hole_A', 'hole_GND']}
    ]
    node_map = {'hole_A': 'N_Anode', 'hole_C': 'N_Cathode', 'hole_GND': '0'}
    
    ref_components = SpiceParser.parse_netlist(spice_text)
    G_ref = CircuitGraphBuilder.build_from_spice(ref_components)
    
    G_det_correct = CircuitGraphBuilder.build_from_detected(comp_correct, node_map)
    is_matched_correct, _ = compare_circuits(G_ref, G_det_correct)
    print(f"Match result (correct LED): {is_matched_correct}")
    assert is_matched_correct == True
    
    # Swapped order
    comp_swapped = [
        {'name': 'D1', 'type': 'led', 'terminals': ['hole_C', 'hole_A']},
        {'name': 'V1', 'type': 'voltage_source', 'terminals': ['hole_A', 'hole_GND']}
    ]
    G_det_swapped = CircuitGraphBuilder.build_from_detected(comp_swapped, node_map)
    is_matched_swapped, _ = compare_circuits(G_ref, G_det_swapped)
    print(f"Match result (swapped LED): {is_matched_swapped}")
    assert is_matched_swapped == False

if __name__ == "__main__":
    try:
        test_basic_isomorphism()
        test_resistor_symmetry()
        test_led_asymmetry()
        print("\nAll tests passed!")
    except Exception as e:
        print(f"\nTest failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
