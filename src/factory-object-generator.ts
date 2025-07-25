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

// Gets the set of allowed keys based on the config's `output` property.
// This is much more precise than a single union of all possible keys.
interface ConfigShapeMap {
	array: configs.GenerateObjectArrayConfig<any> & configs.OptionalTemplateConfig;
	enum: configs.GenerateObjectEnumConfig<any> & configs.OptionalTemplateConfig;
	'no-schema': configs.GenerateObjectNoSchemaConfig & configs.OptionalTemplateConfig;
	object: configs.GenerateObjectObjectConfig<any> & configs.OptionalTemplateConfig;
}

//type ConfigOutput = keyof ConfigShapeMap | undefined;
type ConfigOutput = 'array' | 'enum' | 'no-schema' | 'object' | undefined;

//export type XOverride<A extends { output?: ConfigOutput } & configs.OptionalTemplateConfig, B extends { output?: ConfigOutput } & configs.OptionalTemplateConfig> = Omit<A, keyof B> & B;

// A helper to safely extract the output type from a config, defaulting to 'object'.
// A helper to safely extract the output type from a config, defaulting to 'object'.
type GetOutputType<TConfig extends { output?: ConfigOutput }> =
	TConfig extends { output: any } //we have the property output
	? TConfig['output']
	: 'object';

// Gets the set of allowed keys by looking up the correct config shape in the map.
// This is the robust replacement for the previous conditional type.
type GetAllowedKeysForConfig<TConfig extends { output?: ConfigOutput } & Record<string, any>> = keyof ConfigShapeMap[GetOutputType<TConfig>];

// Gets the set of keys that are required in the final, merged configuration.
type GetObjectGeneratorRequiredShape<TFinalConfig extends { output?: ConfigOutput }> =
	TFinalConfig extends { output: 'enum' } ? { enum: unknown; model: unknown } :
	TFinalConfig extends { output: 'no-schema' } ? { model: unknown } :
	// Default case for 'object', 'array', or undefined output.
	{ schema: unknown; model: unknown };

// Returns a specific error message string if template properties are used incorrectly.
type GetTemplateError<TFinalConfig extends configs.OptionalTemplateConfig> =
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

// Validator for the child `config` object
/*export type ValidateObjectGeneratorConfigShape<
	TConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig,
	TFinalConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig
> =
	// 1. Check for excess properties in TConfig based on its specific `output` mode.
	keyof Omit<TConfig, GetAllowedKeysForConfig<TConfig>> extends never
	// 2. If no excess, check for properties missing from the FINAL merged config.
	? keyof Omit<
		GetObjectGeneratorRequiredShape<TFinalConfig>,
		keyof TFinalConfig // Corrected: Check against the final config
	> extends never
	// 3. If no missing properties, check for template rule violations in the FINAL config.
	? GetTemplateError<TFinalConfig> extends never
	// 4. All checks passed.
	? TConfig
	: `Config Error: ${GetTemplateError<TFinalConfig> & string}`
	: `Config Error: Missing required properties - '${keyof Omit<
		GetObjectGeneratorRequiredShape<TFinalConfig>,
		keyof TFinalConfig
	> &
	string}'`
	: `Config Error: Unknown properties for output mode '${GetOutputType<TConfig>}' - '${keyof Omit<TConfig, GetAllowedKeysForConfig<TConfig>> & string}'`;
*/
export type ValidateObjectGeneratorConfigShape<
	TConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig,
	// The parent config type. Use a default for the no-parent case.
	TParentConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig = Record<string, any>,
> =
	utils.Override<TParentConfig, TConfig> extends infer TFinalConfig
	? TFinalConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig // Re-assert shape
	// 1. Check for excess properties in TConfig based on the final merged config's own `output` mode.
	? keyof Omit<TConfig, GetAllowedKeysForConfig<TFinalConfig>> extends never
	// 2. If no excess, check for properties missing from the FINAL merged config.
	? keyof Omit<GetObjectGeneratorRequiredShape<TFinalConfig>, keyof TFinalConfig> extends never
	// 3. If no missing properties, check for template rule violations in the FINAL config.
	? GetTemplateError<TFinalConfig> extends never
	// 4. All checks passed. Return the original config type.
	? TConfig
	: `Config Error: ${GetTemplateError<TFinalConfig> & string}`
	: `Config Error: Missing required properties - '${keyof Omit<GetObjectGeneratorRequiredShape<TFinalConfig>, keyof TFinalConfig> & string}'`
	: `Config Error: Unknown properties for output mode '${GetOutputType<TConfig>}' - '${keyof Omit<TConfig, GetAllowedKeysForConfig<TConfig>> & string}'`
	: TConfig // Should not happen, but return TConfig to satisfy constraint.
	: TConfig; // Should not happen

/*
const enumValues = ['Red', 'Green', 'Blue'] as const;
const pconf = {
	model: 1 as unknown as LanguageModel,
	output: 'enum' as const
};
type ptype = typeof pconf
const cconfig = {
	enum: enumValues,
	prompt: 'From the available colors, what color is a fire truck?'
} as const;
type ctype = typeof cconfig;
type t = utils.Override<ptype, ctype>

type ConfigOutput = 'array' | 'enum' | 'no-schema' | 'object' | undefined;
type test = [t] extends [({ output?: ConfigOutput } & configs.OptionalTemplateConfig)] ? 'yes' : 'no';

type g = GetAllowedKeysForConfig<ctype>

type v = ValidateObjectGeneratorConfigShape<ctype, ptype>

type over = utils.Override<ptype, ctype>

type extra = keyof Omit<ctype, GetAllowedKeysForConfig<over>>*/

export type ValidateObjectGeneratorParentConfig<
	TConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig,
	TParentConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig
> =
	// 1. Check for excess properties in the parent config based on its specific `output` mode.
	keyof Omit<TParentConfig, GetAllowedKeysForConfig<TParentConfig>> extends never//@todo - on overloaded output mode
	// 2. All checks passed, return the original config type.
	? TParentConfig
	// On excess property failure, return a descriptive string.
	: `Parent Config Error: Unknown properties for output mode '${GetOutputType<TParentConfig>}' - '${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TParentConfig>> & string}'`;

// Validator for the `parent` config's GENERIC type
export type ValidateObjectGeneratorParentConfig2<
	TConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig,
	// The parent config type. Use a default for the no-parent case.
	TParentConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig = Record<string, any>,
> =
	utils.Override<TParentConfig, TConfig> extends infer TFinalConfig
	? TFinalConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig // Re-assert shape
	// 1. Check for excess properties in the parent config based on its specific `output` mode.
	? keyof Omit<TParentConfig, GetAllowedKeysForConfig<TParentConfig>> extends never//@todo - on overloaded output mode
	// 2. All checks passed, return the original config type.
	? TParentConfig
	// On excess property failure, return a descriptive string.
	: `Parent Config Error: Unknown properties for output mode '${GetOutputType<TParentConfig>}' - '${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TParentConfig>> & string}'`
	: TConfig // Should not happen, but return TConfig to satisfy constraint.
	: TConfig; // Should not happen


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
	config: ValidateObjectGeneratorConfigShape<TConfig, TParentConfig>,
	parent: ConfigProvider<ValidateObjectGeneratorParentConfig<TConfig, TParentConfig>>
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