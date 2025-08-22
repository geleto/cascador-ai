import { ConfigProvider, mergeConfigs } from '../ConfigData';
import { validateBaseConfig, ConfigError } from '../validate';
import { ScriptEngine } from '../ScriptEngine';
import * as configs from '../types/config';
import * as results from '../types/result';
import * as utils from '../types/utils';
import { Context, SchemaType, ScriptPromptType } from '../types/types';
import { ToolCallOptions } from 'ai';

export type ScriptInstance<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
> = ScriptCallSignature<TConfig, INPUT, OUTPUT>;

//@todo - move to result
type ScriptResultPromise<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
> =
	Promise<TConfig extends { schema: SchemaType<infer OBJECT> } ? OBJECT : results.ScriptResult>;

// Script call signature type
export type ScriptCallSignature<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
> =
	TConfig extends { script: string }
	? {
		// TConfig has a script, so the script argument is optional.
		(scriptOrContext?: Context | string): ScriptResultPromise<TConfig, INPUT, OUTPUT>;
		(script?: string, context?: Context): ScriptResultPromise<TConfig, INPUT, OUTPUT>;
		config: TConfig;
		type: string;
	}
	: {
		// TConfig has no script, so the script argument is required.
		(script: string, context?: Context): ScriptResultPromise<TConfig, INPUT, OUTPUT>;
		config: TConfig;
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
): ScriptCallSignature<utils.Override<TParentConfig, TConfig>, INPUT, OUTPUT>;

function baseScript(
	config: configs.ScriptConfig<any, any>,
	parent?: ConfigProvider<configs.ScriptConfig<any>>
): any {
	return _createScript(config, 'async-script', parent);
}

// asTool method for Script
function asTool<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig & { description?: string; inputSchema: any }
): ScriptCallSignature<TConfig, INPUT, OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function asTool<
	TConfig extends configs.ScriptConfig<INPUT, OUTPUT>,
	TParentConfig extends configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT
>(
	config: TConfig & { description?: string; inputSchema: any },
	parent: ConfigProvider<TParentConfig>
): ScriptCallSignature<TConfig, INPUT, OUTPUT> & results.RendererTool<INPUT, OUTPUT>;

function asTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: configs.ScriptConfig<INPUT, OUTPUT> & { description?: string; inputSchema: SchemaType<INPUT> },
	parent?: ConfigProvider<configs.ScriptConfig<INPUT, OUTPUT>>
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
): ScriptCallSignature<utils.Override<TParentConfig, TConfig>, INPUT, OUTPUT>;

function loadsScript(
	config: configs.ScriptConfig<any, any> & configs.LoaderConfig,
	parent?: ConfigProvider<configs.ScriptConfig<any> & configs.LoaderConfig>
): any {
	return _createScript(config, 'async-script-name', parent);
}

// loadsScriptAsTool: load by name via provided loader and return as tool
function loadsScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig & { description?: string; inputSchema: SchemaType<INPUT> }
): results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT,
	TParentConfig extends configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT
>(
	config: configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig & { description?: string; inputSchema: SchemaType<INPUT> },
	parent: ConfigProvider<TParentConfig>
): results.RendererTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig & { description?: string; inputSchema: SchemaType<INPUT> },
	parent?: ConfigProvider<configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig>
): results.RendererTool<INPUT, OUTPUT> {
	return _createScriptAsTool(config, 'async-script-name', parent);
}

// Internal common creator
export function _createScript(
	config: configs.ScriptConfig<any, any>,
	scriptType: ScriptPromptType,
	parent?: ConfigProvider<configs.ScriptConfig<any, any>>
): ScriptCallSignature<any, any, any> {
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
	const call = async (scriptOrContext?: Context | string, maybeContext?: Context): Promise<any> => {
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

	return callSignature as ScriptCallSignature<any, any, any>;
}

// Internal common creator for tools
export function _createScriptAsTool<
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: configs.ScriptConfig<INPUT, OUTPUT> & { description?: string; inputSchema: SchemaType<INPUT> },
	scriptType: ScriptPromptType,
	parent?: ConfigProvider<configs.ScriptConfig<INPUT, OUTPUT>>
): results.RendererTool<INPUT, OUTPUT> {
	const renderer = _createScript(config, scriptType, parent) as (args: INPUT) => Promise<OUTPUT>;

	// Create a proper Tool object that matches the Vercel AI SDK's Tool interface
	const tool: results.RendererTool<INPUT, OUTPUT> = {
		description: config.description,
		inputSchema: config.inputSchema,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		execute: async (args: INPUT, _options: ToolCallOptions) => {
			// Call the renderer with the args as context
			const result = await renderer(args);
			return result;
		},
		type: 'function' as const
	};

	return tool;
}

export const Script = Object.assign(baseScript, {
	loadsScript: Object.assign(loadsScript, {
		asTool
	}),
	asTool,
	loadsScriptAsTool
});