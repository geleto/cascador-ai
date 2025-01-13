import { LLMPartialConfig } from './types';

export class ConfigData<
	TConfig extends LLMPartialConfig = LLMPartialConfig,
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	TParentConfig extends LLMPartialConfig = {}
> {
	readonly config: TConfig & TParentConfig;

	constructor(config: TConfig, parent?: ConfigData<TParentConfig>) {
		this.config = ConfigData.mergeConfigs(parent?.config, config);
	}

	/**
	 * Merge two partial LLM configs into a single object.
	 * The return type is exactly the union of P & C (with child overriding parent).
	 */
	static mergeConfigs<
		TParent extends LLMPartialConfig,
		TChild extends LLMPartialConfig
	>(
		parentConfig?: TParent,
		childConfig?: TChild
	): TParent & TChild {
		if (!parentConfig) return (childConfig ?? {}) as TParent & TChild;
		if (!childConfig) return parentConfig as TParent & TChild;

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

		// Fixed loader handling with proper deduplication and type checking
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
			//remove duplicates, filter out nulls, but is this possible (todo)
			new Set([...parentLoaders, ...childLoaders].filter(Boolean))
		);

		return merged;
	}
}