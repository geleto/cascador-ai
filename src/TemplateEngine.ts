// TemplateEngine.ts

import cascada from 'cascada-engine';
import { Context, TemplateConfig } from './types';

class TemplateError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'TemplateError';
		this.cause = cause;
	}
}

export class TemplateEngine<TConfig extends Partial<TemplateConfig>> {
	protected env: cascada.Environment | cascada.AsyncEnvironment;
	protected templatePromise?: Promise<cascada.Template | cascada.AsyncTemplate>;
	protected template?: cascada.Template | cascada.AsyncTemplate;
	protected config: TConfig;

	constructor(config: TConfig) {
		this.config = {
			...config,
			promptType: config.promptType ?? 'async-template'
		};

		// Runtime validation of loader requirement
		if (
			(this.config.promptType === 'template-name' ||
				this.config.promptType === 'async-template-name') &&
			!this.config.loader
		) {
			throw new TemplateError('A loader is required when promptType is "template-name", "async-template-name", or undefined.');
		}

		// Initialize appropriate environment based on promptType
		try {
			if (this.config.promptType === 'template' || this.config.promptType === 'template-name') {
				this.env = new cascada.Environment(this.config.loader ?? null, this.config.options);
			} else {
				this.env = new cascada.AsyncEnvironment(this.config.loader ?? null, this.config.options);
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
					this.template = cascada.compileTemplate(this.config.prompt, this.env as cascada.Environment);
				} else if (this.config.promptType === 'template-name') {
					if (!this.config.prompt) {
						throw new TemplateError('Prompt is required when promptType is "template-name"');
					}
					// the sync template API uses callback, promisify
					this.templatePromise = new Promise((resolve, reject) => {
						(this.env as cascada.Environment).getTemplate(this.config.prompt!, (err, template) => {
							if (err) {
								reject(err);
							} else if (template) {
								resolve(template);
							} else {
								reject(new TemplateError('getTemplate returned null template'));
							}
						});
					});
				} else if (this.config.promptType === 'async-template') {
					this.template = cascada.compileTemplateAsync(this.config.prompt, this.env as cascada.AsyncEnvironment);
				} else if (this.config.promptType === 'async-template-name') {
					this.templatePromise = (this.env as cascada.AsyncEnvironment).getTemplate(this.config.prompt);
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new TemplateError(`Template initialization failed: ${error.message}`, error);
			}
			throw new TemplateError('Template initialization failed due to an unknown error');
		}
	}

	async render(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
		// Runtime check for missing prompt
		if (!promptOverride && !this.config.prompt) {
			throw new TemplateError('No template prompt provided. Either provide a prompt in the configuration or as a call argument.');
		}

		try {
			const mergedContext = contextOverride
				? { ...this.config.context ?? {}, ...contextOverride }
				: this.config.context ?? {};

			// If we have a prompt override, use renderString directly
			if (promptOverride) {
				if (this.env instanceof cascada.AsyncEnvironment) {
					return await this.env.renderTemplateString(promptOverride, mergedContext);
				}
				return await new Promise((resolve, reject) => {
					const env = this.env as cascada.Environment;
					try {
						env.renderTemplateString(promptOverride, mergedContext, (err: Error | null, res: string | null) => {
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

			if (this.template instanceof cascada.Template) {
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