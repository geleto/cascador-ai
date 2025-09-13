import { Context } from 'mocha';
import { Override } from './types/utils';
import * as configs from './types/config';
import * as types from './types/types';
import { ToolSet } from 'ai';
import { mergeLoaders, processLoaders, RaceGroup, MergedGroup } from './loaders';
import { ILoaderAny } from 'cascada-engine';


export interface ConfigProvider<T> {
	readonly config: T;
}

export class ConfigData<ConfigType> implements ConfigProvider<ConfigType> {
	constructor(public readonly config: ConfigType) { }
}

export function processConfig<T extends Partial<configs.LoaderConfig> & Record<string, any>>(
	config: T
): Omit<T, 'loader'> & { loader?: ReturnType<typeof processLoaders> } {
	if ('loader' in config && config.loader) {
		const loader = processLoaders(config.loader as ILoaderAny[]);
		return { ...config, loader };
	}
	return config as Omit<T, 'loader'> & { loader?: ReturnType<typeof processLoaders> };
}

/**
 * Merge two partial LLM configs into a single object.
 * The return type is exactly the union of P & C (with child overriding parent).
 * @todo - more universal merge handling (give it a list)
 */
export function mergeConfigs<
	TChild extends Record<string, any>,
	TParent extends Record<string, any>
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
	const merged = { ...parentConfig, ...childConfig } as unknown as configs.CascadaConfig;

	// Now handle known deep merges:
	if ('context' in parentConfig && 'context' in childConfig) {
		merged.context = {
			...parentConfig.context ?? {},
			...childConfig.context ?? {},
		} as Context;
	}

	if ('filters' in parentConfig && 'filters' in childConfig) {
		merged.filters = {
			...(parentConfig as unknown as configs.CascadaConfig).filters ?? {},
			...(childConfig as unknown as configs.CascadaConfig).filters ?? {},
		} as types.CascadaFilters;
	}

	const parentLoaders = ('loader' in parentConfig) ? (parentConfig.loader
		? Array.isArray(parentConfig.loader)
			? parentConfig.loader
			: [parentConfig.loader]
		: []) as (ILoaderAny | RaceGroup | MergedGroup)[] : undefined;

	const childLoaders = ('loader' in childConfig) ? (childConfig.loader
		? Array.isArray(childConfig.loader)
			? childConfig.loader
			: [childConfig.loader]
		: []) as (ILoaderAny | RaceGroup | MergedGroup)[] : undefined;

	if (parentLoaders && childLoaders) {
		merged.loader = mergeLoaders(parentLoaders, childLoaders);
	} else if (childLoaders) {
		merged.loader = processLoaders(childLoaders);
	} else if (parentLoaders) {
		merged.loader = processLoaders(parentLoaders);
	}

	if ('messages' in parentConfig && 'messages' in childConfig) {
		const parentMessages = (parentConfig as unknown as configs.TemplatePromptConfig).messages ?? [];
		const childMessages = (childConfig as unknown as configs.TemplatePromptConfig).messages ?? [];
		(merged as configs.TemplatePromptConfig).messages = [
			...parentMessages,
			...childMessages,
		];
	}

	if ('tools' in parentConfig && 'tools' in childConfig) {
		const parentTools: ToolSet = ((parentConfig as unknown as { tools?: ToolSet }).tools) ?? {};
		const childTools: ToolSet = ((childConfig as unknown as { tools?: ToolSet }).tools) ?? {};
		(merged as unknown as { tools?: ToolSet }).tools = { ...parentTools, ...childTools };
	}

	// Debug output for merged result if debug is enabled
	/* if (('debug' in parentConfig && parentConfig.debug) || ('debug' in childConfig && childConfig.debug)) {
		console.log('[DEBUG] mergeConfigs result:', JSON.stringify(merged, null, 2));
	} */

	return merged as unknown as Override<TParent, TChild>;
}