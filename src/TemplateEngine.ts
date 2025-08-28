import * as cascada from 'cascada-engine';
import { Context } from './types/types';
import { TemplateConfig } from './types/config';

class TemplateError extends Error {
	cause?: Error;
	name: string;
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'TemplateError';
		this.cause = cause;
	}
}

export class TemplateEngine<
	TConfig extends TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
> {
	protected env: cascada.Environment | cascada.AsyncEnvironment;
	protected templatePromise?: Promise<cascada.Template | cascada.AsyncTemplate>;
	protected template?: cascada.Template | cascada.AsyncTemplate;
	protected config: TConfig;

	constructor(config: TConfig) {
		this.config = {
			...config,
			promptType: config.promptType ?? 'async-template'
		};

		// Debug output if config.debug is true
		if ('debug' in this.config && this.config.debug) {
			console.log('[DEBUG] TemplateEngine constructor called with config:', JSON.stringify(this.config, null, 2));
		}

		// Runtime validation of loader requirement
		if (
			(this.config.promptType === 'template-name' ||
				this.config.promptType === 'async-template-name') &&
			!this.config.loader
		) {
			throw new TemplateError('A loader is required when promptType is "template-name" or "async-template-name".');
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
			if (this.config.template) {
				if (this.config.promptType === 'template') {
					this.template = cascada.compileTemplate(this.config.template, this.env as cascada.Environment);
				} else if (this.config.promptType === 'template-name') {
					if (!this.config.template) {
						throw new TemplateError('Prompt is required when promptType is "template-name"');
					}
					// the sync template API uses callback, promisify
					this.templatePromise = new Promise((resolve, reject) => {
						(this.env as cascada.Environment).getTemplate(this.config.template, (err, template) => {
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
					this.template = cascada.compileTemplateAsync(this.config.template, this.env as cascada.AsyncEnvironment);
				} else if (this.config.promptType === 'async-template-name') {
					this.templatePromise = (this.env as cascada.AsyncEnvironment).getTemplate(this.config.template);
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
		// Debug output if config.debug is true
		if ('debug' in this.config && this.config.debug) {
			console.log('[DEBUG] TemplateEngine.render called with:', { promptOverride, contextOverride });
		}

		// Runtime check for missing prompt
		if (!promptOverride && !this.config.template) {
			throw new TemplateError('No template prompt provided. Either provide a prompt in the configuration or as a call argument.');
		}

		try {
			const mergedContext = contextOverride
				? { ...this.config.context ?? {}, ...contextOverride }
				: this.config.context ?? {};

			if ('debug' in this.config && this.config.debug) {
				console.log('[DEBUG] TemplateEngine.render - merged context:', mergedContext);
			}

			// If we have a prompt override, use renderTemplate[String] directly
			if (promptOverride) {
				if (this.env instanceof cascada.AsyncEnvironment) {
					let result: string;
					if (this.config.promptType === 'async-template-name') {
						result = await this.env.renderTemplate(promptOverride, mergedContext);//@todo - can it return null?
						if ('debug' in this.config && this.config.debug) {
							console.log('[DEBUG] TemplateEngine.render - named async renderTemplate result:', result);
						}
					} else {
						result = await this.env.renderTemplateString(promptOverride, mergedContext);
						if ('debug' in this.config && this.config.debug) {
							console.log('[DEBUG] TemplateEngine.render - async renderTemplateString result:', result);
						}
					}
					return result;
				}
				const result = await new Promise<string>((resolve, reject) => {
					const env = this.env as cascada.Environment;
					try {
						if (this.config.promptType === 'template-name') {
							env.renderTemplate(promptOverride, mergedContext, (err: Error | null, res: string | null) => {
								if (err) {
									reject(err);
								} else if (res !== null) {
									if ('debug' in this.config && this.config.debug) {
										console.log('[DEBUG] TemplateEngine.render - sync renderTemplateString result:', result);
									}
									resolve(res);
								} else {
									reject(new TemplateError('Named sync template render returned null result'));
								}
							});
						} else {
							env.renderTemplateString(promptOverride, mergedContext, (err: Error | null, res: string | null) => {
								if (err) {
									reject(err);
								} else if (res !== null) {
									if ('debug' in this.config && this.config.debug) {
										console.log('[DEBUG] TemplateEngine.render - sync renderTemplateString result:', result);
									}
									resolve(res);
								} else {
									reject(new TemplateError('Template sync render returned null result'));
								}
							});
						}
					} catch (error) {
						reject(new Error(error instanceof Error ? error.message : String(error)));
					}
				});
				return result;
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
				const result = await new Promise<string>((resolve, reject) => {
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
				if ('debug' in this.config && this.config.debug) {
					console.log('[DEBUG] TemplateEngine.render - sync template result:', result);
				}
				return result;
			}

			const result = await this.template.render(mergedContext);
			if ('debug' in this.config && this.config.debug) {
				console.log('[DEBUG] TemplateEngine.render - async template result:', result);
			}
			return result;
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