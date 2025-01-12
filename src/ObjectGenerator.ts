import { generateObject, JSONValue } from 'ai';
import { ObjectGeneratorConfig, GenerateObjectReturn } from './types';
import { LLMRendererBase } from './LLMRendereBaser';

class ObjectGenerator<T> extends LLMRendererBase<ObjectGeneratorConfig, GenerateObjectReturn<T>> {
	protected async callLLMFunction(config: ObjectGeneratorConfig): Promise<GenerateObjectReturn<T>> {
		return generateObject(config);
	}
}

export class ObjectGenerator<T> extends LLMRendererBase<ObjectGeneratorConfig, GenerateObjectReturn<T>> {

	// Implementation
	protected async callLLMFunction(config: ObjectGeneratorConfig): Promise<GenerateObjectReturn<T>> {
		return generateObject(config);
	}
}