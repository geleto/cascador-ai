import { generateObject, generateText, streamObject, streamText } from "ai";
import { ConfigData, mergeConfigs } from "./ConfigData";
import { TemplateEngine } from "./TemplateEngine";
import { Context, BaseConfig } from "./types";

//the vercel function
type VercelLLMFunction = typeof generateObject | typeof generateText | typeof streamObject | typeof streamText;

export interface LLMCallSignature<TConfig extends BaseConfig, F extends VercelLLMFunction> {
	(promptOrConfig?: Partial<TConfig> | string | Context, context?: Context): ReturnType<F>;
	config: TConfig;
}

//todo - the generator fn congig must be type checked to have model and not have tools if object generator/streamer
//todo - the config/parent must be type checked to have model and not have tools if object generator/streamer
//todo must return the correct type <TResult> for the generator function
export function createLLMRenderer<CType extends BaseConfig, F extends VercelLLMFunction>(
	config: CType,
	func: F,
	parent?: ConfigData
): LLMCallSignature<CType, F> {
	const renderer = new TemplateEngine(config, parent);

	//todo - the call config must be a proper almost full config
	const llmFn = (async (promptOrConfig?: Partial<CType> | string | Context, context?: Context) => {
		try {
			// Handle case where first param is just context
			const effectiveContext = typeof promptOrConfig === 'object' && !('prompt' in promptOrConfig)
				? promptOrConfig as Context
				: context;

			const effectivePromptOrConfig = typeof promptOrConfig === 'object' && !('prompt' in promptOrConfig)
				? undefined
				: promptOrConfig;

			const prompt = await renderer.call(effectivePromptOrConfig, effectiveContext);

			// Object scenario - llmFn(config, context)
			if (typeof effectivePromptOrConfig !== 'string' && effectivePromptOrConfig) {
				const mergedConfig = mergeConfigs(renderer.config, effectivePromptOrConfig);
				mergedConfig.prompt = prompt;
				if (effectiveContext) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...effectiveContext };
				}
				return func(mergedConfig);
			}

			// String scenario - llmFn("template string", context)
			if (typeof effectivePromptOrConfig === 'string') {
				const mergedConfig = mergeConfigs(renderer.config, { prompt });
				if (effectiveContext) {
					mergedConfig.context = { ...mergedConfig.context ?? {}, ...effectiveContext };
				}
				return func(mergedConfig);
			}

			// Context only scenario - llmFn(context)
			const mergedConfig = renderer.config;
			mergedConfig.prompt = prompt;
			if (effectiveContext) {
				mergedConfig.context = { ...mergedConfig.context ?? {}, ...effectiveContext };
			}
			return func(mergedConfig);
		} catch (error: any) {
			const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
			throw new Error(`${func.name || 'LLM'} execution failed: ${errorMessage}`, { cause: error });
		}
	}) as LLMCallSignature<CType, F>;

	llmFn.config = renderer.config as CType;
	return llmFn;
}