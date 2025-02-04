import { generateText, generateObject, streamText, CoreTool, streamObject, LanguageModel } from 'ai';
import { ConfigData, ConfigProvider, mergeConfigs } from './ConfigData';
import { TemplateEngine } from './TemplateEngine';
import {
	SchemaType, Context,

	//Base Config types, all properties are optional
	BaseConfig, //a base config common for all generators and streamers

	//Type guards functions

	//Intermediate configs
	GenerateTextConfig,
	GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig,
	StreamTextConfig, StreamObjectObjectConfig, StreamObjectArrayConfig, StreamObjectNoSchemaConfig,

	//Return types
	GenerateTextResult, StreamTextResult,
	GenerateObjectObjectResult, GenerateObjectArrayResult, GenerateObjectEnumResult, GenerateObjectNoSchemaResult,
	StreamObjectObjectResult, StreamObjectArrayResult, StreamObjectNoSchemaResult,

	AnyConfig,
	TemplateConfig,
	TemplatePromptType,
	OptionalTemplateConfig,
	GenerateObjectResult,
	StreamObjectResult,
} from './types';
import { ILoaderAny } from 'cascada-tmpl';

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

export class Factory {
	static Config<
		TConfig extends BaseConfig & TemplateConfig,
		TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
	>(
		config: StrictUnionSubtype<TConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>,
	): ConfigProvider<TConfig>;

	static Config<
		TConfig extends BaseConfig & TemplateConfig,
		TParentConfig extends BaseConfig & TemplateConfig,
		TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
	>(
		config: StrictUnionSubtype<TConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>,
		parent: ConfigProvider<TParentConfig>
	): ConfigData<StrictUnionSubtype<TConfig & TParentConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>>;

	static Config<
		TConfig extends BaseConfig & TemplateConfig,
		TParentConfig extends BaseConfig & TemplateConfig,
		TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
	>(
		config: StrictUnionSubtype<TConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>,
		parent?: ConfigProvider<TParentConfig>
	): ConfigData<TConfig> | ConfigData<StrictUnionSubtype<TConfig & TParentConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>> {

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!config || typeof config !== 'object') {
			throw new Error('Invalid config object');
		}

		if (parent) {
			const merged = mergeConfigs(config, parent.config);
			// Runtime check would go here if needed
			return new ConfigData(merged);
		}

		return new ConfigData(config);
	}

	// Single config overload
	static TemplateRenderer<TConfig extends Partial<TemplateConfig>>(
		config: TConfig & RequireLoaderIfNeeded<TConfig>
	): TemplateCallSignature<TConfig>;

	// Config with parent overload - now properly returns only required properties in immediate config
	static TemplateRenderer<
		TConfig extends Partial<TemplateConfig>,
		TParentConfig extends Partial<TemplateConfig>
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): TemplateCallSignature<TConfig & TParentConfig>;

	static TemplateRenderer<
		TConfig extends Partial<TemplateConfig>,
		TParentConfig extends Partial<TemplateConfig>
	>(
		config: TConfig,
		parent?: ConfigProvider<TParentConfig>
	): [typeof parent] extends [undefined]
		? TemplateCallSignature<TConfig>
		: TemplateCallSignature<TConfig & TParentConfig> {

		// Merge configs if parent exists, otherwise use provided config
		const merged = parent
			? mergeConfigs(config, parent.config)
			: config;

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
	static TextGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig>
			& { model: LanguageModel }
	): LLMCallSignature<TConfig, GenerateTextResult<TOOLS, OUTPUT>>;

	// Config with parent
	static TextGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
		TParentConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>> = object,
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>
			& RequireMissing<{ model: LanguageModel }, TParentConfig>,
		parent?: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, GenerateTextResult<TOOLS, OUTPUT>>;

	static TextGenerator<
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

		return Factory.createLLMRenderer<
			CombinedType,
			GenerateTextConfig<TOOLS, OUTPUT>, Promise<GenerateTextResult<TOOLS, OUTPUT>>
		>(parent ? mergeConfigs(config, parent.config) : config, generateText);
	}

	// Single config overload
	static TextStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
		OUTPUT = never
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig>
			& { model: LanguageModel }
	): LLMCallSignature<TConfig, StreamTextResult<TOOLS, OUTPUT>>;

	// Config with parent
	static TextStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
		TParentConfig extends Partial<OptionalTemplateConfig & StreamTextConfig<TOOLS, OUTPUT>>,
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
		OUTPUT = never
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>
			& RequireMissing<{ model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, StreamTextResult<TOOLS, OUTPUT>>;

	static TextStreamer<
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

		return Factory.createLLMRenderer<
			CombinedType,
			StreamTextConfig<TOOLS, OUTPUT>, StreamTextResult<TOOLS, OUTPUT>
		>(parent ? mergeConfigs(config, parent.config) : config, streamText);
	}

	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectObjectConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig> &
		{ output: 'object' | undefined, schema: SchemaType<TSchema>, model: LanguageModel }
	): LLMCallSignature<TConfig, Promise<GenerateObjectObjectResult<TSchema>>>;

	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectArrayConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig> &
		{ output: 'array', schema: SchemaType<TSchema>, model: LanguageModel }
	): LLMCallSignature<TConfig, Promise<GenerateObjectArrayResult<TSchema>>>;

	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>>,
		ENUM extends string = string
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig> &
		{ output: 'enum', enum: ENUM[], model: LanguageModel }
	): LLMCallSignature<TConfig, Promise<GenerateObjectEnumResult<ENUM>>>;

	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectNoSchemaConfig>
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig> &
		{ output: 'no-schema', model: LanguageModel }
	): LLMCallSignature<TConfig, Promise<GenerateObjectNoSchemaResult>>;

	// Config with parent overloads for different output types
	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectObjectConfig<TSchema>>,
		TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectObjectConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
			RequireMissing<{ output: 'object' | undefined, schema: SchemaType<TSchema>, model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectObjectResult<TSchema>>>;

	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectArrayConfig<TSchema>>,
		TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectArrayConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
			RequireMissing<{ output: 'array', schema: SchemaType<TSchema>, model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectArrayResult<TSchema>>>;

	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>>,
		TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectEnumConfig<ENUM>>,
		ENUM extends string = string
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
			RequireMissing<{ output: 'enum', enum: ENUM[], model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectEnumResult<ENUM>>>;

	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateObjectNoSchemaConfig>,
		TParentConfig extends Partial<OptionalTemplateConfig & GenerateObjectNoSchemaConfig>
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
			RequireMissing<{ output: 'no-schema', model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectNoSchemaResult>>;

	// Implementation
	static ObjectGenerator<
		TConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
		TParentConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
		TSchema = any,
		ENUM extends string = string
	>(
		config: TConfig,
		parent?: ConfigProvider<TParentConfig>
	):
		LLMCallSignature<TConfig, Promise<GenerateObjectResult<TSchema, ENUM>>> |
		LLMCallSignature<TConfig & TParentConfig, Promise<GenerateObjectResult<TSchema, ENUM>>> {

		type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
			? TConfig & TParentConfig
			: TConfig;

		// One of several possible overloads (config.output = undefined which defaults to 'object'), but they all compile to the same thing
		return Factory.createLLMRenderer<
			CombinedType,
			GenerateObjectObjectConfig<TSchema>,
			Promise<GenerateObjectObjectResult<TSchema>>
		>(parent ? mergeConfigs(config, parent.config) : config, generateObject);
	}

	// Single config overloads
	static ObjectStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamObjectObjectConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig> &
		{ output: 'object' | undefined, schema: SchemaType<TSchema>, model: LanguageModel }
	): LLMCallSignature<TConfig, StreamObjectObjectResult<TSchema>>;

	static ObjectStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamObjectArrayConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig> &
		{ output: 'array', schema: SchemaType<TSchema>, model: LanguageModel }
	): LLMCallSignature<TConfig, StreamObjectArrayResult<TSchema>>;

	static ObjectStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamObjectNoSchemaConfig>
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig> &
		{ output: 'no-schema', model: LanguageModel }
	): LLMCallSignature<TConfig, StreamObjectNoSchemaResult>;

	// Config with parent overloads for different output types
	static ObjectStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamObjectObjectConfig<TSchema>>,
		TParentConfig extends Partial<OptionalTemplateConfig & StreamObjectObjectConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
			RequireMissing<{ output: 'object' | undefined, schema: SchemaType<TSchema>, model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, StreamObjectObjectResult<TSchema>>;

	static ObjectStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamObjectArrayConfig<TSchema>>,
		TParentConfig extends Partial<OptionalTemplateConfig & StreamObjectArrayConfig<TSchema>>,
		TSchema = any
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
			RequireMissing<{ output: 'array', schema: SchemaType<TSchema>, model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, StreamObjectArrayResult<TSchema>>;

	static ObjectStreamer<
		TConfig extends Partial<OptionalTemplateConfig & StreamObjectNoSchemaConfig>,
		TParentConfig extends Partial<OptionalTemplateConfig & StreamObjectNoSchemaConfig>
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig> &
			RequireMissing<{ output: 'no-schema', model: LanguageModel }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, StreamObjectNoSchemaResult>;

	// Implementation
	static ObjectStreamer<
		TConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
		TParentConfig extends Partial<OptionalTemplateConfig & BaseConfig>,
		TSchema = any
	>(
		config: TConfig,
		parent?: ConfigProvider<TParentConfig>
	):
		LLMCallSignature<TConfig, StreamObjectResult<TSchema>> |
		LLMCallSignature<TConfig & TParentConfig, StreamObjectResult<TSchema>> {

		type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
			? TConfig & TParentConfig
			: TConfig;

		return Factory.createLLMRenderer<
			CombinedType,
			StreamObjectObjectConfig<TSchema>,
			StreamObjectObjectResult<TSchema>
		>(parent ? mergeConfigs(config, parent.config) : config, streamObject);
	}

	private static createLLMRenderer<
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
			const renderer = Factory.TemplateRenderer(config as TemplateConfig & { promptType: TemplatePromptType });
			call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<TFunctionResult> => {
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

				return await vercelFunc({ ...config, prompt } as unknown as TFunctionConfig);
			};
		}
		const callSignature = Object.assign(call, { config });
		return callSignature as LLMCallSignature<TConfig, TFunctionResult>;
	}
}