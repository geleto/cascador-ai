import { Context, ScriptPromptType, TemplatePromptType } from '../types/types';
import * as configs from '../types/config';
import { validateLLMRendererCall } from '../validate';
import * as utils from '../types/utils';
import { _createTemplate, TemplateCallSignature } from './Template';
import { _createScript, ScriptCallSignature } from './Script';
import { LanguageModel, ModelMessage, generateObject, generateText, streamObject, streamText } from 'ai';
import type { GenerateTextResult, StreamTextResult } from 'ai';
import { z } from 'zod';
import { PromptStringOrMessagesSchema } from '../types/schemas';
import { RequiredPromptType, AnyPromptSource } from '../types/types';
import { _createFunction, FunctionCallSignature } from './Function';
import { augmentGenerateText, augmentStreamText, buildMessagesWithPrompt } from '../messages';

//@todo - INPUT like in template
export type LLMCallSignature<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TResult,
	PType extends RequiredPromptType = RequiredPromptType,
	PROMPT extends AnyPromptSource = string
> = PType extends 'text' | 'text-name'
	? (
		// TConfig has no template, no context argument is needed
		// We can have either a prompt or messages, but not both. No context as nothing is rendered.
		TConfig extends { prompt: string | ModelMessage[] } | { messages: ModelMessage[] }
		? {
			// Optional prompt/messages
			(prompt: string | ModelMessage[], messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
			(messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
			config: TConfig;
			type: string;
		}
		: {
			// Required a prompt or messages
			(prompt: string | ModelMessage[], messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
			(messages: ModelMessage[]): utils.EnsurePromise<TResult>;
			config: TConfig;
			type: string;
		}
	)
	: PType extends 'function'
	? (
		// Function-based renderers only accept a context object.
		// Overriding the prompt function with a one-off string is ambiguous.
		{
			(context?: Context): utils.EnsurePromise<TResult>;
			config: TConfig;
			type: string;
		}
	)
	: (
		// TConfig has template or script or function; return type is always a promise
		// we can have a prompt and/or messages at the same time (prompt are required and get rendered).
		TConfig extends { prompt: PROMPT }
		? {
			// Config already has a prompt => Optional prompt, optional messages, and optional context
			(prompt: PROMPT, messages: ModelMessage[], context?: Context): utils.EnsurePromise<TResult>;
			(prompt: PROMPT, context?: Context): utils.EnsurePromise<TResult>;
			(context?: Context): utils.EnsurePromise<TResult>;
			config: TConfig;
			type: string;
		}
		: {
			// Requires a prompt, optional messages, and optional context
			//(prompt: string, message: ModelMessage[], context?: Context): utils.EnsurePromise<TResult>;
			(prompt: PROMPT, context?: Context): utils.EnsurePromise<TResult>;
			config: TConfig;
			type: string;
		}
	);

export function extractCallArguments(promptOrMessageOrContext?: string | ModelMessage[] | Context, contextOrMessages?: ModelMessage[] | Context, maybeContext?: Context): { prompt?: string, messages?: ModelMessage[], context?: Context } {
	let promptFromArgs: string | undefined;
	let messagesFromArgs: ModelMessage[] | undefined;
	let contextFromArgs: Context | undefined;

	// First argument
	if (typeof promptOrMessageOrContext === 'string') {
		promptFromArgs = promptOrMessageOrContext;
	} else if (Array.isArray(promptOrMessageOrContext)) {
		messagesFromArgs = promptOrMessageOrContext;
	} else if (promptOrMessageOrContext && !Array.isArray(promptOrMessageOrContext)) {
		contextFromArgs = promptOrMessageOrContext;
	}

	// Second argument
	if (contextOrMessages !== undefined) {
		if (Array.isArray(contextOrMessages)) {
			if (messagesFromArgs !== undefined) {
				throw new Error('Messages provided multiple times across arguments');
			}
			messagesFromArgs = contextOrMessages as ModelMessage[];
		} else {
			if (contextFromArgs !== undefined) {
				throw new Error('Context provided multiple times across arguments');
			}
			contextFromArgs = contextOrMessages;
		}
	}

	// Third argument
	if (maybeContext !== undefined) {
		if (!Array.isArray(contextOrMessages)) {
			throw new Error('Third argument (context) is only allowed when the second argument is messages.');
		}
		if (Array.isArray(maybeContext)) {
			throw new Error('Third argument (context) must be an object');
		}
		if (contextFromArgs !== undefined) {
			throw new Error('Context provided multiple times');
		}
		contextFromArgs = maybeContext;
	}

	return { prompt: promptFromArgs, messages: messagesFromArgs, context: contextFromArgs };
}

function omitPrompt<T extends { prompt?: unknown }>(cfg: T): Omit<T, 'prompt'> {
	const cloned = { ...cfg } as T & { prompt?: unknown };
	delete cloned.prompt;
	return cloned as Omit<T, 'prompt'>;
}

function copyConfigProperties(config: Record<string, any>, keys: readonly string[]): Record<string, any> {
	const dst = {} as Record<string, any>;
	for (const key of keys) {
		if (key in config) {
			dst[key] = config[key] as unknown;
		}
	}
	return dst;
}

//@todo - the promptRenderer shall use a precompiled template/script when created with a template/script promptType
export function _createLLMRenderer<
	TConfig extends configs.OptionalPromptConfig & Partial<TFunctionConfig> & { context?: Context }
	& { debug?: boolean, model: LanguageModel, prompt?: string, messages?: ModelMessage[] }, // extends Partial<OptionalTemplatePromptConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TFunctionConfig extends TConfig & { model: LanguageModel },
	TFunctionResult,
	PT extends RequiredPromptType = RequiredPromptType,
>(
	config: TConfig,
	vercelFunc: (config: TFunctionConfig) => TFunctionResult
): LLMCallSignature<TConfig, TFunctionResult, PT> {
	// Debug output if config.debug is true
	if (config.debug) {
		console.log('[DEBUG] LLMRenderer created with config:', JSON.stringify(config, null, 2));
	}

	// The Vercel AI SDK functions for text and object generation accept a 'messages' array as input
	// to provide conversational context. This is crucial for building chat agents and multi-step workflows.
	const supportsMessages = (vercelFunc as unknown) === generateText || (vercelFunc as unknown) === streamText ||
		(vercelFunc as unknown) === generateObject || (vercelFunc as unknown) === streamObject;

	let call;
	if (config.promptType !== 'text' && config.promptType !== undefined) {
		// Dynamic Path - use Template/Script/Function to render the prompt

		let renderer: TemplateCallSignature<any, any> | ScriptCallSignature<any, any, any> | FunctionCallSignature<any, any, any>;
		const isTemplatePrompt = config.promptType === 'template' || config.promptType === 'template-name' || config.promptType === 'async-template' || config.promptType === 'async-template-name';
		const isScriptPrompt = config.promptType === 'script' || config.promptType === 'script-name' || config.promptType === 'async-script' || config.promptType === 'async-script-name';
		const isFunctionPrompt = config.promptType === 'function';

		if (isTemplatePrompt) {
			const templateConfig = {
				...copyConfigProperties(config, configs.TemplateConfigKeys),
				template: config.prompt
			};
			renderer = _createTemplate(templateConfig, config.promptType as TemplatePromptType);
		} else if (isScriptPrompt) {
			type ScriptOutput = string | ModelMessage[];
			// The LLM renderer's 'prompt' becomes the 'script' for the Script factory.
			const scriptConfig = {
				...copyConfigProperties(config, configs.ScriptConfigKeys),
				script: config.prompt,
				schema: PromptStringOrMessagesSchema as z.ZodType<ScriptOutput>
			};
			renderer = _createScript(scriptConfig, config.promptType as ScriptPromptType);
		} else if (isFunctionPrompt) {
			const functionConfig = {
				...copyConfigProperties(config, configs.FunctionConfigKeys),
				execute: config.prompt as (context: Context) => Promise<string | ModelMessage[]>
			};
			renderer = _createFunction(functionConfig as configs.FunctionConfig<any, any>);
		} else {
			throw new Error(`Unhandled prompt type: ${config.promptType}`);
		}
		call = async (
			promptOrMessageOrContext?: string | ModelMessage[] | Context,
			messagesOrContext?: ModelMessage[] | Context,
			maybeContext?: Context
		): Promise<TFunctionResult> => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - template path called with:', { promptOrMessageOrContext, messagesOrContext, maybeContext });
			}
			validateLLMRendererCall(config, config.promptType!, promptOrMessageOrContext, messagesOrContext, maybeContext);
			// Run the renderer to get the dynamic prompt content
			// note that the renderer has access to the config messages, prompt and context and will combine them with the call arguments
			const renderedPrompt = await renderer(promptOrMessageOrContext as string, messagesOrContext) as string | ModelMessage[];
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - rendered output:', Array.isArray(renderedPrompt) ? { type: 'messages', length: renderedPrompt.length } : { type: 'string', preview: String(renderedPrompt).slice(0, 120) });
			}

			let resultConfig: TFunctionConfig;
			if (!supportsMessages) {
				return await vercelFunc({ ...config, prompt: renderedPrompt } as TFunctionConfig);
			} else {
				// 1. Normalize the rendered output into a consistent message array format.
				const newMessagesFromPrompt: ModelMessage[] = Array.isArray(renderedPrompt)
					? renderedPrompt
					: (typeof renderedPrompt === 'string' && renderedPrompt.length > 0)
						? [{ role: 'user', content: renderedPrompt }]//create a single message array from the rendered string prompt
						: [];

				// 2. Prepare the base messages from config and call arguments.
				const { messages: messagesFromArgs } = extractCallArguments(promptOrMessageOrContext, messagesOrContext, maybeContext);

				const configMessages = (config as unknown as { messages?: ModelMessage[] }).messages ?? [];
				const callMessages = messagesFromArgs ?? [];
				const combinedBaseMessages = [...configMessages, ...callMessages];

				// 3. Construct the final payload for the Vercel function, with all messages
				const finalMessages = [...combinedBaseMessages, ...newMessagesFromPrompt];

				// Vercel AI SDK functions perform better when `prompt` is used for single, simple user inputs.
				// We only use the `prompt` property if there are no base messages and the renderer returned a simple string.
				const usePromptProperty = combinedBaseMessages.length === 0 && typeof renderedPrompt === 'string';
				if (usePromptProperty) {
					// Replace the prompt property with the rendered prompt
					resultConfig = { ...config, prompt: renderedPrompt } as TFunctionConfig;
				} else {
					// In all other cases (base messages exist, or renderer returned an array), use the `messages` property.
					// Remove the prompt property (that contains a script or template) from the config
					const cfg = omitPrompt(config as unknown as TFunctionConfig);
					resultConfig = { ...cfg, messages: finalMessages } as TFunctionConfig;
				}

				// 4. Execute the underlying Vercel AI function.
				const result = await vercelFunc(resultConfig);

				// 5. Augment the result for conversational history management.
				let augmentedResult: TFunctionResult = result;
				if ((vercelFunc as unknown) === generateText) {
					augmentedResult = augmentGenerateText(result as GenerateTextResult<any, any>, newMessagesFromPrompt, callMessages) as Awaited<TFunctionResult>;
				} else if ((vercelFunc as unknown) === streamText) {
					augmentedResult = augmentStreamText(result as StreamTextResult<any, any>, newMessagesFromPrompt, callMessages) as Awaited<TFunctionResult>;
				} //else - no augmentation for other functions

				if (config.debug) {
					console.log('[DEBUG] createLLMRenderer - vercelFunc result:', augmentedResult);
				}
				return augmentedResult;
			}
		};
	} else {
		// Static Path - promptType is 'text' or undefined
		call = (promptOrMessages?: string | ModelMessage[], maybeMessages?: ModelMessage[]): TFunctionResult => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - text path called with:', { promptOrMessages, maybeMessages });
			}
			const { prompt, messages } = extractCallArguments(promptOrMessages, maybeMessages);
			validateLLMRendererCall(config, config.promptType ?? 'text', prompt, messages);

			if (!supportsMessages) {
				return vercelFunc({ ...config, prompt } as TFunctionConfig);
			} else {
				const promptFromConfig = config.prompt as string | ModelMessage[] | undefined;
				const effectivePrompt = prompt ?? (typeof promptFromConfig === 'string' ? promptFromConfig : undefined);
				const messagesFromConfig = (config as unknown as { messages?: ModelMessage[] }).messages;
				const configMessages = messagesFromConfig;
				const callArgumentMessages = messages;

				// Gather messages from multiple sources in specific order:
				// 1. config.messages (static messages like system prompts)
				// 2. config.prompt if it is an array of ModelMessage
				// 3. Messages passed as a runtime argument (callArgumentMessages)
				const configPromptAsMessages = Array.isArray(promptFromConfig) ? promptFromConfig : [];
				const combinedBase = [
					...(configMessages ?? []),
					...configPromptAsMessages,
					...(callArgumentMessages ?? []),
				];

				// If messages exist, append the prompt as a user message and DO NOT send prompt
				const finalMessages = buildMessagesWithPrompt(combinedBase.length > 0 ? combinedBase : undefined, effectivePrompt);

				// Build payload: when messages were appended, drop 'prompt'; otherwise include 'prompt'
				const resultConfig = (
					finalMessages
						? (() => { const cfg = omitPrompt(config as unknown as TFunctionConfig); return { ...cfg, messages: finalMessages } as TFunctionConfig; })()
						: { ...config, ...(effectivePrompt !== undefined ? { prompt: effectivePrompt } : {}) }
				) as TFunctionConfig;

				const result = vercelFunc(resultConfig);

				// Update result augmentation logic:
				// messagesPrefix should contain:
				// 1. The messages from config.prompt if it was an array
				// 2. The new user message created from the effectivePrompt if it existed
				const userMessageFromString: ModelMessage | undefined = (typeof effectivePrompt === 'string' && effectivePrompt.length > 0)
					? ({ role: 'user', content: effectivePrompt } as ModelMessage)
					: undefined;

				const messagesPrefix = [...configPromptAsMessages, ...(userMessageFromString ? [userMessageFromString] : [])];
				const historyPrefixFull = callArgumentMessages ?? [];

				if ((vercelFunc as unknown) === generateText) {
					return (result as Promise<GenerateTextResult<any, any>>).then((r) => augmentGenerateText(r, messagesPrefix, historyPrefixFull)) as TFunctionResult;
				} else if ((vercelFunc as unknown) === streamText) {
					return augmentStreamText(result as StreamTextResult<any, any>, messagesPrefix, historyPrefixFull) as TFunctionResult;
				} else {
					return result;
				}
			}
		};
	}
	// Get the function name and capitalize it to create the type
	const functionName = vercelFunc.name;
	const type = functionName.charAt(0).toUpperCase() + functionName.slice(1);

	const callSignature = Object.assign(call, { config, type });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult, PT>;
}