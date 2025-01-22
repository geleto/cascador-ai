import { generateText, generateObject, streamText, CoreTool, streamObject, LanguageModel, Output, DeepPartial } from 'ai';
import { ConfigData, mergeConfigs, ConfigDataModelIsSet, BaseConfigDataWithTools, ConfigDataHasToolsModelIsSet, TemplateConfigData } from './ConfigData';
import { TemplateCallSignature, TemplateEngine } from './TemplateEngine';
import {
	LLMCallSignature,
	SchemaType, Context,
	ObjectGeneratorOutputType, ObjectStreamOutputType,

	//Base Config types, all properties are optional
	BaseConfig, //a base config common for all generators and streamers
	TemplateOnlyBaseConfig, //only the template engine configuration properties
	BaseConfigWithTools, //a base config with tools, can not be used for streamers

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
	//GenerateTextToolsOnlyConfig
} from './types';

type AnyConfigData = ConfigData | BaseConfigDataWithTools<any>;

export class Factory {
	/**
   * Config/ConfigTools create configuration objects that can have model and/or tool properties.
   * Child configs inherit their parent's tools and model settings - if the parent has tools config object,
   * the child will be tool-enabled; if the parent has a model property set, the child will
   * be a ModelIsSet config as well.
   * There are two types of configs:
   * - BaseConfig: the most generic config that has properties common to all generators and streamers
   * - BaseConfigWithTools: a config that has tools property, can only be used for generators
   * There are variants of these configs depending on whether a model is set or not.
   */

	// Tools configs - most specific
	Config<TOOLS extends Record<string, CoreTool>>(
		config: BaseConfigWithTools<TOOLS> & { model: LanguageModel },
		parent?: AnyConfigData
	): ConfigDataHasToolsModelIsSet<TOOLS>;

	Config<TOOLS extends Record<string, CoreTool>>(
		config: BaseConfigWithTools<TOOLS>,
		parent?: ConfigDataModelIsSet
	): ConfigDataHasToolsModelIsSet<TOOLS>;

	// Model configs
	Config(
		config: BaseConfig & { model: LanguageModel },
		parent?: AnyConfigData
	): ConfigDataModelIsSet;

	Config<TOOLS extends Record<string, CoreTool>>(
		config: BaseConfigWithTools<TOOLS>,
		parent?: ConfigData
	): BaseConfigDataWithTools<TOOLS>;

	// Base config - least specific
	Config(
		config: BaseConfig,
		parent?: ConfigData
	): ConfigData;

	Config(config: BaseConfig, parent?: AnyConfigData): AnyConfigData {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!config || typeof config !== 'object') {
			throw new Error('Invalid config object');
		}

		return new ConfigData(config, parent);
	}

	TemplateConfig(config: TemplateOnlyBaseConfig, parent?: TemplateConfigData): TemplateConfigData {
		return new TemplateConfigData(config, parent);
	}

	TemplateRenderer(config: TemplateOnlyBaseConfig, parent?: TemplateConfigData): TemplateCallSignature {
		const renderer = new TemplateEngine(config, parent);

		const callable = ((promptOrConfig?: string | TemplateOnlyBaseConfig, context?: Context) => {
			return renderer.call(promptOrConfig, context);
		}) as TemplateCallSignature;

		callable.config = renderer.config;
		return callable;
	}

	// Text functions can use tools
	TextGenerator<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never>(
		config: GenerateTextConfig<TOOLS, OUTPUT>,
		parent: AnyConfigData,
		experimentalSchema: SchemaType<OUTPUT>
	): LLMCallSignature<GenerateTextConfig<TOOLS, OUTPUT>, GenerateTextResult<TOOLS, OUTPUT>>;

	TextGenerator<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never>(
		config: GenerateTextConfig<TOOLS, OUTPUT>,
		experimentalSchema: SchemaType<OUTPUT>
	): LLMCallSignature<GenerateTextConfig<TOOLS, OUTPUT>, GenerateTextResult<TOOLS, OUTPUT>>;

	TextGenerator<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never>(
		config: GenerateTextConfig<TOOLS, OUTPUT>,
		parent?: AnyConfigData
	): LLMCallSignature<GenerateTextConfig<TOOLS, OUTPUT>, GenerateTextResult<TOOLS, undefined>>;

	// Implementation
	TextGenerator<
		TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
		OUTPUT = never
	>(
		config: GenerateTextConfig<TOOLS, OUTPUT>,
		parentOrSchema?: AnyConfigData | SchemaType<OUTPUT>,
		experimentalSchema?: SchemaType<OUTPUT>//this allows to use tools + schema in the same call, unlike generateObject which has no tools
	): LLMCallSignature<GenerateTextConfig<TOOLS, OUTPUT>, GenerateTextResult<TOOLS, OUTPUT>> {
		let parent: AnyConfigData | undefined;
		let schema: SchemaType<OUTPUT> | undefined;

		if (parentOrSchema instanceof ConfigData || parentOrSchema instanceof BaseConfigDataWithTools) {
			parent = parentOrSchema;
			schema = experimentalSchema;
		} else {
			schema = parentOrSchema;
		}

		const finalConfig = schema
			? { ...config, experimental_output: Output.object({ schema }) }
			: config;

		return Factory.createLLMRenderer(finalConfig, generateText, parent);
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

		if (parentOrSchema instanceof ConfigData || parentOrSchema instanceof BaseConfigDataWithTools) {
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
		parent: ConfigData,
		output: 'object',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> }, GenerateObjectObjectResult<TSchema>>;

	ObjectGenerator<TSchema>(
		config: GenerateObjectObjectConfig<TSchema>,
		output: 'object',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> }, GenerateObjectObjectResult<TSchema>>;

	ObjectGenerator<TSchema>(
		config: GenerateObjectArrayConfig<TSchema>,
		parent: ConfigData,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> }, GenerateObjectArrayResult<TSchema>>;

	ObjectGenerator<TSchema>(
		config: GenerateObjectArrayConfig<TSchema>,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> }, GenerateObjectArrayResult<TSchema>>;

	ObjectGenerator<ENUM extends string>(
		config: GenerateObjectEnumConfig<ENUM>,
		parent: ConfigData,
		output: 'enum',
		enumValues: ENUM[]
	): LLMCallSignature<GenerateObjectEnumConfig<ENUM> & { output: 'enum', enum: ENUM[] }, GenerateObjectEnumResult<ENUM>>;

	ObjectGenerator<ENUM extends string>(
		config: GenerateObjectEnumConfig<ENUM>,
		output: 'enum',
		enumValues: ENUM[]
	): LLMCallSignature<GenerateObjectEnumConfig<ENUM> & { output: 'enum', enum: ENUM[] }, GenerateObjectEnumResult<ENUM>>;

	ObjectGenerator(
		config: GenerateObjectNoSchemaConfig,
		parent: ConfigData,
		output: 'no-schema'
	): LLMCallSignature<GenerateObjectNoSchemaConfig & { output: 'no-schema' }, GenerateObjectNoSchemaResult>;

	ObjectGenerator(
		config: GenerateObjectNoSchemaConfig,
		output: 'no-schema'
	): LLMCallSignature<GenerateObjectNoSchemaConfig & { output: 'no-schema' }, GenerateObjectNoSchemaResult>;

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
					GenerateObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> },
					GenerateObjectObjectResult<TSchema>
				>(
					{ ...config as GenerateObjectObjectConfig<TSchema>, output: 'object', schema: schema as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'array':
				return Factory.createLLMRenderer<
					GenerateObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> },
					GenerateObjectArrayResult<TSchema>
				>(
					{ ...config as GenerateObjectArrayConfig<TSchema>, output: 'array', schema: schema as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'enum':
				return Factory.createLLMRenderer<
					GenerateObjectEnumConfig<ENUM> & { output: 'enum', enum: ENUM[] },
					GenerateObjectEnumResult<ENUM>
				>(
					{ ...config as GenerateObjectEnumConfig<ENUM>, output: 'enum', enum: schema as ENUM[] },
					generateObject,
					parent
				);
			case 'no-schema':
				return Factory.createLLMRenderer<
					GenerateObjectNoSchemaConfig & { output: 'no-schema' },
					GenerateObjectNoSchemaResult
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
	): LLMCallSignature<StreamObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> }, StreamObjectObjectResult<TSchema>>;

	ObjectStreamer<TSchema>(
		config: StreamObjectObjectConfig<TSchema>,
		output: 'object',
		schema: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> }, StreamObjectObjectResult<TSchema>>;

	ObjectStreamer<TSchema>(
		config: StreamObjectArrayConfig<TSchema>,
		parent: ConfigData,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> }, StreamObjectArrayResult<TSchema>>;

	ObjectStreamer<TSchema>(
		config: StreamObjectArrayConfig<TSchema>,
		output: 'array',
		schema: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> }, StreamObjectArrayResult<TSchema>>;

	ObjectStreamer(
		config: StreamObjectNoSchemaConfig,
		parent: ConfigData,
		output: 'no-schema'
	): LLMCallSignature<StreamObjectNoSchemaConfig & { output: 'no-schema' }, StreamObjectNoSchemaResult>;

	ObjectStreamer(
		config: StreamObjectNoSchemaConfig,
		output: 'no-schema'
	): LLMCallSignature<StreamObjectNoSchemaConfig & { output: 'no-schema' }, StreamObjectNoSchemaResult>;

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
					StreamObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> },
					StreamObjectObjectResult<TSchema>
				>(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					{ ...config as StreamObjectObjectConfig<TSchema>, output: 'object', schema: schemaValue! },
					streamObject,
					parent
				);
			case 'array':
				return Factory.createLLMRenderer<
					StreamObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> },
					StreamObjectArrayResult<TSchema>
				>(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					{ ...config as StreamObjectArrayConfig<TSchema>, output: 'array', schema: schemaValue! },
					streamObject,
					parent
				);
			case 'no-schema':
				return Factory.createLLMRenderer<
					StreamObjectNoSchemaConfig & { output: 'no-schema' },
					StreamObjectNoSchemaResult
				>(
					{ ...config as StreamObjectNoSchemaConfig, output: 'no-schema' },
					streamObject,
					parent
				);
			default:
				throw new Error(`Invalid output type: ${output as string}`);
		}
	}

	private static createLLMRenderer<TConfig extends BaseConfig, TResult>(
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

				let merged: BaseConfig;

				// Object scenario - llmFn(config, context)
				if (typeof effectivePromptOrConfig !== 'string' && effectivePromptOrConfig) {
					merged = mergeConfigs(renderer.config, effectivePromptOrConfig as TConfig);
					merged.prompt = prompt;
					if (effectiveContext) {
						merged.context = { ...merged.context ?? {}, ...effectiveContext };
					}
				}
				// String scenario - llmFn("template string", context)
				else if (typeof effectivePromptOrConfig === 'string') {
					merged = mergeConfigs(renderer.config, { prompt });
					if (effectiveContext) {
						merged.context = { ...merged.context ?? {}, ...effectiveContext };
					}
				}
				// Context only scenario - llmFn(context)
				else {
					merged = renderer.config;
					merged.prompt = prompt;
					if (effectiveContext) {
						merged.context = { ...merged.context ?? {}, ...effectiveContext };
					}
				}

				// Check for model at runtime after all configs are merged
				if (!hasModel(merged)) {
					throw new Error('Model must be specified either in config, parent, or call arguments');
				}

				return (await func(merged as TConfig & { model: LanguageModel })) as TResult;
			} catch (error: any) {
				const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
				throw new Error(`${func.name || 'LLM'} execution failed: ${errorMessage}`, { cause: error });
			}
		}) as LLMCallSignature<TConfig, TResult>;

		llmFn.config = renderer.config as TConfig;
		return llmFn;
	}
}

export const create = new Factory();