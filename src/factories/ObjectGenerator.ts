import { generateObject, JSONValue, LanguageModel } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { RequiredPromptType, SchemaType } from "../types/types";

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, validateObjectConfig } from "../validate";

export type LLMGeneratorConfig<
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string
> = (
	| configs.GenerateObjectObjectConfig<INPUT, OUTPUT>
	| configs.GenerateObjectArrayConfig<INPUT, OUTPUT>
	| configs.GenerateObjectEnumConfig<INPUT, OUTPUT, ENUM>
	| configs.GenerateObjectNoSchemaConfig<INPUT, OUTPUT>
) & configs.OptionalPromptConfig;

export type ObjectGeneratorInstance<
	TConfig extends LLMGeneratorConfig<INPUT, OUTPUT, ENUM>,
	PType extends RequiredPromptType,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,

> = LLMCallSignature<TConfig, Promise<results.GenerateObjectResultAll<OUTPUT, ENUM>>, PType>;

type GenerateObjectConfig<
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string
> =
	configs.GenerateObjectObjectConfig<INPUT, OUTPUT> |
	configs.GenerateObjectArrayConfig<INPUT, OUTPUT> |
	configs.GenerateObjectEnumConfig<INPUT, OUTPUT, ENUM> |
	configs.GenerateObjectNoSchemaConfig<INPUT, OUTPUT>;

// Parameterize return types by concrete promptType literal used by implementation
type GenerateObjectReturn<
	TConfig extends configs.BaseConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig,
	PType extends RequiredPromptType,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
> =
	TConfig extends { output: 'array', schema: SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<OUTPUT>>, PType, INPUT, OUTPUT>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'enum', enum: readonly (ENUM)[] }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>, PType, INPUT, OUTPUT>
	: TConfig extends { output: 'enum' }
	? `Config Error: Enum output requires an enum`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>, PType, INPUT, OUTPUT>
	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<OUTPUT>>, PType, INPUT, OUTPUT>
	: `Config Error: Object output requires a schema`;

// With parent
type GenerateObjectWithParentReturn<
	TConfig extends configs.BaseConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.OptionalPromptConfig,
	PType extends RequiredPromptType,

	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,

	TFinalConfig = utils.Override<TParentConfig, TConfig>
> =
	GenerateObjectReturn<
		TFinalConfig & configs.OptionalPromptConfig,
		PType,
		INPUT extends never ? PARENT_INPUT : INPUT,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,
		ENUM extends never ? PARENT_ENUM : ENUM
	>

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.GenerateObjectArrayConfig<any>;
	enum: configs.GenerateObjectEnumConfig<any>;
	'no-schema': configs.GenerateObjectNoSchemaConfig;
	object: configs.GenerateObjectObjectConfig<any>;
}

interface AllSpecializedProperties { output?: ConfigOutput, schema?: SchemaType<any>, model?: LanguageModel, enum?: readonly string[] }

type ConfigOutput = keyof ConfigShapeMap | undefined;
//type ConfigOutput = 'array' | 'enum' | 'no-schema' | 'object' | undefined;

type GetOutputType<TConfig> =
	TConfig extends { output: string }
	? (TConfig['output'] extends keyof ConfigShapeMap
		? TConfig['output']// not undefined
		: 'object')
	: 'object';

type GetAllowedKeysForConfig<TConfig extends { output?: string }>
	= keyof ConfigShapeMap[GetOutputType<TConfig>];

// Gets the set of keys that are required in the final, merged configuration.
type GetObjectGeneratorRequiredShape<TFinalConfig extends { output?: string }> =
	TFinalConfig extends { output: 'enum' } ? { enum: unknown; model: unknown } :
	TFinalConfig extends { output: 'no-schema' } ? { model: unknown } :
	// Default case for 'object', 'array', or undefined output.
	{ schema: unknown; model: unknown };

export type ValidateObjectConfigBase<
	TConfig extends TConfigShape,
	TParentConfig extends TParentConfigShape,
	TFinalConfig extends TFinalConfigShape,

	TConfigShape extends { output?: string; },
	TParentConfigShape extends { output?: string; },
	TFinalConfigShape extends { output?: string; },

	MoreConfig = object
> =
	// Reusable for object streamer
	TConfig extends TConfigShape
	? (
		TParentConfig extends TParentConfigShape
		? (
			// 1. Check for excess properties in TConfig based on the final merged config's own `output` mode.
			(keyof Omit<TConfig, GetAllowedKeysForConfig<TFinalConfig> | keyof MoreConfig> extends never
				// 2. If no excess, check for properties missing from the FINAL merged config.
				? (
					keyof Omit<
						GetObjectGeneratorRequiredShape<TFinalConfig>,
						keyof TFinalConfig
					> extends never
					? TConfig //All checks passed.
					: `Config Error: Missing required properties for output mode '${GetOutputType<TFinalConfig>}' - '${keyof
					(TFinalConfig & MoreConfig) & string}'`
				)
				//: `"Hi: ${keyof Omit<TConfig, GetAllowedKeysForConfig<TFinalConfig> | keyof MoreConfig> & string}"`
				: `Config Error: Unknown properties for output mode '${GetOutputType<TFinalConfig>}' - '${keyof Omit<TConfig, GetAllowedKeysForConfig<TFinalConfig> | keyof MoreConfig> & string}'`
			)
		) : (
			//Parent Shape is invalid - for parent TypeScript will produce its standard error.
			//@todo check TConfig for excess properties
			TConfig
		)
	) : TConfig; //Shape is invalid - Resolve to TConfig and let TypeScript produce its standard error.

export type ValidateObjectParentConfigBase<
	TParentConfig extends TParentConfigShape,
	TFinalConfig extends TFinalConfigShape,

	TParentConfigShape extends OutputShape,
	TFinalConfigShape extends OutputShape,
	OutputShape extends { output?: string; },

	MoreConfig = object
> =
	// GATEKEEPER: Is the parent config a valid shape?
	TParentConfig extends TParentConfigShape
	? (
		// Check for excess properties in the parent, validated against the FINAL config's shape.
		keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig> | keyof MoreConfig> extends never
		// The check has passed, return the original config type.
		? TParentConfig
		// On excess property failure, return a descriptive string.
		: `Parent Config Error: Unknown properties for final output mode '${GetOutputType<TFinalConfig>}' - ${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig> & MoreConfig> & string}`
	) : TParentConfig; //Shape is invalid - Resolve to TParentConfig and let TypeScript produce its standard error.

type ValidateObjectGeneratorConfig<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & MoreConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = never,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = never,
	MoreConfig = object
> = ValidateObjectConfigBase<TConfig, TParentConfig, TFinalConfig,
	Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & MoreConfig>, //TConfig Shape
	Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	MoreConfig>

// Validator for the `parent` config's GENERIC type
type ValidateObjectGeneratorParentConfig<
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = never,
	MoreConfig = object
> = ValidateObjectParentConfigBase<TParentConfig, TFinalConfig,
	Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	{ output?: ConfigOutput; }, //
	MoreConfig>

function withText<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM>,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM>,
): GenerateObjectReturn<TConfig, 'text', INPUT, OUTPUT, ENUM>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>>,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text',
	INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>

// Implementation signature that handles both cases
function withText<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM>,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text', any, any> {
	return _createObjectGenerator(config as GenerateObjectConfig<any, any> & configs.OptionalPromptConfig, 'text',
		parent as ConfigProvider<GenerateObjectConfig<any, any> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text', any, any>
}

function loadsText<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.LoaderConfig,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'text', INPUT, OUTPUT, ENUM>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & Partial<configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & Partial<configs.LoaderConfig>,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig, INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text', INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends GenerateObjectConfig<any, any> & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<any, any> & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text', any, any> {
	return _createObjectGenerator(
		config as GenerateObjectConfig<any, any> & configs.OptionalPromptConfig,
		'text-name',
		parent as ConfigProvider<GenerateObjectConfig<any, any> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text', any, any>;
}

function withTemplate<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalTemplatePromptConfig,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.OptionalTemplatePromptConfig>,
): GenerateObjectReturn<TConfig, 'async-template', INPUT, OUTPUT, ENUM>;

// Overload 2: With parent parameter
function withTemplate<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & configs.OptionalTemplatePromptConfig,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & configs.OptionalTemplatePromptConfig,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalTemplatePromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalTemplatePromptConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template', INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function withTemplate<
	TConfig extends GenerateObjectConfig<any, any> & configs.OptionalTemplatePromptConfig,
	TParentConfig extends GenerateObjectConfig<any, any> & configs.OptionalTemplatePromptConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template', any, any> {
	return _createObjectGenerator(config, 'async-template', parent) as unknown as GenerateObjectReturn<TConfig, 'async-template', any, any>;
}

function loadsTemplate<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalTemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.OptionalTemplatePromptConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-template', INPUT, OUTPUT, ENUM>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsTemplate<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalTemplatePromptConfig & Partial<configs.LoaderConfig>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.OptionalTemplatePromptConfig & Partial<configs.LoaderConfig>>,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalTemplatePromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalTemplatePromptConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template', INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function loadsTemplate<
	TConfig extends GenerateObjectConfig<any, any> & configs.OptionalTemplatePromptConfig & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<any, any> & configs.OptionalTemplatePromptConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template', any, any> {
	return _createObjectGenerator(config, 'async-template-name', parent) as unknown as GenerateObjectReturn<TConfig, 'async-template', any, any>;
}

function withScript<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.CascadaConfig,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig>,
): GenerateObjectReturn<TConfig, 'async-script', INPUT, OUTPUT, ENUM>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & configs.OptionalScriptPromptConfig,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & configs.OptionalScriptPromptConfig,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalScriptPromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalScriptPromptConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script', INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function withScript<
	TConfig extends GenerateObjectConfig<any, any> & configs.OptionalScriptPromptConfig,
	TParentConfig extends GenerateObjectConfig<any, any> & configs.OptionalScriptPromptConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script', any, any> {
	return _createObjectGenerator(config, 'async-script', parent) as unknown as GenerateObjectReturn<TConfig, 'async-script', any, any>;
}

function loadsScript<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.OptionalScriptPromptConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-script', INPUT, OUTPUT, ENUM>;

// Overload 2: With parent parameter
function loadsScript<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalScriptPromptConfig & Partial<configs.LoaderConfig>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.OptionalScriptPromptConfig & Partial<configs.LoaderConfig>>,
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
	ENUM extends string = string,
	PARENT_INPUT extends Record<string, any> = never,
	PARENT_OUTPUT extends JSONValue = never,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalScriptPromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.OptionalScriptPromptConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script', INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function loadsScript<
	TConfig extends GenerateObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<any, any> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script', any, any> {
	return _createObjectGenerator(config, 'async-script-name', parent) as unknown as GenerateObjectReturn<TConfig, 'async-script', any, any>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectGenerator<
	TConfig extends GenerateObjectConfig<any, any> & configs.OptionalPromptConfig,
	TParentConfig extends GenerateObjectConfig<any, any> & configs.OptionalPromptConfig,
	PType extends RequiredPromptType,
>(
	config: TConfig,
	promptType: PType,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, any, any, string, PType> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as unknown as configs.GenerateObjectObjectConfig).output === undefined) {
		(merged as unknown as configs.GenerateObjectObjectConfig).output = 'object';
	}

	validateBaseConfig(merged);
	validateObjectConfig(merged, false);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: SchemaType<any> },
		generateObject
	) as GenerateObjectReturn<TConfig, any, any, any, PType>;
}

export const ObjectGenerator = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});