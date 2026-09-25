# GHOST interface update

This source update adds:
- Scroll-triggered reveal transitions for major workbench sections, with reduced-motion support.
- Scroll-aware active states for the persistent workspace rail.
- A restrained animated 3D point-field atmosphere and ground grid in the architecture graph.
- More dimensional graph nodes with emissive selection/hover feedback.
- Focus-visible keyboard affordances and small interaction refinements.

The existing repository analyzer, tRPC procedures, API routes, GitHub integration, assistant flow, and analysis contracts were left in place.

Validation note: this package was source-reviewed and structurally checked. A full dependency install/build was not run in this environment because pnpm is not installed here. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, and `pnpm build:vercel` before deploying.
