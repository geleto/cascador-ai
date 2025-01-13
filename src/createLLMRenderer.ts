import { Config } from "./Config";
import { TemplateEngine } from "./TemplateEngine";
import { Context, TemplateConfig } from "./types";

// Generator function signature for Vercel AI functions that return Promise
export type GeneratorCallSignature<F extends (config: any) => Promise<any>> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
}

export type GeneratorConfig<F extends (config: any) => Promise<any>> = Parameters<F>[0] & TemplateConfig;

// Create a generator from a Vercel AI function that returns Promise
export function createLLMGenerator<F extends (config: any) => Promise<any>>
	(config: GeneratorConfig<F>, func: F, parent?: Config) {
	type rtype = Awaited<ReturnType<F>>; // avoid TS bug where ReturnType<F> is not considered a promise
	const renderer = new TemplateEngine(config, parent);
	const generator: GeneratorCallSignature<F> = (
		async (promptOrConfig?: Partial<GeneratorConfig<F>> | string, context?: Context): Promise<rtype> => {
			const prompt = await renderer.call(promptOrConfig, context);
			if (typeof promptOrConfig !== 'string') {
				const mergedConfig = Config.mergeConfig(renderer.config, promptOrConfig);
				if (context) {
					mergedConfig.context = context;
				}
				return func(mergedConfig);
			}
			else if (typeof promptOrConfig === 'string') {
				const mergedConfig = Config.mergeConfig(renderer.config, { prompt: promptOrConfig });
				return func(mergedConfig);
			}
			return func(renderer.config);
		}
	) as GeneratorCallSignature<F>;
	generator.config = renderer.config;
	return generator;
}

// Streamer function signature for Vercel AI functions that return Record with streams
export type StreamerCallSignature<F extends (config: any) => Record<string, any>> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): Promise<ReturnType<F>>;
	config: Parameters<F>[0] & TemplateConfig;
}

export type StreamerConfig<F extends (config: any) => Record<string, any>> = Parameters<F>[0] & TemplateConfig;

// Create a streamer from a Vercel AI function that returns Record with streams
export function createLLMStreamer<F extends (config: any) => Record<string, any>>
	(config: StreamerConfig<F>, func: F, parent?: Config) {
	const renderer = new TemplateEngine(config, parent);
	const streamer: StreamerCallSignature<F> = (
		async (promptOrConfig?: Partial<StreamerConfig<F>> | string, context?: Context) => {
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
		}
	) as StreamerCallSignature<F>;//it's missing the config property, added below
	streamer.config = renderer.config;
	return streamer;
}