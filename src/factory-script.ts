import { ConfigProvider, mergeConfigs } from './ConfigData';
import { validateBaseConfig, ConfigError } from './validate';
import { ScriptEngine } from './ScriptEngine';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { Context, SchemaType, ScriptPromptType } from './types';

export type ScriptRunnerInstance<TConfig extends configs.ScriptConfig<any>> = ScriptCallSignature<TConfig>;

type ScriptResultPromise<TConfig extends configs.ScriptConfig<any>> =
	Promise<TConfig extends { schema: SchemaType<infer OBJECT> } ? OBJECT : results.ScriptResult>;

// Script call signature type
export type ScriptCallSignature<TConfig extends configs.ScriptConfig<any>> =
	TConfig extends { script: string }
	? {
		// TConfig has a script, so the script argument is optional.
		(scriptOrContext?: Context | string): ScriptResultPromise<TConfig>;
		(script?: string, context?: Context): ScriptResultPromise<TConfig>;
		config: TConfig;
	}
	: {
		// TConfig has no script, so the script argument is required.
		(script: string, context?: Context): ScriptResultPromise<TConfig>;
		config: TConfig;
	};

// Internal common creator
export function _createScriptRunner(
	config: configs.ScriptConfig<any>,
	scriptType: Exclude<ScriptPromptType, undefined>,
	parent?: ConfigProvider<configs.ScriptConfig<any>>
): ScriptCallSignature<any> {
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(parent.config, config)
		: config;

	// Force intended scriptType based on entry point
	merged.promptType = scriptType;

	validateBaseConfig(merged);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] ScriptRunner created with config:', JSON.stringify(merged, null, 2));
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

	const runner = new ScriptEngine<typeof merged, any>(merged);

	// Define the call function that handles both cases
	const call = async (scriptOrContext?: Context | string, maybeContext?: Context): Promise<any> => {
		if ('debug' in merged && merged.debug) {
			console.log('[DEBUG] ScriptRunner - call function called with:', { scriptOrContext, maybeContext });
		}
		if (typeof scriptOrContext === 'string') {
			const result = await runner.run(scriptOrContext, maybeContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] ScriptRunner - run result:', result);
			}
			return result;
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when not providing script.');
			}
			const result = await runner.run(undefined, scriptOrContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] ScriptRunner - run result:', result);
			}
			return result;
		}
	};

	const callSignature = Object.assign(call, { config: merged });

	return callSignature as ScriptCallSignature<any>;
}

// Default behavior: inline/embedded script
export function baseScriptRunner<
	const TConfig extends configs.ScriptConfig<OBJECT>,
	OBJECT = any
>(
	config: utils.StrictType<TConfig, configs.ScriptConfig<OBJECT>>
): ScriptCallSignature<TConfig>;

export function baseScriptRunner<
	TConfig extends configs.ScriptConfig<OBJECT>,
	TParentConfig extends configs.ScriptConfig<PARENT_OBJECT>,
	OBJECT = any,
	PARENT_OBJECT = any
>(
	config: utils.StrictType<TConfig, configs.ScriptConfig<OBJECT>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.ScriptConfig<PARENT_OBJECT>>>
): ScriptCallSignature<utils.Override<TParentConfig, TConfig>>;

export function baseScriptRunner(
	config: configs.ScriptConfig<any>,
	parent?: ConfigProvider<configs.ScriptConfig<any>>
): any {
	return _createScriptRunner(config, 'async-script', parent);
}

// loadsScript: load by name via provided loader
export function loadsScript<
	const TConfig extends configs.ScriptConfig<OBJECT> & configs.LoaderConfig,
	OBJECT = any
>(
	config: TConfig
): ScriptCallSignature<TConfig>;

export function loadsScript<
	TConfig extends configs.ScriptConfig<OBJECT> & configs.LoaderConfig,
	TParentConfig extends configs.ScriptConfig<PARENT_OBJECT> & configs.LoaderConfig,
	OBJECT = any,
	PARENT_OBJECT = any
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
): ScriptCallSignature<utils.Override<TParentConfig, TConfig>>;

export function loadsScript(
	config: configs.ScriptConfig<any> & configs.LoaderConfig,
	parent?: ConfigProvider<configs.ScriptConfig<any> & configs.LoaderConfig>
): any {
	return _createScriptRunner(config, 'async-script-name', parent);
}

export const ScriptRunner = Object.assign(baseScriptRunner, {
	loadsScript,
});