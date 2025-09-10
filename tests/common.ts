import 'dotenv/config';
import { LoaderInterface } from 'cascada-engine';
import { LanguageModel } from 'ai';

import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
export const modelName = 'claude-3-5-haiku-latest';
export const model: LanguageModel = anthropic(modelName);
export const createProvider = createAnthropic;

/*import { openai, createOpenAI, OpenAIProviderSettings } from '@ai-sdk/openai';
export const modelName = 'gpt-5-nano';
export const createProvider = createOpenAI;
export const model = openai(modelName);
*/

export const timeout = 10000;
export const temperature = 0.2;

/**
 * StringLoader class for testing purposes.
 * Manages templates in memory for test scenarios.
 */
export class StringLoader implements LoaderInterface {
	private texts = new Map<string, string>();

	load(name: string): string | null {
		return this.texts.get(name) ?? null;
	}

	addString(name: string, content: string) {
		this.texts.set(name, content);
	}
}

/**
 * AsyncStringLoader class for testing async loader functionality.
 * Returns Promise<LoaderSource> from getSource to simulate async loading.
 */
export class AsyncStringLoader implements LoaderInterface {
	private texts = new Map<string, string>();

	async load(name: string): Promise<string | null> {
		//wait 1 ms
		await new Promise(resolve => setTimeout(resolve, 1));
		// return the value
		return this.texts.get(name) ?? null;
	}

	addString(name: string, content: string) {
		this.texts.set(name, content);
	}
}