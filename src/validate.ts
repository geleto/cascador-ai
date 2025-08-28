import { ModelMessage } from "ai";
import { z, ZodError } from 'zod';
import * as types from './types/types';
import * as configs from './types/config';
import { extractCallArguments } from './factories/llm-renderer';
import { ModelMessageSchema } from "./types/schemas";

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

type AnyTextConfig = configs.GenerateTextConfig<any, any, any> | configs.StreamTextConfig<any, any, any>;
type AnyObjectConfig =
	| configs.GenerateObjectObjectConfig<any, any, any> | configs.GenerateObjectArrayConfig<any, any, any> | configs.GenerateObjectEnumConfig<any, any, any> | configs.GenerateObjectNoSchemaConfig<any, any>
	| configs.StreamObjectObjectConfig<any, any, any> | configs.StreamObjectArrayConfig<any, any, any> | configs.StreamObjectNoSchemaConfig<any, any>;

// --- Helper Functions ---

function formatZodError(error: ZodError): string {
	const issues = error.issues.map(issue => {
		const path = issue.path.join('.');
		return `  - Invalid value for '${path}': ${issue.message}.`;
	});
	return `Validation failed:\n${issues.join('\n')}`;
}

function validateMessagesArray(messages: unknown): void {
	if (!Array.isArray(messages)) return;
	const result = z.array(ModelMessageSchema).safeParse(messages);
	if (!result.success) {
		throw new ConfigError(`'messages' array contains invalid message objects.\n${formatZodError(result.error)}`);
	}
}

function universalSanityChecks(config?: Partial<configs.AnyConfig<any, any, any, any>>): void {
	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object.');
	}
	// Note: 'template' and 'script' properties are now on the 'prompt' field,
	// but this check is kept for legacy safety if a user misconfigures.
	if ('template' in config && 'script' in config) {
		throw new ConfigError("Configuration cannot have both 'template' and 'script' properties.");
	}
	if (config.messages) {
		validateMessagesArray(config.messages);
	}
}

// --- Configuration Validators (for Creation Time) ---

/**
 * Validates a configuration for generic`create.Config()` calls by inferring its type.
 * This is the correct implementation that works with the new split validators.
 * @param config The configuration object.
 */
export function validateAnyConfig(config?: Partial<configs.AnyConfig<any, any, any, any>>): void {
	universalSanityChecks(config);
	if (!config) return;

	// Infer intent for generic Config() calls
	const isObjectConfig = 'output' in config || 'schema' in config || 'enum' in config;
	const isTextConfig = 'model' in config && !isObjectConfig;
	const isTool = 'inputSchema' in config; // Infer if it's a tool for context

	if (isObjectConfig) {
		// We don't know if it will be a streamer, so we assume false.
		// The final check in the ObjectStreamer factory will catch inconsistencies.
		validateObjectLLMConfig(config, config.promptType, isTool, false);
	}
	else if (isTextConfig) {
		validateTextLLMConfig(config, config.promptType, isTool);
	}
	else if ('template' in config) {
		validateTemplateConfig(config as Partial<configs.TemplateConfig<any>>, config.promptType as types.TemplatePromptType, isTool);
	}
	else if ('script' in config) {
		validateScriptConfig(config as Partial<configs.ScriptConfig<any, any>>, config.promptType as types.ScriptPromptType, isTool);
	}
	else if ('execute' in config) {
		validateFunctionConfig(config, isTool);
	}
}

/**
 * Validates configurations for TextGenerator and TextStreamer.
 * @param config The configuration object.
 * @param promptType The explicit promptType from the factory.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 */
export function validateTextLLMConfig(config: Partial<AnyTextConfig>, promptType?: types.PromptType, isTool = false): void {
	universalSanityChecks(config);
	if (!('model' in config)) throw new ConfigError("Text generator configs require a 'model' property.");
	if ('execute' in config) {
		throw new ConfigError("Property 'execute' is not allowed in a Text generator config. Use create.Function for this purpose.");
	}
	if ('schema' in config || 'enum' in config || 'output' in config) {
		throw new ConfigError("Properties 'schema', 'enum', and 'output' are only for Object generators.");
	}
	const isLoaded = promptType?.endsWith('-name') ?? false;
	if (isLoaded && !('loader' in config)) {
		throw new ConfigError("A 'loader' is required for this operation (e.g., for loads...() or *-name prompt types).");
	}
	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a renderer as a tool.");
	}
}

/**
 * Validates configurations for ObjectGenerator and ObjectStreamer.
 * @param config The configuration object.
 * @param promptType The explicit promptType from the factory.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 * @param isStreamer A flag indicating if the renderer is a streamer.
 */
export function validateObjectLLMConfig(config: Partial<AnyObjectConfig>, promptType?: types.PromptType, isTool = false, isStreamer = false): void {
	universalSanityChecks(config);
	if (!('model' in config)) throw new ConfigError("Object generator configs require a 'model' property.");
	if ('execute' in config) {
		throw new ConfigError("Property 'execute' is not allowed in an LLM generator config. Use create.Function for this purpose.");
	}

	const output = ('output' in config ? config.output : 'object') as string; // Vercel SDK defaults to 'object'

	if (isStreamer && output === 'enum') {
		throw new ConfigError('Object streamers do not support "enum" output.');
	}

	switch (output) {
		case 'object':
		case 'array':
			if (!('schema' in config)) {
				throw new ConfigError(`An 'output' of '${output}' requires a 'schema' property.`);
			}
			break;
		case 'enum':
			if (!('enum' in config && Array.isArray(config.enum))) {
				throw new ConfigError("An 'output' of 'enum' requires an 'enum' property with a string array.");
			}
			break;
		case 'no-schema': break; // No extra properties needed
		default:
			throw new ConfigError(`Invalid 'output' mode: '${output}'. Must be 'object', 'array', 'enum', or 'no-schema'.`);
	}

	const isLoaded = promptType?.endsWith('-name') ?? false;
	if (isLoaded && !('loader' in config)) {
		throw new ConfigError("A 'loader' is required for this operation (e.g., for loads...() or *-name prompt types).");
	}
	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a renderer as a tool.");
	}
}

/**
 * Validates configurations for `create.Template`.
 * @param config The configuration object.
 * @param templateType The explicit templateType from the factory.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 */
export function validateTemplateConfig(config: Partial<configs.TemplateConfig<any>>, templateType?: types.TemplatePromptType, isTool = false): void {
	universalSanityChecks(config);

	const forbiddenProps = ['model', 'script', 'execute', 'output', 'enum', 'mode'];
	for (const prop of forbiddenProps) {
		if (prop in config) {
			throw new ConfigError(`Property '${prop}' is not applicable for a Template configuration.`);
		}
	}

	if ('inputSchema' in config && config.inputSchema && !(config.inputSchema instanceof z.ZodObject)) {
		throw new ConfigError("For Template renderers, 'inputSchema' must be a Zod object schema (z.object).");
	}

	const isLoaded = templateType?.endsWith('-name') ?? false;

	if (isLoaded) {
		if (!('loader' in config)) {
			throw new ConfigError("A 'loader' is required when loading a template by name (e.g., for 'template-name' or 'async-template-name' types).");
		}
	} else {
		// If not loading by name, the template string must be in the config itself.
		if (!('template' in config)) {
			throw new ConfigError("A 'template' property is required for a Template configuration that is not loaded by name.");
		}
	}

	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a template as a tool.");
	}
}

/**
 * Validates configurations for `create.Script`.
 * @param config The configuration object.
 * @param scriptType The explicit scriptType from the factory.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 */
export function validateScriptConfig(config: Partial<configs.ScriptConfig<any, any>>, scriptType?: types.ScriptPromptType, isTool = false): void {
	universalSanityChecks(config);

	const forbiddenProps = ['model', 'template', 'execute', 'output', 'enum', 'mode'];
	for (const prop of forbiddenProps) {
		if (prop in config) {
			throw new ConfigError(`Property '${prop}' is not applicable for a Script configuration.`);
		}
	}

	if ('inputSchema' in config && config.inputSchema && !(config.inputSchema instanceof z.ZodObject)) {
		throw new ConfigError("For Script renderers, 'inputSchema' must be a Zod object schema (z.object).");
	}

	const isLoaded = scriptType?.endsWith('-name') ?? false;

	if (isLoaded) {
		if (!('loader' in config)) {
			throw new ConfigError("A 'loader' is required when loading a script by name (e.g., for 'script-name' or 'async-script-name' types).");
		}
	} else {
		// If not loading by name, the script string must be in the config itself.
		if (!('script' in config)) {
			throw new ConfigError("A 'script' property is required for a Script configuration that is not loaded by name.");
		}
	}

	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a script as a tool.");
	}
}

/**
 * Validates configurations for `create.Function`.
 * @param config The configuration object.
 * @param isTool A flag indicating if the function is being created as a tool.
 */
export function validateFunctionConfig(config: Record<string, any>, isTool = false): void {
	universalSanityChecks(config);
	if (typeof config.execute !== 'function') {
		throw new ConfigError("The 'execute' property in a Function config must be a function.");
	}
	const forbiddenProps = ['model', 'template', 'script', 'prompt', 'output', 'enum', 'mode', 'loader'];
	for (const prop of forbiddenProps) {
		if (prop in config) throw new ConfigError(`Property '${prop}' is not applicable for a Function configuration.`);
	}
	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a function as a tool.");
	}
}

// --- Invocation Validators (for Call Time) ---

export function validateLLMRendererCall(
	config: Partial<configs.AnyConfig<any, any, any, any>>, promptType: types.PromptType,
	...args: [string | undefined | ModelMessage[] | types.Context, (ModelMessage[] | types.Context)?, types.Context?]
): void {
	const callArgs = extractCallArguments(...args);
	validateMessagesArray(callArgs.messages);

	const finalPrompt = (callArgs.prompt ?? config.prompt) as (string | ModelMessage[] | undefined);
	const finalMessages = callArgs.messages ?? (Array.isArray(config.messages) ? config.messages : undefined);

	if (promptType.includes('template') || promptType.includes('script')) {
		if (callArgs.context) {
			validateInput(config, callArgs.context);
		} else if ('inputSchema' in config && config.inputSchema && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
			throw new ConfigError("A context object is required because an 'inputSchema' is defined in the configuration.");
		}
	} else { // text or text-name
		const hasPrompt = (typeof finalPrompt === 'string' && finalPrompt.length > 0) || (Array.isArray(finalPrompt) && finalPrompt.length > 0);
		const hasMessages = Array.isArray(finalMessages) && finalMessages.length > 0;
		if (!hasPrompt && !hasMessages) throw new ConfigError("Either 'prompt' (string or messages array) or 'messages' must be provided.");
		if (callArgs.context) throw new ConfigError("A 'context' object cannot be provided when using a 'text' or 'text-name' renderer.");
	}
}

export function validateTemplateCall(config: Partial<configs.TemplateConfig<any>>, ...args: [string | undefined | types.Context, types.Context?]): void {
	const [templateOrContext, maybeContext] = args;
	const context = (typeof templateOrContext === 'string') ? maybeContext : templateOrContext;

	if (!('template' in config) && typeof templateOrContext !== 'string') {
		throw new ConfigError("A template string must be provided either in the config or as the first argument.");
	}
	if (context) {
		validateInput(config, context);
	} else if (config.inputSchema && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
		throw new ConfigError("A context object is required because an 'inputSchema' with properties is defined in the configuration.");
	}
}

export function validateScriptOrFunctionCall(config: Record<string, any>, type: 'Script' | 'Function', ...args: [string | undefined | types.Context, types.Context?]): void {
	const [arg1, arg2] = args;
	const context = (typeof arg1 === 'string') ? arg2 : arg1;

	if (type === 'Script' && !('script' in config) && typeof arg1 !== 'string') {
		throw new ConfigError("A script string must be provided either in the config or as the first argument.");
	}
	if (context) {
		validateInput(config, context);
	} else if (config.inputSchema && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
		throw new ConfigError("A context object is required because an 'inputSchema' with properties is defined in the configuration.");
	}
}

// --- Input/Output Schema Validators ---

function validateInput(config: Partial<configs.AnyConfig<any, any, any, any>>, context: types.Context): void {
	if (config.inputSchema) {
		const schema = config.inputSchema as z.ZodType;
		const result = schema.safeParse(context);
		if (!result.success) {
			throw new ConfigError(`Input context validation failed.\n${formatZodError(result.error)}`);
		}
	}
}

export function validateAndParseOutput<T>(config: Partial<configs.AnyConfig<any, any, any, any>>, result: T): T {
	if ('schema' in config && config.schema) {
		const schema = config.schema as z.ZodType;
		const validationResult = schema.safeParse(result);
		if (!validationResult.success) {
			throw new ConfigError(`Output validation failed.\n${formatZodError(validationResult.error)}`);
		}
		return validationResult.data as T;
	}
	return result;
}