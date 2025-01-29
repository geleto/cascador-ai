// TemplateEngine.ts

import { Environment, PAsyncEnvironment, PAsyncTemplate, Template, compilePAsync, compile } from 'cascada-tmpl';
import { TemplateOnlyConfig } from './types';

class TemplateError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'TemplateError';
		this.cause = cause;
	}
}

export class TemplateEngine<TConfig extends Partial<TemplateOnlyConfig>> {
	protected env: Environment | PAsyncEnvironment;
	protected templatePromise?: Promise<PAsyncTemplate>;
	protected template?: Template | PAsyncTemplate;
	protected config: TConfig;

	constructor(config: TConfig) {
		this.config = {
			...config,
			promptType: config.promptType ?? 'async-template'
		};

		// Runtime validation of loader requirement
		if (
			(this.config.promptType === 'template-name' ||
				this.config.promptType === 'async-template-name' ||
				this.config.promptType === undefined) &&
			!this.config.loader
		) {
			throw new TemplateError('A loader is required when promptType is "template-name", "async-template-name", or undefined.');
		}

		// Initialize appropriate environment based on promptType
		try {
			if (this.config.promptType === 'template' || this.config.promptType === 'template-name') {
				this.env = new Environment(this.config.loader ?? null, this.config.options);
			} else {
				this.env = new PAsyncEnvironment(this.config.loader ?? null, this.config.options);
			}

			// Add filters if provided
			if (this.config.filters) {
				for (const [name, filter] of Object.entries(this.config.filters)) {
					if (typeof filter === 'function') {
						this.env.addFilter(name, filter);
					}
				}
			}

			// Initialize template if prompt provided
			if (this.config.prompt) {
				if (this.config.promptType === 'template') {
					this.template = compile(this.config.prompt, this.env as Environment);
				} else if (this.config.promptType === 'template-name') {
					this.template = this.env.getTemplate(this.config.prompt);
				} else if (this.config.promptType === 'async-template') {
					this.template = compilePAsync(this.config.prompt, this.env as PAsyncEnvironment);
				} else if (this.config.promptType === 'async-template-name') {
					this.templatePromise = (this.env as PAsyncEnvironment).getTemplatePAsync(this.config.prompt);
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new TemplateError(`Template initialization failed: ${error.message}`, error);
			}
			throw new TemplateError('Template initialization failed due to an unknown error');
		}
	}

	// Rest of the class implementation remains the same...
}