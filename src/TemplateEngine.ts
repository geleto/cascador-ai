// TemplateEngine.ts
import { PAsyncEnvironment, PAsyncTemplate, compilePAsync } from 'cascada-tmpl';
import { Context, TemplateConfig } from './types';
import { Config } from './Config';

/**
 * @requires ES2017 (ES8) - For async function support
 */
function isAsync(fn: Function): boolean {
	if (typeof fn !== 'function') {
		throw new TypeError('Expected a function');
	}
	// Most reliable detection across all ES2017+ environments
	return Object.prototype.toString.call(fn) === '[object AsyncFunction]';
}

export class TemplateEngine extends Config {
	protected env: PAsyncEnvironment;
	protected templatePromise?: Promise<PAsyncTemplate>;
	protected template?: PAsyncTemplate;

	constructor(config: TemplateConfig, parent?: Config) {
		super(config, parent);

		// Validate configuration
		if (config.promptName && !config.loader) {
			throw new Error('Loader is required when using promptName');
		}

		if (!config.prompt && !config.promptName) {
			throw new Error('Either prompt or promptName must be specified');
		}

		// Initialize environment
		this.env = new PAsyncEnvironment(this.config.loader || null, this.config.options);

		// Add filters with proper type checking
		if (this.config.filters) {
			for (const [name, filter] of Object.entries(this.config.filters)) {
				//todo - get rid of addFilterPAsync in cascada and handle async filters properly in addFilter
				if (isAsync(filter)) {
					this.env.addFilterPAsync(name, filter);
				} else if (typeof filter === 'function') {
					this.env.addFilter(name, filter);
				} else {
					throw new Error(`Invalid filter type for ${name}`);
				}
			}
		}

		// Handle template compilation with proper prioritization
		if (this.config.prompt) {
			this.template = compilePAsync(this.config.prompt, this.env);
		} else if (this.config.promptName) {
			this.templatePromise = this.env.getTemplatePAsync(this.config.promptName);
		}
	}

	async call(promptOrConfig?: string | Partial<TemplateConfig>, context?: Context): Promise<string> {
		try {
			// If user passed a string prompt
			if (typeof promptOrConfig === 'string') {
				return this.render(promptOrConfig, context);
			}

			// If user passed an object
			if (promptOrConfig && typeof promptOrConfig === 'object') {
				const newConfig = Config.mergeConfig(this.config, promptOrConfig);
				return this.render(newConfig.prompt, newConfig.context);
			}

			// If nothing passed
			return this.render(undefined, context);
		} catch (error: any) {
			const errorMessage = `Template rendering failed: ${error?.message || 'Unknown error'}`;
			const fullError = new Error(errorMessage, { cause: error });
			fullError.stack = `${fullError.stack}\nCaused By:\n${error.stack || ''}`;
			throw fullError;
		}
	}

	//@todo - implement proper caching
	//maybe store the last prompt and re-compile only if it changes
	//or store cache by prompt name, have a look at the cascada cache implementation
	protected async render(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
		try {
			if (this.templatePromise) {
				this.template = await this.templatePromise;
				this.templatePromise = undefined;
			}

			const mergedContext = contextOverride
				? { ...this.config.context, ...contextOverride }
				: this.config.context;

			if (promptOverride) {
				this.template = await compilePAsync(promptOverride, this.env, '', true);
			}

			if (!this.template && this.config.promptName) {
				this.template = await this.env.getTemplatePAsync(this.config.promptName);
			}

			if (!this.template) {
				throw new Error('No template available to render');
			}

			return await this.template.render(mergedContext || {});
		} catch (error: any) {
			throw new Error(`Template rendering failed: ${error?.message || 'Unknown error'}`, { cause: error });
		}
	}
}