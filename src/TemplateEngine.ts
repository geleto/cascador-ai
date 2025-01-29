import { PAsyncEnvironment, PAsyncTemplate, compilePAsync } from 'cascada-tmpl';
import { Context, TemplateOnlyConfig } from './types';
import { ConfigData, mergeConfigs } from './ConfigData';

export interface TemplateCallSignature<TConfig extends TemplateOnlyConfig> {
	(promptOrConfig?: string | TemplateOnlyConfig, context?: Context): Promise<string>;
	config: TConfig;
}

type HasTemplateProperties<T> = T extends { prompt: string | undefined } | { promptName: string | undefined } ? true : false;


// Type for the call method parameter based on whether TConfig includes template properties
type CallParameter<TConfig> = HasTemplateProperties<TConfig> extends true
	? string | Partial<Omit<TemplateOnlyConfig, 'prompt' | 'promptName'>> | undefined
	: string | TemplateOnlyConfig;

export class TemplateEngine<TConfig extends Partial<TemplateOnlyConfig>> extends ConfigData<TConfig> {
	protected env: PAsyncEnvironment;
	protected templatePromise?: Promise<PAsyncTemplate>;
	protected template?: PAsyncTemplate;

	constructor(config: TConfig) {
		super(config);

		if (config.promptName && !config.loader) {
			throw new Error('Loader is required when using promptName');
		}

		// Initialize environment
		this.env = new PAsyncEnvironment(this.config.loader ?? null, this.config.options);

		// Add filters if provided
		if (this.config.filters) {
			for (const [name, filter] of Object.entries(this.config.filters)) {
				if (typeof filter === 'function') {
					this.env.addFilter(name, filter);
				}
			}
		}

		// Handle template compilation
		if (this.config.prompt) {
			this.template = compilePAsync(this.config.prompt, this.env);
		} else if (this.config.promptName) {
			this.templatePromise = this.env.getTemplatePAsync(this.config.promptName);
		}
	}

	async call(promptOrConfig?: CallParameter<TConfig>, context?: Context): Promise<string> {
		try {
			// If user passed a string prompt
			if (typeof promptOrConfig === 'string') {
				return await this.render(promptOrConfig, context);
			}

			// If user passed an object
			if (promptOrConfig && typeof promptOrConfig === 'object') {
				const newConfig = mergeConfigs(this.config, promptOrConfig);

				// Check for conflicting template properties
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (newConfig.prompt && newConfig.promptName) {
					throw new Error('Cannot specify both prompt and promptName');
				}

				// Validate that the merged config has either prompt or promptName
				if (!newConfig.prompt && !newConfig.promptName) {
					throw new Error('Either prompt or promptName must be specified');
				}

				// Validate loader requirement for promptName
				if (newConfig.promptName && !newConfig.loader) {
					throw new Error('Loader is required when using promptName');
				}

				return await this.render(newConfig.prompt, context);
			}

			// If nothing passed, validate existing config
			if (!this.config.prompt && !this.config.promptName) {
				throw new Error('Either prompt or promptName must be specified');
			}

			return await this.render(undefined, context);
		} catch (error: any) {
			const errorMessage = 'Template rendering failed: ' +
				(error instanceof Error ? error.message : 'Unknown error');

			const err = new Error(errorMessage, { cause: error });
			if (error instanceof Error) {
				err.stack = error.stack;
			}
			throw err;
		}
	}

	protected async render(
		promptOverride?: string,
		contextOverride?: Context
	): Promise<string> {
		try {
			if (this.templatePromise) {
				this.template = await this.templatePromise;
				this.templatePromise = undefined;
			}

			const mergedContext = contextOverride
				? { ...this.config.context, ...contextOverride }
				: this.config.context;

			if (promptOverride) {
				this.template = compilePAsync(promptOverride, this.env);
			}

			if (!this.template && this.config.promptName) {
				this.template = await this.env.getTemplatePAsync(this.config.promptName);
			}

			if (!this.template) {
				throw new Error('No template available to render');
			}

			return await this.template.render(mergedContext ?? {});
		} catch (error: any) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Template rendering failed: ${errorMessage}`, { cause: error });
		}
	}
}