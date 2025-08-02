import { generateObject } from "ai";

import * as results from './types-result'
import * as configs from './types-config';
import * as utils from './type-utils';
import { RequiredPromptType, SchemaType } from "./types";

import { LLMCallSignature, createLLMRenderer } from "./llm";
import { ConfigProvider, mergeConfigs } from "./ConfigData";
import { validateBaseConfig, validateObjectConfig } from "./validate";

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

type GenerateObjectConfig<OBJECT, ELEMENT, ENUM extends string = string> =
	configs.GenerateObjectObjectConfig<OBJECT> |
	configs.GenerateObjectArrayConfig<ELEMENT> |
	configs.GenerateObjectEnumConfig<ENUM> |
	configs.GenerateObjectNoSchemaConfig;

type GenerateObjectReturn<
	TConfig extends configs.OptionalTemplateConfig,
	OBJECT,
	ELEMENT,
	ENUM extends string,
> =
	TConfig extends { output: 'array', schema: SchemaType<ELEMENT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<utils.InferParameters<TConfig['schema']>>>>
	: TConfig extends { output: 'array' }
	? `Config Error: Array output requires a schema`//LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<any>>>//array with no schema, maybe return Error String
	: TConfig extends { output: 'enum', enum: readonly (ENUM)[] }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<TConfig["enum"][number]>>>
	: TConfig extends { output: 'enum' }
	? `Config Error: Enum output requires an enum`//LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<any>>>//enum with no enum, maybe return Error String
	: TConfig extends { output: 'no-schema' }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>>
	//no schema, no enum, no array - it's 'object' or no output which defaults to 'object'
	: TConfig extends { output?: 'object' | undefined, schema: SchemaType<OBJECT> }
	? LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<utils.InferParameters<TConfig['schema']>>>>
	: `Config Error: Object output requires a schema`//LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<any>>>;// object with no schema, maybe return Error String

type GenerateObjectWithParentReturn<
	TConfig extends configs.OptionalTemplateConfig,
	TParentConfig extends configs.OptionalTemplateConfig,
	OBJECT,
	ELEMENT,
	ENUM extends string,
	PARENT_OBJECT,
	PARENT_ELEMENT,
	PARENT_ENUM extends string,
	TFinalConfig extends configs.OptionalTemplateConfig = utils.Override<TParentConfig, TConfig>,
> =
	GenerateObjectReturn<TFinalConfig, OBJECT extends never ? PARENT_OBJECT : OBJECT, ELEMENT extends never ? PARENT_ELEMENT : ELEMENT, ENUM extends never ? PARENT_ENUM : ENUM>

type ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM extends string> =
	configs.CascadaConfig
	& GenerateObjectConfig<OBJECT, ELEMENT, ENUM>
	& { prompt?: string | undefined };


export function mainObjectGenerator<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: utils.StrictUnionSubtype<TConfig, ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>>
): GenerateObjectReturn<TConfig & { promptType: 'async-template' }, OBJECT, ELEMENT, ENUM>;

// Overload 2: With optional parent parameter
export function mainObjectGenerator<
	TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	TParentConfig extends ProcessedPromptObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>;

// Implementation signature that handles both cases
export function mainObjectGenerator<
	TConfig extends ProcessedPromptObjectConfig<any, any, string>,
	TParentConfig extends ProcessedPromptObjectConfig<any, any, string>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: 'async-template' }, any, any, string> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string> {
	return _createObjectGenerator(config, 'async-template', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string>;
}
// The alias for the default factory
const withTemplate = mainObjectGenerator;

export function loadsTemplate<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'async-template-name' }, OBJECT, ELEMENT, ENUM>;

// Overload 2: With optional parent parameter
export function loadsTemplate<
	TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	TParentConfig extends ProcessedPromptObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>;

// Implementation signature that handles both cases
export function loadsTemplate<
	TConfig extends ProcessedPromptObjectConfig<any, any, string>,
	TParentConfig extends ProcessedPromptObjectConfig<any, any, string>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: 'async-template-name' }, any, any, string> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string> {
	return _createObjectGenerator(config, 'async-template-name', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string>;
}

export function withScript<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'async-script' }, OBJECT, ELEMENT, ENUM>;

// Overload 2: With optional parent parameter
export function withScript<
	TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	TParentConfig extends ProcessedPromptObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>;

// Implementation signature that handles both cases
export function withScript<
	TConfig extends ProcessedPromptObjectConfig<any, any, string>,
	TParentConfig extends ProcessedPromptObjectConfig<any, any, string>
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: 'async-script' }, any, any, string> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string> {
	return _createObjectGenerator(config, 'async-script', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string>;
}

export function loadsScript<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'async-script-name' }, OBJECT, ELEMENT, ENUM>;

// Overload 2: With optional parent parameter
export function loadsScript<
	TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	TParentConfig extends ProcessedPromptObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>;

// Implementation signature that handles both cases
export function loadsScript<
	TConfig extends ProcessedPromptObjectConfig<any, any, string>,
	TParentConfig extends ProcessedPromptObjectConfig<any, any, string>
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: 'async-script-name' }, any, any, string> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string> {
	return _createObjectGenerator(config, 'async-script-name', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string>;
}

export function withText<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'text' }, OBJECT, ELEMENT, ENUM>;

// Overload 2: With optional parent parameter
export function withText<
	TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	TParentConfig extends ProcessedPromptObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>;

// Implementation signature that handles both cases
export function withText<
	TConfig extends ProcessedPromptObjectConfig<any, any, string>,
	TParentConfig extends ProcessedPromptObjectConfig<any, any, string>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: 'text' }, any, any, string> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string> {
	return _createObjectGenerator(config, 'text', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string>;
}

export function loadsText<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'text-name' }, OBJECT, ELEMENT, ENUM>;

// Overload 2: With optional parent parameter
export function loadsText<
	TConfig extends ProcessedPromptObjectConfig<OBJECT, ELEMENT, ENUM>,
	TParentConfig extends ProcessedPromptObjectConfig<PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>,
	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ELEMENT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectWithParentReturn<TConfig, TParentConfig, OBJECT, ELEMENT, ENUM, PARENT_OBJECT, PARENT_ELEMENT, PARENT_ENUM>;

// Implementation signature that handles both cases
export function loadsText<
	TConfig extends ProcessedPromptObjectConfig<any, any, string>,
	TParentConfig extends ProcessedPromptObjectConfig<any, any, string>,
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: 'text-name' }, any, any, string> | GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string> {
	return _createObjectGenerator(config, 'text-name', parent) as unknown as GenerateObjectWithParentReturn<TConfig, TParentConfig, any, any, string, any, any, string>;
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & GenerateObjectConfig<OBJECT, ENUM>,
	TParentConfig extends configs.OptionalTemplateConfig & GenerateObjectConfig<PARENT_OBJECT, PARENT_ENUM>,
	PType extends RequiredPromptType,

	OBJECT = any,
	ELEMENT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	promptType: PType,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: PType }, OBJECT, ELEMENT, ENUM> {

	const merged = { ...(parent ? mergeConfigs(parent.config, config) : config), promptType };

	// Set default output value to make the config explicit.
	// This simplifies downstream logic (e.g., in `create.Tool`).
	if ((merged as configs.GenerateObjectObjectConfig<OBJECT | PARENT_OBJECT>).output === undefined) {
		(merged as configs.GenerateObjectObjectConfig<OBJECT | PARENT_OBJECT>).output = 'object';
	}

	validateBaseConfig(merged);
	validateObjectConfig(merged, false);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] _ObjectGenerator created with config:', JSON.stringify(merged, null, 2));
	}

	return createLLMRenderer(merged as configs.OptionalTemplateConfig, generateObject) as GenerateObjectReturn<TConfig & { promptType: PType }, OBJECT, ELEMENT, ENUM>;
}

export const ObjectGenerator = Object.assign(mainObjectGenerator, {
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});