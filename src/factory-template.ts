import { TemplateEngine } from './TemplateEngine';
import { ConfigProvider, mergeConfigs } from './ConfigData';
import { validateBaseConfig, ConfigError } from './validate';
import * as configs from './types-config';
import * as utils from './type-utils';
import { Context, TemplatePromptType } from './types';

//@todo Simplify, may not need extends
export type TemplateRendererInstance<CONFIG extends configs.OptionalTemplateConfig> = TemplateCallSignature<CONFIG>;

type TemplateCallSignature<TConfig extends configs.OptionalTemplateConfig> =
	TConfig extends { prompt: string }
	? {
		//TConfig has prompt, no prompt argument is needed
		(promptOrContext?: Context | string): Promise<string>;//one optional argument, prompt or context
		(prompt: string, context: Context): Promise<string>;//two arguments, prompt and context
		config: TConfig;
	}
	: {
		//TConfig has no prompt, prompt argument is needed
		(prompt: string, context?: Context): Promise<string>;//prompt is a must, context is optional
		config: TConfig;
	};

// Internal common creator for template renderer
function _createTemplateRenderer(
	config: configs.TemplateConfig,
	promptType: Exclude<TemplatePromptType, undefined>,
	parent?: ConfigProvider<configs.TemplateConfig>
): TemplateCallSignature<any> {
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(parent.config, config)
		: config;

	// Force intended promptType based on entry point
	merged.promptType = promptType;

	validateBaseConfig(merged);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] TemplateRenderer created with config:', JSON.stringify(merged, null, 2));
	}

	// @todo - .loadsTemplate()
	if ((merged.promptType === 'template-name' || merged.promptType === 'async-template-name') && !('loader' in merged)) {
		throw new ConfigError('Template name types require a loader');
	}

	if ((merged.promptType === 'template-name' ||
		merged.promptType === 'async-template-name') &&
		!merged.loader
	) {
		throw new Error('A loader is required when promptType is "template-name", "async-template-name", or undefined.');
	}

	const renderer = new TemplateEngine(merged);

	// Define the call function that handles both cases
	const call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<string> => {
		if ('debug' in merged && merged.debug) {
			console.log('[DEBUG] TemplateRenderer - call function called with:', { promptOrContext, maybeContext });
		}

		//the contexts are merged in render
		if (typeof promptOrContext === 'string') {
			const result = await renderer.render(promptOrContext, maybeContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] TemplateRenderer - render result:', result);
			}
			return result;
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when the first is not a string prompt.');
			}
			const result = await renderer.render(undefined, promptOrContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] TemplateRenderer - render result:', result);
			}
			return result;
		}
	};

	const callSignature = Object.assign(call, { config: merged });

	return callSignature as TemplateCallSignature<any>;
}

// Default behavior: inline/embedded template
export function baseTemplateRenderer<
	const TConfig extends configs.TemplateConfig
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig>
): TemplateCallSignature<TConfig>;

export function baseTemplateRenderer<
	TConfig extends configs.TemplateConfig,
	TParentConfig extends configs.TemplateConfig
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.TemplateConfig>>
): TemplateCallSignature<utils.Override<TParentConfig, TConfig>>;

export function baseTemplateRenderer(
	config: configs.TemplateConfig,
	parent?: ConfigProvider<configs.TemplateConfig>
): any {
	return _createTemplateRenderer(config, 'async-template', parent);
}

// loadsTemplate: load by name via provided loader
export function loadsTemplate<
	const TConfig extends configs.TemplateConfig & configs.LoaderConfig
>(
	config: TConfig
): TemplateCallSignature<TConfig>;

export function loadsTemplate<
	TConfig extends configs.TemplateConfig & configs.LoaderConfig,
	TParentConfig extends configs.TemplateConfig & configs.LoaderConfig
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
): TemplateCallSignature<utils.Override<TParentConfig, TConfig>>;

export function loadsTemplate(
	config: configs.TemplateConfig & configs.LoaderConfig,
	parent?: ConfigProvider<configs.TemplateConfig & configs.LoaderConfig>
): any {
	return _createTemplateRenderer(config, 'async-template-name', parent);
}

export const TemplateRenderer = Object.assign(baseTemplateRenderer, {
	loadsTemplate,
});