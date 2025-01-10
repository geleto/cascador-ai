import { AnyLLMConfigPartial } from './types';

export class Config {
	protected config: AnyLLMConfigPartial;

	constructor(config: AnyLLMConfigPartial) {
		// Validate parent type
		if (config.parent && !(config.parent instanceof Config)) {
			throw new Error('Config parent must be an instance of Config');
		}

		if (config.parent instanceof Config) {
			const parentConfig = config.parent.config;
			const parentLoaders = parentConfig.loader ? (Array.isArray(parentConfig.loader) ? parentConfig.loader : [parentConfig.loader]) : [];
			const currentLoaders = config.loader ? (Array.isArray(config.loader) ? config.loader : [config.loader]) : [];

			this.config = {
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
				loader: [...parentLoaders, ...currentLoaders],
				parent: undefined
			};
		} else {
			this.config = config;
		}
	}
}