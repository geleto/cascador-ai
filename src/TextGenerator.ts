import { generateText } from 'ai';
import { TextGeneratorConfig, GenerateTextReturn, TemplateConfig } from './types';
import { LLMRenderer } from './LLMRenderer';

export class TextGenerator extends LLMRenderer<TextGeneratorConfig, Awaited<GenerateTextReturn>> {
	protected async callLLMFunction(config: TextGeneratorConfig): GenerateTextReturn {
		return generateText(config);
	}
}