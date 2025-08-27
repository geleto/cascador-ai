import { TemplateEngine } from '../TemplateEngine';
import { ConfigProvider, mergeConfigs } from '../ConfigData';
import { validateBaseConfig, ConfigError } from '../validate';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as results from '../types/result';
import { Context, SchemaType, TemplatePromptType } from '../types/types';
import { ToolCallOptions } from 'ai';

//@todo Simplify, may not need extends
export type TemplateInstance<
	TConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
> = TemplateCallSignature<TConfig, INPUT>;

// Config for a Tool that uses the Template engine
export interface TemplateToolConfig<
	INPUT extends Record<string, any>,
> extends configs.TemplateConfig<INPUT> {
	inputSchema: SchemaType<INPUT>;//required
	description?: string;
}

export type TemplateCallSignature<
	TConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>//only INPUT, the output is string
> =
	TConfig extends { template: string }
	? {
		//TConfig has template, no template argument is needed
		(promptOrContext?: INPUT | string): Promise<string>;//one optional argument, template or context
		(prompt?: string, context?: INPUT): Promise<string>;//two arguments, template and context
		config: TConfig;
		type: string;
	}
	: {
		//TConfig has no template, template argument is needed
		(prompt: string, context?: INPUT): Promise<string>;//template is a must, context is optional
		config: TConfig;
		type: string;
	};

export type TemplateCallSignatureWithParent<
	TConfig extends Partial<configs.TemplateConfig<INPUT>>,
	TParentConfig extends Partial<configs.TemplateConfig<PARENT_INPUT>>,
	INPUT extends Record<string, any>, //only INPUT, the output is string
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT = INPUT extends never ? PARENT_INPUT : INPUT,
	FinalConfig = utils.Override<TParentConfig, TConfig>
> =
	FinalConfig extends { template: string }
	? {
		//TConfig has template, no template argument is needed
		(promptOrContext?: FINAL_INPUT | string): Promise<string>;//one optional argument, template or context
		(prompt?: string, context?: FINAL_INPUT): Promise<string>;//two arguments, template and context
		config: FinalConfig;
		type: string;
	}
	: {
		//TConfig has no template, template argument is needed
		(prompt: string, context?: FINAL_INPUT): Promise<string>;//template is a must, context is optional
		config: FinalConfig;
		type: string;
	};

// Default behavior: inline/embedded template
function baseTemplate<
	const TConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig<INPUT>>
): TemplateCallSignature<TConfig, INPUT>;

function baseTemplate<
	TConfig extends configs.TemplateConfig<INPUT>,
	TParentConfig extends configs.TemplateConfig<PARENT_INPUT>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig<INPUT>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.TemplateConfig<PARENT_INPUT>>>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT>;

function baseTemplate(
	config: configs.TemplateConfig<any>,
	parent?: ConfigProvider<configs.TemplateConfig<any>>
): any {
	return _createTemplate(config, 'async-template', parent);
}

// loadsTemplate: load by name via provided loader
function loadsTemplate<
	const TConfig extends TemplateToolConfig<INPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>
>(
	config: TConfig
): TemplateCallSignature<TConfig, INPUT>;

function loadsTemplate<
	TConfig extends Partial<TemplateToolConfig<INPUT>> & configs.LoaderConfig,
	TParentConfig extends Partial<TemplateToolConfig<PARENT_INPUT>> & configs.LoaderConfig,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT>;

function loadsTemplate(
	config: Partial<TemplateToolConfig<any> & configs.LoaderConfig>,
	parent?: ConfigProvider<Partial<TemplateToolConfig<any> & configs.LoaderConfig>>
): any {
	return _createTemplate(config, 'async-template-name', parent);
}

// asTool method for Template
function asTool<
	const TConfig extends TemplateToolConfig<INPUT>,
	INPUT extends Record<string, any>,
	OUTPUT
>(
	config: TConfig & { description?: string; inputSchema: SchemaType<INPUT> }
): TemplateCallSignature<TConfig, INPUT> & results.RendererTool<INPUT, OUTPUT>;


/*function baseTemplatea<
	TConfig extends configs.TemplateConfig<INPUT>,
	TParentConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
>(
	config: utils.StrictType<TConfig, configs.TemplateConfig<INPUT>>,
	parent: ConfigProvider<utils.StrictType<TParentConfig, configs.TemplateConfig<INPUT>>>
): TemplateCallSignature<utils.Override<TParentConfig, TConfig>, INPUT>{};*/

function asTool<
	TConfig extends Partial<TemplateToolConfig<INPUT>>,
	TParentConfig extends Partial<TemplateToolConfig<PARENT_INPUT>>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT = INPUT extends never ? PARENT_INPUT : INPUT,
>(
	config: TConfig,
	parent: ConfigProvider<TParentConfig>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> & results.RendererTool<FINAL_INPUT, string>;

function asTool<
	const TConfig extends Partial<TemplateToolConfig<INPUT>>,
	TParentConfig extends Partial<TemplateToolConfig<PARENT_INPUT>>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT extends Record<string, any> = INPUT extends never ? PARENT_INPUT : INPUT,
>(
	config: Partial<TConfig>,
	parent?: ConfigProvider<TParentConfig>,

): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> & results.RendererTool<FINAL_INPUT, string> {
	const renderer = _createTemplate(config, 'async-template', parent) as unknown as TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT>;
	console.log('renderer config', renderer.config);

	const toolRenderer = renderer as unknown as results.RendererTool<FINAL_INPUT, string> & { inputSchema: SchemaType<FINAL_INPUT> };
	toolRenderer.description = renderer.config.description;
	toolRenderer.inputSchema = renderer.config.inputSchema as unknown as SchemaType<FINAL_INPUT>;
	toolRenderer.type = 'function'; // Overrides our type, maybe we shall rename our type to something else

	//result is a caller, assign the execute function to it. Args is the context object, options is not used
	toolRenderer.execute = async (args: FINAL_INPUT, _options: ToolCallOptions): Promise<string> => {
		// Call the renderer without the options parameter since renderers don't support it
		return await (renderer as unknown as (context: FINAL_INPUT) => Promise<string>)(args);
	};

	return renderer as TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> & results.RendererTool<FINAL_INPUT, string>;
}

// Internal common creator for template renderer
export function _createTemplate<
	const TConfig extends Partial<configs.TemplateConfig<INPUT>>,
	TParentConfig extends Partial<configs.TemplateConfig<PARENT_INPUT>>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
>(
	config: TConfig,
	promptType: TemplatePromptType,
	parent?: ConfigProvider<TParentConfig>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> {

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
	return callSignature as unknown as TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT>;
}

export const Template = Object.assign(baseTemplate, {
	loadsTemplate,
	asTool
});