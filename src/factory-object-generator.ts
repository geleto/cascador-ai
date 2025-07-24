import { generateObject, LanguageModel } from 'ai';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './llm';
import { validateBaseConfig, validateObjectConfig } from './validate';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { SchemaType } from './types';
import { GenerateObjectObjectConfig } from './types-config';

// You want to use the overload generic parameters only to help guide to the correct overload and not to do any type validation
// so that the correct overload is selected (todo - later when we change config to be assignable to an error type)
// The actual validation should be done in the argument type so that the error will at least pinpoint the correct overload

// Any generic parameter extends part that only has partials
// and that does not define generic types like ELEMENT, ENUM, OBJECT
// and does not specialize some type (e.g. promptType?: 'template-name' | 'template-id' | 'text')
// - then that part is not needed.
// But if the generic parameter extends a type that has only partials,
// then add a Record<string, any> & {optional props} so that the extends works (it requires at least 1 matching property)

// Helper Types for Error Generation

type KeysOfUnion<T> = T extends any ? keyof T : never;

// The complete set of all allowed keys for any ObjectGenerator configuration.
type AllAllowedKeys = KeysOfUnion<
	| configs.GenerateObjectObjectConfig<any>
	| configs.GenerateObjectArrayConfig<any>
	| configs.GenerateObjectEnumConfig<any>
	| configs.GenerateObjectNoSchemaConfig
	| configs.OptionalTemplateConfig
>;

// The ParentConfigError interface is no longer needed and has been removed.

// Gets the set of keys that are required in the final, merged configuration.
type GetObjectGeneratorRequiredShape<TFinalConfig> =
	(
		TFinalConfig extends { output: 'array' } ? { schema: unknown; model: unknown } :
		TFinalConfig extends { output: 'enum' } ? { enum: unknown; model: unknown } :
		TFinalConfig extends { output: 'no-schema' } ? { model: unknown } :
		{ schema: unknown; model: unknown }
	);

// Returns a specific error message string if template properties are used incorrectly.
type GetTemplateError<TConfig> =
	TConfig extends { promptType: 'text' } ? (
		keyof TConfig & ('loader' | 'filters' | 'options' | 'context') extends infer InvalidProps
		? InvalidProps extends never
		? never
		: `Template properties ('${InvalidProps & string}') are not allowed when 'promptType' is 'text'.`
		: never
	) :
	TConfig extends { promptType: 'template-name' | 'async-template-name' } ? (
		'loader' extends keyof TConfig
		? never
		: `Loader is required when promptType is '${TConfig['promptType']}'.`
	) : never;


// Validator for the child `config` object
export type ValidateObjectGeneratorConfigShape<
	TConfig,
	TFinalConfig,
	TParentConfig = never
> =
	// 1. Check for excess properties in TConfig.
	keyof Omit<TConfig, AllAllowedKeys> extends never
	// 2. If no excess, check for missing properties.
	? keyof Omit<
		GetObjectGeneratorRequiredShape<TFinalConfig>,
		keyof TConfig | keyof TParentConfig
	> extends never
	// 3. If no missing, check for template errors.
	? GetTemplateError<TFinalConfig> extends never
	// 4. All checks passed.
	? TConfig
	: `Config Error: ${GetTemplateError<TFinalConfig> & string}`
	: `Config Error: Missing required properties - '${keyof Omit<
		GetObjectGeneratorRequiredShape<TFinalConfig>,
		keyof TConfig | keyof TParentConfig
	> &
	string}'`
	: `Config Error: Unknown properties - '${keyof Omit<TConfig, AllAllowedKeys> & string}'`;


// Validator for the `parent` config's GENERIC type
export type ValidateObjectGeneratorParentConfig<TParentConfig> =
	// 1. Check for excess properties in the parent config.
	keyof Omit<TParentConfig, AllAllowedKeys> extends never
	// 2. If no excess, check for template errors.
	? GetTemplateError<TParentConfig> extends never
	// 3. All checks passed, return the original config type.
	? TParentConfig
	// On template failure, return a descriptive string.
	: `Parent Config Error: ${GetTemplateError<TParentConfig> & string}`
	// On excess property failure, return a descriptive string.
	: `Parent Config Error: Unknown properties - '${keyof Omit<TParentConfig, AllAllowedKeys> & string}'`;


export type ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM extends string> = (
	| configs.GenerateObjectObjectConfig<OBJECT>
	| configs.GenerateObjectArrayConfig<ELEMENT>
	| configs.GenerateObjectEnumConfig<ENUM>
	| configs.GenerateObjectNoSchemaConfig
) & configs.OptionalTemplateConfig;


export type ObjectGeneratorInstance<
	OBJECT, ELEMENT, ENUM extends string,
	CONFIG extends ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>
> = LLMCallSignature<CONFIG, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>>;

export function ObjectGenerator<
	const TConfig extends configs.OptionalTemplateConfig & Record<string, any>
	& { schema?: SchemaType<OBJECT>, enum?: readonly (ENUM)[], output?: 'object' | 'array' | 'no-schema' | 'enum' | undefined },

	ELEMENT = any,
	ENUM extends string = string,
	OBJECT = any
>(
	config: ValidateObjectGeneratorConfigShape<TConfig, TConfig>
):
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>>

	: TConfig extends { output: 'enum', enum: readonly (ENUM)[] }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>>

	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>>

	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>>

	: TConfig extends { output: 'array' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<any>>>

	: TConfig extends { output: 'enum' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<any>>>

	: TConfig extends { output: 'object' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<any>>>

	: LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<any>>>

// Overload for the "with-parent" case
export function ObjectGenerator<
	// TConfig and TParentConfig can be partial.
	//@todo - check if the OptionalTemplateConfig is needed here
	const TConfig extends configs.OptionalTemplateConfig & Record<string, any>
	& { schema?: SchemaType<OBJECT>, enum?: readonly (string)[], output?: 'object' | 'array' | 'no-schema' | 'enum' | undefined },

	const TParentConfig extends configs.OptionalTemplateConfig & Record<string, any>
	& { schema?: SchemaType<PARENT_OBJECT>, enum?: readonly (string)[], output?: 'object' | 'array' | 'no-schema' | 'enum' | undefined },

	OBJECT = any,
	PARENT_OBJECT = any,

	// CORRECTED: TFinalConfig is now a clean merge without the confusing default.
	const TFinalConfig = utils.Override<TParentConfig, TConfig>
>(
	config: ValidateObjectGeneratorConfigShape<TConfig, TFinalConfig>,
	parent: ConfigProvider<ValidateObjectGeneratorParentConfig<TParentConfig>>
):
	// Final output is 'array' with a schema. We infer the element type directly from the final schema.
	TFinalConfig extends { output: 'array', schema: SchemaType<any> }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.GenerateObjectArrayResult<utils.InferParameters<TFinalConfig['schema']>>>>

	// Final output is 'enum' with an enum array. We infer the enum members directly from the final enum array.
	: TFinalConfig extends { output: 'enum', enum: readonly string[] }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.GenerateObjectEnumResult<TFinalConfig['enum'][number]>>>

	// Final output is 'no-schema'.
	: TFinalConfig extends { output: 'no-schema' }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.GenerateObjectNoSchemaResult>>

	// Final output is 'object' (or defaulted to 'object') with a schema. We infer the object type directly from the final schema.
	: TFinalConfig extends { output?: 'object' | undefined, schema: SchemaType<any> }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.GenerateObjectObjectResult<utils.InferParameters<TFinalConfig['schema']>>>>

	// Fallback case: Final output is 'array' but no schema is provided anywhere.
	: TFinalConfig extends { output: 'array' }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.GenerateObjectArrayResult<any>>>

	// Fallback case: Final output is 'enum' but no enum is provided anywhere.
	: TFinalConfig extends { output: 'enum' }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.GenerateObjectEnumResult<any>>>

	// Fallback case: Final output is 'object' (or defaulted) but no schema is provided anywhere.
	: LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.GenerateObjectObjectResult<any>>>

// Implementation remains the same...
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig,
	TParentConfig extends configs.OptionalTemplateConfig,
	ELEMENT = any,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> |
	LLMCallSignature<utils.Override<TParentConfig, TConfig>, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? utils.Override<TParentConfig, TConfig>
		: TConfig;

	//validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as GenerateObjectObjectConfig<OBJECT>).output === undefined) {
		(merged as GenerateObjectObjectConfig<OBJECT>).output = 'object';
	}

	if (parent) {
		validateBaseConfig(merged);
	}
	validateObjectConfig(merged, false);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	// One of several possible overloads (config.output = 'object' / undefined), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		configs.GenerateObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		Promise<results.GenerateObjectObjectResult<OBJECT>>
	>(merged, generateObject);
}