import { generateText, generateObject, streamText, LanguageModel } from 'ai';
import { ConfigData } from './ConfigData';
import { createLLMGenerator, createLLMStreamer, GeneratorCallSignature } from './createLLMRenderer';
import { TemplateCallSignature, TemplateEngine } from './TemplateEngine';
import {
	Context,
	TemplateConfig,
	ObjectGeneratorOutputType,
	SchemaType,
	GenerateObjectConfigArg,
	FinalGenerateObjectConfig,
	ConfigError,
	LLMConfigArg,
	GenerateTextConfigArg,
	StreamTextConfigArg,
	RequiredObjectConfig,
	hasModel,
	hasSchema,
	hasEnum
} from './types';

//todo - move validation functions to types.ts
function validateConfig(config: unknown, parent?: ConfigData): asserts config is { model: LanguageModel } {
	const hasModelInChain = hasModel(config) || (parent && hasModel(parent.config));
	if (!hasModelInChain) {
		throw new ConfigError('Model must be provided either in config or parent chain');
	}
}

function validateObjectConfig<T>(
	config: unknown,
	output: ObjectGeneratorOutputType,
	parent?: ConfigData
): asserts config is RequiredObjectConfig<T, typeof output> {
	validateConfig(config, parent);

	switch (output) {
		case 'array':
		case 'object': {
			const hasSchemaInChain = hasSchema(config) || (parent && hasSchema(parent.config));
			if (!hasSchemaInChain) {
				throw new ConfigError(`Schema is required for output type '${output}'`);
			}
			break;
		}
		case 'enum': {
			const hasEnumInChain = hasEnum(config) || (parent && hasEnum(parent.config));
			if (!hasEnumInChain) {
				throw new ConfigError('Enum values are required for output type "enum"');
			}
			break;
		}
	}
}

export class Factory {
	ConfigData<T extends LLMConfigArg>(config: T, parent?: ConfigData) {
		validateConfig(config, parent);
		return new ConfigData<T>(config, parent);
	}

	TemplateRenderer(config: Partial<TemplateConfig>, parent?: ConfigData): TemplateCallSignature {
		const renderer = new TemplateEngine(config, parent);
		const callable: TemplateCallSignature = (promptOrConfig?: string | Partial<TemplateConfig>, context?: Context) => {
			return renderer.call(promptOrConfig, context);
		};
		callable.config = renderer.config;
		return callable;
	}

	TextGenerator(
		config: Partial<GenerateTextConfigArg>,
		parent?: ConfigData
	): GeneratorCallSignature<typeof generateText> {
		validateConfig(config, parent);
		return createLLMGenerator(config, generateText, parent);
	}

	TextStreamer(
		config: StreamTextConfigArg,
		parent?: ConfigData
	) {
		validateConfig(config, parent);
		return createLLMStreamer(config, streamText, parent);
	}

	// Utility for creating final configs to pass to Vercel functions
	// TODO: Type assertion will be removed when model/schema requirements are implemented
	private static makeFinalConfig<O extends string>(
		config: GenerateObjectConfigArg,
		output: O
	): FinalGenerateObjectConfig<O> {
		// Remove template config properties
		/* eslint-disable @typescript-eslint/no-unused-vars */
		const { context, filters, loader, promptName, options, ...rawConfig } = config;

		return {
			...rawConfig,
			output
		} as FinalGenerateObjectConfig<O>;
	}

	// Overloads for ObjectGenerator

	ObjectGenerator<T>(
		config: GenerateObjectConfigArg & { schema: SchemaType<T> },
		output: 'object',
		parent?: ConfigData
	): GeneratorCallSignature<typeof generateObject>;

	ObjectGenerator<T>(
		config: GenerateObjectConfigArg & { schema: SchemaType<T> },
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		output: 'array',
		parent?: ConfigData
	): GeneratorCallSignature<typeof generateObject>;

	ObjectGenerator(
		config: GenerateObjectConfigArg & { enum: string[] },
		output: 'enum',
		parent?: ConfigData
	): GeneratorCallSignature<typeof generateObject>;

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
	ObjectGenerator<T>(
		config: GenerateObjectConfigArg,
		output: 'no-schema',
		parent?: ConfigData
	): GeneratorCallSignature<typeof generateObject>;

	// Implementation
	ObjectGenerator<T>(
		config: GenerateObjectConfigArg & { schema?: SchemaType<T>; enum?: string[] },
		output: ObjectGeneratorOutputType,
		parent?: ConfigData
	): GeneratorCallSignature<typeof generateObject> {
		validateObjectConfig<T>(config, output, parent);

		switch (output) {
			case 'no-schema':
				return createLLMGenerator(
					Factory.makeFinalConfig(config, 'no-schema'),
					generateObject,
					parent
				);
			case 'object':
				return createLLMGenerator(
					Factory.makeFinalConfig(config, 'object'),
					generateObject,
					parent
				);
			case 'array':
				return createLLMGenerator(
					Factory.makeFinalConfig(config, 'array'),
					generateObject,
					parent
				);
			case 'enum':
				return createLLMGenerator(
					Factory.makeFinalConfig(config, 'enum'),
					generateObject,
					parent
				);
		}
	}
}