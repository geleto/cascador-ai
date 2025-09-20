import { mergeConfigs, processConfig } from '../config-utils';
import { validateScriptConfig, validateScriptOrFunctionCall, validateAndParseOutput, ConfigError } from '../validate';
import { ScriptEngine } from '../ScriptEngine';
import * as configs from '../types/config';
import * as results from '../types/result';
import * as utils from '../types/utils';
import { SchemaType, ScriptPromptType } from '../types/types';
import { ToolCallOptions } from 'ai';

// The full shape of a final, merged Script config object, including required properties.
type FinalScriptConfigShape = Partial<configs.ScriptConfig<any, any> & configs.ScriptToolConfig<any, any> & { loader?: any }>;

// Generic validator for the `config` object passed to a factory function.
type ValidateScriptConfig<
	TConfig extends Partial<configs.ScriptConfig<any, any>>,
	TFinalConfig extends FinalScriptConfigShape,
	TShape extends FinalScriptConfigShape, // This TShape indicates the expected structure for the current factory
	TRequired =
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	& (TShape extends configs.LoaderConfig ? { loader: any } : {}) // loader is required for loads...
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	& (TShape extends { inputSchema: any } ? { inputSchema: SchemaType<any> } : {}) // inputSchema is required for asTool
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	& (TShape extends configs.ToolConfig<any, any> ? { script: any } : {})
> =
	// GATEKEEPER: Check for excess or missing properties
	// 1. Check for excess properties in TConfig that are not in TShape
	keyof Omit<TConfig, keyof TShape> extends never
	? (
		// 2. If no excess, check for required properties missing from the FINAL merged config.
		keyof Omit<TRequired, keyof TFinalConfig> extends never
		? TConfig // All checks passed.
		: `Config Error: Missing required property '${keyof Omit<TRequired, keyof TFinalConfig> & string}' in the final configuration.`
	)
	: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof TShape> & string}'`;

// Generic validator for the `parent` config object.
type ValidateScriptParentConfig<
	TParentConfig extends Partial<configs.ScriptConfig<any, any>>,
	TShape extends FinalScriptConfigShape // TShape for parent also
> =
	// Check for excess properties in the parent validated against TShape
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final script type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;


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
	// context is optional (todo - make it required if config has inputSchema and no script)
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
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
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
	config: TConfig & ValidateScriptConfig<TConfig, TConfig, configs.ScriptConfig<INPUT, OUTPUT>>
): ScriptCallSignature<TConfig, INPUT, OUTPUT>;

function baseScript<
	TConfig extends Partial<configs.ScriptConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig extends FinalScriptConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateScriptConfig<TConfig, TFinalConfig, configs.ScriptConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateScriptParentConfig<TParentConfig, configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT>>>
): ScriptCallSignatureWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>;

function baseScript(
	config: configs.ScriptConfig<any, any>,
	parent?: configs.ConfigProvider<configs.ScriptConfig<any, any>>
): any {
	return _createScript(config, 'async-script', parent, false);
}

// asTool method for Script
function asTool<
	const TConfig extends configs.ScriptToolConfig<INPUT, OUTPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig & ValidateScriptConfig<TConfig, TConfig, configs.ScriptToolConfig<INPUT, OUTPUT>>
): ScriptCallSignature<TConfig, INPUT, OUTPUT> & results.ComponentTool<INPUT, OUTPUT>;

function asTool<
	TConfig extends Partial<configs.ScriptToolConfig<INPUT, OUTPUT>>,
	TParentConfig extends Partial<configs.ScriptToolConfig<PARENT_INPUT, PARENT_OUTPUT>>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,
	TFinalConfig extends FinalScriptConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateScriptConfig<TConfig, TFinalConfig, configs.ScriptToolConfig<INPUT, OUTPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateScriptParentConfig<TParentConfig, configs.ScriptToolConfig<PARENT_INPUT, PARENT_OUTPUT>>>
): ScriptCallSignatureWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

function asTool(
	config: Partial<configs.ScriptToolConfig<any, any>>,
	parent?: configs.ConfigProvider<Partial<configs.ScriptToolConfig<any, any>>>
): any {
	return _createScriptAsTool(config, 'async-script', parent);
}

// loadsScript: load by name via provided loader
function loadsScript<
	const TConfig extends configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig & ValidateScriptConfig<TConfig, TConfig, configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig>
): ScriptCallSignature<TConfig, INPUT, OUTPUT>;

function loadsScript<
	TConfig extends Partial<configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	TFinalConfig extends FinalScriptConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateScriptConfig<TConfig, TFinalConfig, configs.ScriptConfig<INPUT, OUTPUT> & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateScriptParentConfig<TParentConfig, configs.ScriptConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig>>
): ScriptCallSignatureWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT>;

function loadsScript(
	config: configs.ScriptConfig<any, any> & configs.LoaderConfig,
	parent?: configs.ConfigProvider<configs.ScriptConfig<any, any> & configs.LoaderConfig>
): any {
	return _createScript(config, 'async-script-name', parent, false);
}

// loadsScriptAsTool: load by name via provided loader and return as tool
function loadsScriptAsTool<
	const TConfig extends configs.ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig & ValidateScriptConfig<TConfig, TConfig, configs.ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig>
): ScriptCallSignature<TConfig, INPUT, OUTPUT> & results.ComponentTool<INPUT, OUTPUT>;

function loadsScriptAsTool<
	TConfig extends Partial<configs.ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.ScriptToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	OUTPUT,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,
	TFinalConfig extends FinalScriptConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateScriptConfig<TConfig, TFinalConfig, configs.ScriptToolConfig<INPUT, OUTPUT> & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateScriptParentConfig<TParentConfig, configs.ScriptToolConfig<PARENT_INPUT, PARENT_OUTPUT> & configs.LoaderConfig>>
): ScriptCallSignatureWithParent<TConfig, TParentConfig, INPUT, OUTPUT, PARENT_INPUT, PARENT_OUTPUT> & results.ComponentTool<FINAL_INPUT, FINAL_OUTPUT>;

function loadsScriptAsTool(
	config: Partial<configs.ScriptToolConfig<any, any> & configs.LoaderConfig>,
	parent?: configs.ConfigProvider<Partial<configs.ScriptToolConfig<any, any> & configs.LoaderConfig>>
): any {
	return _createScriptAsTool(config, 'async-script-name', parent);
}

// Internal common creator
export function _createScript<
	INPUT extends Record<string, any>,
	OUTPUT,
>(
	config: configs.ScriptConfig<INPUT, OUTPUT>,
	scriptType: ScriptPromptType,
	parent?: configs.ConfigProvider<configs.ScriptConfig<INPUT, OUTPUT>>,
	isTool = false,
): ScriptCallSignature<configs.ScriptConfig<INPUT, OUTPUT>, INPUT, OUTPUT> {
	// Merge configs if parent exists, otherwise use provided config
	//, add promptType to the config
	const merged = parent
		? { ...mergeConfigs(parent.config, config), promptType: scriptType }
		: { ...processConfig(config), promptType: scriptType };

	validateScriptConfig(merged, scriptType, isTool);

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
		validateScriptOrFunctionCall(merged, 'Script', scriptOrContext, maybeContext);

		if ('debug' in merged && merged.debug) {
			console.log('[DEBUG] Script - call function called with:', { scriptOrContext, maybeContext });
		}
		if (typeof scriptOrContext === 'string') {
			const result = await runner.run(scriptOrContext, maybeContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] Script - run result:', result);
			}
			return validateAndParseOutput(merged, result);
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when not providing script.');
			}
			const result = await runner.run(undefined, scriptOrContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] Script - run result:', result);
			}
			return validateAndParseOutput(merged, result);
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
	config: Partial<configs.ScriptToolConfig<INPUT, OUTPUT>>,
	scriptType: ScriptPromptType,
	parent?: configs.ConfigProvider<Partial<configs.ScriptToolConfig<INPUT, OUTPUT>>>,
): ScriptCallSignatureWithParent<Partial<configs.ScriptToolConfig<INPUT, OUTPUT>>, Partial<configs.ScriptToolConfig<any, any>>, INPUT, OUTPUT, any, any>
	& results.ComponentTool<INPUT, OUTPUT> {

	const renderer = _createScript(config, scriptType, parent, true) as unknown as
		ScriptCallSignature<configs.ScriptToolConfig<INPUT, OUTPUT>, INPUT, OUTPUT> & results.ComponentTool<INPUT, OUTPUT>;
	renderer.description = renderer.config.description;
	renderer.inputSchema = renderer.config.inputSchema!;
	renderer.type = 'function';//Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options contains _toolCallOptions
	renderer.execute = async (args: INPUT, options: ToolCallOptions): Promise<OUTPUT> => {
		// Merge the _toolCallOptions into the context so scripts can access it
		const contextWithToolOptions = { ...args, _toolCallOptions: options };
		return await (renderer as unknown as (context: INPUT & { _toolCallOptions: ToolCallOptions }) => Promise<OUTPUT>)(contextWithToolOptions);
	};
	return renderer as ScriptCallSignatureWithParent<Partial<configs.ScriptToolConfig<INPUT, OUTPUT>>, Partial<configs.ScriptToolConfig<any, any>>, INPUT, OUTPUT, any, any>
		& results.ComponentTool<INPUT, OUTPUT>;
}

export const Script = Object.assign(baseScript, {
	loadsScript: Object.assign(loadsScript, {
		asTool: loadsScriptAsTool
	}),
	asTool,
	loadsScriptAsTool
});