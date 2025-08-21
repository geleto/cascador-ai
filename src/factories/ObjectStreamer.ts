import { streamObject, LanguageModel, StreamObjectOnFinishCallback, JSONValue } from "ai";

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
	OUTPUT
> = (
	| configs.StreamObjectObjectConfig<INPUT, OUTPUT>
	| configs.StreamObjectArrayConfig<INPUT, OUTPUT>
	| configs.StreamObjectNoSchemaConfig
) & configs.OptionalPromptConfig;

export type ObjectStreamerInstance<
	TConfig extends LLMStreamerConfig<INPUT, OUTPUT>,
	PType extends RequiredPromptType,
	INPUT extends Record<string, any>,
	OUTPUT,
> = LLMCallSignature<TConfig, Promise<results.StreamObjectResultAll<OUTPUT>>, PType, INPUT, OUTPUT>;

type StreamObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT
> =
	configs.StreamObjectObjectConfig<INPUT, OUTPUT> |
	configs.StreamObjectArrayConfig<INPUT, OUTPUT> |
	configs.StreamObjectNoSchemaConfig;

type StreamObjectReturn<
	TConfig extends configs.OptionalPromptConfig<PType, INPUT, OUTPUT>,
	PType extends RequiredPromptType,
	INPUT extends Record<string, any>,
	OUTPUT,
> =
	TConfig extends { output: 'array', schema: SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<OUTPUT>>, PType, INPUT, OUTPUT>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`//LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<any>>>//array with no schema, maybe return Error String
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>, PType, INPUT, OUTPUT>
	//no schema, no array - it's 'object' or no output which defaults to 'object'
	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<OUTPUT>>, PType, INPUT, OUTPUT>
	: `Config Error: Object output requires a schema`//LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<any>>>;// object with no schema, maybe return Error String

type StreamObjectWithParentReturn<
	TConfig extends configs.OptionalPromptConfig<string, never, OUTPUT>,
	TParentConfig extends configs.OptionalPromptConfig<string, never, PARENT_OUTPUT>,
	PType extends RequiredPromptType,

	OUTPUT,
	PARENT_OUTPUT,

	TFinalConfig extends configs.OptionalPromptConfig<string, never, any> = utils.Override<TParentConfig, TConfig>,
> =
	StreamObjectReturn<TFinalConfig, PType, never, OUTPUT extends never ? PARENT_OUTPUT : OUTPUT>

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.StreamObjectArrayConfig<any>;
	'no-schema': configs.StreamObjectNoSchemaConfig;
	object: configs.StreamObjectObjectConfig<any>;
}

interface AllSpecializedProperties { output?: ConfigOutput, schema?: SchemaType<any>, model?: LanguageModel }

type ConfigOutput = keyof ConfigShapeMap | undefined;
//type ConfigOutput = 'array' | 'no-schema' | 'object' | undefined;

type ValidateObjectStreamerConfig<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & MoreConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
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
	OUTPUT,

>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, INPUT, OUTPUT,
		StreamCallbacks>,
): StreamObjectReturn<TConfig, 'text', OUTPUT>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & StreamCallbacks & configs.OptionalPromptConfig<string, INPUT, OUTPUT>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & StreamCallbacks & configs.OptionalPromptConfig<string, PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT,
		StreamCallbacks>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text', OUTPUT>;

// Implementation signature that handles both cases
function withText<
	TConfig extends StreamObjectConfig<any, any>,
	TParentConfig extends StreamObjectConfig<any, any>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text', OUTPUT> | StreamObjectWithParentReturn<TConfig, TParentConfig, 'text', OUTPUT> {
	return _createObjectStreamer(config, 'text', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, 'text', OUTPUT>;
}

function loadsText<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.LoaderConfig & StreamCallbacks>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT, 'text-name'>;

// Overload 2: With parent parameter
function loadsText<
	TConfig extends Partial<StreamObjectConfig<OBJECT, ELEMENT>> & configs.LoaderConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT>> & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT,
		configs.LoaderConfig & StreamCallbacks>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig, PARENT_OBJECT, PARENT_ELEMENT,
		configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT, 'text-name'>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends StreamObjectConfig<any, any> & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any, 'text-name'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'text-name'> {
	return _createObjectStreamer(config, 'text-name', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'text-name'>;
}

function withTemplate<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & StreamCallbacks>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT, 'async-template'>;

// Overload 2: With parent parameter
function withTemplate<
	TConfig extends Partial<StreamObjectConfig<OBJECT, ELEMENT>> & configs.CascadaConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT>> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & StreamCallbacks>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT, 'async-template'>;

// Implementation signature that handles both cases
function withTemplate<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any, 'async-template'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-template'> {
	return _createObjectStreamer(config, 'async-template', parent);
}

function loadsTemplate<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig & StreamCallbacks>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT, 'async-template-name'>;

// Overload 2: With parent parameter
function loadsTemplate<
	TConfig extends Partial<StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT> & configs.CascadaConfig & configs.LoaderConfig>,
	OBJECT = any,
	ELEMENT = any,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig & StreamCallbacks>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT, 'async-template-name'>;

// Implementation signature that handles both cases
function loadsTemplate<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any, 'async-template-name'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-template-name'> {
	return _createObjectStreamer(config, 'async-template-name', parent);
}

function withScript<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & StreamCallbacks>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT, 'async-script'>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<StreamObjectConfig<OBJECT, ELEMENT>> & configs.CascadaConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT>> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & StreamCallbacks>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT, 'async-script'>;

// Implementation signature that handles both cases
function withScript<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any, 'async-script'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-script'> {
	return _createObjectStreamer(config, 'async-script', parent);
}

function loadsScript<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig & StreamCallbacks>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT, 'async-script-name'>;

// Overload 2: With parent parameter
function loadsScript<
	TConfig extends Partial<StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT> & configs.CascadaConfig & configs.LoaderConfig>,
	OBJECT = any,
	ELEMENT = any,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig & StreamCallbacks>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT, 'async-script-name'>;

// Implementation signature that handles both cases
function loadsScript<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any, 'async-script-name'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-script-name'> {
	return _createObjectStreamer(config, 'async-script-name', parent);
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends StreamObjectConfig<any, any>,
	TParentConfig extends StreamObjectConfig<any, any>,
>(
	config: TConfig,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any, RequiredPromptType> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as configs.StreamObjectObjectConfig<any>).output === undefined) {
		(merged as configs.StreamObjectObjectConfig<any>).output = 'object';
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
	) as StreamObjectReturn<TConfig, any, any, RequiredPromptType>;
}

export const ObjectStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});