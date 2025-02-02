import { generateText, generateObject, streamText, CoreTool, streamObject, Output, DeepPartial, LanguageModel } from 'ai';
import { ConfigData, ConfigProvider, mergeConfigs } from './ConfigData';
import { TemplateEngine } from './TemplateEngine';
import {
	SchemaType, Context,
	ObjectGeneratorOutputType, ObjectStreamOutputType,

	//Base Config types, all properties are optional
	BaseConfig, //a base config common for all generators and streamers

	//Type guards functions
	isToolsConfig,

	//Intermediate configs
	GenerateTextConfig,
	GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig,
	StreamTextConfig, StreamObjectObjectConfig, StreamObjectArrayConfig, StreamObjectNoSchemaConfig,

	//Return types
	GenerateTextResult, StreamTextResult,
	GenerateObjectObjectResult, GenerateObjectArrayResult, GenerateObjectEnumResult, GenerateObjectNoSchemaResult,
	StreamObjectObjectResult, StreamObjectArrayResult, StreamObjectNoSchemaResult,
	VercelLLMFunction,
	hasModel,
	AnyConfig,
	TemplateConfig,
	TemplatePromptType,
	OptionalTemplateConfig,
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
	Config<
		TConfig extends BaseConfig & TemplateConfig,
		TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
	>(
		config: StrictUnionSubtype<TConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>,
	): ConfigProvider<TConfig>;

	Config<
		TConfig extends BaseConfig & TemplateConfig,
		TParentConfig extends BaseConfig & TemplateConfig,
		TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
	>(
		config: StrictUnionSubtype<TConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>,
		parent: ConfigProvider<TParentConfig>
	): ConfigData<StrictUnionSubtype<TConfig & TParentConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>>;

	Config<
		TConfig extends BaseConfig & TemplateConfig,
		TParentConfig extends BaseConfig & TemplateConfig,
		TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T
	>(
		config: StrictUnionSubtype<TConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>,
		parent?: ConfigProvider<TParentConfig>
	): ConfigData<TConfig> | ConfigData<StrictUnionSubtype<TConfig & TParentConfig, AnyConfig<TOOLS, OUTPUT, TSchema, ENUM, T>>> {


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
	TemplateRenderer<TConfig extends Partial<TemplateConfig>>(
		config: TConfig & RequireLoaderIfNeeded<TConfig>
	): TemplateCallSignature<TConfig>;

	// Config with parent overload - now properly returns only required properties in immediate config
	TemplateRenderer<
		TConfig extends Partial<TemplateConfig>,
		TParentConfig extends Partial<TemplateConfig>
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): TemplateCallSignature<TConfig & TParentConfig>;

	TemplateRenderer<
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

	//add promptType to all configs
	//TConfig extends RequireTemplate<TConfig>

	// Single config overload
	TextGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig>
			& { model: LanguageModel, promptType: 'template' | 'async-template' | 'template-name' | 'async-template-name' }
	): LLMCallSignature<TConfig, GenerateTextResult<TOOLS, OUTPUT>>;

	// Config with parent
	TextGenerator<
		TConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
		TParentConfig extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
	>(
		config: TConfig & RequireLoaderIfNeeded<TConfig & TParentConfig>
			& RequireMissing<{ model: LanguageModel, promptType: 'template' | 'async-template' | 'template-name' | 'async-template-name' }, TParentConfig>,
		parent: ConfigProvider<TParentConfig>
	): LLMCallSignature<TConfig & TParentConfig, GenerateTextResult<TOOLS, OUTPUT>>;

	TextGenerator<
		TConfig extends Partial<Omit<OptionalTemplateConfig, 'promptType'> & GenerateTextConfig<TOOLS, OUTPUT>>,
		TParentConfig extends Partial<Omit<OptionalTemplateConfig, 'promptType'> & GenerateTextConfig<TOOLS, OUTPUT>>,
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
	>(
		config: TConfig,
		parent?: ConfigProvider<TParentConfig>
	):
		LLMCallSignature<TConfig, Promise<GenerateTextResult<TOOLS, OUTPUT>>> |
		LLMCallSignature<TConfig & TParentConfig, Promise<GenerateTextResult<TOOLS, OUTPUT>>> {

		if (parent) {
			return this.createLLMRenderer<TConfig & TParentConfig, Promise<GenerateTextResult<TOOLS, OUTPUT>>, TOOLS, OUTPUT>(
				mergeConfigs(config, parent.config),
				generateText
			);
		} else {
			return this.createLLMRenderer<TConfig, Promise<GenerateTextResult<TOOLS, OUTPUT>>, TOOLS, OUTPUT>(
				config,
				generateText
			);
		}
	}

	private createLLMRenderer<
		TConfig extends Partial<Omit<OptionalTemplateConfig, 'promptType'> & GenerateTextConfig<TOOLS, OUTPUT>>,
		TResult,
		TOOLS extends Record<string, CoreTool>, OUTPUT
	>(
		config: TConfig,
		func: (config: TConfig & { model: LanguageModel, prompt: string, context?: Context }) => TResult
	): LLMCallSignature<TConfig, TResult> {
		let call;
		if (config.promptType && config.promptType !== 'text') {
			// We have to run the prompt through a template first.
			const renderer = this.TemplateRenderer(config as TemplateConfig & { promptType: TemplatePromptType });
			call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<TResult> => {
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
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				return await func({ ...config, prompt: renderedPrompt, model: config.model! });
			};
		} else {
			// No need to run the prompt through a template.
			call = async (prompt: string, context?: Context): Promise<TResult> => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				return await func({ ...config, prompt, model: config.model!, context });
			};
		}
		const callSignature = Object.assign(call, { config });
		return callSignature as LLMCallSignature<TConfig, TResult>;
	}

	// Text functions can use tools
	TextStreamer<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never>(
		config: StreamTextConfig<TOOLS, OUTPUT>,
		parent: AnyConfigData,
		experimentalSchema: SchemaType<OUTPUT>
	): LLMCallSignature<StreamTextConfig<TOOLS, OUTPUT>, StreamTextResult<TOOLS, OUTPUT>>;

	TextStreamer<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never>(
		config: StreamTextConfig<TOOLS, OUTPUT>,
		experimentalSchema: SchemaType<OUTPUT>
	): LLMCallSignature<StreamTextConfig<TOOLS, OUTPUT>, StreamTextResult<TOOLS, OUTPUT>>;

	TextStreamer<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never>(
		config: StreamTextConfig<TOOLS, OUTPUT>,
		parent?: AnyConfigData
	): LLMCallSignature<StreamTextConfig<TOOLS, OUTPUT>, StreamTextResult<TOOLS, undefined>>;

	// Implementation
	TextStreamer<
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
		OUTPUT = never
	>(
		config: StreamTextConfig<TOOLS, OUTPUT>,
		parentOrSchema?: AnyConfigData | SchemaType<OUTPUT>,
		experimentalSchema?: SchemaType<OUTPUT>//this allows to use tools + schema in the same call, unlike generateObject which has no tools
	): LLMCallSignature<StreamTextConfig<TOOLS, OUTPUT>, StreamTextResult<TOOLS, DeepPartial<OUTPUT>>> {
		let parent: AnyConfigData | undefined;
		let schema: SchemaType<OUTPUT> | undefined;

		if (parentOrSchema instanceof ConfigData || parentOrSchema instanceof ConfigDataWithTools) {
			parent = parentOrSchema;
			schema = experimentalSchema;
		} else {
			schema = parentOrSchema;
		}

		const finalConfig = schema
			? { ...config, experimental_output: Output.object({ schema }) }
			: config;

		return Factory.createLLMRenderer(finalConfig, streamText, parent);
	}

	// Object functions can't use tools and need model (either in config or call)
	ObjectGenerator<TSchema>(
		config: GenerateObjectObjectConfig<TSchema>,
		parent: ConfigData, //Exclude<ConfigData, IConfigDataHasTools>,
		output: 'object',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectObjectConfig<TSchema>, GenerateObjectObjectResult<TSchema>, { output: 'object', schema: SchemaType<TSchema> }>;

	ObjectGenerator<TSchema>(
		config: GenerateObjectObjectConfig<TSchema>,
		output: 'object',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectObjectConfig<TSchema>, GenerateObjectObjectResult<TSchema>, { output: 'object', schema: SchemaType<TSchema> }>;

	ObjectGenerator<TSchema>(
		config: GenerateObjectArrayConfig<TSchema>,
		parent: ConfigData,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectArrayConfig<TSchema>, GenerateObjectArrayResult<TSchema>, { output: 'array', schema: SchemaType<TSchema> }>;

	ObjectGenerator<TSchema>(
		config: GenerateObjectArrayConfig<TSchema>,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectArrayConfig<TSchema>, GenerateObjectArrayResult<TSchema>, { output: 'array', schema: SchemaType<TSchema> }>;

	ObjectGenerator<ENUM extends string>(
		config: GenerateObjectEnumConfig<ENUM>,
		parent: ConfigData,
		output: 'enum',
		enumValues: ENUM[]
	): LLMCallSignature<GenerateObjectEnumConfig<ENUM>, GenerateObjectEnumResult<ENUM>, { output: 'enum', enum: ENUM[] }>;

	ObjectGenerator<ENUM extends string>(
		config: GenerateObjectEnumConfig<ENUM>,
		output: 'enum',
		enumValues: ENUM[]
	): LLMCallSignature<GenerateObjectEnumConfig<ENUM>, GenerateObjectEnumResult<ENUM>, { output: 'enum', enum: ENUM[] }>;

	ObjectGenerator(
		config: GenerateObjectNoSchemaConfig,
		parent: ConfigData,
		output: 'no-schema'
	): LLMCallSignature<GenerateObjectNoSchemaConfig, GenerateObjectNoSchemaResult, { output: 'no-schema' }>;

	ObjectGenerator(
		config: GenerateObjectNoSchemaConfig,
		output: 'no-schema'
	): LLMCallSignature<GenerateObjectNoSchemaConfig, GenerateObjectNoSchemaResult, { output: 'no-schema' }>;

	// Implementation
	ObjectGenerator<TSchema, ENUM extends string>(
		config: GenerateObjectObjectConfig<TSchema> | GenerateObjectArrayConfig<TSchema> | GenerateObjectEnumConfig<ENUM> | GenerateObjectNoSchemaConfig,
		parentOrOutputType: ConfigData | ObjectGeneratorOutputType,
		outputOrEnumOrSchema?: ObjectGeneratorOutputType | SchemaType<TSchema> | ENUM[],
		schemaOrEnum?: SchemaType<TSchema> | ENUM[]
	) {
		let parent: ConfigData | undefined;
		let output: ObjectGeneratorOutputType;
		let schema: SchemaType<TSchema> | ENUM[] | undefined;

		if (parentOrOutputType instanceof ConfigData) {
			// Called as: config, parent, output, schema
			parent = parentOrOutputType;
			output = outputOrEnumOrSchema as ObjectGeneratorOutputType;
			schema = schemaOrEnum;
		} else {
			// Called as: config, output, schema
			output = parentOrOutputType;
			schema = outputOrEnumOrSchema as SchemaType<TSchema> | ENUM[];
		}

		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object generators cannot use tools...');
		}

		switch (output) {
			case 'object':
				return Factory.createLLMRenderer<
					GenerateObjectObjectConfig<TSchema>,
					GenerateObjectObjectResult<TSchema>,
					{ output: 'object', schema: SchemaType<TSchema> }
				>(
					{ ...config as GenerateObjectObjectConfig<TSchema>, output: 'object', schema: schema as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'array':
				return Factory.createLLMRenderer<
					GenerateObjectArrayConfig<TSchema>,
					GenerateObjectArrayResult<TSchema>,
					{ output: 'array', schema: SchemaType<TSchema> }
				>(
					{ ...config as GenerateObjectArrayConfig<TSchema>, output: 'array', schema: schema as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'enum':
				return Factory.createLLMRenderer<
					GenerateObjectEnumConfig<ENUM>,
					GenerateObjectEnumResult<ENUM>,
					{ output: 'enum', enum: ENUM[] }
				>(
					{ ...config as GenerateObjectEnumConfig<ENUM>, output: 'enum', enum: schema as ENUM[] },
					generateObject,
					parent
				);
			case 'no-schema':
				return Factory.createLLMRenderer<
					GenerateObjectNoSchemaConfig,
					GenerateObjectNoSchemaResult,
					{ output: 'no-schema' }
				>(
					{ ...config as GenerateObjectNoSchemaConfig, output: 'no-schema' },
					generateObject,
					parent
				);
			default:
				throw new Error(`Invalid output type: ${output as string}`);
		}
	}

	// Object functions can't use tools and need model (either in config or call)
	ObjectStreamer<TSchema>(
		config: StreamObjectObjectConfig<TSchema>,
		parent: ConfigData,
		output: 'object',
		schema: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectObjectConfig<TSchema>, StreamObjectObjectResult<TSchema>, { output: 'object', schema: SchemaType<TSchema> }>;

	ObjectStreamer<TSchema>(
		config: StreamObjectObjectConfig<TSchema>,
		output: 'object',
		schema: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectObjectConfig<TSchema>, StreamObjectObjectResult<TSchema>, { output: 'object', schema: SchemaType<TSchema> }>;

	ObjectStreamer<TSchema>(
		config: StreamObjectArrayConfig<TSchema>,
		parent: ConfigData,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectArrayConfig<TSchema>, StreamObjectArrayResult<TSchema>, { output: 'array', schema: SchemaType<TSchema> }>;

	ObjectStreamer<TSchema>(
		config: StreamObjectArrayConfig<TSchema>,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectArrayConfig<TSchema>, StreamObjectArrayResult<TSchema>, { output: 'array', schema: SchemaType<TSchema> }>;

	ObjectStreamer(
		config: StreamObjectNoSchemaConfig,
		parent: ConfigData,
		output: 'no-schema'
	): LLMCallSignature<StreamObjectNoSchemaConfig, StreamObjectNoSchemaResult, { output: 'no-schema' }>;

	ObjectStreamer(
		config: StreamObjectNoSchemaConfig,
		output: 'no-schema'
	): LLMCallSignature<StreamObjectNoSchemaConfig, StreamObjectNoSchemaResult, { output: 'no-schema' }>;

	// Implementation
	ObjectStreamer<TSchema>(
		config: StreamObjectObjectConfig<TSchema> | StreamObjectArrayConfig<TSchema> | StreamObjectNoSchemaConfig,
		parentOrOutputType: ConfigData | ObjectStreamOutputType,
		outputOrSchema?: ObjectStreamOutputType | SchemaType<TSchema>,
		schema?: SchemaType<TSchema>
	) {
		let parent: ConfigData | undefined;
		let output: ObjectStreamOutputType;
		let schemaValue: SchemaType<TSchema> | undefined;

		if (parentOrOutputType instanceof ConfigData) {
			// Called as: config, parent, output, schema
			parent = parentOrOutputType;
			output = outputOrSchema as ObjectStreamOutputType;
			schemaValue = schema;
		} else {
			// Called as: config, output, schema
			output = parentOrOutputType;
			schemaValue = outputOrSchema as SchemaType<TSchema>;
		}

		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object streamers cannot use tools - tools found in ' +
				(isToolsConfig(config) ? 'config argument' : 'parent config'));
		}

		switch (output) {
			case 'object':
				return Factory.createLLMRenderer<
					StreamObjectObjectConfig<TSchema>,
					StreamObjectObjectResult<TSchema>,
					{ output: 'object', schema: SchemaType<TSchema> }
				>(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					{ ...config as StreamObjectObjectConfig<TSchema>, output: 'object', schema: schemaValue! },
					streamObject,
					parent
				);
			case 'array':
				return Factory.createLLMRenderer<
					StreamObjectArrayConfig<TSchema>,
					StreamObjectArrayResult<TSchema>,
					{ output: 'array', schema: SchemaType<TSchema> }
				>(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					{ ...config as StreamObjectArrayConfig<TSchema>, output: 'array', schema: schemaValue! },
					streamObject,
					parent
				);
			case 'no-schema':
				return Factory.createLLMRenderer<
					StreamObjectNoSchemaConfig,
					StreamObjectNoSchemaResult,
					{ output: 'no-schema' }
				>(
					{ ...config as StreamObjectNoSchemaConfig, output: 'no-schema' },
					streamObject,
					parent
				);
			default:
				throw new Error(`Invalid output type: ${output as string}`);
		}
	}
	//return Factory.createLLMRenderer(finalConfig, generateText, parent);
	/*TextGenerator<TConfig extends GenerateTextConfig<TOOLS, OUTPUT>, TParent extends ConfigDataWithTools<TOOLS>, TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never>(
		config: TConfig,
		parent: TParent,
		experimentalSchema: SchemaType<OUTPUT>
	): LLMCallSignature<TConfig & TParent['config'], GenerateTextConfig<TOOLS, OUTPUT>, GenerateTextResult<TOOLS, OUTPUT>>;*/

	private static createLLMRendererOld<
		TStoredConfig extends BaseConfig,
		TArgumentConfig extends BaseConfig,
		TResult,
	>(
		config: TStoredConfig,
		func: VercelLLMFunction<TStoredConfig & TArgumentConfig, TResult>,
	): LLMCallSignature<TStoredConfig, TArgumentConfig, TResult> {
		const templateRenderer = new TemplateEngine(config);

		const llmFn = (async (promptOrConfig?: TArgumentConfig | string | Context, context?: Context) => {
			try {
				// Handle case where first param is just context
				const effectiveContext = typeof promptOrConfig === 'object' && !('prompt' in promptOrConfig)
					? promptOrConfig as Context
					: context;

				const effectivePromptOrConfig = typeof promptOrConfig === 'object' && !('prompt' in promptOrConfig)
					? undefined
					: promptOrConfig;

				//the rendered prompt
				const prompt = await templateRenderer.call(effectivePromptOrConfig, effectiveContext);

				let merged: TStoredConfig & TArgumentConfig;

				// Object scenario - llmFn(config, context)
				if (typeof effectivePromptOrConfig === 'object') {
					merged = mergeConfigs(config, effectivePromptOrConfig as TArgumentConfig);
					merged.prompt = prompt;
					if (effectiveContext) {
						merged.context = { ...merged.context ?? {}, ...effectiveContext };
					}
				}
				// String scenario - llmFn("template string", context)
				else if (typeof effectivePromptOrConfig === 'string') {
					merged = mergeConfigs(config, { prompt: effectivePromptOrConfig } as TArgumentConfig);
					if (effectiveContext) {
						merged.context = { ...merged.context ?? {}, ...effectiveContext };
					}
				}
				// Context only scenario - llmFn(context)
				else {
					merged = config as TStoredConfig & TArgumentConfig;//TArgumentConfig is empty
					merged.prompt = prompt;
					if (effectiveContext) {
						merged.context = { ...merged.context ?? {}, ...effectiveContext };
					}
				}

				// Check for model at runtime after all configs are merged
				if (!hasModel(merged)) {
					throw new Error('Model must be specified either in config, parent, or call arguments');
				}

				return (await func(merged)) as TResult;
			} catch (error: any) {
				const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
				throw new Error(`${func.name || 'LLM'} execution failed: ${errorMessage}`, { cause: error });
			}
		}) as LLMCallSignature<TStoredConfig, TArgumentConfig, TResult>;

		llmFn.config = config;
		return llmFn;
	}
}

export const create = new Factory();