import { Schema } from 'ai';
import { z } from 'zod';
import { GenerateTextConfig } from './types-config';

// Template types
export type Context = Record<string, any>;
export type Filters = Record<string, (input: any, ...args: any[]) => any>;

export type SchemaType<T> = z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

// Define the possible prompt types
export type TemplatePromptType = 'template' | 'async-template' | 'template-name' | 'async-template-name' | undefined;
export type ScriptType = 'script' | 'async-script' | 'script-name' | 'async-script-name' | undefined;
export type LLMPromptType = TemplatePromptType | 'text';

// Re-export config types from types-config.ts
export * from './types-config';

// Define PromptOrMessage after importing config types
export type PromptOrMessage = { prompt: string } | { messages: NonNullable<GenerateTextConfig['messages']> };

