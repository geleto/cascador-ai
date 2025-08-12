import { ModelMessage } from "ai";
import type * as TypesConfig from "./types/config";
import { Context } from "./types/types";
import { extractCallArguments } from './llm';

export class ConfigError extends Error {
	cause?: Error;
	name: string;
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'ConfigError';
		if (cause) {
			this.cause = cause;
		}
	}
}

//@todo - this needs some work
export function validateBaseConfig(config?: Record<string, any>) {
	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object.');
	}

	// A configuration's type (template vs. script) is determined by its INTENT.
	// This intent can be signaled either by providing the content ('prompt' or 'script')
	// or by specifying how content will be handled ('promptType').
	const hasTemplateKeys = 'template' in config;
	const hasScriptKeys = 'script' in config;

	// A single configuration cannot be for both templating and scripting.
	if (hasTemplateKeys && hasScriptKeys) {
		throw new ConfigError('Configuration cannot have both template/prompt and script properties. A config must be either for templating or for scripting, not both.');
	}
	if (config.promptType as string === 'text') {
		// 'text' prompt type is for direct LLM calls and should not be mixed with cascada template engine features.
		if (config.loader || config.filters || config.options) {
			throw new ConfigError("'text' promptType cannot be used with template engine properties like 'loader', 'filters', or 'options'.");
		}
	} else if (config.promptType) {
		// For all other named template types (template, async-template, template-name, async-template-name).
		if (!['template', 'async-template', 'template-name', 'async-template-name',
			'script', 'async-script', 'script-name', 'async-script-name'
		].includes(config.promptType as string)) {
			throw new ConfigError(`Invalid promptType: '${config.promptType as string}'. Valid options are 'template', 'async-template', 'template-name', 'async-template-name', 'script', 'async-script', 'script-name', 'async-script-name'.`);
		}
		// If the user intends to load a template by name, a loader must be provided.
		if ((config.promptType === 'template-name' || config.promptType === 'async-template-name') && !config.loader) {
			throw new ConfigError(`The promptType '${config.promptType as string}' requires a 'loader' to be configured to load the template by name.`);
		}
	}

	// --- Shared validation for Cascada-based configs (templates and scripts) ---
	if ('filters' in config && config.filters) {

		if (typeof config.filters !== 'object' || config.filters === null || Array.isArray(config.filters)) {
			throw new ConfigError("'filters' must be a record object of filter functions.");
		}
		for (const [name, filter] of Object.entries(config.filters as TypesConfig.CascadaFilter)) {
			if (typeof filter !== 'function') {
				throw new ConfigError(`Filter '${name}' must be a function.`);
			}
		}
	}
}

// export function validateCall(config: Record<string, any>, promptOrContext?: Context | string, maybeContext?: Context) {
export function validateCall(config: Record<string, any>, promptOrMessageOrContext?: string | ModelMessage[] | Context, contextOrMessages?: ModelMessage[] | Context, maybeContext?: Context) {
	// Debug output if config.debug is true
	if ('debug' in config && config.debug) {
		console.log('[DEBUG] validateCall called with:', { config: JSON.stringify(config, null, 2), promptOrMessageOrContext, contextOrMessages, maybeContext });
	}

	// Determine mode
	const isTemplateOrScript = (config.promptType !== 'text' && config.promptType !== undefined);

	// 1) Extract from arguments via helper (with duplicate detection)
	let promptFromArgs: string | undefined;
	let messagesFromArgs: ModelMessage[] | undefined;
	let contextFromArgs: Context | undefined;
	try {
		({ prompt: promptFromArgs, messages: messagesFromArgs, context: contextFromArgs } = extractCallArguments(promptOrMessageOrContext, contextOrMessages, maybeContext));
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Invalid arguments';
		throw new ConfigError(message);
	}
	void contextFromArgs;

	// 2) Merge with config defaults
	const promptFromConfig: string | undefined = (typeof (config as Record<string, unknown>).prompt === 'string' && (config as Record<string, string>).prompt.length > 0)
		? (config as Record<string, string>).prompt
		: undefined;
	const messagesFromConfig: ModelMessage[] | undefined = Array.isArray((config as Record<string, unknown>).messages)
		? (config as Record<string, unknown>).messages as ModelMessage[]
		: undefined;

	const prompt: string | undefined = promptFromArgs ?? promptFromConfig;
	const messages: ModelMessage[] | undefined = messagesFromArgs ?? messagesFromConfig;

	// 3) Apply rules
	if (isTemplateOrScript) {
		// PROMPT REQUIRED; messages optional
		if (!prompt) {
			throw new ConfigError('Prompt is required when promptType is not "text".');
		}
		return;
	}

	// TEXT MODE: require either prompt or messages
	const hasPrompt = typeof prompt === 'string' && prompt.length > 0;
	const hasMessages = Array.isArray(messages) && messages.length > 0;
	if (!hasPrompt && !hasMessages) {
		throw new ConfigError('Either prompt or messages must be provided (via arguments or config).');
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
		throw new ConfigError('Object config requires a \'model\' property');
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