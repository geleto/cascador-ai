import { generateObject, LanguageModel } from 'ai';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './llm';
import { validateBaseConfig, validateObjectConfig } from './validate';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { SchemaType, TemplatePromptType } from './types';
import { GenerateObjectObjectConfig, TemplateConfig, CascadaConfig } from './types-config';

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
	array: configs.GenerateObjectArrayConfig<any> & configs.OptionalTemplateConfig;
	enum: configs.GenerateObjectEnumConfig<any> & configs.OptionalTemplateConfig;
	'no-schema': configs.GenerateObjectNoSchemaConfig & configs.OptionalTemplateConfig;
	object: configs.GenerateObjectObjectConfig<any> & configs.OptionalTemplateConfig;
}
//type ConfigOutput = keyof ConfigShapeMap | undefined;
type ConfigOutput = 'array' | 'enum' | 'no-schema' | 'object' | undefined;
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
type GetObjectGeneratorRequiredShape<TFinalConfig extends { output?: ConfigOutput } & configs.OptionalTemplateConfig & Record<string, any>> =
	TFinalConfig extends { output: 'enum' } ? { enum: unknown; model: unknown } :
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
import { z } from 'zod';
const simpleSchema = z.object({
	name: z.string().describe('The name of the item'),
	value: z.number().describe('A numerical value'),
});
const conf = {
	model: 1 as unknown as LanguageModel,
	output: 'object' as const
}
type required = GetObjectGeneratorRequiredShape<typeof conf>;
type missing = Omit<
	GetObjectGeneratorRequiredShape<typeof conf>,
	keyof (typeof conf)
>*/

/*const conf = {
	promptType: 'template',
	schema: simpleSchema,
	context: { entity: 'product' },
	prompt: 'Generate an object for "{{ entity }}" with value {{ defaultId }}.',
};
type val = ValidateObjectGeneratorConfigShape<typeof conf, typeof conf>;
type extra = keyof Omit<typeof conf, GetAllowedKeysForConfig<typeof conf>>
type allowed = GetAllowedKeysForConfig<typeof conf>*/

/*const conf = {
	model: 1 as unknown as LanguageModel,
	output: 'invalid' as const,
}

type val = ValidateObjectGeneratorConfigShape<typeof conf, typeof conf, any, string, any, string>;*/

/*const conf1 = { model: openAIModel };
const conf2 = { output: 'no-schema' };
type final = utils.Override<typeof conf1, typeof conf2>;
type valid = ValidateObjectGeneratorConfigShape<typeof conf1, typeof conf1, final, any, string, any, string>;*/

// This constraint is permissive on purpose, the actual validation is done in the ValidateObjectGeneratorConfigShape type

type ObjectGeneratorPermissiveConstraint<OBJECT, ENUM extends string> =
	{ output?: ConfigOutput }
	& configs.OptionalTemplateConfig
	& { output?: ConfigOutput; schema?: SchemaType<OBJECT>; enum?: readonly ENUM[]; }
	& Record<string, any>;

type FinalObjectGeneratorPermissiveConstraint<OBJECT, ENUM extends string> =
	{ output?: ConfigOutput }
	//& TemplateConfig & { promptType?: TemplatePromptType | 'text' }
	& CascadaConfig & { prompt?: string, promptType?: TemplatePromptType | 'text' }///possibly the impossible combination of promptType: 'text' and TemplateConfig
	& { output?: ConfigOutput; schema?: SchemaType<OBJECT>; enum?: readonly ENUM[]; }
	& Record<string, any>;

// Validator for the child `config` object
export type ValidateObjectGeneratorConfigShape<
	TConfig extends ObjectGeneratorPermissiveConstraint<OBJECT, ENUM>,
	TParentConfig extends ObjectGeneratorPermissiveConstraint<PARENT_OBJECT, PARENT_ENUM>,
	TFinalConfig extends FinalObjectGeneratorPermissiveConstraint<OBJECT | PARENT_OBJECT, ENUM | PARENT_ENUM>,
	OBJECT,
	ENUM extends string,
	PARENT_OBJECT,
	PARENT_ENUM extends string
> =
	// GATEKEEPER: Is the config a valid shape? We use StrictUnionSubtype to prevent extra properties.
	TConfig extends ObjectGeneratorPermissiveConstraint<OBJECT, ENUM>
	? (
		TParentConfig extends FinalObjectGeneratorPermissiveConstraint<OBJECT, ENUM>
		? (
			// 1. Check for excess properties in TConfig based on the final merged config's own `output` mode.
			keyof Omit<TConfig, GetAllowedKeysForConfig<TFinalConfig>> extends never
			// 2. If no excess, check for properties missing from the FINAL merged config.
			? keyof Omit<
				GetObjectGeneratorRequiredShape<TFinalConfig>,
				keyof TFinalConfig
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
			: `Config Error: Unknown properties for output mode '${GetOutputType<TConfig>}' - '${keyof Omit<TConfig, GetAllowedKeysForConfig<TConfig>> & string}'`
		) : (
			//Parent Shape is invalid - for parent TypeScript will produce its standard error.
			TConfig
			//@todo maybe check TConfig for excess properties?
		)
	) : TConfig; //Shape is invalid - Resolve to TConfig and let TypeScript produce its standard error.

// Validator for the `parent` config's GENERIC type
export type ValidateObjectGeneratorParentConfig<
	TParentConfig extends ObjectGeneratorPermissiveConstraint<PARENT_OBJECT, PARENT_ENUM>,
	TFinalConfig extends FinalObjectGeneratorPermissiveConstraint<OBJECT | PARENT_OBJECT, ENUM | PARENT_ENUM>,
	OBJECT,
	ENUM extends string,
	PARENT_OBJECT,
	PARENT_ENUM extends string
> =
	TParentConfig extends ObjectGeneratorPermissiveConstraint<PARENT_OBJECT, PARENT_ENUM>
	? (
		// Check for excess properties in the parent, validated against the FINAL config's shape.
		keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig>> extends never
		// The check has passed, return the original config type.
		? TParentConfig
		// On excess property failure, return a descriptive string.
		: `Parent Config Error: Unknown properties for final output mode '${GetOutputType<TFinalConfig>}' - '${keyof Omit<TParentConfig, GetAllowedKeysForConfig<TFinalConfig>> & string}'`
	) : TParentConfig; //Shape is invalid - Resolve to TParentConfig and let TypeScript produce its standard error.

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
	const TConfig extends ObjectGeneratorPermissiveConstraint<OBJECT, ENUM>,

	ENUM extends string = string,
	OBJECT = any
>(
	config: ValidateObjectGeneratorConfigShape<TConfig, TConfig, TConfig, OBJECT, ENUM, OBJECT, ENUM>
):
	TConfig extends { output: 'array', schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>>

	: TConfig extends { output: 'enum', enum: readonly (ENUM)[] }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>>

	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>>

	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>>

	//no schema, no enum
	: TConfig extends { output: 'array' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<any>>>

	: TConfig extends { output: 'enum' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<any>>>

	: TConfig extends { output: 'object' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<any>>>

	: LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<any>>>

// Overload for the "with-parent" case
export function ObjectGenerator<
	const TConfig extends ObjectGeneratorPermissiveConstraint<OBJECT, ENUM>,

	const TParentConfig extends ObjectGeneratorPermissiveConstraint<PARENT_OBJECT, PARENT_ENUM>,

	const TFinalConfig extends FinalObjectGeneratorPermissiveConstraint<OBJECT | PARENT_OBJECT, ENUM | PARENT_ENUM>
	= utils.Override<TParentConfig, TConfig>,

	OBJECT = any,
	PARENT_OBJECT = any,
	ENUM extends string = string,
	PARENT_ENUM extends string = string,
>(
	config: ValidateObjectGeneratorConfigShape<TConfig, TParentConfig, TFinalConfig, OBJECT, ENUM, PARENT_OBJECT, PARENT_ENUM>,
	parent: ConfigProvider<ValidateObjectGeneratorParentConfig<TParentConfig, TFinalConfig, OBJECT, ENUM, PARENT_OBJECT, PARENT_ENUM>>
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

// Implementation.
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
	LLMCallSignature<TConfig | TParentConfig, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> {

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