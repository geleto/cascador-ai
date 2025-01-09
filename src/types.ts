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

// Generator configurations - extend TemplateConfig with respective tool configs
export type TextGeneratorConfig = Parameters<typeof generateText>[0] & TemplateConfig;
export type TextStreamerConfig = Parameters<typeof streamText>[0] & TemplateConfig;
export type ObjectGeneratorConfig = Parameters<typeof generateObject>[0] & TemplateConfig;
export type ObjectStreamerConfig = Parameters<typeof streamObject>[0] & TemplateConfig;

// Make all properties optional at the CommonConfig level
export type CommonConfig = Partial<TextGeneratorConfig> |
	Partial<TextStreamerConfig> |
	Partial<ObjectGeneratorConfig> |
	Partial<ObjectStreamerConfig> |
	TemplateConfig;