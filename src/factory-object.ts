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

export type ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM extends string> =
	configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT>
	| configs.OptionalTemplateConfig & configs.GenerateObjectArrayConfig<ELEMENT>
	| configs.OptionalTemplateConfig & configs.GenerateObjectEnumConfig<ENUM>
	| configs.OptionalTemplateConfig & configs.GenerateObjectNoSchemaConfig;

export type ObjectGeneratorInstance<
	OBJECT, ELEMENT, ENUM extends string,
	CONFIG extends ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>
> = LLMCallSignature<CONFIG, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>>;

// Array output
export function ObjectGenerator<
	TConfig extends configs.GenerateObjectArrayConfig<ELEMENT> & configs.OptionalTemplateConfig
	& { output: 'array', schema: SchemaType<ELEMENT> },
	ELEMENT = any
>(
	config:
		utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectArrayConfig<ELEMENT>> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> & { model: LanguageModel }
): LLMCallSignature<
	TConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>
>;

// Enum output
export function ObjectGenerator<
	TConfig extends configs.GenerateObjectEnumConfig<ENUM> & configs.OptionalTemplateConfig
	& { output: 'enum' },
	ENUM extends string
>(
	config: utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectEnumConfig<ENUM>> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> &
	{ enum: readonly ENUM[], model: LanguageModel }
): LLMCallSignature<
	TConfig,
	Promise<results.GenerateObjectEnumResult<ENUM>>
>;

// No schema output
export function ObjectGenerator<
	TConfig extends configs.GenerateObjectNoSchemaConfig & configs.OptionalTemplateConfig
	& { output: 'no-schema' }
>(
	config: utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectNoSchemaConfig> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> & { model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// Object output, no parent (default)
export function ObjectGenerator<
	TConfig extends configs.GenerateObjectObjectConfig<OBJECT> & configs.OptionalTemplateConfig
	& { schema: SchemaType<OBJECT>, output?: 'object' | undefined },
	OBJECT
>(
	config:
		utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectObjectConfig<OBJECT>> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> & { model: LanguageModel }
): LLMCallSignature<
	TConfig,
	Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>
>;

// output: 'array' and schema in config, with parent
export function ObjectGenerator<
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>
>;

// output: 'array' in config and schema in parent config
export function ObjectGenerator<
	TConfig extends { output: 'array' } & configs.OptionalTemplateConfig,
	TParentConfig extends { schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TParentConfig['schema']>>>
>;

// output: 'array' in parent and schema in config
export function ObjectGenerator<
	TConfig extends { schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'array' } & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>
>;

// output: 'array' and schema in parent config
export function ObjectGenerator<
	TConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'array', schema: SchemaType<ELEMENT> } & configs.OptionalTemplateConfig,
	ELEMENT
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectArrayConfig<ELEMENT> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectArrayResult<utils.InferParameters<TParentConfig['schema']>>>
>;

//  output:'enum' and enum:... in config, with parent
export function ObjectGenerator<
	TConfig extends { output: 'enum', enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	ENUM extends string
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>
>;

//  output:'enum' in config, enum:... in parent
export function ObjectGenerator<
	TConfig extends { output: 'enum' } & configs.OptionalTemplateConfig,
	TParentConfig extends { enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	ENUM extends string
>(

	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TParentConfig["enum"][number]>>
>;


// output:'enum' in parent config, enum:... in config
export function ObjectGenerator<
	TConfig extends { enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'enum' } & configs.OptionalTemplateConfig,
	ENUM extends string
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>
>;

// output:'enum' and enum:... in parent config
export function ObjectGenerator<
	TConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'enum', enum: readonly ENUM[] } & configs.OptionalTemplateConfig,
	ENUM extends string
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectEnumConfig<ENUM> & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<
	utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig,
	Promise<results.GenerateObjectEnumResult<TParentConfig['enum'][number]>>
>;


// 'no-schema' in config, with parent
export function ObjectGenerator<
	TConfig extends { output: 'no-schema' } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & configs.OptionalTemplateConfig
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectNoSchemaConfig & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// 'no-schema' in parent config
export function ObjectGenerator<
	TConfig extends Record<string, any> & configs.OptionalTemplateConfig,
	TParentConfig extends { output: 'no-schema' } & configs.OptionalTemplateConfig
>(
	config: utils.StrictOverrideTypeWithTemplate<
		TConfig, TParentConfig,
		configs.GenerateObjectNoSchemaConfig & { model: LanguageModel }
	>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<utils.Override<TParentConfig, TConfig> & configs.OptionalTemplateConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// Object with parent, schema in config
export function ObjectGenerator<
	TConfig extends { schema: SchemaType<OBJECT>, output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	TParentConfig extends Record<string, any> & { output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	OBJECT
>(
	config: utils.StrictOverrideTypeWithTemplate<
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
export function ObjectGenerator<
	TConfig extends Record<string, any> & { output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	TParentConfig extends { schema: SchemaType<OBJECT>, output?: 'object' | undefined } & configs.OptionalTemplateConfig,
	OBJECT
>(
	config: utils.StrictOverrideTypeWithTemplate<
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

	validateBaseConfig(config);
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
		console.log('[DEBUG] ObjectGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	// One of several possible overloads (config.output = 'object' / undefined), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		configs.GenerateObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		Promise<results.GenerateObjectObjectResult<OBJECT>>
	>(merged, generateObject);
}

// Array output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectArrayConfig<ELEMENT>,
	ELEMENT = any
>(
	config: utils.DistributiveOmit<utils.StrictTypeWithTemplate<TConfig, configs.StreamObjectArrayConfig<ELEMENT>>, 'schema'> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamObjectArrayResult<ELEMENT>>;

// No schema output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectNoSchemaConfig
>(
	config: utils.StrictTypeWithTemplate<TConfig, configs.StreamObjectNoSchemaConfig> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> & { output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamObjectNoSchemaResult>;

// Object output (default)
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: utils.DistributiveOmit<utils.StrictTypeWithTemplate<TConfig, configs.StreamObjectObjectConfig<OBJECT>>, 'schema'> &
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
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.StreamObjectArrayConfig<ELEMENT>
		>,
		{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
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
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.StreamObjectNoSchemaConfig
		>,
		{ output: 'no-schema', model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
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
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.StreamObjectObjectConfig<OBJECT>
		>,
		{ output?: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
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

	validateBaseConfig(config);
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