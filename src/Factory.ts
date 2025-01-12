import { Config, ConfigBase } from "./Config";
import { CallSignatureConfig, createLLMRenderer, FunctionCallSignature } from "./createLLMRenderer";
import { TemplateEngine } from "./TemplateEngine";
import { LLMPartialConfig, Context, TemplateConfig } from "./types";
import { generateObject, generateText } from 'ai';

type TemplateRenderer = ConfigBase<TemplateConfig> & {
	(promptOrConfig?: string | Partial<TemplateConfig>, context?: Context): Promise<string>;
	config: TemplateConfig;
}

//An instance of this class named 'create' is available as an object so that it can be used from templates
export class Factory {
	TemplateRenderer(config: TemplateConfig, parent?: Config): TemplateRenderer {
		const renderer = new TemplateEngine(config, parent);
		const callableRenderer = (promptOrConfig?: string | Partial<TemplateConfig>, context?: Context) => {
			if (typeof promptOrConfig !== 'string') {
				config = renderer.getMergedConfig(promptOrConfig);
			}
			return renderer.call(promptOrConfig, context);
		}
		callableRenderer.config = config;
		return callableRenderer;
	}
	Config(config: LLMPartialConfig, parent?: Config) {
		return new Config(config, parent);
	}
	TextGenerator(config: CallSignatureConfig<typeof generateText>, parent?: Config) {
		return createLLMRenderer<typeof generateText>(config, generateText, parent);
	}
	ObjectGenerator(config: CallSignatureConfig<typeof generateObject>, parent?: Config) {
		return createLLMRenderer<typeof generateObject>(config, generateObject, parent);
	}
}