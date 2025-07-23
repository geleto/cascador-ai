import { generateObject, streamObject, LanguageModel, ToolSet, } from 'ai';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './llm';
import { validateBaseConfig, validateObjectConfig } from './validate';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { SchemaType } from './types';
import { GenerateObjectObjectConfig, StreamObjectObjectConfig } from './types-config';

// You want to use the overload generic parameters only to help guide to the correct overload and not to do any type validation
// so that the correct overload is selected (todo - later when we change config to be assignable to an error type)
// The actual validation should be done in the argument type so that the error will at least pinpoint the correct overload

// Any generic parameter extends part that only has partials
// and that does not define generic types like ELEMENT, ENUM, OBJECT
// and does not specialize some type (e.g. promptType?: 'template-name' | 'template-id' | 'text')
// - then that part is not needed.
// But if the generic parameter extends a type that has only partials,
// then add a Record<string, any> & {optional props} so that the extends works (it requires at least 1 matching property)

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
	const TConfig extends
	({ schema?: SchemaType<OBJECT>, enum?: readonly (ENUM)[] } & ({ output?: 'object' } | { output?: 'array' } | { output: 'no-schema' } | { output?: 'enum' } | { output?: undefined }))
	& configs.OptionalTemplateConfig,
	ELEMENT = any,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig
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
	const TConfig extends
	({ schema?: SchemaType<OBJECT>, enum?: readonly (string)[] } & ({ output?: 'object' } | { output?: 'array' } | { output: 'no-schema' } | { output?: 'enum' } | { output?: undefined }))
	& configs.OptionalTemplateConfig,

	const TParentConfig extends
	({ schema?: SchemaType<PARENT_OBJECT>, enum?: readonly (string)[] } & ({ output?: 'object' } | { output?: 'array' } | { output: 'no-schema' } | { output?: 'enum' } | { output?: undefined }))
	& configs.OptionalTemplateConfig,

	OBJECT = any,
	PARENT_OBJECT = any,

	const TFinalConfig = utils.Override<{ output: 'object' }, utils.Override<TParentConfig, TConfig>>
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
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


// (Assume _ObjectGenerator is defined elsewhere and has its own overloads)

// Helper type to get the first parameter of a function type
//type FirstParameter<T extends (...args: any) => any> = T extends (config: infer P, ...args: any) => any ? P : never;

// --- PUBLIC OVERLOADS ---

/*export function ObjectGenerator<
	const TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT> & { output: 'object', schema: SchemaType<OBJECT> },
	OBJECT
>(
	config: typeof _ObjectGenerator<TConfig, OBJECT>[0]
): ReturnType<typeof _ObjectGenerator<TConfig, OBJECT>>

export function ObjectGenerator<
	const TConfig extends { output: 'object', schema: SchemaType<OBJECT> }
	& configs.GenerateObjectObjectConfig<OBJECT> & configs.OptionalTemplateConfig,
	OBJECT
>(
	config: Parameters<typeof _ObjectGenerator<TConfig, OBJECT>>[0]
): ReturnType<typeof _ObjectGenerator<TConfig, OBJECT>>;*/

/*
// Overload 1: `output: 'array'`
export function ObjectGenerator<
	const TConfig extends { output: 'array', schema: SchemaType<ELEMENT> }
	& configs.GenerateObjectArrayConfig<ELEMENT> & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: Parameters<typeof _ObjectGenerator<TConfig, ELEMENT>>[0]
): ReturnType<typeof _ObjectGenerator<TConfig, ELEMENT>>;


// Overload 2: `output: 'enum'`
export function ObjectGenerator<
	const TConfig extends {
		output: 'enum',
		enum: readonly ENUM[], // `enum` is required
		model: LanguageModel // `model` is required
	} & configs.OptionalTemplateConfig & configs.GenerateObjectEnumConfig<ENUM>,
	ENUM extends string
>(
	config: Parameters<typeof _ObjectGenerator<TConfig, ENUM>>[0]
): ReturnType<typeof _ObjectGenerator<TConfig, ENUM>>;


// Overload 3: `output: 'no-schema'`
export function ObjectGenerator<
	const TConfig extends {
		output: 'no-schema',
		model: LanguageModel // `model` is required
	} & configs.OptionalTemplateConfig & configs.GenerateObjectNoSchemaConfig
>(
	config: Parameters<typeof _ObjectGenerator<TConfig>[0]
): ReturnType<typeof _ObjectGenerator<TConfig>;


//Overload 4: `output: 'object'` (or undefined, which defaults to object)
export function ObjectGenerator<
	const TConfig extends {
		output?: 'object' | undefined,
		schema: SchemaType<OBJECT>, // `schema` is required
		model: LanguageModel // `model` is required
	} & configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT>,
	OBJECT
>(
	config: Parameters<typeof _ObjectGenerator<TConfig, OBJECT>>[0]
): ReturnType<typeof _ObjectGenerator<TConfig, OBJECT>>;

// --- SINGLE IMPLEMENTATION ---

export function ObjectGenerator(
	config: configs.OptionalTemplateConfig,
	parent?: ConfigProvider<configs.OptionalTemplateConfig>
): ReturnType<typeof _ObjectGenerator> { // The return type is general here

	// The logic is identical for both cases after the initial merge.
	const baseConfig = parent ? mergeConfigs(parent.config, config) : config;

	const finalConfig = {
		output: 'object', // Defaulting logic
		...baseConfig,
	};

	// Call the internal implementation. The `as any` is still necessary
	// because the implementation can't know which overload was originally called.
	return _ObjectGenerator(finalConfig as any);
}

// Array output
function _ObjectGenerator<
	TConfig extends configs.GenerateObjectArrayConfig<ELEMENT> & configs.OptionalTemplateConfig
	& { output: 'array', schema: SchemaType<ELEMENT> },
	ELEMENT = any
>(
	config: TConfig
): LLMCallSignature<
	TConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>
>;

// Enum output
function _ObjectGenerator<
	TConfig extends configs.GenerateObjectEnumConfig<ENUM> & configs.OptionalTemplateConfig
	& { output: 'enum' },
	ENUM extends string
>(
	config: TConfig
): LLMCallSignature<
	TConfig,
	Promise<results.GenerateObjectEnumResult<ENUM>>
>;

// No schema output
function _ObjectGenerator<
	TConfig extends configs.GenerateObjectNoSchemaConfig & configs.OptionalTemplateConfig
	& { output: 'no-schema' }
>(
	config: TConfig
): LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// Object output, no parent (default)
function _ObjectGenerator<
	TConfig extends configs.GenerateObjectObjectConfig<OBJECT> & configs.OptionalTemplateConfig
	& { schema: SchemaType<OBJECT>, output: 'object' },
	OBJECT
>(
	config: TConfig
): LLMCallSignature<
	TConfig,
	Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>
>;*/

// output: 'array' and schema in config, with parent
/*function _ObjectGenerator<
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>
>;

// output: 'array' in config and schema in parent config
function _ObjectGenerator<
	TConfig extends { output: 'array' } & configs.OptionalTemplateConfig,
	TParentConfig extends { schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TParentConfig['schema']>>>
>;

// output: 'array' in parent and schema in config
function _ObjectGenerator<
	TConfig extends { schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'array' } & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>
>;

// output: 'array' and schema in parent config
function _ObjectGenerator<
	TConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'array', schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TParentConfig['schema']>>>
>;

//  output:'enum' and enum:... in config, with parent
function _ObjectGenerator<
	TConfig extends { output: 'enum', enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	ENUM extends string
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>
>;

//  output:'enum' in config, enum:... in parent
function _ObjectGenerator<
	TConfig extends { output: 'enum' } & configs.OptionalTemplateConfig,
	TParentConfig extends { enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	ENUM extends string
>(

	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TParentConfig["enum"][number]>>
>;


// output:'enum' in parent config, enum:... in config
function _ObjectGenerator<
	TConfig extends { enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'enum' } & configs.OptionalTemplateConfig,
	ENUM extends string
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>
>;

// output:'enum' and enum:... in parent config
function _ObjectGenerator<
	TConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'enum', enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	ENUM extends string
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TParentConfig['enum'][number]>>
>;


// 'no-schema' in config, with parent
function _ObjectGenerator<
	TConfig extends { output: 'no-schema' } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & configs.OptionalTemplateConfig
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectNoSchemaConfig & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// 'no-schema' in parent config
function _ObjectGenerator<
	TConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'no-schema' } & configs.OptionalTemplateConfig
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectNoSchemaConfig & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// Object with parent, schema in config
function _ObjectGenerator<
	TConfig extends { schema: SchemaType<OBJECT>, output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & { output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	OBJECT
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectObjectConfig<OBJECT> & { model: LanguageModel } //this makes 'model' and 'schema' required, all previous overloads caught any other 'output'
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	//Promise<results.GenerateObjectObjectResult<OBJECT>>
	Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>
>;

// Object with parent (default), schema in parent
function _ObjectGenerator<
	TConfig extends Record<string, any> & { output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	TParentConfig extends { schema: SchemaType<OBJECT>, output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	OBJECT
>(
	config: utils.StrictOverrideTypeWithTemplateAndLoader<
		TConfig, TParentConfig,
		configs.GenerateObjectObjectConfig<OBJECT> & { model: LanguageModel } //this makes 'model' and 'schema' required, all previous overloads caught any other 'output'
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	//Promise<results.GenerateObjectObjectResult<OBJECT>>
	Promise<results.GenerateObjectObjectResult<utils.InferParameters<TParentConfig['schema']>>>
>;

// Implementation
function _ObjectGenerator<
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
}*/

// Array output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectArrayConfig<ELEMENT>,
	ELEMENT = any
>(
	config: utils.DistributiveOmit<utils.StrictTypeWithTemplateAndLoader<TConfig, configs.StreamObjectArrayConfig<ELEMENT>>, 'schema'> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamObjectArrayResult<ELEMENT>>;

// No schema output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectNoSchemaConfig
>(
	config: utils.StrictTypeWithTemplateAndLoader<TConfig, configs.StreamObjectNoSchemaConfig> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> & { output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamObjectNoSchemaResult>;

// Object output (default)
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: utils.DistributiveOmit<utils.StrictTypeWithTemplateAndLoader<TConfig, configs.StreamObjectObjectConfig<OBJECT>>, 'schema'> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> &
	{ output?: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamObjectObjectResult<OBJECT>>;


// Array with parent
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectArrayConfig<ELEMENT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissingWithSchema<
		utils.StrictTypeWithTemplateAndLoader<
			TConfig,
			configs.StreamObjectArrayConfig<ELEMENT>
		>,
		{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplateAndLoader<
			utils.Override<TParentConfig, TConfig>,
			configs.StreamObjectArrayConfig<ELEMENT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.StreamObjectArrayResult<ELEMENT>>;

// No schema with parent
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectNoSchemaConfig,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissingWithSchema<
		utils.StrictTypeWithTemplateAndLoader<
			TConfig,
			configs.StreamObjectNoSchemaConfig
		>,
		{ output: 'no-schema', model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplateAndLoader<
			utils.Override<TParentConfig, TConfig>,
			configs.StreamObjectNoSchemaConfig
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.StreamObjectNoSchemaResult>;

// Object with parent (default)
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<OBJECT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissingWithSchema<
		utils.StrictTypeWithTemplateAndLoader<
			TConfig,
			configs.StreamObjectObjectConfig<OBJECT>
		>,
		{ output?: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplateAndLoader<
			utils.Override<TParentConfig, TConfig>,
			configs.StreamObjectObjectConfig<OBJECT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.StreamObjectObjectResult<OBJECT>>;

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

	//validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;

	// Set default output value to make the config explicit.
	if ((merged as StreamObjectObjectConfig<OBJECT>).output === undefined) {
		(merged as StreamObjectObjectConfig<OBJECT>).output = 'object';
	}

	if (parent) {
		validateBaseConfig(merged);
	}
	validateObjectConfig(merged, true);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] ObjectStreamer created with config:', JSON.stringify(merged, null, 2));
	}

	// One of several possible overloads (config.output = 'object' / undefined), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		configs.StreamObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		results.StreamObjectObjectResult<OBJECT>
	>(merged, streamObject);
}