import { generateText, generateObject, streamText, CoreTool, streamObject, LanguageModel } from 'ai';
import { ConfigData, ConfigDataModelIsSet, BaseConfigDataWithTools, ConfigDataHasToolsModelIsSet, TemplateConfigData } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './createLLMRenderer';
import { TemplateCallSignature, TemplateEngine } from './TemplateEngine';
import {
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

	// Text functions can use tools and need model (either in config or call)
	TextGenerator<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>>(
		config: GenerateTextConfig<TOOLS>,
		parent?: AnyConfigData
	): LLMCallSignature<StreamTextConfig<TOOLS>, GenerateTextResult<TOOLS, any>> {
		return createLLMRenderer(config, generateText, parent);
	}

	TextStreamer<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>>(
		config: StreamTextConfig<TOOLS>,
		parent?: AnyConfigData
	): LLMCallSignature<StreamTextConfig<TOOLS>, StreamTextResult<TOOLS, any>> {
		return createLLMRenderer(config, streamText, parent);
	}

	// Object functions can't use tools and need model (either in config or call)
	ObjectGenerator<TSchema>(
		config: GenerateObjectObjectConfig<TSchema>,
		outputOrParent: 'object' | ConfigData | undefined,
		outputOrSchema: 'object' | SchemaType<TSchema>,
		schema?: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> }, GenerateObjectObjectResult<TSchema>>;

	ObjectGenerator<TSchema>(
		config: GenerateObjectArrayConfig<TSchema>,
		outputOrParent: 'array' | ConfigData | undefined,
		outputOrSchema: 'array' | SchemaType<TSchema>,
		schema?: SchemaType<TSchema>
	): LLMCallSignature<GenerateObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> }, GenerateObjectArrayResult<TSchema>>;

	ObjectGenerator<ENUM extends string>(
		config: GenerateObjectEnumConfig<ENUM>,
		outputOrParent: 'enum' | ConfigData | undefined,
		outputOrSchema: 'enum' | ENUM[],
		enumValues?: ENUM[]
	): LLMCallSignature<GenerateObjectEnumConfig<ENUM> & { output: 'enum', enum: ENUM[] }, GenerateObjectEnumResult<ENUM>>;

	ObjectGenerator(
		config: GenerateObjectNoSchemaConfig,
		outputOrParent: 'no-schema' | ConfigData | undefined,
		output?: 'no-schema'
	): LLMCallSignature<GenerateObjectNoSchemaConfig & { output: 'no-schema' }, GenerateObjectNoSchemaResult>;

	// Implementation
	ObjectGenerator<TSchema, ENUM extends string>(
		config: GenerateObjectObjectConfig<TSchema> | GenerateObjectArrayConfig<TSchema> | GenerateObjectEnumConfig<ENUM> | GenerateObjectNoSchemaConfig,
		outputOrParent: ObjectGeneratorOutputType | ConfigData | undefined,
		outputOrSchema?: ObjectGeneratorOutputType | SchemaType<TSchema> | ENUM[],
		schemaOrEnum?: SchemaType<TSchema> | ENUM[]
	) {
		let parent: ConfigData | undefined;
		let output: ObjectGeneratorOutputType;
		let schema: SchemaType<TSchema> | ENUM[] | undefined;

		if (typeof outputOrParent === 'string') {
			// Called as: config, output, schema
			output = outputOrParent;
			schema = outputOrSchema as SchemaType<TSchema> | ENUM[];
		} else {
			// Called as: config, parent, output, schema
			parent = outputOrParent;
			output = outputOrSchema as ObjectGeneratorOutputType;
			schema = schemaOrEnum;
		}

		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object generators cannot use tools...');
		}

		switch (output) {
			case 'object':
				return createLLMRenderer<
					GenerateObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> },
					GenerateObjectObjectResult<TSchema>
				>(
					{ ...config as GenerateObjectObjectConfig<TSchema>, output: 'object', schema: schema as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'array':
				return createLLMRenderer<
					GenerateObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> },
					GenerateObjectArrayResult<TSchema>
				>(
					{ ...config as GenerateObjectArrayConfig<TSchema>, output: 'array', schema: schema as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'enum':
				return createLLMRenderer<
					GenerateObjectEnumConfig<ENUM> & { output: 'enum', enum: ENUM[] },
					GenerateObjectEnumResult<ENUM>
				>(
					{ ...config as GenerateObjectEnumConfig<ENUM>, output: 'enum', enum: schema as ENUM[] },
					generateObject,
					parent
				);
			case 'no-schema':
				return createLLMRenderer<
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
		outputOrParent: 'object' | ConfigData | undefined,
		outputOrSchema: 'object' | SchemaType<TSchema>,
		schema?: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> }, StreamObjectObjectResult<TSchema>>;

	ObjectStreamer<TSchema>(
		config: StreamObjectArrayConfig<TSchema>,
		outputOrParent: 'array' | ConfigData | undefined,
		outputOrSchema: 'array' | SchemaType<TSchema>,
		schema?: SchemaType<TSchema>
	): LLMCallSignature<StreamObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> }, StreamObjectArrayResult<TSchema>>;

	ObjectStreamer(
		config: StreamObjectNoSchemaConfig,
		outputOrParent: 'no-schema' | ConfigData | undefined,
		output?: 'no-schema'
	): LLMCallSignature<StreamObjectNoSchemaConfig & { output: 'no-schema' }, StreamObjectNoSchemaResult>;

	// Implementation
	ObjectStreamer<TSchema>(
		config: StreamObjectObjectConfig<TSchema> | StreamObjectArrayConfig<TSchema> | StreamObjectNoSchemaConfig,
		outputOrParent: ObjectStreamOutputType | ConfigData | undefined,
		outputOrSchema?: ObjectStreamOutputType | SchemaType<TSchema>,
		schema?: SchemaType<TSchema>
	) {
		let parent: ConfigData | undefined;
		let output: ObjectStreamOutputType;
		let schemaValue: SchemaType<TSchema> | undefined;

		if (typeof outputOrParent === 'string') {
			// Called as: config, output, schema
			output = outputOrParent;
			schemaValue = outputOrSchema as SchemaType<TSchema>;
		} else {
			// Called as: config, parent, output, schema
			parent = outputOrParent;
			output = outputOrSchema as ObjectStreamOutputType;
			schemaValue = schema;
		}

		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object streamers cannot use tools - tools found in ' +
				(isToolsConfig(config) ? 'config argument' : 'parent config'));
		}

		switch (output) {
			case 'object':
				return createLLMRenderer<
					StreamObjectObjectConfig<TSchema> & { output: 'object', schema: SchemaType<TSchema> },
					StreamObjectObjectResult<TSchema>
				>(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					{ ...config as StreamObjectObjectConfig<TSchema>, output: 'object', schema: schemaValue! },
					streamObject,
					parent
				);
			case 'array':
				return createLLMRenderer<
					StreamObjectArrayConfig<TSchema> & { output: 'array', schema: SchemaType<TSchema> },
					StreamObjectArrayResult<TSchema>
				>(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					{ ...config as StreamObjectArrayConfig<TSchema>, output: 'array', schema: schemaValue! },
					streamObject,
					parent
				);
			case 'no-schema':
				return createLLMRenderer<
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
}

export const create = new Factory();