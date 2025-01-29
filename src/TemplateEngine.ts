// TemplateEngine.ts

import { Environment, PAsyncEnvironment, PAsyncTemplate, Template, compilePAsync, compile } from 'cascada-tmpl';
import { Context, TemplateOnlyConfig } from './types';

export interface TemplateCallSignature<TConfig extends TemplateOnlyConfig> {
	(promptOrContext?: string | Context, context?: Context): Promise<string>;
	config: TConfig;
}

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



	// Overloaded call methods with proper type checking
	call(context?: Context): TConfig extends { prompt: string } ? Promise<string> : never;
	call(prompt: string, context?: Context): Promise<string>;
	async call(
		promptOrContext?: string | Context,
		maybeContext?: Context
	): Promise<string> {
		const prompt = typeof promptOrContext === 'string' ? promptOrContext : undefined;
		const context = typeof promptOrContext === 'string' ? maybeContext : promptOrContext;

		// Runtime check for missing prompt
		if (!prompt && !this.config.prompt) {
			throw new TemplateError('No template prompt provided. Either provide a prompt in the configuration or as a call argument.');
		}

		return this.render(prompt, context);
	}

	protected async render(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
		try {
			const mergedContext = contextOverride
				? { ...this.config.context ?? {}, ...contextOverride }
				: this.config.context ?? {};

			// If we have a prompt override, use renderString directly
			if (promptOverride) {
				if (this.env instanceof PAsyncEnvironment) {
					return await this.env.renderString(promptOverride, mergedContext);
				}
				return await new Promise((resolve, reject) => {
					const env = this.env as Environment;
					try {
						env.renderString(promptOverride, mergedContext, (err: Error | null, res: string | null) => {
							if (err) {
								reject(err);
							} else if (res !== null) {
								resolve(res);
							} else {
								reject(new TemplateError('Template render returned null result'));
							}
						});
					} catch (error) {
						reject(new Error(error instanceof Error ? error.message : String(error)));
					}
				});
			}

			// Otherwise use the compiled template
			if (!this.template && this.templatePromise) {
				this.template = await this.templatePromise;
				this.templatePromise = undefined;
			}

			if (!this.template) {
				throw new TemplateError('No template available to render');
			}

			if (this.template instanceof Template) {
				const template = this.template;
				return await new Promise((resolve, reject) => {
					try {
						template.render(mergedContext, (err: Error | null, res: string | null) => {
							if (err) {
								reject(err);
							} else if (res !== null) {
								resolve(res);
							} else {
								reject(new TemplateError('Template render returned null result'));
							}
						});
					} catch (error) {
						reject(error instanceof Error ? error : new Error(String(error)));
					}
				});
			}

			return await this.template.render(mergedContext);
		} catch (error) {
			if (error instanceof Error) {
				throw new TemplateError(`Template render failed: ${error.message}`, error);
			} else if (typeof error === 'string') {
				throw new TemplateError(`Template render failed: ${error}`);
			}
			throw new TemplateError('Template render failed due to an unknown error');
		}
	}
}