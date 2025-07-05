import { Tool as VercelTool } from 'ai';
import { ConfigError } from './validate';
import { ToolConfig, ToolParameters } from './types';



// Implementation
export function Tool<PARAMETERS extends ToolParameters = any, RESULT = any>(
	config: ToolConfig<PARAMETERS, RESULT>,
	parent: { (context?: PARAMETERS): Promise<any>; config: any }
): VercelTool<PARAMETERS, RESULT> {

	// Debug output if config.debug is true
	if ('debug' in config && config.debug) {
		console.log('[DEBUG] Tool created with config:', JSON.stringify(config, null, 2));
	}

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!config.parameters) {
		throw new ConfigError('Tool config requires parameters schema');
	}

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!parent) {
		throw new ConfigError('Tool requires a parent renderer/scriptrunner');
	}

	// Create the tool execution function
	const execute = async (args: PARAMETERS): Promise<any> => {
		if ('debug' in config && config.debug) {
			console.log('[DEBUG] Tool execution called with args:', args);
		}

		// Execute the parent renderer
		return await parent(args);
	};

	// Return the Vercel AI Tool directly
	return {
		...config,
		execute,
		type: 'function' as const
	}
}