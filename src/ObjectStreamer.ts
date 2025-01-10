import { streamObject } from 'ai';
import { ObjectStreamerConfig, StreamObjectReturn, TemplateConfig } from './types';
import { LLMRenderer } from './LLMRenderer';
import { z } from 'zod';

export class ObjectStreamer<T extends ObjectStreamerConfig> extends LLMRenderer<T, Awaited<StreamObjectReturn<z.infer<T['schema']>>>> {
	protected async callLLMFunction(config: Omit<T, keyof TemplateConfig>): Promise<Awaited<StreamObjectReturn<z.infer<T['schema']>>>> {
		return streamObject(config);
	}
}