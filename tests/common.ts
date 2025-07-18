import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { ILoader, LoaderSource } from 'cascada-engine';
export const model = anthropic('claude-3-5-haiku-latest');

/**
 * StringLoader class for testing purposes.
 * Manages templates in memory for test scenarios.
 */
export class StringLoader implements ILoader {
	private templates = new Map<string, string>();

	getSource(name: string): LoaderSource | null {
		if (!this.templates.has(name)) {
			return null; // return null rather than throw an error so that ignore missing works
		}

		return {
			src: this.templates.get(name)!,
			path: name,
			noCache: false,
		};
	}

	addTemplate(name: string, content: string) {
		this.templates.set(name, content);
	}
}