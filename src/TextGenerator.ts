import { generateText } from 'ai';
import { TextGeneratorConfig, GenerateTextReturn, TemplateConfig } from './types';
import { LLMRenderer } from './LLMRenderer';

/**
 * TextGenerator class that generates text using an LLM after rendering the template.
 * Can be called as a function in two ways:
 *
 * 1. With a string prompt and optional context:
 *    const { text } = await generator('Write about {{ topic }}', { topic: 'AI' })
 *
 * 2. With a config override object:
 *    const { text } = await generator({ context: { topic: 'AI' }, temperature: 0.7 })
 */
export class TextGenerator extends LLMRenderer<TextGeneratorConfig, Awaited<GenerateTextReturn>> {
	protected async callLLMFunction(config: Omit<TextGeneratorConfig, keyof TemplateConfig>): Promise<Awaited<GenerateTextReturn>> {
		return generateText(config);
	}
}