import { generateText, generateObject, streamText, CoreTool, streamObject } from 'ai';
import { ConfigData, ConfigDataModelSet as ConfigDataModelIsSet, ConfigDataTools, ConfigDataToolsModelSet, TemplateConfigData } from './ConfigData';
import { createLLMGenerator, createLLMStreamer, GeneratorCallSignature, StreamerCallSignature } from './createLLMRenderer';
import { TemplateCallSignature, TemplateEngine } from './TemplateEngine';
import {
	Context,

	BaseConfig,
	TemplateBaseConfig,

	ObjectGeneratorOutputType,
	GenerateTextFinalConfig,

	BaseConfigModelIsSet,
	ToolsConfig
} from './types';

type AnyConfigData<T extends Record<string, CoreTool> = any> =
	| ConfigData
	| ConfigDataTools<T>
	| TemplateConfigData;

// Type guards
function isToolsConfig<T extends Record<string, CoreTool>>(
	config: unknown
): config is ToolsConfig<T> {
	return !!config &&
		typeof config === 'object' &&
		'tools' in config &&
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		typeof (config as any).tools === 'object';
}

function isModelConfig(
	config: unknown
): config is BaseConfigModelIsSet {
	return !!config &&
		typeof config === 'object' &&
		'model' in config &&
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		(config as any).model !== null;
}

export class Factory {
	//todo - rename to ConfigData
	/**
	* Config/ConfigTools create configuration objects that can have model and/or tool properties.
	* Child configs inherit their parent's tools and model settings - if the parent has tools config object,
	* the child will be tool-enabled; if the parent has a model property set, the child will
	* be a ModelSet config as well.
	*/
	// Tools configs - most specific
	Config<TOOLS extends Record<string, CoreTool>>(
		config: ToolsConfig<TOOLS> & BaseConfigModelIsSet,
		parent?: AnyConfigData<TOOLS>
	): ConfigDataToolsModelSet<TOOLS>;
	Config<TOOLS extends Record<string, CoreTool>>(
		config: ToolsConfig<TOOLS>,
		parent?: ConfigDataModelIsSet
	): ConfigDataToolsModelSet<TOOLS>;
	Config<TOOLS extends Record<string, CoreTool>>(
		config: ToolsConfig<TOOLS>,
		parent?: ConfigData
	): ConfigDataTools<TOOLS>;

	// Model configs
	Config(
		config: BaseConfig,
		parent?: ConfigDataModelIsSet
	): ConfigDataModelIsSet;
	Config(
		config: BaseConfigModelIsSet,
		parent?: AnyConfigData<never>
	): ConfigDataModelIsSet;
	Config<TOOLS extends Record<string, CoreTool>>(
		config: BaseConfigModelIsSet,
		parent?: ConfigDataTools<TOOLS>
	): ConfigDataToolsModelSet<TOOLS>;
	Config<TOOLS extends Record<string, CoreTool>>(
		config: BaseConfig,
		parent?: ConfigDataTools<TOOLS>
	): ConfigDataTools<TOOLS>;

	// Base config - least specific
	Config(
		config: BaseConfig,
		parent?: ConfigData
	): ConfigData;

	Config<TOOLS extends Record<string, CoreTool>>(
		config: BaseConfig,
		parent?: AnyConfigData
	): AnyConfigData {
		// Validate inputs, for JS too
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!config || typeof config !== 'object') {
			throw new Error('Invalid config object');
		}

		if (parent && !(
			parent instanceof ConfigData ||
			parent instanceof ConfigDataTools ||
			parent instanceof TemplateConfigData
		)) {
			throw new Error('Invalid parent config');
		}

		// Handle tools config
		if (isToolsConfig<TOOLS>(config)) {
			if (isModelConfig(config) || (parent && isModelConfig(parent))) {
				return new ConfigDataToolsModelSet<TOOLS>(
					config as ToolsConfig<TOOLS> & BaseConfigModelIsSet,
					parent
				);
			}
			return new ConfigDataTools<TOOLS>(config, parent);
		}

		// Handle model inheritance
		if (isModelConfig(config)) {
			if (parent instanceof ConfigDataTools) {
				const toolsParent = parent as ConfigDataTools<TOOLS>;
				return new ConfigDataToolsModelSet<TOOLS>(
					config,
					toolsParent
				);
			}
			return new ConfigDataModelIsSet(config, parent);
		}

		// Handle tools inheritance
		if (parent instanceof ConfigDataTools) {
			const toolsParent = parent as ConfigDataTools<TOOLS>;
			return new ConfigDataTools<TOOLS>(config, toolsParent);
		}

		// Base case
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

	//Overloads for TextGenerator: either config or parent must have model set
	TextGenerator(config: BaseConfigModelIsSet, parent?: AnyConfigData): GeneratorCallSignature<GenerateTextFinalConfig, typeof generateText>;
	TextGenerator(config: BaseConfig, parent?: ConfigDataModelIsSet): GeneratorCallSignature<GenerateTextFinalConfig, typeof generateText>;


	//implementation
	TextGenerator(config: BaseConfig, parent?: AnyConfigData): GeneratorCallSignature<BaseConfig, typeof generateText> {
		return createLLMGenerator(config, generateText, parent);
	}

	//Overloads for TextStreamer: either config or parent must have model set

	//implementation
	TextStreamer(config: BaseConfig, parent?: AnyConfigData): GeneratorCallSignature<BaseConfig, typeof streamText> {
		//validateConfig(config, parent);
		return createLLMStreamer(config, streamText, parent);
	}

	// Overloads for ObjectGenerator: either config or parent must have model set and no tools (ToolsConfig<any>, ConfigDataTools<any>)

	//todo: no tools, model set
	ObjectGenerator(config: BaseConfig, output: 'object', parent?: AnyConfigData): GeneratorCallSignature<BaseConfig, typeof generateObject>;

	// Implementation
	ObjectGenerator(config: BaseConfig, output: ObjectGeneratorOutputType, parent?: AnyConfigData) {
		return createLLMStreamer(config, generateObject, parent);
	}

	ObjectStreamer(config: BaseConfig, output: 'object', parent?: AnyConfigData): StreamerCallSignature<BaseConfig, typeof streamObject>;

	// Implementation
	ObjectStreamer(config: BaseConfig, output: ObjectGeneratorOutputType, parent?: AnyConfigData) {
		return createLLMStreamer(config, streamObject, parent);
	}
}

export const create = new Factory();