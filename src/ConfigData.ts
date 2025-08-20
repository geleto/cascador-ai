import { Override } from './types/utils';
import { TemplatePromptConfig } from './types/config';

export interface ConfigProvider<T> {
	readonly config: T;
}

export class ConfigData<ConfigType> implements ConfigProvider<ConfigType> {
	constructor(public readonly config: ConfigType) { }
}

/**
 * Merge two partial LLM configs into a single object.
 * The return type is exactly the union of P & C (with child overriding parent).
 */
export function mergeConfigs<
	TChild extends Record<string, any> & Omit<TemplatePromptConfig<any, any, any>, 'promptType'>,
	TParent extends Record<string, any> & Omit<TemplatePromptConfig<any, any, any>, 'promptType'>
>(
	parentConfig: TParent,
	childConfig: TChild
): Override<TParent, TChild> {
	// Debug output if either config has debug enabled
	if (('debug' in parentConfig && parentConfig.debug) || ('debug' in childConfig && childConfig.debug)) {
		console.log('[DEBUG] mergeConfigs called with:', {
			parentConfig: JSON.stringify(parentConfig, null, 2),
			childConfig: JSON.stringify(childConfig, null, 2)
		});
	}

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

	if ('loader' in parentConfig || 'loader' in childConfig) {
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
	}

	// Debug output for merged result if debug is enabled
	/*if (('debug' in parentConfig && parentConfig.debug) || ('debug' in childConfig && childConfig.debug)) {
		console.log('[DEBUG] mergeConfigs result:', JSON.stringify(merged, null, 2));
	}*/

	return merged;
}