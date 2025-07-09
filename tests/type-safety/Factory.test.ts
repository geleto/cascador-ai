import { ILoader, LoaderSource } from "cascada-engine";
import { z } from 'zod';
import { create } from '../../src';
import { JSONValue, LanguageModel } from 'ai';

// @todo - replace this with a cleaner, more systematic test suite

const openAIModel: LanguageModel = {} as LanguageModel; // Mocking for type safety tests

/**
 * Type checking tests for the factory functions
 * todo - write more through, documented and systematic tests
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
(async (): Promise<void> => {

	// Define a sample schema for person data
	const schema = z.object({
		name: z.string(),
		age: z.number(),
		hobbies: z.array(z.string()),
	});

	// Define sample tools for city attraction lookup
	const cityTools = {
		cityAttractions: {
			parameters: z.object({ city: z.string() }),
			execute: async (city: string) => {
				console.log(city);
				await new Promise(resolve => setTimeout(resolve, 100));
				return { attractions: ['attraction1', 'attraction2', 'attraction3'] };
			},
		},
	};

	// Custom template loader implementation
	class StringLoader implements ILoader {
		templates: Map<string, string>;
		constructor() {
			this.templates = new Map();
		}
		getSource(name: string) {
			if (!this.templates.has(name)) return null;
			const source: LoaderSource = { src: this.templates.get(name)!, path: name, noCache: false };
			return source;
		}

		addTemplate(name: string, content: string) {
			this.templates.set(name, content);
		}
	};
	const templateLoader = new StringLoader();
	templateLoader.addTemplate('greetingTemplate', 'Hello {name}');

	// SECTION 1: Basic Template Configuration Tests

	// Test 1: Configuration with explicit prompt
	const configWithPrompt = create.Config({ prompt: "Hello {name}" });
	const templateWithPrompt = create.TemplateRenderer({}, configWithPrompt);
	// Valid cases:
	await templateWithPrompt(); // ✓ Uses config prompt
	await templateWithPrompt({ name: "Bob" }); // ✓ Uses config prompt with context
	await templateWithPrompt("Hi {name}"); // ✓ Overrides prompt
	await templateWithPrompt("Hi {name}", { x: 1 }); // ✓ Overrides prompt with context
	// Invalid cases:
	// @ts-expect-error - Extra argument not allowed in template renderer call
	await templateWithPrompt("Hi", {}, "extra"); // ✗ Extra argument not allowed
	// @ts-expect-error - Prompt must be a string, not a number
	await templateWithPrompt(123); // ✗ Prompt must be string

	// Test 2: Empty configuration
	const emptyConfig = create.Config({});
	const templateWithEmptyConfig = create.TemplateRenderer({}, emptyConfig);
	// Invalid cases - no prompt provided:
	// @ts-expect-error - Missing required prompt when no prompt is provided in config
	await templateWithEmptyConfig(); // ✗ Missing required prompt
	// @ts-expect-error - Context without prompt not allowed when no prompt is provided in config
	await templateWithEmptyConfig({ name: "Bob" }); // ✗ Context without prompt not allowed
	// Valid cases:
	await templateWithEmptyConfig("Hi {name}"); // ✓ Provides required prompt
	await templateWithEmptyConfig("Hi {name}", { x: 1 }); // ✓ Provides prompt and context

	// Test 3: Configuration with loader
	const loaderConfig = create.Config({
		promptType: 'template-name',
		loader: templateLoader
	});
	const templateWithLoader = create.TemplateRenderer({}, loaderConfig);
	// Invalid cases:
	// @ts-expect-error - Missing template name when loader is configured
	await templateWithLoader(); // ✗ Missing template name
	// Valid cases:
	await templateWithLoader("greetingTemplate"); // ✓ Provides template name

	// Test 4: Configuration with both prompt and loader
	const fullConfig = create.Config({
		prompt: "Hello {name}",
		promptType: 'template-name',
		loader: templateLoader
	});

	const templateWithFullConfig = create.TemplateRenderer({}, fullConfig);
	// All valid cases:
	await templateWithFullConfig(); // ✓ Uses config prompt
	await templateWithFullConfig({ name: "Bob" }); // ✓ Uses config prompt with context
	await templateWithFullConfig("greetingTemplate"); // ✓ Uses template name
	await templateWithFullConfig("greetingTemplate", { x: 1 }); // ✓ Template with context

	// Test 5: Child overriding parent config
	const parentConfig = create.Config({ prompt: "Parent {name}" });
	const childTemplate = create.TemplateRenderer({ prompt: "Child {name}" }, parentConfig);
	// All valid:
	await childTemplate(); // ✓ Uses child prompt
	await childTemplate({ name: "Bob" }); // ✓ Child prompt with context
	await childTemplate("Override {name}"); // ✓ Override child prompt

	// Test 6: Loader inheritance
	const parentWithLoaderConfig = create.Config({
		promptType: 'template-name',
		loader: templateLoader
	});
	const childWithParentLoader = create.TemplateRenderer({ prompt: "Child {name}" }, parentWithLoaderConfig);
	// All valid:
	await childWithParentLoader(); // ✓ Uses child prompt with parent loader
	await childWithParentLoader({ name: "Bob" }); // ✓ Child prompt with context

	// Test 7: Invalid loader configurations
	// Should fail at creation:
	// @ts-expect-error - Missing required loader when promptType is template-name
	const invalidLoaderTemplate = create.TemplateRenderer({
		promptType: 'template-name' // ✗ Missing required loader
	});
	// @ts-expect-error - Cannot call template renderer without loader when promptType is template-name
	await invalidLoaderTemplate(); // ✗ Missing loader

	// Test 8: Mixed configuration inheritance
	const baseConfig = create.Config({ prompt: "Parent {name}", promptType: 'template-name' });

	const promptParentConfig = create.Config({ prompt: "Parent {name}" });
	const mixedTemplate = create.TemplateRenderer({
		promptType: 'template-name',
		loader: templateLoader
	}, promptParentConfig);
	// All valid:
	await mixedTemplate(); // ✓ Uses parent prompt
	await mixedTemplate("greetingTemplate"); // ✓ Override with template
	await mixedTemplate("greetingTemplate", { x: 1 }); // ✓ Template with context

	// Test 9: Type safety checks
	const typeCheckedTemplate = create.TemplateRenderer({}, configWithPrompt);
	const configType = typeCheckedTemplate.config; // ✓ Preserves exact type
	// Invalid cases:
	// @ts-expect-error - Prompt must be a string, not a boolean
	await typeCheckedTemplate(true); // ✗ Prompt must be string
	// @ts-expect-error - Context must be an object, not a boolean
	await typeCheckedTemplate("Hi", true); // ✗ Context must be object
	// @ts-expect-error - First argument must be a string when providing context
	await typeCheckedTemplate({}, {}); // ✗ First arg must be string with context

	// Test 10: Context structure validation
	const nestedTemplate = create.TemplateRenderer({ prompt: "Hello {user.name}" }, emptyConfig);
	// Valid cases:
	await nestedTemplate({ user: { name: "Bob" } }); // ✓ Valid nested context
	await nestedTemplate("Hi {user.name}", { user: { name: "Bob" } }); // ✓ Override with valid context
	// Invalid cases:
	// @ts-expect-error - Invalid context structure for nested template
	await nestedTemplate({}, {}); // ✗ Invalid context structure

	// Test 11: Multi-level config inheritance
	const rootConfig = create.Config({ model: openAIModel });
	const midConfig = create.Config({ prompt: 'my prompt text' }, rootConfig);

	const rootLoaderConfig = create.Config({ loader: templateLoader, promptType: 'template-name' });
	const midLoaderConfig = create.Config({ prompt: 'my prompt text' }, rootLoaderConfig);
	const leafTemplate = create.TemplateRenderer({}, midLoaderConfig);

	// Test 12: PromptType override in child
	const templateParentConfig = create.Config({
		promptType: 'template-name',
		loader: templateLoader
	});
	const directTemplate = create.TemplateRenderer({
		promptType: 'template' // Changes to direct template
	}, templateParentConfig);

	// Test 13: Empty context validation
	const simpleTemplate = create.TemplateRenderer({ prompt: "Hello" });
	await simpleTemplate({}); // ✓ Empty context is valid
	await simpleTemplate(); // ✓ Undefined context is valid

	// Test strict TemplateConfig validation
	// @ts-expect-error - Invalid property in template renderer configuration
	const invalidTemplate = create.TemplateRenderer({ prompt: "Hello", invalid: 1 }); // ✗ Invalid property

	const templateParent = create.Config({ prompt: "Hello" });
	// @ts-expect-error - Invalid property in child template renderer configuration
	const invalidChildTemplate = create.TemplateRenderer({ invalid: 1 }, templateParent);

	const modelParent = create.Config({ prompt: "Hello", model: openAIModel });
	// @ts-expect-error - Incompatible promptType with model parent configuration
	const incompatibleTemplate = create.TemplateRenderer({ promptType: 'template' }, modelParent);

	// SECTION 2: Text Generation Tests

	// Invalid configuration
	// @ts-expect-error - Invalid property in text generator configuration
	const invalidGenerator = create.TextGenerator({ model: openAIModel, invalid: 1 });

	const basicGenerator = create.TextGenerator({ model: openAIModel });
	await basicGenerator("Hello"); // ✓ Basic text generation
	// Invalid cases:
	// @ts-expect-error - Missing prompt in text generator call
	await basicGenerator({ system: "Be helpful" }); // ✗ Missing prompt
	// @ts-expect-error - Missing prompt in text generator call
	await basicGenerator(); // ✗ Missing prompt

	const modelParentConfig = create.Config({ model: openAIModel });
	const templateGenerator = create.TextGenerator({ prompt: "Hello", promptType: 'template' }, modelParentConfig);
	await templateGenerator(); // ✓ Uses inherited model

	const modelParentConfig2 = create.Config({ model: openAIModel });
	const noSchemaGenerator = create.ObjectGenerator({ output: 'no-schema' }, modelParentConfig);

	const messageGenerator = create.TextGenerator({
		model: openAIModel,
		messages: [{ role: 'user', content: 'Hi' }]
	});
	await messageGenerator(); // ✓ Message-based generation

	const toolGenerator = create.TextGenerator({
		model: openAIModel,
		tools: cityTools,
		maxSteps: 3,
	});
	await toolGenerator("Find attractions in London"); // ✓ Generation with tools

	const incompatibleParent = create.Config({ model: openAIModel, output: 'object' });
	// @ts-expect-error - Incompatible text generator with object output parent
	const invalidTextGen = create.TextGenerator({ prompt: "Hello" }, incompatibleParent);

	// SECTION 3: Streaming Tests

	const basicStreamer = create.TextStreamer({ model: openAIModel });
	const streamResult = await basicStreamer("Stream");
	for await (const chunk of streamResult.textStream) { /* consume stream */ } // ✓ Basic text streaming

	// SECTION 4: Object Generation Tests

	const objectGenerator = create.ObjectGenerator({
		model: openAIModel,
		output: 'object',
		schema
	});
	await objectGenerator("Generate person"); // ✓ Single object generation

	const arrayGenerator = create.ObjectGenerator({
		model: openAIModel,
		output: 'array',
		schema
	});
	await arrayGenerator("Generate people"); // ✓ Array generation

	const enumGenerator = create.ObjectGenerator({
		model: openAIModel,
		output: 'enum',
		enum: ['yes', 'no', 'maybe']
	});
	await enumGenerator("Should I?"); // ✓ Enum generation

	const schemalessGenerator = create.ObjectGenerator({
		model: openAIModel,
		output: 'no-schema'
	});
	await schemalessGenerator("Free-form JSON"); // ✓ Schemaless generation

	const toolObjectGen = create.ObjectGenerator({
		model: openAIModel,
		tools: cityTools,
		// @ts-expect-error - Cannot combine tools with object output type
		output: 'object', // ✗ Cannot combine tools with object output
		schema
	});

	// SECTION 5: Object Streaming Tests

	const objectStreamer = create.ObjectStreamer({
		model: openAIModel,
		output: 'object',
		schema,
		onFinish: (event) => { console.log(event); }
	});
	for await (const chunk of (await objectStreamer("Stream person")).partialObjectStream) { /* consume stream */ } // ✓ Object streaming

	// SECTION 6: Error Cases

	// @ts-expect-error - Missing required model in text generator configuration
	const modellessGen = create.TextGenerator({}); // ✗ Missing required model

	const schemalessObjGen = create.ObjectGenerator({
		model: openAIModel,
		// @ts-expect-error - Missing required schema for object output type
		output: 'object'
	}); // ✗ Missing required schema

	const enumlessGen = create.ObjectGenerator({
		model: openAIModel,
		// @ts-expect-error - Missing required enum values for enum output type
		output: 'enum'
	}); // ✗ Missing required enum values

	const extraPropGen = create.ObjectGenerator({
		// @ts-expect-error - Unknown property in object generator configuration
		output: 'object',
		schema,
		model: openAIModel,
		extraProp: 123 // ✗ Unknown property
	});

	// SECTION 7: Complex Inheritance Tests

	const toolParentConfig = create.Config({
		model: openAIModel,
		tools: cityTools
	});

	const toolChildGenerator = create.TextGenerator({
		maxSteps: 5
	}, toolParentConfig);

	await toolChildGenerator("Generate person using tools"); // ✓ Inherited tools

	// SECTION 8: Advanced Configuration Tests

	const dualPurposeGen = create.TextGenerator({
		model: openAIModel,
		prompt: "Hello",
		messages: [{ role: 'system', content: 'Be helpful' }]
	}); // ✓ Both prompt and messages

	const messageParentConfig = create.Config({
		messages: [{ role: 'system', content: 'Be helpful' }],
		model: openAIModel
	});
	const promptChildGen = create.TextGenerator({ prompt: "Hello" }, messageParentConfig); // ✓ Parent messages, child prompt

	// Template Integration Tests
	const templateTextGen = create.TextGenerator({
		model: openAIModel,
		promptType: 'template',
		prompt: "Hello {name}",
	});
	await templateTextGen({ name: "Bob" }); // ✓ Template with text generation

	const namedTemplateGen = create.TextGenerator({
		model: openAIModel,
		promptType: 'template-name',
		loader: templateLoader
	});
	await toolGenerator("greetingTemplate", { name: "Bob" }); // ✓ Named template with generation

	const streamingTemplateGen = create.TextStreamer({
		model: openAIModel,
		promptType: 'template',
		prompt: "Stream {what}"
	});
	for await (const chunk of (await streamingTemplateGen({ what: "data" })).textStream) { /* consume stream */ } // ✓ Template with streaming

	// SECTION 9: Complex Object Generation Tests

	// Define a complex nested schema for thorough testing
	const complexUserSchema = z.object({
		user: z.object({
			details: z.object({
				name: z.string(),
				preferences: z.array(z.string())
			}),
			history: z.array(z.object({
				action: z.string(),
				timestamp: z.number()
			}))
		})
	});

	const complexObjectGen = create.ObjectGenerator({
		model: openAIModel,
		output: 'object',
		schema: complexUserSchema
	}); // ✓ Complex nested schema generation

	const invalidToolObjectGen = create.ObjectGenerator({
		model: openAIModel,
		// @ts-expect-error - Cannot combine tools with object output type
		output: 'object',
		schema: complexUserSchema,
		tools: cityTools
	}); // ✗ Cannot combine tools with object output

	// SECTION 10: Output Type Override Tests

	const arrayParentConfig = create.Config({
		model: openAIModel,
		output: 'array',
		schema
	});

	const objectChildGen = create.ObjectGenerator({
		output: 'object'
	}, arrayParentConfig); // ✓ Override parent's output type

	// Schema override with output type
	const baseSchemaConfig = create.Config({
		model: openAIModel,
		schema
	});

	const schemaOverrideGen = create.ObjectGenerator({
		output: 'object',
		schema
	}, baseSchemaConfig);

	// Schema-only override
	const objectParentConfig = create.Config({
		model: openAIModel,
		output: 'object',
		schema
	});

	const schemaChildGen = create.ObjectGenerator({
		schema
	}, objectParentConfig);

	const invalidEnumStreamer = create.ObjectStreamer({
		model: openAIModel,
		// @ts-expect-error - Enum output type not supported with streaming
		output: 'enum',
		enum: ['yes', 'no']
	}); // ✗ Enum not supported with streaming

	// SECTION 11: Multi-level Inheritance Tests

	const rootConfigWithContext = create.Config({
		model: openAIModel,
		context: { root: true }
	});

	// Complex inheritance test with templates and object generation
	const configChild = create.Config({
		filters: { upper: (s: string) => s.toUpperCase() },
		context: { parent: true },
		model: openAIModel,
	}, rootConfigWithContext);
	const templateChildGen = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
		promptType: 'template',
		context: { child: true }
	}, configChild);

	const parentConfig2 = create.Config({
		model: openAIModel,
	});

	const objectChildConfig2 = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, parentConfig2);

	await templateChildGen({ what: "person" }); // ✓ Uses merged context

	// Helper function for model type checking
	function modelConfigCheck(config: { model: LanguageModel }) {
		console.log(config.model);
	}
	modelConfigCheck({ model: openAIModel }); // ✓ Valid model configuration

	// SECTION 12: Mixed Configuration Tests

	const hybridStreamer = create.ObjectStreamer({
		model: openAIModel,
		output: 'object',
		schema,
		loader: templateLoader,
		promptType: 'template-name',
	});

	const templateStreamer = create.ObjectStreamer({
		model: openAIModel,
		output: 'object',
		schema,
		loader: templateLoader
	});

	// Test incompatible mixing of tools and object output
	const objectParentConfigWithContext = create.Config({
		model: openAIModel,
		output: 'object',
		schema,
		context: { base: true }
	});

	const invalidToolChild = create.ObjectGenerator(
		{
			// @ts-expect-error - Cannot mix tools with object output configuration
			tools: cityTools,
			prompt: "Generate {what}",
		}, objectParentConfigWithContext); // ✗ Cannot mix tools with object output

	// Test incompatible mixing of object output with tools parent
	const toolParentConfigWithContext = create.Config({
		model: openAIModel,
		tools: cityTools
	});

	const invalidObjectChild = create.ObjectGenerator({
		// @ts-expect-error - Cannot mix object output with tools configuration
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, toolParentConfigWithContext); // ✗ Cannot mix object output with tools

	// Test template context compatibility
	const baseModelConfig = create.Config({
		model: openAIModel,
	});

	const templateContextGen = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
		context: { child: true }
	}, baseModelConfig);

	// Test parent template context compatibility
	const contextParentConfig = create.Config({
		model: openAIModel,
		context: { base: true }
	});

	const objectChildGenWithContext = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, contextParentConfig);

	// Test promptType:'text' compatibility
	const textPromptParentConfig = create.Config({
		model: openAIModel,
		promptType: 'text'
	});
	const invalidTemplateChild = create.ObjectGenerator({
		// @ts-expect-error - Cannot mix promptType:'text' with template configuration
		output: 'object',
		schema,
		prompt: "Generate person",
		context: { child: true }
	}, textPromptParentConfig); // ✗ Cannot mix promptType:'text' with template config

	// Test promptType:'text' with parent template context
	const templateContextParent = create.Config({
		model: openAIModel,
		context: { child: true }
	});
	const invalidTextPromptChild = create.ObjectGenerator({
		// @ts-expect-error - Cannot mix promptType:'text' with template configuration
		output: 'object',
		schema,
		prompt: "Generate person",
		promptType: 'text'
	}, templateContextParent); // ✗ Cannot mix promptType:'text' with template config

	// Config-only inheritance tests
	const contextBaseConfig = create.Config({
		model: openAIModel,
		context: { base: true }
	});
	const objectChildConfig3 = create.Config({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, contextBaseConfig);

	// Test promptType:'text' inheritance
	const textPromptBaseConfig = create.Config({
		model: openAIModel,
		promptType: 'text'
	});

	const invalidTemplateChildConfig = create.Config({
		output: 'object',
		schema,
		prompt: "Generate person",
		context: { child: true }
		// @ts-expect-error - Cannot mix promptType:'text' with template configuration
	}, textPromptBaseConfig); // ✗ Cannot mix promptType:'text' with template config

	const streamResult2 = await hybridStreamer("greetingTemplate", { user: "Bob" });
	for await (const chunk of streamResult2.partialObjectStream) { /* consume stream */ } // ✓ Templates + streaming

	// SECTION 13: Tool Factory Tests

	// Test converting a TextGenerator to a Tool
	const textRenderer = create.TextGenerator({
		model: openAIModel,
		prompt: 'Analyze the sentiment of: {{ text }}'
	});

	const sentimentTool2 = create.Tool({
		description: 'Analyze the sentiment of a given text',
		parameters: z.object({
			text: z.string().describe('The text to analyze')
		}),
	}, textRenderer);

	// Test converting a ScriptRunner to a Tool
	const scriptRenderer = create.ScriptRunner({
		script: `:data
			const result = await fetch('https://api.example.com/data?city={{ city }}');
			const data = await result.json();
			@data = { temperature: data.temp, humidity: data.humidity };
		`
	});

	const weatherTool = create.Tool({
		description: 'Get weather information for a city',
		parameters: z.object({
			city: z.string().describe('The city to get weather for')
		})
	}, scriptRenderer);

	// Test converting an ObjectGenerator to a Tool
	const objectRenderer = create.ObjectGenerator({
		model: openAIModel,
		output: 'object',
		schema,
		prompt: 'Summarize this text: {{ content }}'
	});

	const summaryTool = create.Tool({
		description: 'Create a summary of the given text',
		parameters: z.object({
			content: z.string().describe('The text to summarize')
		})
	}, objectRenderer);

	// Test using tools in a TextGenerator
	const toolRenderer = create.TextGenerator({
		model: openAIModel,
		tools: {
			sentimentAnalyzer: sentimentTool2,
			weatherLookup: weatherTool,
			textSummarizer: summaryTool
		},
		prompt: 'Analyze the sentiment and summarize this text: {{ text }}'
	});

	await toolRenderer({ text: 'This is a great day!' }); // ✓ Tool integration

	// SECTION 14: Error Cases for Tool Factory

	// @ts-expect-error - Missing required parameters in tool configuration
	const toolWithoutParameters = create.Tool({
		description: 'Test tool'
	}, textRenderer); // ✗ Missing parameters

	// @ts-expect-error - Missing required parent renderer in tool configuration
	const toolWithoutParent = create.Tool({
		description: 'Test tool',
		parameters: z.object({ text: z.string() })
	}); // ✗ Missing parent renderer

	// SECTION 13: Tool Factory Tests (Expanded)

	// Test 1: Create a tool from each type of renderer/runner
	// 1a. Parent: TextGenerator
	const textGenParent = create.TextGenerator({
		model: openAIModel,
		prompt: 'Analyze the sentiment of this text: {{text}}',
		promptType: 'template',
	});
	const sentimentTool = create.Tool({
		description: 'Analyzes the sentiment of a given text.',
		parameters: z.object({ text: z.string().describe('The text to analyze') }),
	}, textGenParent);

	// Type-check execute function and result
	const sentimentResult: string = await sentimentTool.execute({ text: 'I love this!' }, { toolCallId: 'test', messages: [] });

	// 1b. Parent: ObjectGenerator
	const objectGenParent = create.ObjectGenerator({
		model: openAIModel,
		output: 'object',
		schema,
		prompt: 'Generate a user profile for a person who likes the following content: {{content}}',
		promptType: 'template',
	});
	const userProfileTool = create.Tool({
		description: 'Generates a user profile object based on text content.',
		parameters: z.object({ content: z.string() }),
	}, objectGenParent);
	// Type-check execute function and result
	const userProfileResult: z.infer<typeof schema> = await userProfileTool.execute({ content: 'Cats and dogs' }, { toolCallId: 'test', messages: [] });
	console.log(userProfileResult);

	// 1c. Parent: ScriptRunner
	const scriptRunnerParent = create.ScriptRunner({
		scriptType: 'async-script',
		script: `
			: vars
	default_val = 'unknown'
			: script
				# Simulate an API call
	const data = { location: '{{city | default: default_val}}', time: new Date().toISOString() };
	@data = data;
	`
	});
	const locationTool = create.Tool({
		description: 'Gets the current time for a specified location.',
		parameters: z.object({ city: z.string() }),
	}, scriptRunnerParent);
	// Type-check execute function and result
	const locationResult = await locationTool.execute({ city: 'New York' }, { toolCallId: 'test', messages: [] }) as { location: string, time: string };
	console.log(locationResult);


	// 1d. Parent: TemplateRenderer
	const templateRendererParent = create.TemplateRenderer({
		prompt: 'The magic word for {{user}} is {{word | upper}}.',
		promptType: 'template',
		filters: { upper: (s: string) => s.toUpperCase() },
	});
	const magicWordTool = create.Tool({
		description: 'Generates a magic word for a user.',
		parameters: z.object({
			user: z.string(),
			word: z.string(),
		}),
	}, templateRendererParent);
	// Type-check execute function and result
	const magicWordResult: string = await magicWordTool.execute({ user: 'Gandalf', word: 'mellon' }, { toolCallId: 'test', messages: [] });

	// 1e. Tool with no parameters
	const timestampTool = create.Tool({
		description: 'Gets the current timestamp.',
		parameters: z.object({}), // or z.any()
	}, create.ScriptRunner({ script: '@data = new Date().toISOString()' }));
	const timestampResult: JSONValue = await timestampTool.execute({}, { toolCallId: 'test', messages: [] }); // ✓ Correctly takes empty object
	const timestampResult2: JSONValue = await timestampTool.execute({}, { toolCallId: 'test', messages: [] }); // ✓ Or no arguments at all
	console.log(timestampResult);
	console.log(timestampResult2);

	// Test 2: Using the created tools in another generator
	const masterGenerator = create.TextGenerator({
		model: openAIModel,
		tools: {
			getSentiment: sentimentTool,
			createProfile: userProfileTool,
			getLocationTime: locationTool,
			getMagicWord: magicWordTool,
			getTimestamp: timestampTool
		},
		maxSteps: 5,
	});

	// This call is valid because it uses the tools defined above.
	await masterGenerator('Get the magic word for user "Frodo" with the word "ring", then get the sentiment of "I hate it".');

	// Test 3: Tool with inherited configuration
	const parentModelConfig = create.Config({ model: openAIModel });
	const childTextGen = create.TextGenerator({
		prompt: 'Translate to French: {{text}}',
		promptType: 'template'
	}, parentModelConfig);
	const translationTool = create.Tool({
		description: 'Translates text to French.',
		parameters: z.object({ text: z.string() }),
	}, childTextGen); // ✓ This is valid as model is inherited

	// SECTION 14: Advanced Tool and Error Cases

	// Test 4: Invalid Tool configurations
	// 4a. Missing parameters
	// @ts-expect-error - Missing required parameters in tool configuration
	const toolWithoutParameters = create.Tool({
		description: 'A tool without parameters.',
	}, textGenParent);

	// 4b. Missing parent renderer
	// @ts-expect-error - Missing required parent renderer in tool configuration
	const toolWithoutParent = create.Tool({
		description: 'A tool without a parent.',
		parameters: z.object({ text: z.string() }),
	});

	// 4c. Parent is not a valid renderer instance (e.g., a raw Config)
	const toolWithInvalidParent = create.Tool({
		description: 'A tool with an invalid parent.',
		parameters: z.object({ text: z.string() }),
		// @ts-expect-error - Cannot use a Config object as parent, must be a renderer instance
	}, parentModelConfig); // ✗ Cannot use a Config object, must be a renderer instance

	// 4d. Extra, unknown properties in the tool config
	// @ts-expect-error - Unknown property in tool configuration
	const toolWithExtraProps = create.Tool({
		description: 'A tool with extra properties.',
		parameters: z.object({ text: z.string() }),
		extra: 'property'
	}, textGenParent);

	// 4e. Check result type mismatches
	const anotherObjectTool = create.Tool({
		description: 'Generates a user profile object based on text content.',
		parameters: z.object({ content: z.string() }),
	}, objectGenParent);
	// @ts-expect-error - Result should be the schema object, not a string
	const badResult: string = await anotherObjectTool.execute({ content: 'test' }, { toolCallId: 'test', messages: [] });

	// Test 5: Tool with a complex, nested parameter schema
	const complexSchema = z.object({
		user: z.object({
			id: z.string(),
			name: z.string(),
		}),
		settings: z.object({
			notifications: z.boolean(),
			theme: z.enum(['light', 'dark']),
		}).optional(),
	});

	const complexTool = create.Tool({
		description: 'A tool with complex parameters.',
		parameters: complexSchema,
	}, textGenParent);

	// This call is valid, and the type of `args` inside the tool's execute function
	// would be correctly inferred as `z.infer<typeof complexSchema>`.
	await complexTool.execute({
		user: { id: '123', name: 'Alice' },
		settings: { notifications: true, theme: 'dark' },
	}, { toolCallId: 'test', messages: [] });
})().catch(console.error);