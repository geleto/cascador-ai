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

type GenerateObjectConfig<OBJECT, ENUM extends string = string> =
	configs.GenerateObjectObjectConfig<OBJECT> |
	configs.GenerateObjectArrayConfig<OBJECT> |
	configs.GenerateObjectEnumConfig<ENUM> |
	configs.GenerateObjectNoSchemaConfig;

type GenerateObjectReturn<
	TConfig extends configs.OptionalTemplateConfig,
	ENUM extends string = string,
	OBJECT = any
> =
	TConfig extends { output: 'array', schema: SchemaType<OBJECT> }
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

type ProcessedPromptObjectConfig<OBJECT, ENUM extends string = string> =
	configs.CascadaConfig
	& GenerateObjectConfig<OBJECT, ENUM>
	& { prompt?: string | undefined };

export function mainObjectGenerator<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ENUM>,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'async-template' }, ENUM, OBJECT> {
	return _createObjectGenerator<TConfig, TConfig, 'async-template', OBJECT, ENUM>(config, 'async-template', undefined);
}

// The alias for the default factory
const withTemplate = mainObjectGenerator;

export function loadsTemplate<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ENUM>,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'async-template-name' }, ENUM, OBJECT> {
	return _createObjectGenerator<TConfig, TConfig, 'async-template-name', OBJECT, ENUM>(config, 'async-template-name', undefined);
}

export function withScript<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ENUM>,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'async-script' }, ENUM, OBJECT> {
	return _createObjectGenerator<TConfig, TConfig, 'async-script', OBJECT, ENUM>(config, 'async-script', undefined);
}

export function loadsScript<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ENUM>,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'async-script-name' }, ENUM, OBJECT> {
	return _createObjectGenerator<TConfig, TConfig, 'async-script-name', OBJECT, ENUM>(config, 'async-script-name', undefined);
}

export function withText<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ENUM>,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'text' }, ENUM, OBJECT> {
	return _createObjectGenerator<TConfig, TConfig, 'text', OBJECT, ENUM>(config, 'text', undefined);
}

export function loadsText<
	const TConfig extends ProcessedPromptObjectConfig<OBJECT, ENUM>,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig
): GenerateObjectReturn<TConfig & { promptType: 'text-name' }, ENUM, OBJECT> {
	return _createObjectGenerator<TConfig, TConfig, 'text-name', OBJECT, ENUM>(config, 'text-name', undefined);
}

//common function for the specialized from/loads Template/Script/Text
function _createObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & GenerateObjectConfig<OBJECT, ENUM>,
	TParentConfig extends configs.OptionalTemplateConfig & GenerateObjectConfig<PARENT_OBJECT, PARENT_ENUM>,
	PType extends RequiredPromptType,

	OBJECT = any,
	ENUM extends string = string,
	PARENT_OBJECT = any,
	PARENT_ENUM extends string = string,
>(
	config: TConfig,
	promptType: PType,
	parent?: ConfigProvider<TParentConfig>
): GenerateObjectReturn<TConfig & { promptType: PType }, ENUM, OBJECT | PARENT_OBJECT> {

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

	return createLLMRenderer(merged as configs.OptionalTemplateConfig, generateObject) as GenerateObjectReturn<TConfig & { promptType: PType }, ENUM, OBJECT | PARENT_OBJECT>;
}

export const ObjectGenerator = Object.assign(mainObjectGenerator, {
	withTemplate,
	withScript,
	withText,
	loadsTemplate,
	loadsScript,
	loadsText,
});