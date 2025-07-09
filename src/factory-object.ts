import { generateObject, streamObject, LanguageModel, ToolSet } from 'ai';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import { createLLMRenderer, LLMCallSignature } from './llm';
import { validateBaseConfig, validateObjectConfig } from './validate';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { SchemaType } from './types';

export type ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM extends string> =
	configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT>
	| configs.OptionalTemplateConfig & configs.GenerateObjectArrayConfig<ELEMENT>
	| configs.OptionalTemplateConfig & configs.GenerateObjectEnumConfig<ENUM>
	| configs.OptionalTemplateConfig & configs.GenerateObjectNoSchemaConfig;

export type ObjectGeneratorInstance<
	OBJECT, ELEMENT, ENUM extends string,
	CONFIG extends ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>
> = LLMCallSignature<CONFIG, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>>;

// Object output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: utils.DistributiveOmit<utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectObjectConfig<OBJECT>>, 'schema'> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<OBJECT>>>;

// Array output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectArrayConfig<ELEMENT>,
	ELEMENT = any
>(
	config: utils.DistributiveOmit<utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectArrayConfig<ELEMENT>>, 'schema'> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<ELEMENT>>>;

// Enum output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectEnumConfig<ENUM>,
	ENUM extends string = string
>(
	config: utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectEnumConfig<ENUM>> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> & { output: 'enum', enum: ENUM[], model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<ENUM>>>;

// No schema output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectNoSchemaConfig
>(
	config: utils.StrictTypeWithTemplate<TConfig, configs.GenerateObjectNoSchemaConfig> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> & { output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// Object with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissingWithSchema<
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectObjectConfig<OBJECT>
		>,
		{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
			utils.Override<TParentConfig, TConfig>,
			configs.GenerateObjectObjectConfig<OBJECT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, Promise<results.GenerateObjectObjectResult<OBJECT>>>;

// Array with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectArrayConfig<ELEMENT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissingWithSchema<
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectArrayConfig<ELEMENT>
		>,
		{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
			utils.Override<TParentConfig, TConfig>,
			configs.GenerateObjectArrayConfig<ELEMENT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, Promise<results.GenerateObjectArrayResult<ELEMENT>>>;

// Enum with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectEnumConfig<ENUM>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissingWithSchema<
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectEnumConfig<ENUM>
		>,
		{ output: 'enum', enum: ENUM[], model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
			utils.Override<TParentConfig, TConfig>,
			configs.GenerateObjectEnumConfig<ENUM>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, Promise<results.GenerateObjectEnumResult<ENUM>>>;

// No schema with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectNoSchemaConfig,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.RequireMissing<
		utils.StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectNoSchemaConfig
		>,
		{ output: 'no-schema', model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
			utils.Override<TParentConfig, TConfig>,
			configs.GenerateObjectNoSchemaConfig
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, Promise<results.GenerateObjectNoSchemaResult>>;

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
	if ((merged as any).output === undefined) {
		(merged as any).output = 'object';
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

// Object output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: utils.DistributiveOmit<utils.StrictTypeWithTemplate<TConfig, configs.StreamObjectObjectConfig<OBJECT>>, 'schema'> &
		utils.RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamObjectObjectResult<OBJECT>>;

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


// Object with parent
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
		{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		utils.StrictTypeWithTemplate<
			utils.Override<TParentConfig, TConfig>,
			configs.StreamObjectObjectConfig<OBJECT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<utils.Override<TParentConfig, TConfig>, results.StreamObjectObjectResult<OBJECT>>;

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
	if ((merged as any).output === undefined) {
		(merged as any).output = 'object';
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