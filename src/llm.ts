import { Context, ScriptPromptType, TemplatePromptType } from './types';
import * as configs from './types-config';
import { validateCall } from './validate';
import * as utils from './type-utils';
import { _createTemplate, TemplateCallSignature } from './factory-template';
import { _createScript, ScriptCallSignature } from './factory-script';
import { LanguageModel } from 'ai';
import { z } from 'zod';

export type LLMCallSignature<
	TConfig extends configs.OptionalPromptConfig,
	TResult
> = TConfig extends { promptType: 'text' }
	? (
		//TConfig has no template, no context argument is needed
		TConfig extends { prompt: string }
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
		TConfig extends { prompt: string }
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
	TConfig extends configs.OptionalPromptConfig & Partial<TFunctionConfig>
	& { debug?: boolean, model: LanguageModel, prompt: string }, // extends Partial<OptionalTemplatePromptConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
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
		call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<TFunctionResult> => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - template path called with:', { promptOrContext, maybeContext });
			}
			validateCall(config, promptOrContext, maybeContext);

			const renderedPrompt = await renderer(promptOrContext as string, maybeContext);
			//@todo - async option support

			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - rendered prompt:', renderedPrompt);
			}
			const result = await vercelFunc({ ...config, prompt: renderedPrompt } as unknown as TFunctionConfig);
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - vercelFunc result:', result);
			}
			return result;
		};
	} else {
		// No need to run the prompt through a template/script.
		// depending on the vercelFunc, the result may be a promise or not
		call = (prompt: string): TFunctionResult => {
			if (config.debug) {
				console.log('[DEBUG] createLLMRenderer - text path called with prompt:', prompt);
			}
			validateCall(config, prompt);
			prompt = prompt || config.prompt;
			const result = vercelFunc({ ...config, prompt } as unknown as TFunctionConfig);
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

