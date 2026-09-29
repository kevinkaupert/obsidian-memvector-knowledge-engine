# 0003 — Relation Weights Above 1.0 Shorten the Target Distance

Status: Accepted

## Context

ADR-0002 introduced `weight?: number` on `RelationTermDef` as "layout attraction
strength, default 1.0", and the bundled STEM vocabulary uses values above that
default: `EQUIVALENT_TO: 1.3`, `ANALOGOUS_TO: 1.1`. The README force table
advertises them as "Strongest pull (x1.3)" and "Strong pull (x1.1)" against a
"Standard (x1.0)".

ADR-0002 never defined what a value above 1.0 actually does to the simulation,
and the force simulation did not implement one. It clamped the graph weight
before use:

```ts
const topWeight = Math.min(1.0, graphWeight);
const affinity = Math.max(topWeight, semStrength);
```

`conn[i][j]` was read exactly once and clamped immediately, so every weight at
or above 1.0 produced identical coordinates. Two nodes at (-400, 0) and (400, 0)
with `nodeSpacing=350` settled at the same distance for 1.0, 1.1, 1.3 and 2.5.
The setting was adjustable, documented and inert.

The clamp is not arbitrary. `affinity` feeds the target-distance mapping
`targetSpacing * (1.15 - affinity * 0.75)`, which inverts once `affinity`
exceeds roughly 1.53. Simply removing the clamp would produce negative target
distances.

Two options were weighed:

1. Make weights above 1.0 effective.
2. Cap the supported range at 1.0 and correct the documentation, the Settings
   input and the bundled values.

Option 2 is the smaller change but removes a capability the project has
advertised since the feature shipped, and would require resetting the bundled
`EQUIVALENT_TO` and `ANALOGOUS_TO` to 1.0 — flattening the distinction the STEM
vocabulary exists to express.

## Decision

A weight above 1.0 shortens the target distance of that pair and stiffens its
spring. `affinity` keeps its role and its `[0, 1]` range; the above-1 range is
carried by a separate factor, so the two concerns stay separable:

```ts
const topWeight = Math.min(1.0, graphWeight);                              // target selection
const weightFactor = Math.min(MAX_WEIGHT_FACTOR, Math.max(1, graphWeight)); // strength
const pairClearance = Math.max(targetSpacing * MIN_PAIR_CLEARANCE_RATIO, collisionDist / weightFactor);
const idealDist = Math.max(targetSpacing * MIN_PAIR_CLEARANCE_RATIO, base / weightFactor);
```

Three properties follow:

- **Weights at or below 1.0 are untouched.** `weightFactor` is exactly 1 for
  them, `pairClearance` reduces to the previous `collisionDist`, and
  `idealDist` reduces to the previous expression. Eleven of the thirteen
  bundled STEM types and every multi-hop decay value keep their exact
  coordinates; a test pins the generic-weight distance numerically.
- **The generic collision clearance yields to a declared strong relation.**
  Without this the mapping would be nearly inert: with `nodeSpacing=350` the
  clearance is 157.5 while the target distance at full affinity is already 140,
  so the clearance, not the weight, decides where a related pair settles.
- **Nodes cannot collapse onto each other.** Both the clearance and the target
  distance are floored at `MIN_PAIR_CLEARANCE_RATIO * targetSpacing`, and
  `weightFactor` saturates at `MAX_WEIGHT_FACTOR`.

Resulting pair distance for two directly related nodes at `nodeSpacing=350`:

| Weight | Distance | |
|---|---|---|
| 0.05 | 764 | `INDEPENDENT_OF`, unchanged |
| 0.5 | 273 | unchanged |
| 1.0 | 153 | generic relation, unchanged |
| 1.1 | 139 | `ANALOGOUS_TO` |
| 1.3 | 117 | `EQUIVALENT_TO` |
| 2.5 | 60 | custom |
| 6.0 and above | 42 | saturated at the floor |

## Consequences

- The README force table, ADR-0002's "attraction strength" and the Settings
  weight field now describe behavior the simulation implements.
- **Vaults upgrade into a visibly different layout.** Any vault using
  `EQUIVALENT_TO` or `ANALOGOUS_TO` gets tighter clusters around those pairs.
  This is the previously advertised behavior taking effect, not a new feature,
  but it is a visual change on upgrade and belongs in the release notes.
- Weights are no longer a bounded `[0, 1]` scale in practice. The Settings field
  keeps accepting any non-negative number; values beyond `MAX_WEIGHT_FACTOR`
  are accepted and saturate rather than being rejected, so a shared vocabulary
  file from another vault never fails to load.
- Tests for weight semantics must assert finished projection coordinates.
  Asserting the intermediate `conn` matrix is what allowed this defect to
  survive: that matrix was always correct — its only consumer discarded it.
