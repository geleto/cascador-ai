import { streamText, LanguageModel, ToolSet, ModelMessage } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMRenderer } from "../llm-renderer";
import { mergeConfigs, processConfig } from "../config-utils";
import { validateTextLLMConfig } from "../validate";

type CommonConfig = configs.StreamTextConfig<ToolSet, never, types.AnyPromptSource>;

// The generic return type for a TextStreamer instance.
// It correctly infers the TOOL and INPUT types from the final merged config.
// Parameterize by the concrete promptType literal used by the implementation.
// Plain inline text prompts return the stream object without the promise as they don't render the prompt
type StreamTextReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource,
	TConfigShape extends CommonConfig,
	IsAsync extends boolean = false
> = LLMCallSignature<TConfig, utils.ConditionalPromise<results.StreamTextResultAugmented<TOOLS>, IsAsync>, PType, PROMPT, TConfigShape>;

type StreamTextPromiseReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource,
	TConfigShape extends CommonConfig,
> = StreamTextReturn<TConfig, TOOLS, PType, PROMPT, TConfigShape, true>;

// Version of the return type for when a parent config is present.
// Ensure the final merged config reflects the concrete promptType at the type level.
// Plain inline text prompts return the stream object without the promise as they don't render the prompt
type StreamTextWithParentReturn<
	TConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TParentConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TOOLS extends ToolSet, //@todo - merge tools
	PARENT_TOOLS extends ToolSet, //@todo - merge tools
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource,
	TConfigShape extends CommonConfig,
	FINAL_TOOLS extends ToolSet = utils.Override<PARENT_TOOLS, TOOLS>,
	TFinalConfig extends configs.BaseConfig = utils.Override<TParentConfig, TConfig>,
	IsAsync extends boolean = false
> = LLMCallSignature<TFinalConfig, utils.ConditionalPromise<results.StreamTextResultAugmented<FINAL_TOOLS>, IsAsync>, PType, PROMPT, TConfigShape>;

type StreamTextWithParentPromiseReturn<
	TConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TParentConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TOOLS extends ToolSet, //@todo - merge tools
	PARENT_TOOLS extends ToolSet, //@todo - merge tools
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource,
	TConfigShape extends CommonConfig,
	FINAL_TOOLS extends ToolSet = utils.Override<PARENT_TOOLS, TOOLS>,
	TFinalConfig extends configs.BaseConfig = utils.Override<TParentConfig, TConfig>
> = StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, PType, PROMPT, TConfigShape, FINAL_TOOLS, TFinalConfig, true>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.StreamTextConfig<any, any, any> & { model: LanguageModel }>;

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.StreamTextConfig<any, any, any>>,
	TFinalConfig extends FinalTextConfigShape,
	TShape extends configs.StreamTextConfig<any, any, any>,
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
	: `Config Error: Unknown properties for this streamer type: '${keyof Omit<TConfig, keyof TShape> & string}'`;


// Generic validator for the `parent` config object.
type ValidateTextParentConfig<
	TParentConfig extends Partial<configs.StreamTextConfig<any, any, any>>,
	TShape extends configs.StreamTextConfig<any, any, any>,
> =
	// Check for excess properties in the parent validated against TShape
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final streamer type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;

function withText<
	const TConfig extends configs.StreamTextConfig<TOOLS, never, PROMPT>,
	TOOLS extends ToolSet = ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig
>(
	config: TConfig & ValidateTextConfig<
		TConfig, TConfig, configs.StreamTextConfig<TOOLS, never, PROMPT>
	>
): StreamTextReturn<TConfig, TOOLS, 'text', PROMPT, TConfigShape>;

function withText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never, PROMPT>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never, PROMPT>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<TOOLS, never, PROMPT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<TOOLS, never, PROMPT>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text', PROMPT, TConfigShape>;

function withText(
	config: any,
	parent?: configs.ConfigProvider<any>
) {
	return _createTextStreamer(config, 'text', parent, false);
}

function loadsText<
	const TConfig extends configs.StreamTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig,
	TOOLS extends ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig>
): StreamTextPromiseReturn<TConfig, TOOLS, 'text-name', PROMPT, TConfigShape>;

function loadsText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, never, PROMPT> & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, never, PROMPT> & configs.LoaderConfig>>
): StreamTextWithParentPromiseReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name', PROMPT, TConfigShape>;

function loadsText(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextStreamer(config, 'text-name', parent, false);
}

function withTemplate<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>
): StreamTextPromiseReturn<TConfig, TOOLS, 'async-template', string, TConfigShape>

function withTemplate<
	const TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>,
	const TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>>
): StreamTextWithParentPromiseReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template', string, TConfigShape>

function withTemplate(
	config: any,
	parent?: configs.ConfigProvider<any>,
) {
	return _createTextStreamer(config, 'async-template', parent, false);
}

function loadsTemplate<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>
): StreamTextPromiseReturn<TConfig, TOOLS, 'async-template-name', string, CommonConfig & configs.TemplatePromptConfig & configs.LoaderConfig>;

function loadsTemplate<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>>
): StreamTextWithParentPromiseReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name', string, TConfigShape>;

function loadsTemplate(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextStreamer(config, 'async-template-name', parent, false);
}

function withScript<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>
): StreamTextPromiseReturn<TConfig, TOOLS, 'async-script', string, CommonConfig & configs.ScriptPromptConfig>;

function withScript<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.ScriptPromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig>>
): StreamTextWithParentPromiseReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script', string, TConfigShape>;

function withScript(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextStreamer(config, 'async-script', parent, false);
}

function loadsScript<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>
): StreamTextPromiseReturn<TConfig, TOOLS, 'async-script-name', string, CommonConfig & configs.ScriptPromptConfig & configs.LoaderConfig>;

function loadsScript<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.ScriptPromptConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>>
): StreamTextWithParentPromiseReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name', string, TConfigShape>;

function loadsScript(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextStreamer(config, 'async-script-name', parent, false);
}

function withFunction<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig,
		configs.StreamTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig>
): StreamTextPromiseReturn<TConfig, TOOLS, 'function', PROMPT, CommonConfig & configs.FunctionPromptConfig>;

function withFunction<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT, PROMPT> & configs.FunctionPromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends types.PromptFunction = types.PromptFunction,
	TConfigShape extends CommonConfig = CommonConfig & configs.FunctionPromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig,
		configs.StreamTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig>>
): StreamTextWithParentPromiseReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'function', PROMPT, TConfigShape>;

function withFunction(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextStreamer(config, 'function', parent, false);
}

function _createTextStreamer<
	TConfig extends CommonConfig, // & configs.OptionalPromptConfig,
	TOOLS extends ToolSet
>(
	config: TConfig,
	promptType: types.RequiredPromptType,
	parent?: configs.ConfigProvider<TConfig>,
	isTool = false,
): StreamTextPromiseReturn<TConfig, TOOLS, types.RequiredPromptType, string, CommonConfig> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : processConfig(config)), promptType };

	validateTextLLMConfig(merged, promptType, isTool);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _TextStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.StreamTextConfig<ToolSet, Record<string, any>> & configs.OptionalPromptConfig,
		streamText
	) as unknown as StreamTextPromiseReturn<TConfig, TOOLS, types.RequiredPromptType, string, CommonConfig>;
}

export const TextStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
	withFunction
});