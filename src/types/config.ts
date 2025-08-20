import {
	generateText, generateObject, streamText, streamObject,
	JSONValue,
	ToolSet,
	ToolCallOptions,
	StreamObjectOnFinishCallback,
	ModelMessage
} from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-engine';
import {
	TemplatePromptType, ScriptPromptType, /*, LLMPromptType */
	SchemaType
} from './types';

// Some of the hacks here are because Parameters<T> helper type only returns the last overload type
// https://github.com/microsoft/TypeScript/issues/54223
// This is a problem because generateObject and streamObject have multiple overloads with different config and return types
// To overcome this:
// I get the generateText config type and exclude all properties specific only to it to get the base config type
// Then I add the specific properties for each function/overload - which are not many
// This is much less likely to break in future Vercel versions than copy/pasting the whole type definitions

export interface BaseConfig {
	debug?: boolean;
	description?: string;//useful for future OpenTelemetry, error logging, etc.
}

export type CascadaFilter = Record<string, (input: any, ...args: any[]) => any>;

// Shared for scripts and templates
export interface CascadaConfig {
	context?: Record<string, any>;
	filters?: CascadaFilter;
	options?: ConfigureOptions;
	loader?: ILoaderAny | ILoaderAny[] | null;
}

export interface LoaderConfig {
	loader: ILoaderAny | ILoaderAny[];
}

/*export interface LoaderConfig<
	INPUT extends Record<string, any> = never,
	OUTPUT extends JSONValue = never,
> extends BaseConfig<INPUT, OUTPUT> {
	loader: ILoaderAny | ILoaderAny[];
}*/

// Config for the template engine with type safety for loader requirement
export interface TemplatePromptConfig<
	PROMPT = string,
> extends CascadaConfig {
	prompt?: PROMPT;
	messages?: ModelMessage[];
	promptType?: TemplatePromptType;
}

export type OptionalTemplatePromptConfig<
	PROMPT = string
> = TemplatePromptConfig<PROMPT> | { promptType: 'text'/*, prompt?: string */ };

export interface ScriptPromptConfig<
	PROMPT = string
> extends ScriptConfig {
	prompt?: PROMPT;
	messages?: ModelMessage[];
	promptType?: ScriptPromptType;
}

export type OptionalScriptPromptConfig<
	PROMPT = string
> = ScriptPromptConfig<PROMPT> | { promptType: 'text'/*, prompt?: string */ };

//@todo OptionalGeneratedPromptConfig
export type OptionalPromptConfig<
	PROMPT = string //In some cases prompt can be ModelMessage[]
> = OptionalTemplatePromptConfig<PROMPT> | OptionalScriptPromptConfig<PROMPT>;

export type PromptConfig<PROMPT = string> = TemplatePromptConfig<PROMPT> | ScriptPromptConfig<PROMPT>;

// For use in Script (where the script property is used instead of prompt)
export interface ScriptConfig extends CascadaConfig {
	script?: string;
	promptType?: ScriptPromptType;
};

export interface TemplateConfig extends CascadaConfig {
	prompt?: string;//@todo - rename to template
	promptType?: ScriptPromptType;
}

/**
 * The configuration object passed to the `create.Tool` factory.
 * It is the vercel function tool without the execute function.
 * @deprecated
 */
export type ToolConfig<INPUT extends Record<string, any> = never, OUTPUT extends JSONValue = never> = BaseConfig & {
	type?: 'function';
	description?: string;
	inputSchema: SchemaType<INPUT>;
	execute?: (args: INPUT, options: ToolCallOptions) => PromiseLike<OUTPUT>;
}

/**
 * The output of the `create.Tool` factory.
 * This is a complete, executable tool object that is compatible with the Vercel AI SDK's `ToolSet`.
 * @deprecated
 */
export interface FunctionTool<INPUT extends Record<string, any> = never, OUTPUT extends JSONValue = never> {
	description?: string;
	inputSchema: SchemaType<INPUT>;
	execute: (args: INPUT, options: ToolCallOptions) => PromiseLike<OUTPUT>;
	type: 'function';
}

// Utility types


// Config types
// All of them are partials because they can be requested in pieces,
// and because doing Partial on the zod schema property makes it do deepPartial on it's properties which breaks it

// The first argument of generateText
export type GenerateTextConfig<
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT = string,
	PARTIAL_OUTPUT = never//@todo - check this
> = Omit<Parameters<typeof generateText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0], 'prompt'>
	& BaseConfig
	& { prompt?: PROMPT, inputSchema?: SchemaType<INPUT> };

// The first argument of streamText
export type StreamTextConfig<
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT = string,
	PARTIAL_OUTPUT = never
> = Omit<Parameters<typeof streamText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0], 'prompt'>
	& BaseConfig
	& { prompt?: PROMPT, inputSchema?: SchemaType<INPUT> };

// We get the last overload which is the no-schema overload and make it base by omitting the output and mode properties
export type GenerateObjectBaseConfig<
	INPUT extends Record<string, any>,
	PROMPT = string
> = Omit<Parameters<typeof generateObject>[0], | 'output' | 'mode' | 'prompt'>
	& BaseConfig
	& { prompt?: PROMPT, inputSchema?: SchemaType<INPUT> };

export type GenerateObjectObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT = string
> = GenerateObjectBaseConfig<INPUT, PROMPT> & {
	output?: 'object' | undefined;
	schema: SchemaType<OUTPUT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectArrayConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT = string
> = GenerateObjectBaseConfig<INPUT, PROMPT> & {
	output: 'array';
	schema: SchemaType<OUTPUT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectEnumConfig<
	INPUT extends Record<string, any>,
	ENUM extends string = string,
	PROMPT = string
> = GenerateObjectBaseConfig<INPUT, PROMPT> & {
	output: 'enum';
	enum: readonly ENUM[];
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectNoSchemaConfig<
	INPUT extends Record<string, any>,
	PROMPT = string
> = GenerateObjectBaseConfig<INPUT, PROMPT> & {
	output: 'no-schema';
	mode?: 'json';
}

// We get the last overload which is the no-schema overload and make it base by omitting the output and mode properties
export type StreamObjectBaseConfig<
	INPUT extends Record<string, any> = never,
	PROMPT = string
> = Omit<Parameters<typeof streamObject>[0], | 'output' | 'mode' | 'prompt' | 'onFinish'>
	& BaseConfig
	& {
		//Bring back the removed onFinish and prompt properties
		prompt?: PROMPT;
		onFinish?: StreamObjectOnFinishCallback<any>;//@todo - use proper specialization
		inputSchema?: SchemaType<INPUT>;
	};

export type StreamObjectObjectConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT = string
> = StreamObjectBaseConfig<INPUT, PROMPT> & {
	output?: 'object' | undefined;
	schema: SchemaType<OUTPUT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type StreamObjectArrayConfig<
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	PROMPT = string
> = StreamObjectBaseConfig<INPUT, PROMPT> & {
	output: 'array';
	schema: SchemaType<OUTPUT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type StreamObjectNoSchemaConfig<
	INPUT extends Record<string, any> = never,
	PROMPT = string
> = StreamObjectBaseConfig<INPUT, PROMPT> & {
	output: 'no-schema';
	mode?: 'json';
}

export type AnyNoTemplateConfig<
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	ENUM extends string = never,
	PROMPT = string
> =
	| GenerateTextConfig<TOOLS, INPUT, OUTPUT, PROMPT>
	| StreamTextConfig<TOOLS, INPUT, OUTPUT, PROMPT>
	| GenerateObjectObjectConfig<INPUT, OUTPUT, PROMPT>
	| GenerateObjectArrayConfig<INPUT, OUTPUT, PROMPT>
	| GenerateObjectEnumConfig<INPUT, ENUM, PROMPT>
	| GenerateObjectNoSchemaConfig<INPUT, PROMPT>
	| StreamObjectObjectConfig<INPUT, OUTPUT, PROMPT>
	| StreamObjectArrayConfig<INPUT, OUTPUT, PROMPT>
	| StreamObjectNoSchemaConfig<INPUT, PROMPT>;

export type AnyConfig<
	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	ENUM extends string = string,
	PROMPT = string
> =
	| (AnyNoTemplateConfig<TOOLS, INPUT, OUTPUT, ENUM, PROMPT> & { promptType: 'text' | undefined }) // text mode - no template props
	| (AnyNoTemplateConfig<TOOLS, INPUT, OUTPUT, ENUM, PROMPT> & TemplatePromptConfig & { promptType: 'template' | 'async-template' | 'template-name' | 'async-template-name' })
	| (AnyNoTemplateConfig<TOOLS, INPUT, OUTPUT, ENUM, PROMPT> & ScriptPromptConfig & { promptType: 'script' | 'async-script' | 'script-name' | 'async-script-name' });