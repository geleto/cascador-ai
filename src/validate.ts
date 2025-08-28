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

// --- Targeted Excess Property Validation ---

const MAIN_PROPERTIES = new Set(['schema', 'inputSchema', 'model', 'output', 'prompt', 'template', 'script', 'enum', 'mode', 'execute']);
const OBJECT_PROPS = new Set(['model', 'output', 'schema', 'enum', 'mode', 'prompt', 'inputSchema']);
const TEXT_PROPS = new Set(['model', 'prompt', 'inputSchema']);
const TEMPLATE_PROPS = new Set(['template', 'prompt', 'inputSchema']);
const SCRIPT_PROPS = new Set(['script', 'prompt', 'inputSchema', 'schema']);
const FUNCTION_PROPS = new Set(['execute', 'inputSchema', 'schema']);

function validateExcessProperties(config: Record<string, any>, allowedProps: Set<string>, rendererName: string): void {
	for (const prop of MAIN_PROPERTIES) {
		if (prop in config && !allowedProps.has(prop)) {
			throw new ConfigError(`Property '${prop}' is not applicable for a ${rendererName} configuration.`);
		}
	}
}

// --- Internal, Type-Specific Config Validators ---

function _validateObjectConfig(config: Record<string, any>): void {
	validateExcessProperties(config, OBJECT_PROPS, 'Object');
	if (!('model' in config)) throw new ConfigError("Object config requires a 'model' property.");
	if ('prompt' in config && !(typeof config.prompt === 'string' || Array.isArray(config.prompt))) {
		throw new ConfigError("'prompt' in an Object config must be a string or a ModelMessage array.");
	}
}

function _validateTextConfig(config: Record<string, any>): void {
	validateExcessProperties(config, TEXT_PROPS, 'Text');
	if (!('model' in config)) throw new ConfigError("Text config requires a 'model' property.");
	if ('prompt' in config && !(typeof config.prompt === 'string' || Array.isArray(config.prompt))) {
		throw new ConfigError("'prompt' in a Text config must be a string or a ModelMessage array.");
	}
}

function _validateTemplateConfig(config: Record<string, any>): void {
	validateExcessProperties(config, TEMPLATE_PROPS, 'Template');
	if ('inputSchema' in config && !(config.inputSchema instanceof z.ZodObject)) {
		throw new ConfigError("For Template renderers, 'inputSchema' must be a Zod object schema (z.object).");
	}
}

function _validateScriptConfig(config: Record<string, any>): void {
	validateExcessProperties(config, SCRIPT_PROPS, 'Script');
	if ('inputSchema' in config && !(config.inputSchema instanceof z.ZodObject)) {
		throw new ConfigError("For Script renderers, 'inputSchema' must be a Zod object schema (z.object).");
	}
}

function _validateFunctionConfig(config: Record<string, any>): void {
	validateExcessProperties(config, FUNCTION_PROPS, 'Function');
	if (typeof config.execute !== 'function') {
		throw new ConfigError("The 'execute' property in a Function config must be a function.");
	}
}

// --- Main Configuration Validator ---

/**
 * Main validation router for renderer creation.
 * It prioritizes explicit type info (promptType) and uses intent inference as a fallback for generic Config().
 * @param config The configuration object.
 * @param promptType The explicit promptType, which dictates validation.
 * @param isTool A flag indicating if the renderer is being created as a tool.
 * @param isLoaded A flag indicating if the renderer uses a loader.
 */
export function validateConfig(config?: Record<string, any>, promptType?: PromptType, isTool = false, isLoaded = false): void {
	if (!config || typeof config !== 'object') {
		throw new ConfigError('Config must be an object.');
	}

	// Universal Checks
	if ('template' in config && 'script' in config) {
		throw new ConfigError("Configuration cannot have both 'template' and 'script' properties.");
	}
	if (config.messages) {
		validateMessagesArray(config.messages);
	}

	// --- Primary Dispatch: Use explicit promptType if available ---
	if (promptType) {
		if (promptType.includes('template')) _validateTemplateConfig(config);
		else if (promptType.includes('script')) _validateScriptConfig(config);
		else if (promptType.includes('text')) _validateTextConfig(config);
		if ('output' in config) _validateObjectConfig(config); // Object renderers also have a promptType
	} else {
		// --- Fallback: Infer intent for generic Config() calls ---
		if ('output' in config) _validateObjectConfig(config);
		else if ('template' in config) _validateTemplateConfig(config);
		else if ('script' in config) _validateScriptConfig(config);
		else if ('execute' in config) _validateFunctionConfig(config);
		else if ('model' in config) _validateTextConfig(config);
	}

	// --- Post-Validation Checks Based on Explicit Context ---
	if (isLoaded && !('loader' in config)) {
		throw new ConfigError("A 'loader' is required for this operation (e.g., for loads...() or *-name prompt types).");
	}
	if (isTool && !('inputSchema' in config)) {
		throw new ConfigError("'inputSchema' is a required property when creating a renderer as a tool.");
	}
}

// --- Invocation Validators ---

export function validateLLMRendererCall(
	config: Record<string, any>, promptType: PromptType,
	...args: [string | ModelMessage[] | Context, (ModelMessage[] | Context)?, Context?]
): void {
	const callArgs = extractCallArguments(...args);
	validateMessagesArray(callArgs.messages);

	const finalPrompt = (callArgs.prompt ?? config.prompt) as (string | ModelMessage[] | undefined);
	const finalMessages = callArgs.messages ?? (Array.isArray(config.messages) ? config.messages : undefined);

	if (promptType.includes('template') || promptType.includes('script')) {
		if (typeof finalPrompt !== 'string' || finalPrompt.length === 0) {
			throw new ConfigError("A string prompt (containing the template or script) is required when using a template or script-based renderer.");
		}
		if (callArgs.context) {
			validateInput(config, callArgs.context);
		} else if ('inputSchema' in config) {
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

export function validateTemplateCall(config: Record<string, any>, ...args: [string | Context, Context?]): void {
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
	} else if ('inputSchema' in config) {
		throw new ConfigError("A context object is required because an 'inputSchema' is defined in the configuration.");
	}
}

export function validateScriptOrFunctionCall(config: Record<string, any>, type: 'Script' | 'Function', ...args: [string | Context, Context?]): void {
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
	} else if ('inputSchema' in config) {
		throw new ConfigError("A context object is required because an 'inputSchema' is defined in the configuration.");
	}
}

// --- Input/Output Schema Validators ---

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