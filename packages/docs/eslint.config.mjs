import docusaurusPlugin from '@docusaurus/eslint-plugin'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

import { generateEslintConfig } from '@sofie-automation/code-standard-preset/eslint/main.mjs'

const eslintConfig = await generateEslintConfig({
	ignores: ['.docusaurus', 'build'],
})

eslintConfig.push({
	plugins: {
		docusaurus: docusaurusPlugin,
		react: reactPlugin,
		'react-hooks': reactHooksPlugin,
	},
	rules: {
		'n/no-missing-import': [
			2,
			{
				allowModules: [
					'@theme/Layout',
					'@docusaurus/Link',
					'@docusaurus/useDocusaurusContext',
					// '@site/abc'
				],
			},
		],
	},
})

export default eslintConfig
