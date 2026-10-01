# GHOST interface redesign

This revision keeps the existing repository analysis and assistant flows while replacing the presentation layer with a more distinctive industrial/CRT developer-tool system.

## Visual direction
- Industrial computing / CRT instrumentation aesthetic rather than generic SaaS.
- Near-black base with phosphor lime as the primary interaction color.
- Muted cyan for architecture relationships and amber/red for warnings.
- Technical labels, restrained mechanical framing, dense readouts, and editorial typography.
- Architecture visualization remains the visual centerpiece.

## Motion direction
The motion system takes cues from current cinematic web patterns: scroll-linked scene movement, progressive section reveals, subtle pointer/selection feedback, and continuous 3D camera/topology motion. Motion is implemented with existing React Three Fiber/Three.js plus CSS transitions so the experience remains tied to the real analysis UI rather than an external video mockup.

## Preserved behavior
- Repository import and validation.
- tRPC analysis and rate-limit retry behavior.
- Dependency topology and file selection.
- Source-grounded assistant context.
- Existing server/API/data contracts.
- Responsive desktop/mobile behavior.

## Validation
The environment did not have the project's npm dependencies installed, and the package manager could not be fetched because the npm registry was unavailable. A global `tsc --noEmit` invocation reached configuration/type-library resolution but could not run the project check without the repository's installed dependencies. No claim of a successful production build is made from this environment.
