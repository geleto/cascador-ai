import { streamObject, LanguageModel } from 'ai';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './llm';
import { validateBaseConfig, validateObjectConfig } from './validate';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { SchemaType, TemplatePromptType } from './types';
import { StreamObjectObjectConfig, TemplateConfig, CascadaConfig } from './types-config';

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

// A mapping from the 'output' literal to its full, correct config type.
interface ConfigShapeMap {
	array: configs.StreamObjectArrayConfig<any> & configs.OptionalTemplateConfig;
	'no-schema': configs.StreamObjectNoSchemaConfig & configs.OptionalTemplateConfig;
	object: configs.StreamObjectObjectConfig<any> & configs.OptionalTemplateConfig;
}
//type ConfigOutput = keyof ConfigShapeMap | undefined;
type ConfigOutput = 'array' | 'no-schema' | 'object' | undefined;
// A helper to safely extract the output type from a config, defaulting to 'object'.
type GetOutputType<TConfig> = TConfig extends { output: any }
	? TConfig['output'] extends keyof ConfigShapeMap
	? TConfig['output']
	: 'object'
	: 'object';

type GetConfigShape<TConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig & Record<string, any>> =
	TConfig extends { promptType: 'text' } ? ConfigShapeMap[GetOutputType<TConfig>] & { promptType: 'text' } :
	ConfigShapeMap[GetOutputType<TConfig>] & TemplateConfig;

// Gets the set of allowed keys by looking up the correct config shape in the map.
type GetAllowedKeysForConfig<TConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig & Record<string, any>>
	= keyof GetConfigShape<TConfig>;

// Gets the set of keys that are required in the final, merged configuration.
type GetObjectStreamerRequiredShape<TFinalConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig & Record<string, any>> =
	TFinalConfig extends { output: 'no-schema' } ? { model: unknown } :
	// Default case for 'object', 'array', or undefined output.
	{ schema: unknown; model: unknown };

// Returns a specific error message string if template properties are used incorrectly.
type GetTemplateError<TFinalConfig extends configs.OptionalTemplateConfig & Record<string, any>> =
	TFinalConfig extends { promptType: 'text' } ? (
		keyof TFinalConfig & ('loader' | 'filters' | 'options' | 'context') extends infer InvalidProps
		? InvalidProps extends never
		? never
		: `Template properties ('${InvalidProps & string}') are not allowed when 'promptType' is 'text'.`
		: never
	) :
	TFinalConfig extends { promptType: 'template-name' | 'async-template-name' } ? (
		'loader' extends keyof TFinalConfig
		? never
		: `Loader is required when promptType is '${TFinalConfig['promptType']}'.`
	) : never;

/*
// The reason I had to disable the ObjectStreamerPermissiveConstraint for some parameters
// to avoid what I think is a TS bug where function properties prevent us from getting config type keys
// (e.g. onFinish in ObjectStreamer)
export type BadValidator<TConfig> = `'${keyof TConfig & string}'`;

export function TestConfig<
	const TConfig extends Record<string, any>
>(
	config: TConfig extends Record<string, any> ? BadValidator<TConfig> : TConfig
): void

TestConfig({
	aaa: "hello",
	xxx: 123
});

TestConfig({
	aaa: "hello",
	xxx: function () { return 123 } as const
});

TestConfig({
	aaa: "hello",
	xxx: function () { return 123 }
});

export function TestConfig2<
	const TConfig// extends Record<string, any>
>(
	config: TConfig extends Record<string, any> ? BadValidator<TConfig> : TConfig
): void

TestConfig2({
	aaa: "hello",
	xxx: function () { return 123 }
});
*/

type ObjectStreamerPermissiveConstraint<OBJECT> =
	{ output?: ConfigOutput }
	& configs.OptionalTemplateConfig
	& { output?: ConfigOutput; schema?: SchemaType<OBJECT>; }
	& Record<string, any>;

type FinalObjectStreamerPermissiveConstraint<OBJECT> =
	{ output?: ConfigOutput }
	//& TemplateConfig & { promptType?: TemplatePromptType | 'text' }
	& CascadaConfig & { prompt?: string, promptType?: TemplatePromptType | 'text' }///possibly the impossible combination of promptType: 'text' and TemplateConfig
	& { output?: ConfigOutput; schema?: SchemaType<OBJECT>; }
	& Record<string, any>;

// Validator for the child `config` object
export type ValidateObjectStreamerConfigShape<
	TConfig extends ObjectStreamerPermissiveConstraint<OBJECT>,
	TParentConfig extends ObjectStreamerPermissiveConstraint<PARENT_OBJECT>,
	TFinalConfig extends FinalObjectStreamerPermissiveConstraint<OBJECT | PARENT_OBJECT>,
	OBJECT,
	PARENT_OBJECT
> =
	// GATEKEEPER: Is the config a valid shape? We use StrictUnionSubtype to prevent extra properties.
	TConfig extends ObjectStreamerPermissiveConstraint<OBJECT>
	? (
		TParentConfig extends FinalObjectStreamerPermissiveConstraint<OBJECT>
		? (
			// 1. Check for excess properties in TConfig based on the final merged config's own `output` mode.
			keyof Omit<TConfig, GetAllowedKeysForConfig<TFinalConfig>> extends never
			// 2. If no excess, check for properties missing from the FINAL merged config.
			? keyof Omit<
				GetObjectStreamerRequiredShape<TFinalConfig>,
				keyof TFinalConfig
			> extends never
			// 3. If no missing properties, check for template rule violations in the FINAL config.
			? GetTemplateError<TFinalConfig> extends never
			// 4. All checks passed.
			? TConfig
			: `Config Error: ${GetTemplateError<TFinalConfig> & string}`
			: `Config Error: Missing required properties - '${keyof Omit<
				GetObjectStreamerRequiredShape<TFinalConfig>,
				keyof TFinalConfig
			> &
			string}'`
			: `Config Error: Unknown properties for output mode '${GetOutputType<TConfig>}' - '${keyof Omit<TConfig, GetAllowedKeysForConfig<TConfig>> & string}'`
		) : (
			//Parent Shape is invalid
			`Config Error: Invalid Parent Shape`
			//@todo maybe check TConfig for excess properties?
		)
	) : //TConfig; //Shape is invalid - Resolve to TConfig and let TypeScript produce its standard error.
	`Config Error: Invalid Shape`;

// Validator for the `parent` config's GENERIC type
export type ValidateObjectStreamerParentConfig<
	TParentConfig extends ObjectStreamerPermissiveConstraint<PARENT_OBJECT>,
	TFinalConfig extends FinalObjectStreamerPermissiveConstraint<OBJECT | PARENT_OBJECT>,
	OBJECT,
	PARENT_OBJECT,
> =
	TParentConfig extends ObjectStreamerPermissiveConstraint<PARENT_OBJECT>
	? (
		// Check for excess properties in the parent, validated against the FINAL config's shape.
		keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig>> extends never
		// The check has passed, return the original config type.
		? TParentConfig
		// On excess property failure, return a descriptive string.
		: `Parent Config Error: Unknown properties for final output mode '${GetOutputType<TFinalConfig>}' - '${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig>> & string}'`
	) : `Invalid Parent Shape`
// TParentConfig; //Shape is invalid - Resolve to TParentConfig and let TypeScript produce its standard error.

export type ObjectStreamerConfig<OBJECT, ELEMENT> = (
	| configs.StreamObjectObjectConfig<OBJECT>
	| configs.StreamObjectArrayConfig<ELEMENT>
	| configs.StreamObjectNoSchemaConfig
) & configs.OptionalTemplateConfig;


export type ObjectStreamerInstance<
	OBJECT, ELEMENT,
	CONFIG extends ObjectStreamerConfig<OBJECT, ELEMENT>
> = LLMCallSignature<CONFIG, Promise<results.StreamObjectResultAll<OBJECT, ELEMENT>>>;

/*
{ output?: ConfigOutput }
	& configs.OptionalTemplateConfig
	& { output?: ConfigOutput; schema?: SchemaType<OBJECT>; }
	& Record<string, any>;
*/

export function ObjectStreamer<
	const TConfig, // extends ObjectStreamerPermissiveConstraint<OBJECT>,
	OBJECT = any
>(
	config: TConfig extends ObjectStreamerPermissiveConstraint<OBJECT>
		? ValidateObjectStreamerConfigShape<TConfig, TConfig, TConfig, OBJECT, OBJECT>
		: Record<string, any> & { output?: ConfigOutput }// `Invalid Config Shape` //TConfig
):
	TConfig extends { output: 'array', schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectArrayResult<utils.InferParameters<TConfig['schema']>>>>

	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectNoSchemaResult>>

	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectObjectResult<utils.InferParameters<TConfig['schema']>>>>

	//no schema, no enum
	: TConfig extends { output: 'array' }
	? LLMCallSignature<TConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectArrayResult<any>>>

	: TConfig extends { output: 'object' }
	? LLMCallSignature<TConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectObjectResult<any>>>

	: LLMCallSignature<TConfig & configs.OptionalTemplateConfig, Promise<results.StreamObjectObjectResult<any>>>

// Overload for the "with-parent" case
export function ObjectStreamer<
	const TConfig, // extends ObjectStreamerPermissiveConstraint<OBJECT>,

	const TParentConfig, // extends ObjectStreamerPermissiveConstraint<PARENT_OBJECT>,

	const TFinalConfig extends FinalObjectStreamerPermissiveConstraint<OBJECT | PARENT_OBJECT>
	= utils.Override<TParentConfig, TConfig>,

	OBJECT = any,
	PARENT_OBJECT = any,
>(
	config: TConfig extends ObjectStreamerPermissiveConstraint<OBJECT>
		? TParentConfig extends ObjectStreamerPermissiveConstraint<PARENT_OBJECT>
		? ValidateObjectStreamerConfigShape<TConfig, TParentConfig, TFinalConfig, OBJECT, PARENT_OBJECT>
		: ValidateObjectStreamerConfigShape<TConfig, TConfig, TConfig, OBJECT, OBJECT> //Validate just the config individually
		: `Invalid Config Shape`, //TConfig
	parent: ConfigProvider<TParentConfig extends ObjectStreamerPermissiveConstraint<PARENT_OBJECT> ? ValidateObjectStreamerParentConfig<TParentConfig, TFinalConfig, OBJECT, PARENT_OBJECT> : `Invalid Parent Shape`>// TParentConfig
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

	validateBaseConfig(merged);
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