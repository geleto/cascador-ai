import { Context, AnyLLMConfig, AnyLLMConfigPartial, TemplateConfig, AnyLLMResult } from './types';
import { TemplateRendererBase } from './TemplateRendererBase';

/**
 * Base LLM renderer class for all AI generators and streamers.
 * Handles template rendering and LLM configuration.
 */
export abstract class LLMRenderer<TConfig extends AnyLLMConfig, TResult extends AnyLLMResult> extends TemplateRendererBase {
	constructor(config: Partial<TConfig>) {
		super(config);

		if (!this.config.model) {
			throw new Error('LLMRenderer requires a model to be specified');
		}
	}

	async(promptOrConfig?: string | Partial<TConfig>, context?: Context): Promise<TResult> {
		if (typeof promptOrConfig === 'string') {
			return this.processWithLLM(promptOrConfig, context);
		}

		if (promptOrConfig && typeof promptOrConfig === 'object') {
			const tempRenderer = new (this.constructor as new (config: TConfig) => this)({
				...this.config,
				...promptOrConfig,
			} as TConfig);
			return tempRenderer.processWithLLM();
		}

		return this.processWithLLM();
	}

	protected async processWithLLM(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<TResult> {
		// First render the template
		const renderedPrompt: string = await this.render(promptOverride, contextOverride);

		// Call the specific LLM function provided by derived class
		return this.callLLMFunction({
			...this.config as TConfig,
			prompt: renderedPrompt
		});
	}

	protected abstract callLLMFunction(config: Partial<TConfig>): Promise<TResult>;
}