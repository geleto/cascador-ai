import { generateText, generateObject, streamText, CoreTool, streamObject, LanguageModel } from 'ai';
import { ConfigData, ConfigProvider, mergeConfigs } from './ConfigData';
import { TemplateEngine } from './TemplateEngine';
import { ScriptEngine } from './ScriptEngine';
import {
	Context, TemplatePromptType, SchemaType,
	PromptOrMessage,
	//utils:
	Override
} from './types';
import * as configs from './types-config';
import * as results from './types-result';
import { ILoaderAny } from 'cascada-engine';
import { validateBaseConfig, ConfigError, validateCall } from './validate';
import { z } from 'zod';

// Ensures T is an exact match of one of the union members in U
// Prevents extra properties and mixing properties from different union types
type StrictUnionSubtype<T, U> = U extends any
	? T extends U
	? Exclude<keyof T, keyof U> extends never ? T : never
	: never
	: never;

// Ensures T has exactly the same properties as Shape (no extra properties). Returns never if T is not a strict subtype of Shape.
type StrictType<T, Shape> = T extends Shape
	? keyof T extends keyof Shape ? T : never
	: never;


// Helper for types that can optionally have template properties
type StrictTypeWithTemplate<T, Shape> = T extends { promptType: 'text' }
	? StrictType<T, Shape & { promptType: 'text' }>
	: StrictType<T, Shape & configs.TemplateConfig>;

type EnsurePromise<T> = T extends Promise<any> ? T : Promise<T>;

// Regular omit flattens the type, this one retains the original union structure. The example below will not work with regular Omit
// type DebugTConfig2 = DistributiveOmit<configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<typeof schema>, 'schema'>;
// type DebugTLoader2 = (DebugTConfig2 & { promptType: 'template' })['loader'];
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

//type OmitIfPresent<TParent, TProps, TCheck> = Omit<TParent, Extract<TProps, keyof TCheck>>;

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


type LLMCallSignature<
	TConfig extends configs.OptionalTemplateConfig,
	TResult
> = TConfig extends { promptType: 'text' }
	? (
		//TConfig has no template, no context argument is needed
		TConfig extends PromptOrMessage
		? {
			(prompt?: string): TResult;//TConfig has prompt, prompt is optional
			config: TConfig;
		}
		: {
			(prompt: string): TResult;//TConfig has no prompt, prompt argument is required
			config: TConfig;
		}
	)
	: (
		// TConfig has template, an optional context argument can be used
		// and the return type is always a promise because we wait for the result
		TConfig extends PromptOrMessage
		? {
			//TConfig has prompt, prompt is optional
			(promptOrContext?: Context | string): EnsurePromise<TResult>;//one optional argument, prompt or context
			(prompt: string, context: Context): EnsurePromise<TResult>;//two arguments, prompt and context
			config: TConfig;
		}
		: {
			//TConfig has no prompt, prompt argument is required
			(prompt: string, context?: Context): EnsurePromise<TResult>;//prompt is a must, context is optional
			config: TConfig;
		}
	);

type GetMissingProperties<TRequired, TRefConfig> = Exclude<keyof TRequired, keyof TRefConfig>;

// Regular RequireMissing removes properties from TConfig that need to be made required
// and adds them back from TRequired.
type RequireMissing<
	TConfig,
	TRequired,
	TRefConfig,
> = TConfig & Pick<TRequired, GetMissingProperties<TRequired, TRefConfig>>;

// Makes properties from TRequired required only if they don't exist in TRefConfig.
// Handles schema properties specially because zod applies DeepPartial to optional schemas
// which causes type issues when intersected with non-optional schemas via &.
// For example: {schema?: z.Schema<...>} & {schema: z.Schema<...>}
// Uses conditional type check before Omit to preserve discriminated union information
// that would be lost with direct Omit of the schema property.
type RequireMissingWithSchema<
	TConfig,
	TRequired,
	TRefConfig,
> =
	// Handle schema type union
	(TConfig extends { schema: any }
		? (Omit<TConfig, 'schema'> & {
			schema: TConfig['schema'] extends z.Schema<infer U>
			? z.Schema<U> & SchemaType<U> // Add SchemaType union
			: TConfig['schema']
		})
		: TConfig) &
	// Add missing required properties
	Pick<TRequired, GetMissingProperties<TRequired, TRefConfig>>;

type RequireTemplateLoaderIfNeeded<
	TMergedConfig extends configs.OptionalTemplateConfig
> = TMergedConfig['promptType'] extends 'template-name' | 'async-template-name'
	? 'loader' extends keyof TMergedConfig ? object : { loader: ILoaderAny | ILoaderAny[] }
	: object;

type RequireScriptLoaderIfNeeded<
	TMergedConfig extends configs.OptionalScriptConfig
> = TMergedConfig['scriptType'] extends 'script-name' | 'async-script-name'
	? 'loader' extends keyof TMergedConfig ? object : { loader: ILoaderAny | ILoaderAny[] }
	: object;

// Single config overload
export function Config<
	TConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: StrictUnionSubtype<TConfig, configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>,
): ConfigProvider<TConfig>;

// Config with parent overload
export function Config<
	TConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string,
	TCombined = StrictUnionSubtype<Override<TParentConfig, TConfig>, configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>
>(
	config: TConfig,
	parent: ConfigProvider<
		TCombined extends never ? never : TParentConfig
	>
): ConfigData<TCombined>;

export function Config<
	TConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): ConfigData<TConfig> | ConfigData<StrictUnionSubtype<Override<TParentConfig, TConfig>, configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>>> {

	validateBaseConfig(config);

	if (parent) {
		const merged = mergeConfigs(parent.config, config);
		// Runtime check would go here if needed
		validateBaseConfig(merged);
		return new ConfigData(merged);
	}

	return new ConfigData(config);
}

// Single config overload
export function TemplateRenderer<TConfig extends configs.TemplateConfig>(
	config: StrictType<TConfig, configs.TemplateConfig> & RequireTemplateLoaderIfNeeded<TConfig>
): TemplateCallSignature<TConfig>;

// Config with parent overload - now properly returns only required properties in immediate config
export function TemplateRenderer<
	TConfig extends configs.TemplateConfig,
	TParentConfig extends configs.TemplateConfig
>(
	config: StrictType<TConfig, configs.TemplateConfig> & RequireTemplateLoaderIfNeeded<Override<TParentConfig, TConfig>>,
	parent: ConfigProvider<StrictType<TParentConfig, configs.TemplateConfig>>
): TemplateCallSignature<Override<TParentConfig, TConfig>>;

export function TemplateRenderer<
	TConfig extends configs.TemplateConfig,
	TParentConfig extends configs.TemplateConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): [typeof parent] extends [undefined]
	? TemplateCallSignature<TConfig>
	: TemplateCallSignature<Override<TParentConfig, TConfig>> {

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
		: TemplateCallSignature<Override<TParentConfig, TConfig>>;

	return callSignature as ReturnType;
}

// Script call signature type
type ScriptCallSignature<TConfig extends configs.OptionalScriptConfig> =
	TConfig extends { script: string }
	? {
		//TConfig has script, no script argument is needed
		(scriptOrContext?: Context | string): Promise<results.ScriptResult>;//one optional argument, script or context
		(script: string, context: Context): Promise<results.ScriptResult>;//two arguments, script and context
		config: TConfig;
	}
	: {
		//TConfig has no script, script argument is needed
		(script: string, context?: Context): Promise<results.ScriptResult>;//script is a must, context is optional
		config: TConfig;
	};

// Single config overload
export function ScriptRunner<TConfig extends configs.ScriptConfig>(
	config: StrictType<TConfig, configs.ScriptConfig> & RequireScriptLoaderIfNeeded<TConfig>
): ScriptCallSignature<TConfig>;

// Config with parent overload
export function ScriptRunner<
	TConfig extends configs.ScriptConfig,
	TParentConfig extends configs.ScriptConfig
>(
	config: StrictType<TConfig, configs.ScriptConfig> & RequireScriptLoaderIfNeeded<Override<TParentConfig, TConfig>>,
	parent: ConfigProvider<StrictType<TParentConfig, configs.ScriptConfig>>
): ScriptCallSignature<Override<TParentConfig, TConfig>>;

export function ScriptRunner<
	TConfig extends configs.ScriptConfig,
	TParentConfig extends configs.ScriptConfig
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
): [typeof parent] extends [undefined]
	? ScriptCallSignature<TConfig>
	: ScriptCallSignature<Override<TParentConfig, TConfig>> {

	validateBaseConfig(config);
	// Merge configs if parent exists, otherwise use provided config
	const merged = parent
		? mergeConfigs(parent.config, config)
		: config;
	if (parent) {
		validateBaseConfig(merged);
	}

	if ((merged.scriptType === 'script-name' || merged.scriptType === 'async-script-name') && !('loader' in merged)) {
		throw new ConfigError('Script name types require a loader');
	}

	if ((merged.scriptType === 'script-name' ||
		merged.scriptType === 'async-script-name') &&
		!merged.loader
	) {
		throw new Error('A loader is required when scriptType is "script-name", "async-script-name", or undefined.');
	}

	const runner = new ScriptEngine(merged);

	// Define the call function that handles both cases
	const call = async (scriptOrContext?: Context | string, maybeContext?: Context): Promise<results.ScriptResult> => {
		if (typeof scriptOrContext === 'string') {
			return await runner.run(scriptOrContext, maybeContext);
		} else {
			if (maybeContext !== undefined) {
				throw new Error('Second argument must be undefined when not providing script.');
			}
			return await runner.run(undefined, scriptOrContext);
		}
	};

	const callSignature = Object.assign(call, { config: merged });

	type ReturnType = [typeof parent] extends [undefined]
		? ScriptCallSignature<TConfig>
		: ScriptCallSignature<Override<TParentConfig, TConfig>>;

	return callSignature as ReturnType;
}

// Single config overload
export function TextGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
>(
	config: StrictTypeWithTemplate<TConfig, configs.GenerateTextConfig<TOOLS, OUTPUT>> & RequireTemplateLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, results.GenerateTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissing<
		StrictTypeWithTemplate<
			TConfig,
			configs.GenerateTextConfig<TOOLS, OUTPUT>
		>,
		{ model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.GenerateTextConfig<TOOLS, OUTPUT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, results.GenerateTextResult<TOOLS, OUTPUT>>;

export function TextGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.OptionalTemplateConfig & configs.GenerateTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>, OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<results.GenerateTextResult<TOOLS, OUTPUT>>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.GenerateTextResult<TOOLS, OUTPUT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}
	if (!('model' in merged)) {
		throw new ConfigError('TextGenerator config requires model');
	}

	return createLLMRenderer<
		CombinedType,
		configs.GenerateTextConfig<TOOLS, OUTPUT> & { model: LanguageModel },
		Promise<results.GenerateTextResult<TOOLS, OUTPUT>>
	>(merged, generateText);
}

// Single config overload
export function TextStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig & RequireTemplateLoaderIfNeeded<TConfig>
		& { model: LanguageModel }
): LLMCallSignature<TConfig, results.StreamTextResult<TOOLS, OUTPUT>>;

// Config with parent
export function TextStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig & RequireTemplateLoaderIfNeeded<Override<TParentConfig, TConfig>>
		& RequireMissing<TConfig, { model: LanguageModel }, TParentConfig>,
	parent: ConfigProvider<TParentConfig>
): LLMCallSignature<Override<TParentConfig, TConfig>, results.StreamTextResult<TOOLS, OUTPUT>>;

export function TextStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TParentConfig extends configs.OptionalTemplateConfig & configs.StreamTextConfig<TOOLS, OUTPUT>,
	TOOLS extends Record<string, CoreTool> = Record<string, CoreTool>,
	OUTPUT = never
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, results.StreamTextResult<TOOLS, OUTPUT>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, results.StreamTextResult<TOOLS, OUTPUT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	if (!('model' in merged)) {
		throw new ConfigError('TextStreamer config requires model');
	}

	return createLLMRenderer<
		CombinedType,
		configs.StreamTextConfig<TOOLS, OUTPUT> & { model: LanguageModel },
		results.StreamTextResult<TOOLS, OUTPUT>
	>(merged, streamText);
}

// Object output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, configs.GenerateObjectObjectConfig<OBJECT>>, 'schema'> &
		RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectObjectResult<OBJECT>>>;

// Array output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectArrayConfig<ELEMENT>,
	ELEMENT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, configs.GenerateObjectArrayConfig<ELEMENT>>, 'schema'> &
		RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectArrayResult<ELEMENT>>>;

// Enum output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectEnumConfig<ENUM>,
	ENUM extends string = string
>(
	config: StrictTypeWithTemplate<TConfig, configs.GenerateObjectEnumConfig<ENUM>> &
		RequireTemplateLoaderIfNeeded<TConfig> & { output: 'enum', enum: ENUM[], model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectEnumResult<ENUM>>>;

// No schema output
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectNoSchemaConfig
>(
	config: StrictTypeWithTemplate<TConfig, configs.GenerateObjectNoSchemaConfig> &
		RequireTemplateLoaderIfNeeded<TConfig> & { output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.GenerateObjectNoSchemaResult>>;

// Object with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectObjectConfig<OBJECT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectObjectConfig<OBJECT>
		>,
		{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.GenerateObjectObjectConfig<OBJECT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.GenerateObjectObjectResult<OBJECT>>>

// Array with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectArrayConfig<ELEMENT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectArrayConfig<ELEMENT>
		>,
		{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.GenerateObjectArrayConfig<ELEMENT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.GenerateObjectArrayResult<ELEMENT>>>;

// Enum with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectEnumConfig<ENUM>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectEnumConfig<ENUM>
		>,
		{ output: 'enum', enum: ENUM[], model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.GenerateObjectEnumConfig<ENUM>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.GenerateObjectEnumResult<ENUM>>>;

// No schema with parent
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig & configs.GenerateObjectNoSchemaConfig,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissing<
		StrictTypeWithTemplate<
			TConfig,
			configs.GenerateObjectNoSchemaConfig
		>,
		{ output: 'no-schema', model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.GenerateObjectNoSchemaConfig
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.GenerateObjectNoSchemaResult>>;

// Implementation
export function ObjectGenerator<
	TConfig extends configs.OptionalTemplateConfig,
	TParentConfig extends configs.OptionalTemplateConfig,
	ELEMENT = any,
	ENUM extends string = string,
	OBJECT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.GenerateObjectResultAll<OBJECT, ENUM, ELEMENT>>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	// One of several possible overloads (config.output = 'object' / undefined), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		configs.GenerateObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		Promise<results.GenerateObjectObjectResult<OBJECT>>
	>(merged, generateObject);
}

// Object output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<OBJECT>,
	OBJECT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, configs.StreamObjectObjectConfig<OBJECT>>, 'schema'> &
		RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.StreamObjectObjectResult<OBJECT>>>;

// Array output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectArrayConfig<ELEMENT>,
	ELEMENT = any
>(
	config: DistributiveOmit<StrictTypeWithTemplate<TConfig, configs.StreamObjectArrayConfig<ELEMENT>>, 'schema'> &
		RequireTemplateLoaderIfNeeded<TConfig> &
	{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.StreamObjectArrayResult<ELEMENT>>>;

// No schema output
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectNoSchemaConfig
>(
	config: StrictTypeWithTemplate<TConfig, configs.StreamObjectNoSchemaConfig> &
		RequireTemplateLoaderIfNeeded<TConfig> & { output: 'no-schema', model: LanguageModel }
): LLMCallSignature<TConfig, Promise<results.StreamObjectNoSchemaResult>>;


// Object with parent
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectObjectConfig<OBJECT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			configs.StreamObjectObjectConfig<OBJECT>
		>,
		{ output: 'object' | undefined, schema: SchemaType<OBJECT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.StreamObjectObjectConfig<OBJECT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.StreamObjectObjectResult<OBJECT>>>;

// Array with parent
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectArrayConfig<ELEMENT>,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			configs.StreamObjectArrayConfig<ELEMENT>
		>,
		{ output: 'array', schema: SchemaType<ELEMENT>, model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.StreamObjectArrayConfig<ELEMENT>
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.StreamObjectArrayResult<ELEMENT>>>;

// No schema with parent
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig & configs.StreamObjectNoSchemaConfig,
	TParentConfig extends configs.AnyConfig<TOOLS, OUTPUT, OBJECT, ELEMENT, ENUM>,
	TOOLS extends Record<string, CoreTool>, OUTPUT, OBJECT, ELEMENT, ENUM extends string
>(
	config: RequireMissingWithSchema<
		StrictTypeWithTemplate<
			TConfig,
			configs.StreamObjectNoSchemaConfig
		>,
		{ output: 'no-schema', model: LanguageModel },
		TParentConfig
	>,
	parent: ConfigProvider<
		StrictTypeWithTemplate<
			Override<TParentConfig, TConfig>,
			configs.StreamObjectNoSchemaConfig
		> extends never ? never : TParentConfig
	>
): LLMCallSignature<Override<TParentConfig, TConfig>, Promise<results.StreamObjectNoSchemaResult>>;

// Implementation
export function ObjectStreamer<
	TConfig extends configs.OptionalTemplateConfig,
	TParentConfig extends configs.OptionalTemplateConfig,
	OBJECT = any, ELEMENT = any
>(
	config: TConfig,
	parent?: ConfigProvider<TParentConfig>
):
	LLMCallSignature<TConfig, results.StreamObjectResultAll<OBJECT, ELEMENT>> |
	LLMCallSignature<Override<TParentConfig, TConfig>, results.StreamObjectResultAll<OBJECT, ELEMENT>> {

	type CombinedType = typeof parent extends ConfigProvider<TParentConfig>
		? Override<TParentConfig, TConfig>
		: TConfig;

	validateBaseConfig(config);
	const merged = parent ? mergeConfigs(parent.config, config) : config;
	if (parent) {
		validateBaseConfig(merged);
	}

	// One of several possible overloads (config.output = 'object' / undefined), but they all compile to the same thing
	return createLLMRenderer<
		CombinedType,
		configs.StreamObjectObjectConfig<OBJECT> & { model: LanguageModel, schema: SchemaType<OBJECT> },
		results.StreamObjectObjectResult<OBJECT>
	>(merged, streamObject);
}

function createLLMRenderer<
	TConfig extends configs.OptionalTemplateConfig & Partial<TFunctionConfig>, // extends Partial<OptionalTemplateConfig & GenerateTextConfig<TOOLS, OUTPUT>>,
	TFunctionConfig extends Record<string, any>,
	TFunctionResult,
>(
	config: TConfig,
	vercelFunc: (config: TFunctionConfig) => TFunctionResult
): LLMCallSignature<TConfig, TFunctionResult> {
	let call;
	if (config.promptType !== 'text') {
		// We have to run the prompt through a template first.
		const renderer = TemplateRenderer(config as configs.TemplateConfig & { promptType: TemplatePromptType });
		call = async (promptOrContext?: Context | string, maybeContext?: Context): Promise<TFunctionResult> => {
			validateCall(config, promptOrContext, maybeContext);
			let renderedPrompt: string;

			if (typeof promptOrContext === 'string') {
				renderedPrompt = await renderer(promptOrContext, maybeContext);
			} else {
				renderedPrompt = await renderer(config.prompt!, promptOrContext);
			}
			if (config.messages) {
				//todo: add the prompt to the messages
				//config.messages.push(renderedPrompt);
			}
			return await vercelFunc({ ...config, prompt: renderedPrompt } as unknown as TFunctionConfig);
		};
	} else {
		// No need to run the prompt through a template.
		call = async (prompt: string): Promise<TFunctionResult> => {
			validateCall(config, prompt);
			return await vercelFunc({ ...config, prompt } as unknown as TFunctionConfig);
		};
	}
	const callSignature = Object.assign(call, { config });
	return callSignature as LLMCallSignature<TConfig, TFunctionResult>;
}