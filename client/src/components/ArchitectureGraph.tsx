import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls, Text } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AnalysisEdge, AnalysisNode } from "@shared/ghost";

type ArchitectureGraphProps = {
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
  selectedPath?: string;
  onSelect: (path: string) => void;
};

type GraphNodeProps = {
  node: AnalysisNode;
  position: [number, number, number];
  selected: boolean;
  onSelect: (path: string) => void;
};

const layerColors: Record<string, string> = {
  product: "#c7f36b",
  interface: "#d7ff91",
  server: "#8de8c0",
  shared: "#86b6ff",
  tooling: "#f0b878",
  root: "#f2f2e7",
  other: "#8b9288",
};

function GraphNode({ node, position, selected, onSelect }: GraphNodeProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = layerColors[node.layer] ?? layerColors.other;

  useFrame((_, delta) => {
    if (mesh.current) {
      const target = selected || hovered ? 1.22 : 1;
      mesh.current.scale.lerp(new THREE.Vector3(target, target, target), Math.min(1, delta * 10));
    }
  });

  return (
    <group position={position}>
      <mesh
        ref={mesh}
        onClick={event => {
          event.stopPropagation();
          onSelect(node.path);
        }}
        onPointerOver={event => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[selected ? 0.16 : 0.11, 18, 18]} />
        <meshBasicMaterial color={selected ? "#ffffff" : color} />
      </mesh>
      {(selected || hovered) && (
        <Text
          position={[0.2, 0.04, 0]}
          fontSize={0.14}
          color="#f1f3e8"
          anchorX="left"
          anchorY="middle"
          maxWidth={1.8}
        >
          {node.path.split("/").pop()}
        </Text>
      )}
      {(selected || hovered) && <pointLight color={color} intensity={0.8} distance={1.6} />}
    </group>
  );
}

function GraphScene({ nodes, edges, selectedPath, onSelect }: ArchitectureGraphProps) {
  const positions = useMemo(() => {
    const layers = Array.from(new Set(nodes.map(node => node.layer)));
    const buckets = new Map<string, AnalysisNode[]>();
    nodes.forEach(node => buckets.set(node.layer, [...(buckets.get(node.layer) ?? []), node]));
    const result = new Map<string, [number, number, number]>();

    layers.forEach((layer, layerIndex) => {
      const bucket = buckets.get(layer) ?? [];
      bucket.forEach((node, index) => {
        const column = layerIndex - (layers.length - 1) / 2;
        const row = index % 7;
        const depth = Math.floor(index / 7);
        result.set(node.path, [column * 2.05, (3 - row) * 0.7, (depth - 1) * 0.78]);
      });
    });
    return result;
  }, [nodes]);

  const visiblePaths = new Set(nodes.map(node => node.path));
  const visibleEdges = edges.filter(edge => visiblePaths.has(edge.source) && visiblePaths.has(edge.target));

  return (
    <>
      <ambientLight intensity={0.5} />
      <group rotation={[0, -0.15, 0]}>
        {visibleEdges.map((edge, index) => {
          const from = positions.get(edge.source);
          const to = positions.get(edge.target);
          if (!from || !to) return null;
          return (
            <Line
              key={`${edge.source}-${edge.target}-${index}`}
              points={[from, to]}
              color={edge.source === selectedPath || edge.target === selectedPath ? "#c7f36b" : "#5f6b5b"}
              transparent
              opacity={edge.source === selectedPath || edge.target === selectedPath ? 0.8 : 0.24}
              lineWidth={edge.source === selectedPath || edge.target === selectedPath ? 1.4 : 0.7}
            />
          );
        })}
        {nodes.map(node => {
          const position = positions.get(node.path);
          if (!position) return null;
          return (
            <GraphNode
              key={node.path}
              node={node}
              position={position}
              selected={node.path === selectedPath}
              onSelect={onSelect}
            />
          );
        })}
      </group>
      <OrbitControls enablePan={false} minDistance={5} maxDistance={17} autoRotate={!selectedPath} autoRotateSpeed={0.28} />
    </>
  );
}

export default function ArchitectureGraph(props: ArchitectureGraphProps) {
  return (
    <div className="graph-canvas" aria-label="Interactive 3D architecture graph">
      <Canvas camera={{ position: [0, 1.2, 10], fov: 38 }} dpr={[1, 1.6]}>
        <color attach="background" args={["#0d100d"]} />
        <fog attach="fog" args={["#0d100d", 10, 22]} />
        <GraphScene {...props} />
      </Canvas>
      <div className="graph-overlay graph-overlay-top">
        <span className="mono-label">3D / dependency topology</span>
        <span className="graph-hint">drag to orbit · scroll to zoom</span>
      </div>
      <div className="graph-legend">
        {Object.entries(layerColors).slice(0, 5).map(([layer, color]) => (
          <span key={layer} className="legend-item"><i style={{ backgroundColor: color }} />{layer}</span>
        ))}
      </div>
    </div>
  );
}
