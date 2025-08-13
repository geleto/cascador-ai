import { generateObject, LanguageModel } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { RequiredPromptType, SchemaType } from "../types/types";

import { LLMCallSignature, createLLMRenderer } from "../llm";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, validateObjectConfig } from "../validate";

export type LLMGeneratorConfig<OBJECT, ELEMENT, ENUM extends string> = (
	| configs.GenerateObjectObjectConfig<OBJECT>
	| configs.GenerateObjectArrayConfig<ELEMENT>
	| configs.GenerateObjectEnumConfig<ENUM>
	| configs.GenerateObjectNoSchemaConfig
) & configs.OptionalPromptConfig;

export type ObjectGeneratorInstance<
	OBJECT, ELEMENT, ENUM extends string,
	CONFIG extends LLMGeneratorConfig<OBJECT, ELEMENT, ENUM>
> = LLMCallSignature<CONFIG, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>>;

type GenerateObjectConfig<OBJECT, ELEMENT, ENUM extends string> =
	configs.GenerateObjectObjectConfig<OBJECT> |
	configs.GenerateObjectArrayConfig<ELEMENT> |
	configs.GenerateObjectEnumConfig<ENUM> |
	configs.GenerateObjectNoSchemaConfig;

// Parameterize return types by concrete promptType literal used by implementation
type GenerateObjectReturnWithPrompt<
	TConfig extends configs.OptionalPromptConfig,
	OBJECT,
	ELEMENT,
	ENUM extends string,
	PType extends RequiredPromptType
> =
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'enum', enum: readonly (ENUM)[] }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>, PType>
	: TConfig extends { output: 'enum' }
	? `Config Error: Enum output requires an enum`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>, PType>
	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: `Config Error: Object output requires a schema`;

// With parent
type GenerateObjectWithParentReturn<
	TConfig extends configs.OptionalPromptConfig,
	TParentConfig extends configs.OptionalPromptConfig,
	OBJECT,
	ELEMENT,
	ENUM extends string,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	PARENT_ENUM extends string,
	PType extends RequiredPromptType,
	TFinalConfig extends configs.OptionalPromptConfig = utils.Override<TParentConfig, TConfig>,
> =
	GenerateObjectReturnWithPrompt<TFinalConfig, OBJECT extends never ? PARENT_OBJECT : OBJECT, ELEMENT extends never ? PARENT_ELEMENT : ELEMENT, ENUM extends never ? PARENT_ENUM : ENUM, PType>

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
	TConfig extends Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & MoreConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	OBJECT,
	ELEMENT,
	ENUM extends string,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	PARENT_ENUM extends string,
	MoreConfig = object
> = ValidateObjectConfigBase<TConfig, TParentConfig, TFinalConfig,
	Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & MoreConfig>, //TConfig Shape
	Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	MoreConfig>

// Validator for the `parent` config's GENERIC type
type ValidateObjectGeneratorParentConfig<
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM> & MoreConfig>,
	TFinalConfig extends AllSpecializedProperties,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	PARENT_ENUM extends string,
	MoreConfig = object
> = ValidateObjectParentConfigBase<TParentConfig, TFinalConfig,
	Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	{ output?: ConfigOutput; }, //
	MoreConfig>

export function withText<
	TConfig extends GenerateObjectConfig<OBJECT, ELEMENT, ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, ENUM, OBJECT, ELEMENT, ENUM>,
): GenerateObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, ENUM, 'text'>;

// Overload 2: With parent parameter
export function withText<
	TConfig extends Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM, 'text'>;

// Implementation signature that handles both cases
export function withText<
	TConfig extends GenerateObjectConfig<any, any, string>,
	TParentConfig extends GenerateObjectConfig<any, any, string>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturnWithPrompt<TConfig, any, any, string, 'text'> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'text'> {
	return _createObjectGenerator(config, 'text', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'text'>;
}

export function loadsText<
	const TConfig extends GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, ENUM, OBJECT, ELEMENT, ENUM,
		configs.LoaderConfig>,
): GenerateObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, ENUM, 'text'>;

// Overload 2: With parent parameter
export function loadsText<
	TConfig extends Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM>> & configs.LoaderConfig,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>> & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM, 'text'>;


// Implementation signature that handles both cases
export function loadsText<
	TConfig extends GenerateObjectConfig<any, any, string> & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<any, any, string> & configs.LoaderConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturnWithPrompt<TConfig, any, any, string, 'text'> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'text'> {
	return _createObjectGenerator(config, 'text-name', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'text'>;
}

export function withTemplate<
	const TConfig extends GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, ENUM, OBJECT, ELEMENT, ENUM,
		configs.CascadaConfig>,
): GenerateObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, ENUM, 'async-template'>;

// Overload 2: With parent parameter
export function withTemplate<
	TConfig extends Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM>> & configs.CascadaConfig,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM, 'async-template'>;

// Implementation signature that handles both cases
export function withTemplate<
	TConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig,
	TParentConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturnWithPrompt<TConfig, any, any, string, 'async-template'> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-template'> {
	return _createObjectGenerator(config, 'async-template', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-template'>;
}

export function loadsTemplate<
	const TConfig extends GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, ENUM, OBJECT, ELEMENT, ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
): GenerateObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, ENUM, 'async-template'>;

// Overload 2: With parent parameter
export function loadsTemplate<
	TConfig extends Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM> & configs.CascadaConfig & configs.LoaderConfig>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM, 'async-template'>;

// Implementation signature that handles both cases
export function loadsTemplate<
	TConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturnWithPrompt<TConfig, any, any, string, 'async-template'> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-template'> {
	return _createObjectGenerator(config, 'async-template-name', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-template'>;
}

export function withScript<
	const TConfig extends GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, ENUM, OBJECT, ELEMENT, ENUM,
		configs.CascadaConfig>,
): GenerateObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, ENUM, 'async-script'>;

// Overload 2: With parent parameter
export function withScript<
	TConfig extends Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM>> & configs.CascadaConfig,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>> & configs.CascadaConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM, 'async-script'>;

// Implementation signature that handles both cases
export function withScript<
	TConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig,
	TParentConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturnWithPrompt<TConfig, any, any, string, 'async-script'> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-script'> {
	return _createObjectGenerator(config, 'async-script', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-script'>;
}

export function loadsScript<
	const TConfig extends GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & configs.CascadaConfig & configs.LoaderConfig,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		OBJECT, ELEMENT, ENUM, OBJECT, ELEMENT, ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
): GenerateObjectReturnWithPrompt<TConfig, OBJECT, ELEMENT, ENUM, 'async-script'>;

// Overload 2: With parent parameter
export function loadsScript<
	TConfig extends Partial<GenerateObjectConfig<OBJECT, ELEMENT, ENUM> & configs.CascadaConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM & configs.CascadaConfig & configs.LoaderConfig>>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM, 'async-script'>;

// Implementation signature that handles both cases
export function loadsScript<
	TConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<any, any, string> & configs.CascadaConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturnWithPrompt<TConfig, any, any, string, 'async-script'> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-script'> {
	return _createObjectGenerator(config, 'async-script-name', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string, 'async-script'>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectGenerator<
	TConfig extends GenerateObjectConfig<any, any, string>,
	TParentConfig extends GenerateObjectConfig<any, any, string>,
	PType extends RequiredPromptType,
>(
	config: TConfig,
	promptType: PType,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturnWithPrompt<TConfig, any, any, string, PType> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as configs.GenerateObjectObjectConfig<any>).output === undefined) {
		(merged as configs.GenerateObjectObjectConfig<any>).output = 'object';
	}

	validateBaseConfig(merged);
	validateObjectConfig(merged, false);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: SchemaType<any> },
		generateObject
	) as GenerateObjectReturnWithPrompt<TConfig, any, any, any, PType>;
}

export const ObjectGenerator = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});