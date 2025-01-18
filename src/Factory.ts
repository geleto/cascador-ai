import { generateText, generateObject, streamText, CoreTool, streamObject } from 'ai';
import { ConfigData, ConfigDataModelIsSet, ConfigDataHasTools, ConfigDataHasToolsModelIsSet, TemplateConfigData } from './ConfigData';
import { createLLMRenderer } from './createLLMRenderer';
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
	GenerateObjectNoSchemaFinalConfig
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

	//todo - the generator fn config must be type checked to have model
	TextGenerator(
		config: BaseConfigModelIsSet,
		parent?: AnyConfigData
	): GeneratorCallSignature<GenerateTextFinalConfig, typeof generateText>;

	TextGenerator(
		config: BaseConfig,
		parent: ConfigDataModelIsSet
	): GeneratorCallSignature<GenerateTextFinalConfig, typeof generateText>;

	TextGenerator(
		config: BaseConfig,
		parent?: AnyConfigData
	): GeneratorCallSignature<BaseConfig, typeof generateText> {
		return createLLMRenderer(config, generateText, parent);
	}

	TextStreamer(
		config: BaseConfigModelIsSet,
		parent?: AnyConfigData
	): StreamerCallSignature<StreamTextFinalConfig, typeof streamText>;

	TextStreamer(
		config: BaseConfig,
		parent: ConfigDataModelIsSet
	): StreamerCallSignature<StreamTextFinalConfig, typeof streamText>;

	TextStreamer(
		config: BaseConfig,
		parent?: AnyConfigData
	): StreamerCallSignature<BaseConfig, typeof streamText> {
		return createLLMRenderer(config, streamText, parent);
	}

	// Overloads for ObjectGenerator: model required, no tools allowed
	ObjectGenerator<T>(
		config: BaseConfigModelIsSet & { schema: SchemaType<T> },
		output: 'object',
		parent?: ConfigData
	): GeneratorCallSignature<GenerateObjectObjectFinalConfig<T>, typeof generateObject>;

	ObjectGenerator<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'array',
		parent: ConfigDataModelIsSet
	): GeneratorCallSignature<GenerateObjectArrayFinalConfig<T>, typeof generateObject>;

	ObjectGenerator<ENUM extends string>(
		config: BaseConfigModelIsSet & { enum: ENUM[] },
		output: 'enum',
		parent?: ConfigData
	): GeneratorCallSignature<GenerateObjectEnumFinalConfig<ENUM>, typeof generateObject>;

	ObjectGenerator(
		config: BaseConfig,
		output: 'no-schema',
		parent?: ConfigData
	): GeneratorCallSignature<GenerateObjectNoSchemaFinalConfig, typeof generateObject>;

	// Implementation
	ObjectGenerator(
		config: BaseConfig,
		output: ObjectGeneratorOutputType,
		parent?: AnyConfigData
	) {
		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object generators cannot use tools');
		}
		return createLLMRenderer(config, generateObject, parent);
	}

	ObjectStreamer<T>(
		config: BaseConfigModelIsSet & { schema: SchemaType<T> },
		output: 'object',
		parent?: ConfigData
	): StreamerCallSignature<StreamObjectObjectFinalConfig<T>, typeof streamObject>;

	ObjectStreamer<T>(
		config: BaseConfig & { schema: SchemaType<T> },
		output: 'array',
		parent: ConfigDataModelIsSet
	): StreamerCallSignature<StreamObjectArrayFinalConfig<T>, typeof streamObject>;

	ObjectStreamer(
		config: BaseConfig,
		output: 'no-schema',
		parent?: ConfigData
	): StreamerCallSignature<StreamObjectNoSchemaFinalConfig, typeof streamObject>;

	// Implementation
	ObjectStreamer(
		config: BaseConfig,
		output: ObjectStreamOutputType,
		parent?: AnyConfigData
	) {
		if (isToolsConfig(config) || (parent && isToolsConfig(parent.config))) {
			throw new Error('Object streamers cannot use tools');
		}
		return createLLMRenderer(config, streamObject, parent);
	}
}

export const create = new Factory();