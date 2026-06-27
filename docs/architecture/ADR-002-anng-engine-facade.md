# ADR-002: ANNG Engine Facade

- Status: Accepted
- Decision: Keep one physical package now, but route engine logic through `src/core/engine/*`.
- Consequence: future `@anng/engine` extraction becomes packaging work, not a deep runtime rewrite.
