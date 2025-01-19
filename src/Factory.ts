import { generateText, generateObject, streamText, CoreTool, streamObject } from 'ai';
import { ConfigData, ConfigDataModelIsSet, ConfigDataHasTools, ConfigDataHasToolsModelIsSet, TemplateConfigData } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './createLLMRenderer';
import { TemplateCallSignature, TemplateEngine } from './TemplateEngine';
import {
	BaseConfig,
	BaseConfigModelIsSet,
	TemplateBaseConfig,
	Context,
	ToolsConfig,
	ToolsConfigModelIsSet,
	SchemaType,
	isToolsConfig,
	ObjectGeneratorOutputType,
	ObjectStreamOutputType,
	GenerateTextFinalConfig,
	GenerateObjectObjectFinalConfig,
	StreamTextFinalConfig,
	StreamObjectObjectFinalConfig,
	StreamObjectArrayFinalConfig,
	StreamObjectNoSchemaFinalConfig,
	GenerateObjectArrayFinalConfig,
	GenerateObjectEnumFinalConfig,
	GenerateObjectNoSchemaFinalConfig,
	GenerateTextResult,
	StreamTextResult,
	GenerateObjectObjectResult,
	GenerateObjectArrayResult,
	GenerateObjectEnumResult,
	GenerateObjectNoSchemaResult,
	StreamObjectObjectResult,
	StreamObjectArrayResult,
	StreamObjectNoSchemaResult,
	GenerateObjectResultFromOutput,
	GenerateObjectConfigFromOutput
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
		config: ToolsConfigModelIsSet<TOOLS>,
		parent?: AnyConfigData
	): ConfigDataHasToolsModelIsSet<TOOLS>;

	Config<TOOLS extends Record<string, CoreTool>>(
		config: ToolsConfig<TOOLS>,
		parent?: ConfigDataModelIsSet
	): ConfigDataHasToolsModelIsSet<TOOLS>;

	// Model configs
	Config(
		config: BaseConfigModelIsSet,
		parent?: AnyConfigData
	): ConfigDataModelIsSet;

	Config<TOOLS extends Record<string, CoreTool>>(
		config: ToolsConfig<TOOLS>,
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

	TemplateConfig(config: TemplateBaseConfig, parent?: TemplateConfigData): TemplateConfigData {
		return new TemplateConfigData(config, parent);
	}

	TemplateRenderer(config: TemplateBaseConfig, parent?: TemplateConfigData): TemplateCallSignature {
		const renderer = new TemplateEngine(config, parent);

		const callable = ((promptOrConfig?: string | TemplateBaseConfig, context?: Context) => {
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
		parent?: ConfigData
	): LLMCallSignature<GenerateObjectObjectFinalConfig<T>, GenerateObjectObjectResult<T>>;

	ObjectGenerator<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'array',
		parent?: ConfigData
	): LLMCallSignature<GenerateObjectArrayFinalConfig<T>, GenerateObjectArrayResult<T>>;

	ObjectGenerator<ENUM extends string>(
		config: BaseConfig & { enum: ENUM[] },
		output: 'enum',
		parent?: ConfigData
	): LLMCallSignature<GenerateObjectEnumFinalConfig<ENUM>, GenerateObjectEnumResult<ENUM>>;

	ObjectGenerator(
		config: BaseConfig,
		output: 'no-schema',
		parent?: ConfigData
	): LLMCallSignature<GenerateObjectNoSchemaFinalConfig, GenerateObjectNoSchemaResult>;

	// Implementation
	ObjectGenerator<TSchema, ENUM extends string>(
		config: BaseConfig,
		output: ObjectGeneratorOutputType,
		parent?: ConfigData
	) {
		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object generators cannot use tools...');
		}

		return createLLMRenderer<
			GenerateObjectConfigFromOutput<TSchema, ENUM, typeof output>,
			GenerateObjectResultFromOutput<TSchema, ENUM, typeof output>
		>(
			{ ...config, output },
			generateObject,
			parent
		);
	}

	ObjectGeneratorOLD<TSchema, ENUM extends string>(
		config: BaseConfig,
		output: ObjectGeneratorOutputType,
		parent?: ConfigData
	) {
		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object generators cannot use tools...');
		}

		switch (output) {
			case 'object':
				return createLLMRenderer<GenerateObjectObjectFinalConfig<TSchema>, GenerateObjectObjectResult<TSchema>>(
					{ ...config, output: 'object' },
					generateObject,
					parent
				);
			case 'array':
				return createLLMRenderer<GenerateObjectArrayFinalConfig<TSchema>, GenerateObjectArrayResult<TSchema>>(
					{ ...config, output: 'array' },
					generateObject,
					parent
				);
			case 'enum':
				return createLLMRenderer<GenerateObjectEnumFinalConfig<ENUM>, GenerateObjectEnumResult<ENUM>>(
					{ ...config, output: 'enum' },
					generateObject,
					parent
				);
			case 'no-schema':
				return createLLMRenderer<GenerateObjectNoSchemaFinalConfig, GenerateObjectNoSchemaResult>(
					{ ...config, output: 'no-schema' },
					generateObject,
					parent
				);
		}
	}

	// Object functions can't use tools and need model (either in config or call)
	ObjectStreamer<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'object',
		parent?: ConfigData
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
	ObjectStreamer(
		config: BaseConfig,
		output: ObjectStreamOutputType,
		parent?: AnyConfigData
	) {
		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object streamers cannot use tools - tools found in ' +
				(isToolsConfig(config) ? 'config' : 'parent config'));
		}
		return createLLMRenderer(config, streamObject, parent);
	}
}

export const create = new Factory();