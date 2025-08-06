import { streamObject, LanguageModel } from "ai";

import * as results from './types-result'
import * as configs from './types-config';
import * as utils from './type-utils';
import { RequiredPromptType, SchemaType } from "./types";

import { LLMCallSignature, createLLMRenderer } from "./llm";
import { ConfigProvider, mergeConfigs } from "./ConfigData";
import { validateBaseConfig, validateObjectConfig } from "./validate";

import type { ValidateObjectConfigBase, ValidateObjectParentConfigBase } from "./factory-object-generator";

export type LLMStreamerConfig<OBJECT, ELEMENT> = (
	| configs.StreamObjectObjectConfig<OBJECT>
	| configs.StreamObjectArrayConfig<ELEMENT>
	| configs.StreamObjectNoSchemaConfig
) & configs.OptionalTemplateConfig;

export type ObjectStreamerInstance<
	OBJECT, ELEMENT,
	CONFIG extends LLMStreamerConfig<OBJECT, ELEMENT>
> = LLMCallSignature<CONFIG, Promise<results.StreamObjectResultAll<OBJECT, ELEMENT>>>;

type StreamObjectConfig<OBJECT, ELEMENT> =
	configs.StreamObjectObjectConfig<OBJECT> |
	configs.StreamObjectArrayConfig<ELEMENT> |
	configs.StreamObjectNoSchemaConfig;

type StreamObjectReturn<
	TConfig extends configs.OptionalTemplateConfig,
	OBJECT,
	ELEMENT,
> =
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`//LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<any>>>//array with no schema, maybe return Error String
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>>
	//no schema, no array - it's 'object' or no output which defaults to 'object'
	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>>
	: `Config Error: Object output requires a schema`//LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<any>>>;// object with no schema, maybe return Error String

type StreamObjectWithParentReturn<
	TConfig extends configs.OptionalTemplateConfig,
	TParentConfig extends configs.OptionalTemplateConfig,
	OBJECT,
	ELEMENT,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	TFinalConfig extends configs.OptionalTemplateConfig = utils.Override<TParentConfig, TConfig>,
> =
	StreamObjectReturn<TFinalConfig, OBJECT extends never ? PARENT_OBJECT : OBJECT, ELEMENT extends never ? PARENT_ELEMENT : ELEMENT>

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
		OBJECT, ELEMENT, OBJECT, ELEMENT>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT>;

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
		OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT>;

// Implementation signature that handles both cases
export function withText<
	TConfig extends StreamObjectConfig<any, any>,
	TParentConfig extends StreamObjectConfig<any, any>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any> {
	return _createObjectStreamer(config, 'async-template', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any>;
}

export function loadsText<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.LoaderConfig>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT>;

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
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig, PARENT_OBJECT, PARENT_ELEMENT,
		configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT>;


// Implementation signature that handles both cases
export function loadsText<
	TConfig extends StreamObjectConfig<any, any> & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any> {
	return _createObjectStreamer(config, 'text-name', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any>;
}

export function withTemplate<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT>;

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
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT>;

// Implementation signature that handles both cases
export function withTemplate<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any> {
	return _createObjectStreamer(config, 'async-template', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any>;
}

export function loadsTemplate<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT>;

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
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT>;

// Implementation signature that handles both cases
export function loadsTemplate<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any> {
	return _createObjectStreamer(config, 'async-template-name', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any>;
}

export function withScript<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT>;

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
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT>;

// Implementation signature that handles both cases
export function withScript<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any> {
	return _createObjectStreamer(config, 'async-script', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any>;
}

export function loadsScript<
	const TConfig extends StreamObjectConfig<OBJECT, ELEMENT> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
>(
	config: TConfig & ValidateObjectStreamerConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, OBJECT, ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, OBJECT, ELEMENT>;

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
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT,
		configs.CascadaConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, PARENT_OBJECT, PARENT_ELEMENT>;

// Implementation signature that handles both cases
export function loadsScript<
	TConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, any, any> | StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any> {
	return _createObjectStreamer(config, 'async-script-name', parent) as unknown as StreamObjectWithParentReturn<TConfig, TParentConfig, any, any, any, any>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends StreamObjectConfig<any, any>,
	TParentConfig extends StreamObjectConfig<any, any>,
	PType extends RequiredPromptType,
>(
	config: TConfig,
	promptType: PType,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig & { promptType: PType }, any, any> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as configs.StreamObjectObjectConfig<any>).output === undefined) {
		(merged as configs.StreamObjectObjectConfig<any>).output = 'object';
	}

	validateBaseConfig(merged);
	validateObjectConfig(merged, false);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer(
		merged as configs.OptionalTemplateConfig & { model: LanguageModel, prompt: string },
		streamObject
	) as StreamObjectReturn<TConfig & { promptType: PType }, any, any>;
}

export const ObjectStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});