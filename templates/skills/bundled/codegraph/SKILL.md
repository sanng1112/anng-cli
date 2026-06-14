---
name: codegraph
description: Generates a semantic codegraph and dependency index of the workspace to ANNG.md.
---

# Codegraph Semantic Indexing

This skill helps index the workspace into a semantic graph saved in `ANNG.md`, providing a persistent map of the codebase for all future ANNG CLI agents.

## Workflow

When the user asks you to index the workspace or generate a codegraph:
1. Identify the primary language of the project (e.g. TypeScript, Python, Go).
2. Use tools like `tree` or `npx madge` (for Node projects) to generate a dependency graph or structural map of the workspace.
3. Read the main entrypoints and extract their exported symbols.
4. Compile a concise but comprehensive `Workspace Map` detailing:
   - Architecture summary
   - Key directories and their purposes
   - Main dependencies/components and how they connect
5. Write this output to `ANNG.md` in the project root using the `write_to_file` tool.
6. The `ANNG.md` file acts as a permanent cache. From now on, agents will automatically read this context!
