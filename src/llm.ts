import { Context, PromptOrMessage, TemplatePromptType } from './types';
import * as configs from './types-config';
import { validateCall } from './validate';
import * as utils from './type-utils';
import { TemplateRenderer } from './factory-template';

export type LLMCallSignature<
	TConfig extends configs.OptionalTemplateConfig,
	TResult
> = TConfig extends { promptType: 'text' }
	? (
		//TConfig has no template, no context argument is needed
		TConfig extends PromptOrMessage
		? {
			(prompt?: string): TResult;//TConfig has prompt, prompt is optional
			config: TConfig;
		}
		: {
			(prompt: string): TResult;//TConfig has no prompt, prompt argument is required
			config: TConfig;
		}
	)
	: (
		// TConfig has template, an optional context argument can be used
		// and the return type is always a promise because we wait for the result
		TConfig extends PromptOrMessage
		? {
			//TConfig has prompt, prompt is optional
			(promptOrContext?: Context | string): utils.EnsurePromise<TResult>;//one optional argument, prompt or context
			(prompt: string, context: Context): utils.EnsurePromise<TResult>;//two arguments, prompt and context
			config: TConfig;
		}
		: {
			//TConfig has no prompt, prompt argument is required
			(prompt: string, context?: Context): utils.EnsurePromise<TResult>;//prompt is a must, context is optional
			config: TConfig;
		}
	);

export function createLLMRenderer<
	TConfig extends configs.OptionalTemplateConfig & Partial<TFunctionConfig>, // extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TFunctionConfig extends Record<string, any>,
	TFunctionResult,
>(
	config: TConfig,
	vercelFunc: (config: TFunctionConfig) => TFunctionResult
): LLMCallSignature<TConfig, TFunctionResult> {
	// Debug output if config.debug is true
	if (config.debug) {
		console.log('[DEBUG] createLLMRenderer called with config:', JSON.stringify(config, null, 2));
	}

	let call;
	if (config.promptType !== 'text') {
		// We have to run the prompt through a template first.
		const renderer = TemplateRenderer(config as configs.TemplateConfig & { promptType: TemplatePromptType });
		call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<TFunctionResult> => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - template path called with:', { promptOrContext, maybeContext });
			}
			validateCall(config, promptOrContext, maybeContext);
			let renderedPrompt: string;

			if (typeof promptOrContext === 'string') {
				renderedPrompt = await renderer(promptOrContext, maybeContext);
			} else {
				renderedPrompt = await renderer(config.prompt!, promptOrContext);
			}
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - rendered prompt:', renderedPrompt);
			}
			if (config.messages) {
				//todo: add the prompt to the messages
				//config.messages.push(renderedPrompt);
			}
			const result = await vercelFunc({ ...config, prompt: renderedPrompt } as unknown as TFunctionConfig);
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
			}
			return result;
		};
	} else {
		// No need to run the prompt through a template.
		call = async (prompt: string): Promise<TFunctionResult> => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - text path called with prompt:', prompt);
			}
			validateCall(config, prompt);
			const result = await vercelFunc({ ...config, prompt } as unknown as TFunctionConfig);
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
			}
			return result;
		};
	}
	const callSignature = Object.assign(call, { config });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult>;
}

