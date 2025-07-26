import cascada from 'cascada-engine';
import { z } from 'zod';
import { Context, SchemaType } from './types';
import { ScriptConfig } from './types-config';
import * as results from './types-result';
import { JSONValue } from 'ai';

class ScriptError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'ScriptError';
		this.cause = cause;
	}
}

export class ScriptEngine<TConfig extends Partial<ScriptConfig<OBJECT>>, OBJECT> {
	protected env: cascada.Environment | cascada.AsyncEnvironment;
	protected scriptPromise?: Promise<cascada.Script | cascada.AsyncScript>;
	protected script?: cascada.Script | cascada.AsyncScript;
	protected config: TConfig;

	constructor(config: TConfig) {
		this.config = {
			...config,
			scriptType: config.scriptType ?? 'async-script'
		} as TConfig;

		// Debug output if config.debug is true
		if ('debug' in this.config && this.config.debug) {
			console.log('[DEBUG] ScriptEngine constructor called with config:', JSON.stringify(this.config, null, 2));
		}

		// Runtime validation of loader requirement
		if (
			(this.config.scriptType === 'script-name' ||
				this.config.scriptType === 'async-script-name') &&
			!('loader' in this.config) && !this.config.loader
		) {
			throw new ScriptError('A loader is required when scriptType is "script-name" or "async-script-name".');
		}

		// Initialize appropriate environment based on scriptType
		try {
			if (this.config.scriptType === 'script' || this.config.scriptType === 'script-name') {
				this.env = new cascada.Environment(
					('loader' in this.config ? this.config.loader : null) ?? null,
					('options' in this.config ? this.config.options : undefined)
				);
			} else {
				this.env = new cascada.AsyncEnvironment(
					('loader' in this.config ? this.config.loader : null) ?? null,
					('options' in this.config ? this.config.options : undefined)
				);
			}

			// Add filters if provided
			if ('filters' in this.config && this.config.filters) {
				for (const [name, filter] of Object.entries(this.config.filters)) {
					if (typeof filter === 'function') {
						this.env.addFilter(name, filter as (...args: any[]) => any);
					}
				}
			}

			// Initialize script if script provided
			if ('script' in this.config && this.config.script) {
				if (this.config.scriptType === 'script') {
					this.script = cascada.compileScript(this.config.script, this.env as cascada.Environment);
				} else if (this.config.scriptType === 'script-name') {
					if (!this.config.script) {
						throw new ScriptError('Script is required when scriptType is "script-name"');
					}
					// the sync script API uses callback, promisify
					this.scriptPromise = new Promise((resolve, reject) => {
						(this.env as cascada.Environment).getScript(this.config.script!, (err: Error | null, script) => {
							if (err) {
								reject(err);
							} else if (script) {
								resolve(script);
							} else {
								reject(new ScriptError('getScript returned null script'));
							}
						});
					});
				} else if (this.config.scriptType === 'async-script') {
					this.script = cascada.compileScriptAsync(this.config.script, this.env as cascada.AsyncEnvironment);
				} else if (this.config.scriptType === 'async-script-name') {
					this.scriptPromise = (this.env as cascada.AsyncEnvironment).getScript(this.config.script);
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new ScriptError(`Script initialization failed: ${error.message}`, error);
			}
			throw new ScriptError('Script initialization failed due to an unknown error');
		}
	}

	async run(
		scriptOverride?: string,
		contextOverride?: Context
	): Promise<TConfig extends { schema: SchemaType<OBJECT> } ? OBJECT : results.ScriptResult> {
		// Debug output if config.debug is true
		if ('debug' in this.config && this.config.debug) {
			console.log('[DEBUG] ScriptEngine.run called with:', { scriptOverride, contextOverride });
		}

		// Runtime check for missing script
		if (!scriptOverride && !('script' in this.config) && !('script' in this.config && this.config.script)) {
			throw new ScriptError('No script provided. Either provide a script in the configuration or as a call argument.');
		}

		let rawResult: Record<string, any> | string | null;

		try {
			const mergedContext = contextOverride
				? { ...('context' in this.config ? this.config.context : {}) ?? {}, ...contextOverride }
				: ('context' in this.config ? this.config.context : {}) ?? {};

			if ('debug' in this.config && this.config.debug) {
				console.log('[DEBUG] ScriptEngine.run - merged context:', mergedContext);
			}

			// If we have a script override, use renderScript[String] directly
			if (scriptOverride) {
				if (this.env instanceof cascada.AsyncEnvironment) {
					const result = await this.env.renderScriptString(scriptOverride, mergedContext);
					if ('debug' in this.config && this.config.debug) {
						console.log('[DEBUG] ScriptEngine.run - async renderScriptString result:', result);
					}
					rawResult = result;
				} else {
					const result = await new Promise<Record<string, any> | string | null>((resolve, reject) => {
						const env = this.env as cascada.Environment;
						try {
							env.renderScriptString(scriptOverride, mergedContext, (err: Error | null, res: string | Record<string, any> | null) => {
								if (err) {
									reject(err);
								} else if (res !== null) {
									resolve(res);
								} else {
									reject(new ScriptError('Script render returned null result'));
								}
							});
						} catch (error) {
							reject(new Error(error instanceof Error ? error.message : String(error)));
						}
					});
					if ('debug' in this.config && this.config.debug) {
						console.log('[DEBUG] ScriptEngine.run - sync renderScriptString result:', result);
					}
					rawResult = result;
				}
			} else {
				// Otherwise use the compiled script
				if (!this.script && this.scriptPromise) {
					this.script = await this.scriptPromise;
					this.scriptPromise = undefined;
				}

				if (!this.script) {
					throw new ScriptError('No script available to render');
				}

				if (this.script instanceof cascada.Script) {
					const script = this.script;
					const result = await new Promise<Record<string, any> | string | null>((resolve, reject) => {
						try {
							script.render(mergedContext, (err: Error | null, res: string | Record<string, any> | null) => {
								if (err) {
									reject(err);
								} else if (res !== null) {
									resolve(res);
								} else {
									reject(new ScriptError('Script render returned null result'));
								}
							});
						} catch (error) {
							reject(error instanceof Error ? error : new Error(String(error)));
						}
					});
					if ('debug' in this.config && this.config.debug) {
						console.log('[DEBUG] ScriptEngine.run - sync script result:', result);
					}
					rawResult = result;
				} else {
					const result = await this.script.render(mergedContext);
					if ('debug' in this.config && this.config.debug) {
						console.log('[DEBUG] ScriptEngine.run - async script result:', result);
					}
					rawResult = result;
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new ScriptError(`Script render failed: ${error.message}`, error);
			} else if (typeof error === 'string') {
				throw new ScriptError(`Script render failed: ${error}`);
			}
			throw new ScriptError('Script render failed due to an unknown error');
		}

		const schema: SchemaType<OBJECT> | undefined = 'schema' in this.config ? this.config.schema : undefined;

		if (schema) {
			// Check if it's a Zod schema (has parse method)
			if ('parse' in schema && typeof schema.parse === 'function') {
				try {
					const validatedResult = (schema as z.Schema<OBJECT>).parse(rawResult);
					if ('debug' in this.config && this.config.debug) {
						console.log('[DEBUG] ScriptEngine.run - Zod validation successful:', validatedResult);
					}
					return validatedResult as (TConfig extends { schema: SchemaType<OBJECT> } ? OBJECT : JSONValue);
				} catch (error) {
					if (error instanceof z.ZodError) {
						throw new ScriptError(`Script output validation failed: ${error.message}`, error);
					}
					// Re-throw other, unexpected errors
					throw error;
				}
			}
			// Check if it's a Vercel AI Schema (has validate method)
			else if ('validate' in schema && typeof schema.validate === 'function') {
				try {
					// Type assertion to access the validate method safely
					const vercelSchema = schema as { validate: (value: unknown) => { success: true; value: OBJECT } | { success: false; error: Error } };
					const validationResult = vercelSchema.validate(rawResult);
					if (validationResult.success) {
						if ('debug' in this.config && this.config.debug) {
							console.log('[DEBUG] ScriptEngine.run - Vercel Schema validation successful:', validationResult.value);
						}
						return validationResult.value as TConfig extends { schema: SchemaType<OBJECT> } ? OBJECT : results.ScriptResult;
					} else {
						throw new ScriptError(`Script output validation failed: ${validationResult.error.message}`, validationResult.error);
					}
				} catch (error) {
					if (error instanceof ScriptError) {
						throw error;
					}
					throw new ScriptError(`Script output validation failed: ${error instanceof Error ? error.message : 'Unknown validation error'}`, error instanceof Error ? error : undefined);
				}
			} else if ('debug' in this.config && this.config.debug) {
				// Warn if a schema was provided but we can't do anything with it.
				console.warn('[DEBUG] ScriptEngine.run - a schema was provided, but it is not a Zod schema or Vercel Schema. Skipping validation.');
			}
		}

		return rawResult as TConfig extends { schema: SchemaType<OBJECT> } ? OBJECT : results.ScriptResult;
	}
}