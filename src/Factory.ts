import { generateText, generateObject, streamText, CoreTool, streamObject, LanguageModel } from 'ai';
import { ConfigData, ConfigProvider, mergeConfigs } from './ConfigData';
import { TemplateEngine } from './TemplateEngine';
import {
	Context, TemplatePromptType,
	//configs:
	AnyConfig, BaseConfig,
	TemplateConfig, OptionalTemplateConfig,
	GenerateTextConfig, GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig,
	StreamTextConfig, StreamObjectObjectConfig, StreamObjectArrayConfig, StreamObjectNoSchemaConfig,
	//Return types:
	GenerateTextResult, GenerateObjectObjectResult, GenerateObjectArrayResult, GenerateObjectEnumResult, GenerateObjectNoSchemaResult,
	StreamTextResult, StreamObjectObjectResult, StreamObjectArrayResult, StreamObjectNoSchemaResult,
	GenerateObjectResultAll, StreamObjectResultAll,
	OptionalNoPromptTemplateConfig,
	ObjectSchemaType,
	ElementSchemaType,
} from './types';
import { ILoaderAny } from 'cascada-tmpl';
import { validateBaseConfig, ConfigError, validateCall } from './validate';

// Ensures T is an exact match of one of the union members in U
// Prevents extra properties and mixing properties from different union types
type StrictUnionSubtype<T, U> = U extends any
	? T extends U
	? Exclude<keyof T, keyof U> extends never ? T : never
	: never
	: never;

type TemplateCallSignature<TConfig extends Partial<OptionalTemplateConfig>> =
	TConfig extends { prompt: string }
	? {
		//TConfig has prompt, no prompt argument is needed
		(promptOrContext?: Context | string): Promise<string>;//one optional argument, prompt or context
		(prompt: string, context: Context): Promise<string>;//two arguments, prompt and context
		config: TConfig;
	}
	: {
		//TConfig has no prompt, prompt argument is needed
		(prompt: string, context?: Context): Promise<string>;//prompt is a must, context is optional
		config: TConfig;
	};

type PromptOrMessage = { prompt: string } | { messages: NonNullable<BaseConfig['messages']> };

type EnsurePromise<T> = T extends Promise<any> ? T : Promise<T>;

type LLMCallSignature<
	TConfig extends Partial<BaseConfig & OptionalTemplateConfig>,
	TResult
> = TConfig extends { promptType: 'text' }
	? (
		//TConfig has no template, no context argument is needed
		TConfig extends PromptOrMessage
		? {
			(prompt?: string): TResult;//TConfig has prompt, prompt is optional
			config: TConfig;
		}
		: {
			(prompt: string): TResult;//TConfig has no prompt, prompt argument is required
			config: TConfig;
		}
	)
	: (
		// TConfig has template, an optional context argument can be used
		// and the return type is always a promise because we wait for the result
		TConfig extends PromptOrMessage
		? {
			//TConfig has prompt, prompt is optional
			(promptOrContext?: Context | string): EnsurePromise<TResult>;//one optional argument, prompt or context
			(prompt: string, context: Context): EnsurePromise<TResult>;//two arguments, prompt and context
			config: TConfig;
		}
		: {
			//TConfig has no prompt, prompt argument is required
			(prompt: string, context?: Context): EnsurePromise<TResult>;//prompt is a must, context is optional
			config: TConfig;
		}
	);

type RequireMissing<
	// Type containing all required properties
	TRequired,
	// Config that may already have some required properties
	TRefConfig extends Partial<OptionalTemplateConfig>,
> = & Pick<TRequired, Exclude<keyof TRequired, keyof TRefConfig>>;

type RequireLoaderIfNeeded<
	TMergedConfig extends Partial<OptionalTemplateConfig & BaseConfig>
> = TMergedConfig['promptType'] extends 'template-name' | 'async-template-name'
	? RequireMissing<
		{ loader: ILoaderAny | ILoaderAny[] },
		TMergedConfig
	>
	: object;

export function Config<
	TConfig extends Partial<BaseConfig & TemplateConfig>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
>(
	config: StrictUnionSubtype<TConfig, Partial<AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>>,
): ConfigProvider<TConfig>;

export function Config<
	TConfig extends Partial<BaseConfig & TemplateConfig>,
	TParentConfig extends Partial<BaseConfig & TemplateConfig>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
>(
	config: StrictUnionSubtype<TConfig, Partial<AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>>,
	parent: ConfigProvider<TParentConfig>
): ConfigData<StrictUnionSubtype<TConfig & TParentConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>>;

export function Config<
	TConfig extends Partial<BaseConfig & TemplateConfig>,
	TParentConfig extends Partial<BaseConfig & TemplateConfig>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
>(
	config: StrictUnionSubtype<TConfig, Partial<AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>>,
	parent?: ConfigProvider<TParentConfig>
): ConfigData<TConfig> | ConfigData<StrictUnionSubtype<TConfig & TParentConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>> {

	validateBaseConfig(config);

	if (parent) {
		const merged = mergeConfigs(config, parent.config);
		// Runtime check would go here if needed
		validateBaseConfig(merged);
		return new ConfigData(merged);
	}

	return new ConfigData(config);
}

// Single config overload
export function TemplateRenderer<TConfig extends Partial<TemplateConfig>>(
	config: TConfig & RequireLoaderIfNeeded<TConfig>
): TemplateCallSignature<TConfig>;

// Config with parent overload - now properly returns only required properties in immediate config
export function TemplateRenderer<
	TConfig extends Partial<TemplateConfig>,
	TParentConfig extends Partial<TemplateConfig>
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): TemplateCallSignature<TConfig & TParentConfig>;

export function TemplateRenderer<
	TConfig extends Partial<TemplateConfig>,
	TParentConfig extends Partial<TemplateConfig>
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): [typeof parent] extends [undefined]
	? TemplateCallSignature<TConfig>
	: TemplateCallSignature<TConfig & TParentConfig> {

	validateBaseConfig(config);
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(config, parent.config)
		: config;
	if (parent) {
		validateBaseConfig(merged);
	}

	if ((merged.promptType === 'template-name' || merged.promptType === 'async-template-name') && !('loader' in merged)) {
		throw new ConfigError('Template name types require a loader');
	}

	if ((merged.promptType === 'template-name' ||
		merged.promptType === 'async-template-name' ||
		merged.promptType === undefined) &&
		!merged.loader
	) {
		throw new Error('A loader is required when promptType is "template-name", "async-template-name", or undefined.');
	}

	const renderer = new TemplateEngine(merged);

	// Define the call function that handles both cases
	const call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<string> => {
		if (typeof promptOrContext === 'string') {
			return renderer.render(promptOrContext, maybeContext);
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when not providing prompt.');
			}
			return renderer.render(undefined, promptOrContext);
		}
	};

	const callSignature = Object.assign(call, { config: merged });

	type ReturnType = [typeof parent] extends [undefined]
		? TemplateCallSignature<TConfig>
		: TemplateCallSignature<TConfig & TParentConfig>;

	return callSignature as ReturnType;
}

// Single config overload
export function TextGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, GenerateTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>> = object,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>
		& RequireMissing<{ model: LanguageModel }, TParentConfig>,
	parent?: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, GenerateTextResult<TOOLS, OUTPUT>>;

export function TextGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<GenerateTextResult<TOOLS, OUTPUT>>> |
	LLMCallSignature<TConfig & TParentConfig, Promise<GenerateTextResult<TOOLS, OUTPUT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? TConfig & TParentConfig
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(config, parent.config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}
	if (!('model' in merged)) {
		throw new ConfigError('TextGenerator config requires model');
	}

	return createLLMRenderer<
		CombinedType,
		GenerateTextConfig<TOOLS, OUTPUT>, Promise<GenerateTextResult<TOOLS, OUTPUT>>
	>(merged, generateText);
}

// Single config overload
export function TextStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, StreamTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>
		& RequireMissing<{ model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, StreamTextResult<TOOLS, OUTPUT>>;

export function TextStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, StreamTextResult<TOOLS, OUTPUT>> |
	LLMCallSignature<TConfig & TParentConfig, StreamTextResult<TOOLS, OUTPUT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? TConfig & TParentConfig
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(config, parent.config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	if (!('model' in merged)) {
		throw new ConfigError('TextStreamer config requires model');
	}

	return createLLMRenderer<
		CombinedType,
		StreamTextConfig<TOOLS, OUTPUT>, StreamTextResult<TOOLS, OUTPUT>
	>(merged, streamText);
}

export function ObjectGenerator<
	TConfig extends Partial<OptionalNoPromptTemplateConfig & GenerateObjectObjectConfig<OBJECT>>,
	OBJECT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: ObjectSchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectObjectResult<OBJECT>>>;

export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateObjectArrayConfig<ELEMENT>>,
	ELEMENT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: ElementSchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectArrayResult<ELEMENT>>>;

export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>>,
	ENUM extends string = string
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig> &
	{ output: 'enum', enum: ENUM[], model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectEnumResult<ENUM>>>;

export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateObjectNoSchemaConfig>
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig> &
	{ output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectNoSchemaResult>>;

// Config with parent overloads for different output types
export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateObjectObjectConfig<OBJECT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectObjectConfig<OBJECT>>,
	OBJECT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
		RequireMissing<{ output: 'object' | undefined, schema: ObjectSchemaType<OBJECT>, model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectObjectResult<OBJECT>>>;

export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateObjectArrayConfig<ELEMENT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectArrayConfig<ELEMENT>>,
	ELEMENT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
		RequireMissing<{ output: 'array', schema: ElementSchemaType<ELEMENT>, model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectArrayResult<ELEMENT>>>;

export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>>,
	TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>>,
	ENUM extends string = string
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
		RequireMissing<{ output: 'enum', enum: ENUM[], model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectEnumResult<ENUM>>>;

export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & GenerateObjectNoSchemaConfig>,
	TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectNoSchemaConfig>
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
		RequireMissing<{ output: 'no-schema', model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectNoSchemaResult>>;

// Implementation
export function ObjectGenerator<
	TConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
	TParentConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
	ELEMENT = any,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> |
	LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? TConfig & TParentConfig
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(config, parent.config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	// One of several possible overloads (config.output = undefined which defaults to 'object'), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		GenerateObjectObjectConfig<OBJECT>,
		Promise<GenerateObjectObjectResult<OBJECT>>
	>(merged, generateObject);
}

// Single config overloads
export function ObjectStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamObjectObjectConfig<OBJECT>>,
	OBJECT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: ObjectSchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, StreamObjectObjectResult<OBJECT>>;

export function ObjectStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamObjectArrayConfig<ELEMENT>>,
	ELEMENT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: ElementSchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, StreamObjectArrayResult<ELEMENT>>;

export function ObjectStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamObjectNoSchemaConfig>
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig> &
	{ output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, StreamObjectNoSchemaResult>;

// Config with parent overloads for different output types
export function ObjectStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamObjectObjectConfig<OBJECT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & StreamObjectObjectConfig<OBJECT>>,
	OBJECT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
		RequireMissing<{ output: 'object' | undefined, schema: ObjectSchemaType<OBJECT>, model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, StreamObjectObjectResult<OBJECT>>;

export function ObjectStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamObjectArrayConfig<ELEMENT>>,
	TParentConfig extends Partial<OptionalTemplateConfig & StreamObjectArrayConfig<ELEMENT>>,
	ELEMENT = any
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
		RequireMissing<{ output: 'array', schema: ElementSchemaType<ELEMENT>, model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, StreamObjectArrayResult<ELEMENT>>;

export function ObjectStreamer<
	TConfig extends Partial<OptionalTemplateConfig & StreamObjectNoSchemaConfig>,
	TParentConfig extends Partial<OptionalTemplateConfig & StreamObjectNoSchemaConfig>
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
		RequireMissing<{ output: 'no-schema', model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<TConfig & TParentConfig, StreamObjectNoSchemaResult>;

// Implementation
export function ObjectStreamer<
	TConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
	TParentConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
	OBJECT = any, ELEMENT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, StreamObjectResultAll<OBJECT, ELEMENT>> |
	LLMCallSignature<TConfig & TParentConfig, StreamObjectResultAll<OBJECT, ELEMENT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? TConfig & TParentConfig
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(config, parent.config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	return createLLMRenderer<
		CombinedType,
		StreamObjectObjectConfig<OBJECT>,
		StreamObjectObjectResult<OBJECT>
	>(merged, streamObject);
}

function createLLMRenderer<
	TConfig extends Partial<OptionalTemplateConfig & TFunctionConfig>, // extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TFunctionConfig extends BaseConfig,
	TFunctionResult,
>(
	config: TConfig,
	vercelFunc: (config: TFunctionConfig) => TFunctionResult
): LLMCallSignature<TConfig, TFunctionResult> {
	let call;
	if (config.promptType && config.promptType !== 'text') {
		// We have to run the prompt through a template first.
		const renderer = TemplateRenderer(config as TemplateConfig & { promptType: TemplatePromptType });
		call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<TFunctionResult> => {
			validateCall(config as BaseConfig, promptOrContext, maybeContext);
			let renderedPrompt: string;
			if (maybeContext !== undefined) {
				if (typeof promptOrContext === 'string') {
					renderedPrompt = await renderer(promptOrContext, maybeContext);
				} else {
					renderedPrompt = await renderer(promptOrContext);
				}
			} else {
				renderedPrompt = await renderer(promptOrContext);
			}
			return await vercelFunc({ ...config, prompt: renderedPrompt } as unknown as TFunctionConfig);
		};
	} else {
		// No need to run the prompt through a template.
		call = async (prompt: string): Promise<TFunctionResult> => {
			validateCall(config as BaseConfig, prompt);
			return await vercelFunc({ ...config, prompt } as unknown as TFunctionConfig);
		};
	}
	const callSignature = Object.assign(call, { config });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult>;
}