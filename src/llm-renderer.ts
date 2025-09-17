import { Context, ScriptPromptType, TemplatePromptType } from './types/types';
import * as configs from './types/config';
import { validateLLMRendererCall } from './validate';
import * as utils from './types/utils';
import { _createTemplate, TemplateCallSignature } from './factories/Template';
import { _createScript, ScriptCallSignature } from './factories/Script';
import { LanguageModel, ModelMessage, generateObject, generateText, streamObject, streamText } from 'ai';
import type { GenerateTextResult, StreamTextResult } from 'ai';
import { z } from 'zod';
import { PromptStringOrMessagesSchema } from './types/schemas';
import { RequiredPromptType, AnyPromptSource } from './types/types';
import { ILoaderAny, loadString } from 'cascada-engine';
import { _createFunction, FunctionCallSignature } from './factories/Function';
import { augmentGenerateText, augmentStreamText } from './messages';

//@todo - INPUT like in template
export type LLMCallSignature<
	TConfig extends configs.BaseConfig, // & configs.OptionalPromptConfig,
	TResult,
	PType extends RequiredPromptType = RequiredPromptType,
	PROMPT extends AnyPromptSource = string,
	TConfigShape = Record<string, any>, //temporary default value
	TAllowedConfigShape = Omit<Partial<TConfigShape>, configs.RunConfigDisallowedProperties>
//INPUT extends Record<string, any> = TConfig extends { inputSchema: SchemaType<any> } ? utils.InferParameters<TConfig['inputSchema']> : Record<string, any>,
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
			run(config: TAllowedConfigShape): utils.EnsurePromise<TResult>;
		}
		: {
			// Required a prompt or messages
			(prompt: string | ModelMessage[], messages?: ModelMessage[]): utils.EnsurePromise<TResult>;
			(messages: ModelMessage[]): utils.EnsurePromise<TResult>;
			config: TConfig;
			type: string;
			run(config: TAllowedConfigShape): utils.EnsurePromise<TResult>;
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
			run(config: TAllowedConfigShape): utils.EnsurePromise<TResult>;
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
			run(config: TAllowedConfigShape): utils.EnsurePromise<TResult>;
		}
		: {
			// Requires a prompt, optional messages, and optional context
			//(prompt: string, message: ModelMessage[], context?: Context): utils.EnsurePromise<TResult>;
			(prompt: PROMPT, context?: Context): utils.EnsurePromise<TResult>;
			config: TConfig;
			type: string;
			run(config: TAllowedConfigShape): utils.EnsurePromise<TResult>;
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
	let processMessages: boolean = (vercelFunc as unknown) === generateText || (vercelFunc as unknown) === streamText ||
		(vercelFunc as unknown) === generateObject || (vercelFunc as unknown) === streamObject;

	let call;
	if (config.promptType !== 'text' && config.promptType !== 'text-name' && config.promptType !== undefined) {
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

			const { messages: messagesFromArgs } = extractCallArguments(promptOrMessageOrContext, messagesOrContext, maybeContext);
			if (processMessages &&
				!Array.isArray(renderedPrompt) && //the prompt is not rendered as messages
				!config.messages && //no messages in config.messages
				!messagesFromArgs) //no messages in call arguments
			{
				processMessages = false;
			}

			if (!processMessages) {
				// Replace the prompt property with the rendered prompt
				return await vercelFunc({ ...config, prompt: renderedPrompt } as TFunctionConfig);
			} else {
				// 1. Normalize the rendered prompt into a consistent message array format.
				const newMessagesFromPrompt: ModelMessage[] = Array.isArray(renderedPrompt)
					? renderedPrompt
					: [{ role: 'user', content: renderedPrompt }]; //create a single message array from the rendered string prompt

				// 2. Construct the final vercel config messages
				const vercelConfig = {
					...config,
					messages: [
						...(config.messages ?? []),
						...(messagesFromArgs ?? []),
						...newMessagesFromPrompt
					]
				};
				delete vercelConfig.prompt;//the rendered prompt was appended to the messages

				// 3. Execute the underlying Vercel AI function.
				const result = await vercelFunc(vercelConfig as TFunctionConfig);//streamer does not return a promise

				// 4. Augment the result for conversational history management.
				if ((vercelFunc as unknown) === generateText) {
					return augmentGenerateText(result as GenerateTextResult<any, any>, newMessagesFromPrompt, messagesFromArgs ?? []) as Awaited<TFunctionResult>;
				} else if ((vercelFunc as unknown) === streamText) {
					return augmentStreamText(result as StreamTextResult<any, any>, newMessagesFromPrompt, messagesFromArgs ?? []) as Awaited<TFunctionResult>;
				}
				return result; // no augmentation for other functions
			}
		};
	} else {
		// Static Path - vanilla text prompt,promptType is 'text' or undefined
		call = (promptOrMessages?: string | ModelMessage[], maybeMessages?: ModelMessage[]): TFunctionResult => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - text path called with:', { promptOrMessages, maybeMessages });
			}
			validateLLMRendererCall(config, config.promptType ?? 'text', promptOrMessages, maybeMessages);

			const { messages: messagesFromArgs, prompt: promptFromArgs } = extractCallArguments(promptOrMessages, maybeMessages);
			if (processMessages && !config.messages && !Array.isArray(config.prompt) && !messagesFromArgs && !Array.isArray(promptFromArgs)) {
				//no messages in config.messages, config.prompt, or call arguments, so we don't process messages
				processMessages = false;
			}

			if (!processMessages) {
				return vercelFunc({ ...config, prompt: promptFromArgs ?? config.prompt } as TFunctionConfig);
			} else {
				// 1. Normalize the rendered prompt into a consistent message array format.
				const prompt = (promptFromArgs ?? config.prompt);
				const newMessagesFromPrompt: ModelMessage[] = prompt ? [{ role: 'user', content: prompt }] : []; //create a single message array from the rendered string prompt

				/// 2. Construct the final vercel config messages
				const vercelConfig = {
					...config,
					messages: [
						...(config.messages ?? []),
						...(messagesFromArgs ?? []),
						...newMessagesFromPrompt
					]
				};
				delete vercelConfig.prompt;//the rendered prompt was appended to the messages

				// 3. Execute the underlying Vercel AI function.
				const result = vercelFunc(vercelConfig as TFunctionConfig);

				// 4. Augment the result for conversational history management.
				if ((vercelFunc as unknown) === generateText) {
					return (result as Promise<GenerateTextResult<any, any>>).then((r) => augmentGenerateText(r, newMessagesFromPrompt, messagesFromArgs)) as TFunctionResult;
				} else if ((vercelFunc as unknown) === streamText) {
					return augmentStreamText(result as StreamTextResult<any, any>, newMessagesFromPrompt, messagesFromArgs) as TFunctionResult;
				}
				return result;
			}
		};
		if (config.promptType === 'text-name') {
			// wrap the call in a promise that waits for the prompt to be loaded
			// from loaders and only when it is ready - calls the original prompt

			// Validate loader exists
			const loaderConfig = config as configs.LoaderConfig;
			if (!('loader' in loaderConfig)) {
				throw new Error("A 'loader' is required for 'text-name' prompt type");
			}

			let loadedPrompt: Promise<string> | string | undefined = config.prompt ? loadString(config.prompt, loaderConfig.loader as (ILoaderAny | ILoaderAny[])) : undefined;
			let messages: ModelMessage[] | undefined = config.messages;

			const syncCall = call;
			call = async (promptOrMessages?: string | ModelMessage[], maybeMessages?: ModelMessage[]): Promise<TFunctionResult> => {
				let prompt: string | undefined;
				try {
					if (promptOrMessages && typeof promptOrMessages === 'string') {
						prompt = await loadString(promptOrMessages, loaderConfig.loader as (ILoaderAny | ILoaderAny[]));
						messages = maybeMessages;
					} else if (loadedPrompt) {
						if (typeof loadedPrompt === 'string') {
							prompt = loadedPrompt;
						} else {
							// Cache the resolved promise to avoid re-awaiting
							prompt = await loadedPrompt;
							loadedPrompt = prompt; // Store resolved value for future calls
						}
						if (promptOrMessages) {
							messages = promptOrMessages as ModelMessage[];
						} else {
							messages = maybeMessages;
						}
					} else {
						throw new Error('No prompt provided. Either configure a prompt in the config or provide one at call time.');
					}
				} catch (error) {
					if (error instanceof Error && error.message.includes('not found')) {
						throw new Error(`Failed to load prompt: ${error.message}`);
					}
					throw error;
				}
				return syncCall(prompt, messages);
			}
		}
	}
	// Get the function name and capitalize it to create the type
	const functionName = vercelFunc.name;
	const type = functionName.charAt(0).toUpperCase() + functionName.slice(1);

	const callSignature = Object.assign(call, { config, type });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult, PT>;
}