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
export interface TemplateBaseConfig {
	context?: Context;
	filters?: Filters;
	loader?: ILoaderAny | ILoaderAny[] | null;
	options?: ConfigureOptions;
}

// Config for the template engine
export interface TemplateConfig extends TemplateBaseConfig {
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
	& TemplateConfig
	& { mode?: 'auto' | 'json' | 'tool' }
>;

// Base configs with specific capabilities
export type BaseConfigModelIsSet = BaseConfig & { model: LanguageModel };
export type ToolsConfig<TOOLS extends Record<string, CoreTool>> = BaseConfig & StreamTextToolsConfig<TOOLS>;
export type ToolsConfigModelIsSet<TOOLS extends Record<string, CoreTool>> = ToolsConfig<TOOLS> & { model: LanguageModel };

// Specific configurations for each type and overload
type GenerateTextSpecificConfig<TOOLS extends Record<string, CoreTool>> = Pick<Parameters<typeof generateText<TOOLS>>[0],
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
>;

// Base configs for each type, remove the output property because it's a separate argument in our factory functions
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

interface GenerateObjectObjectSpecificConfig<T> {
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectArraySpecificConfig<T> {
	schema: SchemaType<T>;
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

// The configs containing all required Vercel LLM properties
export type GenerateTextLLMConfig = Parameters<typeof generateText>[0] & Partial<TemplateConfig>;
export type StreamTextLLMConfig = Parameters<typeof streamText>[0] & Partial<TemplateConfig>;

export type GenerateObjectObjectLLMConfig<T> = BaseGenerateObjectConfig & GenerateObjectObjectSpecificConfig<T> & Partial<TemplateConfig> & { output: 'object' };
export type GenerateObjectArrayLLMConfig<T> = BaseGenerateObjectConfig & GenerateObjectArraySpecificConfig<T> & Partial<TemplateConfig> & { output: 'array' };
export type GenerateObjectEnumLLMConfig<ENUM extends string> = BaseGenerateObjectConfig & GenerateObjectEnumSpecificConfig<ENUM> & Partial<TemplateConfig> & { output: 'enum' };
export type GenerateObjectNoSchemaLLMConfig = BaseGenerateObjectConfig & GenerateObjectNoSchemaSpecificConfig & Partial<TemplateConfig> & { output: 'no-schema' };

export type StreamObjectObjectLLMConfig<T> = BaseStreamObjectConfig & StreamObjectObjectSpecificConfig<T> & Partial<TemplateConfig> & { output: 'object' };
export type StreamObjectArrayLLMConfig<T> = BaseStreamObjectConfig & StreamObjectArraySpecificConfig<T> & Partial<TemplateConfig> & { output: 'array' };
export type StreamObjectNoSchemaLLMConfig = BaseStreamObjectConfig & StreamObjectNoSchemaSpecificConfig & Partial<TemplateConfig> & { output: 'no-schema' };

// Complete config types with all properties for each function and overload
export type GenerateTextFinalConfig = GenerateTextLLMConfig & TemplateConfig;
export type StreamTextFinalConfig = StreamTextLLMConfig & TemplateConfig;

export type GenerateObjectObjectFinalConfig<T> = GenerateObjectObjectLLMConfig<T> & TemplateConfig;
export type GenerateObjectArrayFinalConfig<T> = GenerateObjectArrayLLMConfig<T> & TemplateConfig;
export type GenerateObjectEnumFinalConfig<ENUM extends string> = GenerateObjectEnumLLMConfig<ENUM> & TemplateConfig;
export type GenerateObjectNoSchemaFinalConfig = GenerateObjectNoSchemaLLMConfig & TemplateConfig;

export type StreamObjectObjectFinalConfig<T> = StreamObjectObjectLLMConfig<T> & TemplateConfig;
export type StreamObjectArrayFinalConfig<T> = StreamObjectArrayLLMConfig<T> & TemplateConfig;
export type StreamObjectNoSchemaFinalConfig = StreamObjectNoSchemaLLMConfig & TemplateConfig;

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
export type GenerateObjectEnumResult = GenerateObjectResult<string>;
export type GenerateObjectNoSchemaResult = GenerateObjectResult<JSONValue>;

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>

//these are returned as is without a promise, many of the properties are promises
//this allows accessing individual fields as they arrive, rather than waiting for the entire object to complete.
export type StreamObjectObjectResult<T> = StreamObjectResult<DeepPartial<T>, T, never>;
export type StreamObjectArrayResult<T> = StreamObjectResult<T[], T[], AsyncIterableStream<T>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;