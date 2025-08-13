import { JSONValue, ToolCallOptions, ToolSet } from 'ai';
import { ConfigError } from '../validate';
import * as configs from '../types/config';
import * as results from '../types/result';

import { TextGeneratorInstance } from './TextGenerator';
import { LLMGeneratorConfig, ObjectGeneratorInstance } from './ObjectGenerator';
import { TemplateInstance } from './Template';
import { ScriptInstance } from './Script';
import * as utils from '../types/utils';
import { RequiredPromptType } from '../types/types';

//@todo - a tool shall either have description or parameters with a description, maybe validate at runtime

// Helper type to get the result from an ObjectGenerator parent.
// The result of the tool's `execute` function is the `.object` property of the generator's full result.
type ToolResultFromObjectGenerator<T extends (...args: any) => any> = Awaited<ReturnType<T>>['object'];

// Overload for TextGenerator and Template
export function Tool<
	TConfig extends configs.ToolConfig<PARAMETERS>,
	PARAMETERS extends configs.ToolParameters
>(
	config: utils.StrictType<TConfig, configs.ToolConfig<PARAMETERS>>,
	parent: TemplateInstance<configs.OptionalTemplatePromptConfig> | TextGeneratorInstance<any, any, RequiredPromptType>
): configs.FunctionTool<PARAMETERS, string>;

// Overload for ObjectGenerator
export function Tool<
	TParent extends ObjectGeneratorInstance<OBJECT, ELEMENT, ENUM, LLMGeneratorConfig<OBJECT, ELEMENT, ENUM>, RequiredPromptType>,
	TResult extends ToolResultFromObjectGenerator<TParent>,
	TConfig extends configs.ToolConfig<PARAMETERS>,
	PARAMETERS extends configs.ToolParameters,
	OBJECT, ELEMENT, ENUM extends string
>(
	config: utils.StrictType<TConfig, configs.ToolConfig<PARAMETERS>>,
	parent: TParent
): configs.FunctionTool<PARAMETERS, TResult>;

// Overload for Script
export function Tool<
	TConfig extends configs.ToolConfig<PARAMETERS>,
	PARAMETERS extends configs.ToolParameters,
	OBJECT
>(
	config: utils.StrictType<TConfig, configs.ToolConfig<PARAMETERS>>,
	parent: ScriptInstance<configs.ScriptConfig<OBJECT>>
): configs.FunctionTool<PARAMETERS, results.ScriptResult>;


// --- Implementation ---
export function Tool<
	PARAMETERS extends configs.ToolParameters,
	OBJECT, ELEMENT, ENUM extends string,
	CONFIG extends configs.ToolConfig<PARAMETERS>,
	PARENT_TYPE extends
	| TextGeneratorInstance<TOOLS, OUTPUT, RequiredPromptType>
	| ObjectGeneratorInstance<OBJECT, ELEMENT, ENUM, LLMGeneratorConfig<OBJECT, ELEMENT, ENUM>, RequiredPromptType>
	| TemplateInstance<configs.OptionalTemplatePromptConfig>
	| ScriptInstance<configs.ScriptConfig<OBJECT>>,
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
	let execute: (args: utils.InferParameters<PARAMETERS>, options: ToolCallOptions) => Promise<any>;

	const parentConfig = parent.config;

	// The order of these checks is important and designed to be mutually exclusive.
	// We check for the most specific properties first to correctly identify the parent type.

	// Case 1: Script is the only type with `script`
	if ('script' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolCallOptions*/): Promise<JSONValue> => {
			const result = await (parent as ScriptInstance<configs.ScriptConfig<OBJECT>>)(args);
			return result ?? '';
		};
	}
	// Case 2: ObjectGenerator has an `output` property, which TextGenerator lacks.
	// The ObjectGenerator factory ensures this property is always present on the config,
	// making it a reliable discriminator.
	else if ('output' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolCallOptions*/): Promise<JSONValue> => {
			const result = await (parent as ObjectGeneratorInstance<any, any, any, any, RequiredPromptType>)(args);
			if ('object' in result) { return result.object; }
			throw new ConfigError('Parent ObjectGenerator result did not contain an "object" property.');
		};
	}
	// Case 3: TextGenerator has a `model` but is not an ObjectGenerator (which was checked above).
	else if ('model' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolCallOptions*/): Promise<string> => {
			const result = await (parent as TextGeneratorInstance<any, any, RequiredPromptType>)(args);
			if ('text' in result) { return result.text; }
			throw new ConfigError('Parent TextGenerator result did not contain a "text" property.');
		};
	}
	// Case 4: Template has `prompt` or `promptType` but no `model`.
	else if ('prompt' in parentConfig || 'promptType' in parentConfig) {
		execute = async (args: utils.InferParameters<PARAMETERS>/*, options: ToolCallOptions*/): Promise<string> => {
			return await (parent as TemplateInstance<configs.OptionalTemplatePromptConfig>)(args);
		};
	}
	// Error case: The parent type could not be determined.
	else {
		throw new ConfigError('Could not determine the type of the parent for the tool. The parent must be a configured instance from TextGenerator, ObjectGenerator, Script, or Template.');
	}


	return {
		description: config.description,
		parameters: config.parameters,
		execute,
		type: 'function' as const, // Explicitly return as a function tool
	};
}