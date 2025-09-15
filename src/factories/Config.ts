import { mergeConfigs, processConfig } from '../config-utils';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { ToolSet } from 'ai';
import { validateAnyConfig } from '../validate';

class ConfigData<ConfigType> implements configs.ConfigProvider<ConfigType> {
	constructor(public readonly config: ConfigType) { }
}

// Single config overload
export function Config<
	TConfig extends Partial<configs.AnyConfig<TOOLS, INPUT, OUTPUT, ENUM>>,
	TOOLS extends ToolSet, //@todo - handle TOOLS similarly elsewhere
	INPUT extends Record<string, any>,
	OUTPUT, //@out
	ENUM extends string = string
>(
	config: utils.StrictUnionSubtype<TConfig, Partial<configs.AnyConfig<TOOLS, INPUT, OUTPUT, ENUM>>>,
): configs.ConfigProvider<TConfig>;

// Config with parent overload
export function Config<
	TConfig extends Partial<configs.AnyConfig<TOOLS, INPUT, OUTPUT, ENUM>>,
	TParentConfig extends Partial<configs.AnyConfig<TOOLS, INPUT, OUTPUT, ENUM>>,
	TOOLS extends ToolSet, INPUT extends Record<string, any>, OUTPUT, ENUM extends string = string,
	TCombined = utils.StrictUnionSubtype<utils.Override<TParentConfig, TConfig>, Partial<configs.AnyConfig<TOOLS, INPUT, OUTPUT, ENUM>>>
>(
	config: TConfig,
	parent: configs.ConfigProvider<
		TCombined extends never ? never : TParentConfig
	>
): ConfigData<TCombined>;

// Implementation
export function Config<
	TConfig extends Partial<configs.AnyConfig<TOOLS, INPUT, OUTPUT, ENUM>>,
	TParentConfig extends Partial<configs.AnyConfig<PARENT_TOOLS, PARENT_INPUT, PARENT_OUTPUT, PARENT_ENUM>>,

	TOOLS extends ToolSet,
	INPUT extends Record<string, any>,
	OUTPUT,
	ENUM extends string,

	PARENT_TOOLS extends ToolSet,
	PARENT_INPUT extends Record<string, any>,
	PARENT_OUTPUT,
	PARENT_ENUM extends string,

	FINAL_TOOLS extends ToolSet = utils.Override<PARENT_TOOLS, TOOLS>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
	FINAL_OUTPUT = OUTPUT extends never ? PARENT_OUTPUT : OUTPUT,
	FINAL_ENUM extends string = ENUM extends never ? PARENT_ENUM : ENUM,

	TFinalConfig = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig,
	parent?: configs.ConfigProvider<TParentConfig>
):
	| ConfigData<TFinalConfig>
	| ConfigData<utils.StrictUnionSubtype<TFinalConfig, Partial<configs.AnyConfig<FINAL_TOOLS, FINAL_INPUT, FINAL_OUTPUT, FINAL_ENUM>>>> {


	// Debug output if config.debug is true
	if ('debug' in config && config.debug) {
		console.log('[DEBUG] Config function created with config:', JSON.stringify(config, null, 2));
	}

	if (parent) {
		const merged = mergeConfigs(parent.config, config);
		validateAnyConfig(merged as Partial<configs.AnyConfig<any, any, any, any>>);
		// Runtime check would go here if needed
		return new ConfigData(merged) as ConfigData<TFinalConfig>;
	}

	return new ConfigData(processConfig(config)) as unknown as ConfigData<TFinalConfig>;
}