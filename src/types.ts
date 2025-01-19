import {
	LanguageModel, Schema, //API types
	generateText, generateObject, streamText, streamObject, //API functions
	GenerateObjectResult, StreamObjectResult, //result generics
	JSONValue, DeepPartial,
	CoreTool
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

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

// Valid output types for object operations
export type ObjectGeneratorOutputType = 'array' | 'object' | 'no-schema' | 'enum';
export type ObjectStreamOutputType = 'array' | 'object' | 'no-schema';

export type ExcludeProperties<T, U> = Omit<T, keyof U>;

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

// Base config for generateText tools
type GenerateTextToolsConfig<TOOLS extends Record<string, CoreTool>> = Pick<Parameters<typeof generateText<TOOLS>>[0],
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
>;

// Stream text extends generate text tools config and adds streaming-specific tool property
type StreamTextToolsConfig<TOOLS extends Record<string, CoreTool>> = GenerateTextToolsConfig<TOOLS> & {
	experimental_toolCallStreaming?: boolean
};

// This is the base config
// It is a Partial, all properties are optional
// It omits all specific properties for each function/overload, leaving only the common ones
// It adds the template engine configuration properties
// It adds the mode property, which while not common for all functions is useful in base configs
export type BaseConfig = Partial<Omit<Parameters<typeof generateText>[0], keyof GenerateTextSpecificConfig<any>>
	& TemplateOnlyConfig
//& { mode?: 'auto' | 'json' | 'tool' } - removed because no-schema can only ne json
>;

export type BaseConfigWithTools<TOOLS extends Record<string, CoreTool>> = BaseConfig & StreamTextToolsConfig<TOOLS>;

// Specific configurations for each type and overload
type GenerateTextSpecificConfig<TOOLS extends Record<string, CoreTool>> = Pick<Parameters<typeof generateText<TOOLS>>[0],
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
>;

// Base configs for each type, remove the output property because it's a separate argument in our factory functions
// also remove all the properties that are specific to some overloads, thus creating a base config with properties common to all overloads
// then we will build back up with the specific properties needed for each case.
type BaseGenerateObjectConfig = Omit<
	Parameters<typeof generateObject>[0],
	'output' | 'schema' | 'enum' | 'mode' | 'schemaName' | 'schemaDescription'
>;

type BaseStreamObjectConfig = Omit<
	Parameters<typeof streamObject>[0],
	'output' | 'schema' | 'enum' | 'mode' | 'schemaName' | 'schemaDescription' | 'onFinish'
>;

// Extract the base OnFinishCallback type from streamObject
type BaseOnFinishCallback = NonNullable<Parameters<typeof streamObject>[0]['onFinish']>;

// Extract our own callback type as it's not exported
type OnFinishCallback<T> = BaseOnFinishCallback extends (event: infer E) => infer R
	? (event: { [K in keyof E]: K extends 'object' ? T | undefined : E[K] }) => R
	: never;

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
}

interface StreamObjectNoSchemaSpecificConfig {
	mode?: 'json';
	onFinish?: OnFinishCallback<JSONValue>;
}

// Type guards for config objects
export function hasModel(config: unknown): config is { model: LanguageModel } {
	return !!config && typeof config === 'object' && 'model' in config && !!config.model;
}

export function isToolsConfig<TOOLS extends Record<string, CoreTool>>(
	config: unknown
): config is StreamTextToolsConfig<TOOLS> {
	return !!config && typeof config === 'object' && 'tools' in config;
}

// The configs containing all properties, including the template ones
export type GenerateTextLLMConfig<TOOLS extends Record<string, CoreTool>> =
	Partial<(Parameters<typeof generateText>[0] & { tools?: TOOLS }) & TemplateOnlyConfig>;

export type StreamTextLLMConfig<TOOLS extends Record<string, CoreTool>> =
	Partial<(Parameters<typeof streamText>[0] & { tools?: TOOLS }) & TemplateOnlyConfig>;

export type GenerateObjectObjectLLMConfig<TSchema> = BaseGenerateObjectConfig & GenerateObjectObjectSpecificConfig<TSchema> & Partial<TemplateOnlyConfig> & { output: 'object' };
export type GenerateObjectArrayLLMConfig<TSchema> = BaseGenerateObjectConfig & GenerateObjectArraySpecificConfig<TSchema> & Partial<TemplateOnlyConfig> & { output: 'array' };
export type GenerateObjectEnumLLMConfig<ENUM extends string> = BaseGenerateObjectConfig & GenerateObjectEnumSpecificConfig<ENUM> & Partial<TemplateOnlyConfig> & { output: 'enum' };
export type GenerateObjectNoSchemaLLMConfig = BaseGenerateObjectConfig & GenerateObjectNoSchemaSpecificConfig & Partial<TemplateOnlyConfig> & { output: 'no-schema' };

export type StreamObjectObjectLLMConfig<TSchema> = BaseStreamObjectConfig & StreamObjectObjectSpecificConfig<TSchema> & Partial<TemplateOnlyConfig> & { output: 'object' };
export type StreamObjectArrayLLMConfig<TSchema> = BaseStreamObjectConfig & StreamObjectArraySpecificConfig<TSchema> & Partial<TemplateOnlyConfig> & { output: 'array' };
export type StreamObjectNoSchemaLLMConfig = BaseStreamObjectConfig & StreamObjectNoSchemaSpecificConfig & Partial<TemplateOnlyConfig> & { output: 'no-schema' };

// Complete config types with all properties for each function and overload
export type GenerateTextFinalConfig<TOOLS extends Record<string, CoreTool>> = GenerateTextLLMConfig<TOOLS> & TemplateOnlyConfig;
export type StreamTextFinalConfig<TOOLS extends Record<string, CoreTool>> = StreamTextLLMConfig<TOOLS> & TemplateOnlyConfig;

export type GenerateObjectObjectFinalConfig<T> = GenerateObjectObjectLLMConfig<T> & TemplateOnlyConfig;
export type GenerateObjectArrayFinalConfig<T> = GenerateObjectArrayLLMConfig<T> & TemplateOnlyConfig;
export type GenerateObjectEnumFinalConfig<ENUM extends string> = GenerateObjectEnumLLMConfig<ENUM> & TemplateOnlyConfig;
export type GenerateObjectNoSchemaFinalConfig = GenerateObjectNoSchemaLLMConfig & TemplateOnlyConfig;

export type StreamObjectObjectFinalConfig<T> = StreamObjectObjectLLMConfig<T> & TemplateOnlyConfig;
export type StreamObjectArrayFinalConfig<T> = StreamObjectArrayLLMConfig<T> & TemplateOnlyConfig;
export type StreamObjectNoSchemaFinalConfig = StreamObjectNoSchemaLLMConfig & TemplateOnlyConfig;

export type GenerateStreamAllFinalConfig =
	| StreamObjectObjectFinalConfig<any>
	| StreamObjectArrayFinalConfig<any>
	| StreamObjectNoSchemaFinalConfig;

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

//these are returned as is without a promise, many of the properties are promises
//this allows accessing individual fields as they arrive, rather than waiting for the entire object to complete.
export type StreamObjectObjectResult<T> = StreamObjectResult<DeepPartial<T>, T, never>;
export type StreamObjectArrayResult<T> = StreamObjectResult<T[], T[], AsyncIterableStream<T>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;