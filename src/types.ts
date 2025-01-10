import { generateText, streamText, generateObject, GenerateObjectResult, streamObject } from 'ai';
import { ILoaderAny } from 'cascada-tmpl';
import { Config } from './Config';
import { z } from 'zod';

export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => Promise<any> | any>;

export interface TemplateConfig {
	context?: Context;
	filters?: Filters;
	parent?: Config;
	loader?: ILoaderAny | ILoaderAny[] | null;
	promptName?: string;
	prompt?: string;
}

// Vercel AI SDK return types - using ReturnType to get exact types
export type GenerateTextReturn = ReturnType<typeof generateText>;
export type StreamTextReturn = ReturnType<typeof streamText>;
//export type GenerateObjectReturn<T> = ReturnType<typeof generateObject<T>>;
export type GenerateObjectReturn<T> = GenerateObjectResult<T>;
export type StreamObjectReturn<T> = ReturnType<typeof streamObject<T>>;

// Vercel AI SDK configurations
export type GenerateTextConfig = Parameters<typeof generateText>[0];
export type StreamTextConfig = Parameters<typeof streamText>[0];
export type GenerateObjectConfig = Parameters<typeof generateObject>[0];
export type StreamObjectConfig = Parameters<typeof streamObject>[0];

// Generator configurations - extend TemplateConfig with respective tool configs
export type TextGeneratorConfig = GenerateTextConfig & TemplateConfig;
export type TextStreamerConfig = StreamTextConfig & TemplateConfig;
export type ObjectGeneratorConfig = GenerateObjectConfig & TemplateConfig;
export type ObjectStreamerConfig = StreamObjectConfig & TemplateConfig;

// Combined configuration type that can be any of the generator configs - TODO: rename to AnyLLMConfig, AnyLLMResult
export type AnyLLMConfig = TextGeneratorConfig | TextStreamerConfig | ObjectGeneratorConfig | ObjectStreamerConfig;
export type AnyLLMConfigPartial = Partial<TextGeneratorConfig> | Partial<TextStreamerConfig> | Partial<ObjectGeneratorConfig> | Partial<ObjectStreamerConfig>;
export type AnyLLMResult = GenerateTextReturn | StreamTextReturn | GenerateObjectReturn<any> | StreamObjectReturn<any>;