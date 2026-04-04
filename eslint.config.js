import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

const browserGlobals = {
  ...globals.browser,
  ...globals.node,
  chrome: 'readonly',
  browser: 'readonly',
};

export default [
  js.configs.recommended,
  ...svelte.configs.recommended,
  {
    plugins: {
      '@typescript-eslint': typescript,
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', 'eslint.config.js'],
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-undef': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: 'warn',
      curly: 'warn',
      'no-unused-expressions': 'warn',
      'no-duplicate-imports': 'warn',
      'no-case-declarations': 'error',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.{js,ts}'],
    languageOptions: {
      globals: browserGlobals,
      parserOptions: {
        parser: typescriptParser,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
];
