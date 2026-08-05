# @railplan/core

The planning engine, extracted so the browser and the server run the same code
rather than two implementations that agree until they don't.

```
src/domain/   network topology, crews, assets, work-class rules   (facts)
src/data/     the planning night's requests and scenarios         (inputs)
src/engine/   intervals, validate, solve, metrics,                (computation)
              alternatives, explain, resolutions, strategies, hash
src/test/     the engine's own tests
```

## The rule this package exists to protect

`src/engine/validate.ts` is the only authority on whether a plan is feasible.
The solver calls it while building and again on its own finished output. The
alternatives generator calls it on every candidate. The explanation engine calls
it on counterfactuals. Nothing anywhere may assert a plan is acceptable without
going through it.

That is why this is a package. A CP-SAT service written in another language can
*propose* a plan, but the proposal is not a plan until this code has agreed —
and a gate that lives in a shared package cannot quietly diverge from the engine
the browser is running.

## Imports

Consumers use subpaths, which are the package's public surface:

```ts
import { solve } from "@railplan/core/engine/solve";
import type { SolveResult } from "@railplan/core/types/railplan";
```

Inside the package, imports are relative. There is no `@/` alias here on
purpose: an alias that means one thing in the web app and another in the engine
is a trap for whoever moves a file next.

## Tests

Run from the repository root with `npm test`. They are the engine's own
property tests — every strategy's output re-validates to zero critical
violations, identical inputs give an identical plan and hash, pins are honoured
exactly — and they are the reason this package can be depended on.
