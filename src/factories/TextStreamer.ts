import { streamText, LanguageModel, ToolSet, ModelMessage } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateTextLLMConfig } from "../validate";

export type TextStreamerConfig<TOOLS extends ToolSet, INPUT extends Record<string, any>> = configs.CascadaConfig & configs.StreamTextConfig<TOOLS, INPUT>;
export type TextStreamerInstance<TOOLS extends ToolSet, INPUT extends Record<string, any>, PType extends types.RequiredPromptType> = LLMCallSignature<TextStreamerConfig<TOOLS, INPUT>, Promise<results.StreamTextResultAugmented<TOOLS>>, PType>;

// The generic return type for a TextStreamer instance.
// It correctly infers the TOOL and INPUT types from the final merged config.
// Parameterize by the concrete promptType literal used by the implementation.
type StreamTextReturn<
	TConfig extends configs.BaseConfig, //& configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource = string
> = LLMCallSignature<TConfig, Promise<results.StreamTextResultAugmented<TOOLS>>, PType, PROMPT>;

// Version of the return type for when a parent config is present.
// Ensure the final merged config reflects the concrete promptType at the type level.
type StreamTextWithParentReturn<
	TConfig extends Partial<configs.BaseConfig>, //& configs.OptionalPromptConfig,
	TParentConfig extends Partial<configs.BaseConfig>, //& configs.OptionalPromptConfig,
	TOOLS extends ToolSet, //@todo - merge tools
	PARENT_TOOLS extends ToolSet, //@todo - merge tools
	PType extends types.RequiredPromptType,
	FINAL_TOOLS extends ToolSet = utils.Override<PARENT_TOOLS, TOOLS>,
	TFinalConfig extends configs.BaseConfig = utils.Override<TParentConfig, TConfig>,
	PROMPT extends types.AnyPromptSource = string
> = LLMCallSignature<TFinalConfig, Promise<results.StreamTextResultAugmented<FINAL_TOOLS>>, PType, PROMPT>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.StreamTextConfig<any, any, any> & { model: LanguageModel }>;

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.StreamTextConfig<any, any, PROMPT>>,
	TFinalConfig extends FinalTextConfigShape,
	TShape extends configs.StreamTextConfig<any, any, PROMPT>,
	PROMPT extends string | ModelMessage[] = string,
	TRequired =
	& (TShape extends { inputSchema: any } ? { inputSchema: any, model: LanguageModel } : { model: LanguageModel })
	& (TShape extends { loader: any } ? { loader: any, model: LanguageModel } : { model: LanguageModel }),
> =
	// GATEKEEPER: Check for excess or missing properties
	// 1. Check for excess properties in TConfig that are not in TShape
	keyof Omit<TConfig, keyof TShape> extends never
	? (
		// 2. If no excess, check for required properties missing from the FINAL merged config.
		keyof Omit<TRequired, keyof TFinalConfig> extends never
		? TConfig // All checks passed.
		: `Config Error: Missing required property '${keyof Omit<TRequired, keyof TFinalConfig> & string}' in the final configuration.`
	)
	: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof TShape> & string}'`;


// Generic validator for the `parent` config object.
type ValidateTextParentConfig<
	TParentConfig extends Partial<configs.StreamTextConfig<any, any, PROMPT>>,
	TShape extends configs.StreamTextConfig<any, any, PROMPT>,
	PROMPT extends string | ModelMessage[] = string
> =
	// Check for excess properties in the parent validated against TShape
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;

function withText<
	const TConfig extends configs.StreamTextConfig<TOOLS, never, PROMPT>,
	TOOLS extends ToolSet = ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<
		TConfig, TConfig, configs.StreamTextConfig<TOOLS, never, PROMPT>, PROMPT
	>
): StreamTextReturn<TConfig, TOOLS, 'text', PROMPT>;

function withText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never, PROMPT>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never, PROMPT>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<TOOLS, never, PROMPT>, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<TOOLS, never, PROMPT>, PROMPT>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text', TOOLS, TFinalConfig, PROMPT>;

function withText(
	config: configs.StreamTextConfig<any, any, any>,
	parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>
) {
	return _createTextStreamer(config, 'text', parent, false) as StreamTextWithParentReturn<any, any, any, any, 'text'>;
}

function loadsText<
	const TConfig extends configs.StreamTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig,
	TOOLS extends ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig, PROMPT>
): StreamTextReturn<TConfig, TOOLS, 'text-name', PROMPT>;

function loadsText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, never, PROMPT> & configs.LoaderConfig, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, never, PROMPT> & configs.LoaderConfig, PROMPT>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name', TOOLS, TFinalConfig, PROMPT>;

function loadsText(config: configs.StreamTextConfig<any, any, any>, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamer(config, 'text-name', parent, false) as StreamTextWithParentReturn<any, any, any, any, 'text-name'>;
}

function withTemplate<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>
): StreamTextReturn<TConfig, TOOLS, 'async-template'>

function withTemplate<
	const TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>,
	const TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template'>

function withTemplate(
	config: configs.StreamTextConfig<any, any, any>,
	parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>,
) {
	return _createTextStreamer(config, 'async-template', parent, false) as StreamTextWithParentReturn<any, any, any, any, 'async-template'>;
}

function loadsTemplate<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>
): StreamTextReturn<TConfig, TOOLS, 'async-template-name'>;

function loadsTemplate<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name'>;

function loadsTemplate(config: configs.StreamTextConfig<any, any, any>, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamer(config, 'async-template-name', parent, false) as StreamTextWithParentReturn<any, any, any, any, 'async-template-name'>;
}

function withScript<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>
): StreamTextReturn<TConfig, TOOLS, 'async-script'>;

function withScript<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script'>;

function withScript(config: configs.StreamTextConfig<any, any, any>, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamer(config, 'async-script', parent, false) as StreamTextWithParentReturn<any, any, any, any, 'async-script'>;
}

function loadsScript<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>
): StreamTextReturn<TConfig, TOOLS, 'async-script-name'>;

function loadsScript<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name'>;

function loadsScript(config: configs.StreamTextConfig<any, any, any>, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamer(config, 'async-script-name', parent, false) as StreamTextWithParentReturn<any, any, any, any, 'async-script-name'>;
}

function _createTextStreamer<
	TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig,
	promptType: types.RequiredPromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>,
	isTool = false,
): StreamTextReturn<TConfig, TOOLS, types.RequiredPromptType> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	validateTextLLMConfig(merged, promptType, isTool);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _TextStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.StreamTextConfig<TOOLS, INPUT> & configs.OptionalPromptConfig,
		streamText
	) as unknown as StreamTextReturn<TConfig, TOOLS, types.RequiredPromptType>;
}


export const TextStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText
});