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
  scrollProgress?: number;
};

type GraphNodeProps = {
  node: AnalysisNode;
  position: [number, number, number];
  selected: boolean;
  onSelect: (path: string) => void;
};

const layerColors: Record<string, string> = {
  product: "#B7FF3C",
  interface: "#D8FFA1",
  server: "#75C9C2",
  shared: "#B9D4FF",
  tooling: "#D99A4A",
  root: "#F3F6E9",
  other: "#889287",
};

function GraphNode({ node, position, selected, onSelect }: GraphNodeProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = layerColors[node.layer] ?? layerColors.other;

  useFrame((state, delta) => {
    if (!mesh.current) return;
    const pulse = 1 + Math.sin(state.clock.getElapsedTime() * 1.4 + node.path.length) * 0.035;
    const target = (selected || hovered ? 1.34 : 1) * pulse;
    mesh.current.scale.lerp(new THREE.Vector3(target, target, target), Math.min(1, delta * 10));
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
        <sphereGeometry args={[selected ? 0.165 : 0.11, 18, 18]} />
        <meshBasicMaterial color={selected ? "#F5FFD9" : color} />
      </mesh>
      {(selected || hovered) && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.28, 0.008, 8, 40]} />
            <meshBasicMaterial color={color} transparent opacity={0.65} />
          </mesh>
          <Text position={[0.26, 0.05, 0]} fontSize={0.145} color="#EDF5E5" anchorX="left" anchorY="middle" maxWidth={2.1}>
            {node.path.split("/").pop()}
          </Text>
          <pointLight color={color} intensity={0.95} distance={1.9} />
        </>
      )}
    </group>
  );
}

function GraphScene({ nodes, edges, selectedPath, onSelect, scrollProgress = 0 }: ArchitectureGraphProps) {
  const topology = useRef<THREE.Group>(null);
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

  useFrame(({ clock }, delta) => {
    if (!topology.current) return;
    topology.current.rotation.y += delta * (0.025 + scrollProgress * 0.045);
    topology.current.rotation.x = THREE.MathUtils.lerp(topology.current.rotation.x, (scrollProgress - 0.5) * 0.33, 0.035);
    topology.current.position.y = Math.sin(clock.getElapsedTime() * 0.3) * 0.04 + (scrollProgress - 0.5) * 0.18;
    topology.current.scale.setScalar(1.02 + scrollProgress * 0.055);
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <gridHelper args={[18, 18, "#26331f", "#111913"]} position={[0, -3.2, 0]} />
      <group ref={topology} rotation={[0, -0.15, 0]}>
        {visibleEdges.map((edge, index) => {
          const from = positions.get(edge.source);
          const to = positions.get(edge.target);
          if (!from || !to) return null;
          const hot = edge.source === selectedPath || edge.target === selectedPath;
          return <Line key={`${edge.source}-${edge.target}-${index}`} points={[from, to]} color={hot ? "#B7FF3C" : "#4C5C4B"} transparent opacity={hot ? 0.86 : 0.2} lineWidth={hot ? 1.6 : 0.65} />;
        })}
        {nodes.map(node => {
          const position = positions.get(node.path);
          if (!position) return null;
          return <GraphNode key={node.path} node={node} position={position} selected={node.path === selectedPath} onSelect={onSelect} />;
        })}
      </group>
      <OrbitControls enablePan={false} minDistance={5} maxDistance={17} autoRotate={!selectedPath} autoRotateSpeed={0.2} enableDamping dampingFactor={0.06} />
    </>
  );
}

export default function ArchitectureGraph(props: ArchitectureGraphProps) {
  return (
    <div className="graph-canvas" aria-label="Interactive 3D architecture graph">
      <Canvas camera={{ position: [0, 1.2, 10], fov: 38 }} dpr={[1, 1.6]}>
        <color attach="background" args={["#070A08"]} />
        <fog attach="fog" args={["#070A08", 10, 22]} />
        <GraphScene {...props} />
      </Canvas>
      <div className="graph-overlay graph-overlay-top"><span className="mono-label">03D / dependency topology</span><span className="graph-hint">drag to orbit · wheel to zoom</span></div>
      <div className="graph-axis-readout"><span>X / LAYER</span><span>Y / DENSITY</span><span>Z / DEPTH</span></div>
      <div className="graph-legend">
        {Object.entries(layerColors).slice(0, 5).map(([layer, color]) => <span key={layer} className="legend-item"><i style={{ backgroundColor: color }} />{layer}</span>)}
      </div>
    </div>
  );
}
