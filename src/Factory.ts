import { ConfigData } from "./ConfigData";
import { createLLMGenerator, createLLMStreamer } from "./createLLMRenderer";
import { TemplateEngine } from "./TemplateEngine";
import {
	Context,
	LLMPartialConfig,
	TemplateConfig,
	ObjectStreamOutputType,
	ObjectGeneratorOutputType,
	ConfigFromFunction
} from "./types";
import { generateObject, generateText, streamText, streamObject } from 'ai';
import { z } from 'zod';

//todo - rename
//An instance of this class named 'create' is available as an object so that it can be used from templates
type TemplateRenderer<T extends TemplateConfig = TemplateConfig> = {
	(promptOrConfig?: string | Partial<TemplateConfig>, context?: Context): Promise<string>;
	config: T;
}

export class Factory {
	TemplateRenderer(config: Partial<TemplateConfig>, parent?: ConfigData): TemplateRenderer {
		const renderer = new TemplateEngine(config, parent);
		const callableRenderer: TemplateRenderer = (promptOrConfig?: string | Partial<TemplateConfig>, context?: Context) => {
			return renderer.call(promptOrConfig, context);
		}
		callableRenderer.config = renderer.config;
		return callableRenderer;
	}

	ConfigData<T extends LLMPartialConfig>(config: T, parent?: ConfigData) {
		return new ConfigData<T>(config, parent);
	}

	// Use generator for Promise-based functions
	TextGenerator(config: ConfigFromFunction<typeof generateText>, parent?: ConfigData) {
		return createLLMGenerator<typeof generateText>(config, generateText, parent);
	}

	// Use streamer for stream-based functions
	TextStreamer(config: ConfigFromFunction<typeof streamText>, parent?: ConfigData) {
		return createLLMStreamer<typeof streamText>(config, streamText, parent);
	}

	ObjectGenerator<T>(
		config: ConfigFromFunction<typeof generateObject> & { schema?: z.Schema<T> },
		parentOrOutput?: ConfigData | ObjectGeneratorOutputType,
		maybeOutput: ObjectGeneratorOutputType = 'object'
	) {
		const parent = parentOrOutput instanceof ConfigData ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof ConfigData ? maybeOutput : (parentOrOutput || maybeOutput);

		const finalConfig = {
			...config,
			output
		} as Parameters<typeof generateObject>[0];

		return createLLMGenerator(finalConfig, generateObject, parent);
	}

	ObjectStreamer<T>(
		config: ConfigFromFunction<typeof streamObject> & { schema?: z.Schema<T> },
		parentOrOutput?: ConfigData | ObjectStreamOutputType,
		maybeOutput: ObjectStreamOutputType = 'object'
	) {
		const parent = parentOrOutput instanceof ConfigData ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof ConfigData ? maybeOutput : (parentOrOutput || maybeOutput);

		const finalConfig = {
			...config,
			output
		} as Parameters<typeof streamObject>[0];

		return createLLMStreamer(finalConfig, streamObject, parent);
	}
}