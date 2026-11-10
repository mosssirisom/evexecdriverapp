import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

// Next's own presets (core web vitals + TypeScript). They already load the
// react, react-hooks, jsx-a11y and typescript-eslint plugins.
const eslintConfig = [
  { ignores: ['.next/', 'node_modules/', 'next-env.d.ts', 'public/sw.js', 'supabase/functions/'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default eslintConfig
