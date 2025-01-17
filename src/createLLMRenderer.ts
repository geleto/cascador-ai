import { ConfigData, mergeConfigs } from "./ConfigData";
import { TemplateEngine } from "./TemplateEngine";
import { Context, BaseConfig } from "./types";

//the vercel function, todo: make more specific
export type GeneratorFunction<TConfig = any, TResult = any> =
	(config: TConfig) => Promise<TResult> | TResult;

export type StreamFunction = (config: any) => any;

export interface GeneratorCallSignature<TConfig extends BaseConfig, F extends GeneratorFunction> {
	(promptOrConfig?: Partial<TConfig> | string, context?: Context): ReturnType<F>;
	config: TConfig;
}

//todo - merge the 2 functions
export function createLLMGenerator<CType extends BaseConfig>(config: BaseConfig, func: GeneratorFunction, parent?: ConfigData)
	: GeneratorCallSignature<CType, typeof func> {

	const renderer = new TemplateEngine(config, parent);

	//todo - the call config must be a proper almost full config
	const generatorFn = (async (promptOrConfig?: CType | string, context?: Context) => {
		const prompt = await renderer.call(promptOrConfig, context);

		// Object scenario - user passed a settings object
		if (typeof promptOrConfig !== 'string' && promptOrConfig) {
			const mergedConfig = mergeConfigs(renderer.config, promptOrConfig);
			mergedConfig.prompt = prompt;
			if (context) {
				mergedConfig.context = Object.assign(
					{} as Record<string, unknown>,
					mergedConfig.context ?? {},
					context
				) as Context;
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return func(mergedConfig);
		}

		// String scenario - user passed a prompt string
		if (typeof promptOrConfig === 'string') {
			const mergedConfig = mergeConfigs(renderer.config, { prompt });
			if (context) {
				mergedConfig.context = Object.assign(
					{} as Record<string, unknown>,
					mergedConfig.context ?? {},
					context
				) as Context;
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return func(mergedConfig);
		}

		// No arguments scenario
		const mergedConfig = mergeConfigs(renderer.config, { prompt });
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return func(mergedConfig);
	}) as GeneratorCallSignature<CType, typeof func>;

	generatorFn.config = renderer.config as CType;
	return generatorFn;
}

export interface StreamerCallSignature<TConfig extends BaseConfig, F extends StreamFunction> {
	(promptOrConfig?: Partial<TConfig> | string, context?: Context): ReturnType<F>;
	config: TConfig;
}

export function createLLMStreamer<CType extends BaseConfig>(
	config: BaseConfig, func: StreamFunction, parent?: ConfigData
): StreamerCallSignature<CType, typeof func> {
	const renderer = new TemplateEngine(config, parent);

	const streamerFn = (async (promptOrConfig?: CType | string, context?: Context) => {
		try {
			const prompt = await renderer.call(promptOrConfig, context);

			// Object scenario - user passed a settings object
			if (typeof promptOrConfig !== 'string' && promptOrConfig) {
				const mergedConfig = mergeConfigs(renderer.config, promptOrConfig);
				mergedConfig.prompt = prompt; // Ensure prompt is set after merging
				if (context) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...context };
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return func(mergedConfig);
			}

			// String scenario - user passed a prompt string
			if (typeof promptOrConfig === 'string') {
				const mergedConfig = mergeConfigs(renderer.config, { prompt });
				if (context) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...context };
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return func(mergedConfig);
			}

			// No arguments scenario
			const mergedConfig = mergeConfigs(renderer.config, { prompt });
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return func(mergedConfig);
		} catch (error: any) {
			const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
			throw new Error(`Streamer execution failed: ${errorMessage}`, { cause: error });
		}
	}) as StreamerCallSignature<CType, typeof func>;

	streamerFn.config = renderer.config as CType;
	return streamerFn;
}