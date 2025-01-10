import { PAsyncEnvironment, PAsyncTemplate, compilePAsync } from 'cascada-tmpl';
import { Context, TemplateConfig } from './types';
import { Config } from './Config';

/**
 * TemplateRendererBase class that can be called as a function in two ways:
 *
 * 1. With a string prompt and optional context:
 *    await renderer('Hello {{ name }}', { name: 'World' })
 *
 * 2. With a config override object:
 *    await renderer({ context: { name: 'World' } })
 */
export abstract class TemplateRendererBase extends Config {
	protected env: PAsyncEnvironment;
	protected templatePromise?: Promise<PAsyncTemplate>;
	protected template?: PAsyncTemplate;

	constructor(config: TemplateConfig) {
		super(config);

		// Initialize environment
		this.env = new PAsyncEnvironment(this.config.loader || null);

		// Add filters
		if (this.config.filters) {
			for (const [name, filter] of Object.entries(this.config.filters)) {
				if (filter.constructor.name === 'AsyncFunction') {
					this.env.addFilterPAsync(name, filter);
				} else {
					this.env.addFilter(name, filter);
				}
			}
		}

		// Compile template if prompt is provided
		if (this.config.prompt) {
			this.template = compilePAsync(this.config.prompt, this.env);
			//todo if promptName - save the template to the cache
		} else {
			if (!this.config.promptName) {
				throw new Error('TemplateRendererBase requires a prompt or promptName to be specified');
			}
			if (!this.config.loader) {
				throw new Error('TemplateRendererBase requires a loader to be specified when using promptName');
			}
			this.templatePromise = this.env.getTemplatePAsync(this.config.promptName);
		}
	}

	protected async render(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
		if (this.templatePromise) {
			this.template = await this.templatePromise;
			this.templatePromise = undefined;
		}
		const context = contextOverride ?
			{ ...this.config.context, ...contextOverride } :
			this.config.context;

		// If prompt override provided, compile new template
		if (promptOverride) {
			this.template = await compilePAsync(promptOverride, this.env, '', true);
		}

		// If we have a promptName, load and compile that template
		if (this.config.promptName && !this.template) {
			this.template = await this.env.getTemplate(this.config.promptName, true);
		}

		if (!this.template) {
			throw new Error('No template available to render');
		}

		// Render template with context
		return await this.template.render(context || {});
	}
}