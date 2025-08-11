import { generateText, LanguageModel, ToolSet } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { RequiredPromptType } from "../types/types";

import { LLMCallSignature, createLLMRenderer } from "../llm";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, ConfigError } from "../validate";

export type TextGeneratorConfig<TOOLS extends ToolSet, OUTPUT> = configs.OptionalTemplatePromptConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>;
export type TextGeneratorInstance<TOOLS extends ToolSet, OUTPUT> = LLMCallSignature<TextGeneratorConfig<TOOLS, OUTPUT>, Promise<results.GenerateTextResult<TOOLS, OUTPUT>>>;

// The generic return type for a TextGenerator instance.
// It correctly infers the TOOL and OUTPUT types from the final merged config.
type GenerateTextReturn<
	TConfig extends configs.OptionalTemplatePromptConfig,
	TOOLS extends ToolSet,
	OUTPUT
> = LLMCallSignature<TConfig, Promise<results.GenerateTextResult<TOOLS, OUTPUT>>>;

// Version of the return type for when a parent config is present.
type GenerateTextWithParentReturn<
	TConfig extends configs.OptionalTemplatePromptConfig,
	TParentConfig extends configs.OptionalTemplatePromptConfig,
	TOOLS extends ToolSet,
	OUTPUT,
	PARENT_TOOLS extends ToolSet,
	PARENT_OUTPUT,
	TFinalConfig extends configs.OptionalTemplatePromptConfig = utils.Override<TParentConfig, TConfig>
> = GenerateTextReturn<TFinalConfig, TOOLS extends ToolSet ? PARENT_TOOLS : TOOLS, OUTPUT extends never ? PARENT_OUTPUT : OUTPUT>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.GenerateTextConfig<any, any> & { model: LanguageModel }>;

// TextGenerator only requires a model
interface TextGeneratorRequiredShape { model: LanguageModel }

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & MoreConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>,
	TFinalConfig extends FinalTextConfigShape,
	TOOLS extends ToolSet,
	OUTPUT,
	PARENT_TOOLS extends ToolSet,
	PARENT_OUTPUT,
	MoreConfig = object
> =
	// GATEKEEPER: Is the config a valid shape?
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & MoreConfig>
	? (
		TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>
		? (
			// 1. Check for excess properties in TConfig
			keyof Omit<TConfig, keyof (configs.GenerateTextConfig<TOOLS, OUTPUT> & MoreConfig)> extends never
			? (
				// 2. If no excess, check for required properties missing from the FINAL merged config.
				keyof Omit<TextGeneratorRequiredShape, keyof TFinalConfig> extends never
				? TConfig // All checks passed.
				: `Config Error: Missing required property 'model' in the final configuration.`
			)
			: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof (configs.GenerateTextConfig<TOOLS, OUTPUT> & MoreConfig)> & string}'`
		) : (
			// Parent Shape is invalid - let TypeScript produce its standard error.
			// @todo - check for excess properties in TConfig
			TParentConfig
		)
	) : TConfig; // Shape is invalid - Resolve to TConfig and let TypeScript produce its standard error.


// Generic validator for the `parent` config object.
type ValidateTextParentConfig<
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>,
	PARENT_TOOLS extends ToolSet,
	PARENT_OUTPUT,
	MoreConfig = object
> =
	// GATEKEEPER: Is the parent config a valid shape?
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>
	? (
		// Check for excess properties in the parent, validated against the CHILD's factory type (PType).
		// This prevents a 'template' parent from being used with a 'text' child if the parent has template-only properties.
		keyof Omit<TParentConfig, keyof (configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig)> extends never
		? TParentConfig // The check has passed.
		: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof (configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig)> & string}'`
	) : TParentConfig; // Shape is invalid.

export function withText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT>
): GenerateTextReturn<TConfig, TOOLS, OUTPUT>;

export function withText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT>>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function withText(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'text', parent);
}

export function loadsText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, OUTPUT>;

export function loadsText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function loadsText(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'text-name', parent);
}

export function withTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig>
): GenerateTextReturn<TConfig, TOOLS, OUTPUT>;

export function withTemplate<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function withTemplate(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-template', parent);
}

export function loadsTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, OUTPUT>;

export function loadsTemplate<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function loadsTemplate(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-template-name', parent);
}

export function withScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig>
): GenerateTextReturn<TConfig, TOOLS, OUTPUT>;

export function withScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function withScript(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-script', parent);
}

export function loadsScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, OUTPUT>;

export function loadsScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function loadsScript(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-script-name', parent);
}

function _createTextGenerator(
	config: Partial<configs.GenerateTextConfig>,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<Partial<configs.GenerateTextConfig>>
): GenerateTextReturn<configs.GenerateTextConfig & configs.OptionalTemplatePromptConfig, any, any> {
	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	validateBaseConfig(merged);
	if (!('model' in merged) || !merged.model) {
		// This runtime check backs up the static type check.
		throw new ConfigError("TextGenerator config requires a 'model' property.");
	}

	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] TextGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer(
		merged as configs.OptionalTemplatePromptConfig & { model: LanguageModel, prompt: string },
		generateText
	) as GenerateTextReturn<configs.GenerateTextConfig & configs.OptionalTemplatePromptConfig, any, any>;
}

export const TextGenerator = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});