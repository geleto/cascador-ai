import { generateText } from 'ai';
import { Context, TextGeneratorConfig, GenerateTextConfig } from './types';
import { TemplateRenderer } from './TemplateRenderer';

/**
 * TextGenerator class that generates text using an LLM after rendering the template.
 * Can be called as a function in two ways:
 *
 * 1. With a string prompt and optional context:
 *    await generator('Write about {{ topic }}', { topic: 'AI' })
 *
 * 2. With a config override object:
 *    await generator({ context: { topic: 'AI' }, temperature: 0.7 })
 */
export class TextGenerator extends TemplateRenderer {
	constructor(config: TextGeneratorConfig) {
		if (!config.model) {
			throw new Error('TextGenerator requires a model to be specified');
		}
		super(config);
	}

	async(promptOrConfig?: string | Partial<TextGeneratorConfig>, context?: Context): Promise<string> {
		if (typeof promptOrConfig === 'string') {
			return this.generate(promptOrConfig, context);
		}

		if (promptOrConfig && typeof promptOrConfig === 'object') {
			// Ensure model is present in merged config
			if (!promptOrConfig.model && !(this.config as TextGeneratorConfig).model) {
				throw new Error('TextGenerator requires a model to be specified');
			}

			const tempGenerator = new TextGenerator({
				...this.config,
				...promptOrConfig,
			} as TextGeneratorConfig);
			return tempGenerator.generate();
		}

		return this.generate();
	}

	private async generate(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
		// First render the template
		const renderedPrompt = await this.render(promptOverride, contextOverride);

		// Extract all properties except those from TemplateConfig
		const {
			context: _context,
			filters: _filters,
			loader: _loader,
			promptName: _promptName,
			parent: _parent,
			...aiConfig
		} = this.config as TextGeneratorConfig;

		// Call generateText with the rendered prompt and ai config
		const generateConfig: GenerateTextConfig = {
			...aiConfig,
			prompt: renderedPrompt
		};

		const response = await generateText(generateConfig);
		return response.text;
	}
}