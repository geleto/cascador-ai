// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		files: ['src/**/*.ts'],
		extends: [
			js.configs.recommended,
			...tseslint.configs.recommendedTypeChecked,
			...tseslint.configs.strictTypeChecked,
			...tseslint.configs.stylisticTypeChecked,
		],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: true,
			},
		},
		rules: {
			// Base formatting
			'indent': ['error', 'tab'],
			'linebreak-style': ['error', 'unix'],

			// Spacing rules
			'object-curly-spacing': ['error', 'always'],
			'array-bracket-spacing': ['error', 'never'],
			'comma-spacing': ['error', { before: false, after: true }],
			'keyword-spacing': ['error', { before: true, after: true }],
			'space-infix-ops': 'error',
			'space-before-blocks': 'error',
			'space-before-function-paren': ['error', {
				anonymous: 'always',
				named: 'never',
				asyncArrow: 'always'
			}],
			'space-in-parens': ['error', 'never'],
			'no-multi-spaces': 'error',

			"@typescript-eslint/no-explicit-any": ["error", {
				"ignoreTypedefs": true
			}],
		}
	}
);