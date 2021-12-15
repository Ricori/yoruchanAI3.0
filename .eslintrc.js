module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'airbnb-base',
    'airbnb-typescript/base',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/naming-convention': 'off',
    'import/prefer-default-export': 'off',
    'no-use-before-define': 'off',
    'camelcase': 'off',
    'max-len': 'off',
    'class-methods-use-this': 'off',
    'radix': 'off',
    'prefer-spread': 'off',
    'consistent-return': 'off',
    'no-restricted-syntax': 'off',
    'no-await-in-loop': 'off',
    'no-nested-ternary': 'off'
  },
};
