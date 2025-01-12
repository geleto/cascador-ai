// In types.ts
import { generateText, streamText, generateObject, GenerateObjectResult, streamObject, JSONValue } from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-tmpl';

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

type TextGeneratorConfig = Parameters<typeof generateText>[0] & TemplateConfig;
type TextStreamerConfig = Parameters<typeof streamText>[0] & TemplateConfig;
type ObjectStreamerConfig = Parameters<typeof generateObject>[0] & TemplateConfig;
type ObjectGeneratorConfig = Parameters<typeof streamObject>[0] & TemplateConfig;

export type AnyLLMConfigPartial =
	Partial<TextGeneratorConfig> |
	Partial<TextStreamerConfig> |
	Partial<ObjectGeneratorConfig> |
	Partial<ObjectStreamerConfig>;