import {
	LanguageModel, Schema, //API types
	generateText, streamText, streamObject, //API functions
	GenerateObjectResult, StreamObjectResult, //result generics
	JSONValue, DeepPartial,
	CoreTool,
	CoreToolChoice
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

// The vercel function as passed to the call signature
export type VercelLLMFunction<TConfig extends BaseConfig, TResult> =
	(config: TConfig & { model: LanguageModel }) => Promise<TResult> | TResult;


/**
 * Function signature for LLM generation/streaming calls.
 * If base config has no model, requires model in call arguments.
 * If base config has model, accepts any call signature.
 */
export interface LLMCallSignature<TConfig extends BaseConfig, TResult> {
	(promptOrConfig?: TConfig extends { model: LanguageModel }
		? TConfig | string | Context // Model in config - any form ok
		: TConfig & { model: LanguageModel }, // No model in config - must provide model
		context?: Context
	): Promise<TResult>; // The function's call signature
	config: TConfig; // Additional property on the function type
};

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

// Valid output types for object operations
export type ObjectGeneratorOutputType = 'array' | 'object' | 'no-schema' | 'enum';
export type ObjectStreamOutputType = 'array' | 'object' | 'no-schema';

export type ExcludeProperties<T, U> = Omit<T, keyof U>;

// Extract the base OnFinishCallback type from streamObject
type BaseOnFinishCallback = NonNullable<Parameters<typeof streamObject>[0]['onFinish']>;

// Extract our own callback type as it's not exported
type OnFinishCallback<T> = BaseOnFinishCallback extends (event: infer E) => infer R
	? (event: { [K in keyof E]: K extends 'object' ? T | undefined : E[K] }) => R
	: never;

// Template config without the prompt
export interface TemplateOnlyBaseConfig {
	context?: Context;
	filters?: Filters;
	loader?: ILoaderAny | ILoaderAny[] | null;
	options?: ConfigureOptions;
}

// Config for the template engine
export interface TemplateOnlyConfig extends TemplateOnlyBaseConfig {
	promptName?: string;
	prompt?: string;
}

// This is the base config
// It is a Partial, all properties are optional
// It omits all specific properties for each function/overload, leaving only the common ones
// It adds the template engine configuration properties
// It adds the mode property, which while not common for all functions is useful in base configs
export type BaseConfig =
	Partial<Omit<Parameters<typeof generateText>[0], keyof GenerateTextSpecificConfig<any>>
		& TemplateOnlyConfig
	>;

// Base config for generateText tools
export type GenerateTextToolsOnlyConfig<TOOLS extends Record<string, CoreTool>> = Pick<
	Parameters<typeof generateText<TOOLS, never, never>>[0],
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
	| 'onStepFinish'
>;

//Tools config for generateText/streamText
// Stream text extends generate text tools config and adds streaming-specific tool property
type StreamTextToolsOnlyConfig<TOOLS extends Record<string, CoreTool>> = GenerateTextToolsOnlyConfig<TOOLS> & {
	experimental_toolCallStreaming?: boolean
};

export type BaseToolsOnlyConfig<TOOLS extends Record<string, CoreTool>> = Omit<GenerateTextToolsOnlyConfig<TOOLS>, 'toolChoice'> & {
	toolChoice?: CoreToolChoice<TOOLS>;
};
//the streamText tools config only adds one experimental property
//we will allow it to be used even with non-streaming tools for simplicity sake - see BaseConfigDataWithTools
export type ToolsOnlyConfig<TOOLS extends Record<string, CoreTool>> = Omit<StreamTextToolsOnlyConfig<TOOLS>, 'toolChoice'> & {
	toolChoice?: CoreToolChoice<TOOLS>;
};

export type BaseConfigWithTools<TOOLS extends Record<string, CoreTool>> = BaseConfig & BaseToolsOnlyConfig<TOOLS>;
export type ConfigWithTools<TOOLS extends Record<string, CoreTool>> = BaseConfig & ToolsOnlyConfig<TOOLS>;

// Non-tool specific properties for generateText plus the tool config for generate text
// for generate text - remove the experimental streaming tool property (it's in the common tools config and not kept separately for simplicity)
type GenerateTextSpecificConfig<
	TOOLS extends Record<string, CoreTool>,
	OUTPUT = never
> = Pick<
	Parameters<typeof generateText < TOOLS, OUTPUT, DeepPartial<OUTPUT>>>[0],
	| 'stopSequences'
	| 'experimental_continueSteps'
	| 'experimental_output'
> & Omit<GenerateTextToolsOnlyConfig<TOOLS>, 'experimental_toolCallStreaming'>;

// All generateText properties plus streaming-specific properties and streaming tools config
export type StreamTextSpecificConfig<
	TOOLS extends Record<string, CoreTool>,
	OUTPUT = never
> = Pick<Parameters<typeof streamText< TOOLS, OUTPUT, DeepPartial<OUTPUT>>>[0],
	| 'experimental_transform'
	| 'onChunk'
	| 'onFinish'
> & GenerateTextSpecificConfig<TOOLS, OUTPUT> & StreamTextToolsOnlyConfig<TOOLS>;

interface GenerateObjectObjectSpecificConfig<TSchema> {
	schema: SchemaType<TSchema>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectArraySpecificConfig<TSchema> {
	schema: SchemaType<TSchema>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectEnumSpecificConfig<ENUM extends string> {
	enum: ENUM[];
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectNoSchemaSpecificConfig {
	mode?: 'json';
}

interface StreamObjectObjectSpecificConfig<T> {
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<T>;
}

interface StreamObjectArraySpecificConfig<T> {
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<T[]>;
	elementStream?: AsyncIterableStream<T>;//?
}

interface StreamObjectNoSchemaSpecificConfig {
	mode?: 'json';
	onFinish?: OnFinishCallback<JSONValue>;
}

// The configs containing all properties, including the template and tools ones
// @todo rename LLM to Intermediate
export type GenerateTextConfig<TOOLS extends Record<string, CoreTool>, OUTPUT = never> =
	BaseConfig & GenerateTextSpecificConfig<TOOLS, OUTPUT>;

export type StreamTextConfig<TOOLS extends Record<string, CoreTool>, OUTPUT = never> =
	BaseConfig & StreamTextSpecificConfig<TOOLS, OUTPUT>;

export type GenerateObjectObjectConfig<TSchema> = BaseConfig & GenerateObjectObjectSpecificConfig<TSchema>;
export type GenerateObjectArrayConfig<TSchema> = BaseConfig & GenerateObjectArraySpecificConfig<TSchema>;
export type GenerateObjectEnumConfig<ENUM extends string> = BaseConfig & GenerateObjectEnumSpecificConfig<ENUM>;
export type GenerateObjectNoSchemaConfig = BaseConfig & GenerateObjectNoSchemaSpecificConfig;

export type StreamObjectObjectConfig<TSchema> = BaseConfig & StreamObjectObjectSpecificConfig<TSchema>;
export type StreamObjectArrayConfig<TSchema> = BaseConfig & StreamObjectArraySpecificConfig<TSchema>;
export type StreamObjectNoSchemaConfig = BaseConfig & StreamObjectNoSchemaSpecificConfig;

// Result types
export type {
	GenerateTextResult,
	StreamTextResult
} from 'ai';

//these are returned in a Promise
export type GenerateObjectObjectResult<T> = GenerateObjectResult<T>;
export type GenerateObjectArrayResult<T> = GenerateObjectResult<T[]>;
export type GenerateObjectEnumResult<ENUM extends string> = GenerateObjectResult<ENUM>;
export type GenerateObjectNoSchemaResult = GenerateObjectResult<JSONValue>;

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>

//These are returned as is without a promise, many of the properties are promises,
//this allows accessing individual fields as they arrive, rather than waiting for the entire object to complete.
export type StreamObjectObjectResult<T> = StreamObjectResult<DeepPartial<T>, T, never>;
export type StreamObjectArrayResult<T> = StreamObjectResult<T[], T[], AsyncIterableStream<T>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;

// Type guards for config objects
export function hasModel(config: unknown): config is { model: LanguageModel } {
	return !!config && typeof config === 'object' && 'model' in config && !!config.model;
}

export function isToolsConfig<TOOLS extends Record<string, CoreTool>>(
	config: unknown
): config is StreamTextToolsOnlyConfig<TOOLS> {
	return !!config && typeof config === 'object' && 'tools' in config;
}