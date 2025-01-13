import { ConfigData } from "./ConfigData";
import { TemplateEngine } from "./TemplateEngine";
import { Context, ConfigFromFunction, TemplateConfig, StreamFunction, GeneratorFunction } from "./types";

export interface GeneratorCallSignature<F extends GeneratorFunction> {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
}

export function createLLMGenerator<F extends GeneratorFunction>(
	config: ConfigFromFunction<F>, func: F, parent?: ConfigData
): GeneratorCallSignature<F> {
	type rtype = Awaited<ReturnType<F>>;//avoid TS bug where async function return type is not inferred correctly as Promise
	const renderer = new TemplateEngine(config, parent);
	const generator = (async (promptOrConfig?: Partial<ConfigFromFunction<F>> | string, context?: Context): Promise<rtype> => {
		try {
			const prompt = await renderer.call(promptOrConfig, context);

			// Object scenario - user passed a settings object
			if (typeof promptOrConfig !== 'string' && promptOrConfig) {
				const mergedConfig = ConfigData.mergeConfigs(renderer.config, promptOrConfig);
				mergedConfig.prompt = prompt;
				if (context) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...context };
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return await func(mergedConfig);
			}

			// String scenario - user passed a prompt string
			if (typeof promptOrConfig === 'string') {
				const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
				if (context) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...context };
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return await func(mergedConfig);
			}

			// No arguments scenario - fixed to properly use the rendered prompt
			const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return await func(mergedConfig);

		} catch (error: any) {
			const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
			throw new Error(`Generator execution failed: ${errorMessage}`, { cause: error });
		}
	}) as GeneratorCallSignature<F>;

	generator.config = renderer.config;
	return generator;
}

export interface StreamerCallSignature<F extends StreamFunction> {
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
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...context };
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return func(mergedConfig);
			}

			// String scenario - user passed a prompt string
			if (typeof promptOrConfig === 'string') {
				const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
				if (context) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...context };
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return func(mergedConfig);
			}

			// No arguments scenario
			const mergedConfig = ConfigData.mergeConfigs(renderer.config, { prompt });
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return func(mergedConfig);
		} catch (error: any) {
			const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
			throw new Error(`Streamer execution failed: ${errorMessage}`, { cause: error });
		}
	}) as StreamerCallSignature<F>;

	streamer.config = renderer.config;
	return streamer;
}