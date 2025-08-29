import { generateObject, LanguageModel, ToolCallOptions } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateObjectLLMConfig } from "../validate";


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

type GetObjectGeneratordShape<TFinalConfig extends { output?: string }> =
	TFinalConfig extends { output: 'enum' } ? configs.GenerateObjectEnumConfig<any> :
	TFinalConfig extends { output: 'no-schema' } ? configs.GenerateObjectNoSchemaConfig<any> :
	TFinalConfig extends { output: 'array' } ? configs.GenerateObjectArrayConfig<any, any> :
	// Default case for 'object', 'array', or undefined output.
	configs.GenerateObjectObjectConfig<any, any>;

export type ValidateObjectConfig<
	TConfig extends Partial<configs.GenerateObjectBaseConfig<any> & { output?: string | undefined }>,
	TFinalConfig extends AllSpecializedProperties & Record<string, any>,
	TShapeExtras = Record<string, never>, // extends { output?: string | undefined, inputSchema?: types.SchemaType<any>, loader?: any } = Record<string, never>,
	TShape = GetObjectGeneratordShape<TFinalConfig> & TShapeExtras,
	TRequiredShape =
	& (TShapeExtras extends { inputSchema: any } ? GetObjectGeneratorRequiredShape<TFinalConfig> & { inputSchema: any } : GetObjectGeneratorRequiredShape<TFinalConfig>)
	& (TShapeExtras extends { loader: any } ? GetObjectGeneratorRequiredShape<TFinalConfig> & { loader: any } : GetObjectGeneratorRequiredShape<TFinalConfig>)
> =
	// Reusable for object streamer
	// 1. Check for excess properties in TConfig based on the final merged config's own `output` mode.
	(keyof Omit<TConfig, keyof TShape> extends never
		// 2. If no excess, check for properties missing from the FINAL merged config.
		? (
			keyof Omit<
				TRequiredShape,
				keyof TFinalConfig
			> extends never
			? TConfig //All checks passed.
			: `Config Error: Missing required properties for output mode '${GetOutputType<TFinalConfig>}' - '${keyof
			Omit<TRequiredShape, keyof TFinalConfig> & string}'`
		)
		: `Config Error: Unknown properties for output mode '${GetOutputType<TFinalConfig>}' - '${keyof Omit<TConfig, GetAllowedKeysForConfig<TFinalConfig>> & string}'`
	);

export type ValidateObjectParentConfig<
	TParentConfig extends Partial<GenerateObjectConfig<any, any, any> & { output?: string | undefined }>,
	TFinalConfig extends AllSpecializedProperties & Record<string, any>,
	TShapeExtras extends { output?: string | undefined, inputSchema?: types.SchemaType<any>, loader?: any } = Record<string, never>,
	TShape = GetObjectGeneratordShape<TFinalConfig> & TShapeExtras
> =
	// Check for excess properties in the parent
	keyof Omit<TParentConfig, keyof TShape> extends never
	// The check has passed, return the original config type.
	? TParentConfig
	// On excess property failure, return a descriptive string.
	: `Parent Config Error: Unknown properties for final output mode '${GetOutputType<TFinalConfig>}' - ${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig>> & string}`;

// A text-only prompt has no inputs
function withText<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM>,
	OUTPUT, //@out
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig>>,

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
		parent as ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>, false
	) as unknown as GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM>
}

function withTextAsTool<
	const TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.ToolConfig<Record<string, never>, OUTPUT>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ToolConfig<Record<string, never>, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;

function withTextAsTool<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.ToolConfig<Record<string, never>, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ToolConfig<Record<string, never>, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ToolConfig<Record<string, never>, any>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;

function withTextAsTool<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.ToolConfig<Record<string, never>, OUTPUT>,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.LoaderConfig>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
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
		parent as ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>, false
	) as unknown as GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM>;
}

function loadsTextAsTool<
	const TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM>
	& results.RendererTool<Record<string, never>, OUTPUT>;

function loadsTextAsTool<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig & configs.ToolConfig<Record<string, never>, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig & configs.ToolConfig<Record<string, never>, any>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<Record<string, never>, OUTPUT>;

function loadsTextAsTool<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TConfig, configs.TemplatePromptConfig>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig>>

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
	return _createObjectGenerator(config, 'async-template', parent, false) as unknown as GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM>;
}

function withTemplateAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<any, any>>>

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
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>>

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
	return _createObjectGenerator(config, 'async-template-name', parent, false) as unknown as GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM>;
}

function loadsTemplateAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsTemplateAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsTemplateAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
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
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig>,
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig>>

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
	return _createObjectGenerator(config, 'async-script', parent, false) as unknown as GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM>;
}

function withScriptAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;

function withScriptAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<any, any>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<INPUT, OUTPUT>;

function withScriptAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
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
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>>

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
	return _createObjectGenerator(config, 'async-script-name', parent, false) as unknown as GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM>;
}

function loadsScriptAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM> & results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
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
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>,
	isTool = false,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as unknown as configs.GenerateObjectObjectConfig<any, any>).output === undefined) {
		(merged as unknown as configs.GenerateObjectObjectConfig<any, any>).output = 'object';
	}

	validateObjectLLMConfig(merged, promptType, isTool, false); // isStreamer = false

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
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM> & results.RendererTool<INPUT, OUTPUT> {

	const renderer = _createObjectGenerator(config, promptType, parent, true) as unknown as
		results.RendererTool<INPUT, OUTPUT> & { config: TConfig };
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema!;
	renderer.type = 'function';//Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options contains _toolCallOptions
	renderer.execute = async (args: INPUT, options: ToolCallOptions): Promise<OUTPUT> => {
		// Merge the _toolCallOptions into the context so templates can access it
		const contextWithToolOptions = { ...args, _toolCallOptions: options };
		return (await (renderer as unknown as (context: INPUT & { _toolCallOptions: ToolCallOptions }) => Promise<results.GenerateObjectObjectResult<OUTPUT>>)(contextWithToolOptions)).object;
	};
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
	asTool: withTextAsTool
});