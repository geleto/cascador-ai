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

// Valid output types for object operations
export type ObjectGeneratorOutput = 'array' | 'object' | 'no-schema' | 'enum';
export type ObjectStreamOutput = 'array' | 'object' | 'no-schema';

// Base configs for generators and streamers
export type GeneratorConfig<F extends (config: any) => Promise<any>> = Parameters<F>[0] & TemplateConfig;
export type StreamerConfig<F extends (config: any) => Record<string, any>> = Parameters<F>[0] & TemplateConfig;

// Config types for different generators/streamers
export type TextGeneratorConfig = GeneratorConfig<typeof generateText>;
export type TextStreamerConfig = StreamerConfig<typeof streamText>;
export type ObjectGeneratorConfig = Omit<Parameters<typeof generateObject>[0], 'output'> & TemplateConfig;
export type ObjectStreamerConfig = Omit<Parameters<typeof streamObject>[0], 'output'> & TemplateConfig;

// Union type for partial configs
export type LLMPartialConfig =
	Partial<TextGeneratorConfig> |
	Partial<TextStreamerConfig> |
	Partial<ObjectGeneratorConfig> |
	Partial<ObjectStreamerConfig>;
