import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  tseslint.configs.strict,
  { languageOptions: { globals: globals.node } },
  {
    // Il motore deve essere deterministico: stesso stato + stessi comandi + stesso seed = stesso risultato.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Usa il generatore con seed del motore (ctx.rng).',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: "Il motore usa solo il tempo di gioco, mai l'ora di sistema." },
        {
          name: 'performance',
          message: "Il motore usa solo il tempo di gioco, mai l'ora di sistema.",
        },
        { name: 'crypto', message: 'Usa il generatore con seed del motore (ctx.rng).' },
      ],
    },
  },
);
