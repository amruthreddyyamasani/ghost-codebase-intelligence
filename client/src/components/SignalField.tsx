import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

type SignalFieldProps = { progress: number };

function SignalScene({ progress }: SignalFieldProps) {
  const system = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    if (system.current) {
      system.current.rotation.y += delta * 0.07;
      system.current.rotation.x = THREE.MathUtils.lerp(system.current.rotation.x, (progress - 0.5) * 0.45, 0.045);
      system.current.position.y = Math.sin(time * 0.42) * 0.08 + (progress - 0.5) * 0.28;
    }
    if (core.current) core.current.scale.setScalar(1 + Math.sin(time * 0.75) * 0.035 + progress * 0.08);
  });

  return (
    <>
      <color attach="background" args={["#070b0a"]} />
      <fog attach="fog" args={["#070b0a", 4, 13]} />
      <ambientLight intensity={0.32} />
      <pointLight position={[2, 2, 3]} color="#c7f36b" intensity={2.2} distance={7} />
      <group ref={system} rotation={[0.12, -0.2, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.52, 0.012, 12, 96]} />
          <meshBasicMaterial color="#c7f36b" transparent opacity={0.74} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.2, 0.008, 10, 96]} />
          <meshBasicMaterial color="#86b6ff" transparent opacity={0.32} />
        </mesh>
        <mesh ref={core}>
          <icosahedronGeometry args={[0.68, 2]} />
          <meshStandardMaterial color="#c7f36b" emissive="#5a7d2b" emissiveIntensity={1.7} wireframe transparent opacity={0.9} />
        </mesh>
        <mesh scale={0.34}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color="#efffd4" />
        </mesh>
      </group>
      <Sparkles count={84} scale={[7, 5, 5]} size={1.65} speed={0.16} color="#c7f36b" opacity={0.5} />
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={false} />
    </>
  );
}

export default function SignalField({ progress }: SignalFieldProps) {
  return (
    <div className="signal-field" aria-label="Interactive 3D repository signal field">
      <Canvas camera={{ position: [0, 0.2, 6.2], fov: 40 }} dpr={[1, 1.5]}>
        <SignalScene progress={progress} />
      </Canvas>
      <div className="signal-field-label"><span>LIVE TOPOLOGY</span><b>SCROLL / ROTATE / TRACE</b></div>
      <div className="signal-field-readout"><i /> signal coherence <strong>{Math.round(72 + progress * 22)}%</strong></div>
    </div>
  );
}
