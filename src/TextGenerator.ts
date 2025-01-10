import { generateText } from 'ai';
import { TextGeneratorConfig, GenerateTextReturn, TemplateConfig } from './types';
import { LLMRenderer } from './LLMRenderer';

export class TextGenerator extends LLMRenderer<TextGeneratorConfig, GenerateTextReturn> {
	protected async callLLMFunction(config: TextGeneratorConfig): Promise<GenerateTextReturn> {
		return generateText(config);
	}
}