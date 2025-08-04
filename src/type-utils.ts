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

/** A union of all possible validation error objects for strong typing. */
/*export type ConfigValidationError =
	| { readonly 'Config Error': 'Excess properties are not allowed.', readonly excess: string[] }
	| { readonly 'Config Error': 'Required properties are missing.', readonly missing: string[] }
	| { readonly 'Config Error': "The 'loader' property is required when 'promptType' is 'template-name' or 'async-template-name'." }
	| { readonly 'Config Error': "Template properties ('loader', 'filters', 'options') are not allowed when 'promptType' is 'text'." };
*/

// Helper to get keys as a string array for the error message
export type KeysToStringArray<T> = T extends readonly [infer F, ...infer R] ? [F & string, ...KeysToStringArray<R>] : [];

// Makes sure the override of T and ParentT is a strict subtype of Shape, returns T if it is
type StrictOverrideType<T, ParentT, Shape> = Override<ParentT, T> extends Shape
	? keyof Override<ParentT, T> extends keyof Shape ? T : never
	: never;

// Ensures T strictly matches Shape while enforcing template property rules.
// Disallows template properties (e.g., loader, filters) for `promptType: 'text'`, but requires `loader` for named template modes.
// For standalone configs (no parent).
export type StrictTypeWithTemplateAndLoader<T extends configs.OptionalTemplateConfig, Shape> = T extends { promptType: 'text' }
	? StrictType<T, Shape & { promptType: 'text' }>
	: StrictType<T, Shape & configs.TemplateConfig & RequireTemplateLoaderIfNeeded<T>>;

// Ensures the merged Parent/Child config strictly matches Shape while enforcing template property rules.
// Disallows template properties for `promptType: 'text'` on the merged object, but requires `loader` for named template modes.
// For configs with a parent.
export type StrictOverrideTypeWithTemplateAndLoader<Config extends configs.OptionalTemplateConfig, ParentConfig extends configs.OptionalTemplateConfig, Shape> = Override<Config, ParentConfig> extends { promptType: 'text' }
	? StrictOverrideType<Config, ParentConfig, Shape & { promptType: 'text' }>
	: StrictOverrideType<Config, ParentConfig, Shape & configs.TemplateConfig & RequireTemplateLoaderIfNeeded<Config>>;

// Helper to infer parameters from the schema
export type InferParameters<T extends SchemaType<any>> = T extends z.ZodTypeAny
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

// This type takes a base configuration and ensures it includes any required properties
// that are missing when compared to a reference configuration.
// Regular RequireMissing removes properties from TConfig that need to be made required
// and adds them back from TRequired.
export type RequireMissing<
	TConfig,
	TRequired,
	TRefConfig //this is usually the parent config, so any requiredproperties that it misses are added to the config
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
	TMergedConfig extends configs.ScriptConfig<OBJECT>,
	OBJECT = any
> = TMergedConfig['scriptType'] extends 'script-name' | 'async-script-name'
	? 'loader' extends keyof TMergedConfig ? object : { loader: ILoaderAny | ILoaderAny[] }
	: object;