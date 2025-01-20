import { LanguageModel } from "ai";
import { ConfigData, mergeConfigs } from "./ConfigData";
import { TemplateEngine } from "./TemplateEngine";
import { Context, BaseConfig, hasModel } from "./types";

// The vercel function
//type VercelLLMFunction = typeof generateObject | typeof generateText | typeof streamObject | typeof streamText;
//type VercelLLMFunction<TConfig, TResult> = (config: TConfig) => Promise<TResult> | TResult;

type WithModel<T> = T & { model: LanguageModel };
type VercelLLMFunction<TConfig extends BaseConfig, TResult> =
	(config: WithModel<TConfig>) => Promise<TResult> | TResult;


/**
 * Function signature for LLM generation/streaming calls.
 * If base config has no model, requires model in call arguments.
 * If base config has model, accepts any call signature.
 */


export interface LLMCallSignature<TConfig extends BaseConfig, TResult> {
	(promptOrConfig?: TConfig extends { model: LanguageModel }
		? TConfig | string | Context // Model in config - any form ok
		: TConfig & { model: LanguageModel }, // No model in config - must provide model
		context?: Context
	): Promise<TResult>; // The function's call signature
	config: TConfig; // Additional property on the function type
};

export function createLLMRenderer<TConfig extends BaseConfig, TResult>(
	config: TConfig,
	func: VercelLLMFunction<TConfig & { model: LanguageModel }, TResult>,
	parent?: ConfigData
): LLMCallSignature<TConfig, TResult> {
	const renderer = new TemplateEngine(config, parent);

	const llmFn = (async (promptOrConfig?: Partial<TConfig> | string | Context, context?: Context) => {
		try {
			// Handle case where first param is just context
			const effectiveContext = typeof promptOrConfig === 'object' && !('prompt' in promptOrConfig)
				? promptOrConfig as Context
				: context;

			const effectivePromptOrConfig = typeof promptOrConfig === 'object' && !('prompt' in promptOrConfig)
				? undefined
				: promptOrConfig;

			const prompt = await renderer.call(effectivePromptOrConfig, effectiveContext);

			let mergedConfig: BaseConfig;

			// Object scenario - llmFn(config, context)
			if (typeof effectivePromptOrConfig !== 'string' && effectivePromptOrConfig) {
				mergedConfig = mergeConfigs(renderer.config, effectivePromptOrConfig as TConfig);
				mergedConfig.prompt = prompt;
				if (effectiveContext) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...effectiveContext };
				}
			}
			// String scenario - llmFn("template string", context)
			else if (typeof effectivePromptOrConfig === 'string') {
				mergedConfig = mergeConfigs(renderer.config, { prompt });
				if (effectiveContext) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...effectiveContext };
				}
			}
			// Context only scenario - llmFn(context)
			else {
				mergedConfig = renderer.config;
				mergedConfig.prompt = prompt;
				if (effectiveContext) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...effectiveContext };
				}
			}

			// Check for model at runtime after all configs are merged
			if (!hasModel(mergedConfig)) {
				throw new Error('Model must be specified either in config, parent, or call arguments');
			}

			return (await func(mergedConfig as TConfig & { model: LanguageModel })) as TResult;
		} catch (error: any) {
			const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
			throw new Error(`${func.name || 'LLM'} execution failed: ${errorMessage}`, { cause: error });
		}
	}) as LLMCallSignature<TConfig, TResult>;

	llmFn.config = renderer.config as TConfig;
	return llmFn;
}