import { AnyLLMConfigPartial } from './types';

export interface ConfigBase<ConfigType> {
	config: ConfigType;
}

export class Config implements ConfigBase<AnyLLMConfigPartial> {
	config: AnyLLMConfigPartial;

	constructor(config: AnyLLMConfigPartial, parent?: Config) {
		this.config = Config.mergeConfig(parent ? parent.config : undefined, config, parent);
	}

	getMergedConfig(parentConfig?: AnyLLMConfigPartial): AnyLLMConfigPartial {
		return Config.mergeConfig(parentConfig, this.config);
	}

	static mergeConfig(parentConfig?: AnyLLMConfigPartial, config?: AnyLLMConfigPartial, parent?: Config): AnyLLMConfigPartial {
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
			parent
		};
	}
}