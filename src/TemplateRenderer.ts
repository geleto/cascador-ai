import {
	PAsyncEnvironment,
	PAsyncTemplate,
	compilePAsync,
} from 'cascada-tmpl';

import {
	Context,
	CommonConfig,
} from './types';

import { Config } from './Config';

export class TemplateRenderer<TConfig extends CommonConfig = CommonConfig, TResult = string> extends Config {
	protected env: PAsyncEnvironment;
	protected template?: PAsyncTemplate;

	constructor(config: TConfig) {
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
		if (config.prompt) {
			this.template = compilePAsync(config.prompt, this.env, '', true);
		}
	}

	protected async render(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
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
		return this.template.render(context || {});
	}

	async(promptOrConfig?: string | Partial<TConfig>, context?: Context): Promise<TResult> {
		if (typeof promptOrConfig === 'string') {
			return this.render(promptOrConfig, context) as unknown as Promise<TResult>;
		}

		if (promptOrConfig && typeof promptOrConfig === 'object') {
			const tempRenderer = new TemplateRenderer({
				...this.config,
				...promptOrConfig,
			} as TConfig);
			return tempRenderer.render() as unknown as Promise<TResult>;
		}

		return this.render() as unknown as Promise<TResult>;
	}
}