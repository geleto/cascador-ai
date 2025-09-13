import { ToolCallOptions } from 'ai';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { ConfigProvider, mergeConfigs, processConfig } from "../ConfigData";
import { validateFunctionConfig, validateScriptOrFunctionCall, validateAndParseOutput } from "../validate";

type ToolOrFunctionConfig<INPUT extends Record<string, any>, OUTPUT> =
	configs.FunctionToolConfig<INPUT, OUTPUT> | configs.FunctionConfig<INPUT, OUTPUT>

export type FunctionCallSignature<
	TConfig extends configs.FunctionConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
> = ((context: INPUT) => PromiseLike<OUTPUT>) & Omit<TConfig, 'execute'> & { type: 'FunctionCall' };

type FinalTextConfigShape = Partial<ToolOrFunctionConfig<any, any>>;

export type ToolCallSignature<
	TConfig extends configs.FunctionToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
> = ((context: INPUT, options: ToolCallOptions) => PromiseLike<OUTPUT>) & TConfig & { type: 'function' };

type ValidateConfig<
	TConfig extends Partial<ToolOrFunctionConfig<any, any>>,
	TFinalConfig extends FinalTextConfigShape,
	TShape extends ToolOrFunctionConfig<any, any>,
	TRequired =
	& (TShape extends { inputSchema: any } ? { inputSchema: any, execute: any } : { execute: any })
	& (TShape extends { loader: any } ? { loader: any, execute: any } : { execute: any })
> =
	// 1. Check for excess properties in TConfig that are not in TShape
	keyof Omit<TConfig, keyof TShape> extends never
	? (
		// 2. If no excess, check for required properties missing from the FINAL merged config.
		keyof Omit<TRequired, keyof TFinalConfig> extends never
		? TConfig // All checks passed.
		: `Config Error: Missing required property '${keyof Omit<TRequired, keyof TFinalConfig> & string}' in the final configuration.`
	)
	: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof TShape> & string}'`



type ValidateParentConfig<
	TParentConfig extends Partial<ToolOrFunctionConfig<any, any>>,
	TShape extends ToolOrFunctionConfig<any, any>,
> =
	// Check for excess properties in the parent, validated against the CHILD's factory type (PType).
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final generator type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;

//the default is withFunction
//no parent config
function asFunction<
	TConfig extends configs.FunctionConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateConfig<TConfig, TConfig, configs.FunctionConfig<INPUT, OUTPUT>>
): FunctionCallSignature<TConfig, INPUT, OUTPUT>;

//with ConfigProvider or Functionparent config
function asFunction<
	TConfig extends Partial<configs.FunctionConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<configs.FunctionConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateConfig<TConfig, TParentConfig, configs.FunctionConfig<INPUT, OUTPUT>>,
	parent: ConfigProvider<TParentConfig & ValidateParentConfig<TParentConfig, configs.FunctionConfig<any, any>>> |
		TParentConfig & ValidateParentConfig<TParentConfig, configs.FunctionConfig<any, any>>
): FunctionCallSignature<TFinalConfig & configs.FunctionConfig<INPUT, OUTPUT>, INPUT, OUTPUT>;

function asFunction(config: configs.FunctionConfig<any, any>, parent?: ConfigProvider<configs.FunctionConfig<any, any>> | FunctionCallSignature<configs.FunctionConfig<any, any>, any, any>): FunctionCallSignature<configs.FunctionConfig<any, any>, any, any> {
	return _createFunction(config, parent, false);
}

//the default is withFunction
//no parent config
function asTool<
	TConfig extends configs.FunctionToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: TConfig & ValidateConfig<TConfig, TConfig, configs.FunctionToolConfig<INPUT, OUTPUT>>
): ToolCallSignature<TConfig, INPUT, OUTPUT>;

//with ConfigProvider or Toolparent config
function asTool<
	const TConfig extends Partial<configs.FunctionToolConfig<INPUT, OUTPUT>>,
	const TParentConfig extends Partial<configs.FunctionToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig extends FinalTextConfigShape = utils.Override<TParentConfig, TConfig>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,
>(
	config: TConfig & ValidateConfig<TConfig, TFinalConfig, configs.FunctionToolConfig<INPUT, OUTPUT>>,
	parent: ConfigProvider<TParentConfig & ValidateParentConfig<TParentConfig, configs.FunctionToolConfig<any, any>>> |
		TParentConfig & ValidateParentConfig<TParentConfig, configs.FunctionToolConfig<any, any>>
): ToolCallSignature<TFinalConfig & configs.FunctionToolConfig<FINAL_INPUT, FINAL_OUTPUT>, FINAL_INPUT, FINAL_OUTPUT>;

function asTool(config: configs.FunctionToolConfig<any, any>, parent?: ConfigProvider<configs.FunctionToolConfig<any, any>> | ToolCallSignature<configs.FunctionToolConfig<any, any>, any, any>): any {
	return _createFunctionAsTool(config, parent) as unknown as ToolCallSignature<configs.FunctionToolConfig<any, any>, any, any>;
}

export function _createFunction(
	config: configs.FunctionConfig<any, any>,
	parent?: ConfigProvider<configs.FunctionConfig<any, any>> | //has parent.config
		FunctionCallSignature<configs.FunctionConfig<any, any>, any, any> | //parent is the config as well as a function
		ToolCallSignature<configs.FunctionToolConfig<any, any>, any, any>, //parent is the config as well as a tool
	isTool = false
): FunctionCallSignature<configs.FunctionConfig<any, any>, any, any> {

	let merged;
	if (parent) {
		merged = mergeConfigs(('config' in parent ? (parent).config : parent), config);
	} else {
		merged = processConfig(config);
	}

	validateFunctionConfig(merged, isTool);

	if (merged.debug) {
		console.log('[DEBUG] Function created with config:', JSON.stringify(merged, null, 2));
	}

	// Create a callable function that delegates to the execute method
	const callableFunction = async (context: Record<string, any>): Promise<any> => {
		validateScriptOrFunctionCall(merged, 'Function', context);
		return validateAndParseOutput(merged, await merged.execute(context));
	};

	// Merge all properties from merged config into the callable function, but exclude execute
	const { execute: _execute, ...configWithoutExecute } = merged;
	const result = Object.assign(callableFunction, configWithoutExecute, { type: 'FunctionCall' });

	return result as FunctionCallSignature<configs.FunctionConfig<any, any>, any, any>;
}

function _createFunctionAsTool(
	config: configs.FunctionToolConfig<any, any>,
	parent?: ConfigProvider<configs.FunctionToolConfig<any, any>> | //has parent.config
		FunctionCallSignature<configs.FunctionConfig<any, any>, any, any> | //parent is the config as well as a function
		ToolCallSignature<configs.FunctionToolConfig<any, any>, any, any> //parent is the config as well as a tool
): ToolCallSignature<configs.FunctionToolConfig<any, any>, any, any> {
	const renderer = _createFunction(config as configs.FunctionConfig<any, any>, parent as FunctionCallSignature<configs.FunctionConfig<any, any>, any, any>, true) as unknown as
		ToolCallSignature<configs.FunctionToolConfig<any, any>, any, any>;
	//the Tool properties are already in the renderer root (not in a config property)

	// Add the execute property back for tools
	renderer.execute = config.execute;
	renderer.type = 'function';
	return renderer;
}

export const Function = Object.assign(asFunction, {
	asTool
});