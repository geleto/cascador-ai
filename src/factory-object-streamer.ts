import { streamObject, LanguageModel } from 'ai';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './llm';
import { validateBaseConfig, validateObjectConfig } from './validate';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { SchemaType } from './types';
import { StreamObjectObjectConfig } from './types-config';

type KeysOfUnion<T> = T extends any ? keyof T : never;

// The complete set of all allowed keys for any ObjectStreamer configuration.
type AllAllowedKeys = KeysOfUnion<
	| configs.StreamObjectObjectConfig<any>
	| configs.StreamObjectArrayConfig<any>
	| configs.StreamObjectNoSchemaConfig
	| configs.OptionalTemplateConfig
>;

// The ParentConfigError interface is no longer needed and has been removed.

// Gets the set of keys that are required in the final, merged configuration.
type GetObjectStreamerRequiredShape<TFinalConfig> =
	(
		TFinalConfig extends { output: 'array' } ? { schema: unknown; model: unknown } :
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
export type ValidateObjectStreamerConfigShape<
	TConfig,
	TFinalConfig,
	TParentConfig = never
> =
	// 1. Check for excess properties in TConfig.
	keyof Omit<TConfig, AllAllowedKeys> extends never
	// 2. If no excess, check for missing properties.
	? keyof Omit<
		GetObjectStreamerRequiredShape<TFinalConfig>,
		keyof TConfig | keyof TParentConfig
	> extends never
	// 3. If no missing, check for template errors.
	? GetTemplateError<TFinalConfig> extends never
	// 4. All checks passed.
	? TConfig
	: `Config Error: ${GetTemplateError<TFinalConfig> & string}`
	: `Config Error: Missing required properties - '${keyof Omit<
		GetObjectStreamerRequiredShape<TFinalConfig>,
		keyof TConfig | keyof TParentConfig
	> &
	string}'`
	: `Config Error: Unknown properties - '${keyof Omit<TConfig, AllAllowedKeys> & string}'`;


// Validator for the `parent` config's GENERIC type
export type ValidateObjectStreamerParentConfig<TParentConfig> =
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


export type ObjectStreamerConfig<OBJECT, ELEMENT> = (
	| configs.StreamObjectObjectConfig<OBJECT>
	| configs.StreamObjectArrayConfig<ELEMENT>
	| configs.StreamObjectNoSchemaConfig
) & configs.OptionalTemplateConfig;


export type ObjectStreamerInstance<
	OBJECT, ELEMENT,
	CONFIG extends ObjectStreamerConfig<OBJECT, ELEMENT>
> = LLMCallSignature<CONFIG, Promise<results.StreamObjectResultAll<OBJECT, ELEMENT>>>;

export function ObjectStreamer<
	const TConfig extends configs.OptionalTemplateConfig & Record<string, any>
	& { schema?: SchemaType<OBJECT>, output?: 'object' | 'array' | 'no-schema' | undefined },

	ELEMENT = any,
	OBJECT = any
>(
	config: ValidateObjectStreamerConfigShape<TConfig, TConfig>
):
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>>

	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>>

	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>>

	: TConfig extends { output: 'array' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<any>>>

	: TConfig extends { output: 'object' }
	? LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<any>>>

	: LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<any>>>

// Overload for the "with-parent" case
export function ObjectStreamer<
	// TConfig and TParentConfig can be partial.
	//@todo - check if the OptionalTemplateConfig is needed here
	const TConfig extends configs.OptionalTemplateConfig & Record<string, any>
	& { schema?: SchemaType<OBJECT>, output?: 'object' | 'array' | 'no-schema' | undefined },

	const TParentConfig extends configs.OptionalTemplateConfig & Record<string, any>
	& { schema?: SchemaType<PARENT_OBJECT>, output?: 'object' | 'array' | 'no-schema' | undefined },

	OBJECT = any,
	PARENT_OBJECT = any,

	// CORRECTED: TFinalConfig is now a clean merge without the confusing default.
	const TFinalConfig = utils.Override<TParentConfig, TConfig>
>(
	config: ValidateObjectStreamerConfigShape<TConfig, TFinalConfig>,
	parent: ConfigProvider<ValidateObjectStreamerParentConfig<TParentConfig>>
):
	// Final output is 'array' with a schema. We infer the element type directly from the final schema.
	TFinalConfig extends { output: 'array', schema: SchemaType<any> }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TFinalConfig['schema']>>>>

	// Final output is 'no-schema'.
	: TFinalConfig extends { output: 'no-schema' }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectNoSchemaResult>>

	// Final output is 'object' (or defaulted to 'object') with a schema. We infer the object type directly from the final schema.
	: TFinalConfig extends { output?: 'object' | undefined, schema: SchemaType<any> }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TFinalConfig['schema']>>>>

	// Fallback case: Final output is 'array' but no schema is provided anywhere.
	: TFinalConfig extends { output: 'array' }
	? LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectArrayResult<any>>>

	// Fallback case: Final output is 'object' (or defaulted) but no schema is provided anywhere.
	: LLMCallSignature<TFinalConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectObjectResult<any>>>

// Implementation
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig,
	TParentConfig extends configs.OptionalTemplateConfig,
	OBJECT = any, ELEMENT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, results.StreamObjectResultAll<OBJECT, ELEMENT>> |
	LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.StreamObjectResultAll<OBJECT, ELEMENT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? utils.Override<TParentConfig, TConfig>
		: TConfig;

	const merged = parent ? mergeConfigs(parent.config, config) : config;

	// Set default output value to make the config explicit.
	if ((merged as StreamObjectObjectConfig<OBJECT>).output === undefined) {
		(merged as StreamObjectObjectConfig<OBJECT>).output = 'object';
	}

	if (parent) {
		validateBaseConfig(merged);
	}
	// The key change: call validation with isStream = true
	validateObjectConfig(merged, true);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] ObjectStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer<
		CombinedType,
		configs.StreamObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		results.StreamObjectObjectResult<OBJECT>
	>(merged, streamObject);
}