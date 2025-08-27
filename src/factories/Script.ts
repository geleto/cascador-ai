import { ConfigProvider, mergeConfigs } from '../ConfigData';
import { validateBaseConfig, ConfigError } from '../validate';
import { ScriptEngine } from '../ScriptEngine';
import * as configs from '../types/config';
import * as results from '../types/result';
import * as utils from '../types/utils';
import { SchemaType, ScriptPromptType } from '../types/types';
import { ToolCallOptions } from 'ai';

export type ScriptInstance<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
> = ScriptCallSignature<TConfig, INPUT, OUTPUT>;

// Config for a Tool that uses the Script engine
export interface ScriptToolConfig<
	INPUT extends Record<string, any>,
	OUTPUT
> extends configs.ScriptConfig<INPUT, OUTPUT> {
	inputSchema: SchemaType<INPUT>;//required
	//@todo - output schema
	description?: string;
}

//@todo - move to result
type ScriptResultPromise<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
> =
	Promise<TConfig extends { schema: SchemaType<infer OBJECT> } ? OBJECT : results.ScriptResult>;

type ScriptResultPromiseWithParent<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	TParentConfig extends configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	FinalConfig = utils.Override<TParentConfig, TConfig>
> =
	Promise<FinalConfig extends { schema: SchemaType<infer OBJECT> } ? OBJECT : results.ScriptResult>;

// Script call signature type
export type ScriptCallSignature<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
> =
	TConfig extends { script: string }
	? {
		// TConfig has a script, so the script argument is optional.
		(scriptOrContext?: INPUT | string): ScriptResultPromise<TConfig, INPUT, OUTPUT>;
		(script?: string, context?: INPUT): ScriptResultPromise<TConfig, INPUT, OUTPUT>;
		config: TConfig;
		type: string;
	}
	: {
		// TConfig has no script, so the script argument is required.
		(script: string, context?: INPUT): ScriptResultPromise<TConfig, INPUT, OUTPUT>;
		config: TConfig;
		type: string;
	};

export type ScriptCallSignatureWithParent<
	TConfig extends Partial<configs.ScriptConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	FINAL_INPUT extends Record<string, any> = INPUT extends never ? PARENT_INPUT : INPUT,
	FinalConfig = utils.Override<TParentConfig, TConfig>
> =
	FinalConfig extends { script: string }
	? {
		// FinalConfig has a script, so the script argument is optional.
		(scriptOrContext?: FINAL_INPUT | string): ScriptResultPromiseWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>;
		(script?: string, context?: FINAL_INPUT): ScriptResultPromiseWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>;
		config: FinalConfig;
		type: string;
	}
	: {
		// FinalConfig has no script, so the script argument is required.
		(script: string, context?: FINAL_INPUT): ScriptResultPromiseWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>;
		config: FinalConfig;
		type: string;
	};


// Default behavior: inline/embedded script
function baseScript<
	const TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: utils.StrictType<TConfig, configs.ScriptConfig<INPUT, OUTPUT>>
): ScriptCallSignature<TConfig, INPUT, OUTPUT>;

function baseScript<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	TParentConfig extends configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT
>(
	config: utils.StrictType<TConfig, configs.ScriptConfig<INPUT, OUTPUT>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT>>>
): ScriptCallSignatureWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>;

function baseScript(
	config: configs.ScriptConfig<any, any>,
	parent?: ConfigProvider<configs.ScriptConfig<any, any>>
): any {
	return _createScript(config, 'async-script', parent);
}

// asTool method for Script
function asTool<
	TConfig extends ScriptToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig
): ScriptCallSignature<TConfig, INPUT, OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function asTool<
	TConfig extends Partial<ScriptToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<ScriptToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
): ScriptCallSignatureWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function asTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: ScriptToolConfig<INPUT, OUTPUT>,
	parent?: ConfigProvider<ScriptToolConfig<INPUT, OUTPUT>>
): results.RendererTool<INPUT, OUTPUT> {
	return _createScriptAsTool(config, 'async-script', parent);
}

// loadsScript: load by name via provided loader
function loadsScript<
	const TConfig extends configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig
): ScriptCallSignature<TConfig, INPUT, OUTPUT>;

function loadsScript<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	TParentConfig extends configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
): ScriptCallSignatureWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>;

function loadsScript(
	config: configs.ScriptConfig<any, any> & configs.LoaderConfig,
	parent?: ConfigProvider<configs.ScriptConfig<any, any> & configs.LoaderConfig>
): any {
	return _createScript(config, 'async-script-name', parent);
}

// loadsScriptAsTool: load by name via provided loader and return as tool
function loadsScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig
): ScriptCallSignature<ScriptToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT,
	TParentConfig extends ScriptToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	FINAL_INPUT extends Record<string, any> = INPUT extends never ? PARENT_INPUT : INPUT,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,
>(
	config: ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	parent: ConfigProvider<TParentConfig>
): ScriptCallSignatureWithParent<ScriptToolConfig<INPUT, OUTPUT>, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT> & results.RendererTool<FINAL_INPUT, FINAL_OUTPUT>;

function loadsScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	parent?: ConfigProvider<ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig>
): ScriptCallSignature<ScriptToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT> & results.RendererTool<INPUT, OUTPUT> {
	return _createScriptAsTool(config, 'async-script-name', parent) as unknown as ScriptCallSignature<ScriptToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT> & results.RendererTool<INPUT, OUTPUT>;
}

// Internal common creator
export function _createScript<
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: configs.ScriptConfig<INPUT, OUTPUT>,
	scriptType: ScriptPromptType,
	parent?: ConfigProvider<configs.ScriptConfig<INPUT, OUTPUT>>
): ScriptCallSignature<configs.ScriptConfig<INPUT, OUTPUT>, INPUT, OUTPUT> {
	// Merge configs if parent exists, otherwise use provided config
	//, add promptType to the config
	const merged = parent
		? { ...mergeConfigs(parent.config, config), promptType: scriptType }
		: { ...config, promptType: scriptType };

	validateBaseConfig(merged);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] Script created with config:', JSON.stringify(merged, null, 2));
	}

	if ((merged.promptType === 'script-name' || merged.promptType === 'async-script-name') && !('loader' in merged)) {
		throw new ConfigError('Script name types require a loader');
	}

	if ((merged.promptType === 'script-name' ||
		merged.promptType === 'async-script-name') &&
		!merged.loader
	) {
		throw new Error('A loader is required when scriptType is "script-name" or "async-script-name".');
	}

	const runner = new ScriptEngine(merged);

	// Define the call function that handles both cases
	const call = async (scriptOrContext?: INPUT | string, maybeContext?: INPUT): Promise<any> => {
		if ('debug' in merged && merged.debug) {
			console.log('[DEBUG] Script - call function called with:', { scriptOrContext, maybeContext });
		}
		if (typeof scriptOrContext === 'string') {
			const result = await runner.run(scriptOrContext, maybeContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] Script - run result:', result);
			}
			return result;
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when not providing script.');
			}
			const result = await runner.run(undefined, scriptOrContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] Script - run result:', result);
			}
			return result;
		}
	};

	const callSignature = Object.assign(call, { config: merged, type: 'Script' });

	return callSignature as ScriptCallSignature<configs.ScriptConfig<INPUT, OUTPUT>, INPUT, OUTPUT>;
}

// Internal common creator for tools
export function _createScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: ScriptToolConfig<INPUT, OUTPUT>,
	scriptType: ScriptPromptType,
	parent?: ConfigProvider<ScriptToolConfig<INPUT, OUTPUT>>
): ScriptCallSignatureWithParent<ScriptToolConfig<INPUT, OUTPUT>, ScriptToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT, INPUT, OUTPUT>
	& results.RendererTool<INPUT, OUTPUT> {

	const renderer = _createScript(config, scriptType, parent) as unknown as
		ScriptCallSignature<ScriptToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT> & results.RendererTool<INPUT, OUTPUT>;
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema!;
	renderer.type = 'function';//Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options is not used
	renderer.execute = async (args: INPUT, _options: ToolCallOptions): Promise<OUTPUT> => {
		// Call the script without the options parameter since renderers don't support it
		// For tools, the script is already defined in the config, so we pass args as context
		return await (renderer as unknown as (context: INPUT) => Promise<OUTPUT>)(args);
	};
	return renderer as (typeof renderer & ScriptCallSignatureWithParent<ScriptToolConfig<INPUT, OUTPUT>, ScriptToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT, INPUT, OUTPUT>);
}

export const Script = Object.assign(baseScript, {
	loadsScript: Object.assign(loadsScript, {
		asTool
	}),
	asTool,
	loadsScriptAsTool
});