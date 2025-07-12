import { JSONValue, ToolExecutionOptions, ToolSet } from 'ai';
import { ConfigError } from './validate';
import * as configs from './types-config';
import * as results from './types-result';

import { TextGeneratorInstance } from './factory-text';
import { ObjectGeneratorConfig, ObjectGeneratorInstance } from './factory-object';
import { TemplateRendererInstance } from './factory-template';
import { ScriptRunnerInstance } from './factory-script';
import * as utils from './type-utils';

//@todo - a tool shall either have description or parameters with a description, maybe validate at runtime

// Helper type to get the result from an ObjectGenerator parent.
// The result of the tool's `execute` function is the `.object` property of the generator's full result.
type ToolResultFromObjectGenerator<T extends (...args: any) => any> = Awaited<ReturnType<T>>['object'];

// Overload for TextGenerator and TemplateRenderer
export function Tool<
	TConfig extends configs.ToolConfig<PARAMETERS>,
	PARAMETERS extends configs.ToolParameters
>(
	config: utils.StrictType<TConfig, configs.ToolConfig<PARAMETERS>>,
	parent: TemplateRendererInstance<configs.OptionalTemplateConfig> | TextGeneratorInstance<any, any>
): configs.FunctionTool<PARAMETERS, string>;

// Overload for ObjectGenerator
export function Tool<
	TParent extends ObjectGeneratorInstance<OBJECT, ELEMENT, ENUM, ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>>,
	TResult extends ToolResultFromObjectGenerator<TParent>,
	TConfig extends configs.ToolConfig<PARAMETERS>,
	PARAMETERS extends configs.ToolParameters,
	OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.StrictType<TConfig, configs.ToolConfig<PARAMETERS>>,
	parent: TParent
): configs.FunctionTool<PARAMETERS, TResult>;

// Overload for ScriptRunner
export function Tool<
	TConfig extends configs.ToolConfig<PARAMETERS>,
	PARAMETERS extends configs.ToolParameters
>(
	config: utils.StrictType<TConfig, configs.ToolConfig<PARAMETERS>>,
	parent: ScriptRunnerInstance<configs.ScriptConfig>
): configs.FunctionTool<PARAMETERS, results.ScriptResult>;


// --- Implementation ---
export function Tool<
	PARAMETERS extends configs.ToolParameters,
	OBJECT, ELEMENT, ENUM extends string,
	CONFIG extends configs.ToolConfig<PARAMETERS>,
	PARENT_TYPE extends TextGeneratorInstance<TOOLS, OUTPUT>
	| ObjectGeneratorInstance<OBJECT, ELEMENT, ENUM, ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>>
	| TemplateRendererInstance<configs.OptionalTemplateConfig>
	| ScriptRunnerInstance<configs.ScriptConfig>,
	TOOLS extends ToolSet,
	OUTPUT = never,
	RESULT extends JSONValue = JSONValue
>(
	config: CONFIG,
	parent: PARENT_TYPE
): configs.FunctionTool<PARAMETERS, RESULT> { // Return the corrected FunctionTool

	if ('debug' in config && config.debug) {
		console.log('[DEBUG] Tool created with config:', JSON.stringify(config, null, 2));
	}
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.parameters) {
		throw new ConfigError('Tool config requires parameters schema');
	}
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!parent.config) {
		throw new ConfigError('Tool requires a valid parent (Generator, Renderer, or Runner)');
	}

	// This signature MUST match the Vercel SDK's execute type
	let execute: (args: utils.InferParameters<PARAMETERS>, options: ToolExecutionOptions) => Promise<any>;

	const parentConfig = parent.config;

	// The order of these checks is important and designed to be mutually exclusive.
	// We check for the most specific properties first.

	// Case 1: ScriptRunner is the only type with `script` or `scriptType`.
	if ('script' in parentConfig || 'scriptType' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolExecutionOptions*/): Promise<JSONValue> => {
			const result = await (parent as ScriptRunnerInstance<configs.ScriptConfig>)(args);
			return result ?? '';
		};
	}
	// Case 2: ObjectGenerator has a string `output` property. This is checked
	// before `model` because ObjectGenerators *also* have a `model`.
	else if ('output' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolExecutionOptions*/): Promise<JSONValue> => {
			const result = await (parent as ObjectGeneratorInstance<any, any, any, any>)(args);
			if ('object' in result) { return result.object; }
			throw new ConfigError('Parent ObjectGenerator result did not contain an "object" property.');
		};
	}
	// Case 3: TextGenerator has a `model` but is not an ObjectGenerator.
	else if ('model' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolExecutionOptions*/): Promise<string> => {
			const result = await (parent as TextGeneratorInstance<any, any>)(args);
			if ('text' in result) { return result.text; }
			throw new ConfigError('Parent TextGenerator result did not contain a "text" property.');
		};
	}
	// Case 4: TemplateRenderer has `prompt` but no `model`.
	else if ('prompt' in parentConfig || 'promptType' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolExecutionOptions*/): Promise<string> => {
			return await (parent as TemplateRendererInstance<configs.OptionalTemplateConfig>)(args);
		};
	}
	// Error case
	else {
		throw new ConfigError('Could not determine the type of the parent for the tool. The parent must be a configured instance from TextGenerator, ObjectGenerator, ScriptRunner, or TemplateRenderer.');
	}


	return {
		description: config.description,
		parameters: config.parameters,
		execute,
		type: 'function' as const, // Explicitly return as a function tool
	};
}