import { streamObject, LanguageModel, ModelMessage } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { ValidateObjectConfig, ValidateObjectParentConfig } from "./ObjectGenerator";

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateObjectLLMConfig } from "../validate";


export type LLMStreamerConfig<
	INPUT extends Record<string, any>,
	OUTPUT,
	PROMPT extends types.AnyPromptSource = string
> = (
	| configs.StreamObjectObjectConfig<INPUT, OUTPUT, PROMPT>
	| configs.StreamObjectArrayConfig<INPUT, OUTPUT, PROMPT>
	| configs.StreamObjectNoSchemaConfig<INPUT, PROMPT>
) & configs.OptionalPromptConfig;

export type ObjectStreamerInstance<
	TConfig extends LLMStreamerConfig<INPUT, OUTPUT>,
	PType extends types.RequiredPromptType,
	INPUT extends Record<string, any>,
	OUTPUT,

> = LLMCallSignature<TConfig, Promise<results.StreamObjectResultAll<OUTPUT>>, PType>;

type StreamObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT extends types.AnyPromptSource = string
> =
	configs.StreamObjectObjectConfig<INPUT, OUTPUT, PROMPT> |
	configs.StreamObjectArrayConfig<INPUT, OUTPUT, PROMPT> |
	configs.StreamObjectNoSchemaConfig<INPUT, PROMPT>;

// Parameterize return types by concrete promptType literal used by implementation
type StreamObjectReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PROMPT extends types.AnyPromptSource = string
> =
	TConfig extends { output: 'array', schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType, PROMPT>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>, PType, PROMPT>
	: TConfig extends { output?: 'object' | undefined, schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType, PROMPT>
	: `Config Error: Object output requires a schema`;

// With parent
type StreamObjectWithParentReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PARENT_OUTPUT, //@out
	PROMPT extends types.AnyPromptSource = string,
	TFinalConfig = utils.Override<TParentConfig, TConfig>
> =
	StreamObjectReturn<
		TFinalConfig & configs.BaseConfig, // & configs.OptionalPromptConfig,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT, //@out
		PROMPT
	>

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.StreamObjectArrayConfig<any, any>;
	'no-schema': configs.StreamObjectNoSchemaConfig<any>;
	object: configs.StreamObjectObjectConfig<any, any>;
}

interface AllSpecializedProperties { output?: ConfigOutput, schema?: types.SchemaType<any>, model?: LanguageModel }

type ConfigOutput = keyof ConfigShapeMap | undefined;
//type ConfigOutput = 'array' | 'no-schema' | 'object' | undefined;

// A text-only prompt has no inputs
function withText<
	TConfig extends StreamObjectConfig<never, OUTPUT, PROMPT>,
	OUTPUT, //@out
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig>,
): StreamObjectReturn<TConfig, 'text', OUTPUT, PROMPT>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT, PROMPT>>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT, PROMPT>>,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig>>,
): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, PARENT_OUTPUT, PROMPT>

// Implementation signature that handles both cases
function withText<
	TConfig extends StreamObjectConfig<never, OUTPUT>,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT>,
	OUTPUT,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text', OUTPUT> {
	return _createObjectStreamer(config as StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig, 'text',
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>, false
	) as unknown as StreamObjectReturn<TConfig, 'text', OUTPUT>
}

function loadsText<
	const TConfig extends StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig,
	OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'text-name', OUTPUT, PROMPT>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT, PROMPT> & configs.LoaderConfig>,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig>>,

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, PARENT_OUTPUT, PROMPT>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT, PROMPT> & configs.LoaderConfig,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text-name', OUTPUT> {
	return _createObjectStreamer(
		config,
		'text-name',
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>, false
	) as unknown as StreamObjectReturn<TConfig, 'text-name', OUTPUT>;
}

function withTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig, configs.TemplatePromptConfig>,
): StreamObjectReturn<TConfig, 'async-template', OUTPUT>;

// Overload 2: With parent parameter
function withTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & configs.TemplatePromptConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function withTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> {
	return _createObjectStreamer(config, 'async-template', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-template', OUTPUT>;
}

function loadsTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'async-template-name', OUTPUT>;

// Overload 2: With parent parameter
function loadsTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function loadsTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-template-name', OUTPUT> {
	return _createObjectStreamer(config, 'async-template-name', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-template-name', OUTPUT>;
}

function withScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig>,
): StreamObjectReturn<TConfig, 'async-script', OUTPUT>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function withScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-script', OUTPUT> {
	return _createObjectStreamer(config, 'async-script', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-script', OUTPUT>;
}

function loadsScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'async-script-name', OUTPUT>;

// Overload 2: With parent parameter
function loadsScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function loadsScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-script-name', OUTPUT> {
	return _createObjectStreamer(config, 'async-script-name', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-script-name', OUTPUT>;
}

function withFunction<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT, PROMPT> & configs.FunctionPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.FunctionPromptConfig>,
): StreamObjectReturn<TConfig, 'async-script', OUTPUT, PROMPT>;

// Overload 2: With parent parameter
function withFunction<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT, PROMPT> & configs.FunctionPromptConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PROMPT> & configs.FunctionPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>, //@todo we need just the correct output type
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.FunctionPromptConfig, PROMPT>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.FunctionPromptConfig>>,

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, PARENT_OUTPUT, PROMPT>;

// Implementation signature that handles both cases
function withFunction<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT, PROMPT> & configs.FunctionPromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PROMPT> & configs.FunctionPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-script', OUTPUT, PROMPT> {
	return _createObjectStreamer(config, 'async-script', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-script', OUTPUT, PROMPT>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends configs.StreamObjectBaseConfig<INPUT, PROMPT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PROMPT extends types.AnyPromptSource
>(
	config: TConfig,
	promptType: types.PromptType,
	parent?: ConfigProvider<configs.BaseConfig>,
	isTool = false,
): StreamObjectReturn<TConfig, 'async-template', OUTPUT, PROMPT> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as unknown as configs.StreamObjectObjectConfig<any, any>).output === undefined) {
		(merged as unknown as configs.StreamObjectObjectConfig<any, any>).output = 'object';
	}

	validateObjectLLMConfig(merged, promptType, isTool, false); // isStreamer = false

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: types.SchemaType<any> },
		streamObject as (config: configs.OptionalPromptConfig) => any
	) as unknown as StreamObjectReturn<TConfig, 'async-template', OUTPUT, PROMPT>;
}

export const ObjectStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
	withFunction
});