import { streamText } from 'ai';
import { TextStreamerConfig, StreamTextReturn, TemplateConfig } from './types';
import { LLMRenderer } from './LLMRenderer';

export class TextStreamer extends LLMRenderer<TextStreamerConfig, Awaited<StreamTextReturn>> {
	protected async callLLMFunction(config: Omit<TextStreamerConfig, keyof TemplateConfig>): Promise<Awaited<StreamTextReturn>> {
		return streamText(config);
	}
}