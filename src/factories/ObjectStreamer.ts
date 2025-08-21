import { streamObject, LanguageModel } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { RequiredPromptType, SchemaType } from "../types/types";

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, validateObjectConfig } from "../validate";

import type { ValidateObjectConfigBase, ValidateObjectParentConfigBase } from "./ObjectGenerator";

// Allow additional callback properties in config - why is this needed?
/*interface StreamCallbacks {
	onFinish?: StreamObjectOnFinishCallback<any>;
	onError?: (event: { error: unknown }) => Promise<void> | void;
}*/

export type LLMStreamerConfig<
	INPUT extends Record<string, any>,
	OUTPUT,
> = (
	| configs.StreamObjectObjectConfig<INPUT, OUTPUT>
	| configs.StreamObjectArrayConfig<INPUT, OUTPUT>
	| configs.StreamObjectNoSchemaConfig<INPUT, OUTPUT>
) & configs.OptionalPromptConfig;

export type ObjectStreamerInstance<
	TConfig extends LLMStreamerConfig<INPUT, OUTPUT>,
	PType extends RequiredPromptType,
	INPUT extends Record<string, any>,
	OUTPUT

> = LLMCallSignature<TConfig, Promise<results.StreamObjectResultAll<OUTPUT>>, PType>;

type StreamObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
> =
	configs.StreamObjectObjectConfig<INPUT, OUTPUT> |
	configs.StreamObjectArrayConfig<INPUT, OUTPUT> |
	configs.StreamObjectNoSchemaConfig<INPUT>;

// Parameterize return types by concrete promptType literal used by implementation
type StreamObjectReturn<
	TConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	PType extends RequiredPromptType,
	OUTPUT, //@out
> =
	TConfig extends { output: 'array', schema: SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>, PType>
	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: `Config Error: Object output requires a schema`;

// With parent
type StreamObjectWithParentReturn<
	TConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	PType extends RequiredPromptType,
	OUTPUT, //@out
	PARENT_OUTPUT, //@out
	TFinalConfig = utils.Override<TParentConfig, TConfig>
> =
	StreamObjectReturn<
		TFinalConfig & configs.OptionalPromptConfig,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT //@out
	>

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.StreamObjectArrayConfig<any, any>;
	'no-schema': configs.StreamObjectNoSchemaConfig<any>;
	object: configs.StreamObjectObjectConfig<any, any>;
}

interface AllSpecializedProperties { output?: ConfigOutput, schema?: SchemaType<any>, model?: LanguageModel }

type ConfigOutput = keyof ConfigShapeMap | undefined;
//type ConfigOutput = 'array' | 'no-schema' | 'object' | undefined;


type ValidateObjectStreamerConfig<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & MoreConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT, //@out
	MoreConfig = object
> = ValidateObjectConfigBase<TConfig, TParentConfig, TFinalConfig,
	Partial<StreamObjectConfig<INPUT, OUTPUT> & MoreConfig>, //TConfig Shape
	Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	MoreConfig>

// Validator for the `parent` config's GENERIC type
type ValidateObjectStreamerParentConfig<
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	MoreConfig = object
> = ValidateObjectParentConfigBase<TParentConfig, TFinalConfig,
	Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	{ output?: ConfigOutput; }, //
	MoreConfig>

function withText<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT, //@out
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, INPUT, OUTPUT>,
): StreamObjectReturn<TConfig, 'text', OUTPUT>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, PARENT_OUTPUT>

// Implementation signature that handles both cases
function withText<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT>,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text', OUTPUT> {
	return _createObjectStreamer(config as StreamObjectConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig, 'text',
		parent as ConfigProvider<StreamObjectConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig>
	) as unknown as StreamObjectReturn<TConfig, 'text', OUTPUT>
}

function loadsText<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, INPUT, OUTPUT,
		configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'text-name', OUTPUT>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & Partial<configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & Partial<configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig, PARENT_INPUT, PARENT_OUTPUT,
		configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, PARENT_OUTPUT>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text-name', OUTPUT> {
	return _createObjectStreamer(
		config,
		'text-name',
		parent as ConfigProvider<StreamObjectConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig>
	) as unknown as StreamObjectReturn<TConfig, 'text-name', OUTPUT>;
}

function withTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, INPUT, OUTPUT,
		configs.CascadaConfig>,
): StreamObjectReturn<TConfig, 'async-template', OUTPUT>;

// Overload 2: With parent parameter
function withTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & configs.CascadaConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & configs.CascadaConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function withTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.CascadaConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> {
	return _createObjectStreamer(config, 'async-template', parent) as unknown as StreamObjectReturn<TConfig, 'async-template', OUTPUT>;
}

function loadsTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, INPUT, OUTPUT,
		configs.CascadaConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'async-template-name', OUTPUT>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig & Partial<configs.LoaderConfig>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.CascadaConfig & Partial<configs.LoaderConfig>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function loadsTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-template-name', OUTPUT> {
	return _createObjectStreamer(config, 'async-template-name', parent) as unknown as StreamObjectReturn<TConfig, 'async-template-name', OUTPUT>;
}

function withScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, INPUT, OUTPUT,
		configs.CascadaConfig>,
): StreamObjectReturn<TConfig, 'async-script', OUTPUT>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & configs.CascadaConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & configs.CascadaConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function withScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.CascadaConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-script', OUTPUT> {
	return _createObjectStreamer(config, 'async-script', parent) as unknown as StreamObjectReturn<TConfig, 'async-script', OUTPUT>;
}

function loadsScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, INPUT, OUTPUT,
		configs.CascadaConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'async-script-name', OUTPUT>;

// Overload 2: With parent parameter
function loadsScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig & Partial<configs.LoaderConfig>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.CascadaConfig & Partial<configs.LoaderConfig>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT,
		configs.CascadaConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function loadsScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.CascadaConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-script-name', OUTPUT> {
	return _createObjectStreamer(config, 'async-script-name', parent) as unknown as StreamObjectReturn<TConfig, 'async-script-name', OUTPUT>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends StreamObjectConfig<any, any>,
	TParentConfig extends StreamObjectConfig<any, any>,
>(
	config: TConfig,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as configs.StreamObjectObjectConfig<any, any>).output === undefined) {
		(merged as configs.StreamObjectObjectConfig<any, any>).output = 'object';
	}

	validateBaseConfig(merged);
	// Ensure correct defaults and validation for streaming
	/*if ((merged as { output?: string }).output === 'no-schema' && !(merged as { mode?: string }).mode) {
		(merged as { mode?: 'json' }).mode = 'json';
	}*/
	validateObjectConfig(merged, true);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: SchemaType<any> },
		streamObject
	) as StreamObjectReturn<TConfig, any, any>;
}

export const ObjectStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});