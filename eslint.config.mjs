import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "**/.next/**",
      ".worktrees/**",
      "next-env.d.ts",
      "node_modules/**",
      "dist/**",
      "pudcraft-design-system/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      // React 19 + the current client-page data-loading architecture trigger this across
      // many existing screens. Re-enabling it currently surfaces dozens of known findings
      // and needs a broader fetch/state refactor rather than a one-off config toggle.
      "react-hooks/set-state-in-effect": "off",
      // This is currently noisy with React Compiler/manual memoization warnings in existing
      // pages. Keep it disabled until the client-page memoization patterns are reviewed as a set.
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];

export default eslintConfig;
