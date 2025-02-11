import { generateText, generateObject, streamText, CoreTool, streamObject, LanguageModel } from 'ai';
import { ConfigData, ConfigProvider, mergeConfigs } from './ConfigData';
import { TemplateEngine } from './TemplateEngine';
import {
	Context, TemplatePromptType, SchemaType,
	//configs:
	AnyConfig, BaseConfig,
	TemplateConfig, OptionalTemplateConfig, OptionalNoPromptTemplateConfig,
	GenerateTextConfig, GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig,
	StreamTextConfig, StreamObjectObjectConfig, StreamObjectArrayConfig, StreamObjectNoSchemaConfig,
	//Return types:
	GenerateTextResult, GenerateObjectObjectResult, GenerateObjectArrayResult, GenerateObjectEnumResult, GenerateObjectNoSchemaResult,
	StreamTextResult, StreamObjectObjectResult, StreamObjectArrayResult, StreamObjectNoSchemaResult,
	GenerateObjectResultAll, StreamObjectResultAll,
	Override,

} from './types';
import { ILoaderAny } from 'cascada-tmpl';
import { validateBaseConfig, ConfigError, validateCall } from './validate';
import { z } from 'zod';

// Ensures T is an exact match of one of the union members in U
// Prevents extra properties and mixing properties from different union types
type StrictUnionSubtype<T, U> = U extends any
	? T extends U
	? Exclude<keyof T, keyof U> extends never ? T : never
	: never
	: never;

// Ensures T has exactly the same properties as Shape (no extra properties). Returns never if T is not a strict subtype of Shape.
type StrictType<T, Shape> = T extends Shape
	? keyof T extends keyof Shape ? T : never
	: never;


// Helper for types that can optionally have template properties
type StrictTypeWithTemplate<T, Shape> = T extends { promptType: 'text' }
	? StrictType<T, Shape & { promptType: 'text' }>
	: StrictType<T, Shape & TemplateConfig>;

type TemplateCallSignature<TConfig extends OptionalTemplateConfig> =
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

// Regular omit flattens the type, this one retains the original union structure. The example below will not work with regular Omit
// type DebugTConfig2 = DistributiveOmit<OptionalTemplateConfig & StreamObjectObjectConfig<typeof schema>, 'schema'>;
// type DebugTLoader2 = (DebugTConfig2 & { promptType: 'template' })['loader'];
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

//type OmitIfPresent<TParent, TProps, TCheck> = Omit<TParent, Extract<TProps, keyof TCheck>>;

type LLMCallSignature<
	TConfig extends BaseConfig & OptionalTemplateConfig,
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

type GetMissingProperties<TRequired, TRefConfig> = Exclude<keyof TRequired, keyof TRefConfig>;

// Regular RequireMissing removes properties from TConfig that need to be made required
// and adds them back from TRequired.
type RequireMissing<
	TConfig,
	TRequired,
	TRefConfig,
> = TConfig & Pick<TRequired, GetMissingProperties<TRequired, TRefConfig>>;

// Makes properties from TRequired required only if they don't exist in TRefConfig.
// Handles schema properties specially because zod applies DeepPartial to optional schemas
// which causes type issues when intersected with non-optional schemas via &.
// For example: {schema?: z.Schema<...>} & {schema: z.Schema<...>}
// Uses conditional type check before Omit to preserve discriminated union information
// that would be lost with direct Omit of the schema property.
type RequireMissingWithSchema<
	TConfig,
	TRequired,
	TRefConfig,
> =
	// Handle schema type union
	(TConfig extends { schema: any }
		? (Omit<TConfig, 'schema'> & {
			schema: TConfig['schema'] extends z.Schema<infer U>
			? z.Schema<U> & SchemaType<U>  // Add SchemaType union
			: TConfig['schema']
		})
		: TConfig) &
	// Add missing required properties
	Pick<TRequired, GetMissingProperties<TRequired, TRefConfig>>;

type RequireLoaderIfNeeded<
	TMergedConfig extends OptionalTemplateConfig & BaseConfig
> = TMergedConfig['promptType'] extends 'template-name' | 'async-template-name'
	? 'loader' extends keyof TMergedConfig ? object : { loader: ILoaderAny | ILoaderAny[] }
	: object;

// Single config overload
export function Config<
	TConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: StrictUnionSubtype<TConfig, AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>>,
): ConfigProvider<TConfig>;

// Config with parent overload
export function Config<
	TConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string,
	TCombined extends BaseConfig = StrictUnionSubtype<Override<TParentConfig, TConfig>, AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>>
>(
	config: TConfig,
	parent: ConfigProvider<
		TCombined extends never ? never : TParentConfig
	>
): ConfigData<TCombined>;

export function Config<
	TConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): ConfigData<TConfig> | ConfigData<StrictUnionSubtype<Override<TParentConfig, TConfig>, AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>>> {

	validateBaseConfig(config);

	if (parent) {
		const merged = mergeConfigs(parent.config, config);
		// Runtime check would go here if needed
		validateBaseConfig(merged);
		return new ConfigData(merged);
	}

	return new ConfigData(config);
}

// Single config overload
export function TemplateRenderer<TConfig extends TemplateConfig>(
	config: StrictType<TConfig, TemplateConfig> & RequireLoaderIfNeeded<TConfig>
): TemplateCallSignature<TConfig>;

// Config with parent overload - now properly returns only required properties in immediate config
export function TemplateRenderer<
	TConfig extends TemplateConfig,
	TParentConfig extends TemplateConfig
>(
	config: StrictType<TConfig, TemplateConfig> & RequireLoaderIfNeeded<Override<TParentConfig, TConfig>>,
	parent: ConfigProvider<StrictType<TParentConfig, TemplateConfig>>
): TemplateCallSignature<Override<TParentConfig, TConfig>>;

export function TemplateRenderer<
	TConfig extends TemplateConfig,
	TParentConfig extends TemplateConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): [typeof parent] extends [undefined]
	? TemplateCallSignature<TConfig>
	: TemplateCallSignature<Override<TParentConfig, TConfig>> {

	validateBaseConfig(config);
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(parent.config, config)
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
		: TemplateCallSignature<Override<TParentConfig, TConfig>>;

	return callSignature as ReturnType;
}

// Single config overload
export function TextGenerator<
	TConfig extends OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
>(
	config: StrictTypeWithTemplate<TConfig, GenerateTextConfig<TOOLS, OUTPUT>> & RequireLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, GenerateTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextGenerator<
	TConfig extends OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissing<
		StrictTypeWithTemplate<
			TConfig,
			GenerateTextConfig<TOOLS, OUTPUT>
		>,
		{ model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			GenerateTextConfig<TOOLS, OUTPUT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, GenerateTextResult<TOOLS, OUTPUT>>;

export function TextGenerator<
	TConfig extends OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<GenerateTextResult<TOOLS, OUTPUT>>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, Promise<GenerateTextResult<TOOLS, OUTPUT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}
	if (!('model' in merged)) {
		throw new ConfigError('TextGenerator config requires model');
	}

	return createLLMRenderer<
		CombinedType,
		GenerateTextConfig<TOOLS, OUTPUT> & { model: LanguageModel },
		Promise<GenerateTextResult<TOOLS, OUTPUT>>
	>(merged, generateText);
}

// Single config overload
export function TextStreamer<
	TConfig extends OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig & RequireLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, StreamTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextStreamer<
	TConfig extends OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig & RequireLoaderIfNeeded<Override<TParentConfig, TConfig>>
		& RequireMissing<TConfig, { model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<Override<TParentConfig, TConfig>, StreamTextResult<TOOLS, OUTPUT>>;

export function TextStreamer<
	TConfig extends OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, StreamTextResult<TOOLS, OUTPUT>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, StreamTextResult<TOOLS, OUTPUT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	if (!('model' in merged)) {
		throw new ConfigError('TextStreamer config requires model');
	}

	return createLLMRenderer<
		CombinedType,
		StreamTextConfig<TOOLS, OUTPUT> & { model: LanguageModel },
		StreamTextResult<TOOLS, OUTPUT>
	>(merged, streamText);
}

// Object output
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, GenerateObjectObjectConfig<OBJECT>>, 'schema'> &
		RequireLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectObjectResult<OBJECT>>>;

// Array output
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectArrayConfig<ELEMENT>,
	ELEMENT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, GenerateObjectArrayConfig<ELEMENT>>, 'schema'> &
		RequireLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectArrayResult<ELEMENT>>>;

// Enum output
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>,
	ENUM extends string = string
>(
	config: StrictTypeWithTemplate<TConfig, GenerateObjectEnumConfig<ENUM>> &
		RequireLoaderIfNeeded<TConfig> & { output: 'enum', enum: ENUM[], model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectEnumResult<ENUM>>>;

// No schema output
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectNoSchemaConfig
>(
	config: StrictTypeWithTemplate<TConfig, GenerateObjectNoSchemaConfig> &
		RequireLoaderIfNeeded<TConfig> & { output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, Promise<GenerateObjectNoSchemaResult>>;

// Object with parent
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectObjectConfig<OBJECT>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			GenerateObjectObjectConfig<OBJECT>
		>,
		{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			GenerateObjectObjectConfig<OBJECT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<GenerateObjectObjectResult<OBJECT>>>

// Array with parent
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectArrayConfig<ELEMENT>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			GenerateObjectArrayConfig<ELEMENT>
		>,
		{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			GenerateObjectArrayConfig<ELEMENT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<GenerateObjectArrayResult<ELEMENT>>>;

// Enum with parent
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			GenerateObjectEnumConfig<ENUM>
		>,
		{ output: 'enum', enum: ENUM[], model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			GenerateObjectEnumConfig<ENUM>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<GenerateObjectEnumResult<ENUM>>>;

// No schema with parent
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & GenerateObjectNoSchemaConfig,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissing<
		StrictTypeWithTemplate<
			TConfig,
			GenerateObjectNoSchemaConfig
		>,
		{ output: 'no-schema', model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			GenerateObjectNoSchemaConfig
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<GenerateObjectNoSchemaResult>>;

// Implementation
export function ObjectGenerator<
	TConfig extends OptionalTemplateConfig & BaseConfig,
	TParentConfig extends OptionalTemplateConfig & BaseConfig,
	ELEMENT = any,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, Promise<GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	// One of several possible overloads (config.output = 'object' / undefined), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		GenerateObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		Promise<GenerateObjectObjectResult<OBJECT>>
	>(merged, generateObject);
}

// Object output
export function ObjectStreamer<
	TConfig extends OptionalTemplateConfig & StreamObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, StreamObjectObjectConfig<OBJECT>>, 'schema'> &
		RequireLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<StreamObjectObjectResult<OBJECT>>>;

// Array output
export function ObjectStreamer<
	TConfig extends OptionalTemplateConfig & StreamObjectArrayConfig<ELEMENT>,
	ELEMENT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, StreamObjectArrayConfig<ELEMENT>>, 'schema'> &
		RequireLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<StreamObjectArrayResult<ELEMENT>>>;

// No schema output
export function ObjectStreamer<
	TConfig extends OptionalTemplateConfig & StreamObjectNoSchemaConfig
>(
	config: StrictTypeWithTemplate<TConfig, StreamObjectNoSchemaConfig> &
		RequireLoaderIfNeeded<TConfig> & { output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, Promise<StreamObjectNoSchemaResult>>;


// Object with parent
export function ObjectStreamer<
	TConfig extends OptionalTemplateConfig & StreamObjectObjectConfig<OBJECT>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			StreamObjectObjectConfig<OBJECT>
		>,
		{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			StreamObjectObjectConfig<OBJECT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<StreamObjectObjectResult<OBJECT>>>;

// Array with parent
export function ObjectStreamer<
	TConfig extends OptionalTemplateConfig & StreamObjectArrayConfig<ELEMENT>,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			StreamObjectArrayConfig<ELEMENT>
		>,
		{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			StreamObjectArrayConfig<ELEMENT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<StreamObjectArrayResult<ELEMENT>>>;

// No schema with parent
export function ObjectStreamer<
	TConfig extends OptionalTemplateConfig & StreamObjectNoSchemaConfig,
	TParentConfig extends AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, TSchema, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			StreamObjectNoSchemaConfig
		>,
		{ output: 'no-schema', model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			StreamObjectNoSchemaConfig
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<StreamObjectNoSchemaResult>>;

// Implementation
export function ObjectStreamer<
	TConfig extends OptionalTemplateConfig & BaseConfig,
	TParentConfig extends OptionalTemplateConfig & BaseConfig,
	OBJECT = any, ELEMENT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, StreamObjectResultAll<OBJECT, ELEMENT>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, StreamObjectResultAll<OBJECT, ELEMENT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	// One of several possible overloads (config.output = 'object' / undefined), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		StreamObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		StreamObjectObjectResult<OBJECT>
	>(merged, streamObject);
}

function createLLMRenderer<
	TConfig extends OptionalTemplateConfig & Partial<TFunctionConfig>, // extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TFunctionConfig extends BaseConfig,
	TFunctionResult,
>(
	config: TConfig,
	vercelFunc: (config: TFunctionConfig) => TFunctionResult
): LLMCallSignature<TConfig, TFunctionResult> {
	let call;
	if (config.promptType !== 'text') {
		// We have to run the prompt through a template first.
		const renderer = TemplateRenderer(config as TemplateConfig & { promptType: TemplatePromptType });
		call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<TFunctionResult> => {
			validateCall(config as BaseConfig, promptOrContext, maybeContext);
			let renderedPrompt: string;

			if (typeof promptOrContext === 'string') {
				renderedPrompt = await renderer(promptOrContext, maybeContext);
			} else {
				renderedPrompt = await renderer(config.prompt!, promptOrContext);
			}
			if (config.messages) {
				//todo: add the prompt to the messages
				//config.messages.push(renderedPrompt);
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