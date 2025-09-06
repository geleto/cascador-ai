import { ModelMessage } from "ai";
import { z, ZodError } from 'zod';
import * as types from './types/types';
import * as configs from './types/config';
import { extractCallArguments } from './llm-renderer';
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
	if ('messages' in config && config.messages) {
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
	//const isTextConfig = 'model' in config && !isObjectConfig;
	//const isTool = inputSchema' in config; // Infer if it's a tool for context
	const isTool = false;

	if (isObjectConfig) {
		// We don't know if it will be a streamer, so we assume false.
		// The final check in the ObjectStreamer factory will catch inconsistencies.
		validateObjectLLMConfig(config, (config as Partial<configs.TemplateConfig<any>>).promptType, isTool, false);
	}
	/*else if (isTextConfig) {
		validateTextLLMConfig(config, (config as Partial<configs.TemplateConfig<any>>).promptType, isTool);
	}*/
	else if ('template' in config) {
		validateTemplateConfig(config as Partial<configs.TemplateConfig<any>>, config.promptType, isTool);
	}
	else if ('script' in config) {
		validateScriptConfig(config as Partial<configs.ScriptConfig<any, any>>, config.promptType, isTool);
	}
	else if ('execute' in config) {
		validateFunctionConfig(config, isTool);
	} else {
		// Handle any conflicting properties
		if ('model' in config) {
			// If 'model' is present, we treat and validate it as a TextConfig.
			// The validateTextLLMConfig function is responsible for checking for
			// conflicting properties like 'schema', 'output', 'enum', etc.,
			// and will throw an error if they are found.
			validateTextLLMConfig(config as Partial<AnyTextConfig>, (config as Partial<configs.TemplateConfig<any>>).promptType, isTool);
		}
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

	// For template/script-based prompt types, disallow messages array as prompt
	if (promptType?.includes('template') || promptType?.includes('script')) {
		if (Array.isArray(config.prompt)) {
			throw new ConfigError("A 'prompt' with a message array is not allowed for template or script-based renderers. The 'prompt' must be a string containing the template or script.");
		}
	} else if (promptType?.includes('function')) {
		if (typeof config.prompt !== 'function') {
			throw new ConfigError("The 'prompt' property must be a function when using withFunction().");
		}
	}
	if (!('model' in config)) throw new ConfigError("Text generator configs require a 'model' property.");
	if ('execute' in config) {
		throw new ConfigError("Property 'execute' is not allowed in a Text generator config. Use create.Function for this purpose.");
	}
	if ('schema' in config || 'enum' in config || 'output' in config) {
		throw new ConfigError("Properties 'schema', 'enum', and 'output' are only for Object generators.");
	}

	// Add validation for prompt property when it's an array
	if (Array.isArray(config.prompt)) {
		validateMessagesArray(config.prompt);
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
	// For template/script-based prompt types, disallow messages array as prompt
	if (promptType?.includes('template') || promptType?.includes('script')) {
		if (Array.isArray(config.prompt)) {
			throw new ConfigError("A 'prompt' with a message array is not allowed for template or script-based renderers. The 'prompt' must be a string containing the template or script.");
		}
	} else if (promptType?.includes('function')) {
		if (typeof config.prompt !== 'function') {
			throw new ConfigError("The 'prompt' property must be a function when using withFunction().");
		}
	}
	if (!('model' in config)) throw new ConfigError("Object generator configs require a 'model' property.");
	if ('execute' in config) {
		throw new ConfigError("Property 'execute' is not allowed in an LLM generator config. Use create.Function for this purpose.");
	}

	// Add validation for prompt property when it's an array
	if (Array.isArray(config.prompt)) {
		validateMessagesArray(config.prompt);
	}

	const output = ('output' in config ? config.output : 'object') as string; // Vercel SDK defaults to 'object'

	if (isStreamer && output === 'enum') {
		throw new ConfigError('Object streamers do not support "enum" output.');
	}

	if ('tools' in config) {
		throw new ConfigError(`Object renderers do not support "tools" property.`);
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
			if (isStreamer) {
				throw new ConfigError('Object streamers do not support "enum" output.');
			}
			break;
		case 'no-schema': break; // No extra properties needed
		default:
			throw new ConfigError(`Invalid 'output' mode: '${output}'. Must be 'object', 'array', ${isStreamer ? '' : 'enum'}, or 'no-schema'.`);
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
	const isToolCall = callArgs.context?._toolCallOptions !== undefined;

	validateMessagesArray(callArgs.messages);

	if (promptType.includes('template') || promptType.includes('script')) {

		if (!isToolCall) {
			if (callArgs.context) {
				// Skip input validation if this is a tool call (indicated by presence of _toolCallOptions)

				validateInput(config, callArgs.context);

			} else if ('inputSchema' in config && config.inputSchema && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
				throw new ConfigError("A context object is required because an 'inputSchema' is defined in the configuration.");
			}
		}// else - the tool call will have its own input schema validation
	} else { // text or text-name
		const prompt = (config as Partial<configs.TemplatePromptConfig>).prompt;
		const finalPromptString = callArgs.prompt ?? (typeof prompt === 'string' ? prompt : undefined);
		const finalPromptMessages = Array.isArray(prompt) ? prompt : [];
		const finalMessages = callArgs.messages ?? (Array.isArray((config as Partial<configs.TemplatePromptConfig>).messages) ? (config as Partial<configs.TemplatePromptConfig>).messages : undefined);

		const hasPromptString = typeof finalPromptString === 'string' && finalPromptString.length > 0;
		const hasPromptMessages = finalPromptMessages.length > 0;
		const hasMessages = finalMessages && finalMessages.length > 0;

		if (!hasPromptString && !hasPromptMessages && !hasMessages) {
			throw new ConfigError("Either 'prompt' (string or messages array) or 'messages' must be provided in the config or at call time.");
		}
		if (callArgs.context) throw new ConfigError("A 'context' object cannot be provided when using a 'text' or 'text-name' renderer.");
	}
}

export function validateTemplateCall(config: Partial<configs.TemplateConfig<any>>, ...args: [string | undefined | types.Context, types.Context?]): void {
	const [templateOrContext, maybeContext] = args;
	const context = (typeof templateOrContext === 'string') ? maybeContext : templateOrContext;
	const isToolCall = context?._toolCallOptions !== undefined;

	if (!('template' in config) && typeof templateOrContext !== 'string') {
		throw new ConfigError("A template string must be provided either in the config or as the first argument.");
	}

	if (!isToolCall) {
		if (context) {
			validateInput(config, context);
		} else if (config.inputSchema && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
			throw new ConfigError("A context object is required because an 'inputSchema' with properties is defined in the configuration.");
		}
	}// else - the tool call will have its own input schema validation
}

export function validateScriptOrFunctionCall(config: Record<string, any>, type: 'Script' | 'Function', ...args: [string | undefined | types.Context, types.Context?]): void {
	const [arg1, arg2] = args;
	const context = (typeof arg1 === 'string') ? arg2 : arg1;
	const isToolCall = context?._toolCallOptions !== undefined;

	if (type === 'Script' && !('script' in config) && typeof arg1 !== 'string') {
		throw new ConfigError("A script string must be provided either in the config or as the first argument.");
	}

	if (!isToolCall) {
		if (context) {
			validateInput(config, context);
		} else if (config.inputSchema && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
			throw new ConfigError("A context object is required because an 'inputSchema' with properties is defined in the configuration.");
		}
	}// else - the tool call will have its own input schema validation
}

// --- Input/Output Schema Validators ---

function validateInput(config: Partial<configs.AnyConfig<any, any, any, any>>, context: types.Context): void {
	if ('inputSchema' in config && config.inputSchema) {
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