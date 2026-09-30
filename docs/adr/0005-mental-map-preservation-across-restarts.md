# 0005 — Mental Map Preservation Across Restarts

Status: Accepted

## Context

In previous versions, reloading Obsidian or closing and reopening the 2D vector scatter view caused the layout to lose its spatial arrangement:
1. `vaultScan.ts` initialized note positions near hardcoded `TYPE_OFFSETS` islands based on note types (`definition` at `(-250, -150)`, `theorem` at `(200, -150)`, etc.).
2. Because coordinates were non-zero, `applyVectorLayout` bypassed initial PCA projection (`nodes.every(n => n.x === 0 && n.y === 0)` was `false`). Instead, only 60 iterations of force simulation ran from the static type offsets, leaving nodes clumped into artificial clusters.
3. Users had to repeatedly adjust the spacing slider (`nodeSpacing`) to force hundreds of simulation iterations to eventually pull nodes into their semantic vector positions.
4. PCA and spectral projections suffered from eigenvector sign ambiguity: depending on numerical floating-point margins or file enumeration order, axes could randomly reflect (mirror) across sessions.
5. Canvas zoom and pan were not serialized into Obsidian's workspace state, resetting the camera on every launch.

Users require a consistent mental map across sessions: looking at the graph after a restart should immediately display the familiar cluster landscape, while preserving dynamic force interactions when creating, editing, or deleting relations.

## Decision

We implement multi-stage mental map preservation without statically freezing nodes:

1. **Deterministic Vault Scanning:**
   - Notes are initialized at `(0, 0)` with no arbitrary `TYPE_OFFSETS`.
   - Vault files are sorted deterministically by path before scanning, eliminating OS-dependent file enumeration variance.

2. **Sign-Canonical Projection (SVD-flip):**
   - For PCA and spectral projections, eigenvectors are canonicalized using standard SVD-flip (`enforceCanonicalSign`): if the sum of projections along an axis is negative, the axis vector is inverted. This guarantees stable, non-mirrored orientations across runs.

3. **Incremental Neighbor Seeding for Unplaced Nodes:**
   - Newly created or unplaced nodes in an existing graph are seeded near the barycenter of their connected neighbors rather than triggering a global re-projection that would disrupt the user's mental map.

4. **Warm-Start Hydration via SQLite:**
   - Node positions `(x, y)` are persisted to SQLite table `node_positions` whenever a layout calculation settles.
   - On restart or rescan, `scanVaultNotes` hydrates existing in-memory coordinates or reads stored coordinates from SQLite before the layout pass.

5. **Dynamic Physics Maintained:**
   - Nodes are not locked or pinned. `applyVectorLayout` continues to run dynamic force-directed simulation (attraction along relations, repulsion, collision clearance, semantic springs). Creating or modifying relations continues to pull and push connected nodes interactively.

6. **Camera Viewport Persistence:**
   - `VectorScatterView` implements `getState` and `setState` to serialize `pan` and `zoom` into Obsidian's workspace state, restoring the exact view orientation on restart.

## Consequences

- The user sees the familiar cluster configuration immediately upon restart without adjusting sliders.
- Semantic vector relationships are directly visible from the first render.
- Force simulation remains fully active, pulling related nodes together and pushing repelled nodes apart.
- Position writes to SQLite are asynchronous and debounced per layout pass, avoiding performance overhead.
