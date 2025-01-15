import {
	LanguageModel,
	Schema,
	generateText,
	streamText,
	generateObject,
	streamObject,
	GenerateObjectResult,
	JSONValue,
	StreamObjectResult,
	DeepPartial
} from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-tmpl';
import { z } from 'zod';

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

export interface TemplateConfig {
	context?: Context;
	filters?: Filters;
	loader?: ILoaderAny | ILoaderAny[] | null;
	promptName?: string;
	prompt?: string;
	options?: ConfigureOptions;
}

// Base configs for each type
type BaseGenerateObjectConfig = Omit<
	Parameters<typeof generateObject>[0],
	| 'output'
	| 'schema'
	| 'enum'
	| 'mode'
	| 'schemaName'
	| 'schemaDescription'
> & TemplateConfig;

type BaseStreamObjectConfig = Omit<
	Parameters<typeof streamObject>[0],
	| 'output'
	| 'schema'
	| 'enum'
	| 'mode'
	| 'schemaName'
	| 'schemaDescription'
	| 'onFinish'
> & TemplateConfig;

// Generate Object specific configurations
interface GenerateObjectObjectSpecificConfig<T> {
	output?: 'object';
	schema: z.Schema<T, z.ZodTypeDef, any> | Schema<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectArraySpecificConfig<T> {
	output: 'array';
	schema: z.Schema<T, z.ZodTypeDef, any> | Schema<T>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectEnumSpecificConfig {
	output: 'enum';
	enum: string[];
	mode?: 'auto' | 'json' | 'tool';
}

interface GenerateObjectNoSchemaSpecificConfig {
	output: 'no-schema';
	mode?: 'json';
}

// Stream Object specific configurations
/*interface StreamObjectObjectSpecificConfig<T> extends GenerateObjectObjectSpecificConfig<T> {
	onFinish?: OnFinishCallback<T>;
}

interface StreamObjectArraySpecificConfig<T> extends GenerateObjectArraySpecificConfig<T> {
	onFinish?: OnFinishCallback<T[]>;
}

interface StreamObjectNoSchemaSpecificConfig extends GenerateObjectNoSchemaSpecificConfig {
	onFinish?: OnFinishCallback<JSONValue>;
}*/

// Extract the base OnFinishCallback type
// We don't have access to OnFinishCallback directly, so we extract it from the streamObject function
//and change the type to match the specific object type
type BaseOnFinishCallback = NonNullable<Parameters<typeof streamObject>[0]['onFinish']>;

// Stream Object specific configurations using extracted type
interface StreamObjectObjectSpecificConfig<T> extends GenerateObjectObjectSpecificConfig<T> {
	onFinish?: BaseOnFinishCallback extends (event: { object: any }) => void
	? (event: { object: T }) => void
	: never;
}

interface StreamObjectArraySpecificConfig<T> extends GenerateObjectArraySpecificConfig<T> {
	onFinish?: BaseOnFinishCallback extends (event: { object: any }) => void
	? (event: { object: T[] }) => void
	: never;
}

interface StreamObjectNoSchemaSpecificConfig extends GenerateObjectNoSchemaSpecificConfig {
	onFinish?: BaseOnFinishCallback extends (event: { object: any }) => void
	? (event: { object: JSONValue }) => void
	: never;
}

// Complete config types
export type GenerateObjectObjectConfig<T> = BaseGenerateObjectConfig & GenerateObjectObjectSpecificConfig<T>;
export type GenerateObjectArrayConfig<T> = BaseGenerateObjectConfig & GenerateObjectArraySpecificConfig<T>;
export type GenerateObjectEnumConfig = BaseGenerateObjectConfig & GenerateObjectEnumSpecificConfig;
export type GenerateObjectNoSchemaConfig = BaseGenerateObjectConfig & GenerateObjectNoSchemaSpecificConfig;

export type StreamObjectObjectConfig<T> = BaseStreamObjectConfig & StreamObjectObjectSpecificConfig<T>;
export type StreamObjectArrayConfig<T> = BaseStreamObjectConfig & StreamObjectArraySpecificConfig<T>;
export type StreamObjectNoSchemaConfig = BaseStreamObjectConfig & StreamObjectNoSchemaSpecificConfig;

// Text configs
export type GenerateTextConfig = Parameters<typeof generateText>[0] & TemplateConfig;
export type StreamTextConfig = Parameters<typeof streamText>[0] & TemplateConfig;


// Union types for all possible configs
export type AllGenerateObjectConfigs =
	| GenerateObjectObjectConfig<any>
	| GenerateObjectArrayConfig<any>
	| GenerateObjectEnumConfig
	| GenerateObjectNoSchemaConfig;

export type AllStreamObjectConfigs =
	| StreamObjectObjectConfig<any>
	| StreamObjectArrayConfig<any>
	| StreamObjectNoSchemaConfig;

// LLM Config Arg type for ConfigData
export type LLMConfigArg = Partial<
	| GenerateTextConfig
	| StreamTextConfig
	| AllGenerateObjectConfigs
	| AllStreamObjectConfigs
>;

// Result types
export type {
	GenerateObjectResult,
	StreamObjectResult,
	GenerateTextResult,
	StreamTextResult
} from 'ai';

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>

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

export function hasSchema<T>(config: unknown): config is { schema: Schema<T> } {
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

// Type guards for config types
export function isGenerateObjectObjectConfig<T>(config: AllGenerateObjectConfigs): config is GenerateObjectObjectConfig<T> {
	return !config.output || config.output === 'object';
}

export function isGenerateObjectArrayConfig<T>(config: AllGenerateObjectConfigs): config is GenerateObjectArrayConfig<T> {
	return config.output === 'array';
}

export function isGenerateObjectEnumConfig(config: AllGenerateObjectConfigs): config is GenerateObjectEnumConfig {
	return config.output === 'enum';
}

export function isGenerateObjectNoSchemaConfig(config: AllGenerateObjectConfigs): config is GenerateObjectNoSchemaConfig {
	return config.output === 'no-schema';
}

export function isStreamObjectObjectConfig<T>(config: AllStreamObjectConfigs): config is StreamObjectObjectConfig<T> {
	return !config.output || config.output === 'object';
}

export function isStreamObjectArrayConfig<T>(config: AllStreamObjectConfigs): config is StreamObjectArrayConfig<T> {
	return config.output === 'array';
}

export function isStreamObjectNoSchemaConfig(config: AllStreamObjectConfigs): config is StreamObjectNoSchemaConfig {
	return config.output === 'no-schema';
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