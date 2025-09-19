import { generateText, LanguageModel, ToolSet, ToolCallOptions, ModelMessage } from "ai";

import * as results from '../types/result';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMComponent } from "../llm-component";
import { mergeConfigs, processConfig } from "../config-utils";
import { validateTextLLMConfig } from "../validate";

type CommonConfig = configs.GenerateTextConfig<ToolSet, never, types.AnyPromptSource>;

// The generic return type for a TextGenerator instance.
// It correctly infers the TOOL and INPUT types from the final merged config.
// Parameterize by the concrete promptType literal used by the implementation.
type GenerateTextReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TOOLS extends ToolSet,
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource,
	//temp default value
	TConfigShape extends CommonConfig,
> = LLMCallSignature<TConfig, Promise<results.GenerateTextResultAugmented<TOOLS>>, PType, PROMPT, TConfigShape>;

// Version of the return type for when a parent config is present.
// Ensure the final merged config reflects the concrete promptType at the type level.
type GenerateTextWithParentReturn<
	TConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TParentConfig extends Partial<configs.BaseConfig>, // configs.OptionalPromptConfig
	TOOLS extends ToolSet, //@todo - merge tools
	PARENT_TOOLS extends ToolSet, //@todo - merge tools
	PType extends types.RequiredPromptType,
	PROMPT extends types.AnyPromptSource,
	TConfigShape extends CommonConfig,

	FINAL_TOOLS extends ToolSet = utils.Override<PARENT_TOOLS, TOOLS>,
	TFinalConfig extends configs.BaseConfig = utils.Override<TParentConfig, TConfig>,
> = LLMCallSignature<TFinalConfig, Promise<results.GenerateTextResultAugmented<FINAL_TOOLS>>, PType, PROMPT, TConfigShape>;

// The full shape of a final, merged config object, including required properties.
type FinalTextConfigShape = Partial<configs.GenerateTextConfig<any, any, any> & { model: LanguageModel }>;

// Generic validator for the `config` object passed to a factory function.
type ValidateTextConfig<
	TConfig extends Partial<configs.GenerateTextConfig<any, any, any>>,
	TFinalConfig extends FinalTextConfigShape,
	TShape extends configs.GenerateTextConfig<any, any, any>,
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
	TParentConfig extends Partial<configs.GenerateTextConfig<any, any, any>>,
	TShape extends configs.GenerateTextConfig<any, any, any>,
> =
	// Check for excess properties in the parent validated against TShape
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;

function withText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never, PROMPT>,
	TOOLS extends ToolSet = ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig
>(
	config: TConfig & ValidateTextConfig<
		TConfig, TConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT>
	>
): GenerateTextReturn<TConfig, TOOLS, 'text', PROMPT, TConfigShape>;

function withText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never, PROMPT>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never, PROMPT>>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text', PROMPT, TConfigShape>;

function withText(
	config: any,
	parent?: configs.ConfigProvider<any>
) {
	return _createTextGenerator(config, 'text', parent, false);
}

function withTextAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.ToolConfig<INPUT, string>,
	INPUT extends Record<string, any>,
	TOOLS extends ToolSet = ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'text', PROMPT, TConfigShape> & results.ComponentTool<INPUT, string>;

function withTextAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT, PROMPT> & configs.ToolConfig<INPUT, string>>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	TConfigShape extends CommonConfig = CommonConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.ToolConfig<INPUT, string>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT, PROMPT> & configs.ToolConfig<PARENT_INPUT, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text', PROMPT, TConfigShape> & results.ComponentTool<FINAL_INPUT, string>;

// Implementation
function withTextAsTool(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGeneratorAsTool(config, 'text', parent);
}

function loadsText<
	const TConfig extends configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig,
	TOOLS extends ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, 'text-name', PROMPT, TConfigShape>;

function loadsText<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, never, PROMPT> & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, never, PROMPT> & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name', PROMPT, TConfigShape>;

function loadsText(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGenerator(config, 'text-name', parent, false);
}

function loadsTextAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.LoaderConfig & configs.ToolConfig<INPUT, string>,
	INPUT extends Record<string, any>,
	TOOLS extends ToolSet,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape extends CommonConfig = CommonConfig & configs.LoaderConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'text-name', PROMPT, TConfigShape> & results.ComponentTool<INPUT, string>;

function loadsTextAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT, PROMPT> & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	INPUT extends Record<string, any>,
	TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	TConfigShape extends CommonConfig = CommonConfig & configs.LoaderConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'text-name', PROMPT, TConfigShape> & results.ComponentTool<FINAL_INPUT, string>;

//Implementation
function loadsTextAsTool(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGeneratorAsTool(config, 'text-name', parent);
}

function withTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-template', string, TConfigShape>

function withTemplate<
	const TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>,
	const TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template', string, TConfigShape>

function withTemplate(
	config: any,
	parent?: configs.ConfigProvider<any>,
) {
	return _createTextGenerator(config, 'async-template', parent, false);
}

function withTemplateAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-template', string, CommonConfig & configs.TemplatePromptConfig & configs.ToolConfig<Record<string, any>, string>> & results.ComponentTool<INPUT, string>;

function withTemplateAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template', string, TConfigShape> & results.ComponentTool<FINAL_INPUT, string>;

function withTemplateAsTool(
	config: any,
	parent?: configs.ConfigProvider<any>) {
	return _createTextGeneratorAsTool(config, 'async-template', parent);
}

function loadsTemplate<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-template-name', string, CommonConfig & configs.TemplatePromptConfig & configs.LoaderConfig>;

function loadsTemplate<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name', string, TConfigShape>;

function loadsTemplate(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGenerator(config, 'async-template-name', parent, false);
}

function loadsTemplateAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-template-name', string, CommonConfig & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<Record<string, any>, string>> & results.ComponentTool<INPUT, string>;

function loadsTemplateAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-template-name', string, TConfigShape> & results.ComponentTool<FINAL_INPUT, string>;

function loadsTemplateAsTool(
	config: any,
	parent?: configs.ConfigProvider<any>) {
	return _createTextGeneratorAsTool(config, 'async-template-name', parent);
}

function withScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-script', string, CommonConfig & configs.ScriptPromptConfig>;

function withScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.ScriptPromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script', string, TConfigShape>;

function withScript(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGenerator(config, 'async-script', parent, false);
}

function withScriptAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-script', string, CommonConfig & configs.ScriptPromptConfig & configs.ToolConfig<Record<string, any>, string>> & results.ComponentTool<INPUT, string>;

function withScriptAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.ScriptPromptConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<any, string>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script', string, TConfigShape> & results.ComponentTool<FINAL_INPUT, string>;

function withScriptAsTool(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGeneratorAsTool(config, 'async-script', parent);
}

function loadsScript<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>
): GenerateTextReturn<TConfig, TOOLS, 'async-script-name', string, CommonConfig & configs.ScriptPromptConfig & configs.LoaderConfig>;

function loadsScript<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.ScriptPromptConfig & configs.LoaderConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name', string, TConfigShape>;

function loadsScript(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGenerator(config, 'async-script-name', parent, false);
}

function loadsScriptAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'async-script-name', string, CommonConfig & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<Record<string, any>, string>> & results.ComponentTool<INPUT, string>;

function loadsScriptAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	TConfigShape extends CommonConfig = CommonConfig & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig, configs.GenerateTextConfig<TOOLS, INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'async-script-name', string, TConfigShape> & results.ComponentTool<FINAL_INPUT, string>;

function loadsScriptAsTool(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGeneratorAsTool(config, 'async-script-name', parent);
}

function withFunction<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig,
		configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig>
): GenerateTextReturn<TConfig, TOOLS, 'function', PROMPT, CommonConfig & configs.FunctionPromptConfig>;

function withFunction<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT, PROMPT> & configs.FunctionPromptConfig>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends types.PromptFunction = types.PromptFunction,
	TConfigShape extends CommonConfig = CommonConfig & configs.FunctionPromptConfig
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig,
		configs.GenerateTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'function', PROMPT, TConfigShape>;

function withFunction(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGenerator(config, 'function', parent, false);
}

function withFunctionAsTool<
	const TConfig extends configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, string>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateTextConfig<TConfig, TConfig,
		configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, string>>
): GenerateTextReturn<TConfig, TOOLS, 'function', PROMPT, CommonConfig & configs.FunctionPromptConfig & configs.ToolConfig<Record<string, any>, string>> & results.ComponentTool<INPUT, string>;

function withFunctionAsTool<
	TConfig extends Partial<configs.GenerateTextConfig<TOOLS, INPUT, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, string>>,
	TParentConfig extends Partial<configs.GenerateTextConfig<PARENT_TOOLS, PARENT_INPUT, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<PARENT_INPUT, string>>,
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	PROMPT extends types.PromptFunction = types.PromptFunction,
	TConfigShape extends CommonConfig = CommonConfig & configs.FunctionPromptConfig & configs.ToolConfig<Record<string, any>, string>
>(
	config: TConfig & ValidateTextConfig<TConfig, TFinalConfig,
		configs.GenerateTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<any, string>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTextParentConfig<TParentConfig, configs.GenerateTextConfig<any, any, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<any, string>>>
): GenerateTextWithParentReturn<TConfig, TParentConfig, TOOLS, PARENT_TOOLS, 'function', PROMPT, TConfigShape> & results.ComponentTool<FINAL_INPUT, string>;

function withFunctionAsTool(config: any, parent?: configs.ConfigProvider<any>) {
	return _createTextGeneratorAsTool(config, 'function', parent);
}

function _createTextGenerator<
	TConfig extends CommonConfig, // & configs.OptionalPromptConfig,
	TOOLS extends ToolSet
>(
	config: TConfig,
	promptType: types.RequiredPromptType,
	parent?: configs.ConfigProvider<TConfig>,
	isTool = false,
): GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType, string, CommonConfig> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : processConfig(config)), promptType };

	validateTextLLMConfig(merged, promptType, isTool);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _TextGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMComponent(
		merged as configs.GenerateTextConfig<ToolSet, Record<string, any>> & configs.OptionalPromptConfig,
		generateText
	) as unknown as GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType, string, CommonConfig>;
}

function _createTextGeneratorAsTool<
	TConfig extends CommonConfig & configs.OptionalPromptConfig & { inputSchema: types.SchemaType<Record<string, any>> },
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
>(
	config: TConfig & { description?: string },
	promptType: types.RequiredPromptType,
	parent?: configs.ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType, string, CommonConfig> & results.ComponentTool<INPUT, string> {

	const renderer = _createTextGenerator(config as any, promptType, parent, true) as unknown as
		GenerateTextReturn<TConfig, TOOLS, types.RequiredPromptType, string, CommonConfig> & results.ComponentTool<INPUT, string> & { config: TConfig };
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema;
	renderer.type = 'function'; // Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options contains _toolCallOptions
	renderer.execute = async (args: INPUT, options: ToolCallOptions): Promise<string> => {
		// Merge the _toolCallOptions into the context so templates can access it
		const contextWithToolOptions = { ...args, _toolCallOptions: options };
		return (await (renderer as unknown as (context: INPUT & { _toolCallOptions: ToolCallOptions }) => Promise<results.GenerateTextResult<TOOLS, string>>)(contextWithToolOptions)).text;
	};
	return renderer;
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