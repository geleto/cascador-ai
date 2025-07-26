import { ConfigProvider, mergeConfigs } from './ConfigData';
import { validateBaseConfig, ConfigError } from './validate';
import { ScriptEngine } from './ScriptEngine';
import * as configs from './types-config';
import * as results from './types-result';
import * as utils from './type-utils';
import { Context, SchemaType } from './types';

export type ScriptRunnerInstance<TConfig extends configs.ScriptConfig<any>> = ScriptCallSignature<TConfig>;

type ScriptResultPromise<TConfig extends configs.ScriptConfig<any>> =
	Promise<TConfig extends { schema: SchemaType<infer OBJECT> } ? OBJECT : results.ScriptResult>;

// Script call signature type
export type ScriptCallSignature<TConfig extends configs.ScriptConfig<any>> =
	TConfig extends { script: string }
	? {
		// TConfig has a script, so the script argument is optional.
		(scriptOrContext?: Context | string): ScriptResultPromise<TConfig>;
		(script: string, context: Context): ScriptResultPromise<TConfig>;
		config: TConfig;
	}
	: {
		// TConfig has no script, so the script argument is required.
		(script: string, context?: Context): ScriptResultPromise<TConfig>;
		config: TConfig;
	};

// Single config overload
export function ScriptRunner<
	const TConfig extends configs.ScriptConfig<any>
>(
	config: utils.StrictType<TConfig, configs.ScriptConfig<any>> & utils.RequireScriptLoaderIfNeeded<TConfig>
): ScriptCallSignature<TConfig>;

// Config with parent overload
export function ScriptRunner<
	const TConfig extends configs.ScriptConfig<any>,
	const TParentConfig extends configs.ScriptConfig<any>
>(
	config: utils.StrictType<TConfig, configs.ScriptConfig<any>> & utils.RequireScriptLoaderIfNeeded<utils.Override<TParentConfig, TConfig>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.ScriptConfig<any>>>
): ScriptCallSignature<utils.Override<TParentConfig, TConfig>>;

// Implementation
export function ScriptRunner<
	TConfig extends configs.ScriptConfig<OBJECT>,
	TParentConfig extends configs.ScriptConfig<PARENT_OBJECT>,
	OBJECT,
	PARENT_OBJECT
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): ScriptCallSignature<any> {

	//validateBaseConfig(config);
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(parent.config, config)
		: config;
	if (parent) {
		validateBaseConfig(merged);
	}

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] ScriptRunner created with config:', JSON.stringify(merged, null, 2));
	}

	if ((merged.scriptType === 'script-name' || merged.scriptType === 'async-script-name') && !('loader' in merged)) {
		throw new ConfigError('Script name types require a loader');
	}

	if ((merged.scriptType === 'script-name' ||
		merged.scriptType === 'async-script-name') &&
		!merged.loader
	) {
		throw new Error('A loader is required when scriptType is "script-name" or "async-script-name".');
	}

	const runner = new ScriptEngine<typeof merged, OBJECT>(merged);

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

	type ReturnType = [typeof parent] extends [undefined]
		? ScriptCallSignature<TConfig>
		: ScriptCallSignature<utils.Override<TParentConfig, TConfig>>;

	return callSignature as ReturnType;
}