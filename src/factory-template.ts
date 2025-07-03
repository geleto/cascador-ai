import { ConfigProvider } from './ConfigData';
import { TemplateEngine } from './TemplateEngine';
import { Context } from './types';
import * as configs from './types-config';
import { validateBaseConfig, ConfigError } from './validate';
import * as utils from './type-utils';
import { mergeConfigs } from './ConfigData';

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

// Single config overload
export function TemplateRenderer<TConfig extends configs.TemplateConfig>(
	config: utils.StrictType<TConfig, configs.TemplateConfig> & utils.RequireTemplateLoaderIfNeeded<TConfig>
): TemplateCallSignature<TConfig>;

// Config with parent overload - now properly returns only required properties in immediate config
export function TemplateRenderer<
	TConfig extends configs.TemplateConfig,
	TParentConfig extends configs.TemplateConfig
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig> & utils.RequireTemplateLoaderIfNeeded<utils.Override<TParentConfig, TConfig>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.TemplateConfig>>
): TemplateCallSignature<utils.Override<TParentConfig, TConfig>>;

// Implementation
export function TemplateRenderer<
	TConfig extends configs.TemplateConfig,
	TParentConfig extends configs.TemplateConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): [typeof parent] extends [undefined]
	? TemplateCallSignature<TConfig>
	: TemplateCallSignature<utils.Override<TParentConfig, TConfig>> {

	validateBaseConfig(config);
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(parent.config, config)
		: config;
	if (parent) {
		validateBaseConfig(merged);
	}

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
		if (typeof promptOrContext === 'string') {
			return renderer.render(promptOrContext, maybeContext);
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when not providing prompt.');
			}
			return renderer.render(undefined, promptOrContext);
		}
	};

	const callSignature = Object.assign(call, { config: merged });

	type ReturnType = [typeof parent] extends [undefined]
		? TemplateCallSignature<TConfig>
		: TemplateCallSignature<utils.Override<TParentConfig, TConfig>>;

	return callSignature as ReturnType;
}