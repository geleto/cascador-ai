import { CoreTool, LanguageModel } from 'ai';
import { BaseConfig, TemplateOnlyConfig, BaseConfigWithTools, ConfigWithTools } from './types';

// Interfaces for ConfigData classes capabilities
export interface IConfigDataModelIsSet {
	readonly config: BaseConfig & { model: LanguageModel };
}

export interface IConfigDataHasTools<TOOLS extends Record<string, CoreTool>> {
	readonly config: BaseConfigWithTools<TOOLS>;
}

export class BaseConfigData<ConfigType extends BaseConfig = BaseConfig> {
	config: ConfigType;
	constructor(config: ConfigType, parent?: ConfigData) {
		this.config = parent ? mergeConfigs(config, parent.config) : config;
	}
}

export class ConfigData extends BaseConfigData {
}

export class ConfigDataModelIsSet extends BaseConfigData<BaseConfig & { model: LanguageModel }>
	implements IConfigDataModelIsSet {
}

// The constructor accepts a full config with tools which includes 1 experimental stream-only property
// because the stream and generate configs share all other properties, for simplicity they are accepted here as a simple type
// but the stored config is the base config with tools which is the common subset of the two
export class BaseConfigDataWithTools<TOOLS extends Record<string, CoreTool>>
	extends BaseConfigData<BaseConfigWithTools<TOOLS>>
	implements IConfigDataHasTools<TOOLS> {
	constructor(config: ConfigWithTools<TOOLS>, parent?: ConfigData) {
		super(config as BaseConfigWithTools<TOOLS>, parent);
	}
}

export class ConfigDataHasToolsModelIsSet<TOOLS extends Record<string, CoreTool>>
	extends BaseConfigData<BaseConfigWithTools<TOOLS> & { model: LanguageModel }>
	implements IConfigDataModelIsSet, IConfigDataHasTools<TOOLS> {
}

export class TemplateConfigData extends BaseConfigData<Partial<TemplateOnlyConfig>> {
}

/**
 * Merge two partial LLM configs into a single object.
 * The return type is exactly the union of P & C (with child overriding parent).
 */
export function mergeConfigs<
	TParent extends BaseConfig,
	TChild extends BaseConfig
>(
	parentConfig: TParent,
	childConfig: TChild
): TParent & TChild {
	// Start shallow merge
	const merged = { ...parentConfig, ...childConfig };

	// Now handle known deep merges:
	if ('context' in parentConfig || 'context' in childConfig) {
		merged.context = {
			...parentConfig.context ?? {},
			...childConfig.context ?? {},
		};
	}

	if ('filters' in parentConfig || 'filters' in childConfig) {
		merged.filters = {
			...parentConfig.filters ?? {},
			...childConfig.filters ?? {},
		};
	}

	// Fixed loader handling with proper deduplication
	const parentLoaders = parentConfig.loader
		? Array.isArray(parentConfig.loader)
			? parentConfig.loader
			: [parentConfig.loader]
		: [];
	const childLoaders = childConfig.loader
		? Array.isArray(childConfig.loader)
			? childConfig.loader
			: [childConfig.loader]
		: [];

	merged.loader = Array.from(
		new Set([...parentLoaders, ...childLoaders].filter(Boolean))
	);

	return merged;
}