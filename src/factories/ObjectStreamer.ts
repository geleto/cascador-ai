import { streamObject, LanguageModel, StreamObjectOnFinishCallback } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { RequiredPromptType, SchemaType } from "../types/types";

import { LLMCallSignature, createLLMRenderer } from "../llm";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, validateObjectConfig } from "../validate";

import type { ValidateObjectConfigBase, ValidateObjectParentConfigBase } from "./ObjectGenerator";

export type LLMStreamerConfig<OBJECT, ELEMENT> = (
	| configs.StreamObjectObjectConfig<OBJECT>
	| configs.StreamObjectArrayConfig<ELEMENT>
	| configs.StreamObjectNoSchemaConfig
) & configs.OptionalPromptConfig;

export type ObjectStreamerInstance<
	OBJECT, ELEMENT,
	CONFIG extends LLMStreamerConfig<OBJECT, ELEMENT>,
	PType extends RequiredPromptType
> = LLMCallSignature<CONFIG, Promise<results.StreamObjectResultAll<OBJECT, ELEMENT>>, PType>;

// Allow additional callback properties in config
interface StreamCallbacks {
	onFinish?: StreamObjectOnFinishCallback<any>;
	onError?: (event: { error: unknown }) => Promise<void> | void;
}

type StreamObjectConfig<OBJECT, ELEMENT> =
	configs.StreamObjectObjectConfig<OBJECT> |
	configs.StreamObjectArrayConfig<ELEMENT> |
	configs.StreamObjectNoSchemaConfig;

type StreamObjectReturnWithPrompt<
	TConfig extends configs.OptionalPromptConfig,
	OBJECT,
	ELEMENT,
	PType extends RequiredPromptType
> =
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`//LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<any>>>//array with no schema, maybe return Error String
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>, PType>
	//no schema, no array - it's 'object' or no output which defaults to 'object'
	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: `Config Error: Object output requires a schema`//LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<any>>>;// object with no schema, maybe return Error String

type StreamObjectWithParentReturn<
	TConfig extends configs.OptionalPromptConfig,
	TParentConfig extends configs.OptionalPromptConfig,
	OBJECT,
	ELEMENT,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	PType extends RequiredPromptType,
	TFinalConfig extends configs.OptionalPromptConfig = utils.Override<TParentConfig, TConfig>,
> =
	StreamObjectReturnWithPrompt<TFinalConfig, OBJECT extends never ? PARENT_OBJECT : OBJECT, ELEMENT extends never ? PARENT_ELEMENT : ELEMENT, PType>

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
	TConfig extends Partial<StreamObjectConfig<OBJECT, ELEMENT> & MoreConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	OBJECT,
	ELEMENT,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	MoreConfig = object
> = ValidateObjectConfigBase<TConfig, TParentConfig, TFinalConfig,
	Partial<StreamObjectConfig<OBJECT, ELEMENT> & MoreConfig>, //TConfig Shape
	Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	MoreConfig>

// Validator for the `parent` config's GENERIC type
type ValidateObjectStreamerParentConfig<
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	MoreConfig = object
> = ValidateObjectParentConfigBase<TParentConfig, TFinalConfig,
	Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	{ output?: ConfigOutput; }, //
	MoreConfig>

export function withText<
	TConfig extends StreamObjectConfig<OBJECT, ELEMENT>,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		StreamCallbacks>,
): StreamObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, 'text'>;

// Overload 2: With parent parameter
export function withText<
	TConfig extends Partial<StreamObjectConfig<OBJECT, ELEMENT>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_OBJECT, PARENT_ELEMENT>>,
	OBJECT = any,
	ELEMENT = any,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT,
		StreamCallbacks>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT, 'text'>;

// Implementation signature that handles both cases
export function withText<
	TConfig extends StreamObjectConfig<any, any>,
	TParentConfig extends StreamObjectConfig<any, any>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturnWithPrompt<TConfig, any, any, 'text'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'text'> {
	return _createObjectStreamer(config, 'text', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'text'>;
}

export function loadsText<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.LoaderConfig & StreamCallbacks>,
): StreamObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, 'text-name'>;

// Overload 2: With parent parameter
export function loadsText<
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
export function loadsText<
	TConfig extends StreamObjectConfig<any, any> & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturnWithPrompt<TConfig, any, any, 'text-name'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'text-name'> {
	return _createObjectStreamer(config, 'text-name', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'text-name'>;
}

export function withTemplate<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & StreamCallbacks>,
): StreamObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, 'async-template'>;

// Overload 2: With parent parameter
export function withTemplate<
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
export function withTemplate<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturnWithPrompt<TConfig, any, any, 'async-template'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-template'> {
	return _createObjectStreamer(config, 'async-template', parent) as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-template'>;
}

export function loadsTemplate<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig & StreamCallbacks>,
): StreamObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, 'async-template-name'>;

// Overload 2: With parent parameter
export function loadsTemplate<
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
export function loadsTemplate<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturnWithPrompt<TConfig, any, any, 'async-template-name'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-template-name'> {
	return _createObjectStreamer(config, 'async-template-name', parent) as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-template-name'>;
}

export function withScript<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & StreamCallbacks>,
): StreamObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, 'async-script'>;

// Overload 2: With parent parameter
export function withScript<
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
export function withScript<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturnWithPrompt<TConfig, any, any, 'async-script'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-script'> {
	return _createObjectStreamer(config, 'async-script', parent) as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-script'>;
}

export function loadsScript<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig & StreamCallbacks>,
): StreamObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, 'async-script-name'>;

// Overload 2: With parent parameter
export function loadsScript<
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
export function loadsScript<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturnWithPrompt<TConfig, any, any, 'async-script-name'> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-script-name'> {
	return _createObjectStreamer(config, 'async-script-name', parent) as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any, 'async-script-name'>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends StreamObjectConfig<any, any>,
	TParentConfig extends StreamObjectConfig<any, any>,
>(
	config: TConfig,
	promptType: RequiredPromptType,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturnWithPrompt<TConfig, any, any, RequiredPromptType> {

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

	return createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: SchemaType<any> },
		streamObject
	) as StreamObjectReturnWithPrompt<TConfig, any, any, RequiredPromptType>;
}

export const ObjectStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});