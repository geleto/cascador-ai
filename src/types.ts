// In types.ts
import { generateText, streamText, generateObject, GenerateObjectResult, streamObject, JSONValue } from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-tmpl';
import { ConfigBase } from './Config';
import { z } from 'zod';

export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => Promise<any> | any>;

export interface TemplateConfig {
	context?: Context;
	filters?: Filters;
	loader?: ILoaderAny | ILoaderAny[] | null;
	promptName?: string;
	prompt?: string;
	options?: ConfigureOptions;
}

// Vercel AI SDK return types
export type GenerateTextReturn = ReturnType<typeof generateText>;
export type StreamTextReturn = ReturnType<typeof streamText>;
export type GenerateObjectReturn<T> = GenerateObjectResult<T>;
export type StreamObjectReturn<T> = ReturnType<typeof streamObject<T>>;

// Vercel AI SDK configurations
type GenerateTextConfig = Parameters<typeof generateText>[0];
export type StreamTextConfig = Parameters<typeof streamText>[0];
export type GenerateObjectConfig = Parameters<typeof generateObject>[0];
export type StreamObjectConfig = Parameters<typeof streamObject>[0];

// Base configuration for object generation
interface BaseObjectConfig extends TemplateConfig {
	model: any;
	mode?: 'auto' | 'json' | 'tool';
}

// Object configuration variants
export interface ObjectSchemaConfig extends BaseObjectConfig {
	output?: 'object';
	schema: z.Schema<any>;
}

export interface ArraySchemaConfig extends BaseObjectConfig {
	output: 'array';
	schema: z.Schema<any>;
}

export interface EnumConfig extends BaseObjectConfig {
	output: 'enum';
	enum: string[];
}

export interface NoSchemaConfig extends BaseObjectConfig {
	output: 'no-schema';
	mode?: 'json';
}

// Combined object generator config type
export type ObjectGeneratorConfig =
	| ObjectSchemaConfig
	| ArraySchemaConfig
	| EnumConfig
	| NoSchemaConfig;

// Generator configurations
export type TextGeneratorConfig = GenerateTextConfig & TemplateConfig;
export type TextStreamerConfig = StreamTextConfig & TemplateConfig;
export type ObjectStreamerConfig = StreamObjectConfig & TemplateConfig;

// Combined configuration type
export type AnyLLMConfig =
	TextGeneratorConfig |
	TextStreamerConfig |
	ObjectGeneratorConfig |
	ObjectStreamerConfig;

export type AnyLLMConfigPartial =
	Partial<TextGeneratorConfig> |
	Partial<TextStreamerConfig> |
	Partial<ObjectGeneratorConfig> |
	Partial<ObjectStreamerConfig>;

export type AnyLLMResult<T> =
	GenerateTextReturn |
	StreamTextReturn |
	GenerateObjectReturn<T> |
	StreamObjectReturn<T>;