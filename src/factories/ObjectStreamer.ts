import { streamObject, LanguageModel, ToolCallOptions } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from "../types/types";

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateBaseConfig, validateObjectConfig } from "../validate";

import type { ValidateObjectConfig, ValidateObjectParentConfig } from "./ObjectGenerator";

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
	| configs.StreamObjectNoSchemaConfig<INPUT, OUTPUT>
) & configs.OptionalPromptConfig;

export type ObjectStreamerInstance<
	TConfig extends LLMStreamerConfig<INPUT, OUTPUT>,
	PType extends types.RequiredPromptType,
	INPUT extends Record<string, any>,
	OUTPUT,

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
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
> =
	TConfig extends { output: 'array', schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>, PType>
	: TConfig extends { output?: 'object' | undefined, schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType>
	: `Config Error: Object output requires a schema`;

// With parent
type StreamObjectWithParentReturn<
	TConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	TParentConfig extends configs.BaseConfig & configs.OptionalPromptConfig,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PARENT_OUTPUT, //@out

	TFinalConfig = utils.Override<TParentConfig, TConfig>
> =
	StreamObjectReturn<
		TFinalConfig & configs.OptionalPromptConfig,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT
	>

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.StreamObjectArrayConfig<any, any>;
	'no-schema': configs.StreamObjectNoSchemaConfig<any>;
	object: configs.StreamObjectObjectConfig<any, any>;
}

interface AllSpecializedProperties { output?: ConfigOutput, schema?: types.SchemaType<any>, model?: LanguageModel, enum?: readonly string[] }

type ConfigOutput = keyof ConfigShapeMap | undefined;
//type ConfigOutput = 'array' | 'enum' | 'no-schema' | 'object' | undefined;


// A text-only prompt has no inputs
function withText<
	TConfig extends StreamObjectConfig<never, OUTPUT>,
	OUTPUT, //@out
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig>,
): StreamObjectReturn<TConfig, 'text', OUTPUT>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT>>,
	OUTPUT,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig>>,

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, PARENT_OUTPUT>

// Implementation signature that handles both cases
function withText<
	TConfig extends StreamObjectConfig<never, OUTPUT>,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT>,
	OUTPUT,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text', OUTPUT> {
	return _createObjectStreamer(config as StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig, 'text',
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>
	) as unknown as StreamObjectReturn<TConfig, 'text', OUTPUT>;
}

function withTextAsTool<
	const TConfig extends StreamObjectConfig<never, OUTPUT> & configs.ToolConfig<Record<string, never>, OUTPUT>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ToolConfig<Record<string, never>, OUTPUT>>,
): StreamObjectReturn<TConfig, 'text', OUTPUT> & results.RendererTool<Record<string, never>, OUTPUT>;

function withTextAsTool<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT> & configs.ToolConfig<Record<string, never>, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT> & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>>,
	OUTPUT,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ToolConfig<Record<string, never>, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ToolConfig<Record<string, never>, any>>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, PARENT_OUTPUT> & results.RendererTool<Record<string, never>, OUTPUT>;

function withTextAsTool<
	TConfig extends StreamObjectConfig<never, OUTPUT> & configs.ToolConfig<Record<string, never>, OUTPUT>,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT> & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>,
	OUTPUT,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text', OUTPUT> & results.RendererTool<Record<string, never>, OUTPUT> {
	return _createObjectStreamerAsTool(
		config as StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig & results.RendererTool<Record<string, never>, OUTPUT>,
		'text',
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>
	) as unknown as StreamObjectReturn<TConfig, 'text', OUTPUT> & results.RendererTool<Record<string, never>, OUTPUT>;
}

function loadsText<
	const TConfig extends StreamObjectConfig<never, OUTPUT> & configs.LoaderConfig,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'text-name', OUTPUT>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT> & configs.LoaderConfig>,
	OUTPUT,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, PARENT_OUTPUT>;


// Implementation signature that handles both cases
function loadsText<
	TConfig extends StreamObjectConfig<never, OUTPUT> & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT> & configs.LoaderConfig,
	OUTPUT,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text-name', OUTPUT> {
	return _createObjectStreamer(
		config,
		'text-name',
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>
	) as unknown as StreamObjectReturn<TConfig, 'text-name', OUTPUT>;
}

function loadsTextAsTool<
	const TConfig extends StreamObjectConfig<never, OUTPUT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>>,
): StreamObjectReturn<TConfig, 'text-name', OUTPUT>
	& results.RendererTool<Record<string, never>, OUTPUT>;

function loadsTextAsTool<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>>,
	OUTPUT,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig & configs.ToolConfig<Record<string, never>, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig & configs.ToolConfig<Record<string, never>, any>>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, PARENT_OUTPUT> & results.RendererTool<Record<string, never>, OUTPUT>;

function loadsTextAsTool<
	TConfig extends StreamObjectConfig<never, OUTPUT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, OUTPUT>,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT> & configs.LoaderConfig & configs.ToolConfig<Record<string, never>, PARENT_OUTPUT>,
	OUTPUT,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text-name', OUTPUT> & results.RendererTool<Record<string, never>, OUTPUT> {
	return _createObjectStreamerAsTool(
		config as StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig & results.RendererTool<Record<string, never>, OUTPUT>,
		'text-name',
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>
	) as unknown as StreamObjectReturn<TConfig, 'text-name', OUTPUT> & results.RendererTool<Record<string, never>, OUTPUT>;
}

function withTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig, configs.TemplatePromptConfig>,
): StreamObjectReturn<TConfig, 'async-template', OUTPUT>;

// Overload 2: With parent parameter
function withTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & configs.TemplatePromptConfig,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & configs.TemplatePromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function withTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig,
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

function withTemplateAsTool<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function withTemplateAsTool<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.ToolConfig<any, any>>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template', OUTPUT, PARENT_OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function withTemplateAsTool<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT>> & configs.TemplatePromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT>> & configs.TemplatePromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectStreamerAsTool(
		config as StreamObjectConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-template',
		parent
	) as unknown as StreamObjectReturn<TConfig, 'async-template', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;
}

function loadsTemplate<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'async-template-name', OUTPUT>;

// Overload 2: With parent parameter
function loadsTemplate<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function loadsTemplate<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig,
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

function loadsTemplateAsTool<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): StreamObjectReturn<TConfig, 'async-template-name', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function loadsTemplateAsTool<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-template-name', OUTPUT, PARENT_OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function loadsTemplateAsTool<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.TemplatePromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-template-name', OUTPUT> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectStreamerAsTool(
		config as StreamObjectConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-template-name',
		parent
	) as unknown as StreamObjectReturn<TConfig, 'async-template-name', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;
}

function withScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig>,
): StreamObjectReturn<TConfig, 'async-script', OUTPUT>;

// Overload 2: With parent parameter
function withScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function withScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig,
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

function withScriptAsTool<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): StreamObjectReturn<TConfig, 'async-script', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function withScriptAsTool<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.ToolConfig<any, any>>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script', OUTPUT, PARENT_OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function withScriptAsTool<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-script', OUTPUT> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectStreamerAsTool(
		config as StreamObjectConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-script',
		parent
	) as unknown as StreamObjectReturn<TConfig, 'async-script', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;
}

function loadsScript<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
): StreamObjectReturn<TConfig, 'async-script-name', OUTPUT>;

// Overload 2: With parent parameter
function loadsScript<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, PARENT_OUTPUT>;

// Implementation signature that handles both cases
function loadsScript<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig,
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

function loadsScriptAsTool<
	const TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
): StreamObjectReturn<TConfig, 'async-script-name', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<any, any>>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'async-script-name', OUTPUT, PARENT_OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends StreamObjectConfig<INPUT, OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<INPUT, OUTPUT>,
	TParentConfig extends StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.ScriptPromptConfig & configs.LoaderConfig & configs.ToolConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'async-script-name', OUTPUT> & results.RendererTool<INPUT, OUTPUT> {
	return _createObjectStreamerAsTool(
		config as StreamObjectConfig<INPUT, OUTPUT> & configs.OptionalPromptConfig & results.RendererTool<INPUT, OUTPUT>,
		'async-script-name',
		parent
	) as unknown as StreamObjectReturn<TConfig, 'async-script-name', OUTPUT> & results.RendererTool<INPUT, OUTPUT>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends configs.StreamObjectBaseConfig<INPUT> & configs.OptionalPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig,
	promptType: types.PromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as unknown as configs.StreamObjectObjectConfig<any, any>).output === undefined) {
		(merged as unknown as configs.StreamObjectObjectConfig<any, any>).output = 'object';
	}

	validateBaseConfig(merged);
	validateObjectConfig(merged, false);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return _createLLMRenderer(
		merged as configs.OptionalPromptConfig & { model: LanguageModel, prompt: string, schema: types.SchemaType<any> },
		streamObject as (config: configs.OptionalPromptConfig) => any
	) as unknown as StreamObjectReturn<TConfig, 'async-template', OUTPUT>;
}

function _createObjectStreamerAsTool<
	TConfig extends configs.StreamObjectBaseConfig<INPUT> & configs.OptionalPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & { description?: string; inputSchema: types.SchemaType<INPUT> },
	promptType: types.PromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> & results.RendererTool<INPUT, OUTPUT> {

	const renderer = _createObjectStreamer(config, promptType, parent) as unknown as results.RendererTool<INPUT, OUTPUT>;
	renderer.description = config.description;
	renderer.inputSchema = config.inputSchema;
	renderer.type = 'function';//Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context objectm optiions is not used
	renderer.execute = renderer as unknown as (args: any, options: ToolCallOptions) => PromiseLike<any>;
	return renderer as (typeof renderer & StreamObjectReturn<TConfig, 'async-template', OUTPUT>);
}

export const ObjectStreamer = Object.assign(withText, { // default is withText
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