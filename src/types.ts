import {
	LanguageModel, Schema, generateText, streamText, streamObject,
	GenerateObjectResult, StreamObjectResult, JSONValue, DeepPartial, CoreTool,
} from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-tmpl';
import { z } from 'zod';

// Some of the hacks here are because Parameters<T> helper type only returns the last overload type
// https://github.com/microsoft/TypeScript/issues/54223
// This is a problem because generateObject and streamObject have multiple overloads with different config and return types
// To overcome this:
// I get the generateText config type and exclude all properties specific only to it to get the base config type
// Then I add the specific properties for each function/overload - which are not many
// This is much less likely to break in future Vercel versions than copy/pasting the whole type definitions

// The vercel function as passed to createLLMRenderer
export type VercelLLMFunction<TConfig, TResult> =
	(config: TConfig & { model: LanguageModel }) => Promise<TResult> | TResult;

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>

// Valid output types for object operations
export type ObjectGeneratorOutputType = 'array' | 'object' | 'no-schema' | 'enum';
export type ObjectStreamOutputType = 'array' | 'object' | 'no-schema';

// Extract the base OnFinishCallback type from streamObject
type BaseOnFinishCallback = NonNullable<Parameters<typeof streamObject>[0]['onFinish']>;

// Extract our own callback type as it's not exported
type OnFinishCallback<T> = BaseOnFinishCallback extends (event: infer E) => infer R
	? (event: { [K in keyof E]: K extends 'object' ? T | undefined : E[K] }) => R
	: never;


// Define the possible prompt types
export type TemplatePromptType = 'template' | 'async-template' | 'template-name' | 'async-template-name' | undefined;
export type LLMPromptType = TemplatePromptType | 'text';

// Config for the template engine with type safety for loader requirement
export interface TemplateConfig {
	prompt: string;
	promptType?: TemplatePromptType;
	context?: Context;
	filters?: Filters;
	options?: ConfigureOptions;
	loader?: ILoaderAny | ILoaderAny[] | null;
}

export type OptionalTemplateConfig = TemplateConfig | { promptType: 'text' };

//to get BaseConfig, omit the GenerateTextConfig specific values from GenerateTextConfig
export type BaseConfig = Omit<GenerateTextConfig,
	| 'stopSequences'
	| 'experimental_continueSteps'
	| 'experimental_output'
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
	| 'onStepFinish'
> & { promptType?: LLMPromptType };

export type GenerateTextConfig<
	TOOLS extends Record<string, CoreTool> = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never
> = Parameters<typeof generateText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0] & { promptType?: LLMPromptType };

export type StreamTextConfig<
	TOOLS extends Record<string, CoreTool> = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never
> = Parameters<typeof streamText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0] & { promptType?: LLMPromptType };

/*export type GenerateObjectConfig<TSchema, ENUM extends string> =
	| GenerateObjectObjectConfig<TSchema>
	| GenerateObjectArrayConfig<TSchema>
	| GenerateObjectEnumConfig<ENUM>
	| GenerateObjectNoSchemaConfig;*/

//export type GenerateObjectBaseConfig = BaseConfig & {
//	output: 'object' | 'array' | 'enum' | 'no-schema';
//}

export type GenerateObjectObjectConfig<TSchema> = BaseConfig & {
	output: 'object';
	schema: SchemaType<TSchema>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectArrayConfig<TSchema> = BaseConfig & {
	output: 'array';
	schema: SchemaType<TSchema>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectEnumConfig<ENUM extends string> = BaseConfig & {
	output: 'enum';
	enum: ENUM[];
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectNoSchemaConfig = BaseConfig & {
	output: 'no-schema';
	mode?: 'json';
}

export type StreamObjectObjectConfig<T> = BaseConfig & {
	output: 'object';
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<T>;
}

export type StreamObjectArrayConfig<T> = BaseConfig & {
	output: 'array';
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<T[]>;
	elementStream?: AsyncIterableStream<T>;//?
}

export type StreamObjectNoSchemaConfig = BaseConfig & {
	output: 'no-schema';
	mode?: 'json';
	onFinish?: OnFinishCallback<JSONValue>;
}

type AnyNoTemplateConfig<TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T> =
	| GenerateTextConfig<TOOLS, OUTPUT>
	| StreamTextConfig<TOOLS, OUTPUT>
	| GenerateObjectObjectConfig<TSchema>
	| GenerateObjectArrayConfig<TSchema>
	| GenerateObjectEnumConfig<ENUM>
	| GenerateObjectNoSchemaConfig
	| StreamObjectObjectConfig<T>
	| StreamObjectArrayConfig<T>
	| StreamObjectNoSchemaConfig;

export type AnyConfig<TOOLS extends Record<string, CoreTool>, OUTPUT, TSchema, ENUM extends string, T> =
	| AnyNoTemplateConfig<TOOLS, OUTPUT, TSchema, ENUM, T>
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, TSchema, ENUM, T> & TemplateConfig);


// Result types
export type {
	GenerateTextResult,
	StreamTextResult
} from 'ai';

//these are returned in a Promise
export type GenerateObjectResult<T, ENUM extends string> =
	| GenerateObjectObjectResult<T>
	| GenerateObjectArrayResult<T>
	| GenerateObjectEnumResult<ENUM>
	| GenerateObjectNoSchemaResult;

export type GenerateObjectObjectResult<T> = GenerateObjectResult<T>;
export type GenerateObjectArrayResult<T> = GenerateObjectResult<T[]>;
export type GenerateObjectEnumResult<ENUM extends string> = GenerateObjectResult<ENUM>;
export type GenerateObjectNoSchemaResult = GenerateObjectResult<JSONValue>;

export type StreamObjectResult<T> =
	| StreamObjectObjectResult<T>
	| StreamObjectArrayResult<T>
	| StreamObjectNoSchemaResult;

//These are returned as is without a promise, many of the properties are promises,
//this allows accessing individual fields as they arrive, rather than waiting for the entire object to complete.
export type StreamObjectObjectResult<T> = StreamObjectResult<DeepPartial<T>, T, never>;
export type StreamObjectArrayResult<T> = StreamObjectResult<T[], T[], AsyncIterableStream<T>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;

// Type guards for config objects
export function hasModel(config: unknown): config is { model: LanguageModel } {
	return !!config && typeof config === 'object' && 'model' in config && !!config.model;
}