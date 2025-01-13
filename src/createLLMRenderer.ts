// createLLMRenderer.ts
import { ConfigData } from "./ConfigData";
import { TemplateEngine } from "./TemplateEngine";
import { Context, ConfigFromFunction, TemplateConfig, StreamFunction, GeneratorFunction } from "./types";

export type GeneratorCallSignature<F extends GeneratorFunction> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
};

export function createLLMGenerator<F extends GeneratorFunction>(
	config: ConfigFromFunction<F>, func: F, parent?: ConfigData
): GeneratorCallSignature<F> {
	const renderer = new TemplateEngine(config, parent);
	const generator = (async (promptOrConfig?: any, context?: Context) => {
		try {
			const prompt = await renderer.call(promptOrConfig, context);

			// Object scenario - user passed a settings object
			if (typeof promptOrConfig !== 'string' && promptOrConfig) {
				const mergedConfig = ConfigData.mergeConfigs(renderer.config, promptOrConfig);
				mergedConfig.prompt = prompt;
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// String scenario - user passed a prompt string
			if (typeof promptOrConfig === 'string') {
				const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// No arguments scenario - fixed to properly use the rendered prompt
			const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
			return func(mergedConfig);

		} catch (error: any) {
			throw new Error(`Generator execution failed: ${error?.message || 'Unknown error'}`, { cause: error });
		}
	}) as GeneratorCallSignature<F>;

	generator.config = renderer.config;
	return generator;
}

export type StreamerCallSignature<F extends StreamFunction> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
}

export function createLLMStreamer<F extends StreamFunction>(
	config: ConfigFromFunction<F>, func: F, parent?: ConfigData
): StreamerCallSignature<F> {
	const renderer = new TemplateEngine(config, parent);
	const streamer = (async (promptOrConfig?: Partial<ConfigFromFunction<F>> | string, context?: Context) => {
		try {
			const prompt = await renderer.call(promptOrConfig, context);

			// Object scenario - user passed a settings object
			if (typeof promptOrConfig !== 'string' && promptOrConfig) {
				const mergedConfig = ConfigData.mergeConfigs(renderer.config, promptOrConfig);
				mergedConfig.prompt = prompt; // Ensure prompt is set after merging
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// String scenario - user passed a prompt string
			if (typeof promptOrConfig === 'string') {
				const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
				if (context) {
					mergedConfig.context = { ...mergedConfig.context || {}, ...context };
				}
				return func(mergedConfig);
			}

			// No arguments scenario
			const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
			return func(mergedConfig);
		} catch (error: any) {
			throw new Error(`Streamer execution failed: ${error?.message || 'Unknown error'}`, { cause: error });
		}
	}) as StreamerCallSignature<F>;

	streamer.config = renderer.config;
	return streamer;
}