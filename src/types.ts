import { generateText, streamText, generateObject, streamObject, Schema, LanguageModel } from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-tmpl';
import { z } from 'zod';

// Basic template types
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

// Raw config types from Vercel functions
type RawGenerateTextConfig = Parameters<typeof generateText>[0];
type RawStreamTextConfig = Parameters<typeof streamText>[0];
type RawGenerateObjectConfig = Parameters<typeof generateObject>[0];
type RawStreamObjectConfig = Parameters<typeof streamObject>[0];

// Base argument types (omit output and add template config) - these are used for config arguments in the specific factory methods
// They don't have output property and have template config properties added
export type GenerateTextConfigArg = Omit<RawGenerateTextConfig, 'output'> & TemplateConfig;
export type StreamTextConfigArg = Omit<RawStreamTextConfig, 'output'> & TemplateConfig;
export type GenerateObjectConfigArg = Omit<RawGenerateObjectConfig, 'output'> & TemplateConfig;
export type StreamObjectConfigArg = Omit<RawStreamObjectConfig, 'output'> & TemplateConfig;

// Union type for factory method arguments
// This is used to allow any of the above config types to be passed to the ConfigData factory method
export type LLMConfigArg = Partial<
	| GenerateTextConfigArg
	| StreamTextConfigArg
	| GenerateObjectConfigArg
	| StreamObjectConfigArg
>;

// Output-specific config types for the raw functions (e.g. for output: 'object' or 'array')
export type RawGenerateObjectConfigForOutput<O> = Extract<RawGenerateObjectConfig, { output: O }>;
export type RawStreamObjectConfigForOutput<O> = Extract<RawStreamObjectConfig, { output: O }>;

// Final config types for Vercel functions, with output property added and template config properties removed
export type FinalGenerateObjectConfig<O> =
	Omit<GenerateObjectConfigArg, keyof TemplateConfig> &
	{ output: O } &
	RawGenerateObjectConfigForOutput<O>;

export type FinalStreamObjectConfig<O> =
	Omit<StreamObjectConfigArg, keyof TemplateConfig> &
	{ output: O } &
	RawStreamObjectConfigForOutput<O>;

// Output type definitions
export type ObjectGeneratorOutputType = 'array' | 'object' | 'no-schema' | 'enum';
export type ObjectStreamOutputType = 'array' | 'object' | 'no-schema';

// Schema type
export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

// Required config types based on output, these are used for the final call
// We check if the configs in the parent chain, plus the current config, plus the call congig, when merged
// and for the specific output type, will have all the required properties
export type RequiredObjectConfig<T, O extends ObjectGeneratorOutputType> =
	(O extends 'array' | 'object' ?
		(GenerateObjectConfigArg & { schema: SchemaType<T> })//generateObject with array or object output must have schema
		: (O extends 'enum' ?
			(GenerateObjectConfigArg & { enum: string[] })//enum output must have enum values
			: GenerateObjectConfigArg)//not array, object or enum => 'no-schema' output does not require schema
	);

// Type guards for runtime validation
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