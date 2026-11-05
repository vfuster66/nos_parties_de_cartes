import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import prettier from 'eslint-config-prettier'

export default defineConfigWithVueTs(
  {
    ignores: [
      'dist/**',
      'server/dist/**',
      'playwright-report/**',
      'test-results/**',
      'dev-dist/**',
      'coverage/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  prettier,
)
