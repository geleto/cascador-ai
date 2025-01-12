import { Config } from "./Config";
import { createLLMRenderer } from "./createLLMRenderer";
import { TemplateEngine } from "./TemplateEngine";
import { Context, LLMPartialConfig, TemplateConfig } from "./types";
import { generateObject, generateText } from 'ai';
import { CallSignatureConfig } from "./createLLMRenderer";

//An instance of this class named 'create' is available as an object so that it can be used from templates
type TemplateRenderer<T extends TemplateConfig = TemplateConfig> = {
	(promptOrConfig?: string | Partial<TemplateConfig>, context?: Context): Promise<string>;
	config: T;
}

export class Factory {
	TemplateRenderer(config: Partial<TemplateConfig>, parent?: Config<LLMPartialConfig>): TemplateRenderer {
		const renderer = new TemplateEngine(config, parent);
		const callableRenderer: TemplateRenderer = (promptOrConfig?: string | Partial<TemplateConfig>, context?: Context) => {
			return renderer.call(promptOrConfig, context);
		}
		callableRenderer.config = renderer.config;
		return callableRenderer;
	}

	Config<T extends LLMPartialConfig>(config: T, parent?: Config<LLMPartialConfig>) {
		return new Config<T>(config, parent);
	}

	TextGenerator(config: CallSignatureConfig<typeof generateText>, parent?: Config<LLMPartialConfig>) {
		return createLLMRenderer<typeof generateText>(config, generateText, parent);
	}

	ObjectGenerator(config: CallSignatureConfig<typeof generateObject>, parent?: Config<LLMPartialConfig>) {
		return createLLMRenderer<typeof generateObject>(config, generateObject, parent);
	}
}