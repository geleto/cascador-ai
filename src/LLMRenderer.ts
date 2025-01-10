import { Context, CommonConfig, TemplateConfig } from './types';
import { TemplateRenderer } from './TemplateRenderer';

/**
 * Base LLM renderer class for all AI generators and streamers.
 * Handles template rendering and LLM configuration.
 */
export abstract class LLMRenderer<TConfig extends CommonConfig, TResult> extends TemplateRenderer<TConfig, TResult> {
	constructor(config: TConfig) {
		if (!('model' in config) || !config.model) {
			throw new Error('LLMRenderer requires a model to be specified');
		}
		super(config);
	}

	protected getLLMConfig<T extends CommonConfig>(config: T): Omit<T, keyof TemplateConfig> {
		// Get keys of TemplateConfig to exclude them
		const templateKeys: Array<keyof TemplateConfig> = [
			'context',
			'filters',
			'loader',
			'promptName',
			'parent',
		];

		// Create new object with all properties except template ones
		const llmConfig = Object.fromEntries(
			Object.entries(config).filter(([key]) => !templateKeys.includes(key as keyof TemplateConfig))
		);

		return llmConfig as Omit<T, keyof TemplateConfig>;
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
		const renderedPrompt = await this.render(promptOverride, contextOverride);

		// Get LLM config without template properties
		const llmConfig: Omit<TConfig, keyof TemplateConfig> = this.getLLMConfig(this.config as TConfig);

		// Call the specific LLM function provided by derived class
		return this.callLLMFunction({
			...llmConfig,
			prompt: renderedPrompt
		} as Omit<TConfig, keyof TemplateConfig>);
	}

	protected abstract callLLMFunction(config: Omit<TConfig, keyof TemplateConfig>): Promise<TResult>;
}