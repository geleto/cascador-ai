import { PAsyncEnvironment, PAsyncTemplate, compilePAsync } from 'cascada-tmpl';
import { Context, TemplateConfig } from './types';
import { TemplateRendererBase } from './TemplateRendererBase';

/**
 * TemplateRenderer class that can be called as a function in two ways:
 *
 * 1. With a string prompt and optional context:
 *    await renderer('Hello {{ name }}', { name: 'World' })
 *
 * 2. With a config override object:
 *    await renderer({ context: { name: 'World' } })
 */
export class TemplateRenderer extends TemplateRendererBase {

	constructor(config: TemplateConfig) {
		super(config);
	}

	async(promptOrConfig?: string | Partial<TemplateConfig>, context?: Context): Promise<string> {
		if (typeof promptOrConfig === 'string') {
			return this.render(promptOrConfig, context);
		}

		if (promptOrConfig && typeof promptOrConfig === 'object') {
			const tempRenderer = new TemplateRenderer({
				...this.config,
				...promptOrConfig,
			});
			return tempRenderer.render();
		}

		return this.render();
	}
}