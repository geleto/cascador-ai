import { Context, ScriptPromptType, TemplatePromptType } from './types/types';
import * as configs from './types/config';
import { validateCall } from './validate';
import * as utils from './types/utils';
import { _createTemplate, TemplateCallSignature } from './factories/Template';
import { _createScript, ScriptCallSignature } from './factories/Script';
import { LanguageModel, ModelMessage, ToolSet, generateText, streamText } from 'ai';
import type { GenerateTextResult, StreamTextResult } from './types/result';
import { z } from 'zod';

export type LLMCallSignature<
	TConfig extends configs.OptionalPromptConfig,
	TResult
> = TConfig extends { promptType: 'text' }
	? (
		// TConfig has no template, no context argument is needed
		// We can have either a prompt or messages, but not both. No context as nothing is rendered.
		TConfig extends { prompt: string } | { messages: ModelMessage[] }
		? {
			// Optional prompt/messages
			(promptOrMessage?: string | ModelMessage[], messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
			config: TConfig;
		}
		: {
			// Required a prompt or messages
			(prompt: string, messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
			(messages: ModelMessage[]): utils.EnsurePromise<TResult>;
			config: TConfig;
		}

	)
	: (
		// TConfig has template or script; return type is always a promise
		// we can have a prompt and/or messages at the same time (prompt are required and get rendered).
		TConfig extends { prompt: string }
		? {
			// Config already has a prompt => Optional prompt, optional messages, and optional context
			(promptOrMessageOrContext?: string | ModelMessage[] | Context, messagesOrContext?: ModelMessage[] | Context, context?: Context): utils.EnsurePromise<TResult>;
			config: TConfig;
		}
		: {
			// Requires a prompt, optional messages, and optional context
			(prompt: string, messagesOrContext?: ModelMessage[] | Context, context?: Context): utils.EnsurePromise<TResult>;
			config: TConfig;
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
			throw new Error('Context provided multiple times across arguments');
		}
		contextFromArgs = maybeContext;
	}

	return { prompt: promptFromArgs, messages: messagesFromArgs, context: contextFromArgs };
}

// Helpers to prepend the user message into returned results using lazy, memoized getters
function augmentGenerateText<TOOLS extends ToolSet = ToolSet, OUTPUT = never>(
	result: GenerateTextResult<TOOLS, OUTPUT>,
	userMessage: ModelMessage
): GenerateTextResult<TOOLS, OUTPUT> {
	type Messages = typeof result.response.messages;
	type Elem = Messages extends readonly (infer U)[] ? U : never;
	const originalResponse = result.response;
	let cachedMessages: Messages | undefined;
	const responseWithLazyMessages = Object.create(originalResponse) as typeof originalResponse & { messages: Messages, messageHistory: Messages };
	Object.defineProperty(responseWithLazyMessages, 'messages', {
		get() {
			if (cachedMessages !== undefined) return cachedMessages;
			const tail = (originalResponse as typeof originalResponse & { messages: Messages }).messages;
			const newHead = userMessage as unknown as Elem;
			cachedMessages = [newHead, ...tail] as Messages;
			return cachedMessages;
		},
		enumerable: true,
		configurable: true,
	});
	Object.defineProperty(responseWithLazyMessages, 'messageHistory', {
		get() {
			// Reuse the same memoized array so we do not recompute
			return responseWithLazyMessages.messages;
		},
		enumerable: true,
		configurable: true,
	});
	return { ...result, response: responseWithLazyMessages };
}

function augmentStreamText<TOOLS extends ToolSet = ToolSet, PARTIAL = never>(
	result: StreamTextResult<TOOLS, PARTIAL>,
	userMessage: ModelMessage
): StreamTextResult<TOOLS, PARTIAL> {
	type ResponseT = Awaited<typeof result.response>;
	type Messages = ResponseT extends { messages: infer M extends readonly unknown[] } ? M : never;
	type Elem = Messages extends readonly (infer U)[] ? U : never;
	const newResponse = (result.response)
		.then((r) => {
			let cachedMessages: Messages | undefined;
			const responseWithLazyMessages = Object.create(r) as ResponseT & { messages: Messages, messageHistory: Messages };
			Object.defineProperty(responseWithLazyMessages, 'messages', {
				get() {
					if (cachedMessages !== undefined) return cachedMessages;
					const tail = (r as ResponseT & { messages: Messages }).messages;
					const newHead = userMessage as unknown as Elem;
					cachedMessages = [newHead, ...tail] as Messages;
					return cachedMessages;
				},
				enumerable: true,
				configurable: true,
			});
			Object.defineProperty(responseWithLazyMessages, 'messageHistory', {
				get() {
					return responseWithLazyMessages.messages;
				},
				enumerable: true,
				configurable: true,
			});
			return responseWithLazyMessages;
		});
	return { ...result, response: newResponse };
}

export function createLLMRenderer<
	TConfig extends configs.OptionalPromptConfig & Partial<TFunctionConfig>
	& { debug?: boolean, model: LanguageModel, prompt?: string, messages?: ModelMessage[] }, // extends Partial<OptionalTemplatePromptConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TFunctionConfig extends TConfig & { model: LanguageModel },
	TFunctionResult,
>(
	config: TConfig,
	vercelFunc: (config: TFunctionConfig) => TFunctionResult
): LLMCallSignature<TConfig, TFunctionResult> {
	// Debug output if config.debug is true
	if (config.debug) {
		console.log('[DEBUG] LLMRenderer created with config:', JSON.stringify(config, null, 2));
	}

	// Helper to create a copy of messages and append the prompt as a user message when available
	const buildMessagesWithPrompt = (existing: ModelMessage[] | undefined, promptToAppend?: string): ModelMessage[] | undefined => {
		if (!existing) return undefined;
		const messagesCopy = existing.slice();
		if (typeof promptToAppend === 'string' && promptToAppend.length > 0) {
			messagesCopy.push({ role: 'user', content: promptToAppend } as ModelMessage);
		}
		return messagesCopy;
	};

	let call;
	if (config.promptType !== 'text' && config.promptType !== undefined) {
		// We have to run the prompt through a template or script first
		//see if we can pre-compile the template/script
		let renderer: TemplateCallSignature<any> | ScriptCallSignature<any>;
		const isTemplatePrompt = config.promptType === 'template' || config.promptType === 'template-name' || config.promptType === 'async-template' || config.promptType === 'async-template-name';
		if (isTemplatePrompt) {
			type PromptType = Exclude<TemplatePromptType, undefined>;
			renderer = _createTemplate(config as { prompt: string, promptType: PromptType }, config.promptType as PromptType);
		} else {
			//the script must render a string (@todo - or Messages[])>
			//add a schema requiring a string to the config
			const textScriptConfig: configs.ScriptConfig<string> = { ...(config as configs.ScriptPromptConfig), schema: z.string() };
			renderer = _createScript(textScriptConfig, config.promptType as Exclude<ScriptPromptType, undefined>);
		}
		call = async (
			promptOrMessageOrContext?: string | ModelMessage[] | Context,
			messagesOrContext?: ModelMessage[] | Context,
			maybeContext?: Context
		): Promise<TFunctionResult> => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - template path called with:', { promptOrMessageOrContext, messagesOrContext, maybeContext });
			}
			validateCall(config, promptOrMessageOrContext, messagesOrContext, maybeContext);

			// Extract normalized args
			const { messages: messagesFromArgs } = extractCallArguments(promptOrMessageOrContext, messagesOrContext, maybeContext);

			// Render the prompt using the provided or config prompt
			//@todo - message support for all renderers
			//@todo - handle prompt rendering to messages
			//@todo - scripts will be able to render messages not just strings
			const rendered = await renderer(promptOrMessageOrContext as string, messagesOrContext) as string | ModelMessage[];
			//@todo - async option support

			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - rendered output:', Array.isArray(rendered) ? { type: 'messages', length: rendered.length } : { type: 'string', preview: String(rendered).slice(0, 120) });
			}

			// Build messages based on renderer output
			const baseMessages = messagesFromArgs ?? config.messages;
			let finalMessages: ModelMessage[] | undefined;

			if (Array.isArray(rendered)) {
				// Renderer returned messages, merge them with existing messages (if any)
				finalMessages = baseMessages ? baseMessages.concat(rendered) : rendered;

				const resultConfig = {
					...config,
					messages: finalMessages,
				} as TFunctionConfig;

				const result = await vercelFunc(resultConfig);
				if (config.debug) {
					console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
				}
				return result;
			} else {
				// Renderer returned a string prompt, append as a user message when messages exist
				const renderedString = typeof rendered === 'string' ? rendered : String(rendered);
				finalMessages = buildMessagesWithPrompt(baseMessages, renderedString);

				// If we appended messages, omit prompt; otherwise include prompt
				const resultConfig = (
					finalMessages
						? { ...config, messages: finalMessages }
						: { ...config, prompt: renderedString }
				) as TFunctionConfig;

				let result = await vercelFunc(resultConfig);
				if (finalMessages && baseMessages && renderedString.length > 0) {
					// we appended prompt as user message; include it in result messages
					const userMessage: ModelMessage = { role: 'user', content: renderedString } as ModelMessage;
					if ((vercelFunc as unknown) === generateText) {
						result = augmentGenerateText(result as GenerateTextResult<any, any>, userMessage) as Awaited<TFunctionResult>;
					} else if ((vercelFunc as unknown) === streamText) {
						result = augmentStreamText(result as StreamTextResult<any, any>, userMessage) as Awaited<TFunctionResult>;
					} else {
						// no augmentation for other functions
					}
				}
				if (config.debug) {
					console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
				}
				return result;
			}
		};
	} else {
		// No need to run the prompt through a template/script.
		// depending on the vercelFunc, the result may be a promise or not
		call = (prompt?: string, messages?: ModelMessage[]): TFunctionResult => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - text path called with:', { prompt, messages });
			}
			validateCall(config, prompt, messages);

			const promptFromConfig = config.prompt;
			const effectivePrompt = prompt ?? promptFromConfig;
			const messagesFromConfig = (config as unknown as { messages?: ModelMessage[] }).messages;
			const baseMessages = messages ?? messagesFromConfig;

			// If messages exist, append the prompt as a user message and DO NOT send prompt
			const finalMessages = buildMessagesWithPrompt(baseMessages, effectivePrompt);

			// Build payload: when messages were appended, drop 'prompt'; otherwise include 'prompt'
			const resultConfig = (
				finalMessages
					? { ...config, messages: finalMessages }
					: { ...config, ...(effectivePrompt !== undefined ? { prompt: effectivePrompt } : {}) }
			) as TFunctionConfig;

			const appendedPromptAsMessage = !!finalMessages && !!baseMessages && typeof effectivePrompt === 'string' && effectivePrompt.length > 0;

			const result = vercelFunc(resultConfig);
			if (appendedPromptAsMessage) {
				const userMessage: ModelMessage = { role: 'user', content: effectivePrompt } as ModelMessage;
				if ((vercelFunc as unknown) === generateText) {
					return (result as Promise<GenerateTextResult<any, any>>).then((r) => augmentGenerateText(r, userMessage)) as TFunctionResult;
				} else if ((vercelFunc as unknown) === streamText) {
					return (result as Promise<StreamTextResult<any, any>>).then((r) => augmentStreamText(r, userMessage)) as TFunctionResult;
				} else {
					return result;
				}
			}

			if (config.debug) {
				if (result instanceof Promise) {
					result.then((r) => {
						console.log('[DEBUG] createLLMRenderer - awauted vercelFunc result:', r);
					}).catch((error: unknown) => {
						console.error('[DEBUG] createLLMRenderer - vercelFunc error:', error);
					});
				} else {
					console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
				}
			}
			return result;
		};
	}
	const callSignature = Object.assign(call, { config });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult>;
}

