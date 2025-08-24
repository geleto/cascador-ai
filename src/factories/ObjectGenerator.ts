import { generateObject, LanguageModel, ToolCallOptions } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, validateObjectConfig } from "../validate";

export type LLMGeneratorConfig<
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string
> = (
	| configs.GenerateObjectObjectConfig<INPUT, OUTPUT>
	| configs.GenerateObjectArrayConfig<INPUT, OUTPUT>
	| configs.GenerateObjectEnumConfig<INPUT, ENUM>
	| configs.GenerateObjectNoSchemaConfig<INPUT, OUTPUT>
) & configs.OptionalPromptConfig;

export type ObjectGeneratorInstance<
	TConfig extends LLMGeneratorConfig<INPUT, OUTPUT, ENUM>,
	PType extends types.RequiredPromptType,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,

> = LLMCallSignature<TConfig, Promise<results.GenerateObjectResultAll<OUTPUT, ENUM>>, PType>;

type GenerateObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	ENUM extends string
> =
	configs.GenerateObjectObjectConfig<INPUT, OUTPUT> |
	configs.GenerateObjectArrayConfig<INPUT, OUTPUT> |
	configs.GenerateObjectEnumConfig<INPUT, ENUM> |
	configs.GenerateObjectNoSchemaConfig<INPUT>;

// Parameterize return types by concrete promptType literal used by implementation
type GenerateObjectReturn<
	TConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	ENUM extends string,
> =
	TConfig extends { output: 'array', schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'enum', enum: readonly (ENUM)[] }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>, PType>
	: TConfig extends { output: 'enum' }
	? `Config Error: Enum output requires an enum`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>, PType>
	: TConfig extends { output?: 'object' | undefined, schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: `Config Error: Object output requires a schema`;

// With parent
type GenerateObjectWithParentReturn<
	TConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	ENUM extends string,
	PARENT_OUTPUT, //@out
	PARENT_ENUM extends string,

	TFinalConfig = utils.Override<TParentConfig, TConfig>
> =
	GenerateObjectReturn<
		TFinalConfig & configs.OptionalPromptConfig,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT, //@out
		ENUM extends never ? PARENT_ENUM : ENUM
	>

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.GenerateObjectArrayConfig<any, any>;
	enum: configs.GenerateObjectEnumConfig<any>;
	'no-schema': configs.GenerateObjectNoSchemaConfig<any>;
	object: configs.GenerateObjectObjectConfig<any, any>;
}

interface AllSpecializedProperties { output?: ConfigOutput, schema?: types.SchemaType<any>, model?: LanguageModel, enum?: readonly string[] }

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
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT, //@out
	PARENT_ENUM extends string,
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
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	MoreConfig = object
> = ValidateObjectParentConfigBase<TParentConfig, TFinalConfig,
	Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & MoreConfig>, //TParentConfig Shape
	AllSpecializedProperties, //TFinalConfig Shape
	{ output?: ConfigOutput; }, //
	MoreConfig>

// A text-only prompt has no inputs
function withText<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM>,
	OUTPUT, //@out
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		never, OUTPUT, ENUM, never, OUTPUT, ENUM>,
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM>>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		never, OUTPUT, ENUM, never, PARENT_OUTPUT, PARENT_ENUM>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		never, PARENT_OUTPUT, PARENT_ENUM>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM>

// Implementation signature that handles both cases
function withText<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM>,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM> {
	return _createObjectGenerator(config as GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig, 'text',
		parent as ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM>
}

function withTextAsTool<
	const TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		never, OUTPUT, ENUM, never, OUTPUT, ENUM>,
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;

function withTextAsTool<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM>>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		never, OUTPUT, ENUM, never, PARENT_OUTPUT, PARENT_ENUM>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		never, PARENT_OUTPUT, PARENT_ENUM>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;

function withTextAsTool<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM>,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM> & results.RendererTool<Record<string, never>, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.RendererTool<Record<string, never>, OUTPUT>,
		'text',
		parent as ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;
}

function loadsText<
	const TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		never, OUTPUT, ENUM, never, OUTPUT, ENUM,
		configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM>> & Partial<configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>> & Partial<configs.LoaderConfig>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig, never, OUTPUT, ENUM, never, PARENT_OUTPUT, PARENT_ENUM,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig, never, PARENT_OUTPUT, PARENT_ENUM,
		configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.LoaderConfig,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM> {
	return _createObjectGenerator(
		config,
		'text-name',
		parent as ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM>;
}

function loadsTextAsTool<
	const TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		never, OUTPUT, ENUM, never, OUTPUT, ENUM,
		configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM>
	& results.RendererTool<Record<string, never>, OUTPUT>;

function loadsTextAsTool<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM>> & Partial<configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>> & Partial<configs.LoaderConfig>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig, never, OUTPUT, ENUM, never, PARENT_OUTPUT, PARENT_ENUM,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig, never, PARENT_OUTPUT, PARENT_ENUM,
		configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;

function loadsTextAsTool<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.LoaderConfig,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM> & results.RendererTool<Record<string, never>, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.RendererTool<Record<string, never>, OUTPUT>,
		'text-name',
		parent as ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;
}

function withTemplate<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig>,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM>;

// Overload 2: With parent parameter
function withTemplate<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & configs.TemplatePromptConfig,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function withTemplate<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> {
	return _createObjectGenerator(config, 'async-template', parent) as unknown as GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM>;
}

function withTemplateAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig>,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;

function withTemplateAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<INPUT, OUTPUT>;

function withTemplateAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-template',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;
}

function loadsTemplate<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM>;

// Overload 2: With parent parameter
function loadsTemplate<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function loadsTemplate<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM> {
	return _createObjectGenerator(config, 'async-template-name', parent) as unknown as GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM>;
}

function loadsTemplateAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsTemplateAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & Partial<configs.LoaderConfig>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig & Partial<configs.LoaderConfig>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsTemplateAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-template-name',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;
}

function withScript<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig<INPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig>,
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & configs.ScriptPromptConfig,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function withScript<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM> {
	return _createObjectGenerator(config, 'async-script', parent) as unknown as GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM>;
}

function withScriptAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ToolConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig>,
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;

function withScriptAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ToolConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<INPUT, OUTPUT>;

function withScriptAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ToolConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-script',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;
}

function loadsScript<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM>;

// Overload 2: With parent parameter
function loadsScript<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM>;

// Implementation signature that handles both cases
function loadsScript<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM> {
	return _createObjectGenerator(config, 'async-script-name', parent) as unknown as GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM>;
}

function loadsScriptAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ToolConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TConfig, TConfig,
		INPUT, OUTPUT, ENUM, INPUT, OUTPUT, ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ToolConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectGeneratorConfig<TConfig, TParentConfig, TFinalConfig,
		INPUT, OUTPUT, ENUM, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig,
		PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM,
		configs.CascadaConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-script-name',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectGenerator<
	TConfig extends configs.GenerateObjectBaseConfig<INPUT> & configs.OptionalPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig,
	promptType: types.PromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as unknown as configs.GenerateObjectObjectConfig<any, any>).output === undefined) {
		(merged as unknown as configs.GenerateObjectObjectConfig<any, any>).output = 'object';
	}

	validateBaseConfig(merged);
	validateObjectConfig(merged, false);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: types.SchemaType<any> },
		generateObject as (config: configs.OptionalPromptConfig) => any
	) as unknown as GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM>;
}

function _createObjectGeneratorAsTool<
	TConfig extends configs.StreamObjectBaseConfig<INPUT> & configs.OptionalPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & { description?: string; inputSchema: types.SchemaType<INPUT> },
	promptType: types.PromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT> {

	const renderer = _createObjectGenerator(config, promptType, parent) as unknown as results.RendererTool<INPUT, OUTPUT>;
	renderer.description = config.description;
	renderer.inputSchema = config.inputSchema;
	renderer.type = 'function';//Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context objectm optiions is not used
	renderer.execute = renderer as unknown as (args: any, options: ToolCallOptions) => PromiseLike<any>;
	return renderer as (typeof renderer & GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM>);
}

export const ObjectGenerator = Object.assign(withText, { // default is withText
	withTemplate: Object.assign(withTemplate, {
		asTool: withTemplateAsTool,
	}),
	withScript: Object.assign(withScript, {
		asTool: withScriptAsTool,
	}),
	withText: Object.assign(withText, {
		asool: withTextAsTool,
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
	asTool: withTextAsTool
});