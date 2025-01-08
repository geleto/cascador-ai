import { generateText, streamText, generateObject, streamObject } from 'ai';
import { Provider } from 'ai';
import { LoaderSource } from 'nunjucks';

export interface Context {
	[key: string]: any;
}

export interface Filters {
	[key: string]: (input: any, ...args: any[]) => Promise<any> | any;
}

// Cascador-specific configuration
export interface BaseConfig {
	context?: Context;
	filters?: Filters;
	parent?: BaseConfig;
	loader?: LoaderSource;
	promptName?: string;
}

// Generator configurations
export type TextGeneratorConfig = Parameters<typeof generateText>[0] & BaseConfig;
export type TextStreamerConfig = Parameters<typeof streamText>[0] & BaseConfig;
export type ObjectGeneratorConfig = Parameters<typeof generateObject>[0] & BaseConfig;
export type ObjectStreamerConfig = Parameters<typeof streamObject>[0] & BaseConfig;

// Combined configuration options from all generators
export type CommonConfig = TextGeneratorConfig | TextStreamerConfig | ObjectGeneratorConfig | ObjectStreamerConfig;

export type TextResponse = string;
export type StreamResponse = ReadableStream<string>;
export type ObjectResponse<T> = T;
export type ObjectStreamResponse<T> = ReadableStream<T>;