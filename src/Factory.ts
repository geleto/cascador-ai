import { generateObject, generateText, streamText, streamObject } from 'ai';

import { ConfigData } from "./ConfigData";
import { createLLMGenerator, createLLMStreamer } from "./createLLMRenderer";
import { TemplateCallSignature, TemplateEngine } from "./TemplateEngine";
import { Context, LLMPartialConfig, TemplateConfig, ObjectStreamOutputType, ObjectGeneratorOutputType, ConfigFromFunction, SchemaType } from "./types";

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

	ObjectGenerator<T = any>(
		config: ConfigFromFunction<typeof generateObject> & { schema: SchemaType<T> },
		parentOrOutput?: ConfigData | ObjectGeneratorOutputType,
		maybeOutput: ObjectGeneratorOutputType = 'object'
	) {
		const parent = parentOrOutput instanceof ConfigData ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof ConfigData ? maybeOutput : (parentOrOutput ?? maybeOutput);
		const configWithOutput = {
			...config,
			output: output
		} as Parameters<typeof generateObject>[0];

		return createLLMGenerator(configWithOutput, generateObject, parent);
	}

	ObjectStreamer<T = any>(
		config: ConfigFromFunction<typeof streamObject> & { schema: SchemaType<T> },
		parentOrOutput?: ConfigData | ObjectStreamOutputType,
		maybeOutput: ObjectStreamOutputType = 'object'
	) {
		const parent = parentOrOutput instanceof ConfigData ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof ConfigData ? maybeOutput : (parentOrOutput ?? maybeOutput);
		const configWithOutput = {
			...config,
			output: output
		} as Parameters<typeof streamObject>[0];

		return createLLMStreamer(configWithOutput, streamObject, parent);
	}
}