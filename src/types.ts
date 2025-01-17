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
// Then I add the specific properties for each function/overload to the base type - which are not many
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

// Config for the template engine, all
export interface TemplateConfig extends TemplateBaseConfig {
	promptName?: string;
	prompt?: string;
}

/*
 * Either prompt or promptName must be provided
type XOR<T, U> = (T | U) extends object
  ? (T & { [K in keyof U]?: never }) | (U & { [K in keyof T]?: never })
  : T | U;

interface TemplateConfigBase {
  context?: Context;
  filters?: Filters;
  loader?: ILoaderAny | ILoaderAny[] | null;
  options?: ConfigureOptions;
}

// Define two interfaces: one with `promptName` and one with `prompt`.
interface WithPromptName {
  promptName: string;
  prompt?: never;
}

interface WithPrompt {
  prompt: string;
  promptName?: never
}
 */

// This is the base config
// It is a Partial, all properties are optional
// It omits all specific properties for each function/overload, leaving only the common ones
// It adds the template engine configuration properties
// It adds the mode property, which while not common for all functions is useful in base configs
export type BaseConfig = Partial<Omit<Parameters<typeof generateText>[0], keyof GenerateTextSpecificConfig<any>>
	& TemplateConfig
	& { mode?: 'auto' | 'json' | 'tool' }
>;

export type BaseConfigModelIsSet = BaseConfig & { model: LanguageModel };

// this is the base config with the properties used for tools added
// Base config for tool properties in generateText
type GenerateTextToolsConfig<TOOLS extends Record<string, CoreTool>> = Pick<Parameters<typeof generateText<TOOLS>>[0],
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
>;

// Stream text extends generate text tools config and adds the streaming-specific tool property experimental_toolCallStreaming
type StreamTextToolsConfig<TOOLS extends Record<string, CoreTool>> = GenerateTextToolsConfig<TOOLS> & { experimental_toolCallStreaming?: boolean };

export type ToolsConfig<TOOLS extends Record<string, CoreTool>> = StreamTextToolsConfig<TOOLS> & BaseConfig;
export type ToolsConfigModelIsSet<TOOLS extends Record<string, CoreTool>> = ToolsConfig<TOOLS> & { model: LanguageModel };

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
// We don't have access to OnFinishCallback directly, so we extract it from the streamObject config.onFinish
// Get it from the last overload (see above about Parameters<T>) and change the generic type to match the specific overload
type BaseOnFinishCallback = NonNullable<Parameters<typeof streamObject>[0]['onFinish']>;

// Extract our own callback type as it's not exported
type OnFinishCallback<T> = BaseOnFinishCallback extends (event: infer E) => infer R
	? (event: { [K in keyof E]: K extends 'object' ? T | undefined : E[K] }) => R
	: never;

// Specific configurations for each type and overload
// Can use Pick for non-overloaded functions
// for now only used to extract the base config type
type GenerateTextSpecificConfig<TOOLS extends Record<string, CoreTool>> = Pick<Parameters<typeof generateText<TOOLS>>[0],
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
>;

/*type StreamTextSpecificConfig<TOOLS extends Record<string, CoreTool>> = Pick<Parameters<typeof streamText<TOOLS>>[0],
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
	| 'experimental_toolCallStreaming'
>;*/

interface GenerateObjectObjectSpecificConfig<T> {
	//output?: 'object'; - do not add output back, it's a separate argument and not part of the config in our implementation
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectArraySpecificConfig<T> {
	//output: 'array'; - do not add output back
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectEnumSpecificConfig<ENUM extends string> {
	//output: 'enum'; - do not add output back
	enum: ENUM[];
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectNoSchemaSpecificConfig {
	//output: 'no-schema';
	mode?: 'json';
}

interface StreamObjectObjectSpecificConfig<T> {
	//output?: 'object';
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<T>;
}

interface StreamObjectArraySpecificConfig<T> {
	//output: 'array';
	schema: SchemaType<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<T[]>;
}

interface StreamObjectNoSchemaSpecificConfig {
	//output: 'no-schema';
	mode?: 'json';
	onFinish?: OnFinishCallback<JSONValue>;
}

//Tools config - these can only be used with generate/stream text functions

// The raw configs used by the vercel text functions
/*export type RawGenerateTextConfig = Parameters<typeof generateText>[0];
export type RawStreamTextConfig = Parameters<typeof streamText>[0];

// The raw configs used by the vercel generate functions, we bring back the output property
export type RawGenerateObjectObjectConfig<T> = BaseGenerateObjectConfig & GenerateObjectObjectSpecificConfig<T> & { output: 'object' };
export type RawGenerateObjectArrayConfig<T> = BaseGenerateObjectConfig & GenerateObjectArraySpecificConfig<T> & { output: 'array' };
export type RawGenerateObjectEnumConfig = BaseGenerateObjectConfig & GenerateObjectEnumSpecificConfig & { output: 'enum' };
export type RawGenerateObjectNoSchemaConfig = BaseGenerateObjectConfig & GenerateObjectNoSchemaSpecificConfig & { output: 'no-schema' };*/

// The raw configs used by the vercel stream functions
/*export type RawStreamObjectObjectConfig<T> = BaseStreamObjectConfig & StreamObjectObjectSpecificConfig<T> & { output: 'object' };
export type RawStreamObjectArrayConfig<T> = BaseStreamObjectConfig & StreamObjectArraySpecificConfig<T> & { output: 'array' };
export type RawStreamObjectNoSchemaConfig = BaseStreamObjectConfig & StreamObjectNoSchemaSpecificConfig & { output: 'no-schema' };*/

// The configs containing all required Vercel LLM properties,
// also contains the template config properties but all of those are optional
// used in the merged config in the factory functions (which also add the output property back)
export type GenerateTextLLMConfig = Parameters<typeof generateText>[0] & Partial<TemplateConfig>;//ok because no overrides
export type StreamTextLLMConfig = Parameters<typeof streamText>[0] & Partial<TemplateConfig>;//ok because no overrides

export type GenerateObjectObjectLLMConfig<T> = BaseGenerateObjectConfig & GenerateObjectObjectSpecificConfig<T> & Partial<TemplateConfig> & { output: 'object' };
export type GenerateObjectArrayLLMConfig<T> = BaseGenerateObjectConfig & GenerateObjectArraySpecificConfig<T> & Partial<TemplateConfig> & { output: 'array' };
export type GenerateObjectEnumLLMConfig<ENUM extends string> = BaseGenerateObjectConfig & GenerateObjectEnumSpecificConfig<ENUM> & Partial<TemplateConfig> & { output: 'enum' };
export type GenerateObjectNoSchemaLLMConfig = BaseGenerateObjectConfig & GenerateObjectNoSchemaSpecificConfig & Partial<TemplateConfig> & { output: 'no-schema' };

export type GenerateObectsAllLLMConfig<ENUM extends string> = GenerateObjectObjectLLMConfig<any> | GenerateObjectArrayLLMConfig<any> | GenerateObjectEnumLLMConfig<ENUM> | GenerateObjectNoSchemaLLMConfig;

export type StreamObjectObjectLLMConfig<T> = BaseStreamObjectConfig & StreamObjectObjectSpecificConfig<T> & Partial<TemplateConfig> & { output: 'object' };
export type StreamObjectArrayLLMConfig<T> = BaseStreamObjectConfig & StreamObjectArraySpecificConfig<T> & Partial<TemplateConfig> & { output: 'array' };
export type StreamObjectNoSchemaLLMConfig = BaseStreamObjectConfig & StreamObjectNoSchemaSpecificConfig & Partial<TemplateConfig> & { output: 'no-schema' };

export type StreamObjectsAllLLMConfig = StreamObjectObjectLLMConfig<any> | StreamObjectArrayLLMConfig<any> | StreamObjectNoSchemaLLMConfig;

// Complete config types with all properties for each every function and overload, used in the final call
// base config(which is without output property) + specific config + template config
export type GenerateTextFinalConfig = GenerateTextLLMConfig & TemplateConfig;
export type StreamTextFinalConfig = StreamTextLLMConfig & TemplateConfig;

export type GenerateObjectObjectFinalConfig<T> = GenerateObjectObjectLLMConfig<T> & TemplateConfig;
export type GenerateObjectArrayFinalConfig<T> = GenerateObjectArrayLLMConfig<T> & TemplateConfig;
export type GenerateObjectEnumFinalConfig<ENUM extends string> = GenerateObjectEnumLLMConfig<ENUM> & TemplateConfig;
export type GenerateObjectNoSchemaFinalConfig = GenerateObjectNoSchemaLLMConfig & TemplateConfig;

export type StreamObjectObjectFinalConfig<T> = StreamObjectObjectLLMConfig<T> & TemplateConfig;
export type StreamObjectArrayFinalConfig<T> = StreamObjectArrayLLMConfig<T> & TemplateConfig;
export type StreamObjectNoSchemaFinalConfig = StreamObjectNoSchemaLLMConfig & TemplateConfig;

// Union types for all generate object configs
/*export type GenerateObjectAllFinalConfig<ENUM extends string> =
	| GenerateObjectObjectFinalConfig<any>
	| GenerateObjectArrayFinalConfig<any>
	| GenerateObjectEnumFinalConfig<ENUM>
	| GenerateObjectNoSchemaFinalConfig;*/

// Union types for all stream object configs
export type GenerateStreamAllFinalConfig =
	| StreamObjectObjectFinalConfig<any>
	| StreamObjectArrayFinalConfig<any>
	| StreamObjectNoSchemaFinalConfig;

// LLM Config argument for all factory functions, everything is optional (Partial),
// only 'output' is removed because we add it back as separate argument
/*export type LLMConfigArg = Partial<
	Omit<GenerateTextFinalConfig, 'output'> &
	Omit<StreamTextFinalConfig, 'output'> &
	Omit<GenerateObjectAllFinalConfig, 'output'> &
	Omit<GenerateStreamAllFinalConfig, 'output'>
>;*/

//used in StreamObjectArrayResult:
type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>

// Result types
export type {
	//GenerateObjectResult, - can extract only the from the last override, useless
	//StreamObjectResult, - can extract only the from the last override, useless
	GenerateTextResult, //no overrides, so use directly
	StreamTextResult //no overrides, so use directly
} from 'ai';

export type GenerateObjectObjectResult<T> = GenerateObjectResult<T>;
export type GenerateObjectArrayResult<T> = GenerateObjectResult<T[]>;
export type GenerateObjectEnumResult = GenerateObjectResult<string>;
export type GenerateObjectNoSchemaResult = GenerateObjectResult<JSONValue>;

export type StreamObjectObjectResult<T> = StreamObjectResult<DeepPartial<T>, T, never>;
export type StreamObjectArrayResult<T> = StreamObjectResult<T[], T[], AsyncIterableStream<T>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;

// Type guards for property checking
export function hasModel(config: unknown): config is { model: LanguageModel } {
	return config !== null && typeof config === 'object' && 'model' in config;
}

export function hasSchema<T>(config: unknown): config is { schema: SchemaType<T> } {
	if (config === null || typeof config !== 'object') {
		return false;
	}
	const record = config as Record<string, unknown>;
	return 'schema' in record && record.schema !== undefined;
}

export function hasEnum(config: unknown): config is { enum: string[] } {
	if (config === null || typeof config !== 'object') {
		return false;
	}
	const record = config as Record<string, unknown>;
	return 'enum' in record &&
		Array.isArray(record.enum) &&
		record.enum.every(item => typeof item === 'string');
}

// Error types
export class ConfigError extends Error {
	constructor(message: string) {
		super(`Configuration Error: ${message}`);
		this.name = 'ConfigError';
	}
}

export class TemplateError extends Error {
	constructor(message: string) {
		super(`Template Error: ${message}`);
		this.name = 'TemplateError';
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(`Validation Error: ${message}`);
		this.name = 'ValidationError';
	}
}