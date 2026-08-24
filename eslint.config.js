import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist', 'dev-dist', 'coverage', '.vercel', 'supabase/.temp', 'supabase/pgdelta'],
  },
  {
    // src/ está no tsconfig.json (`include: ["src"]`) — regras type-aware ligadas.
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Comparação estrita sempre (ver .agents/rules/javascript-typescript.md).
      eqeqeq: ['error', 'always'],
      // Só as regras clássicas de hooks — o resto do preset "recommended" do
      // pacote mira preparação para o React Compiler (purity/immutability/
      // gating), que não é o alvo aqui.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...reactRefresh.configs.vite.rules,
      // Colocar context + hook no mesmo arquivo (padrão usado no projeto) quebra
      // a granularidade do Fast Refresh — DX, não bug; fica como aviso.
      'react-refresh/only-export-components': 'warn',
      // onClick={async () => {...}} é o padrão usado em toda a UI daqui — a regra
      // continua ligada para o resto (promises não tratadas em código não-JSX).
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // `cond ? doA() : doB()` como statement é usado de propósito no projeto.
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
      // Convenção já usada no projeto para parâmetros/bindings intencionalmente não usados.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // api/ (funções Edge da Vercel) e vite.config.ts ficam fora do
    // tsconfig.json raiz — lint sintático, sem regras type-aware.
    files: ['api/**/*.ts', 'vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      eqeqeq: ['error', 'always'],
    },
  },
)
