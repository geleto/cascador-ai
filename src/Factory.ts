import { Config, ConfigBase } from "./Config";
import { CallSignatureConfig, createLLMRenderer, FunctionCallSignature } from "./createLLMRenderer";
import { TemplateEngine } from "./TemplateEngine";
import { Context, TemplateConfig } from "./types";
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
	Config(config: TemplateConfig) {
		return new Config(config);
	}
	TextGenerator(config: CallSignatureConfig<typeof generateText>) {
		return createLLMRenderer<typeof generateText>(config, generateText);
	}
	ObjectGenerator(config: CallSignatureConfig<typeof generateObject>) {
		return createLLMRenderer<typeof generateObject>(config, generateObject);
	}

}