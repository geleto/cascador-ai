import {
	LanguageModel, Schema, generateText, streamText, streamObject,
	GenerateObjectResult, StreamObjectResult, JSONValue, DeepPartial, CoreTool,
} from 'ai';
import { ConfigureOptions, ILoaderAny } from 'cascada-tmpl';
import { z } from 'zod';

// Some of the hacks here are because Parameters<T> helper type only returns the last overload type
// https://github.com/microsoft/TypeScript/issues/54223
// This is a problem because generateObject and streamObject have multiple overloads with different config and return types
// To overcome this:
// I get the generateText config type and exclude all properties specific only to it to get the base config type
// Then I add the specific properties for each function/overload - which are not many
// This is much less likely to break in future Vercel versions than copy/pasting the whole type definitions

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>

// Extract the base OnFinishCallback type from streamObject
type BaseOnFinishCallback = NonNullable<Parameters<typeof streamObject>[0]['onFinish']>;

// Extract our own callback type as it's not exported
type OnFinishCallback<RESULT> = BaseOnFinishCallback extends (event: infer E) => infer R
	? (event: { [K in keyof E]: K extends 'object' ? RESULT | undefined : E[K] }) => R
	: never;


// Define the possible prompt types
export type TemplatePromptType = 'template' | 'async-template' | 'template-name' | 'async-template-name' | undefined;
export type LLMPromptType = TemplatePromptType | 'text';

// Config for the template engine with type safety for loader requirement
export interface TemplateConfig {
	prompt?: string;
	promptType?: TemplatePromptType;
	context?: Context;
	filters?: Filters;
	options?: ConfigureOptions;
	loader?: ILoaderAny | ILoaderAny[] | null;
}

export type OptionalTemplateConfig = TemplateConfig | { promptType: 'text' };

export type OptionalNoPromptTemplateConfig = Partial<TemplateConfig> | { promptType: 'text' };

//to get BaseConfig, omit the GenerateTextConfig specific values from GenerateTextConfig
export type BaseConfig = Omit<GenerateTextConfig,
	| 'stopSequences'
	| 'experimental_continueSteps'
	| 'experimental_output'
	| 'tools'
	| 'toolChoice'
	| 'maxSteps'
	| 'experimental_activeTools'
	| 'experimental_repairToolCall'
	| 'onStepFinish'
	| 'model'//remove model to make it optional
> & { promptType?: LLMPromptType, model?: LanguageModel };

// Config types
// All of them are partials because they can be requested in pieces,
// and because doing Partial on the zod schema property makes it do deepPartial on it's properties which breaks it

export type GenerateTextConfig<
	TOOLS extends Record<string, CoreTool> = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never
> = Parameters<typeof generateText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0] & { promptType?: LLMPromptType };

export type StreamTextConfig<
	TOOLS extends Record<string, CoreTool> = Record<string, never>,
	OUTPUT = never,
	PARTIAL_OUTPUT = never
> = Parameters<typeof streamText<TOOLS, OUTPUT, PARTIAL_OUTPUT>>[0] & { promptType?: LLMPromptType };

export type GenerateObjectObjectConfig<OBJECT> = BaseConfig & {
	output?: 'object' | undefined;
	schema?: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectArrayConfig<ELEMENT> = BaseConfig & {
	output?: 'array';
	schema?: SchemaType<ELEMENT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectEnumConfig<ENUM extends string> = BaseConfig & {
	output?: 'enum';
	enum?: ENUM[];
	mode?: 'auto' | 'json' | 'tool';
}

export type GenerateObjectNoSchemaConfig = BaseConfig & {
	output: 'no-schema';
	mode?: 'json';
}

export type StreamObjectObjectConfig<OBJECT> = BaseConfig & {
	output?: 'object' | undefined;
	schema?: SchemaType<OBJECT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<OBJECT>;
}

export type StreamObjectArrayConfig<ELEMENT> = BaseConfig & {
	output?: 'array';
	schema?: SchemaType<ELEMENT>;
	schemaName?: string;
	schemaDescription?: string;
	mode?: 'auto' | 'json' | 'tool';
	onFinish?: OnFinishCallback<ELEMENT[]>;
	elementStream?: AsyncIterableStream<ELEMENT>;//?
}

export type StreamObjectNoSchemaConfig = BaseConfig & {
	output?: 'no-schema';
	mode?: 'json';
	onFinish?: OnFinishCallback<JSONValue>;
}

export type AnyNoTemplateConfig<
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ENUM extends string, ELEMENT
> =
	| GenerateTextConfig<TOOLS, OUTPUT>
	| StreamTextConfig<TOOLS, OUTPUT>
	| GenerateObjectObjectConfig<OBJECT>
	| GenerateObjectArrayConfig<ELEMENT>
	| GenerateObjectEnumConfig<ENUM>
	| GenerateObjectNoSchemaConfig
	| StreamObjectObjectConfig<OBJECT>
	| StreamObjectArrayConfig<ELEMENT>
	| StreamObjectNoSchemaConfig;

/*export type AnyConfig<
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ENUM extends string, ELEMENT
> =
	| AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ENUM, ELEMENT>
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ENUM, ELEMENT> & Partial<TemplateConfig>);*/

export type AnyConfig<
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ENUM extends string, ELEMENT
> =
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ENUM, ELEMENT> & { promptType: 'text' | undefined }) // text mode - no template props
	| (AnyNoTemplateConfig<TOOLS, OUTPUT, OBJECT, ENUM, ELEMENT> & Partial<TemplateConfig> & { promptType?: TemplatePromptType }); // template modes including undefined


// Result types
export type {
	GenerateTextResult,
	StreamTextResult
} from 'ai';

//these are returned in a Promise
export type GenerateObjectResultAll<OBJECT, ENUM extends string, ELEMENT> =
	| GenerateObjectObjectResult<OBJECT>
	| GenerateObjectArrayResult<ELEMENT>
	| GenerateObjectEnumResult<ENUM>
	| GenerateObjectNoSchemaResult;

export type GenerateObjectObjectResult<OBJECT> = GenerateObjectResult<OBJECT>;
export type GenerateObjectArrayResult<ELEMENT> = GenerateObjectResult<ELEMENT[]>;
export type GenerateObjectEnumResult<ENUM extends string> = GenerateObjectResult<ENUM>;
export type GenerateObjectNoSchemaResult = GenerateObjectResult<JSONValue>;

export type StreamObjectResultAll<OBJECT, ELEMENT> =
	| StreamObjectObjectResult<OBJECT>
	| StreamObjectArrayResult<ELEMENT>
	| StreamObjectNoSchemaResult;

//These are returned as is without a promise, many of the properties are promises,
//this allows accessing individual fields as they arrive, rather than waiting for the entire object to complete.
export type StreamObjectObjectResult<OBJECT> = StreamObjectResult<DeepPartial<OBJECT>, OBJECT, never>;
export type StreamObjectArrayResult<ELEMENT> = StreamObjectResult<ELEMENT[], ELEMENT[], AsyncIterableStream<ELEMENT>>;
export type StreamObjectNoSchemaResult = StreamObjectResult<JSONValue, JSONValue, never>;

// Type guards for config objects
export function hasModel(config: unknown): config is { model: LanguageModel } {
	return !!config && typeof config === 'object' && 'model' in config && !!config.model;
}