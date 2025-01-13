import { Config } from "./Config";
import { createLLMGenerator, createLLMStreamer } from "./createLLMRenderer";
import { TemplateEngine } from "./TemplateEngine";
import {
	Context,
	LLMPartialConfig,
	TemplateConfig,
	ObjectStreamOutput,
	ObjectGeneratorOutput,
	GeneratorConfig,
	StreamerConfig,
	ObjectStreamerConfig,
	ObjectGeneratorConfig
} from "./types";
import { generateObject, generateText, streamText, streamObject } from 'ai';

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

	// Object generator with output type handling
	ObjectGenerator(config: ObjectGeneratorConfig, parentOrOutput: Config | ObjectGeneratorOutput | undefined = undefined, maybeOutput: ObjectGeneratorOutput = 'object') {
		const parent = parentOrOutput instanceof Config ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof Config ? maybeOutput : (parentOrOutput || maybeOutput);

		return createLLMGenerator<typeof generateObject>({
			...config,
			output
		}, generateObject, parent);
	}

	// Use streamer for stream-based functions
	TextStreamer(config: StreamerConfig<typeof streamText>, parent?: Config) {
		return createLLMStreamer<typeof streamText>(config, streamText, parent);
	}

	// Object streamer with output type handling
	// Second parameter can be either a Config instance (parent) or an ObjectStreamOutput string
	// If second parameter is Config, third parameter is used for output type
	// If second parameter is string or undefined, it's used as output type (defaults to 'object')
	ObjectStreamer(config: ObjectStreamerConfig, parentOrOutput: Config | ObjectStreamOutput | undefined = undefined, maybeOutput: ObjectStreamOutput = 'object') {
		const parent = parentOrOutput instanceof Config ? parentOrOutput : undefined;
		const output = parentOrOutput instanceof Config ? maybeOutput : (parentOrOutput || maybeOutput);

		return createLLMStreamer<typeof streamObject>({
			...config,
			output: output
		}, streamObject, parent);
	}
}