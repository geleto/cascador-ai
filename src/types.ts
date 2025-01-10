import { generateText, streamText, generateObject, streamObject } from 'ai';
import { Provider } from 'ai';
import { ILoaderPAsync, ILoaderAny } from 'cascada-tmpl';
import { Config } from './Config';

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

// Combined configuration type that can be any of the generator configs
export type CommonConfig = TextGeneratorConfig | TextStreamerConfig | ObjectGeneratorConfig | ObjectStreamerConfig | TemplateConfig;