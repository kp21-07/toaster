import type { CircuitComponent, Wire } from '../types';
import { pitch, paddingX, paddingY } from './breadboardMath';
import { getFootprint, normaliseComponent } from './componentFootprints';

export function getPhysicalNodeId(x: number, y: number): string {
    const col = Math.round((x - paddingX) / pitch);
    const row = Math.round((y - paddingY) / pitch);
    
    if (row === 1) return 'Power+';
    if (row === 2) return 'PowerTop-';
    if (row >= 4 && row <= 8) return `TopTerminal_${col}`;
    if (row >= 11 && row <= 15) return `BotTerminal_${col}`;
    if (row === 17) return 'PowerBot+';
    if (row === 18) return 'Ground-';

    if (row === 21) return 'B2_Power+';
    if (row === 22) return 'B2_PowerTop-';
    if (row >= 24 && row <= 28) return `B2_TopTerminal_${col}`;
    if (row >= 31 && row <= 35) return `B2_BotTerminal_${col}`;
    if (row === 37) return 'B2_PowerBot+';
    if (row === 38) return 'B2_Ground-';
    
    return `Unknown_${col}_${row}`;
}

class UnionFind {
    parent: Record<string, string> = {};
    
    find(i: string): string {
        if (!this.parent[i]) this.parent[i] = i;
        if (this.parent[i] === i) return i;
        this.parent[i] = this.find(this.parent[i]);
        return this.parent[i];
    }
    
    union(i: string, j: string) {
        let rootI = this.find(i);
        let rootJ = this.find(j);
        if (rootI !== rootJ) {
            if (rootI.includes('Power') || rootI.includes('Ground')) {
                this.parent[rootJ] = rootI;
            } else if (rootJ.includes('Power') || rootJ.includes('Ground')) {
                this.parent[rootI] = rootJ;
            } else {
                this.parent[rootI] = rootJ;
            }
        }
    }
}

// Compute pixel (x,y) of each pin from grid-native position
function getComponentPinPixels(c: CircuitComponent): { x: number; y: number }[] {
    const norm = normaliseComponent(c);
    const col = norm.col!;
    const row = norm.row!;
    const span = norm.span!;
    const fp = getFootprint(c.type);

    const pin1x = paddingX + col * pitch;
    const pin1y = paddingY + row * pitch;
    const pin2x = paddingX + (col + span) * pitch;
    const pin2y = pin1y;

    const pins: { x: number; y: number }[] = [{ x: pin1x, y: pin1y }];
    if (fp.pins >= 2) pins.push({ x: pin2x, y: pin2y });
    if (fp.pins >= 3) {
        // 3rd pin: top of body center (transistor style)
        const cx = (pin1x + pin2x) / 2;
        pins.push({ x: cx, y: pin1y - 14.15 });
    }
    return pins;
}

export function buildRoutingGraph(components: CircuitComponent[], wires: Wire[]) {
    const uf = new UnionFind();
    const activeNodes = new Set<string>();

    const safeAdd = (physNode: string) => {
        activeNodes.add(physNode);
        uf.find(physNode);
    };

    components.forEach(c => {
        const pins = getComponentPinPixels(c);
        pins.slice(0, c.terminals?.length ?? pins.length).forEach(p => {
            safeAdd(getPhysicalNodeId(p.x, p.y));
        });
    });


    wires.forEach(wire => {
        if (wire.points && wire.points.length >= 2) {
            const startNode = getPhysicalNodeId(wire.points[0][0], wire.points[0][1]);
            const endNode = getPhysicalNodeId(wire.points[wire.points.length - 1][0], wire.points[wire.points.length - 1][1]);
            safeAdd(startNode);
            safeAdd(endNode);
            uf.union(startNode, endNode);
        }
    });

    const nodeAliasMap: Record<string, string> = {};
    let nodeCounter = 1;

    const getNodeName = (rawNodeId: string) => {
        if (!activeNodes.has(rawNodeId)) {
            if (rawNodeId.includes('Power') || rawNodeId.includes('Ground')) return rawNodeId;
            return '?';
        }
        const rootGroup = uf.find(rawNodeId);
        if (rootGroup.includes('Power') || rootGroup.includes('Ground')) return rootGroup;
        if (!nodeAliasMap[rootGroup]) {
            nodeAliasMap[rootGroup] = `Node${String.fromCharCode(64 + nodeCounter)}`;
            nodeCounter++;
        }
        return nodeAliasMap[rootGroup];
    };

    const isConnected = (nodeA: string, nodeB: string) => {
        if (nodeA === nodeB) return true; // Standard logic for strips even without active components
        if (!activeNodes.has(nodeA) || !activeNodes.has(nodeB)) return false;
        return uf.find(nodeA) === uf.find(nodeB);
    };

    return { getNodeName, isConnected };
}

export function autoRouteCircuit(components: CircuitComponent[], wires: Wire[]): CircuitComponent[] {
    const { getNodeName } = buildRoutingGraph(components, wires);

    return components.map(c => {
        const pins = getComponentPinPixels(c);
        const numTerminals = c.terminals?.length ?? pins.length;
        const terminals = pins
            .slice(0, numTerminals)
            .map(p => getNodeName(getPhysicalNodeId(p.x, p.y)));
        return { ...c, terminals };
    });
}
