import {
	generateText, generateObject, streamText, streamObject,
	Schema, JSONValue, Tool,
	ToolSet,
	ToolExecutionOptions
} from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-engine';
import { z } from 'zod';
import { TemplatePromptType, ScriptType, LLMPromptType } from './types';
import { InferParameters } from './type-utils';

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

interface CascadaConfig extends BaseConfig {
	context?: Record<string, any>;
	filters?: Record<string, (input: any, ...args: any[]) => any>;
	options?: ConfigureOptions;
	loader?: ILoaderAny | ILoaderAny[] | null;
}

interface LLMConfig extends BaseConfig { promptType?: LLMPromptType }

// Config for the template engine with type safety for loader requirement
export interface TemplateConfig extends CascadaConfig {
	prompt?: string;
	promptType?: TemplatePromptType;
}

export type OptionalTemplateConfig = TemplateConfig | { promptType: 'text' };

// Script types
export interface ScriptConfig extends CascadaConfig {
	script?: string;
	scriptType?: ScriptType;
};

export type OptionalScriptConfig = ScriptConfig | { scriptType: 'text' };


export type ToolParameters = z.ZodTypeAny | Schema<any>;

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
	execute: (args: InferParameters<PARAMETERS>, options: ToolExecutionOptions) => PromiseLike<RESULT>;
}


// Config types
// All of them are partials because they can be requested in pieces,
// and because doing Partial on the zod schema property makes it do deepPartial on it's properties which breaks it

// The first argument of generateText
export type GenerateTextConfig<
	TOOLS extends ToolSet = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never
> = Partial<Parameters<typeof generateText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0] & LLMConfig>;

// The first argument of streamText
export type StreamTextConfig<
	TOOLS extends ToolSet = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never
> = Partial<Parameters<typeof streamText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0] & LLMConfig>;

// We get the last overload which is the no-schema overload and make it base by omitting the output and mode properties
export type GenerateObjectBaseConfig = Partial<Omit<Parameters<typeof generateObject>[0], | 'output' | 'mode'>> & LLMConfig;

export type GenerateObjectObjectConfig<OBJECT> = GenerateObjectBaseConfig & {
	output?: 'object' | undefined;
	schema?: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectArrayConfig<ELEMENT> = GenerateObjectBaseConfig & {
	output?: 'array';
	schema?: z.Schema<ELEMENT, z.ZodTypeDef, any> | Schema<ELEMENT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectEnumConfig<ENUM extends string> = GenerateObjectBaseConfig & {
	output?: 'enum';
	enum?: ENUM[];
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectNoSchemaConfig = GenerateObjectBaseConfig & {
	output: 'no-schema';
	mode?: 'json';
}

// We get the last overload which is the no-schema overload and make it base by omitting the output and mode properties
export type StreamObjectBaseConfig = Partial<Omit<Parameters<typeof streamObject>[0], | 'output' | 'mode'>> & LLMConfig;

export type StreamObjectObjectConfig<OBJECT> = StreamObjectBaseConfig & {
	output?: 'object' | undefined;
	schema?: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: (event: { object: OBJECT | undefined; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }) => void;
}

export type StreamObjectArrayConfig<ELEMENT> = StreamObjectBaseConfig & {
	output?: 'array';
	schema?: z.Schema<ELEMENT, z.ZodTypeDef, any> | Schema<ELEMENT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: (event: { object: ELEMENT[] | undefined; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }) => void;
	elementStream?: AsyncIterable<ELEMENT> & ReadableStream<ELEMENT>;
}

export type StreamObjectNoSchemaConfig = StreamObjectBaseConfig & {
	output?: 'no-schema';
	mode?: 'json';
	onFinish?: (event: { object: JSONValue | undefined; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }) => void;
}

export type AnyNoTemplateConfig<
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string,
> =
	| GenerateTextConfig<TOOLS, OUTPUT>
	| StreamTextConfig<TOOLS, OUTPUT>
	| GenerateObjectObjectConfig<OBJECT>
	| GenerateObjectArrayConfig<ELEMENT>
	| GenerateObjectEnumConfig<ENUM>
	| GenerateObjectNoSchemaConfig
	| StreamObjectObjectConfig<OBJECT>
	| StreamObjectArrayConfig<ELEMENT>
	| StreamObjectNoSchemaConfig;

export type AnyConfig<
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string,
> =
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM> & { promptType: 'text' }) // text mode - no template props
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM> & TemplateConfig); // template modes including undefined