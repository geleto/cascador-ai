import { LLMPartialConfig } from './types';

export interface ConfigBase<ConfigType> {
	config: ConfigType;
}

export class Config<TConfig extends LLMPartialConfig = {}, TParentConfig extends LLMPartialConfig = {}> {
	readonly config: TConfig & TParentConfig;

	constructor(config: TConfig, parent?: Config<any, any>) {
		this.config = Config.mergeConfig(parent?.config, config);
	}

	static mergeConfig<TChild extends LLMPartialConfig, TParent extends LLMPartialConfig>(
		parentConfig: TParent | undefined,
		childConfig: TChild | undefined
	): TChild & TParent {
		if (!parentConfig) {
			return { ...(childConfig || {}) } as TChild & TParent;
		}
		if (!childConfig) {
			return { ...parentConfig } as TChild & TParent;
		}
		return {
			...parentConfig,
			...childConfig,
			context: {
				...(parentConfig.context || {}),
				...(childConfig.context || {})
			},
			filters: {
				...(parentConfig.filters || {}),
				...(childConfig.filters || {})
			},
			loader: [
				...(parentConfig.loader ? (Array.isArray(parentConfig.loader) ? parentConfig.loader : [parentConfig.loader]) : []),
				...(childConfig.loader ? (Array.isArray(childConfig.loader) ? childConfig.loader : [childConfig.loader]) : [])
			],
		} as TChild & TParent;
	}
}