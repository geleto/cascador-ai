import { Context } from 'mocha';
import { Override } from './types/utils';
import * as configs from './types/config';
import { Loader } from 'cascada-engine';
import { CascadaLoaders, CascadaFilters } from './types/types';
import { ToolSet } from 'ai';

export interface ConfigProvider<T> {
	readonly config: T;
}

export class ConfigData<ConfigType> implements ConfigProvider<ConfigType> {
	constructor(public readonly config: ConfigType) { }
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
		} as CascadaFilters;
	}

	if ('loader' in parentConfig && 'loader' in childConfig) {
		const parentLoaders = (parentConfig.loader
			? Array.isArray(parentConfig.loader)
				? parentConfig.loader
				: [parentConfig.loader]
			: []) as Loader[];
		const childLoaders = (childConfig.loader
			? Array.isArray(childConfig.loader)
				? childConfig.loader
				: [childConfig.loader]
			: []) as Loader[];

		merged.loader = Array.from(
			new Set([...parentLoaders, ...childLoaders].filter(Boolean))
		) as CascadaLoaders;
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