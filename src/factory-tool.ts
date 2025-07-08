// factory-tool.ts

import { JSONValue, ToolSet } from 'ai';
import { ConfigError } from './validate';
import * as configs from './types-config';
import * as results from './types-result';

import { TextGeneratorConfig, TextGeneratorInstance } from './factory-text';
import { ObjectGeneratorConfig, ObjectGeneratorInstance } from './factory-object';
import { TemplateRendererInstance } from './factory-template';
import { ScriptRunnerInstance } from './factory-script';
import { InferParameters } from './type-utils';

//@todo - a tool shall either have description or parameters with a description, maybe validate at runtime

// Helper type to get the result from an ObjectGenerator parent.
// The result of the tool's `execute` function is the `.object` property of the generator's full result.
type ToolResultFromObjectGenerator<T extends (...args: any) => any> = Awaited<ReturnType<T>>['object'];

// Overload for TextGenerator
export function Tool<
	TConfig extends configs.ToolConfig<PARAMETERS, string>,
	TParent extends TextGeneratorInstance<any, any>,
	PARAMETERS extends configs.ToolParameters
>(
	config: TConfig,
	parent: TParent
): configs.FunctionTool<PARAMETERS, string>;

// Overload for ObjectGenerator
export function Tool<
	TParent extends ObjectGeneratorInstance<OBJECT, ELEMENT, ENUM, ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>>,
	TResult extends ToolResultFromObjectGenerator<TParent>,
	TConfig extends configs.ToolConfig<PARAMETERS, TResult>,
	PARAMETERS extends configs.ToolParameters,
	OBJECT, ELEMENT, ENUM extends string
>(
	config: TConfig,
	parent: TParent
): configs.FunctionTool<PARAMETERS, TResult>;

// Overload for TemplateRenderer
export function Tool<
	TConfig extends configs.ToolConfig<PARAMETERS, string>,
	TParent extends TemplateRendererInstance<configs.OptionalTemplateConfig>,
	PARAMETERS extends configs.ToolParameters
>(
	config: TConfig,
	parent: TParent
): configs.FunctionTool<PARAMETERS, string>;

// Overload for ScriptRunner
export function Tool<
	TConfig extends configs.ToolConfig<PARAMETERS, results.ScriptResult>,
	TParent extends ScriptRunnerInstance<configs.OptionalScriptConfig>,
	PARAMETERS extends configs.ToolParameters
>(
	config: TConfig,
	parent: TParent
): configs.FunctionTool<PARAMETERS, results.ScriptResult>;


// --- Implementation ---
export function Tool<
	PARAMETERS extends configs.ToolParameters,
	OBJECT, ELEMENT, ENUM extends string,
	CONFIG extends ( //this is the parent config type
		ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>
		| TextGeneratorConfig<TOOLS, OUTPUT>
		| configs.OptionalTemplateConfig
		| configs.OptionalScriptConfig),
	TOOLS extends ToolSet,
	OUTPUT = never,
	RESULT extends JSONValue = JSONValue
>(
	config: configs.ToolConfig<PARAMETERS, RESULT>,//The Vercel SDK function Tool without the execute function
	parent: TextGeneratorInstance<CONFIG, OUTPUT>
		| ObjectGeneratorInstance<OBJECT, ELEMENT, ENUM, ObjectGeneratorConfig<OBJECT, ELEMENT, ENUM>>
		| TemplateRendererInstance<configs.OptionalTemplateConfig>
		| ScriptRunnerInstance<configs.OptionalScriptConfig>
): configs.FunctionTool<PARAMETERS, RESULT> {

	if ('debug' in config && config.debug) {
		console.log('[DEBUG] Tool created with config:', JSON.stringify(config, null, 2));
	}
	if (!config.parameters) {
		throw new ConfigError('Tool config requires parameters schema');
	}
	if (!parent.config) {
		throw new ConfigError('Tool requires a valid parent (Generator, Renderer, or Runner)');
	}

	let execute: (args: InferParameters<PARAMETERS>, options: any) => Promise<any>;

	// We can discriminate based on the parent's config object
	const parentConfig = parent.config;

	// Determine the type of the parent:
	// is it the return of TextGenerator, ObjectGenerator, TemplateRenderer, or ScriptRunner?

	// Case 1: Parent is a ScriptRunner. The 'script' property is unique to ScriptConfig.
	if ('script' in parentConfig) {
		execute = async (args: InferParameters<PARAMETERS>, options: any): Promise<JSONValue> => {
			// A ScriptRunner's call signature accepts a context object.
			// The tool's arguments object is passed directly as the context.
			const result = await (parent as ScriptRunnerInstance<configs.OptionalScriptConfig>)(args);

			// ScriptRunner can return a string, an object, or null.
			// Coalesce null to an empty string to ensure a valid JSONValue that isn't null.
			return result ?? '';
		};
	}
	// Case 2: Parent is an ObjectGenerator. The 'output' property is its key differentiator.
	else if ('output' in parentConfig) {
		execute = async (args: InferParameters<PARAMETERS>, options: any): Promise<JSONValue> => {
			// An ObjectGenerator's call signature accepts a context object.
			const result = await (parent as ObjectGeneratorInstance<any, any, any, any>)(args);

			// The result object from Vercel's generateObject contains the generated JSON
			// in the 'object' property. This applies to object, array, and enum outputs.
			if ('object' in result) {
				return result.object;
			}

			// This should not be reached with a valid ObjectGenerator parent.
			throw new ConfigError('Parent ObjectGenerator result did not contain an "object" property.');
		};
	}
	// Case 3: Parent is a TextGenerator. It requires a 'model', unlike ScriptRunner or TemplateRenderer.
	else if ('model' in parentConfig) {
		execute = async (args: InferParameters<PARAMETERS>, options: any): Promise<string> => {
			// A TextGenerator's call signature accepts a context object.
			const result = await (parent as TextGeneratorInstance<any, any>)(args);

			// The result object from Vercel's generateText contains the generated string
			// in the 'text' property.
			if ('text' in result) {
				return result.text;
			}

			// This should not be reached with a valid TextGenerator parent.
			throw new ConfigError('Parent TextGenerator result did not contain a "text" property.');
		};
	}
	// Case 4: Parent is a TemplateRenderer. This is a fallback check for a non-LLM, templating-only parent.
	else if ('prompt' in parentConfig) {
		execute = async (args: InferParameters<PARAMETERS>, options: any): Promise<string> => {
			// A TemplateRenderer is the simplest case. Its call signature accepts a context
			// object and directly returns a promise of the rendered string.
			return await (parent as TemplateRendererInstance<configs.OptionalTemplateConfig>)(args);
		};
	}
	// Error case: If none of the above configurations match, we cannot create the tool.
	else {
		throw new ConfigError('Could not determine the type of the parent for the tool. The parent must be a configured instance from TextGenerator, ObjectGenerator, ScriptRunner, or TemplateRenderer.');
	}


	return {
		description: config.description,
		parameters: config.parameters as InferParameters<PARAMETERS>,
		execute,
		type: 'function' as const,
	};
}