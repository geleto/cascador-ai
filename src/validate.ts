import { OptionalTemplateConfig, ScriptConfig } from "./types-config";
import type * as TypesConfig from "./types-config";
import { Context } from "./types";

export class ConfigError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'ConfigError';
		this.cause = cause;
	}
}

export function validateBaseConfig(config?: Partial<OptionalTemplateConfig | ScriptConfig>) {
	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object.');
	}

	// A configuration's type (template vs. script) is determined by its INTENT.
	// This intent can be signaled either by providing the content ('prompt' or 'script')
	// or by specifying how content will be handled ('promptType' or 'scriptType').
	const hasTemplateKeys = 'prompt' in config || 'promptType' in config;
	const hasScriptKeys = 'script' in config || 'scriptType' in config;

	// A single configuration cannot be for both templating and scripting.
	if (hasTemplateKeys && hasScriptKeys) {
		throw new ConfigError('Configuration cannot have both template/prompt and script properties. A config must be either for templating or for scripting, not both.');
	}

	// --- Template-specific validation ---
	if (hasTemplateKeys) {
		const templateConfig = config as Partial<TypesConfig.TemplateConfig>;
		if (templateConfig.promptType as string === 'text') {
			// 'text' prompt type is for direct LLM calls and should not be mixed with cascada template engine features.
			if (templateConfig.loader || templateConfig.filters || templateConfig.options) {
				throw new ConfigError("'text' promptType cannot be used with template engine properties like 'loader', 'filters', or 'options'.");
			}
		} else if (templateConfig.promptType) {
			// For all other named template types (template, async-template, template-name, async-template-name).
			if (!['template', 'async-template', 'template-name', 'async-template-name'].includes(templateConfig.promptType)) {
				throw new ConfigError(`Invalid promptType: '${templateConfig.promptType}'. Valid options are 'template', 'async-template', 'template-name', 'async-template-name'.`);
			}
			// If the user intends to load a template by name, a loader must be provided.
			if ((templateConfig.promptType === 'template-name' || templateConfig.promptType === 'async-template-name') && !templateConfig.loader) {
				throw new ConfigError(`The promptType '${templateConfig.promptType}' requires a 'loader' to be configured to load the template by name.`);
			}
		}
	}

	// --- Script-specific validation ---
	if (hasScriptKeys) {
		const scriptConfig = config as Partial<ScriptConfig>;
		if (scriptConfig.scriptType) {
			if (!['script', 'async-script', 'script-name', 'async-script-name'].includes(scriptConfig.scriptType)) {
				throw new ConfigError(`Invalid scriptType: '${scriptConfig.scriptType}'. Valid options are 'script', 'async-script', 'script-name', 'async-script-name'.`);
			}
			// If the user intends to load a script by name, a loader must be provided.
			if ((scriptConfig.scriptType === 'script-name' || scriptConfig.scriptType === 'async-script-name') && !scriptConfig.loader) {
				throw new ConfigError(`The scriptType '${scriptConfig.scriptType}' requires a 'loader' to be configured to load the script by name.`);
			}
		}
	}

	// --- Shared validation for Cascada-based configs (templates and scripts) ---
	if ('filters' in config && config.filters) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (typeof config.filters !== 'object' || config.filters === null || Array.isArray(config.filters)) {
			throw new ConfigError("'filters' must be a record object of filter functions.");
		}
		for (const [name, filter] of Object.entries(config.filters)) {
			if (typeof filter !== 'function') {
				throw new ConfigError(`Filter '${name}' must be a function.`);
			}
		}
	}
}

export function validateCall(config: Record<string, any>, promptOrContext?: Context | string, maybeContext?: Context) {
	// Debug output if config.debug is true
	if ('debug' in config && config.debug) {
		console.log('[DEBUG] validateCall called with:', { config: JSON.stringify(config, null, 2), promptOrContext, maybeContext });
	}

	if (maybeContext) {
		if (typeof promptOrContext !== 'string') {
			throw new ConfigError('First argument must be string when providing context');
		}
		if (typeof maybeContext !== 'object') {
			throw new ConfigError('Second argument must be an object');
		}
		return;
	}

	if (!promptOrContext) {
		if (!('prompt' in config)) {
			throw new ConfigError('Either prompt argument or config.prompt/messages required');
		}
		return;
	}

	if (typeof promptOrContext !== 'string' && (typeof promptOrContext !== 'object')) {
		throw new ConfigError('Single argument must be string or object');
	}
}

export function validateObjectConfig(config?: Record<string, any>, isStream = false) {
	// Debug output if config.debug is true
	if (config && 'debug' in config && config.debug) {
		console.log('[DEBUG] validateObjectConfig called with:', { config: JSON.stringify(config, null, 2), isStream });
	}

	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object');
	}

	// The 'output' property defaults to 'object' if not specified or is undefined.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const outputType = config.output ?? 'object';

	if (!('model' in config)) {
		throw new ConfigError('Object config requires model');
	}

	switch (outputType) {
		case 'object':
		case 'array':
			if (!('schema' in config)) {
				throw new ConfigError(`${outputType as string} output requires schema`);
			}
			break;
		case 'enum':
			if (!isStream) {
				if (!('enum' in config) || !Array.isArray(config.enum) || config.enum.length === 0) {
					throw new ConfigError('enum output requires non-empty enum array');
				}
			} else {
				throw new ConfigError('Stream does not support enum output');
			}
			break;
		case 'no-schema':
			if ('schema' in config || (!isStream && 'enum' in config)) {
				throw new ConfigError('no-schema output cannot have schema' + (!isStream ? ' or enum' : ''));
			}
			break;
		default:
			throw new ConfigError(`Invalid output type: '${String(outputType)}'`);
	}
}