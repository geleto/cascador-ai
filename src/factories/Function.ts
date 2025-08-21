import { Tool, ToolCallOptions } from 'ai';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { ConfigProvider, mergeConfigs } from "../ConfigData";
import { ConfigError } from "../validate";

type FunctionConfig<INPUT extends Record<string, any>, OUTPUT> =
	({ execute: (context: INPUT) => PromiseLike<OUTPUT> }) & configs.BaseConfig

type ToolConfig<INPUT extends Record<string, any>, OUTPUT> =
	Tool<INPUT, OUTPUT> & configs.BaseConfig

type ToolOrFunctionConfig<INPUT extends Record<string, any>, OUTPUT> =
	ToolConfig<INPUT, OUTPUT> | FunctionConfig<INPUT, OUTPUT>

export type FunctionCallSignature<
	TConfig extends FunctionConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
> = ((context: INPUT) => PromiseLike<OUTPUT>) & TConfig;

export type ToolCallSignature<
	TConfig extends ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
> = ((context: INPUT, options: ToolCallOptions) => PromiseLike<OUTPUT>) & TConfig;

type ValidateConfig<
	TConfig extends Partial<TBaseConfig>,
	TParentConfig extends Partial<TParentBaseConfig>,
	TFinalConfig extends Partial<TBaseConfig | TParentBaseConfig>,
	TBaseConfig extends ToolOrFunctionConfig<INPUT, OUTPUT>,
	TParentBaseConfig extends ToolOrFunctionConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
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
	TBaseConfig extends ToolOrFunctionConfig<PARENT_INPUT, PARENT_OUTPUT>,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
> =
	TParentConfig extends Partial<ToolOrFunctionConfig<PARENT_INPUT, PARENT_OUTPUT>>
	? (
		// Check for excess properties in the parent, validated against the CHILD's factory type (PType).
		// This prevents a 'template' parent from being used with a 'text' child if the parent has template-only properties.
		keyof Omit<TParentConfig, keyof (ToolOrFunctionConfig<PARENT_INPUT, PARENT_OUTPUT>)> extends never
		? TParentConfig // The check has passed.
		: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof (ToolOrFunctionConfig<PARENT_INPUT, PARENT_OUTPUT>)> & string}'`
	) : TParentConfig; // Shape is invalid.

//the default is withFunction
//no parent config
function asFunction<
	TConfig extends FunctionConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateConfig<TConfig, TConfig, TConfig, FunctionConfig<INPUT, OUTPUT>, FunctionConfig<INPUT, OUTPUT>, INPUT, OUTPUT, INPUT, OUTPUT>
): FunctionCallSignature<TConfig, INPUT, OUTPUT>;

//with ConfigProvider or Functionparent config
function asFunction<
	TConfig extends Partial<FunctionConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<FunctionConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig extends Partial<FunctionConfig<INPUT, OUTPUT>> = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateConfig<TConfig, TParentConfig, TFinalConfig, FunctionConfig<INPUT, OUTPUT>, FunctionConfig<PARENT_INPUT, PARENT_OUTPUT>, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>,
	parent: ConfigProvider<TParentConfig & ValidateParentConfig<TParentConfig, FunctionConfig<PARENT_INPUT, PARENT_OUTPUT>, PARENT_INPUT, PARENT_OUTPUT>> |
		TParentConfig & ValidateParentConfig<TParentConfig, FunctionConfig<PARENT_INPUT, PARENT_OUTPUT>, PARENT_INPUT, PARENT_OUTPUT>
): FunctionCallSignature<TFinalConfig & FunctionConfig<INPUT, OUTPUT>, INPUT, OUTPUT>;

function asFunction(config: FunctionConfig<any, any>, parent?: ConfigProvider<FunctionConfig<any, any>> | FunctionCallSignature<FunctionConfig<any, any>, any, any>): any {
	return _createFunction(config, parent);
}

//the default is withFunction
//no parent config
function asTool<
	TConfig extends ToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateConfig<TConfig, TConfig, TConfig, ToolConfig<INPUT, OUTPUT>, ToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT, INPUT, OUTPUT>
): ToolCallSignature<TConfig, INPUT, OUTPUT>;

//with ConfigProvider or Toolparent config
function asTool<
	TConfig extends Partial<ToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<ToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig extends Partial<ToolConfig<INPUT, OUTPUT>> = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateConfig<TConfig, TParentConfig, TFinalConfig, ToolConfig<INPUT, OUTPUT>, ToolConfig<PARENT_INPUT, PARENT_OUTPUT>, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>,
	parent: ConfigProvider<TParentConfig & ValidateParentConfig<TParentConfig, ToolConfig<PARENT_INPUT, PARENT_OUTPUT>, PARENT_INPUT, PARENT_OUTPUT>> |
		TParentConfig & ValidateParentConfig<TParentConfig, ToolConfig<PARENT_INPUT, PARENT_OUTPUT>, PARENT_INPUT, PARENT_OUTPUT>
): ToolCallSignature<TFinalConfig & ToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT>;

function asTool(config: ToolConfig<any, any>, parent?: ConfigProvider<ToolConfig<any, any>> | ToolCallSignature<ToolConfig<any, any>, any, any>): any {
	return _createFunction(config, parent) as ToolCallSignature<FunctionConfig<any, any>, any, any>;
}


function _createFunction(
	config: ToolOrFunctionConfig<any, any>,
	parent?: ConfigProvider<ToolOrFunctionConfig<any, any>> |
		FunctionCallSignature<FunctionConfig<any, any>, any, any> |
		ToolCallSignature<ToolConfig<any, any>, any, any>
): FunctionCallSignature<FunctionConfig<any, any>, any, any> {

	let merged;
	if (parent) {
		merged = mergeConfigs(('config' in parent ? (parent).config : parent), config);
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
	return Object.assign(merged.execute as FunctionCallSignature<FunctionConfig<any, any>, any, any>, { config: merged, type });
}

export const Function = Object.assign(asFunction, {
	asTool
});