import { ILoaderAny } from 'cascada-tmpl';
import { CommonConfig } from './types';

export class Config {
	protected config: CommonConfig;

	constructor(config: CommonConfig = {}, mergeLoadersAndFilters: boolean = true) {
		// Validate parent type
		if (config.parent && !(config.parent instanceof Config)) {
			throw new Error('Config parent must be an instance of Config');
		}

		const parentConfig = config.parent instanceof Config ? config.parent.getConfig() : {};

		this.config = {
			...parentConfig,
			...config,
			// Merge context separately
			context: {
				...(parentConfig.context || {}),
				...(config.context || {})
			},
			// Conditionally merge filters and loaders
			...(mergeLoadersAndFilters ? {
				filters: {
					...(parentConfig.filters || {}),
					...(config.filters || {})
				},
				loader: this.mergeLoaders(parentConfig.loader, config.loader),
			} : {
				filters: config.filters,
				loader: config.loader,
			}),
			// Remove parent after merging to avoid circular references
			parent: undefined
		};
	}

	protected getConfig(): CommonConfig {
		return this.config;
	}

	private mergeLoaders(parentLoader: ILoaderAny | ILoaderAny[] | null | undefined,
		currentLoader: ILoaderAny | ILoaderAny[] | null | undefined): ILoaderAny | ILoaderAny[] | null {
		if (!parentLoader) return currentLoader || null;
		if (!currentLoader) return parentLoader;

		// Convert single loaders to arrays
		const parentLoaders = Array.isArray(parentLoader) ? parentLoader : [parentLoader];
		const currentLoaders = Array.isArray(currentLoader) ? currentLoader : [currentLoader];

		// Merge arrays
		return [...parentLoaders, ...currentLoaders];
	}
}