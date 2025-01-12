import { TemplateEngine } from "./TemplateEngine";
import { Context, TemplateConfig } from "./types";

//A TS function signature for a Vercel AI function (generateText, streamText, generateObject, streamObject)
//with the same arguments (but the config includes TemplateConfig options) and return type
export type FunctionCallSignature<F extends (config: any) => Promise<any>> = {
	(promptOrConfig?: Partial<Parameters<F>[0] & TemplateConfig> | string, context?: Context): ReturnType<F>;
	config: Parameters<F>[0] & TemplateConfig;
}

export type CallSignatureConfig<F extends (config: any) => Promise<any>> = Parameters<F>[0] & TemplateConfig;

//Create a generator/streamer from a Vercel AI function
export function createLLMRenderer<F extends (config: any) => Promise<any>>(config: CallSignatureConfig<F>, func: F) {
	type rtype = Awaited<ReturnType<F>>;//avoid TS bug where ReturnType<F> is not considered a promise
	const renderer = new TemplateEngine(config);
	const generator: FunctionCallSignature<F> = (
		async (promptOrConfig?: Partial<CallSignatureConfig<F>> | string, context?: Context): Promise<rtype> => {
			const prompt = await renderer.call(promptOrConfig, context);
			if (typeof promptOrConfig !== 'string') {
				const mergedConfig = renderer.getMergedConfig(promptOrConfig) as (CallSignatureConfig<F>);
				if (context) {
					mergedConfig.context = context;
				}
				return func(mergedConfig as Parameters<F>[0]) as Promise<rtype>;
			}
			else if (typeof promptOrConfig === 'string') {
				const mergedConfig = renderer.getMergedConfig({ prompt: promptOrConfig, }) as CallSignatureConfig<F>;
				return func(mergedConfig as Parameters<F>[0]) as Promise<rtype>;
			}
			return func(config as Parameters<F>[0]) as Promise<rtype>;
		}
	) as FunctionCallSignature<F>;//do this casting to avoid another bug: Type 'Promise<Awaited<ReturnType<F>>>' is not assignable to type 'ReturnType<F>'.ts(2322)
	generator.config = config;
	return generator;
}