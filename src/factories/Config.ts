import { ConfigData, mergeConfigs } from '../ConfigData';
import { validateBaseConfig } from '../validate';
import { ConfigProvider } from '../ConfigData';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { ToolSet } from 'ai';

// Single config overload
export function Config<
	TConfig, // extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.StrictUnionSubtype<TConfig, Partial<configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>>,
): ConfigProvider<TConfig>;

// Config with parent overload
export function Config<
	TConfig extends Partial<configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>,
	TParentConfig extends Partial<configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string,
	TCombined = utils.StrictUnionSubtype<utils.Override<TParentConfig, TConfig>, Partial<configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>>
>(
	config: TConfig,
	parent: ConfigProvider<
		TCombined extends never ? never : TParentConfig
	>
): ConfigData<TCombined>;

// Implementation
export function Config<
	TConfig extends Partial<configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>,
	TParentConfig extends Partial<configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>,
	TOOLS extends ToolSet, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): ConfigData<TConfig> | ConfigData<utils.StrictUnionSubtype<utils.Override<TParentConfig, TConfig>, Partial<configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>>> {

	//validateBaseConfig(config);

	// Debug output if config.debug is true
	if ('debug' in config && config.debug) {
		console.log('[DEBUG] Config function created with config:', JSON.stringify(config, null, 2));
	}

	if (parent) {
		const merged = mergeConfigs(parent.config, config);
		// Runtime check would go here if needed
		validateBaseConfig(merged);
		return new ConfigData(merged);
	}

	validateBaseConfig(config);
	return new ConfigData(config);
}