import { GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig, OptionalTemplateConfig, Context } from "./types";

type ObjectConfigUnion = GenerateObjectObjectConfig<unknown> | GenerateObjectArrayConfig<unknown> | GenerateObjectEnumConfig<string> | GenerateObjectNoSchemaConfig;

export class ConfigError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = 'ConfigError';
		this.cause = cause;
	}
}

export function validateBaseConfig(config?: Partial<OptionalTemplateConfig>) {
	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object');
	}

	if (config.promptType as string === 'text' && ('loader' in config || 'filters' in config || 'options' in config)) {
		throw new ConfigError('Text promptType cannot have template properties');
	}

	if ((config.promptType === 'template-name' || config.promptType === 'async-template-name') && !('loader' in config)) {
		throw new ConfigError('Template name types require a loader');
	}

	if ('filters' in config) {
		for (const [name, filter] of Object.entries(config.filters ?? {})) {
			if (typeof filter !== 'function') {
				throw new ConfigError(`Filter ${name} must be a function`);
			}
		}
	}
}

export function validateCall(config: Record<string, any>, promptOrContext?: Context | string, maybeContext?: Context) {
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
		if (!('prompt' in config || 'messages' in config)) {
			throw new ConfigError('Either prompt argument or config.prompt/messages required');
		}
		return;
	}

	if (typeof promptOrContext !== 'string' && (typeof promptOrContext !== 'object')) {
		throw new ConfigError('Single argument must be string or object');
	}
}

export function validateObjectConfig(config?: Record<string, any>, isStream = false) {
	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object');
	}

	const objConfig = config as ObjectConfigUnion;

	if (!('output' in config)) {
		throw new ConfigError('Object config requires output type');
	}

	if (!('model' in config)) {
		throw new ConfigError('Object config requires model');
	}

	switch (objConfig.output) {
		case 'object':
		case 'array':
			if (!('schema' in config)) {
				throw new ConfigError(`${objConfig.output} output requires schema`);
			}
			break;
		case 'enum':
			if (!isStream) {
				if (!('enum' in config) || !Array.isArray(objConfig.enum) || objConfig.enum.length === 0) {
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
			throw new ConfigError('Invalid output type');
	}
}