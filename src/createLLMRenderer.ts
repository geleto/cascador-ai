// createLLMRenderer.ts
import { Config } from "./Config";
import { TemplateEngine } from "./TemplateEngine";
import { Context, TemplateConfig } from "./types";

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
};

export type GeneratorConfig<F extends LLMFunction> = Parameters<F>[0] & TemplateConfig;

// Create a generator that preserves function overloads
export function createLLMGenerator<F extends LLMFunction>(
	config: GeneratorConfig<F>,
	func: F,
	parent?: Config
): GeneratorCallSignature<F> {
	const renderer = new TemplateEngine(config, parent);

	const generator = (async (promptOrConfig?: any, context?: Context) => {
		try {
			const prompt = await renderer.call(promptOrConfig, context);

			// Object scenario - user passed a config object
			if (typeof promptOrConfig !== 'string' && promptOrConfig) {
				const mergedConfig = Config.mergeConfig(renderer.config, promptOrConfig);
				mergedConfig.prompt = prompt;
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// String scenario - user passed a prompt string
			if (typeof promptOrConfig === 'string') {
				const mergedConfig = Config.mergeConfig(renderer.config, { prompt });
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// No arguments scenario - fixed to properly use the rendered prompt
			const mergedConfig = Config.mergeConfig(renderer.config, { prompt });
			return func(mergedConfig);

		} catch (error: any) {
			throw new Error(`Generator execution failed: ${error?.message || 'Unknown error'}`, { cause: error });
		}
	}) as GeneratorCallSignature<F>;

	generator.config = renderer.config;
	return generator;
}

export type StreamerCallSignature<F extends LLMFunction> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
}

export type StreamerConfig<F extends LLMFunction> = Parameters<F>[0] & TemplateConfig;

export function createLLMStreamer<F extends LLMFunction>(
	config: StreamerConfig<F>,
	func: F,
	parent?: Config
): StreamerCallSignature<F> {
	const renderer = new TemplateEngine(config, parent);

	const streamer = (async (promptOrConfig?: Partial<StreamerConfig<F>> | string, context?: Context) => {
		try {
			const prompt = await renderer.call(promptOrConfig, context);

			// Object scenario - user passed a config object
			if (typeof promptOrConfig !== 'string' && promptOrConfig) {
				const mergedConfig = Config.mergeConfig(renderer.config, promptOrConfig);
				mergedConfig.prompt = prompt; // Ensure prompt is set after merging
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// String scenario - user passed a prompt string
			if (typeof promptOrConfig === 'string') {
				const mergedConfig = Config.mergeConfig(renderer.config, { prompt });
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// No arguments scenario
			const mergedConfig = Config.mergeConfig(renderer.config, { prompt });
			return func(mergedConfig);
		} catch (error: any) {
			throw new Error(`Streamer execution failed: ${error?.message || 'Unknown error'}`, { cause: error });
		}
	}) as StreamerCallSignature<F>;

	streamer.config = renderer.config;
	return streamer;
}