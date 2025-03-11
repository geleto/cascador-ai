import { Override, TemplateConfig } from './types';

export interface ConfigProvider<T> {
	readonly config: T;
}

export class ConfigData<ConfigType> implements ConfigProvider<ConfigType> {
	constructor(public readonly config: ConfigType) { }
}

/**
 * Merge two partial LLM configs into a single object.
 * The return type is exactly the union of P & C (with child overriding parent).
 * @todo - merge loaders
 */
export function mergeConfigs<
	TChild extends Record<string, any> & Omit<TemplateConfig, 'promptType'>,
	TParent extends Record<string, any> & Omit<TemplateConfig, 'promptType'>
>(
	parentConfig: TParent,
	childConfig: TChild
): Override<TParent, TChild> {
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