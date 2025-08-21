import { TemplateEngine } from '../TemplateEngine';
import { ConfigProvider, mergeConfigs } from '../ConfigData';
import { validateBaseConfig, ConfigError } from '../validate';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import { Context, TemplatePromptType } from '../types/types';

//@todo Simplify, may not need extends
export type TemplateInstance<
	TConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
> = TemplateCallSignature<TConfig, INPUT>;

export type TemplateCallSignature<
	TConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
> =
	TConfig extends { prompt: string }//@todo - rename to template
	? {
		//TConfig has prompt, no prompt argument is needed
		(promptOrContext?: Context | string): Promise<string>;//one optional argument, prompt or context
		(prompt?: string, context?: Context): Promise<string>;//two arguments, prompt and context
		config: TConfig;
		type: string;
	}
	: {
		//TConfig has no prompt, prompt argument is needed
		(prompt: string, context?: Context): Promise<string>;//prompt is a must, context is optional
		config: TConfig;
		type: string;
	};

// Internal common creator for template renderer
export function _createTemplate(
	config: configs.TemplateConfig<any>,
	promptType: TemplatePromptType,
	parent?: ConfigProvider<configs.TemplateConfig<any>>
): TemplateCallSignature<any, any> {

	// Merge configs if parent exists, otherwise use provided config
	//, add promptType to the config
	const merged = parent
		? { ...mergeConfigs(parent.config, config), promptType: promptType }
		: { ...config, promptType: promptType };

	validateBaseConfig(merged);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] Template created with config:', JSON.stringify(merged, null, 2));
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
			console.log('[DEBUG] Template - call function called with:', { promptOrContext, maybeContext });
		}

		//the contexts are merged in render
		if (typeof promptOrContext === 'string') {
			const result = await renderer.render(promptOrContext, maybeContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] Template - render result:', result);
			}
			return result;
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when the first is not a string prompt.');
			}
			const result = await renderer.render(undefined, promptOrContext);
			if ('debug' in merged && merged.debug) {
				console.log('[DEBUG] Template - render result:', result);
			}
			return result;
		}
	};

	const callSignature = Object.assign(call, { config: merged, type: 'Template' });

	return callSignature as TemplateCallSignature<any, any>;
}

// Default behavior: inline/embedded template
function baseTemplate<
	const TConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig<INPUT>>
): TemplateCallSignature<TConfig, INPUT>;

function baseTemplate<
	TConfig extends configs.TemplateConfig<INPUT>,
	TParentConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig<INPUT>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.TemplateConfig<INPUT>>>
): TemplateCallSignature<utils.Override<TParentConfig, TConfig>, INPUT>;

function baseTemplate(
	config: configs.TemplateConfig<any>,
	parent?: ConfigProvider<configs.TemplateConfig<any>>
): any {
	return _createTemplate(config, 'async-template', parent);
}

// loadsTemplate: load by name via provided loader
function loadsTemplate<
	const TConfig extends configs.TemplateConfig<INPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>
>(
	config: TConfig
): TemplateCallSignature<TConfig, INPUT>;

function loadsTemplate<
	TConfig extends configs.TemplateConfig<INPUT> & configs.LoaderConfig,
	TParentConfig extends configs.TemplateConfig<INPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
): TemplateCallSignature<utils.Override<TParentConfig, TConfig>, INPUT>;

function loadsTemplate(
	config: configs.TemplateConfig<any> & configs.LoaderConfig,
	parent?: ConfigProvider<configs.TemplateConfig<any> & configs.LoaderConfig>
): any {
	return _createTemplate(config, 'async-template-name', parent);
}

export const Template = Object.assign(baseTemplate, {
	loadsTemplate,
});