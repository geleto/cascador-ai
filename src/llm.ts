import { Context, ScriptPromptType, TemplatePromptType } from './types/types';
import * as configs from './types/config';
import { validateCall } from './validate';
import * as utils from './types/utils';
import { _createTemplate, TemplateCallSignature } from './factories/Template';
import { _createScript, ScriptCallSignature } from './factories/Script';
import { LanguageModel, ModelMessage } from 'ai';
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
			const renderedPrompt = (await renderer(promptOrMessageOrContext as string, messagesOrContext)) as string;
			//@todo - async option support

			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - rendered prompt:', renderedPrompt);
			}

			// Build messages: prefer argument messages, else config messages. Always append rendered prompt as a user message if messages exist
			const finalMessages = buildMessagesWithPrompt(messagesFromArgs ?? config.messages, renderedPrompt);

			// In non-text modes, prompt is required; we send both prompt and messages (augmented) when messages exist
			const resultConfig = {
				...config,
				prompt: renderedPrompt,
				...(finalMessages ? { messages: finalMessages } : {}),
			} as TFunctionConfig;

			const result = await vercelFunc(resultConfig);
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
			}
			return result;
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
			const finalMessages = buildMessagesWithPrompt(baseMessages, effectivePrompt);

			// Build payload: keep prompt as-is; when messages provided, we include augmented copy
			const resultConfig = {
				...(config as unknown as Record<string, unknown>),
				...(effectivePrompt !== undefined ? { prompt: effectivePrompt } : {}),
				...(finalMessages ? { messages: finalMessages } : {}),
			} as TFunctionConfig;

			const result = vercelFunc(resultConfig);
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

