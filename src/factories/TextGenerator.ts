import { generateText, LanguageModel, ToolSet, ToolCallOptions, ModelMessage } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateTextLLMConfig } from "../validate";

export type TextGeneratorConfig<TOOLS extends ToolSet, INPUT extends Record<string, any>> = configs.CascadaConfig & configs.GenerateTextConfig<TOOLS, INPUT>;
export type TextGeneratorInstance<TOOLS extends ToolSet, INPUT extends Record<string, any>, PType extends types.RequiredPromptType> = LLMCallSignature<TextGeneratorConfig<TOOLS, INPUT>, Promise<results.GenerateTextResultAugmented<TOOLS>>, PType>;

// The generic return type for a TextGenerator instance.
// It correctly infers the TOOL and INPUT types from the final merged config.
// Parameterize by the concrete promptType literal used by the implementation.
type GenerateTextReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource = string
> = LLMCallSignature<TConfig, Promise<results.GenerateTextResultAugmented<TOOLS>>, PType, PROMPT>;

// Version of the return type for when a parent config is present.
// Ensure the final merged config reflects the concrete promptType at the type level.
type GenerateTextWithParentReturn<
	TConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TParentConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TOOLS extends ToolSet, //@todo - merge tools
	PARENT_TOOLS extends ToolSet, //@todo - merge tools
	PType extends types.RequiredPromptType,

	PROMPT extends types.AnyPromptSource = string,


	FINAL_TOOLS extends ToolSet = utils.Override<PARENT_TOOLS, TOOLS>,
	TFinalConfig extends configs.BaseConfig = utils.Override<TParentConfig, TConfig>,

> = LLMCallSignature<TFinalConfig, Promise<results.GenerateTextResultAugmented<FINAL_TOOLS>>, PType, PROMPT>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.GenerateTextConfig<any, any, any> & { model: LanguageModel }>;

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.GenerateTextConfig<any, any, PROMPT>>,
	TFinalConfig extends FinalTextConfigShape,
	TShape extends configs.GenerateTextConfig<any, any, PROMPT>,
	PROMPT extends types.AnyPromptSource = string,
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
	TParentConfig extends Partial<configs.GenerateTextConfig<any, any, PROMPT>>,
	TShape extends configs.GenerateTextConfig<any, any, PROMPT>,
	PROMPT extends types.AnyPromptSource = string
> =
	// Check for excess properties in the parent validated against TShape
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;

function withText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never, PROMPT>,
	TOOLS extends ToolSet = ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<
		TConfig, TConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT>, PROMPT
	>
): GenerateTextReturn<TConfig, TOOLS, 'text', PROMPT>;

function withText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never, PROMPT>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never, PROMPT>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT>, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT>, PROMPT>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text', PROMPT>;

function withText(
	config: configs.GenerateTextConfig<any, any, any>,
	parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>
) {
	return _createTextGenerator(config, 'text', parent, false) as GenerateTextWithParentReturn<any, any, any, any, 'text'>;
}

function withTextAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.ToolConfig<Record<string, never>, string>,
	TOOLS extends ToolSet = ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.ToolConfig<Record<string, never>, string>, PROMPT>
): GenerateTextReturn<TConfig, TOOLS, 'text', PROMPT> & results.RendererTool<Record<string, never>, string>;

function withTextAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.ToolConfig<Record<string, never>, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never, PROMPT> & configs.ToolConfig<Record<string, never>, string>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.ToolConfig<Record<string, never>, string>, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.ToolConfig<Record<string, never>, string>, PROMPT>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text', PROMPT> & results.RendererTool<Record<string, never>, string>;

// Implementation
function withTextAsTool(config: configs.GenerateTextConfig<any, any, any> & { inputSchema: types.SchemaType<never> }, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'text', parent) as GenerateTextWithParentReturn<any, any, any, any, 'text'> & results.RendererTool<Record<string, never>, string>;
}

function loadsText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig,
	TOOLS extends ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig, PROMPT>
): GenerateTextReturn<TConfig, TOOLS, 'text-name', PROMPT>;

function loadsText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.LoaderConfig, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.LoaderConfig, PROMPT>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name', PROMPT>;

function loadsText(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'text-name', parent, false) as GenerateTextWithParentReturn<any, any, any, any, 'text-name'>;
}

function loadsTextAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>,
	TOOLS extends ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>, PROMPT>
): GenerateTextReturn<TConfig, TOOLS, 'text-name', PROMPT> & results.RendererTool<Record<string, never>, string>;

function loadsTextAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never, PROMPT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, string>, PROMPT>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name', PROMPT> & results.RendererTool<Record<string, never>, string>;

//Implementation
function loadsTextAsTool(config: configs.GenerateTextConfig<any, any, any> & { inputSchema: types.SchemaType<never> }, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'text-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'text-name'> & results.RendererTool<Record<string, never>, string>;
}

function withTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-template'>

function withTemplate<
	const TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>,
	const TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template'>

function withTemplate(
	config: configs.GenerateTextConfig<any, any, any>,
	parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>,
) {
	return _createTextGenerator(config, 'async-template', parent, false) as GenerateTextWithParentReturn<any, any, any, any, 'async-template'>;
}

function withTemplateAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-template'> & results.RendererTool<INPUT, string>;

function withTemplateAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template'> & results.RendererTool<INPUT, string>;

function withTemplateAsTool(
	config: configs.GenerateTextConfig<any, any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>,
	parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>) {
	return _createTextGeneratorAsTool(config, 'async-template', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-template'> & results.RendererTool<any, string>;
}

function loadsTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-template-name'>;

function loadsTemplate<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name'>;

function loadsTemplate(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'async-template-name', parent, false) as GenerateTextWithParentReturn<any, any, any, any, 'async-template-name'>;
}

function loadsTemplateAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-template-name'> & results.RendererTool<INPUT, string>;

function loadsTemplateAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name'> & results.RendererTool<INPUT, string>;

function loadsTemplateAsTool(
	config: configs.GenerateTextConfig<any, any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>,
	parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>) {
	return _createTextGeneratorAsTool(config, 'async-template-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-template-name'> & results.RendererTool<any, string>;
}

function withScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-script'>;

function withScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script'>;

function withScript(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'async-script', parent, false) as GenerateTextWithParentReturn<any, any, any, any, 'async-script'>;
}

function withScriptAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-script'> & results.RendererTool<INPUT, string>;

function withScriptAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script'> & results.RendererTool<INPUT, string>;

function withScriptAsTool(config: configs.GenerateTextConfig<any, any, any> & { inputSchema: types.SchemaType<any> }, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'async-script', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-script'> & results.RendererTool<any, string>;
}

function loadsScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-script-name'>;

function loadsScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name'>;

function loadsScript(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'async-script-name', parent, false) as GenerateTextWithParentReturn<any, any, any, any, 'async-script-name'>;
}

function loadsScriptAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-script-name'> & results.RendererTool<INPUT, string>;

function loadsScriptAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name'> & results.RendererTool<INPUT, string>;

function loadsScriptAsTool(config: configs.GenerateTextConfig<any, any, any> & { inputSchema: types.SchemaType<any> }, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'async-script-name', parent) as GenerateTextWithParentReturn<any, any, any, any, 'async-script-name'> & results.RendererTool<any, string>;
}

function withFunction<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig,
		configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig, PROMPT>
): GenerateTextReturn<TConfig, TOOLS, 'function', PROMPT>;

function withFunction<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT, PROMPT> & configs.FunctionPromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig,
		configs.GenerateTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig, PROMPT>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'function', PROMPT>;

function withFunction(config: configs.GenerateTextConfig<any, any, any>, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGenerator(config, 'function', parent, false) as GenerateTextWithParentReturn<any, any, any, any, 'function'>;
}

function withFunctionAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig,
		configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, string>, PROMPT>
): GenerateTextReturn<TConfig, TOOLS, 'function', PROMPT> & results.RendererTool<INPUT, string>;

function withFunctionAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.FunctionPromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig,
		configs.GenerateTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<any, string>, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any> & configs.FunctionPromptConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'function', PROMPT> & results.RendererTool<INPUT, string>;

function withFunctionAsTool(config: configs.GenerateTextConfig<any, any, any> & { inputSchema: types.SchemaType<any> }, parent?: ConfigProvider<configs.GenerateTextConfig<any, any, any>>) {
	return _createTextGeneratorAsTool(config, 'function', parent) as GenerateTextWithParentReturn<any, any, any, any, 'function'> & results.RendererTool<any, string>;
}

function _createTextGenerator<
	TConfig extends configs.GenerateTextConfig<TOOLS, INPUT>, // & configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig,
	promptType: types.RequiredPromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>,
	isTool = false,
): GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	validateTextLLMConfig(merged, promptType, isTool);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _TextGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.GenerateTextConfig<TOOLS, INPUT> & configs.OptionalPromptConfig,
		generateText
	) as unknown as GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType>;
}

function _createTextGeneratorAsTool<
	TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.OptionalPromptConfig & { inputSchema: types.SchemaType<INPUT> },
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & { description?: string },
	promptType: types.RequiredPromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType> & results.RendererTool<INPUT, string> {

	const renderer = _createTextGenerator(config as any, promptType, parent, true) as unknown as
		GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType> & results.RendererTool<INPUT, string> & { config: TConfig };
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema;
	renderer.type = 'function'; // Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options contains _toolCallOptions
	renderer.execute = async (args: INPUT, options: ToolCallOptions): Promise<string> => {
		// Merge the _toolCallOptions into the context so templates can access it
		const contextWithToolOptions = { ...args, _toolCallOptions: options };
		return (await (renderer as unknown as (context: INPUT & { _toolCallOptions: ToolCallOptions }) => Promise<results.GenerateTextResult<TOOLS, string>>)(contextWithToolOptions)).text;
	};
	return renderer as (typeof renderer & GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType>);
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
	withFunction: Object.assign(withFunction, {
		asTool: withFunctionAsTool,
	}),
	asTool: withTextAsTool
});