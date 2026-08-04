import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts"]),
  {
    // The dependency arrow points one way, and now something checks it.
    //
    // `docs/ARCHITECTURE.md` has claimed since v0.2.0 that the engine knows
    // nothing about the interface. That held by discipline alone; a single
    // convenient import of a React hook or a Next helper into the solver would
    // have ended it silently, and would also break the day this package is
    // consumed by anything that is not a Next app — which is the whole point of
    // extracting it.
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "packages/core must not import from the web app. Move the shared code into the package, or pass it in.",
            },
            {
              group: ["next", "next/*", "react", "react-dom", "@railplan/core/*"],
              message:
                "packages/core is a plain TypeScript library: no framework imports, and no importing itself through its own package name.",
            },
          ],
        },
      ],
    },
  },
]);
