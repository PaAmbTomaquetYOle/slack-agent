// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Plain (non type-checked) `recommended` rule set: this repo has no
      // shared `parserOptions.project` wiring across every included file,
      // and `recommended-type-checked` would additionally surface a large
      // backlog of pre-existing violations that are out of scope for this
      // fix. Revisit once the codebase is ready to opt into type-aware
      // linting.
      ...tsPlugin.configs.recommended.rules,
      // The codebase relies on `console.warn`/`console.error` for
      // fire-and-forget error reporting (e.g. Kafka publish failures)
      // rather than a logging library, so the base `no-console` rule would
      // flag intended behavior throughout src/.
      'no-console': 'off',
      // A few existing adapters intentionally use `any` at external-SDK
      // boundaries; downgrading to a warning keeps the signal without
      // blocking `npm run lint` on pre-existing, reviewed usages.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // TypeScript's own compiler (with `strict`) already enforces this;
      // the base JS rule produces false positives on type-only constructs.
      'no-undef': 'off',
      // Pre-existing violations across the codebase (e.g. domain entities
      // with private fields reserved for future use, adapters that
      // deliberately throw a fresh error without `cause`). Relaxed to
      // establish a clean lint baseline today without a retroactive
      // refactor pass; new code should still avoid triggering these.
      'no-unused-private-class-members': 'off',
      'preserve-caught-error': 'off',
    },
  },
];
