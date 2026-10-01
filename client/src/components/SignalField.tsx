import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

type SignalFieldProps = { progress: number };

function SignalScene({ progress }: SignalFieldProps) {
  const system = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const scan = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    if (system.current) {
      system.current.rotation.y += delta * 0.08;
      system.current.rotation.z = THREE.MathUtils.lerp(system.current.rotation.z, (progress - 0.5) * 0.22, 0.045);
      system.current.rotation.x = THREE.MathUtils.lerp(system.current.rotation.x, (progress - 0.5) * 0.5, 0.045);
      system.current.position.y = Math.sin(time * 0.5) * 0.05 + (progress - 0.5) * 0.35;
      system.current.scale.setScalar(0.96 + progress * 0.11);
    }
    if (core.current) core.current.scale.setScalar(1 + Math.sin(time * 0.9) * 0.04 + progress * 0.06);
    if (scan.current) scan.current.position.y = Math.sin(time * 0.55) * 1.9;
  });

  return (
    <>
      <color attach="background" args={["#070a08"]} />
      <fog attach="fog" args={["#070a08", 5, 14]} />
      <ambientLight intensity={0.28} />
      <pointLight position={[2, 1.5, 3]} color="#B7FF3C" intensity={2.4} distance={7} />
      <pointLight position={[-2, -2, 2]} color="#75C9C2" intensity={0.8} distance={5} />

      <group ref={system} rotation={[0.1, -0.18, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.64, 0.014, 12, 120]} />
          <meshBasicMaterial color="#B7FF3C" transparent opacity={0.72} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.3, 0.008, 10, 120]} />
          <meshBasicMaterial color="#75C9C2" transparent opacity={0.28} />
        </mesh>
        <mesh rotation={[0.2, 0, 0]}>
          <torusGeometry args={[1.2, 0.006, 10, 96]} />
          <meshBasicMaterial color="#B7FF3C" transparent opacity={0.25} />
        </mesh>

        <mesh ref={core}>
          <icosahedronGeometry args={[0.72, 2]} />
          <meshStandardMaterial color="#B7FF3C" emissive="#3f5f16" emissiveIntensity={1.8} roughness={0.45} metalness={0.18} wireframe transparent opacity={0.92} />
        </mesh>
        <mesh scale={0.34}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color="#efffd7" />
        </mesh>
        <mesh ref={scan} scale={[1.75, 0.03, 1.75]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#B7FF3C" transparent opacity={0.08} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <Sparkles count={76} scale={[7.2, 5.2, 5.2]} size={1.35} speed={0.14} color="#B7FF3C" opacity={0.5} />
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
      <div className="signal-field-frame" aria-hidden="true">
        <span className="sf-corner sf-corner-a" /><span className="sf-corner sf-corner-b" /><span className="sf-corner sf-corner-c" /><span className="sf-corner sf-corner-d" />
      </div>
      <div className="signal-field-label"><span>LIVE TOPOLOGY</span><b>SCROLL / ORBIT / TRACE</b></div>
      <div className="signal-field-readout"><i /> coherence <strong>{Math.round(72 + progress * 22)}%</strong></div>
    </div>
  );
}
