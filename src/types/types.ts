import { ModelMessage, Schema, StreamObjectOnFinishCallback, StreamTextOnFinishCallback, ToolSet } from 'ai';//do not confuze the 'ai' Schema type with the 'zod' Schema type
import { z } from 'zod';
import { InferParameters } from './utils';
import { ILoaderAny } from 'cascada-engine';
import { RaceGroup, MergedGroup } from '../loaders';

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

// export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;
export type SchemaType<T> = z.ZodType<T, z.ZodTypeDef, any> | Schema<T>;

// Define the possible prompt types
export type TemplatePromptType = 'template' | 'async-template' | 'template-name' | 'async-template-name';
export type ScriptPromptType = 'script' | 'async-script' | 'script-name' | 'async-script-name';
export type FunctionPromptType = 'function';

export type PromptType = TemplatePromptType | ScriptPromptType | FunctionPromptType | 'text' | 'text-name';
export type RequiredPromptType = Exclude<PromptType, undefined>;

export type AnyPromptSource = string | ModelMessage[] | PromptFunction<string | ModelMessage[]>;

export type PromptFunction<PR extends string | ModelMessage[] = string | ModelMessage[]> =
	(context: Context) => PR | Promise<PR>;

//export type LLMPromptType = TemplatePromptType | 'text';

// Define PromptOrMessage after importing config types

//export type PromptOrMessage = { prompt: string } | { messages: NonNullable<GenerateTextConfig['messages']> };

// Utility types
export type StreamObjectOnFinishEvent<SCHEMA extends z.ZodTypeAny | Schema<any>> =
	Parameters<StreamObjectOnFinishCallback<InferParameters<SCHEMA>>>[0];

export type StreamTextOnFinishEvent<TOOLS extends ToolSet = Record<string, never>> =
	Parameters<StreamTextOnFinishCallback<TOOLS>>[0];

export type EmptyObject = Record<string, never>;

export type CascadaFilters = Record<string, (input: any, ...args: any[]) => any>;

export type CascadaLoaders = ILoaderAny | ILoaderAny[];
export type CascadorAILoaders = ILoaderAny | RaceGroup | MergedGroup | (ILoaderAny | RaceGroup | MergedGroup)[];

