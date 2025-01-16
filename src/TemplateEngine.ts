import { PAsyncEnvironment, PAsyncTemplate, compilePAsync } from 'cascada-tmpl';
import { Context, TemplateBaseConfig, TemplateConfig } from './types';
import { ConfigData, mergeConfigs, TemplateConfigData } from './ConfigData';

export interface TemplateCallSignature {
	(promptOrConfig?: string | TemplateBaseConfig, context?: Context): Promise<string>;
	config: TemplateBaseConfig;
}

export class TemplateEngine extends ConfigData {
	protected env: PAsyncEnvironment;
	protected templatePromise?: Promise<PAsyncTemplate>;
	protected template?: PAsyncTemplate;

	constructor(config: TemplateBaseConfig, parent?: TemplateConfigData) {
		super(config, parent);

		// Initialize environment
		this.env = new PAsyncEnvironment(this.config.loader ?? null, this.config.options);

		// Add filters if provided
		if (this.config.filters) {
			for (const [name, filter] of Object.entries(this.config.filters)) {
				if (typeof filter === 'function') {
					this.env.addFilter(name, filter);
				}
			}
		}

		// Handle template compilation
		if (this.config.prompt) {
			this.template = compilePAsync(this.config.prompt, this.env);
		} else if (this.config.promptName) {
			this.templatePromise = this.env.getTemplatePAsync(this.config.promptName);
		}
	}

	async call(promptOrConfig?: string | TemplateConfig, context?: Context): Promise<string> {
		/**
		 * Test with merged
		 // Validate configuration
		if (config.promptName && !config.loader) {
			throw new Error('Loader is required when using promptName');
		}

		if (!config.prompt && !config.promptName) {
			throw new Error('Either prompt or promptName must be specified');
		}
		 */
		try {
			// If user passed a string prompt
			if (typeof promptOrConfig === 'string') {
				return await this.render(promptOrConfig, context);
			}

			// If user passed an object
			if (promptOrConfig && typeof promptOrConfig === 'object') {
				const newConfig = mergeConfigs(this.config, promptOrConfig);
				return await this.render(newConfig.prompt, context);
			}

			// If nothing passed
			return await this.render(undefined, context);
		} catch (error: any) {
			const errorMessage = 'Template rendering failed: ' +
				(error instanceof Error ? error.message : 'Unknown error');

			const err = new Error(errorMessage, { cause: error });
			if (error instanceof Error) {
				err.stack = error.stack;
			}
			throw err;
		}
	}

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
				this.template = compilePAsync(promptOverride, this.env);
			}

			if (!this.template && this.config.promptName) {
				this.template = await this.env.getTemplatePAsync(this.config.promptName);
			}

			if (!this.template) {
				throw new Error('No template available to render');
			}

			return await this.template.render(mergedContext ?? {});
		} catch (error: any) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Template rendering failed: ${errorMessage}`, { cause: error });
		}
	}
}