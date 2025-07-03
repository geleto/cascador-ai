import { Tool } from 'ai';
import { ConfigData, mergeConfigs } from './ConfigData';
import { ConfigProvider } from './ConfigData';
import * as configs from './types-config';
import { validateBaseConfig } from './validate';
import * as utils from './type-utils';

// Single config overload
export function Config<
	TConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, Tool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.StrictUnionSubtype<TConfig, configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>,
): ConfigProvider<TConfig>;

// Config with parent overload
export function Config<
	TConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, Tool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string,
	TCombined = utils.StrictUnionSubtype<utils.Override<TParentConfig, TConfig>, configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>
>(
	config: TConfig,
	parent: ConfigProvider<
		TCombined extends never ? never : TParentConfig
	>
): ConfigData<TCombined>;

// Implementation
export function Config<
	TConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, Tool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): ConfigData<TConfig> | ConfigData<utils.StrictUnionSubtype<utils.Override<TParentConfig, TConfig>, configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>> {

	validateBaseConfig(config);

	if (parent) {
		const merged = mergeConfigs(parent.config, config);
		// Runtime check would go here if needed
		validateBaseConfig(merged);
		return new ConfigData(merged);
	}

	return new ConfigData(config);
}