import { LLMPartialConfig } from './types';

export interface ConfigBase<ConfigType> {
	config: ConfigType;
}

export class Config implements ConfigBase<LLMPartialConfig> {
	config: LLMPartialConfig;

	constructor(config: LLMPartialConfig, parent?: Config) {
		this.config = Config.mergeConfig(parent ? parent.config : undefined, config);
	}

	getMergedConfig(parentConfig?: LLMPartialConfig): LLMPartialConfig {
		return Config.mergeConfig(parentConfig, this.config);
	}

	static mergeConfig(parentConfig?: LLMPartialConfig, config?: LLMPartialConfig): LLMPartialConfig {
		if (!parentConfig) {
			return { ...(config || {}) };
		}
		if (!config) {
			return { ...parentConfig };
		}
		return {
			...parentConfig,
			...config,
			context: {
				...(parentConfig.context || {}),
				...(config.context || {})
			},
			filters: {
				...(parentConfig.filters || {}),
				...(config.filters || {})
			},
			loader: [
				...(parentConfig.loader ? (Array.isArray(parentConfig.loader) ? parentConfig.loader : [parentConfig.loader]) : []),
				...(config.loader ? (Array.isArray(config.loader) ? config.loader : [config.loader]) : [])
			],
		};
	}
}