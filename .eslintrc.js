module.exports = {
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        'eslint-config-streamr-ts'
    ],
    env: {
        node: true
    },
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
        '@typescript-eslint/member-delimiter-style': ['error', {
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
        '@typescript-eslint/comma-spacing': ['error'],
        '@typescript-eslint/brace-style': ['error', '1tbs', {
            'allowSingleLine': true
        }],
        '@typescript-eslint/default-param-last': ['error'],
        '@typescript-eslint/func-call-spacing': ['error'],
        '@typescript-eslint/keyword-spacing': ['error'],
        '@typescript-eslint/no-invalid-this': ['error'],
        '@typescript-eslint/no-unused-expressions': ['error'],
        '@typescript-eslint/no-useless-constructor': ['error'],
        '@typescript-eslint/object-curly-spacing': ['error', 'always'],
        '@typescript-eslint/space-before-blocks': ['error'],
        '@typescript-eslint/space-before-function-paren': ['error', {
            'anonymous': 'never',
            'named': 'never',
            'asyncArrow': 'always'
        }],
        '@typescript-eslint/space-infix-ops': ['error'],
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { 'vars': 'all', 'args': 'all', 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }],
        'class-methods-use-this': ['error'],
        'prefer-arrow-callback': ['error'],
        'promise/no-promise-in-callback': ['error'],
        '@typescript-eslint/no-empty-function': 'error'
    }
}
