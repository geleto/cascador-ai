import { CoreTool } from 'ai';
import { BaseConfig, BaseConfigWithTools } from './types';


export class ConfigData<ConfigType extends BaseConfig> {
	constructor(public readonly config: ConfigType) {
	}
}

export class ConfigDataWithTools<TOOLS extends Record<string, CoreTool>> extends ConfigData<BaseConfigWithTools<TOOLS>> {
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