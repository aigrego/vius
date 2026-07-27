import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // 抽离自 orioles-service 的既有代码存在大量 any 与旧式 hooks 写法，
    // 放宽为 warn，新代码请遵循默认严格规则
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      '@next/next/no-img-element': 'warn'
    }
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'prisma/migrations/**'])
]);

export default eslintConfig;
