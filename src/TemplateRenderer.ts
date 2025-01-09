import {
	PAsyncEnvironment,
	PAsyncTemplate,
	compilePAsync,
} from 'cascada-tmpl';

import {
	Context,
	TemplateConfig,
} from './types';

import { CommonConfig } from './types';
import { Config } from './Config';

/**
 * TemplateRenderer class that can be called as a function in two ways:
 *
 * 1. With a string prompt and optional context:
 *    await renderer('Hello {{ name }}', { name: 'World' })
 *
 * 2. With a config override object:
 *    await renderer({ context: { name: 'World' }, temperature: 0.7 })
 */
export class TemplateRenderer extends Config {
	private env?: PAsyncEnvironment;
	private template?: PAsyncTemplate;

	constructor(config: CommonConfig) {
		// Only skip merging loaders and filters if parent is TemplateRenderer
		const skipMerge = config.parent instanceof TemplateRenderer;
		super(config, !skipMerge);

		// Initialize environment
		this.initializeEnvironment();

		// Compile template if prompt is provided
		if (config.prompt) {
			this.compileTemplate(config.prompt);
		}

		// Make the instance callable
		return new Proxy(this, {
			apply: (target, thisArg, args: [string | Partial<TemplateConfig>, Context?]) => {
				const [promptOrConfig, context] = args;
				if (typeof promptOrConfig === 'string') {
					return target.render(promptOrConfig, context);
				}

				if (promptOrConfig && typeof promptOrConfig === 'object') {
					const tempRenderer = new TemplateRenderer({
						...target.config,
						...promptOrConfig,
					});
					return tempRenderer.render();
				}

				return target.render();
			}
		}) as any;
	}

	private initializeEnvironment() {
		const envConfig = {
			autoescape: true,
			throwOnUndefined: false,
			trimBlocks: true,
			lstripBlocks: true,
		};

		if (this.config.parent instanceof TemplateRenderer) {
			// If parent is TemplateRenderer, use its env as parent
			this.env = new PAsyncEnvironment(
				this.config.loader || null,
				envConfig,
				this.config.parent.env
			);
		} else {
			// Create new environment
			this.env = new PAsyncEnvironment(
				this.config.loader || null,
				envConfig
			);
		}

		// Add current filters
		if (this.config.filters) {
			for (const [name, filter] of Object.entries(this.config.filters)) {
				if (filter.constructor.name === 'AsyncFunction') {
					this.env.addFilterPAsync(name, filter);
				} else {
					this.env.addFilter(name, filter);
				}
			}
		}
	}

	private async compileTemplate(src: string) {
		if (!this.env) {
			throw new Error('Environment not initialized');
		}
		this.template = await compilePAsync(src, this.env, '', true);
	}

	private async render(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
		const context = contextOverride ?
			{ ...this.config.context, ...contextOverride } :
			this.config.context;

		// If prompt override provided, compile new template
		if (promptOverride) {
			await this.compileTemplate(promptOverride);
		}

		// If we have a promptName, load and compile that template
		if (this.config.promptName && !this.template) {
			if (!this.env) {
				throw new Error('Environment not initialized');
			}
			this.template = await this.env.getTemplate(this.config.promptName, true);
		}

		if (!this.template) {
			throw new Error('No template available to render');
		}

		// Render template with context
		return await this.template.render(context || {});
	}
}