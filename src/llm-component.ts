import { Context, ScriptPromptType, TemplatePromptType } from './types/types';
import * as configs from './types/config';
import { validateLLMComponentCall } from './validate';
import * as utils from './types/utils';
import { _createTemplate, TemplateCallSignature } from './factories/Template';
import { _createScript, ScriptCallSignature } from './factories/Script';
import { LanguageModel, ModelMessage, generateObject, generateText, streamObject, streamText } from 'ai';
import type { GenerateTextResult, StreamTextResult } from 'ai';
import { PromptStringOrMessagesSchema } from './types/schemas';
import { RequiredPromptType, AnyPromptSource } from './types/types';
import { ILoaderAny, loadString } from 'cascada-engine';
import { _createFunction, FunctionCallSignature } from './factories/Function';
import { augmentGenerateText, augmentStreamText } from './messages';
import { mergeConfigs } from './config-utils';

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

//@todo - the promptComponent shall use a precompiled template/script when created with a template/script promptType
export function _createLLMComponent<
	TConfig extends configs.OptionalPromptConfig & Partial<TFunctionConfig> & { context?: Context }
	& { debug?: boolean, model: LanguageModel, prompt?: string, messages?: ModelMessage[] }, // extends Partial<OptionalTemplatePromptConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TFunctionConfig extends TConfig & { model: LanguageModel }, //@todo - rename to TVercelConfig
	TFunctionResult, //rename to TResult
	PT extends RequiredPromptType = RequiredPromptType
>(
	config: TConfig,
	vercelFunc: (config: TFunctionConfig) => TFunctionResult
): LLMCallSignature<TConfig, TFunctionResult, PT, AnyPromptSource, configs.BaseConfig> {
	// Debug output if config.debug is true
	if (config.debug) {
		console.log('[DEBUG] LLMComponent created with config:', JSON.stringify(config, null, 2));
	}

	// The Vercel AI SDK functions for text and object generation accept a 'messages' array as input
	// to provide conversational context. This is crucial for building chat agents and multi-step workflows.
	let processMessages: boolean = (vercelFunc as unknown) === generateText || (vercelFunc as unknown) === streamText ||
		(vercelFunc as unknown) === generateObject || (vercelFunc as unknown) === streamObject;

	let call;
	let run: (
		configArg: Partial<configs.BaseConfig> & { messages?: ModelMessage[], prompt?: string, context?: Context },
		calledFromCall: boolean
	) => TFunctionResult | Promise<TFunctionResult>;

	if (config.promptType !== 'text' && config.promptType !== 'text-name' && config.promptType !== undefined) {
		// Dynamic Path - use Template/Script/Function to render the prompt
		//let renderer: TemplateCallSignature<any, any> | ScriptCallSignature<any, any, any> | FunctionCallSignature<any, any, any>;
		type ScriptAndFunctionOutput = string | ModelMessage[];
		type FunctionComponent = FunctionCallSignature<configs.FunctionConfig<any, ScriptAndFunctionOutput> & { execute: (context: Context) => Promise<ScriptAndFunctionOutput> }, any, ScriptAndFunctionOutput>;
		type ScriptComponent = ScriptCallSignature<configs.ScriptConfig<any, ScriptAndFunctionOutput> & { script: string }, any, ScriptAndFunctionOutput>;
		type TemplateComponent = TemplateCallSignature<configs.TemplateConfig<any> & { template: string }, any>;

		let renderer: TemplateComponent | ScriptComponent | FunctionComponent;
		const isTemplatePrompt = config.promptType === 'template' || config.promptType === 'template-name' || config.promptType === 'async-template' || config.promptType === 'async-template-name';
		const isScriptPrompt = config.promptType === 'script' || config.promptType === 'script-name' || config.promptType === 'async-script' || config.promptType === 'async-script-name';
		const isFunctionPrompt = config.promptType === 'function';

		if (isTemplatePrompt) {
			const templateConfig = {
				...copyConfigProperties(config, configs.TemplateConfigKeys),
				template: config.prompt
			};
			renderer = _createTemplate(templateConfig, config.promptType as TemplatePromptType) as TemplateComponent;
		} else if (isScriptPrompt) {
			// The LLM renderer's 'prompt' becomes the 'script' for the Script factory.
			const scriptConfig = {
				...copyConfigProperties(config, configs.ScriptConfigKeys),
				script: config.prompt,
				schema: PromptStringOrMessagesSchema
			}
			renderer = _createScript(scriptConfig, config.promptType as ScriptPromptType) as ScriptComponent;
		} else if (isFunctionPrompt) {
			const functionConfig = {
				...copyConfigProperties(config, configs.FunctionConfigKeys),
				execute: config.prompt as (context: Context) => Promise<string | ModelMessage[]>
			};
			renderer = _createFunction(functionConfig as configs.FunctionConfig<any, any>) as FunctionComponent;
		} else {
			throw new Error(`Unhandled prompt type: ${config.promptType}`);
		}
		run = async (
			configArg: Partial<configs.BaseConfig> & { messages?: ModelMessage[], prompt?: string, context?: Context },
			calledFromCall = false
		): Promise<TFunctionResult> => {
			//  Merge configurations to get a complete view for this run.
			// Call-time arguments (configArg) override factory settings (config).
			const runConfig = mergeConfigs(config, configArg);

			if (!calledFromCall) {
				if (config.debug) {
					console.log(`[DEBUG] LLM ${config.promptType!} run() called with:`, { configArg });
				}
				validateLLMComponentCall(config, config.promptType!, undefined);
			}

			// Render the prompt
			let renderedPrompt: string | ModelMessage[];
			if (configArg.prompt && !isFunctionPrompt) {
				//re-compile with the new prompt
				renderedPrompt = await (renderer as TemplateComponent | ScriptComponent)(configArg.prompt, runConfig.context) as string | ModelMessage[];
			} else {
				// the renderer has precompiled script/template or is a function, just give it the context
				renderedPrompt = await renderer(runConfig.context) as string | ModelMessage[];
			}

			if (runConfig.debug) {
				console.log('[DEBUG] LLMComponent.run executed with:', { configArg, renderedPrompt });
			}

			// Directly translate the original `processMessages` check.
			// We modify the `processMessages` variable from the parent closure, just like the original.
			if (processMessages &&
				!Array.isArray(renderedPrompt) && // The rendered prompt is a string
				!runConfig.messages) // The merged config has no messages.
			{
				processMessages = false;
			}

			// Execute the appropriate path, mirroring the original if/else structure.
			if (!processMessages) {
				// Path for simple, non-conversational prompts.
				return await vercelFunc({ ...runConfig, prompt: renderedPrompt } as TFunctionConfig);
			} else {
				// Path for conversations using the `messages` array.
				// 1. Normalize the newly rendered prompt into a message array format.
				const newMessagesFromPrompt: ModelMessage[] = renderedPrompt
					? (Array.isArray(renderedPrompt) ? renderedPrompt : [{ role: 'user', content: renderedPrompt }])
					: [];

				// 2. Construct the final message list for the Vercel AI SDK.
				const vercelConfig = {
					...runConfig,
					messages: [
						// Note: Your mergeConfigs concatenates messages, so runConfig.messages already contains factory + call-time messages.
						...(runConfig.messages ?? []),
						...newMessagesFromPrompt
					]
				};
				delete vercelConfig.prompt; // The prompt is now in `messages`, so remove the top-level property.

				// 3. Execute the underlying Vercel AI function.
				const result = await vercelFunc(vercelConfig as TFunctionConfig);

				// 4. Augment the result for history management.
				if ((vercelFunc as unknown) === generateText) {
					return augmentGenerateText(result as GenerateTextResult<any, any>, newMessagesFromPrompt, configArg.messages ?? []) as Awaited<TFunctionResult>;
				} else if ((vercelFunc as unknown) === streamText) {
					return augmentStreamText(result as StreamTextResult<any, any>, newMessagesFromPrompt, configArg.messages ?? []) as Awaited<TFunctionResult>;
				}
				return result;
			}
		};
		call = async (
			promptOrMessageOrContext?: string | ModelMessage[] | Context,
			messagesOrContext?: ModelMessage[] | Context,
			maybeContext?: Context
		): Promise<TFunctionResult> => {
			if (config.debug) {
				console.log(`[DEBUG] LLM ${config.promptType!} caller called with:`, { promptOrMessageOrContext, messagesOrContext, maybeContext });
			}
			validateLLMComponentCall(config, config.promptType!, promptOrMessageOrContext, messagesOrContext, maybeContext);

			const { prompt, messages, context } = extractCallArguments(promptOrMessageOrContext, messagesOrContext, maybeContext);
			const callConfig = {
				...(prompt !== undefined && { prompt }),
				...(messages !== undefined && { messages }),
				...(context !== undefined && { context })
			};
			return run(callConfig, true);
		};
	} else {
		// Static Path - vanilla text prompt,promptType is 'text' or undefined
		run = (
			configArg: Partial<configs.BaseConfig> & { messages?: ModelMessage[], prompt?: string, context?: Context },
			calledFromCall = false
		): TFunctionResult => {
			if (!calledFromCall) {
				if (config.debug) {
					console.log(`[DEBUG] LLM ${config.promptType!} run() called with:`, { configArg });
				}
				validateLLMComponentCall(config, config.promptType ?? 'text', undefined);
			}
			const runConfig = mergeConfigs(config, configArg) as TFunctionConfig;
			if (processMessages &&
				!runConfig.messages &&
				!Array.isArray(runConfig.prompt)) {
				//no messages in config and call config and prompt is not messages, so we don't process messages
				processMessages = false;
			}

			if (!processMessages) {
				return vercelFunc({ ...config, prompt: runConfig.prompt } as TFunctionConfig);
			} else {
				// 1. Normalize the rendered prompt into a consistent message array format.
				const newMessagesFromPrompt: ModelMessage[] = runConfig.prompt ? [{ role: 'user', content: runConfig.prompt }] : []; //create a single message array from the rendered string prompt

				/// 2. Construct the final vercel config messages
				const vercelConfig = {
					...runConfig,
					messages: [
						...(runConfig.messages ?? []),
						...newMessagesFromPrompt
					]
				};
				delete vercelConfig.prompt;//the rendered prompt was appended to the messages

				// 3. Execute the underlying Vercel AI function.
				const result = vercelFunc(vercelConfig as TFunctionConfig);

				// 4. Augment the result for conversational history management.
				if ((vercelFunc as unknown) === generateText) {
					return (result as Promise<GenerateTextResult<any, any>>).then((r) => augmentGenerateText(r, newMessagesFromPrompt, configArg.messages)) as TFunctionResult;
				} else if ((vercelFunc as unknown) === streamText) {
					return augmentStreamText(result as StreamTextResult<any, any>, newMessagesFromPrompt, configArg.messages) as TFunctionResult;
				}
				return result;
			}
		};
		call = (promptOrMessages?: string | ModelMessage[], maybeMessages?: ModelMessage[]): TFunctionResult => {
			if (config.debug) {
				console.log('[DEBUG] createLLMComponent - text path called with:', { promptOrMessages, maybeMessages });
			}
			validateLLMComponentCall(config, config.promptType ?? 'text', promptOrMessages, maybeMessages);

			const { prompt, messages } = extractCallArguments(promptOrMessages, maybeMessages);
			const callConfig = {
				...(prompt !== undefined && { prompt }),
				...(messages !== undefined && { messages }),
			};
			return run(callConfig, true) as TFunctionResult;
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
			//const messages: ModelMessage[] | undefined = config.messages;
			const syncRun = run;
			run = async (
				configArg: Partial<configs.BaseConfig> & { messages?: ModelMessage[], prompt?: string, context?: Context, loader?: ILoaderAny | ILoaderAny[] },
				calledFromCall = false
			): Promise<TFunctionResult> => {
				//let prompt: string | undefined;
				let prompt: string | undefined;
				try {
					if (configArg.prompt && typeof configArg.prompt === 'string') {
						// a new prompt to load
						prompt = await loadString(configArg.prompt, loaderConfig.loader as (ILoaderAny | ILoaderAny[]));
						// messages = maybeMessages;
					} else if (loadedPrompt) {
						// a prompt load has started at creation time
						if (typeof loadedPrompt === 'string') {
							//prompt was resoved in a previous run
							prompt = loadedPrompt;
						} else {
							// Cache the resolved promise to avoid re-awaiting
							prompt = await loadedPrompt;
							loadedPrompt = prompt; // Store resolved value for future calls
						}
						//messages = configArg.messages;
					} else {
						throw new Error('No prompt provided. Either configure a prompt in the config or provide one when calling run().');
					}
				} catch (error) {
					if (error instanceof Error && error.message.includes('not found')) {
						throw new Error(`Failed to load prompt: ${error.message}`);
					}
					throw error;
				}
				//todo - skip messages property if no messages in configArg
				return syncRun({ ...configArg, prompt }, calledFromCall);
			};
		}
	}
	// Get the function name and capitalize it to create the type
	const functionName = vercelFunc.name;
	const type = functionName.charAt(0).toUpperCase() + functionName.slice(1);

	const callSignature = Object.assign(call, { config, type, run });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult, PT, AnyPromptSource, configs.BaseConfig>;
}