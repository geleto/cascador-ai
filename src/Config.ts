import { LLMPartialConfig } from './types';

export class Config<
	TConfig extends LLMPartialConfig = LLMPartialConfig,
	TParentConfig extends LLMPartialConfig = {}
> {
	readonly config: TConfig & TParentConfig;

	constructor(config: TConfig, parent?: Config<TParentConfig>) {
		this.config = Config.mergeConfig(parent?.config, config);
	}

	/**
	 * Merge two partial LLM configs into a single object.
	 * The return type is exactly the union of P & C (with child overriding parent).
	 */
	static mergeConfig<
		TParent extends LLMPartialConfig,
		TChild extends LLMPartialConfig
	>(
		parentConfig?: TParent,
		childConfig?: TChild
	): TParent & TChild {
		if (!parentConfig) return (childConfig ?? {}) as TParent & TChild;
		if (!childConfig) return parentConfig as TParent & TChild;

		// Start shallow merge
		const merged: any = { ...parentConfig, ...childConfig };

		// Now handle known deep merges:
		if ('context' in parentConfig || 'context' in childConfig) {
			merged.context = {
				...(parentConfig as any).context || {},
				...(childConfig as any).context || {},
			};
		}
		if ('filters' in parentConfig || 'filters' in childConfig) {
			merged.filters = {
				...(parentConfig as any).filters || {},
				...(childConfig as any).filters || {},
			};
		}

		// Concatenate loader arrays (if any). If either side is null/undefined, skip it.
		const pLoader = (parentConfig as any).loader;
		const cLoader = (childConfig as any).loader;
		const parentLoaders = pLoader
			? Array.isArray(pLoader) ? pLoader : [pLoader]
			: [];
		const childLoaders = cLoader
			? Array.isArray(cLoader) ? cLoader : [cLoader]
			: [];
		merged.loader = Array.from(
			//remove duplicates
			new Set([
				...(Array.isArray(parentConfig?.loader) ? parentConfig.loader : parentConfig?.loader ? [parentConfig.loader] : []),
				...(Array.isArray(childConfig?.loader) ? childConfig.loader : childConfig?.loader ? [childConfig.loader] : []),
			])
		);

		return merged as TParent & TChild;
	}
}
