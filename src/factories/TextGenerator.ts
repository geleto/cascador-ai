import { generateText, LanguageModel, ToolSet, ToolCallOptions } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { RequiredPromptType } from "../types/types";

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, ConfigError } from "../validate";

export type TextGeneratorConfig<TOOLS extends ToolSet, INPUT extends Record<string, any>> = configs.CascadaConfig & configs.GenerateTextConfig<TOOLS, INPUT>;
export type TextGeneratorInstance<TOOLS extends ToolSet, INPUT extends Record<string, any>, PType extends RequiredPromptType> = LLMCallSignature<TextGeneratorConfig<TOOLS, INPUT>, Promise<results.GenerateTextResultAugmented<TOOLS>>, PType>;

// The generic return type for a TextGenerator instance.
// It correctly infers the TOOL and INPUT types from the final merged config.
// Parameterize by the concrete promptType literal used by the implementation.
type GenerateTextReturnWithPrompt<
	TConfig extends configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	PType extends RequiredPromptType
> = LLMCallSignature<TConfig, Promise<results.GenerateTextResultAugmented<TOOLS>>, PType>;

// Version of the return type for when a parent config is present.
// Ensure the final merged config reflects the concrete promptType at the type level.
type GenerateTextWithParentReturn<
	TConfig extends configs.OptionalPromptConfig,
	TParentConfig extends configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	PType extends RequiredPromptType,
	TFinalConfig extends configs.OptionalPromptConfig = utils.Override<TParentConfig, TConfig>
> = GenerateTextReturnWithPrompt<TFinalConfig, TOOLS extends ToolSet ? PARENT_TOOLS : TOOLS, PType>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.GenerateTextConfig<any, any, any> & { model: LanguageModel }>;

// TextGenerator only requires a model
interface TextGeneratorRequiredShape { model: LanguageModel }

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & MoreConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & MoreConfig>,
	TFinalConfig extends FinalTextConfigShape,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	MoreConfig = object
> =
	// GATEKEEPER: Is the config a valid shape?
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & MoreConfig>
	? (
		TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & MoreConfig>
		? (
			// 1. Check for excess properties in TConfig
			keyof Omit<TConfig, keyof (configs.GenerateTextConfig<TOOLS, INPUT> & MoreConfig)> extends never
			? (
				// 2. If no excess, check for required properties missing from the FINAL merged config.
				keyof Omit<TextGeneratorRequiredShape, keyof TFinalConfig> extends never
				? TConfig // All checks passed.
				: `Config Error: Missing required property 'model' in the final configuration.`
			)
			: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof (configs.GenerateTextConfig<TOOLS, INPUT> & MoreConfig)> & string}'`
		) : (
			// Parent Shape is invalid - let TypeScript produce its standard error.
			// @todo - check for excess properties in TConfig
			TConfig
		)
	) : TConfig; // Shape is invalid - Resolve to TConfig and let TypeScript produce its standard error.


// Generic validator for the `parent` config object.
type ValidateTextParentConfig<
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & MoreConfig>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	MoreConfig = object
> =
	// GATEKEEPER: Is the parent config a valid shape?
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & MoreConfig>
	? (
		// Check for excess properties in the parent, validated against the CHILD's factory type (PType).
		// This prevents a 'template' parent from being used with a 'text' child if the parent has template-only properties.
		keyof Omit<TParentConfig, keyof (configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & MoreConfig)> extends never
		? TParentConfig // The check has passed.
		: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof (configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & MoreConfig)> & string}'`
	) : TParentConfig; // Shape is invalid.

function withText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never>,
	TOOLS extends ToolSet = ToolSet,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, never, TOOLS, never>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'text'>;

function withText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, never, PARENT_TOOLS, never>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, never>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text'>;

function withText(
	config: configs.GenerateTextConfig<any, any, any>,
	parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>
) {
	return _createTextGenerator(config, 'text', parent) as GenerateTextWithParentReturn<any, any, any, any, 'text'>;
}

function withTextAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never>,
	TOOLS extends ToolSet = ToolSet,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, never, TOOLS, never>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'text'> & results.RendererToolResult<Record<string, never>, string>;

function withTextAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, never, PARENT_TOOLS, never>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, never>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text'> & results.RendererToolResult<Record<string, never>, string>;

function withTextAsTool(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'text', parent) as GenerateTextWithParentReturn<any, any, any, any, 'text'> & results.RendererToolResult<any, string>;
}

function loadsText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never> & configs.LoaderConfig,
	TOOLS extends ToolSet,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, never, TOOLS, never, configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'text-name'>;

function loadsText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never> & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, never, PARENT_TOOLS, never, configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, never, configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name'>;

function loadsText(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'text-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'text-name'>;
}

function loadsTextAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never> & configs.LoaderConfig,
	TOOLS extends ToolSet,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, never, TOOLS, never, configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'text-name'> & results.RendererToolResult<Record<string, never>, string>;

function loadsTextAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never> & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, never, PARENT_TOOLS, never, configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, never, configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name'> & results.RendererToolResult<Record<string, never>, string>;

function loadsTextAsTool(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'text-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'text-name'> & results.RendererToolResult<any, string>;
}

function withTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-template'>

function withTemplate<
	const TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT>> & configs.CascadaConfig,
	const TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT>> & configs.CascadaConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template'>

function withTemplate(
	config: configs.GenerateTextConfig<any, any, any>,
	parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>,
) {
	return _createTextGenerator(config, 'async-template', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-template'>;
}

function withTemplateAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-template'> & results.RendererToolResult<INPUT, string>;

function withTemplateAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template'> & results.RendererToolResult<INPUT, string>;

function withTemplateAsTool(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'async-template', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-template'> & results.RendererToolResult<any, string>;
}

function loadsTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-template-name'>;

function loadsTemplate<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name'>;

function loadsTemplate(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'async-template-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-template-name'>;
}

function loadsTemplateAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-template-name'> & results.RendererToolResult<INPUT, string>;

function loadsTemplateAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name'> & results.RendererToolResult<INPUT, string>;

function loadsTemplateAsTool(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'async-template-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-template-name'> & results.RendererToolResult<any, string>;
}

function withScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-script'>;

function withScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script'>;

function withScript(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'async-script', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-script'>;
}

function withScriptAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-script'> & results.RendererToolResult<INPUT, string>;

function withScriptAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.CascadaConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script'> & results.RendererToolResult<INPUT, string>;

function withScriptAsTool(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'async-script', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-script'> & results.RendererToolResult<any, string>;
}

function loadsScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-script-name'>;

function loadsScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name'>;

function loadsScript(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'async-script-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-script-name'>;
}

function loadsScriptAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, TConfig, TOOLS, INPUT, TOOLS, INPUT, configs.CascadaConfig & configs.LoaderConfig>
): GenerateTextReturnWithPrompt<TConfig, TOOLS, 'async-script-name'> & results.RendererToolResult<INPUT, string>;

function loadsScriptAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.CascadaConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TParentConfig, TFinalConfig, TOOLS, INPUT, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, PARENT_TOOLS, PARENT_INPUT, configs.CascadaConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name'> & results.RendererToolResult<INPUT, string>;

function loadsScriptAsTool(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'async-script-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-script-name'> & results.RendererToolResult<any, string>;
}

function _createTextGenerator(
	config: Partial<configs.GenerateTextConfig<any, any, any>>,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<Partial<configs.GenerateTextConfig<any, any, any>>>
): any {
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
	);
}

function _createTextGeneratorAsTool(
	config: Partial<configs.GenerateTextConfig<any, any, any>>,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<Partial<configs.GenerateTextConfig<any, any, any>>>
): any {
	const result = _createTextGenerator(config, promptType, parent) as results.RendererToolResult<any, string>;
	result.description = config.description;
	if (config.inputSchema) {
		result.inputSchema = config.inputSchema;
	}
	//result is a caller, assign the execute function to it. Args is the context objectm optiions is not used
	result.execute = result as unknown as (args: any, options: ToolCallOptions) => PromiseLike<string>;
	return result;
}

export const TextGenerator = Object.assign(withText, { // default is withText
	withTemplate: Object.assign(withTemplate, {
		asTool: withTemplateAsTool,
	}),
	withScript: Object.assign(withScript, {
		asTool: withScriptAsTool,
	}),
	withText: Object.assign(withText, {
		asTool: withTextAsTool,
	}),
	loadsTemplate: Object.assign(loadsTemplate, {
		asTool: loadsTemplateAsTool,
	}),
	loadsScript: Object.assign(loadsScript, {
		asTool: loadsScriptAsTool,
	}),
	loadsText: Object.assign(loadsText, {
		asTool: loadsTextAsTool,
	}),
});