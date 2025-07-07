import { generateText, streamText, LanguageModel, ToolSet } from 'ai';

import { validateBaseConfig, ConfigError } from './validate';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';

import { createLLMRenderer, LLMCallSignature } from './llm';

export type TextGeneratorConfig<TOOLS extends ToolSet, OUTPUT> = configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>;
export type TextGeneratorInstance<TOOLS extends ToolSet, OUTPUT> = LLMCallSignature<TextGeneratorConfig<TOOLS, OUTPUT>, results.GenerateTextResult<TOOLS, OUTPUT>>;

// Single config overload
export function TextGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet, OUTPUT = never
>(
	config: utils.StrictTypeWithTemplate<TConfig, configs.GenerateTextConfig<TOOLS, OUTPUT>> & utils.RequireTemplateLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, results.GenerateTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissing<
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.GenerateTextConfig<TOOLS, OUTPUT>
		>,
		{ model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
			utils.Override<TParentConfig, TConfig>,
			configs.GenerateTextConfig<TOOLS, OUTPUT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.GenerateTextResult<TOOLS, OUTPUT>>;

// Implementation
export function TextGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet, OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<results.GenerateTextResult<TOOLS, OUTPUT>>> |
	LLMCallSignature<utils.Override<TParentConfig, TConfig>, Promise<results.GenerateTextResult<TOOLS, OUTPUT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? utils.Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}
	if (!('model' in merged)) {
		throw new ConfigError('TextGenerator config requires model');
	}

	// Debug output if config.debug is true
	if (merged.debug) {
		console.log('[DEBUG] TextGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer<
		CombinedType,
		configs.GenerateTextConfig<TOOLS, OUTPUT> & { model: LanguageModel },
		Promise<results.GenerateTextResult<TOOLS, OUTPUT>>
	>(merged, generateText);
}

// Single config overload
export function TextStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & utils.RequireTemplateLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & utils.RequireTemplateLoaderIfNeeded<utils.Override<TParentConfig, TConfig>>
		& utils.RequireMissing<TConfig, { model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.StreamTextResult<TOOLS, OUTPUT>>;

// Implementation
export function TextStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, results.StreamTextResult<TOOLS, OUTPUT>> |
	LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.StreamTextResult<TOOLS, OUTPUT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? utils.Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	if (!('model' in merged)) {
		throw new ConfigError('TextStreamer config requires model');
	}

	// Debug output if config.debug is true
	if (merged.debug) {
		console.log('[DEBUG] TextStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer<
		CombinedType,
		configs.StreamTextConfig<TOOLS, OUTPUT> & { model: LanguageModel },
		results.StreamTextResult<TOOLS, OUTPUT>
	>(merged, streamText);
}