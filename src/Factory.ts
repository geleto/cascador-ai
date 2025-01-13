import { Config } from "./Config";
import { createLLMGenerator, createLLMStreamer, GeneratorConfig, StreamerConfig } from "./createLLMRenderer";
import { TemplateEngine } from "./TemplateEngine";
import {
	Context,
	LLMPartialConfig,
	TemplateConfig,
	ObjectStreamOutput,
	ObjectGeneratorOutput,
	ObjectStreamerConfig,
	ObjectGeneratorConfig
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
	TemplateRenderer(config: Partial<TemplateConfig>, parent?: Config): TemplateRenderer {
		const renderer = new TemplateEngine(config, parent);
		const callableRenderer: TemplateRenderer = (promptOrConfig?: string | Partial<TemplateConfig>, context?: Context) => {
			return renderer.call(promptOrConfig, context);
		}
		callableRenderer.config = renderer.config;
		return callableRenderer;
	}

	Config<T extends LLMPartialConfig>(config: T, parent?: Config) {
		return new Config<T>(config, parent);
	}

	// Use generator for Promise-based functions
	TextGenerator(config: GeneratorConfig<typeof generateText>, parent?: Config) {
		return createLLMGenerator<typeof generateText>(config, generateText, parent);
	}

	// Use streamer for stream-based functions
	TextStreamer(config: StreamerConfig<typeof streamText>, parent?: Config) {
		return createLLMStreamer<typeof streamText>(config, streamText, parent);
	}

	ObjectGenerator<T>(
		config: ObjectGeneratorConfig & { schema?: z.Schema<T> },
		parentOrOutput?: Config | ObjectGeneratorOutput,
		maybeOutput: ObjectGeneratorOutput = 'object'
	) {
		const parent = parentOrOutput instanceof Config ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof Config ? maybeOutput : (parentOrOutput || maybeOutput);

		const finalConfig = {
			...config,
			output
		} as Parameters<typeof generateObject>[0];

		return createLLMGenerator(finalConfig, generateObject, parent);
	}

	ObjectStreamer<T>(
		config: ObjectStreamerConfig & { schema?: z.Schema<T> },
		parentOrOutput?: Config | ObjectStreamOutput,
		maybeOutput: ObjectStreamOutput = 'object'
	) {
		const parent = parentOrOutput instanceof Config ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof Config ? maybeOutput : (parentOrOutput || maybeOutput);

		const finalConfig = {
			...config,
			output
		} as Parameters<typeof streamObject>[0];

		return createLLMStreamer(finalConfig, streamObject, parent);
	}
}