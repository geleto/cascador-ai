import { streamObject, LanguageModel, ModelMessage } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { ValidateObjectConfig, ValidateObjectParentConfig } from "./ObjectGenerator";

import { LLMCallSignature, _createLLMComponent } from "../llm-component";
import { mergeConfigs, processConfig } from "../config-utils";
import { validateObjectLLMConfig } from "../validate";

type StreamObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT extends types.AnyPromptSource = string
> =
	configs.StreamObjectObjectConfig<INPUT, OUTPUT, PROMPT> |
	configs.StreamObjectArrayConfig<INPUT, OUTPUT, PROMPT> |
	configs.StreamObjectNoSchemaConfig<INPUT, PROMPT>;


type CommonStreamObjectObjectConfig = configs.StreamObjectObjectConfig<Record<string, any>, any, types.AnyPromptSource>;
type CommonStreamObjectArrayConfig = configs.StreamObjectArrayConfig<Record<string, any>, any, types.AnyPromptSource>;
type CommonStreamObjectNoSchemaConfig = configs.StreamObjectNoSchemaConfig<Record<string, any>, types.AnyPromptSource>;

type ShapeOf<TConfig> =
	TConfig extends { output: 'array' }
	? CommonStreamObjectArrayConfig
	: TConfig extends { output: 'no-schema' }
	? CommonStreamObjectNoSchemaConfig
	: CommonStreamObjectObjectConfig;

// Parameterize return types by concrete promptType literal used by implementation
// Plain text prompts return the stream object without the promise as they don't render the prompt
type StreamObjectReturn<
	TConfig extends configs.BaseConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PROMPT extends types.AnyPromptSource,
	TConfigShape,
	IsAsync extends boolean = false
> =
	TConfig extends { output: 'array', schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, utils.ConditionalPromise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>, IsAsync>, PType, PROMPT, TConfigShape>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, utils.ConditionalPromise<results.StreamObjectNoSchemaResult, IsAsync>, PType, PROMPT, TConfigShape>
	: TConfig extends { output?: 'object' | undefined, schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, utils.ConditionalPromise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>, IsAsync>, PType, PROMPT, TConfigShape>
	: `Config Error: Object output requires a schema`;

type StreamObjectPromiseReturn<
	TConfig extends configs.BaseConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PROMPT extends types.AnyPromptSource,
	TConfigShape,
> =
	StreamObjectReturn<TConfig, PType, OUTPUT, PROMPT, TConfigShape, true>;



// With parent
// Plain text prompts return the stream object without the promise as they don't render the prompt
type StreamObjectWithParentReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PARENT_OUTPUT, //@out
	PROMPT extends types.AnyPromptSource,
	TConfigShape,
	TFinalConfig = utils.Override<TParentConfig, TConfig>,
> =
	StreamObjectReturn<
		TFinalConfig & configs.BaseConfig, // & configs.OptionalPromptConfig,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT, //@out
		PROMPT,
		TConfigShape
	>

type StreamObjectWithParentPromiseReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PARENT_OUTPUT, //@out
	PROMPT extends types.AnyPromptSource,
	TConfigShape,
	TFinalConfig = utils.Override<TParentConfig, TConfig>
> =
	StreamObjectPromiseReturn<
		TFinalConfig & configs.BaseConfig, // & configs.OptionalPromptConfig,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT, //@out
		PROMPT,
		TConfigShape
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
	TConfigShape = ShapeOf<TConfig>,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig>,
): StreamObjectReturn<TConfig, 'text', OUTPUT, PROMPT, TConfigShape>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT, PROMPT>>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT, PROMPT>>,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape = ShapeOf<TConfig>,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig>>,
): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, PARENT_OUTPUT, PROMPT, TConfigShape>

// Implementation signature that handles both cases
function withText<
	TConfig extends StreamObjectConfig<never, OUTPUT>,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT>,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape = ShapeOf<TConfig>,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text', OUTPUT, PROMPT, TConfigShape> {
	return _createObjectStreamer(config as StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig, 'text',
		parent as configs.ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>, false
	) as unknown as StreamObjectReturn<TConfig, 'text', OUTPUT, PROMPT, TConfigShape>
}

function loadsText<
	const TConfig extends StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig,
	OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape = ShapeOf<TConfig> & configs.LoaderConfig,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig>,
): StreamObjectPromiseReturn<TConfig, 'text-name', OUTPUT, PROMPT, TConfigShape>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT, PROMPT> & configs.LoaderConfig>,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape = ShapeOf<TConfig> & configs.LoaderConfig,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig>>,

): StreamObjectWithParentPromiseReturn<TConfig, TParentConfig, 'text-name', OUTPUT, PARENT_OUTPUT, PROMPT, TConfigShape>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT, PROMPT> & configs.LoaderConfig,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	TConfigShape = ShapeOf<TConfig> & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): StreamObjectPromiseReturn<TConfig, 'text-name', OUTPUT, PROMPT, TConfigShape> {
	return _createObjectStreamer(
		config,
		'text-name',
		parent as configs.ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>, false
	) as unknown as StreamObjectPromiseReturn<TConfig, 'text-name', OUTPUT, PROMPT, TConfigShape>;
}

function withTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.TemplatePromptConfig,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig, configs.TemplatePromptConfig>,
): StreamObjectPromiseReturn<TConfig, 'async-template', OUTPUT, string, TConfigShape>;

// Overload 2: With parent parameter
function withTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & configs.TemplatePromptConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TConfigShape = ShapeOf<TConfig> & configs.TemplatePromptConfig,
	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig>>

): StreamObjectWithParentPromiseReturn<TConfig, TParentConfig, 'async-template', OUTPUT, PARENT_OUTPUT, string, TConfigShape>;

// Implementation signature that handles both cases
function withTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.TemplatePromptConfig,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): StreamObjectPromiseReturn<TConfig, 'async-template', OUTPUT, string, TConfigShape> {
	return _createObjectStreamer(config, 'async-template', parent, false) as unknown as StreamObjectPromiseReturn<TConfig, 'async-template', OUTPUT, string, TConfigShape>;
}

function loadsTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.TemplatePromptConfig & configs.LoaderConfig,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
): StreamObjectPromiseReturn<TConfig, 'async-template-name', OUTPUT, string, TConfigShape>;

// Overload 2: With parent parameter
function loadsTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TConfigShape = ShapeOf<TConfig> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>>

): StreamObjectWithParentPromiseReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, PARENT_OUTPUT, string, TConfigShape>;

// Implementation signature that handles both cases
function loadsTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.TemplatePromptConfig & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): StreamObjectPromiseReturn<TConfig, 'async-template-name', OUTPUT, string, TConfigShape> {
	return _createObjectStreamer(config, 'async-template-name', parent, false) as unknown as StreamObjectPromiseReturn<TConfig, 'async-template-name', OUTPUT, string, TConfigShape>;
}

function withScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.ScriptPromptConfig,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig>,
): StreamObjectPromiseReturn<TConfig, 'async-script', OUTPUT, string, TConfigShape>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.ScriptPromptConfig,
	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig>>

): StreamObjectWithParentPromiseReturn<TConfig, TParentConfig, 'async-script', OUTPUT, PARENT_OUTPUT, string, TConfigShape>;

// Implementation signature that handles both cases
function withScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.ScriptPromptConfig,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): StreamObjectPromiseReturn<TConfig, 'async-script', OUTPUT, string, TConfigShape> {
	return _createObjectStreamer(config, 'async-script', parent, false) as unknown as StreamObjectPromiseReturn<TConfig, 'async-script', OUTPUT, string, TConfigShape>;
}

function loadsScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.ScriptPromptConfig & configs.LoaderConfig,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
): StreamObjectPromiseReturn<TConfig, 'async-script-name', OUTPUT, string, TConfigShape>;

// Overload 2: With parent parameter
function loadsScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TConfigShape = ShapeOf<TConfig> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>>

): StreamObjectWithParentPromiseReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, PARENT_OUTPUT, string, TConfigShape>;

// Implementation signature that handles both cases
function loadsScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TConfigShape = ShapeOf<TConfig> & configs.ScriptPromptConfig & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): StreamObjectPromiseReturn<TConfig, 'async-script-name', OUTPUT, string, TConfigShape> {
	return _createObjectStreamer(config, 'async-script-name', parent, false) as unknown as StreamObjectPromiseReturn<TConfig, 'async-script-name', OUTPUT, string, TConfigShape>;
}

function withFunction<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT, PROMPT> & configs.FunctionPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PROMPT extends types.PromptFunction = types.PromptFunction,
	TConfigShape = ShapeOf<TConfig> & configs.FunctionPromptConfig,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.FunctionPromptConfig>,
): StreamObjectPromiseReturn<TConfig, 'function', OUTPUT, PROMPT, TConfigShape>;

// Overload 2: With parent parameter
function withFunction<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT, PROMPT> & configs.FunctionPromptConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PROMPT> & configs.FunctionPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>, //@todo we need just the correct output type
	PROMPT extends types.PromptFunction = types.PromptFunction,
	TConfigShape = ShapeOf<TConfig> & configs.FunctionPromptConfig,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.FunctionPromptConfig, PROMPT>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.FunctionPromptConfig>>,

): StreamObjectWithParentPromiseReturn<TConfig, TParentConfig, 'function', OUTPUT, PARENT_OUTPUT, PROMPT, TConfigShape>;

// Implementation signature that handles both cases
function withFunction<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT, PROMPT> & configs.FunctionPromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PROMPT> & configs.FunctionPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PROMPT extends types.PromptFunction = types.PromptFunction,
	TConfigShape = ShapeOf<TConfig> & configs.FunctionPromptConfig,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): StreamObjectPromiseReturn<TConfig, 'function', OUTPUT, PROMPT, TConfigShape> {
	return _createObjectStreamer(config, 'function', parent, false) as unknown as StreamObjectPromiseReturn<TConfig, 'function', OUTPUT, PROMPT, TConfigShape>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends configs.StreamObjectBaseConfig<INPUT, PROMPT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PROMPT extends types.AnyPromptSource,
	TConfigShape = ShapeOf<TConfig>
>(
	config: TConfig,
	promptType: types.PromptType,
	parent?: configs.ConfigProvider<configs.BaseConfig>,
	isTool = false,
): StreamObjectPromiseReturn<TConfig, 'async-template', OUTPUT, PROMPT, TConfigShape> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : processConfig(config)), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in validation).
	if ((merged as unknown as configs.StreamObjectObjectConfig<any, any>).output === undefined) {
		(merged as unknown as configs.StreamObjectObjectConfig<any, any>).output = 'object';
	}

	validateObjectLLMConfig(merged, promptType, isTool, true); // isStreamer = true

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMComponent(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: types.SchemaType<any> },
		streamObject as (config: configs.OptionalPromptConfig) => any
	) as unknown as StreamObjectPromiseReturn<TConfig, 'async-template', OUTPUT, PROMPT, TConfigShape>;
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