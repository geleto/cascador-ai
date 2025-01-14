import { generateObject, generateText, streamText } from 'ai';

import { ConfigData } from "./ConfigData";
import { createLLMGenerator, createLLMStreamer, GeneratorCallSignature } from "./createLLMRenderer";
import { TemplateCallSignature, TemplateEngine } from "./TemplateEngine";
import { Context, LLMPartialConfig, TemplateConfig, ObjectGeneratorOutputType, ConfigFromFunction, SchemaType } from "./types";

type RequiresSchema = 'array' | 'object' | 'enum';

// Base config without output but preserving required fields

export class Factory {
	ConfigData<T extends LLMPartialConfig>(config: T, parent?: ConfigData) {
		return new ConfigData<T>(config, parent);
	}

	TemplateRenderer(config: Partial<TemplateConfig>, parent?: ConfigData): TemplateCallSignature {
		const renderer = new TemplateEngine(config, parent);
		const callableRenderer: TemplateCallSignature = (promptOrConfig?: string | Partial<TemplateConfig>, context?: Context) => {
			return renderer.call(promptOrConfig, context);
		}
		callableRenderer.config = renderer.config;
		return callableRenderer;
	}

	TextGenerator(config: ConfigFromFunction<typeof generateText>, parent?: ConfigData) {
		return createLLMGenerator<typeof generateText>(config, generateText, parent);
	}

	TextStreamer(config: ConfigFromFunction<typeof streamText>, parent?: ConfigData) {
		return createLLMStreamer<typeof streamText>(config, streamText, parent);
	}

	// Overload 1: With ConfigData parent
	ObjectGenerator<T = any>(
		config: ConfigFromFunction<typeof generateObject> & { schema: SchemaType<T> },
		parentOrOutput: ConfigData,
		maybeOutput: RequiresSchema
	): GeneratorCallSignature<typeof generateObject>;

	ObjectGenerator<T = any>(
		config: ConfigFromFunction<typeof generateObject> & { schema?: SchemaType<T> },
		parentOrOutput: ConfigData,
		maybeOutput: Exclude<ObjectGeneratorOutputType, RequiresSchema>
	): GeneratorCallSignature<typeof generateObject>;

	// Overload 2: Direct output type
	ObjectGenerator<T = any>(
		config: ConfigFromFunction<typeof generateObject> & { schema: SchemaType<T> },
		parentOrOutput: RequiresSchema
	): GeneratorCallSignature<typeof generateObject>;

	ObjectGenerator<T = any>(
		config: ConfigFromFunction<typeof generateObject> & { schema?: SchemaType<T> },
		parentOrOutput?: Exclude<ObjectGeneratorOutputType, RequiresSchema>
	): GeneratorCallSignature<typeof generateObject>;

	// Implementation
	ObjectGenerator<T = any>(
		config: ConfigFromFunction<typeof generateObject> & { schema?: SchemaType<T> },
		parentOrOutput?: ConfigData | ObjectGeneratorOutputType,
		maybeOutput: ObjectGeneratorOutputType = 'object'
	): GeneratorCallSignature<typeof generateObject> {
		const parent = parentOrOutput instanceof ConfigData ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof ConfigData ? maybeOutput : (parentOrOutput ?? maybeOutput);
		const configWithOutput = {
			...config,
			output
		} as Parameters<typeof generateObject>[0];

		return createLLMGenerator(configWithOutput, generateObject, parent);
	}
}

/*const create = new Factory();

import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
(() => {
	const schema = z.object({ foo: z.string() });
	const model = openai('gpt-4');

	const parent = create.ConfigData({
		model
	});

	const t1 = create.TextGenerator({
		prompt: 'test'
	}, parent);

	const t2 = create.ObjectGenerator({
		schema,
		model,
		prompt: 'test'
	}, parent, 'object');

	console.log(t1.config);

	const t3 = create.ObjectGenerator({
		prompt: 'test',
		model: openai('gpt-4')
	}, 'no-schema');

	const t3 = create.ObjectGenerator({
		schema,
		prompt: 'test',
		model: openai('gpt-4')
	}, 'object');
})();*/