import { streamText, LanguageModel, ToolSet, ToolCallOptions } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, ConfigError } from "../validate";

export type TextStreamerConfig<TOOLS extends ToolSet, INPUT extends Record<string, any>> = configs.CascadaConfig & configs.StreamTextConfig<TOOLS, INPUT>;
export type TextStreamerInstance<TOOLS extends ToolSet, INPUT extends Record<string, any>, PType extends types.RequiredPromptType> = LLMCallSignature<TextStreamerConfig<TOOLS, INPUT>, Promise<results.StreamTextResultAugmented<TOOLS>>, PType>;

// The generic return type for a TextStreamer instance.
// It correctly infers the TOOL and INPUT types from the final merged config.
// Parameterize by the concrete promptType literal used by the implementation.
type StreamTextReturn<
	TConfig extends configs.OptionalPromptConfig & configs.BaseConfig,
	TOOLS extends ToolSet,
	PType extends types.RequiredPromptType
> = LLMCallSignature<TConfig, Promise<results.StreamTextResultAugmented<TOOLS>>, PType>;

// Version of the return type for when a parent config is present.
// Ensure the final merged config reflects the concrete promptType at the type level.
type StreamTextWithParentReturn<
	TConfig extends Partial<configs.OptionalPromptConfig & configs.BaseConfig>,
	TParentConfig extends Partial<configs.OptionalPromptConfig & configs.BaseConfig>,
	TOOLS extends ToolSet, //@todo - merge tools
	PARENT_TOOLS extends ToolSet, //@todo - merge tools
	PType extends types.RequiredPromptType,
	FINAL_TOOLS extends ToolSet = utils.Override<PARENT_TOOLS, TOOLS>,
	TFinalConfig extends configs.BaseConfig = utils.Override<TParentConfig, TConfig>
> = LLMCallSignature<TFinalConfig, Promise<results.StreamTextResultAugmented<FINAL_TOOLS>>, PType>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.StreamTextConfig<any, any, any> & { model: LanguageModel }>;

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.StreamTextConfig<any, any>>,
	TFinalConfig extends FinalTextConfigShape,
	TShape extends configs.StreamTextConfig<any, any>,
	TRequired =
	& (TShape extends { inputSchema: any } ? { inputSchema: any, model: LanguageModel } : { model: LanguageModel })
	& (TShape extends { loader: any } ? { loader: any, model: LanguageModel } : { model: LanguageModel })
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
	TParentConfig extends Partial<configs.StreamTextConfig<any, any>>,
	TShape extends configs.StreamTextConfig<any, any>
> =
	// Check for excess properties in the parent validated against TShape
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;

function withText<
	const TConfig extends configs.StreamTextConfig<TOOLS, never>,
	TOOLS extends ToolSet = ToolSet,
>(
	config: TConfig & ValidateTextConfig<
		TConfig, TConfig, configs.StreamTextConfig<TOOLS, never>
	>
): StreamTextReturn<TConfig, TOOLS, 'text'>;

function withText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<TOOLS, never>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<TOOLS, never>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text'>;

function withText(
	config: configs.StreamTextConfig<any, any, any>,
	parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>
) {
	return _createTextStreamer(config, 'text', parent) as StreamTextWithParentReturn<any, any, any, any, 'text'>;
}

function withTextAsTool<
	const TConfig extends configs.StreamTextConfig<TOOLS, never> & configs.ToolConfig<Record<string, never>, string>,
	TOOLS extends ToolSet = ToolSet,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, never> & configs.ToolConfig<Record<string, never>, string>>
): StreamTextReturn<TConfig, TOOLS, 'text'> & results.RendererTool<Record<string, never>, string>;

function withTextAsTool<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never> & configs.ToolConfig<Record<string, never>, string>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never> & configs.ToolConfig<Record<string, never>, string>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, never> & configs.ToolConfig<Record<string, never>, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, never> & configs.ToolConfig<Record<string, never>, string>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text'> & results.RendererTool<Record<string, never>, string>;

function withTextAsTool(config: configs.StreamTextConfig<any, any, any> & { inputSchema: types.SchemaType<never> }, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamerAsTool(config, 'text', parent) as StreamTextWithParentReturn<any, any, any, any, 'text'> & results.RendererTool<Record<string, never>, string>;
}

function loadsText<
	const TConfig extends configs.StreamTextConfig<TOOLS, never> & configs.LoaderConfig,
	TOOLS extends ToolSet,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, never> & configs.LoaderConfig>
): StreamTextReturn<TConfig, TOOLS, 'text-name'>;

function loadsText<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never> & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, never> & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, never> & configs.LoaderConfig>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name'>;

function loadsText(config: configs.StreamTextConfig<any, any, any>, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamer(config, 'text-name', parent) as StreamTextWithParentReturn<any, any, any, any, 'text-name'>;
}

function loadsTextAsTool<
	const TConfig extends configs.StreamTextConfig<TOOLS, never> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>,
	TOOLS extends ToolSet,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, never> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>>
): StreamTextReturn<TConfig, TOOLS, 'text-name'> & results.RendererTool<Record<string, never>, string>;

function loadsTextAsTool<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, never> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, never> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, never> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, never> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name'> & results.RendererTool<Record<string, never>, string>;

function loadsTextAsTool(config: configs.StreamTextConfig<any, any, any> & { inputSchema: types.SchemaType<never> }, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamerAsTool(config, 'text-name', parent) as StreamTextWithParentReturn<any, any, any, any, 'text-name'> & results.RendererTool<Record<string, never>, string>;
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
	return _createTextStreamer(config, 'async-template', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-template'>;
}

function withTemplateAsTool<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>>
): StreamTextReturn<TConfig, TOOLS, 'async-template'> & results.RendererTool<INPUT, string>;

function withTemplateAsTool<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template'> & results.RendererTool<INPUT, string>;

function withTemplateAsTool(
	config: configs.StreamTextConfig<any, any, any> & configs.TemplatePromptConfig<any> & configs.ToolConfig<any, string>,
	parent?: ConfigProvider<configs.StreamTextConfig<any, any, any> & configs.TemplatePromptConfig<any> & configs.ToolConfig<any, string>>) {
	return _createTextStreamerAsTool(config, 'async-template', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-template'> & results.RendererTool<any, string>;
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
	return _createTextStreamer(config, 'async-template-name', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-template-name'>;
}

function loadsTemplateAsTool<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>
): StreamTextReturn<TConfig, TOOLS, 'async-template-name'> & results.RendererTool<INPUT, string>;

function loadsTemplateAsTool<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name'> & results.RendererTool<INPUT, string>;

function loadsTemplateAsTool(
	config: configs.StreamTextConfig<any, any, any> & configs.TemplatePromptConfig<any> & configs.ToolConfig<any, string>,
	parent?: ConfigProvider<configs.StreamTextConfig<any, any, any> & configs.TemplatePromptConfig<any> & configs.ToolConfig<any, string>>) {
	return _createTextStreamerAsTool(config, 'async-template-name', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-template-name'> & results.RendererTool<any, string>;
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
	return _createTextStreamer(config, 'async-script', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-script'>;
}

function withScriptAsTool<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>>
): StreamTextReturn<TConfig, TOOLS, 'async-script'> & results.RendererTool<INPUT, string>;

function withScriptAsTool<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig & configs.ToolConfig<any, string>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script'> & results.RendererTool<INPUT, string>;

function withScriptAsTool(config: configs.StreamTextConfig<any, any, any> & { inputSchema: types.SchemaType<any> }, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamerAsTool(config, 'async-script', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-script'> & results.RendererTool<any, string>;
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
	return _createTextStreamer(config, 'async-script-name', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-script-name'>;
}

function loadsScriptAsTool<
	const TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>
): StreamTextReturn<TConfig, TOOLS, 'async-script-name'> & results.RendererTool<INPUT, string>;

function loadsScriptAsTool<
	TConfig extends Partial<configs.StreamTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.StreamTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.StreamTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>>
): StreamTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name'> & results.RendererTool<INPUT, string>;

function loadsScriptAsTool(config: configs.StreamTextConfig<any, any, any> & { inputSchema: types.SchemaType<any> }, parent?: ConfigProvider<configs.StreamTextConfig<any, any, any>>) {
	return _createTextStreamerAsTool(config, 'async-script-name', parent) as StreamTextWithParentReturn<any, any, any, any, 'async-script-name'> & results.RendererTool<any, string>;
}

function _createTextStreamer<
	TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig,
	promptType: types.RequiredPromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): StreamTextReturn<TConfig, TOOLS, types.RequiredPromptType> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	validateBaseConfig(merged);
	if (!('model' in merged) || !merged.model) {
		// This runtime check backs up the static type check.
		throw new ConfigError("TextStreamer config requires a 'model' property.");
	}

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _TextStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string },
		streamText
	) as unknown as StreamTextReturn<TConfig, TOOLS, types.RequiredPromptType>;
}

function _createTextStreamerAsTool<
	TConfig extends configs.StreamTextConfig<TOOLS, INPUT> & configs.OptionalPromptConfig & { inputSchema: types.SchemaType<INPUT> },
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & { description?: string },
	promptType: types.RequiredPromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): StreamTextReturn<TConfig, TOOLS, types.RequiredPromptType> & results.RendererTool<INPUT, string> {

	const renderer = _createTextStreamer(config as any, promptType, parent) as unknown as
		StreamTextReturn<TConfig, TOOLS, types.RequiredPromptType> & results.RendererTool<INPUT, string> & { config: TConfig };
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema;
	renderer.type = 'function'; // Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options is not used
	renderer.execute = renderer as unknown as (args: any, options: ToolCallOptions) => PromiseLike<any>;
	return renderer as (typeof renderer & StreamTextReturn<TConfig, TOOLS, types.RequiredPromptType>);
}

export const TextStreamer = Object.assign(withText, { // default is withText
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
	asTool: withTextAsTool
});