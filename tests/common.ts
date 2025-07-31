import 'dotenv/config';
import { anthropic, createAnthropic, AnthropicProviderSettings } from '@ai-sdk/anthropic';
import { ILoader, LoaderSource } from 'cascada-engine';

export const modelName = 'claude-3-5-haiku-latest';
//export const modelName = 'claude-4-sonnet-latest';
//export const modelName = 'gpt-4.1-nano';
export const model = anthropic(modelName);
export const createProvider = (options: AnthropicProviderSettings) => createAnthropic(options);

export const timeout = 10000;
export const temperature = 0.1;

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