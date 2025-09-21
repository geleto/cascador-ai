import { generateObject, LanguageModel, ModelMessage, ToolCallOptions } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMComponent } from "../llm-component";
import { mergeConfigs, processConfig } from "../config-utils";
import { validateObjectLLMConfig } from "../validate";

type GenerateObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	ENUM extends string,
	PROMPT extends types.AnyPromptSource = string
> =
	configs.GenerateObjectObjectConfig<INPUT, OUTPUT, PROMPT> |
	configs.GenerateObjectArrayConfig<INPUT, OUTPUT, PROMPT> |
	configs.GenerateObjectEnumConfig<INPUT, ENUM, PROMPT> |
	configs.GenerateObjectNoSchemaConfig<INPUT, PROMPT>;

type CommonGenerateObjectConfig = GenerateObjectConfig<Record<string, any>, any, string, types.AnyPromptSource>;

type CommonGenerateObjectObjectConfig = configs.GenerateObjectObjectConfig<Record<string, any>, any, types.AnyPromptSource>;
type CommonGenerateObjectArrayConfig = configs.GenerateObjectArrayConfig<Record<string, any>, any, types.AnyPromptSource>;
type CommonGenerateObjectEnumConfig = configs.GenerateObjectEnumConfig<Record<string, any>, string, types.AnyPromptSource>;
type CommonGenerateObjectNoSchemaConfig = configs.GenerateObjectNoSchemaConfig<Record<string, any>, types.AnyPromptSource>;

// Parameterize return types by concrete promptType literal used by implementation
type GenerateObjectReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	ENUM extends string,
	PROMPT extends types.AnyPromptSource,
	TConfigShape = Record<string, any>//temp assignment
//TConfigShape extends CommonGenerateObjectConfig = CommonGenerateObjectConfig//temp assignment
> =
	TConfig extends { output: 'array', schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType, PROMPT, TConfigShape>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'enum', enum: readonly (ENUM)[] }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>, PType, PROMPT, TConfigShape>
	: TConfig extends { output: 'enum' }
	? `Config Error: Enum output requires an enum`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>, PType, PROMPT, TConfigShape>
	: TConfig extends { output?: 'object' | undefined, schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType, PROMPT, TConfigShape>
	: `Config Error: Object output requires a schema`;

// With parent
type GenerateObjectWithParentReturn<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	ENUM extends string,
	PARENT_OUTPUT, //@out
	PARENT_ENUM extends string,
	PROMPT extends types.AnyPromptSource,
	TConfigShape = Record<string, any>, //temp assignment
	TFinalConfig = utils.Override<TParentConfig, TConfig>,

//TConfigShape extends CommonGenerateObjectConfig
> =
	GenerateObjectReturn<
		TFinalConfig & configs.BaseConfig, // & configs.OptionalPromptConfig,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT, //@out
		ENUM extends never ? PARENT_ENUM : ENUM,
		PROMPT,
		TConfigShape
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
	TConfig extends Partial<configs.GenerateObjectBaseConfig<any, any> & { output?: string | undefined }>,
	TFinalConfig extends AllSpecializedProperties & Record<string, any>,
	TShapeExtras = Record<string, never>, // extends { output?: string | undefined, inputSchema?: types.SchemaType<any>, loader?: any } = Record<string, never>,
	TShape = GetObjectGeneratordShape<TFinalConfig> & TShapeExtras,
	TRequiredShape =
	& (TShapeExtras extends { inputSchema: any } ? GetObjectGeneratorRequiredShape<TFinalConfig> & { inputSchema: any } : GetObjectGeneratorRequiredShape<TFinalConfig>)
	& (TShapeExtras extends { loader: any } ? GetObjectGeneratorRequiredShape<TFinalConfig> & { loader: any } : GetObjectGeneratorRequiredShape<TFinalConfig>)
	& (TShape extends configs.ToolConfig<any, any> ? { prompt: any, model: LanguageModel } : { model: LanguageModel })//@todo - messages instead of prompt?
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
	TParentConfig extends Partial<GenerateObjectConfig<any, any, any, any> & { output?: string | undefined }>,
	TFinalConfig extends AllSpecializedProperties & Record<string, any>,
	TShapeExtras /*extends { output?: string | undefined, inputSchema?: types.SchemaType<any>, loader?: any }*/ = Record<string, never>,
	TShape = GetObjectGeneratordShape<TFinalConfig> & TShapeExtras,
> =
	// Check for excess properties in the parent
	keyof Omit<TParentConfig, keyof TShape> extends never
	// The check has passed, return the original config type.
	? TParentConfig
	// On excess property failure, return a descriptive string.
	: `Parent Config Error: Unknown properties for final output mode '${GetOutputType<TFinalConfig>}' - ${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig>> & string}`;

// A text-only prompt has no inputs
function withText<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM, PROMPT>,
	OUTPUT, //@out
	ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig>,
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM, PROMPT>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM, PROMPT>>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM, PROMPT>>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig>>,
): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, PROMPT>

// Implementation signature that handles both cases
function withText<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM>,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM, PROMPT> {
	return _createObjectGenerator(config as GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig, 'text',
		parent as configs.ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>, false
	) as unknown as GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM, PROMPT>
}

function withTextAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM, PROMPT> & results.ComponentTool<INPUT, OUTPUT>;

function withTextAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>,

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

//Implementation
function withTextAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>,
		'text',
		parent as configs.ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text', OUTPUT, ENUM, PROMPT> & results.ComponentTool<INPUT, OUTPUT>;
}

function loadsText<
	const TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM, PROMPT> & configs.LoaderConfig,
	OUTPUT,
	ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM, PROMPT>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<GenerateObjectConfig<never, OUTPUT, ENUM, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & configs.LoaderConfig>,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig>>,

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, PROMPT>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends GenerateObjectConfig<never, OUTPUT, ENUM> & configs.LoaderConfig,
	TParentConfig extends GenerateObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM> & configs.LoaderConfig,
	OUTPUT,
	ENUM extends string,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM, string> {
	return _createObjectGenerator(
		config,
		'text-name',
		parent as configs.ConfigProvider<GenerateObjectConfig<never, OUTPUT, ENUM> & configs.OptionalPromptConfig>, false
	) as unknown as GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM, PROMPT>;
}

function loadsTextAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'text-name', OUTPUT, ENUM, PROMPT>
	& results.ComponentTool<INPUT, OUTPUT>;

function loadsTextAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>,

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

//Implementation
function loadsTextAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,
	FINAL_ENUM extends string = ENUM extends never ? PARENT_ENUM : ENUM,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'text-name', FINAL_OUTPUT, FINAL_ENUM, PROMPT> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>,
		'text-name',
		parent as configs.ConfigProvider<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.OptionalPromptConfig>
	) as unknown as GenerateObjectReturn<TConfig, 'text-name', FINAL_OUTPUT, FINAL_ENUM, PROMPT> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;
}

function withTemplate<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig, configs.TemplatePromptConfig>,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, string>;

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
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, string> {
	return _createObjectGenerator(config, 'async-template', parent, false) as unknown as GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, string>;
}

function withTemplateAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;

function withTemplateAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM>> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>,
		'async-template',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;
}

function loadsTemplate<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM, string>;

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
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM, string> {
	return _createObjectGenerator(config, 'async-template-name', parent, false) as unknown as GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM, string>;
}

function loadsTemplateAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;

function loadsTemplateAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>,
		'async-template-name',
		parent as configs.ConfigProvider<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>>
	) as unknown as GenerateObjectReturn<TConfig, 'async-template-name', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;
}

function withScript<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig>,
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM, string>;

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
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM, string> {
	return _createObjectGenerator(config, 'async-script', parent, false) as unknown as GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM, string>;
}

function withScriptAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;

function withScriptAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>,
		'async-script',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'async-script', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;
}

function loadsScript<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM, string>;

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
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM, string> {
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
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, string> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

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
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>,
		'async-script-name',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'async-script-name', OUTPUT, ENUM, string> & results.ComponentTool<INPUT, OUTPUT>;
}

function withFunction<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.FunctionPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.FunctionPromptConfig>,
): GenerateObjectReturn<TConfig, 'function', OUTPUT, ENUM, PROMPT>;

// Overload 2: With parent parameter
function withFunction<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.FunctionPromptConfig>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & configs.FunctionPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>, //@todo we need just the correct output type
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.FunctionPromptConfig, PROMPT>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.FunctionPromptConfig>>,

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'function', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, PROMPT>;

// Implementation signature that handles both cases
function withFunction<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.FunctionPromptConfig,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & configs.FunctionPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'function', OUTPUT, ENUM, PROMPT> {
	return _createObjectGenerator(config, 'function', parent, false) as unknown as GenerateObjectReturn<TConfig, 'function', OUTPUT, ENUM, PROMPT>;
}

function withFunctionAsTool<
	const TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PROMPT extends types.PromptFunction = types.PromptFunction
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.FunctionPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): GenerateObjectReturn<TConfig, 'function', OUTPUT, ENUM, PROMPT> & results.ComponentTool<INPUT, OUTPUT>;

function withFunctionAsTool<
	TConfig extends Partial<GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends types.PromptFunction = types.PromptFunction,

	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.FunctionPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.FunctionPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>

): GenerateObjectWithParentReturn<TConfig, TParentConfig, 'function', OUTPUT, ENUM, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

function withFunctionAsTool<
	TConfig extends GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends GenerateObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM, PROMPT> & configs.FunctionPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
	PROMPT extends types.PromptFunction = types.PromptFunction,
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig, 'function', OUTPUT, ENUM, PROMPT> & results.ComponentTool<INPUT, OUTPUT> {
	return _createObjectGeneratorAsTool(
		config as GenerateObjectConfig<INPUT, OUTPUT, ENUM, PROMPT> & configs.OptionalPromptConfig & results.ComponentTool<INPUT, OUTPUT>,
		'async-script',
		parent
	) as unknown as GenerateObjectReturn<TConfig, 'function', OUTPUT, ENUM, PROMPT> & results.ComponentTool<INPUT, OUTPUT>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectGenerator<
	TConfig extends configs.GenerateObjectBaseConfig<INPUT, PROMPT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PROMPT extends types.AnyPromptSource
>(
	config: TConfig,
	promptType: types.PromptType,
	parent?: configs.ConfigProvider<configs.BaseConfig>,
	isTool = false,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, PROMPT> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : processConfig(config)), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic
	if ((merged as unknown as configs.GenerateObjectObjectConfig<any, any>).output === undefined) {
		(merged as unknown as configs.GenerateObjectObjectConfig<any, any>).output = 'object';
	}

	validateObjectLLMConfig(merged, promptType, isTool, false); // isStreamer = false

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMComponent(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: types.SchemaType<any> },
		generateObject as (config: configs.OptionalPromptConfig) => any
	) as unknown as GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, PROMPT>;
}

function _createObjectGeneratorAsTool<
	TConfig extends configs.StreamObjectBaseConfig<INPUT, PROMPT> & configs.OptionalPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,
	PROMPT extends types.AnyPromptSource = types.AnyPromptSource,
>(
	config: TConfig & { description?: string; inputSchema: types.SchemaType<INPUT> },
	promptType: types.PromptType,
	parent?: configs.ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>,
): GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, PROMPT> & results.ComponentTool<INPUT, OUTPUT> {

	const renderer = _createObjectGenerator(config, promptType, parent, true) as unknown as
		results.ComponentTool<INPUT, OUTPUT> & { config: TConfig };
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema!;
	renderer.type = 'function';//Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options contains _toolCallOptions
	renderer.execute = async (args: INPUT, options: ToolCallOptions): Promise<OUTPUT> => {
		// Merge the _toolCallOptions into the context so templates can access it
		const contextWithToolOptions = { ...args, _toolCallOptions: options };
		return (await (renderer as unknown as (context: INPUT & { _toolCallOptions: ToolCallOptions }) => Promise<results.GenerateObjectObjectResult<OUTPUT>>)(contextWithToolOptions)).object;
	};
	return renderer as (typeof renderer & GenerateObjectReturn<TConfig, 'async-template', OUTPUT, ENUM, PROMPT>);
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
	withFunction: Object.assign(withFunction, {
		asTool: withFunctionAsTool,
	}),
	asTool: withTextAsTool
});