import { streamObject, LanguageModel, ModelMessage, ToolCallOptions } from "ai";

import * as results from '../types/result'
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as types from '../types/types';

import { LLMCallSignature, _createLLMRenderer } from "./llm-renderer";
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { validateObjectLLMConfig } from "../validate";


export type LLMStreamerConfig<
	INPUT extends Record<string, any>,
	OUTPUT,
	PROMPT extends string | ModelMessage[] = string
> = (
	| configs.StreamObjectObjectConfig<INPUT, OUTPUT, PROMPT>
	| configs.StreamObjectArrayConfig<INPUT, OUTPUT, PROMPT>
	| configs.StreamObjectNoSchemaConfig<INPUT, PROMPT>
) & configs.OptionalPromptConfig;

export type ObjectStreamerInstance<
	TConfig extends LLMStreamerConfig<INPUT, OUTPUT>,
	PType extends types.RequiredPromptType,
	INPUT extends Record<string, any>,
	OUTPUT

> = LLMCallSignature<TConfig, Promise<results.StreamObjectResultAll<OUTPUT>>, PType>;

type StreamObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT extends string | ModelMessage[] = string
> =
	configs.StreamObjectObjectConfig<INPUT, OUTPUT, PROMPT> |
	configs.StreamObjectArrayConfig<INPUT, OUTPUT, PROMPT> |
	configs.StreamObjectNoSchemaConfig<INPUT, PROMPT>;

// Parameterize return types by concrete promptType literal used by implementation
type StreamObjectReturn<
	TConfig extends configs.BaseConfig & configs.OptionalPromptConfig<PROMPT>,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PROMPT extends string | ModelMessage[] = string | ModelMessage[]
> =
	TConfig extends { output: 'array', schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>, PType, PROMPT>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>, PType, PROMPT>
	: TConfig extends { output?: 'object' | undefined, schema: types.SchemaType<OUTPUT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>, PType, PROMPT>
	: `Config Error: Object output requires a schema`;

// With parent
type StreamObjectWithParentReturn<
	TConfig extends configs.BaseConfig & configs.OptionalPromptConfig<PROMPT>,
	TParentConfig extends configs.BaseConfig & configs.OptionalPromptConfig<PROMPT>,
	PType extends types.RequiredPromptType,
	OUTPUT, //@out
	PARENT_OUTPUT, //@out
	PROMPT extends string | ModelMessage[] = string,
	TFinalConfig = utils.Override<TParentConfig, TConfig>
> =
	StreamObjectReturn<
		TFinalConfig & configs.OptionalPromptConfig<PROMPT>,
		PType,
		OUTPUT extends never ? PARENT_OUTPUT : OUTPUT, //@out
		PROMPT
	>

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.StreamObjectArrayConfig<any, any>;
	'no-schema': configs.StreamObjectNoSchemaConfig<any>;
	object: configs.StreamObjectObjectConfig<any, any>;
}

interface AllSpecializedProperties { output?: ConfigOutput, schema?: types.SchemaType<any>, model?: LanguageModel }

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
type GetObjectStreamerRequiredShape<TFinalConfig extends { output?: string }> =
	TFinalConfig extends { output: 'no-schema' } ? { model: unknown } :
	// Default case for 'object', 'array', or undefined output.
	{ schema: unknown; model: unknown };

type GetObjectStreamerdShape<TFinalConfig extends { output?: string }> =
	TFinalConfig extends { output: 'no-schema' } ? configs.StreamObjectNoSchemaConfig<any> :
	TFinalConfig extends { output: 'array' } ? configs.StreamObjectArrayConfig<any, any> :
	// Default case for 'object', 'array', or undefined output.
	configs.StreamObjectObjectConfig<any, any>;

export type ValidateObjectConfig<
	TConfig extends Partial<configs.StreamObjectBaseConfig<any, string | ModelMessage[]> & { output?: string | undefined }>,
	TFinalConfig extends AllSpecializedProperties & Record<string, any>,
	TShapeExtras = Record<string, never>, // extends { output?: string | undefined, inputSchema?: types.SchemaType<any>, loader?: any } = Record<string, never>,
	TShape = GetObjectStreamerdShape<TFinalConfig> & TShapeExtras,
	TRequiredShape =
	& (TShapeExtras extends { inputSchema: any } ? GetObjectStreamerRequiredShape<TFinalConfig> & { inputSchema: any } : GetObjectStreamerRequiredShape<TFinalConfig>)
	& (TShapeExtras extends { loader: any } ? GetObjectStreamerRequiredShape<TFinalConfig> & { loader: any } : GetObjectStreamerRequiredShape<TFinalConfig>)
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
	TParentConfig extends Partial<StreamObjectConfig<any, any, string | ModelMessage[]> & { output?: string | undefined }>,
	TFinalConfig extends AllSpecializedProperties & Record<string, any>,
	TShapeExtras extends { output?: string | undefined, inputSchema?: types.SchemaType<any>, loader?: any } = Record<string, never>,
	TShape = GetObjectStreamerdShape<TFinalConfig> & TShapeExtras
> =
	// Check for excess properties in the parent
	keyof Omit<TParentConfig, keyof TShape> extends never
	// The check has passed, return the original config type.
	? TParentConfig
	// On excess property failure, return a descriptive string.
	: `Parent Config Error: Unknown properties for final output mode '${GetOutputType<TFinalConfig>}' - ${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig>> & string}`;

// A text-only prompt has no inputs
function withText<
	TConfig extends StreamObjectConfig<never, OUTPUT, PROMPT>,
	OUTPUT, //@out
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig>,
): StreamObjectReturn<TConfig, 'text', OUTPUT, PROMPT>;

// Overload 2: With parent parameter
function withText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT, PROMPT>>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT, PROMPT>>,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig>>,

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text',
	OUTPUT, PARENT_OUTPUT, PROMPT>

// Implementation signature that handles both cases
function withText<
	TConfig extends StreamObjectConfig<never, OUTPUT>,
	TParentConfig extends StreamObjectConfig<never, PARENT_OUTPUT, PARENT_ENUM>,
	OUTPUT,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): StreamObjectReturn<TConfig, 'text', OUTPUT> {
	return _createObjectStreamer(config as StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig, 'text',
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>, false
	) as unknown as StreamObjectReturn<TConfig, 'text', OUTPUT>
}

function loadsText<
	const TConfig extends StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig,
	OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],
>(
	config: TConfig & ValidateObjectConfig<TConfig, TConfig,
		configs.LoaderConfig, PROMPT>,
): StreamObjectReturn<TConfig, 'text-name', OUTPUT, PROMPT>;

// Overload 2: With parent parameter
// @todo - does this check for loader?
function loadsText<
	TConfig extends Partial<StreamObjectConfig<never, OUTPUT, PROMPT> & configs.LoaderConfig>,
	TParentConfig extends Partial<StreamObjectConfig<never, PARENT_OUTPUT, PROMPT> & configs.LoaderConfig>,
	OUTPUT,
	PARENT_OUTPUT,
	PROMPT extends string | ModelMessage[] = string | ModelMessage[],

	TFinalConfig extends AllSpecializedProperties = utils.Override<TParentConfig, TConfig>//@todo we need just the correct output type
>(
	config: TConfig & ValidateObjectConfig<TConfig, TFinalConfig,
		configs.LoaderConfig>,
	parent: ConfigProvider<TParentConfig & ValidateObjectParentConfig<TParentConfig, TFinalConfig,
		configs.LoaderConfig>>

): StreamObjectWithParentReturn<TConfig, TParentConfig, 'text-name', OUTPUT, PARENT_OUTPUT, PROMPT>;


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
		parent as ConfigProvider<StreamObjectConfig<never, OUTPUT> & configs.OptionalPromptConfig>, false
	) as unknown as StreamObjectReturn<TConfig, 'text-name', OUTPUT>;
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
	return _createObjectStreamer(config, 'async-template', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-template', OUTPUT>;
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
	return _createObjectStreamer(config, 'async-template-name', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-template-name', OUTPUT>;
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
	TConfig extends Partial<StreamObjectConfig<INPUT, OUTPUT, ENUM> & configs.ScriptPromptConfig>,
	TParentConfig extends Partial<StreamObjectConfig<PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM> & configs.ScriptPromptConfig>,
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
	return _createObjectStreamer(config, 'async-script', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-script', OUTPUT>;
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
	return _createObjectStreamer(config, 'async-script-name', parent, false) as unknown as StreamObjectReturn<TConfig, 'async-script-name', OUTPUT>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectStreamer<
	TConfig extends configs.StreamObjectBaseConfig<INPUT> & configs.OptionalPromptConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig,
	promptType: types.PromptType,
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>,
	isTool = false,
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as unknown as configs.StreamObjectObjectConfig<any, any>).output === undefined) {
		(merged as unknown as configs.StreamObjectObjectConfig<any, any>).output = 'object';
	}

	validateObjectLLMConfig(merged, promptType, isTool, false); // isStreamer = false

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
	parent?: ConfigProvider<configs.BaseConfig & configs.OptionalPromptConfig>,
): StreamObjectReturn<TConfig, 'async-template', OUTPUT> & results.RendererTool<INPUT, OUTPUT> {

	const renderer = _createObjectStreamer(config, promptType, parent, true) as unknown as
		results.RendererTool<INPUT, OUTPUT> & { config: TConfig };
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema!;
	renderer.type = 'function';//Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options contains _toolCallOptions
	renderer.execute = async (args: INPUT, options: ToolCallOptions): Promise<OUTPUT> => {
		// Merge the _toolCallOptions into the context so templates can access it
		const contextWithToolOptions = { ...args, _toolCallOptions: options };
		return (await (renderer as unknown as (context: INPUT & { _toolCallOptions: ToolCallOptions }) => Promise<results.StreamObjectObjectResult<OUTPUT>>)(contextWithToolOptions)).object;
	};
	return renderer as (typeof renderer & StreamObjectReturn<TConfig, 'async-template', OUTPUT>);
}

export const ObjectStreamer = Object.assign(withText, { // default is withText
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});