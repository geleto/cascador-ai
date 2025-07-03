import { ConfigProvider } from './ConfigData';
import { ScriptEngine } from './ScriptEngine';
import { Context } from './types';
import * as configs from './types-config';
import * as results from './types-result';
import { validateBaseConfig, ConfigError } from './validate';
import * as utils from './type-utils';
import { mergeConfigs } from './ConfigData';

// Script call signature type
type ScriptCallSignature<TConfig extends configs.OptionalScriptConfig> =
	TConfig extends { script: string }
	? {
		//TConfig has script, no script argument is needed
		(scriptOrContext?: Context | string): Promise<results.ScriptResult>;//one optional argument, script or context
		(script: string, context: Context): Promise<results.ScriptResult>;//two arguments, script and context
		config: TConfig;
	}
	: {
		//TConfig has no script, script argument is needed
		(script: string, context?: Context): Promise<results.ScriptResult>;//script is a must, context is optional
		config: TConfig;
	};

// Single config overload
export function ScriptRunner<TConfig extends configs.ScriptConfig>(
	config: utils.StrictType<TConfig, configs.ScriptConfig> & utils.RequireScriptLoaderIfNeeded<TConfig>
): ScriptCallSignature<TConfig>;

// Config with parent overload
export function ScriptRunner<
	TConfig extends configs.ScriptConfig,
	TParentConfig extends configs.ScriptConfig
>(
	config: utils.StrictType<TConfig, configs.ScriptConfig> & utils.RequireScriptLoaderIfNeeded<utils.Override<TParentConfig, TConfig>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.ScriptConfig>>
): ScriptCallSignature<utils.Override<TParentConfig, TConfig>>;

// Implementation
export function ScriptRunner<
	TConfig extends configs.ScriptConfig,
	TParentConfig extends configs.ScriptConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): [typeof parent] extends [undefined]
	? ScriptCallSignature<TConfig>
	: ScriptCallSignature<utils.Override<TParentConfig, TConfig>> {

	validateBaseConfig(config);
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(parent.config, config)
		: config;
	if (parent) {
		validateBaseConfig(merged);
	}

	if ((merged.scriptType === 'script-name' || merged.scriptType === 'async-script-name') && !('loader' in merged)) {
		throw new ConfigError('Script name types require a loader');
	}

	if ((merged.scriptType === 'script-name' ||
		merged.scriptType === 'async-script-name') &&
		!merged.loader
	) {
		throw new Error('A loader is required when scriptType is "script-name", "async-script-name", or undefined.');
	}

	const runner = new ScriptEngine(merged);

	// Define the call function that handles both cases
	const call = async (scriptOrContext?: Context | string, maybeContext?: Context): Promise<results.ScriptResult> => {
		if (typeof scriptOrContext === 'string') {
			return await runner.run(scriptOrContext, maybeContext);
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when not providing script.');
			}
			return await runner.run(undefined, scriptOrContext);
		}
	};

	const callSignature = Object.assign(call, { config: merged });

	type ReturnType = [typeof parent] extends [undefined]
		? ScriptCallSignature<TConfig>
		: ScriptCallSignature<utils.Override<TParentConfig, TConfig>>;

	return callSignature as ReturnType;
}