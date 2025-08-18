import { generateText, LanguageModel, ToolSet } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { RequiredPromptType } from "../types/types";

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, ConfigError } from "../validate";

export type TextGeneratorConfig<TOOLS extends ToolSet, OUTPUT> = configs.OptionalPromptConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>;
export type TextGeneratorInstance<TOOLS extends ToolSet, OUTPUT, PType extends RequiredPromptType> = LLMCallSignature<TextGeneratorConfig<TOOLS, OUTPUT>, Promise<results.GenerateTextResultAugmented<TOOLS, OUTPUT>>, PType>;

// The generic return type for a TextGenerator instance.
// It correctly infers the TOOL and OUTPUT types from the final merged config.
// Parameterize by the concrete promptType literal used by the implementation.
type GenerateTextReturnWithPrompt<
	TConfig extends configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	OUTPUT,
	PType extends RequiredPromptType
> = LLMCallSignature<TConfig, Promise<results.GenerateTextResultAugmented<TOOLS, OUTPUT>>, PType>;

// Version of the return type for when a parent config is present.
// Ensure the final merged config reflects the concrete promptType at the type level.
type GenerateTextWithParentReturn<
	TConfig extends configs.OptionalPromptConfig,
	TParentConfig extends configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	OUTPUT,
	PARENT_TOOLS extends ToolSet,
	PARENT_OUTPUT,
	PType extends RequiredPromptType,
	TFinalConfig extends configs.OptionalPromptConfig = utils.Override<TParentConfig, TConfig>
> = GenerateTextReturnWithPrompt<TFinalConfig, TOOLS extends ToolSet ? PARENT_TOOLS : TOOLS, OUTPUT extends never ? PARENT_OUTPUT : OUTPUT, PType>;

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

function withText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, OUTPUT, 'text'>;

function withText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT>>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, 'text'>;

function withText(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'text', parent);
}

function loadsText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, OUTPUT, 'text-name'>;

function loadsText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, 'text-name'>;

function loadsText(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'text-name', parent);
}

function withTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, OUTPUT, 'async-template'>;

function withTemplate<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, 'async-template'>;

function withTemplate(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-template', parent);
}

function loadsTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, OUTPUT, 'async-template-name'>;

function loadsTemplate<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, 'async-template-name'>;

function loadsTemplate(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-template-name', parent);
}

function withScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, OUTPUT, 'async-script'>;

function withScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, 'async-script'>;

function withScript(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-script', parent);
}

function loadsScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, OUTPUT, 'async-script-name'>;

function loadsScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, 'async-script-name'>;

function loadsScript(config: configs.GenerateTextConfig, parent?: ConfigProvider<configs.GenerateTextConfig>): any {
	return _createTextGenerator(config, 'async-script-name', parent);
}

function _createTextGenerator(
	config: Partial<configs.GenerateTextConfig>,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<Partial<configs.GenerateTextConfig>>
): GenerateTextReturnWithPrompt<configs.GenerateTextConfig & configs.OptionalPromptConfig, any, any, typeof promptType> {
	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	validateBaseConfig(merged);
	if (!('model' in merged) || !merged.model) {
		// This runtime check backs up the static type check.
		throw new ConfigError("TextGenerator config requires a 'model' property.");
	}

	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] TextGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.PromptConfig & { model: LanguageModel, prompt: string, promptType: 'text' },
		generateText
	) as GenerateTextReturnWithPrompt<configs.GenerateTextConfig, any, any, 'text'>;
}

export const TextGenerator = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});