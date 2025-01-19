import { generateText, generateObject, streamText, CoreTool, streamObject, LanguageModel } from 'ai';
import { ConfigData, ConfigDataModelIsSet, ConfigDataHasTools, ConfigDataHasToolsModelIsSet, TemplateConfigData } from './ConfigData';
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

	//Final config types - with all required properties for the vercel functions
	GenerateTextFinalConfig,
	GenerateObjectObjectFinalConfig, GenerateObjectArrayFinalConfig, GenerateObjectEnumFinalConfig, GenerateObjectNoSchemaFinalConfig,
	StreamTextFinalConfig, StreamObjectObjectFinalConfig, StreamObjectArrayFinalConfig, StreamObjectNoSchemaFinalConfig,

	//Return types
	GenerateTextResult, StreamTextResult,
	GenerateObjectObjectResult, GenerateObjectArrayResult, GenerateObjectEnumResult, GenerateObjectNoSchemaResult,
	StreamObjectObjectResult, StreamObjectArrayResult, StreamObjectNoSchemaResult
} from './types';

type AnyConfigData = ConfigData | ConfigDataHasTools<any>;

export class Factory {
	/**
   * Config/ConfigTools create configuration objects that can have model and/or tool properties.
   * Child configs inherit their parent's tools and model settings - if the parent has tools config object,
   * the child will be tool-enabled; if the parent has a model property set, the child will
   * be a ModelIsSet config as well.
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
	): ConfigDataHasTools<TOOLS>;

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
		config: GenerateTextFinalConfig<TOOLS>,
		parent?: AnyConfigData
	): LLMCallSignature<GenerateTextFinalConfig<TOOLS>, GenerateTextResult<TOOLS, any>> {
		return createLLMRenderer(config, generateText, parent);
	}

	TextStreamer<TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>>(
		config: StreamTextFinalConfig<TOOLS>,
		parent?: AnyConfigData
	): LLMCallSignature<StreamTextFinalConfig<TOOLS>, StreamTextResult<TOOLS, any>> {
		return createLLMRenderer(config, streamText, parent);
	}

	// Object functions can't use tools and need model (either in config or call)
	ObjectGenerator<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'object',
		parent?: ConfigData,
		schema?: SchemaType<T>
	): LLMCallSignature<GenerateObjectObjectFinalConfig<T>, GenerateObjectObjectResult<T>>;

	ObjectGenerator<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'array',
		parent?: ConfigData,
		schema?: SchemaType<T>
	): LLMCallSignature<GenerateObjectArrayFinalConfig<T>, GenerateObjectArrayResult<T>>;

	ObjectGenerator<ENUM extends string>(
		config: BaseConfig & { enum: ENUM[] },
		output: 'enum',
		parent?: ConfigData,
		enumValues?: ENUM[]
	): LLMCallSignature<GenerateObjectEnumFinalConfig<ENUM>, GenerateObjectEnumResult<ENUM>>;

	ObjectGenerator(
		config: BaseConfig,
		output: 'no-schema',
		parent?: ConfigData
	): LLMCallSignature<GenerateObjectNoSchemaFinalConfig, GenerateObjectNoSchemaResult>;

	// Implementation
	ObjectGenerator<TSchema, ENUM extends string = never>(
		config: BaseConfig,
		output: ObjectGeneratorOutputType,
		parent?: ConfigData,
		schemaOrEnum?: SchemaType<TSchema> | ENUM[]
	) {
		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object generators cannot use tools...');
		}

		switch (output) {
			case 'object':
				return createLLMRenderer<GenerateObjectObjectFinalConfig<TSchema>, GenerateObjectObjectResult<TSchema>>(
					{ ...config, output: 'object', schema: schemaOrEnum as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'array':
				return createLLMRenderer<GenerateObjectArrayFinalConfig<TSchema>, GenerateObjectArrayResult<TSchema>>(
					{ ...config, output: 'array', schema: schemaOrEnum as SchemaType<TSchema> },
					generateObject,
					parent
				);
			case 'enum':
				return createLLMRenderer<GenerateObjectEnumFinalConfig<ENUM>, GenerateObjectEnumResult<ENUM>>(
					{ ...config, output: 'enum', enum: schemaOrEnum as ENUM[] },
					generateObject,
					parent
				);
			case 'no-schema':
				return createLLMRenderer<GenerateObjectNoSchemaFinalConfig, GenerateObjectNoSchemaResult>(
					{ ...config, output: 'no-schema' },
					generateObject,
					parent
				);
			default:
				throw new Error(`Invalid output type: ${output as string}`);
		}
	}

	// Object functions can't use tools and need model (either in config or call)
	ObjectStreamer<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'object',
		parent?: ConfigData,
		schema?: SchemaType<T>
	): LLMCallSignature<StreamObjectObjectFinalConfig<T>, StreamObjectObjectResult<T>>;

	ObjectStreamer<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'array',
		parent?: ConfigData
	): LLMCallSignature<StreamObjectArrayFinalConfig<T>, StreamObjectArrayResult<T>>;

	ObjectStreamer(
		config: BaseConfig,
		output: 'no-schema',
		parent?: ConfigData
	): LLMCallSignature<StreamObjectNoSchemaFinalConfig, StreamObjectNoSchemaResult>;

	// Implementation
	ObjectStreamer<TSchema>(
		config: BaseConfig,
		output: ObjectStreamOutputType,
		parent?: ConfigData,
		schema?: SchemaType<TSchema>
	) {
		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object streamers cannot use tools - tools found in ' +
				(isToolsConfig(config) ? 'config argument' : 'parent configx'));
		}

		switch (output) {
			case 'object':
				return createLLMRenderer<StreamObjectObjectFinalConfig<TSchema>, StreamObjectObjectResult<TSchema>>(
					{ ...config, output: 'object', schema },
					streamObject,
					parent
				);
			case 'array':
				return createLLMRenderer<StreamObjectArrayFinalConfig<TSchema>, StreamObjectArrayResult<TSchema>>(
					{ ...config, output: 'array', schema },
					streamObject,
					parent
				);
			case 'no-schema':
				return createLLMRenderer<StreamObjectNoSchemaFinalConfig, StreamObjectNoSchemaResult>(
					{ ...config, output: 'no-schema' },
					streamObject,
					parent
				);
			default:
				throw new Error(`Invalid output type: ${output as string}`);
		}
	}
}

export const create = new Factory();