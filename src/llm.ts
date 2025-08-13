import { Context, ScriptPromptType, TemplatePromptType } from './types/types';
import * as configs from './types/config';
import { validateCall } from './validate';
import * as utils from './types/utils';
import { _createTemplate, TemplateCallSignature } from './factories/Template';
import { _createScript, ScriptCallSignature } from './factories/Script';
import { LanguageModel, ModelMessage, ToolSet, generateText, streamText } from 'ai';
import type { GenerateTextResult, StreamTextResult } from 'ai';
import type { GenerateTextResultAugmented, StreamTextResultAugmented } from './types/result';
import { z } from 'zod';
import { PromptStringOrMessagesSchema } from './types/schemas';
import { RequiredPromptType } from './types/types';

export type LLMCallSignature<
	TConfig extends configs.OptionalPromptConfig,
	TResult,
	PType extends RequiredPromptType = RequiredPromptType
> = PType extends 'text' | 'text-name'
	? (
		// TConfig has no template, no context argument is needed
		// We can have either a prompt or messages, but not both. No context as nothing is rendered.
		TConfig extends { prompt: string } | { messages: ModelMessage[] }
		? {
			// Optional prompt/messages
			(prompt: string, messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
			(messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
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
			(prompt: string, messages: ModelMessage[], context?: Context): utils.EnsurePromise<TResult>;
			(prompt: string | ModelMessage[], context?: Context): utils.EnsurePromise<TResult>;
			(context?: Context): utils.EnsurePromise<TResult>;
			config: TConfig;
		}
		: {
			// Requires a prompt, optional messages, and optional context
			//(prompt: string, message: ModelMessage[], context?: Context): utils.EnsurePromise<TResult>;
			(prompt: string, context?: Context): utils.EnsurePromise<TResult>;
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

// Helpers to prepend the user/message prefixes into returned results using lazy, memoized getters
function augmentGenerateText<TOOLS extends ToolSet = ToolSet, OUTPUT = never>(
	result: GenerateTextResult<TOOLS, OUTPUT>,
	prefixForMessages: ModelMessage[] | undefined,
	historyPrefix: ModelMessage[] | undefined,
): GenerateTextResultAugmented<TOOLS, OUTPUT> {
	//type Messages = typeof result.response.messages;
	type Messages = ModelMessage[];
	type ResponseWithMessages = { messages: Messages } & Record<string, unknown>;
	type ResponseWithHistory = ResponseWithMessages & { messageHistory: Messages };
	const originalResponse = result.response as unknown as ResponseWithMessages;

	let cachedMessages: Messages | undefined;
	let cachedMessageHistory: Messages | undefined;

	const responseProxy = new Proxy<ResponseWithHistory>(originalResponse as ResponseWithHistory, {
		get(target, prop, receiver): unknown {
			if (prop === 'messages') {
				if (cachedMessages !== undefined) return cachedMessages;
				const tail = (target as ResponseWithMessages).messages;
				const head = prefixForMessages ?? [];
				cachedMessages = [...head, ...tail];
				return cachedMessages;
			}
			if (prop === 'messageHistory') {
				if (cachedMessageHistory !== undefined) return cachedMessageHistory;
				const historyHead = historyPrefix ?? [];
				const tail = (target as ResponseWithMessages).messages;
				const head = prefixForMessages ?? [];
				cachedMessageHistory = [...historyHead, ...head, ...tail];
				return cachedMessageHistory;
			}
			return Reflect.get(target as object, prop, receiver) as unknown;
		},
		has(target, prop) {
			if (prop === 'messages' || prop === 'messageHistory') return true;
			return prop in target;
		},
		getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
			if (prop === 'messages') {
				return {
					configurable: true,
					enumerable: true,
					get: () => {
						if (cachedMessages !== undefined) return cachedMessages;
						const tail = (target as ResponseWithMessages).messages;
						const head = prefixForMessages ?? [];
						cachedMessages = [...head, ...tail];
						return cachedMessages;
					},
				} as PropertyDescriptor;
			}
			if (prop === 'messageHistory') {
				return {
					configurable: true,
					enumerable: true,
					get: () => {
						if (cachedMessageHistory !== undefined) return cachedMessageHistory;
						const historyHead = historyPrefix ?? [];
						const tail = (target as ResponseWithMessages).messages;
						const head = prefixForMessages ?? [];
						cachedMessageHistory = [...historyHead, ...head, ...tail];
						return cachedMessageHistory;
					},
				} as PropertyDescriptor;
			}
			return Object.getOwnPropertyDescriptor(target, prop as keyof typeof target);
		},
	});

	const resultProxy = new Proxy<GenerateTextResult<TOOLS, OUTPUT>>(result, {
		get(target, prop, receiver): unknown {
			if (prop === 'response') {
				return responseProxy;
			}
			return Reflect.get(target as object, prop, receiver) as unknown;
		},
	});

	return resultProxy as GenerateTextResultAugmented<TOOLS, OUTPUT>;
}

function augmentStreamText<TOOLS extends ToolSet = ToolSet, PARTIAL = never>(
	result: StreamTextResult<TOOLS, PARTIAL>,
	prefixForMessages: ModelMessage[] | undefined,
	historyPrefix: ModelMessage[] | undefined,
): StreamTextResultAugmented<TOOLS, PARTIAL> {
	//type Messages = ResponseT extends { messages: infer M extends readonly unknown[] } ? M : never;
	//type Elem = Messages extends readonly (infer U)[] ? U : never;
	type Messages = ModelMessage[];
	type ResponseWithMessages = { messages: Messages } & Record<string, unknown>;
	type ResponseWithHistory = ResponseWithMessages & { messageHistory: Messages };

	let cachedResponsePromise: Promise<ResponseWithHistory> | undefined;

	const getAugmentedResponse = (): Promise<ResponseWithHistory> => {
		cachedResponsePromise ??= (result.response as Promise<unknown>).then((r): ResponseWithHistory => {
			let cachedMessages: Messages | undefined;
			let cachedMessageHistory: Messages | undefined;

			const responseProxy = new Proxy<ResponseWithHistory>(r as ResponseWithHistory, {
				get(target, prop, receiver): unknown {
					if (prop === 'messages') {
						if (cachedMessages !== undefined) return cachedMessages;
						const tail = (target as ResponseWithMessages).messages;
						const head = prefixForMessages ?? [];
						cachedMessages = [...head, ...tail];
						return cachedMessages;
					}
					if (prop === 'messageHistory') {
						if (cachedMessageHistory !== undefined) return cachedMessageHistory;
						const historyHead = historyPrefix ?? [];
						const tail = (target as ResponseWithMessages).messages;
						const head = prefixForMessages ?? [];
						cachedMessageHistory = [...historyHead, ...head, ...tail];
						return cachedMessageHistory;
					}
					return Reflect.get(target as object, prop, receiver) as unknown;
				},
				has(target, prop) {
					if (prop === 'messages' || prop === 'messageHistory') return true;
					return prop in target;
				},
				getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
					if (prop === 'messages') {
						return {
							configurable: true,
							enumerable: true,
							get: () => {
								if (cachedMessages !== undefined) return cachedMessages;
								const tail = (target as ResponseWithMessages).messages;
								const head = prefixForMessages ?? [];
								cachedMessages = [...head, ...tail];
								return cachedMessages;
							},
						} as PropertyDescriptor;
					}
					if (prop === 'messageHistory') {
						return {
							configurable: true,
							enumerable: true,
							get: () => {
								if (cachedMessageHistory !== undefined) return cachedMessageHistory;
								const historyHead = historyPrefix ?? [];
								const tail = (target as ResponseWithMessages).messages;
								const head = prefixForMessages ?? [];
								cachedMessageHistory = [...historyHead, ...head, ...tail];
								return cachedMessageHistory;
							},
						} as PropertyDescriptor;
					}
					return Object.getOwnPropertyDescriptor(target, prop as keyof typeof target);
				},
			});

			return responseProxy;
		});
		return cachedResponsePromise;
	};

	const resultProxy = new Proxy<StreamTextResult<TOOLS, PARTIAL>>(result, {
		get(target, prop, receiver): unknown {
			if (prop === 'response') {
				return getAugmentedResponse();
			}
			return Reflect.get(target as object, prop, receiver) as unknown;
		},
	});

	return resultProxy as StreamTextResultAugmented<TOOLS, PARTIAL>;
}

export function createLLMRenderer<
	TConfig extends configs.OptionalPromptConfig & Partial<TFunctionConfig>
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
			// the script may render a string or messages; set a matching schema
			const textScriptConfig: configs.ScriptConfig<string | ModelMessage[]> = {
				...(config as configs.ScriptPromptConfig<string | ModelMessage[]>),
				schema: PromptStringOrMessagesSchema as z.ZodType<string | ModelMessage[]>, //the script may render a string or messages
			};
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

			// Build base message lists
			const configMessages = (config as unknown as { messages?: ModelMessage[] }).messages;
			const callArgumentMessages = messagesFromArgs;
			const combinedBase = [
				...(configMessages ?? []),
				...(callArgumentMessages ?? []),
			];

			const rendered = await renderer(promptOrMessageOrContext as string, messagesOrContext) as string | ModelMessage[];

			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - rendered output:', Array.isArray(rendered) ? { type: 'messages', length: rendered.length } : { type: 'string', preview: String(rendered).slice(0, 120) });
			}

			// Build messages based on renderer output
			let finalMessages: ModelMessage[] | undefined;

			if (Array.isArray(rendered)) {
				// Renderer returned messages, merge them with existing messages (config + args)
				finalMessages = combinedBase.length > 0 ? combinedBase.concat(rendered) : rendered;

				// Build payload for vercelFunc ensuring prompt is removed when sending messages
				const configWithoutPrompt = omitPrompt(config as unknown as TFunctionConfig);
				const resultConfig = {
					...configWithoutPrompt,
					messages: finalMessages,
				} as TFunctionConfig;

				let result = await vercelFunc(resultConfig);
				if ((vercelFunc as unknown) === generateText) {
					// Returned messages: prompt-derived messages + generated messages
					const messagesPrefix = rendered;
					const historyPrefixFull = [
						...(configMessages ?? []),
						...(callArgumentMessages ?? []),
					];
					result = augmentGenerateText(result as GenerateTextResult<any, any>, messagesPrefix, historyPrefixFull) as Awaited<TFunctionResult>;
				} else if ((vercelFunc as unknown) === streamText) {
					const messagesPrefix = rendered;
					const historyPrefixFull = [
						...(configMessages ?? []),
						...(callArgumentMessages ?? []),
					];
					result = augmentStreamText(result as StreamTextResult<any, any>, messagesPrefix, historyPrefixFull) as Awaited<TFunctionResult>;
				} else {
					// no augmentation for other functions
				}
				if (config.debug) {
					console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
				}
				return result;
			} else {
				// Renderer returned a string prompt, append as a user message when base messages exist
				const renderedString = typeof rendered === 'string' ? rendered : String(rendered);
				finalMessages = buildMessagesWithPrompt(combinedBase.length > 0 ? combinedBase : undefined, renderedString);

				// If we appended messages, omit prompt; otherwise include prompt
				const resultConfig = (
					finalMessages
						? (() => { const cfg = omitPrompt(config as unknown as TFunctionConfig); return { ...cfg, messages: finalMessages } as TFunctionConfig; })()
						: { ...config, prompt: renderedString }
				) as TFunctionConfig;

				let result = await vercelFunc(resultConfig);
				// Always augment so response.messages contains the prompt-derived user message + reply
				const userMessage: ModelMessage | undefined = renderedString.length > 0 ? ({ role: 'user', content: renderedString } as ModelMessage) : undefined;
				const messagesPrefix = userMessage ? [userMessage] : [];
				const historyPrefixFull = [
					...(configMessages ?? []),
					...(callArgumentMessages ?? []),
				];
				if ((vercelFunc as unknown) === generateText) {
					result = augmentGenerateText(result as GenerateTextResult<any, any>, messagesPrefix, historyPrefixFull) as Awaited<TFunctionResult>;
				} else if ((vercelFunc as unknown) === streamText) {
					result = augmentStreamText(result as StreamTextResult<any, any>, messagesPrefix, historyPrefixFull) as Awaited<TFunctionResult>;
				} else {
					// no augmentation for other functions
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
			const configMessages = messagesFromConfig;
			const callArgumentMessages = messages;
			const combinedBase = [
				...(configMessages ?? []),
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
			const userMessage: ModelMessage | undefined = (typeof effectivePrompt === 'string' && effectivePrompt.length > 0)
				? ({ role: 'user', content: effectivePrompt } as ModelMessage)
				: undefined;
			const messagesPrefix = userMessage ? [userMessage] : [];
			const historyPrefixFull = combinedBase;

			if ((vercelFunc as unknown) === generateText) {
				return (result as Promise<GenerateTextResult<any, any>>).then((r) => augmentGenerateText(r, messagesPrefix, historyPrefixFull)) as TFunctionResult;
			} else if ((vercelFunc as unknown) === streamText) {
				return augmentStreamText(result as StreamTextResult<any, any>, messagesPrefix, historyPrefixFull) as TFunctionResult;
			} else {
				return result;
			}
		};
	}
	const callSignature = Object.assign(call, { config });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult, PT>;
}

