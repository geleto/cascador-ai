import {
	generateText, generateObject, streamText, streamObject,
	Schema, //do not confuze the 'ai' Schema type with the 'zod' Schema type
	JSONValue,
	ToolSet,
	ToolCallOptions,
	StreamObjectOnFinishCallback,
	ModelMessage
} from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-engine';
import { z } from 'zod';
import {
	TemplatePromptType, ScriptPromptType, /*, LLMPromptType */
	SchemaType
} from './types';
import { InferParameters } from './utils';

// Some of the hacks here are because Parameters<T> helper type only returns the last overload type
// https://github.com/microsoft/TypeScript/issues/54223
// This is a problem because generateObject and streamObject have multiple overloads with different config and return types
// To overcome this:
// I get the generateText config type and exclude all properties specific only to it to get the base config type
// Then I add the specific properties for each function/overload - which are not many
// This is much less likely to break in future Vercel versions than copy/pasting the whole type definitions

interface BaseConfig {
	debug?: boolean;
}

export type CascadaFilter = Record<string, (input: any, ...args: any[]) => any>;

// Shared for scripts and templates
export interface CascadaConfig extends BaseConfig {
	context?: Record<string, any>;
	filters?: CascadaFilter;
	options?: ConfigureOptions;
	loader?: ILoaderAny | ILoaderAny[] | null;
}

export interface LoaderConfig extends BaseConfig {
	loader: ILoaderAny | ILoaderAny[];
}

// Config for the template engine with type safety for loader requirement
export interface TemplatePromptConfig<PROMPT = string> extends CascadaConfig {
	prompt?: PROMPT;
	messages?: ModelMessage[];
	promptType?: TemplatePromptType;
}

export type OptionalTemplatePromptConfig<PROMPT = string> = TemplatePromptConfig<PROMPT> | { promptType: 'text'/*, prompt?: string */ };

export interface ScriptPromptConfig<PROMPT = string> extends ScriptConfig<PROMPT> {
	prompt?: PROMPT;
	messages?: ModelMessage[];
	promptType?: ScriptPromptType;
}

export type OptionalScriptPromptConfig<PROMPT = string> = ScriptPromptConfig<PROMPT> | { promptType: 'text'/*, prompt?: string */ };

export type OptionalPromptConfig<PROMPT = string> = OptionalTemplatePromptConfig<PROMPT> | OptionalScriptPromptConfig<PROMPT>;

// Script types
export interface ScriptConfig<OBJECT> extends CascadaConfig {
	script?: string;
	promptType?: ScriptPromptType;
	schema?: SchemaType<OBJECT>;
};

export type ToolParameters = z.ZodTypeAny | Schema<any>;//@todo - specialize for OBJECT

/**
 * The configuration object passed to the `create.Tool` factory.
 * It is the vercel function tool without the execute function.
 */
export type ToolConfig<PARAMETERS extends ToolParameters = any> = BaseConfig & {
	type?: 'function';
	description?: string;
	parameters: PARAMETERS;
}

/**
 * The output of the `create.Tool` factory.
 * This is a complete, executable tool object that is compatible with the Vercel AI SDK's `ToolSet`.
 */
export type FunctionTool<PARAMETERS extends ToolParameters = any, RESULT = any> = ToolConfig<PARAMETERS> & {
	execute: (args: InferParameters<PARAMETERS>, options: ToolCallOptions) => PromiseLike<RESULT>;
}

// Utility types


// Config types
// All of them are partials because they can be requested in pieces,
// and because doing Partial on the zod schema property makes it do deepPartial on it's properties which breaks it

// The first argument of generateText
export type GenerateTextConfig<
	TOOLS extends ToolSet = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never,
	PROMPT = string
> = Omit<Parameters<typeof generateText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0], 'prompt'> & BaseConfig & { prompt?: PROMPT };

// The first argument of streamText
export type StreamTextConfig<
	TOOLS extends ToolSet = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never,
	PROMPT = string
> = Omit<Parameters<typeof streamText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0], 'prompt'> & BaseConfig & { prompt?: PROMPT };

// We get the last overload which is the no-schema overload and make it base by omitting the output and mode properties
export type GenerateObjectBaseConfig<PROMPT = string> =
	Omit<Parameters<typeof generateObject>[0], | 'output' | 'mode' | 'prompt'> & BaseConfig & { prompt?: PROMPT };

export type GenerateObjectObjectConfig<OBJECT, PROMPT = string> = GenerateObjectBaseConfig<PROMPT> & {
	output?: 'object' | undefined;
	schema: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectArrayConfig<ELEMENT, PROMPT = string> = GenerateObjectBaseConfig<PROMPT> & {
	output: 'array';
	schema: z.Schema<ELEMENT, z.ZodTypeDef, any> | Schema<ELEMENT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectEnumConfig<ENUM extends string, PROMPT = string> = GenerateObjectBaseConfig<PROMPT> & {
	output: 'enum';
	enum: readonly ENUM[];
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectNoSchemaConfig<PROMPT = string> = GenerateObjectBaseConfig<PROMPT> & {
	output: 'no-schema';
	mode?: 'json';
}

// We get the last overload which is the no-schema overload and make it base by omitting the output and mode properties
export type StreamObjectBaseConfig<RESULT, PROMPT = string> =
	Omit<Parameters<typeof streamObject>[0], | 'output' | 'mode' | 'prompt' | 'onFinish'>
	& BaseConfig
	& { prompt?: PROMPT; onFinish?: StreamObjectOnFinishCallback<RESULT>; };

export type StreamObjectObjectConfig<OBJECT, PROMPT = string> = StreamObjectBaseConfig<OBJECT, PROMPT> & {
	output?: 'object' | undefined;
	schema: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type StreamObjectArrayConfig<ELEMENT, PROMPT = string> = StreamObjectBaseConfig<ELEMENT[], PROMPT> & {
	output: 'array';
	schema: z.Schema<ELEMENT, z.ZodTypeDef, any> | Schema<ELEMENT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type StreamObjectNoSchemaConfig<PROMPT = string> = StreamObjectBaseConfig<JSONValue, PROMPT> & {
	output: 'no-schema';
	mode?: 'json';
}

export type AnyNoTemplateConfig<
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string,
	PROMPT = string
> =
	| GenerateTextConfig<TOOLS, OUTPUT, PROMPT>
	| StreamTextConfig<TOOLS, OUTPUT, PROMPT>
	| GenerateObjectObjectConfig<OBJECT, PROMPT>
	| GenerateObjectArrayConfig<ELEMENT, PROMPT>
	| GenerateObjectEnumConfig<ENUM, PROMPT>
	| GenerateObjectNoSchemaConfig<PROMPT>
	| StreamObjectObjectConfig<OBJECT, PROMPT>
	| StreamObjectArrayConfig<ELEMENT, PROMPT>
	| StreamObjectNoSchemaConfig<PROMPT>;

export type AnyConfig<
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string,
	PROMPT = string
> =
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM, PROMPT> & { promptType: 'text' }) // text mode - no template props
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM, PROMPT> & TemplatePromptConfig); // template modes including undefined