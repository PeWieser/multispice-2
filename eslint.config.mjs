import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Referenz-/Vorbild-Ordner: nicht Teil des Builds (siehe tsconfig.json
    // „exclude") und deshalb auch nicht Teil der Lint-Prüfung. Ohne diesen
    // Eintrag lieferte `npx eslint .` (CI-Schritt „Lint") Fehler aus dem
    // Vorbild `function generator/`, obwohl der Build fehlerfrei war.
    "reference/**",
    "reference 2/**",
    "oszi v2/**",
    "function generator/**",
    "Multimeter/**",
    "UI and UX ref/**",
    "desktop/**",
  ]),
]);
