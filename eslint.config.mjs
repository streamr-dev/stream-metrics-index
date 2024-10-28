import streamr from 'eslint-config-streamr-ts'

export default [
    {
        ignores: [
            'node_modules/**',
            'dist/**'
        ]
    },
    ...streamr,
    {
        rules: {
            'eol-last': ['error'],
            'no-console': ['error', {allow: ['warn', 'error', 'info']}],
            'no-restricted-imports': ['error', {
                "patterns": ["*/dist"]
            }],
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/consistent-indexed-object-style': ['error'],
            '@typescript-eslint/consistent-type-assertions': ['error'],
            '@typescript-eslint/consistent-type-definitions': ['error'],
            '@stylistic/member-delimiter-style': ['error', {
                'singleline': {
                    'delimiter': 'comma'
                },
                'multiline': {
                    'delimiter': 'none'
                }
            }],
            '@typescript-eslint/no-confusing-non-null-assertion': ['error'],
            '@typescript-eslint/no-duplicate-enum-values': ['error'],
            '@typescript-eslint/no-extraneous-class': ['error'],
            '@typescript-eslint/no-invalid-void-type': ['error'],
            '@typescript-eslint/no-non-null-asserted-nullish-coalescing': ['error'],
            '@typescript-eslint/no-require-imports': ['error'],
            '@typescript-eslint/no-useless-empty-export': ['error'],
            '@typescript-eslint/prefer-for-of': ['error'],
            '@typescript-eslint/prefer-function-type': ['error'],
            '@typescript-eslint/prefer-literal-enum-member': ['error'],
            '@stylistic/comma-spacing': ['error'],
            '@stylistic/brace-style': ['error', '1tbs', {
                'allowSingleLine': true
            }],
            '@typescript-eslint/default-param-last': ['error'],
            '@stylistic/func-call-spacing': ['error'],
            '@stylistic/keyword-spacing': ['error'],
            '@typescript-eslint/no-invalid-this': ['error'],
            '@typescript-eslint/no-unused-expressions': ['error'],
            '@typescript-eslint/no-useless-constructor': ['error'],
            '@stylistic/object-curly-spacing': ['error', 'always'],
            '@stylistic/space-before-blocks': ['error'],
            '@stylistic/space-before-function-paren': ['error', {
                'anonymous': 'never',
                'named': 'never',
                'asyncArrow': 'always'
            }],
            '@stylistic/space-infix-ops': ['error'],
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { 'vars': 'all', 'args': 'all', 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }],
            'class-methods-use-this': ['error'],
            'prefer-arrow-callback': ['error'],
            'promise/no-promise-in-callback': ['error'],
            '@typescript-eslint/no-empty-function': 'error'
        }
    }
]
