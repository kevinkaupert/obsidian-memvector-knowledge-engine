# 0001 - Durable vocabulary edits and effective layout weights

Status: In progress
Date: 2026-09-29

## Goal

Close the two high-severity findings of the 0.1.7 release recheck
(`docs/audits/0.1.7-release-recheck.md`):

1. Settings edits to a relation type's `weight`/`repels` must survive any
   following edit, add or delete (issue #133).
2. A relation weight above `1.0` must actually place connected notes closer
   than a generic relation, as README and ADR-0002 state (issue #134).

Both defects hid behind a fully green baseline: 413 passing tests, clean
typecheck, clean build. The existing tests assert helper return values, never
the persisted file after a sequence of edits, and never the finished
projection coordinates.

## Steps

### Block 1 - durable vocabulary edits (#133)

- Add a read-modify-write mutator for the active vocabulary file. Every
  mutation re-reads the file, applies its transform and writes the result,
  serialized so two mutations cannot interleave.
- A failed read aborts the mutation instead of writing a truncated file; an
  unreadable file must never be silently reinterpreted as an empty vocabulary.
- Route the three Settings write paths (weight/repels edit, delete row, add
  type) through it.
- Tests: edit -> edit, edit -> delete, edit -> add, and a read failure that
  must not write.

### Block 2 - effective weights above 1.0 (#134)

- Keep the existing attraction semantics for weights in `[0, 1]` byte-for-byte;
  only the previously dead range above `1.0` changes.
- A weight above 1 shortens the pair's target distance and stiffens its spring,
  bounded by a hard minimum clearance so nodes cannot collapse onto each other.
- Record the mapping in a new ADR, since the previous ADR defines the field but
  not what a value above 1 means.
- Tests: assert the finished projection coordinates, not the intermediate
  weight matrix - monotonically closer for larger weights, and unchanged
  placement for weights at or below 1.

## Decided

- Weights above 1 become effective rather than capping the input range at 1.
  Capping would have been the smaller change, but it would strip a capability
  that README, ADR-0002 and the bundled STEM vocabulary have advertised since
  the feature shipped. Upgrade consequence accepted: vaults using
  `EQUIVALENT_TO` or `ANALOGOUS_TO` get visibly tighter clusters.

## Deferred

- Issue #136 (add form omits explicit defaults) touches the same add-type code
  block but is a separate defect with its own fix and its own test; it stays
  open so it is not silently closed along with this work.
- Issue #135 (stale `activePath` and missing view refresh on preset delete and
  path edit) stays open for the same reason.
