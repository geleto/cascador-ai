import { streamText, LanguageModel, ToolSet } from "ai";

import * as results from './types-result';
import * as configs from './types-config';
import * as utils from './type-utils';
import { RequiredPromptType } from "./types";

import { LLMCallSignature, createLLMRenderer } from "./llm";
import { ConfigProvider, mergeConfigs } from "./ConfigData";
import { validateBaseConfig, ConfigError } from "./validate";

// The generic return type for a TextStreamer instance.
// It correctly infers the TOOL and OUTPUT types from the final merged config.
type StreamTextReturn<
	TConfig extends configs.OptionalTemplateConfig,
	TOOLS extends ToolSet,
	OUTPUT
> = LLMCallSignature<TConfig, Promise<results.StreamTextResult<TOOLS, OUTPUT>>>;

// Version of the return type for when a parent config is present.
type StreamTextWithParentReturn<
	TConfig extends configs.OptionalTemplateConfig,
	TParentConfig extends configs.OptionalTemplateConfig,
	TOOLS extends ToolSet,
	OUTPUT,
	PARENT_TOOLS extends ToolSet,
	PARENT_OUTPUT,
	TFinalConfig extends configs.OptionalTemplateConfig = utils.Override<TParentConfig, TConfig>
> = StreamTextReturn<TFinalConfig, TOOLS extends ToolSet ? PARENT_TOOLS : TOOLS, OUTPUT extends never ? PARENT_OUTPUT : OUTPUT>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.StreamTextConfig<any, any> & { model: LanguageModel }>;

// TextStreamer only requires a model
interface TextStreamerRequiredShape { model: LanguageModel }

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT> & MoreConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>,
	TFinalConfig extends FinalTextConfigShape,
	TOOLS extends ToolSet,
	OUTPUT,
	PARENT_TOOLS extends ToolSet,
	PARENT_OUTPUT,
	MoreConfig = object
> =
	// GATEKEEPER: Is the config a valid shape?
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT> & MoreConfig>
	? (
		TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>
		? (
			// 1. Check for excess properties in TConfig
			keyof Omit<TConfig, keyof (configs.StreamTextConfig<TOOLS, OUTPUT> & MoreConfig)> extends never
			? (
				// 2. If no excess, check for required properties missing from the FINAL merged config.
				keyof Omit<TextStreamerRequiredShape, keyof TFinalConfig> extends never
				? TConfig // All checks passed.
				: `Config Error: Missing required property 'model' in the final configuration.`
			)
			: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof (configs.StreamTextConfig<TOOLS, OUTPUT> & MoreConfig)> & string}'`
		) : (
			// Parent Shape is invalid - let TypeScript produce its standard error.
			// @todo - check for excess properties in TConfig
			TParentConfig
		)
	) : TConfig; // Shape is invalid - Resolve to TConfig and let TypeScript produce its standard error.


// Generic validator for the `parent` config object.
type ValidateTextParentConfig<
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>,
	PARENT_TOOLS extends ToolSet,
	PARENT_OUTPUT,
	MoreConfig = object
> =
	// GATEKEEPER: Is the parent config a valid shape?
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig>
	? (
		// Check for excess properties in the parent, validated against the CHILD's factory type (PType).
		// This prevents a 'template' parent from being used with a 'text' child if the parent has template-only properties.
		keyof Omit<TParentConfig, keyof (configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig)> extends never
		? TParentConfig // The check has passed.
		: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof (configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & MoreConfig)> & string}'`
	) : TParentConfig; // Shape is invalid.

export function withText<
	const TConfig extends configs.StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT>
): StreamTextReturn<TConfig, TOOLS, OUTPUT>;

export function withText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT>>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function withText(config: configs.StreamTextConfig, parent?: ConfigProvider<configs.StreamTextConfig>): any {
	return _createTextStreamer(config, 'text', parent);
}

export function loadsText<
	const TConfig extends configs.StreamTextConfig<TOOLS, OUTPUT> & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.LoaderConfig>
): StreamTextReturn<TConfig, TOOLS, OUTPUT>;

export function loadsText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.LoaderConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function loadsText(config: configs.StreamTextConfig, parent?: ConfigProvider<configs.StreamTextConfig>): any {
	return _createTextStreamer(config, 'text-name', parent);
}

export function withTemplate<
	const TConfig extends configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig>
): StreamTextReturn<TConfig, TOOLS, OUTPUT>;

export function withTemplate<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function withTemplate(config: configs.StreamTextConfig, parent?: ConfigProvider<configs.StreamTextConfig>): any {
	return _createTextStreamer(config, 'async-template', parent);
}

export function loadsTemplate<
	const TConfig extends configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig & configs.LoaderConfig>
): StreamTextReturn<TConfig, TOOLS, OUTPUT>;

export function loadsTemplate<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function loadsTemplate(config: configs.StreamTextConfig, parent?: ConfigProvider<configs.StreamTextConfig>): any {
	return _createTextStreamer(config, 'async-template-name', parent);
}

export function withScript<
	const TConfig extends configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig>
): StreamTextReturn<TConfig, TOOLS, OUTPUT>;

export function withScript<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function withScript(config: configs.StreamTextConfig, parent?: ConfigProvider<configs.StreamTextConfig>): any {
	return _createTextStreamer(config, 'async-script', parent);
}

export function loadsScript<
	const TConfig extends configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet = ToolSet,
	OUTPUT = never
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, OUTPUT, TOOLS, OUTPUT, configs.CascadaConfig & configs.LoaderConfig>
): StreamTextReturn<TConfig, TOOLS, OUTPUT>;

export function loadsScript<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet, OUTPUT, PARENT_TOOLS extends ToolSet, PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_OUTPUT, configs.CascadaConfig & configs.LoaderConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, OUTPUT, PARENT_TOOLS, PARENT_OUTPUT>;

export function loadsScript(config: configs.StreamTextConfig, parent?: ConfigProvider<configs.StreamTextConfig>): any {
	return _createTextStreamer(config, 'async-script-name', parent);
}

function _createTextStreamer(
	config: Partial<configs.StreamTextConfig>,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<Partial<configs.StreamTextConfig>>
): StreamTextReturn<configs.StreamTextConfig & configs.OptionalTemplateConfig, any, any> {
	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	validateBaseConfig(merged);
	if (!('model' in merged) || !merged.model) {
		// This runtime check backs up the static type check.
		throw new ConfigError("TextStreamer config requires a 'model' property.");
	}

	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] TextStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer(
		merged as configs.OptionalTemplateConfig & { model: LanguageModel, prompt: string },
		streamText
	) as StreamTextReturn<configs.StreamTextConfig & configs.OptionalTemplateConfig, any, any>;
}

export const TextStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});