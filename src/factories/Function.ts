import { JSONValue, Tool, ToolCallOptions } from 'ai';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { ConfigError } from "../validate";

type FunctionConfig<OBJECT extends JSONValue, PARAMETERS extends Record<string, any>> =
	({ execute: (context: PARAMETERS) => PromiseLike<OBJECT> }) & configs.BaseConfig<OBJECT, PARAMETERS>

type ToolConfig<OBJECT extends JSONValue, PARAMETERS extends Record<string, any>> =
	Tool<PARAMETERS, OBJECT> & configs.BaseConfig<OBJECT, PARAMETERS>

type ToolOrFunctionConfig<OBJECT extends JSONValue, PARAMETERS extends Record<string, any>> =
	ToolConfig<OBJECT, PARAMETERS> | FunctionConfig<OBJECT, PARAMETERS>

export type FunctionCallSignature<
	TConfig extends FunctionConfig<OBJECT, PARAMETERS>,
	OBJECT extends JSONValue,
	PARAMETERS extends Record<string, any>,
> = ((context: PARAMETERS) => PromiseLike<OBJECT>) & TConfig;

export type ToolCallSignature<
	TConfig extends ToolConfig<OBJECT, PARAMETERS>,
	OBJECT extends JSONValue,
	PARAMETERS extends Record<string, any>,
> = ((context: PARAMETERS, options: ToolCallOptions) => PromiseLike<OBJECT>) & TConfig;

type ValidateConfig<
	TConfig extends Partial<TBaseConfig>,
	TParentConfig extends Partial<TParentBaseConfig>,
	TFinalConfig extends Partial<TBaseConfig | TParentBaseConfig>,
	TBaseConfig extends ToolOrFunctionConfig<OBJECT, PARAMETERS>,
	TParentBaseConfig extends ToolOrFunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>,
	OBJECT extends JSONValue,
	PARAMETERS extends Record<string, any>,
	PARENT_OBJECT extends JSONValue,
	PARENT_PARAMETERS extends Record<string, any>,
> =
	TConfig extends Partial<TBaseConfig>
	? (
		TParentConfig extends Partial<TParentBaseConfig>
		? (
			// 1. Check for excess properties in TConfig
			keyof Omit<TConfig, keyof (TBaseConfig)> extends never
			? (
				// 2. If no excess, check for required properties missing from the FINAL merged config.
				keyof Omit<TBaseConfig, keyof TFinalConfig> extends never //@todo - check for required properties missing from the FINAL merged config.
				? TConfig // All checks passed.
				: `Config Error: Missing required property 'execute' in the final configuration.`
			)
			: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof (TBaseConfig)> & string}'`
		) : (
			// Parent Shape is invalid - let TypeScript produce its standard error.
			// @todo - check for excess properties in TConfig
			TConfig
		)
	) : TConfig; // Shape is invalid - Resolve to TConfig and let TypeScript produce its standard error.


type ValidateParentConfig<
	TParentConfig extends Partial<TBaseConfig>,
	TBaseConfig extends ToolOrFunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>,
	PARENT_PARAMETERS extends Record<string, any>,
	PARENT_OBJECT extends JSONValue,
> =
	TParentConfig extends Partial<ToolOrFunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>>
	? (
		// Check for excess properties in the parent, validated against the CHILD's factory type (PType).
		// This prevents a 'template' parent from being used with a 'text' child if the parent has template-only properties.
		keyof Omit<TParentConfig, keyof (ToolOrFunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>)> extends never
		? TParentConfig // The check has passed.
		: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof (ToolOrFunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>)> & string}'`
	) : TParentConfig; // Shape is invalid.

//the default is withFunction
//no parent config
function asFunction<
	TConfig extends FunctionConfig<OBJECT, PARAMETERS>,
	PARAMETERS extends Record<string, any>,
	OBJECT extends JSONValue
>(
	config: TConfig & ValidateConfig<TConfig, TConfig, TConfig, FunctionConfig<OBJECT, PARAMETERS>, FunctionConfig<OBJECT, PARAMETERS>, OBJECT, PARAMETERS, OBJECT, PARAMETERS>
): FunctionCallSignature<TConfig, OBJECT, PARAMETERS>;

//with ConfigProvider or Functionparent config
function asFunction<
	TConfig extends Partial<FunctionConfig<OBJECT, PARAMETERS>>,
	TParentConfig extends Partial<FunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>>,
	PARAMETERS extends Record<string, any>,
	OBJECT extends JSONValue,
	PARENT_OBJECT extends JSONValue,
	PARENT_PARAMETERS extends Record<string, any>,
	TFinalConfig extends Partial<FunctionConfig<OBJECT, PARAMETERS>> = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateConfig<TConfig, TParentConfig, TFinalConfig, FunctionConfig<OBJECT, PARAMETERS>, FunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>, OBJECT, PARAMETERS, PARENT_OBJECT, PARENT_PARAMETERS>,
	parent: ConfigProvider<TParentConfig & ValidateParentConfig<TParentConfig, FunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>, PARENT_PARAMETERS, PARENT_OBJECT>> |
		TParentConfig & ValidateParentConfig<TParentConfig, FunctionConfig<PARENT_OBJECT, PARENT_PARAMETERS>, PARENT_PARAMETERS, PARENT_OBJECT>
): FunctionCallSignature<TFinalConfig & FunctionConfig<OBJECT, PARAMETERS>, OBJECT, PARAMETERS>;

function asFunction(config: FunctionConfig<any, any>, parent?: ConfigProvider<FunctionConfig<any, any>> | FunctionCallSignature<FunctionConfig<any, any>, any, any>): any {
	return _createFunction(config, parent) as FunctionCallSignature<FunctionConfig<any, any>, any, any>;
}

//the default is withFunction
//no parent config
function asTool<
	TConfig extends ToolConfig<OBJECT, PARAMETERS>,
	PARAMETERS extends Record<string, any>,
	OBJECT extends JSONValue
>(
	config: TConfig & ValidateConfig<TConfig, TConfig, TConfig, ToolConfig<OBJECT, PARAMETERS>, ToolConfig<OBJECT, PARAMETERS>, OBJECT, PARAMETERS, OBJECT, PARAMETERS>
): ToolCallSignature<TConfig, OBJECT, PARAMETERS>;

//with ConfigProvider or Toolparent config
function asTool<
	TConfig extends Partial<ToolConfig<OBJECT, PARAMETERS>>,
	TParentConfig extends Partial<ToolConfig<PARENT_OBJECT, PARENT_PARAMETERS>>,
	PARAMETERS extends Record<string, any>,
	OBJECT extends JSONValue,
	PARENT_OBJECT extends JSONValue,
	PARENT_PARAMETERS extends Record<string, any>,
	TFinalConfig extends Partial<ToolConfig<OBJECT, PARAMETERS>> = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateConfig<TConfig, TParentConfig, TFinalConfig, ToolConfig<OBJECT, PARAMETERS>, ToolConfig<PARENT_OBJECT, PARENT_PARAMETERS>, OBJECT, PARAMETERS, PARENT_OBJECT, PARENT_PARAMETERS>,
	parent: ConfigProvider<TParentConfig & ValidateParentConfig<TParentConfig, ToolConfig<PARENT_OBJECT, PARENT_PARAMETERS>, PARENT_PARAMETERS, PARENT_OBJECT>> |
		TParentConfig & ValidateParentConfig<TParentConfig, ToolConfig<PARENT_OBJECT, PARENT_PARAMETERS>, PARENT_PARAMETERS, PARENT_OBJECT>
): ToolCallSignature<TFinalConfig & ToolConfig<OBJECT, PARAMETERS>, OBJECT, PARAMETERS>;

function asTool(config: ToolConfig<any, any>, parent?: ConfigProvider<ToolConfig<any, any>> | ToolCallSignature<ToolConfig<any, any>, any, any>): any {
	return _createFunction(config, parent) as ToolCallSignature<FunctionConfig<any, any>, any, any>;
}


function _createFunction(
	config: ToolOrFunctionConfig<any, any>,
	parent?: ConfigProvider<ToolOrFunctionConfig<any, any>> |
		FunctionCallSignature<FunctionConfig<any, any>, any, any> |
		ToolCallSignature<ToolConfig<any, any>, any, any>
): any {

	let merged;
	if (parent) {
		merged = mergeConfigs(('config' in parent ? (parent).config : parent as ToolOrFunctionConfig<any, any>), config);
	} else {
		merged = config;
	}

	//@todo - validateBaseConfig(merged);//@todo - nothing in common with baseConfig
	if (!('execute' in merged)) {
		// This runtime check backs up the static type check.
		throw new ConfigError("Function config requires an 'execute' property.");
	}

	if (merged.debug) {
		console.log('[DEBUG] Function created with config:', JSON.stringify(merged, null, 2));
	}

	const type = 'Function';
	return Object.assign(merged.execute!, { config: merged, type });
}

export const Function = Object.assign(asFunction, {
	asTool
});