import type { CircuitComponent, Wire } from '../types';
import { pitch, paddingX, paddingY } from './breadboardMath';

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
            // Priority ordering ensures nodes like "Power+" or "Ground-" dominate over arbitrary aliases
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

export function buildRoutingGraph(components: CircuitComponent[], wires: Wire[]) {
    const uf = new UnionFind();
    const activeNodes = new Set<string>();

    const safeAdd = (physNode: string) => {
        activeNodes.add(physNode);
        uf.find(physNode);
    };

    components.forEach(c => {
        if (!c.box) return;
        const xs = c.box.map(p => p[0]);
        const ys = c.box.map(p => p[1]);
        const minX = Math.min(...xs);
        const wPx = Math.max(...xs) - minX;
        const hPx = Math.max(...ys) - Math.min(...ys);
        const centerY = Math.min(...ys) + hPx / 2;
        const minY = Math.min(...ys);

        if (c.terminals && c.terminals.length >= 1) safeAdd(getPhysicalNodeId(minX - 20, centerY));
        if (c.terminals && c.terminals.length >= 2) safeAdd(getPhysicalNodeId(minX + wPx + 20, centerY));
        if (c.terminals && c.terminals.length >= 3) safeAdd(getPhysicalNodeId(minX + wPx / 2, minY - 20));
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
        if (!c.box) return c;
        const xs = c.box.map(p => p[0]);
        const ys = c.box.map(p => p[1]);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const wPx = Math.max(...xs) - minX;
        const hPx = Math.max(...ys) - minY;

        const centerY = minY + hPx / 2;
        
        const terminals: string[] = [];

        // Evaluates dynamically exactly replicating snapToHole bounding algorithms
        // Left Leg
        if (c.terminals && c.terminals.length >= 1) {
            terminals.push(getNodeName(getPhysicalNodeId(minX - 20, centerY)));
        }
        // Right Leg
        if (c.terminals && c.terminals.length >= 2) {
            terminals.push(getNodeName(getPhysicalNodeId(minX + wPx + 20, centerY)));
        }
        // Top Leg (Transistor)
        if (c.terminals && c.terminals.length >= 3) {
            terminals.push(getNodeName(getPhysicalNodeId(minX + wPx / 2, minY - 20)));
        }

        return { ...c, terminals };
    });
}
