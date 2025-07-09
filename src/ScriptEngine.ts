import cascada from 'cascada-engine';
import { Context } from './types';
import { ScriptConfig } from './types-config';

class ScriptError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'ScriptError';
		this.cause = cause;
	}
}

export class ScriptEngine<TConfig extends Partial<ScriptConfig>> {
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
	): Promise<Record<string, any> | string | null> {
		// Debug output if config.debug is true
		if ('debug' in this.config && this.config.debug) {
			console.log('[DEBUG] ScriptEngine.run called with:', { scriptOverride, contextOverride });
		}

		// Runtime check for missing script
		if (!scriptOverride && !('script' in this.config) && !('script' in this.config && this.config.script)) {
			throw new ScriptError('No script provided. Either provide a script in the configuration or as a call argument.');
		}

		try {
			const mergedContext = contextOverride
				? { ...('context' in this.config ? this.config.context : {}) ?? {}, ...contextOverride }
				: ('context' in this.config ? this.config.context : {}) ?? {};

			if ('debug' in this.config && this.config.debug) {
				console.log('[DEBUG] ScriptEngine.run - merged context:', mergedContext);
			}

			// If we have a script override, use renderString directly
			if (scriptOverride) {
				if (this.env instanceof cascada.AsyncEnvironment) {
					const result = await this.env.renderScriptString(scriptOverride, mergedContext);
					if ('debug' in this.config && this.config.debug) {
						console.log('[DEBUG] ScriptEngine.run - async renderScriptString result:', result);
					}
					return result;
				}
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
				return result;
			}

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
				return result;
			}

			const result = await this.script.render(mergedContext);
			if ('debug' in this.config && this.config.debug) {
				console.log('[DEBUG] ScriptEngine.run - async script result:', result);
			}
			return result;
		} catch (error) {
			if (error instanceof Error) {
				throw new ScriptError(`Script render failed: ${error.message}`, error);
			} else if (typeof error === 'string') {
				throw new ScriptError(`Script render failed: ${error}`);
			}
			throw new ScriptError('Script render failed due to an unknown error');
		}
	}
}