// file: validate.ts

import { ModelMessage } from "ai";
import { z, ZodError } from 'zod';
import { Context, PromptType } from "./types/types";
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

function universalSanityChecks(config?: Record<string, any>): void {
	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object.');
	}
	if ('template' in config && 'script' in config) {
		throw new ConfigError("Configuration cannot have both 'template' and 'script' properties.");
	}
	if (config.messages) {
		validateMessagesArray(config.messages);
	}
}

// --- Specialized Configuration Validators ---

/**
 * Validates a configuration for generic `create.Config()` calls by inferring its type.
 * @param config The configuration object.
 */
export function validateAnyConfig(config?: Record<string, any>): void {
	universalSanityChecks(config);
	// Infer intent for generic Config() calls
	if ('output' in config!) validateLLMConfig(config);
	else if ('template' in config!) validateTemplateConfig(config);
	else if ('script' in config!) validateScriptConfig(config);
	else if ('execute' in config!) validateFunctionConfig(config);
	else if ('model' in config!) validateLLMConfig(config);
}

/**
 * Validates configurations for LLM-based generators (TextGenerator, ObjectGenerator, etc.).
 * @param config The configuration object.
 * @param promptType The explicit promptType from the factory.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 * @param isLoaded A flag indicating if the renderer uses a loader.
 */
export function validateLLMConfig(config: Record<string, any>, promptType?: PromptType, isTool = false, isLoaded = false): void {
	universalSanityChecks(config);

	if ('execute' in config) {
		throw new ConfigError("Property 'execute' is not allowed in an LLM generator config. Use create.Function for this purpose.");
	}
	if (!('model' in config)) {
		throw new ConfigError("LLM generator configs require a 'model' property.");
	}

	// Logic for Object Generators (ObjectGenerator, ObjectStreamer)
	if ('output' in config || 'schema' in config || 'enum' in config) {
		const output = (config.output ?? 'object') as string; // Vercel SDK defaults to 'object'

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
			case 'no-schema':
				// No extra properties needed
				break;
			default:
				throw new ConfigError(`Invalid 'output' mode: '${output}'. Must be 'object', 'array', 'enum', or 'no-schema'.`);
		}
	}
	// Logic for Text Generators (TextGenerator, TextStreamer)
	else {
		if ('schema' in config || 'enum' in config || 'mode' in config) {
			throw new ConfigError("Properties 'schema', 'enum', and 'mode' are only for Object generators. Did you mean to set the 'output' property?");
		}
	}

	// Post-Validation Checks Based on Context
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
 * @param promptType The explicit promptType from the factory.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 * @param isLoaded A flag indicating if the renderer uses a loader.
 */
export function validateTemplateConfig(config: Record<string, any>, promptType?: PromptType, isTool = false, isLoaded = false): void {
	universalSanityChecks(config);

	const forbiddenProps = ['model', 'script', 'execute', 'output', 'enum', 'mode'];
	for (const prop of forbiddenProps) {
		if (prop in config) {
			throw new ConfigError(`Property '${prop}' is not applicable for a Template configuration.`);
		}
	}

	if ('inputSchema' in config && !(config.inputSchema instanceof z.ZodObject)) {
		throw new ConfigError("For Template renderers, 'inputSchema' must be a Zod object schema (z.object).");
	}

	if (isLoaded && !('loader' in config)) {
		throw new ConfigError("A 'loader' is required when loading a template by name.");
	}
	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a template as a tool.");
	}
}

/**
 * Validates configurations for `create.Script`.
 * @param config The configuration object.
 * @param promptType The explicit promptType from the factory.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 * @param isLoaded A flag indicating if the renderer uses a loader.
 */
export function validateScriptConfig(config: Record<string, any>, promptType?: PromptType, isTool = false, isLoaded = false): void {
	universalSanityChecks(config);

	const forbiddenProps = ['model', 'template', 'execute', 'output', 'enum', 'mode'];
	for (const prop of forbiddenProps) {
		if (prop in config) {
			throw new ConfigError(`Property '${prop}' is not applicable for a Script configuration.`);
		}
	}

	if ('inputSchema' in config && !(config.inputSchema instanceof z.ZodObject)) {
		throw new ConfigError("For Script renderers, 'inputSchema' must be a Zod object schema (z.object).");
	}

	if (isLoaded && !('loader' in config)) {
		throw new ConfigError("A 'loader' is required when loading a script by name.");
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
		if (prop in config) {
			throw new ConfigError(`Property '${prop}' is not applicable for a Function configuration.`);
		}
	}

	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a function as a tool.");
	}
}



// --- Invocation Validators (Unchanged) ---

export function validateLLMRendererCall(
	config: Record<string, any>, promptType: PromptType,
	...args: [string | undefined | ModelMessage[] | Context, (ModelMessage[] | Context)?, Context?]
): void {
	const callArgs = extractCallArguments(...args);
	validateMessagesArray(callArgs.messages);

	const finalPrompt = (callArgs.prompt ?? config.prompt) as (string | ModelMessage[] | undefined);
	const finalMessages = callArgs.messages ?? (Array.isArray(config.messages) ? config.messages : undefined);

	if (promptType.includes('template') || promptType.includes('script')) {
		if (typeof finalPrompt !== 'string' || finalPrompt.length === 0) {
			// A prompt might not be provided if it's already in the config, which is checked by the renderer.
			// Let's ensure at least one is present.
			if (!config.prompt) {
				throw new ConfigError("A string prompt (containing the template or script) is required when using a template or script-based renderer.");
			}
		}
		if (callArgs.context) {
			validateInput(config, callArgs.context);
		} else if ('inputSchema' in config && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
			// Only require context if the schema expects properties
			throw new ConfigError("A context object is required because an 'inputSchema' is defined in the configuration.");
		}
	} else { // text or text-name
		const hasPrompt = (typeof finalPrompt === 'string' && finalPrompt.length > 0) || (Array.isArray(finalPrompt) && finalPrompt.length > 0);
		const hasMessages = Array.isArray(finalMessages) && finalMessages.length > 0;

		if (!hasPrompt && !hasMessages) {
			throw new ConfigError("Either 'prompt' (string or messages array) or 'messages' must be provided.");
		}
		if (callArgs.context) {
			throw new ConfigError("A 'context' object cannot be provided when using a 'text' or 'text-name' renderer.");
		}
	}
}

export function validateTemplateCall(config: Record<string, any>, ...args: [string | undefined | Context, Context?]): void {
	const [templateOrContext, maybeContext] = args;
	let context: Context | undefined;

	if (typeof templateOrContext === 'string') context = maybeContext;
	else {
		if (maybeContext !== undefined) throw new ConfigError("Second argument must be undefined when the first is a context object.");
		context = templateOrContext;
	}

	if (!('template' in config) && typeof templateOrContext !== 'string') {
		throw new ConfigError("A template string must be provided either in the config or as the first argument.");
	}

	if (context) {
		validateInput(config, context);
	} else if ('inputSchema' in config && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
		throw new ConfigError("A context object is required because an 'inputSchema' with properties is defined in the configuration.");
	}
}

export function validateScriptOrFunctionCall(config: Record<string, any>, type: 'Script' | 'Function', ...args: [string | undefined | Context, Context?]): void {
	const [arg1, arg2] = args;
	let context: Context | undefined;

	if (typeof arg1 === 'string') {
		if (type === 'Function') throw new ConfigError("Function renderer does not accept a script string; provide a context object.");
		context = arg2;
	} else {
		if (arg2 !== undefined) throw new ConfigError("Second argument must be undefined when the first is a context object.");
		context = arg1;
	}

	if (type === 'Script' && !('script' in config) && typeof arg1 !== 'string') {
		throw new ConfigError("A script string must be provided either in the config or as the first argument.");
	}

	if (context) {
		validateInput(config, context);
	} else if ('inputSchema' in config && Object.keys((config.inputSchema as z.ZodObject<any>).shape as Record<string, any>).length > 0) {
		throw new ConfigError("A context object is required because an 'inputSchema' with properties is defined in the configuration.");
	}
}

// --- Input/Output Schema Validators (Unchanged) ---

function validateInput(config: Record<string, any>, context: Context): void {
	if ('inputSchema' in config) {
		if (!(config.inputSchema instanceof z.ZodType)) {
			throw new ConfigError("Invalid 'inputSchema' in config; it is not a valid Zod schema.");
		}
		const result = config.inputSchema.safeParse(context);
		if (!result.success) {
			throw new ConfigError(`Input context validation failed.\n${formatZodError(result.error)}`);
		}
	}
}

export function validateAndParseOutput<T>(config: Record<string, any>, result: T): T {
	if ('schema' in config) {
		if (!(config.schema instanceof z.ZodType)) {
			throw new ConfigError("Invalid 'schema' in config; it is not a valid Zod schema.");
		}
		const validationResult = config.schema.safeParse(result);
		if (!validationResult.success) {
			throw new ConfigError(`Output validation failed.\n${formatZodError(validationResult.error)}`);
		}
		return validationResult.data as T;
	}
	return result;
}