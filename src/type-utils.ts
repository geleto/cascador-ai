import { z } from 'zod';
import { SchemaType } from './types';
import * as configs from './types-config';
import { ILoaderAny } from 'cascada-engine';

export type Override<A, B> = Omit<A, keyof B> & B;

// Ensures T is an exact match of one of the union members in U
// Prevents extra properties and mixing properties from different union types
export type StrictUnionSubtype<T, U> = U extends any
	? T extends U
	? Exclude<keyof T, keyof U> extends never ? T : never
	: never
	: never;

// Ensures T has exactly the same properties as Shape (no extra properties). Returns never if T is not a strict subtype of Shape.
export type StrictType<T, Shape> = T extends Shape
	? keyof T extends keyof Shape ? T : never
	: never;

// Helper for types that can optionally have template properties
export type StrictTypeWithTemplate<T, Shape> = T extends { promptType: 'text' }
	? StrictType<T, Shape & { promptType: 'text' }>
	: StrictType<T, Shape & configs.TemplateConfig>;

// Helper to infer parameters from the schema
export type InferParameters<T extends configs.ToolParameters> = T extends z.ZodTypeAny
	? z.infer<T>
	: T extends { parameters: z.ZodTypeAny }
	? z.infer<T['parameters']>
	: any;

export type EnsurePromise<T> = T extends Promise<any> ? T : Promise<T>;

// Regular omit flattens the type, this one retains the original union structure. The example below will not work with regular Omit
// type DebugTConfig2 = DistributiveOmit<configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<typeof schema>, 'schema'>;
// type DebugTLoader2 = (DebugTConfig2 & { promptType: 'template' })['loader'];
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type GetMissingProperties<TRequired, TRefConfig> = Exclude<keyof TRequired, keyof TRefConfig>;

// Regular RequireMissing removes properties from TConfig that need to be made required
// and adds them back from TRequired.
export type RequireMissing<
	TConfig,
	TRequired,
	TRefConfig,
> = TConfig & Pick<TRequired, GetMissingProperties<TRequired, TRefConfig>>;

// Makes properties from TRequired required only if they don't exist in TRefConfig.
// Handles schema properties specially because zod applies DeepPartial to optional schemas
// which causes type issues when intersected with non-optional schemas via &.
// For example: {schema?: z.Schema<...>} & {schema: z.Schema<...>}
// Uses conditional type check before Omit to preserve discriminated union information
// that would be lost with direct Omit of the schema property.
export type RequireMissingWithSchema<
	TConfig,
	TRequired,
	TRefConfig,
> =
	// Handle schema type union
	(TConfig extends { schema: any }
		? (Omit<TConfig, 'schema'> & {
			schema: TConfig['schema'] extends z.Schema<infer U>
			? z.Schema<U> & SchemaType<U> // Add SchemaType union
			: TConfig['schema']
		})
		: TConfig) &
	// Add missing required properties
	Pick<TRequired, GetMissingProperties<TRequired, TRefConfig>>;

export type RequireTemplateLoaderIfNeeded<
	TMergedConfig extends configs.OptionalTemplateConfig
> = TMergedConfig['promptType'] extends 'template-name' | 'async-template-name'
	? 'loader' extends keyof TMergedConfig ? object : { loader: ILoaderAny | ILoaderAny[] }
	: object;

export type RequireScriptLoaderIfNeeded<
	TMergedConfig extends configs.ScriptConfig
> = TMergedConfig['scriptType'] extends 'script-name' | 'async-script-name'
	? 'loader' extends keyof TMergedConfig ? object : { loader: ILoaderAny | ILoaderAny[] }
	: object;