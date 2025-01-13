import { generateText, streamText, generateObject, streamObject } from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-tmpl';

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

// Valid output types for object operations
export type ObjectGeneratorOutputType = 'array' | 'object' | 'no-schema' | 'enum';
export type ObjectStreamOutputType = 'array' | 'object' | 'no-schema';

// Base configs for generators and streamers
export type GeneratorFunction = (config: any) => (Promise<any>);
export type StreamFunction = (config: any) => (any);
export type ConfigFromFunction<F extends GeneratorFunction | StreamFunction> = Omit<Parameters<F>[0], 'output'> & TemplateConfig;

// Union type for partial configs
export type LLMPartialConfig =
	Partial<ConfigFromFunction<typeof generateText>> |
	Partial<ConfigFromFunction<typeof streamText>> |
	Partial<ConfigFromFunction<typeof generateObject>> |
	Partial<ConfigFromFunction<typeof streamObject>>;
