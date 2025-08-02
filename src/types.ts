import { Schema } from 'ai';//do not confuze the 'ai' Schema type with the 'zod' Schema type
import { z } from 'zod';

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

// Define the possible prompt types
export type TemplatePromptType = 'template' | 'async-template' | 'template-name' | 'async-template-name' | undefined;

export type ScriptType = 'script' | 'async-script' | 'script-name' | 'async-script-name' | undefined;

export type PromptType = TemplatePromptType | ScriptType | 'text' | 'text-name';
export type RequiredPromptType = Exclude<PromptType, undefined>;

//export type LLMPromptType = TemplatePromptType | 'text';

// Define PromptOrMessage after importing config types

//export type PromptOrMessage = { prompt: string } | { messages: NonNullable<GenerateTextConfig['messages']> };

