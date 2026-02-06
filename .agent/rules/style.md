---
trigger: always_on
---

# Code comments
- Every function should have a small JSDoc comment describing its purpose
- Code that is not obvious to understand must have one or multiple singe-line comments, e.g.
  - Why a type-case is needed
  - Why a hacky solution had to be used to make it work
  - A complex ternary logic

# Code style
- The code needs to conform to the latest version of XO (npm install xo) configuration. It can be tested using "pnpm lint".
- Constants should be defined and documented in a consts.ts file
- Functions to generate LLM prompts should be defined in a prompts.ts file