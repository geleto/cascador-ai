import { TemplateEngine } from '../TemplateEngine';
import { mergeConfigs, processConfig } from '../config-utils';
import { validateTemplateConfig, validateTemplateCall, ConfigError } from '../validate';
import * as configs from '../types/config';
import * as utils from '../types/utils';
import * as results from '../types/result';
import { Context, SchemaType, TemplatePromptType } from '../types/types';
import { ToolCallOptions } from 'ai';

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
	FINAL_INPUT = utils.Override<PARENT_INPUT, INPUT>,
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

// New type definitions for static validation

// The full shape of a final, merged Template config object, including required properties.
type FinalTemplateConfigShape = Partial<configs.TemplateConfig<any> & configs.ToolConfig<any, any> & { loader?: any }>;

// Generic validator for the `config` object passed to a factory function.
type ValidateTemplateConfig<
	TConfig extends Partial<configs.TemplateConfig<any>>,
	TFinalConfig extends FinalTemplateConfigShape,
	TShape extends FinalTemplateConfigShape, // This TShape indicates the expected structure for the current factory (e.g., baseTemplate, loadsTemplate, asTool)
	TRequired =
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	& (TShape extends configs.LoaderConfig ? { loader: any } : {}) // loader is required for loadsTemplate
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	& (TShape extends configs.ToolConfig<any, any> ? { inputSchema: SchemaType<any> } : {}) // inputSchema is required for asTool
> =
	// GATEKEEPER: Check for excess or missing properties
	// 1. Check for excess properties in TConfig that are not in TShape
	keyof Omit<TConfig, keyof TShape> extends never
	? (
		// 2. If no excess, check for required properties missing from the FINAL merged config.
		keyof Omit<TRequired, keyof TFinalConfig> extends never
		? TConfig // All checks passed.
		: `Config Error: Missing required property '${keyof Omit<TRequired, keyof TFinalConfig> & string}' in the final configuration.`
	)
	: `Config Error: Unknown properties for this generator type: '${keyof Omit<TConfig, keyof TShape> & string}'`;


// Generic validator for the `parent` config object.
type ValidateTemplateParentConfig<
	TParentConfig extends Partial<configs.TemplateConfig<any>>,
	TShape extends FinalTemplateConfigShape // TShape for parent also
> =
	// Check for excess properties in the parent validated against TShape
	keyof Omit<TParentConfig, keyof TShape> extends never
	? TParentConfig // The check has passed.
	: `Parent Config Error: Parent has properties not allowed for the final template type: '${keyof Omit<TParentConfig, keyof TShape> & string}'`;

// Default behavior: inline/embedded template
function withTemplate<
	const TConfig extends configs.TemplateConfig<INPUT>,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTemplateConfig<
		TConfig, TConfig, configs.TemplateConfig<INPUT>
	>
): TemplateCallSignature<TConfig, INPUT>;

function withTemplate<
	TConfig extends Partial<configs.TemplateConfig<INPUT>>,
	TParentConfig extends Partial<configs.TemplateConfig<PARENT_INPUT>>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTemplateConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTemplateConfig<TConfig, TFinalConfig, configs.TemplateConfig<INPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTemplateParentConfig<TParentConfig, configs.TemplateConfig<PARENT_INPUT>>>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT>;

function withTemplate(
	config: configs.TemplateConfig<any>,
	parent?: configs.ConfigProvider<configs.TemplateConfig<any>>
): any {
	return _createTemplate(config, 'async-template', parent, false);
}

// loadsTemplate: load by name via provided loader
function loadsTemplate<
	const TConfig extends configs.TemplateConfig<INPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTemplateConfig<
		TConfig, TConfig, configs.TemplateConfig<INPUT> & configs.LoaderConfig
	>
): TemplateCallSignature<TConfig, INPUT>;

function loadsTemplate<
	TConfig extends Partial<configs.TemplateConfig<INPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.TemplateConfig<PARENT_INPUT> & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	TFinalConfig extends FinalTemplateConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTemplateConfig<TConfig, TFinalConfig, configs.TemplateConfig<INPUT> & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTemplateParentConfig<TParentConfig, configs.TemplateConfig<PARENT_INPUT> & configs.LoaderConfig>>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT>;

function loadsTemplate(
	config: Partial<configs.TemplateToolConfig<any> & configs.LoaderConfig>,
	parent?: configs.ConfigProvider<Partial<configs.TemplateToolConfig<any> & configs.LoaderConfig>>
): any {
	return _createTemplate(config, 'async-template-name', parent, false);
}

// asTool method for Template
function withTemplateAsTool<
	const TConfig extends configs.TemplateToolConfig<INPUT>,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTemplateConfig<
		TConfig, TConfig, configs.TemplateToolConfig<INPUT>
	>
): TemplateCallSignature<TConfig, INPUT> & results.RendererTool<INPUT, string>;

function withTemplateAsTool<
	TConfig extends Partial<configs.TemplateToolConfig<INPUT>>,
	TParentConfig extends Partial<configs.TemplateToolConfig<PARENT_INPUT>>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT = utils.Override<PARENT_INPUT, INPUT>,
	TFinalConfig extends FinalTemplateConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTemplateConfig<TConfig, TFinalConfig, configs.TemplateToolConfig<INPUT>>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTemplateParentConfig<TParentConfig, configs.TemplateToolConfig<PARENT_INPUT>>>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> & results.RendererTool<FINAL_INPUT, string>;

function withTemplateAsTool(
	config: Partial<configs.TemplateToolConfig<any>>,
	parent?: configs.ConfigProvider<Partial<configs.TemplateToolConfig<any>>>,
): any {
	return _createTemplateAsTool(config, 'async-template', parent);
}

// Overload 1: With a standalone config
function loadsTemplateAsTool<
	const TConfig extends configs.TemplateToolConfig<INPUT> & configs.LoaderConfig,
	INPUT extends Record<string, any>
>(
	config: TConfig & ValidateTemplateConfig<
		TConfig, TConfig, configs.TemplateToolConfig<INPUT> & configs.LoaderConfig
	>
): TemplateCallSignature<TConfig, INPUT> & results.RendererTool<INPUT, string>;

// Overload 2: With a parent config
function loadsTemplateAsTool<
	TConfig extends Partial<configs.TemplateToolConfig<INPUT> & configs.LoaderConfig>,
	TParentConfig extends Partial<configs.TemplateToolConfig<PARENT_INPUT> & configs.LoaderConfig>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT = utils.Override<PARENT_INPUT, INPUT>,
	TFinalConfig extends FinalTemplateConfigShape = utils.Override<TParentConfig, TConfig>
>(
	config: TConfig & ValidateTemplateConfig<TConfig, TFinalConfig, configs.TemplateToolConfig<INPUT> & configs.LoaderConfig>,
	parent: configs.ConfigProvider<TParentConfig & ValidateTemplateParentConfig<TParentConfig, configs.TemplateToolConfig<PARENT_INPUT> & configs.LoaderConfig>>
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> & results.RendererTool<FINAL_INPUT, string>;

// Implementation
function loadsTemplateAsTool(
	config: Partial<configs.TemplateToolConfig<any> & configs.LoaderConfig>,
	parent?: configs.ConfigProvider<Partial<configs.TemplateToolConfig<any> & configs.LoaderConfig>>,
): any {
	return _createTemplateAsTool(config, 'async-template-name', parent);
}

// Internal common creator for template tools
function _createTemplateAsTool<
	const TConfig extends Partial<configs.TemplateToolConfig<INPUT>>,
	TParentConfig extends Partial<configs.TemplateToolConfig<PARENT_INPUT>>,
	INPUT extends Record<string, any>,
	PARENT_INPUT extends Record<string, any>,
	FINAL_INPUT extends Record<string, any> = utils.Override<PARENT_INPUT, INPUT>,
>(
	config: Partial<TConfig>,
	promptType: TemplatePromptType,
	parent?: configs.ConfigProvider<TParentConfig>,
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> & results.RendererTool<FINAL_INPUT, string> {
	const renderer = _createTemplate(config, promptType, parent, true) as unknown as TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT>;

	const toolRenderer = renderer as unknown as results.RendererTool<FINAL_INPUT, string> & { config: { description?: string, inputSchema: SchemaType<FINAL_INPUT> } };
	toolRenderer.description = renderer.config.description;
	toolRenderer.inputSchema = renderer.config.inputSchema as unknown as SchemaType<FINAL_INPUT>;
	toolRenderer.type = 'function';

	toolRenderer.execute = async (args: FINAL_INPUT, options: ToolCallOptions): Promise<string> => {
		const contextWithToolOptions = { ...args, _toolCallOptions: options };
		return await (renderer as unknown as (context: FINAL_INPUT & { _toolCallOptions: ToolCallOptions }) => Promise<string>)(contextWithToolOptions);
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
	parent?: configs.ConfigProvider<TParentConfig>,
	isTool = false,
): TemplateCallSignatureWithParent<TConfig, TParentConfig, INPUT, PARENT_INPUT> {

	// Merge configs if parent exists, otherwise use provided config
	//, add promptType to the config
	const merged = parent
		? { ...mergeConfigs(parent.config, config), promptType: promptType }
		: { ...processConfig(config), promptType: promptType };

	validateTemplateConfig(merged, promptType, isTool);

	// Debug output if config.debug is true
	if ('debug' in merged && merged.debug) {
		console.log('[DEBUG] Template created with config:', JSON.stringify(merged, null, 2));
	}

	// @todo - .loadsTemplate()
	// Runtime validation for loader, backing up static checks
	if ((merged.promptType === 'template-name' || merged.promptType === 'async-template-name') && !('loader' in merged)) {
		throw new ConfigError('Template name types require a loader');
	}

	if ((merged.promptType === 'template-name' ||
		merged.promptType === 'async-template-name') &&
		!merged.loader
	) {
		throw new Error('A loader is required when promptType is "template-name", "async-template-name", or undefined.');
	}

	const renderer = new TemplateEngine(merged as configs.TemplateConfig<INPUT>);

	// Define the call function that handles both cases
	const call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<string> => {
		validateTemplateCall(merged, promptOrContext, maybeContext);

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

export const Template = Object.assign(withTemplate, {
	loadsTemplate: Object.assign(loadsTemplate, {
		asTool: loadsTemplateAsTool
	}),
	asTool: withTemplateAsTool
});