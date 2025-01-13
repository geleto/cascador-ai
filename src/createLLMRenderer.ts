import { Config } from "./Config";
import { TemplateEngine } from "./TemplateEngine";
import { Context, TemplateConfig } from "./types";
import { generateObject, StreamTextResult, TextStreamPart } from 'ai';

// More flexible base types for different kinds of returns
type AnyStreamResult = {
	textStream?: AsyncIterable<any>;
	fullStream?: AsyncIterable<any>;
	[key: string]: any;
};

// Base type for LLM functions that encompasses both Promise and Stream returns
type LLMFunction = (config: any) => (Promise<any> | AnyStreamResult);

// Generator function signature that preserves overloads
export type GeneratorCallSignature<F extends LLMFunction> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
}

export type GeneratorConfig<F extends LLMFunction> = Parameters<F>[0] & TemplateConfig;

// Create a generator that preserves function overloads
export function createLLMGenerator<F extends LLMFunction>(
	config: GeneratorConfig<F>,
	func: F,
	parent?: Config
): GeneratorCallSignature<F> {
	const renderer = new TemplateEngine(config, parent);

	const generator = (async (promptOrConfig?: any, context?: Context) => {
		const prompt = await renderer.call(promptOrConfig, context);

		if (typeof promptOrConfig !== 'string') {
			const mergedConfig = Config.mergeConfig(renderer.config, promptOrConfig);
			if (context) {
				mergedConfig.context = context;
			}
			return func(mergedConfig);
		}
		else if (typeof promptOrConfig === 'string') {
			const mergedConfig = Config.mergeConfig(renderer.config, { prompt });
			return func(mergedConfig);
		}
		return func(renderer.config);
	}) as GeneratorCallSignature<F>;

	generator.config = renderer.config;
	return generator;
}

// Streamer function signature that handles stream results
export type StreamerCallSignature<F extends LLMFunction> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
}

export type StreamerConfig<F extends LLMFunction> = Parameters<F>[0] & TemplateConfig;

// Create a streamer that handles stream results
export function createLLMStreamer<F extends LLMFunction>(
	config: StreamerConfig<F>,
	func: F,
	parent?: Config
): StreamerCallSignature<F> {
	const renderer = new TemplateEngine(config, parent);

	const streamer = (async (promptOrConfig?: Partial<StreamerConfig<F>> | string, context?: Context) => {
		const prompt = await renderer.call(promptOrConfig, context);

		if (typeof promptOrConfig !== 'string') {
			const mergedConfig = Config.mergeConfig(renderer.config, promptOrConfig);
			if (context) {
				mergedConfig.context = context;
			}
			mergedConfig.prompt = prompt;
			return func(mergedConfig);
		}
		else if (typeof promptOrConfig === 'string') {
			const mergedConfig = Config.mergeConfig(renderer.config, { prompt });
			return func(mergedConfig);
		}
		const mergedConfig = { ...renderer.config, prompt };
		return func(mergedConfig);
	}) as StreamerCallSignature<F>;

	streamer.config = renderer.config;
	return streamer;
}