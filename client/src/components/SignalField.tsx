import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

type SignalFieldProps = { progress: number };

function SignalScene({ progress }: SignalFieldProps) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y += delta * 0.08;
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, (progress - 0.5) * 0.42, 0.04);
      group.current.position.y = Math.sin(time * 0.45) * 0.08 + (progress - 0.5) * 0.35;
    }
    if (ring.current) {
      ring.current.rotation.z = time * 0.16 + progress * Math.PI;
      ring.current.scale.setScalar(1 + Math.sin(time * 0.7) * 0.04 + progress * 0.12);
    }
  });

  return (
    <>
      <color attach="background" args={["#070b0a"]} />
      <fog attach="fog" args={["#070b0a", 4, 13]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[2, 2, 3]} color="#c7f36b" intensity={2.5} distance={7} />
      <group ref={group} rotation={[0.15, -0.2, 0]}>
        <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.45, 0.012, 12, 96]} />
          <meshBasicMaterial color="#c7f36b" transparent opacity={0.72} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.15, 0.008, 10, 96]} />
          <meshBasicMaterial color="#86b6ff" transparent opacity={0.35} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.62, 2]} />
          <meshStandardMaterial color="#c7f36b" emissive="#5a7d2b" emissiveIntensity={1.8} wireframe transparent opacity={0.9} />
        </mesh>
        <mesh scale={0.32}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color="#efffd4" />
        </mesh>
      </group>
      <Sparkles count={90} scale={[7, 5, 5]} size={1.7} speed={0.18} color="#c7f36b" opacity={0.55} />
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
