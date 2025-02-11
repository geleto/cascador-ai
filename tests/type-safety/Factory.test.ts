import { openai } from '@ai-sdk/openai';
import { ILoader, LoaderSource } from "cascada-tmpl";
import { z } from 'zod';
import { create } from '../../src';
import { LanguageModel } from 'ai';

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
	// @ts-expect-error
	await templateWithPrompt("Hi", {}, "extra"); // ✗ Extra argument not allowed
	// @ts-expect-error
	await templateWithPrompt(123); // ✗ Prompt must be string

	// Test 2: Empty configuration
	const emptyConfig = create.Config({});
	const templateWithEmptyConfig = create.TemplateRenderer({}, emptyConfig);
	// Invalid cases - no prompt provided:
	// @ts-expect-error
	await templateWithEmptyConfig(); // ✗ Missing required prompt
	// @ts-expect-error
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
	// @ts-expect-error
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
	// @ts-expect-error
	const invalidLoaderTemplate = create.TemplateRenderer({
		promptType: 'template-name' // ✗ Missing required loader
	});
	// @ts-expect-error
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
	// @ts-expect-error
	await typeCheckedTemplate(true); // ✗ Prompt must be string
	// @ts-expect-error
	await typeCheckedTemplate("Hi", true); // ✗ Context must be object
	// @ts-expect-error
	await typeCheckedTemplate({}, {}); // ✗ First arg must be string with context

	// Test 10: Context structure validation
	const nestedTemplate = create.TemplateRenderer({ prompt: "Hello {user.name}" }, emptyConfig);
	// Valid cases:
	await nestedTemplate({ user: { name: "Bob" } }); // ✓ Valid nested context
	await nestedTemplate("Hi {user.name}", { user: { name: "Bob" } }); // ✓ Override with valid context
	// Invalid cases:
	// @ts-expect-error
	await nestedTemplate({}, {}); // ✗ Invalid context structure

	// Test 11: Multi-level config inheritance
	const rootConfig = create.Config({ model: openai('gpt-4o') });
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
	// @ts-expect-error
	const invalidTemplate = create.TemplateRenderer({ prompt: "Hello", invalid: 1 }); // ✗ Invalid property

	const templateParent = create.Config({ prompt: "Hello" });
	// @ts-expect-error
	const invalidChildTemplate = create.TemplateRenderer({ invalid: 1 }, templateParent);

	const modelParent = create.Config({ prompt: "Hello", model: openai('gpt-4o') });
	// @ts-expect-error
	const incompatibleTemplate = create.TemplateRenderer({ promptType: 'template' }, modelParent);

	// SECTION 2: Text Generation Tests

	// Invalid configuration
	// @ts-expect-error
	const invalidGenerator = create.TextGenerator({ model: openai('gpt-4o'), invalid: 1 });

	const basicGenerator = create.TextGenerator({ model: openai('gpt-4o') });
	await basicGenerator("Hello"); // ✓ Basic text generation
	// Invalid cases:
	// @ts-expect-error
	await basicGenerator({ system: "Be helpful" }); // ✗ Missing prompt
	// @ts-expect-error
	await basicGenerator(); // ✗ Missing prompt

	const modelParentConfig = create.Config({ model: openai('gpt-4o') });
	const templateGenerator = create.TextGenerator({ prompt: "Hello", promptType: 'template' }, modelParentConfig);
	await templateGenerator(); // ✓ Uses inherited model

	const modelParentConfig2 = create.Config({ model: openai('gpt-4o') });
	const noSchemaGenerator = create.ObjectGenerator({ output: 'no-schema' }, modelParentConfig);

	const messageGenerator = create.TextGenerator({
		model: openai('gpt-4o'),
		messages: [{ role: 'user', content: 'Hi' }]
	});
	await messageGenerator(); // ✓ Message-based generation

	const toolGenerator = create.TextGenerator({
		model: openai('gpt-4o'),
		tools: cityTools,
		maxSteps: 3,
	});
	await toolGenerator("Find attractions in London"); // ✓ Generation with tools

	const incompatibleParent = create.Config({ model: openai('gpt-4o'), output: 'object' });
	// @ts-expect-error
	const invalidTextGen = create.TextGenerator({ prompt: "Hello" }, incompatibleParent);

	// SECTION 3: Streaming Tests

	const basicStreamer = create.TextStreamer({ model: openai('gpt-4o') });
	const streamResult = await basicStreamer("Stream");
	for await (const chunk of streamResult.textStream) { } // ✓ Basic text streaming

	// SECTION 4: Object Generation Tests

	const objectGenerator = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'object',
		schema
	});
	await objectGenerator("Generate person"); // ✓ Single object generation

	const arrayGenerator = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'array',
		schema
	});
	await arrayGenerator("Generate people"); // ✓ Array generation

	const enumGenerator = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'enum',
		enum: ['yes', 'no', 'maybe']
	});
	await enumGenerator("Should I?"); // ✓ Enum generation

	const schemalessGenerator = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'no-schema'
	});
	await schemalessGenerator("Free-form JSON"); // ✓ Schemaless generation

	const toolObjectGen = create.ObjectGenerator({
		model: openai('gpt-4o'),
		tools: cityTools,
		// @ts-expect-error
		output: 'object', // ✗ Cannot combine tools with object output
		schema
	});

	// SECTION 5: Object Streaming Tests

	const objectStreamer = create.ObjectStreamer({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		onFinish: (event) => console.log(event)
	});
	for await (const chunk of (await objectStreamer("Stream person")).partialObjectStream) { } // ✓ Object streaming

	// SECTION 6: Error Cases

	// @ts-expect-error
	const modellessGen = create.TextGenerator({}); // ✗ Missing required model

	const schemalessObjGen = create.ObjectGenerator({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'object'
	}); // ✗ Missing required schema

	const enumlessGen = create.ObjectGenerator({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'enum'
	}); // ✗ Missing required enum values

	const extraPropGen = create.ObjectGenerator({
		// @ts-expect-error
		output: 'object',
		schema,
		model: openai('gpt-4o'),
		extraProp: 123 // ✗ Unknown property
	});

	// SECTION 7: Complex Inheritance Tests

	const toolParentConfig = create.Config({
		model: openai('gpt-4o'),
		tools: cityTools
	});

	const toolChildGenerator = create.TextGenerator({
		maxSteps: 5
	}, toolParentConfig);

	await toolChildGenerator("Generate person using tools"); // ✓ Inherited tools

	// SECTION 8: Advanced Configuration Tests

	const dualPurposeGen = create.TextGenerator({
		model: openai('gpt-4o'),
		prompt: "Hello",
		messages: [{ role: 'system', content: 'Be helpful' }]
	}); // ✓ Both prompt and messages

	const messageParentConfig = create.Config({
		messages: [{ role: 'system', content: 'Be helpful' }],
		model: openai('gpt-4o')
	});
	const promptChildGen = create.TextGenerator({ prompt: "Hello" }, messageParentConfig); // ✓ Parent messages, child prompt

	// Template Integration Tests
	const templateTextGen = create.TextGenerator({
		model: openai('gpt-4o'),
		promptType: 'template',
		prompt: "Hello {name}",
	});
	await templateTextGen({ name: "Bob" }); // ✓ Template with text generation

	const namedTemplateGen = create.TextGenerator({
		model: openai('gpt-4o'),
		promptType: 'template-name',
		loader: templateLoader
	});
	await toolGenerator("greetingTemplate", { name: "Bob" }); // ✓ Named template with generation

	const streamingTemplateGen = create.TextStreamer({
		model: openai('gpt-4o'),
		promptType: 'template',
		prompt: "Stream {what}"
	});
	for await (const chunk of (await streamingTemplateGen({ what: "data" })).textStream) { } // ✓ Template with streaming

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
		model: openai('gpt-4o'),
		output: 'object',
		schema: complexUserSchema
	}); // ✓ Complex nested schema generation

	const invalidToolObjectGen = create.ObjectGenerator({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'object',
		schema: complexUserSchema,
		tools: cityTools
	}); // ✗ Cannot combine tools with object output

	// SECTION 10: Output Type Override Tests

	const arrayParentConfig = create.Config({
		model: openai('gpt-4o'),
		output: 'array',
		schema
	});

	const objectChildGen = create.ObjectGenerator({
		output: 'object'
	}, arrayParentConfig); // ✓ Override parent's output type

	// Schema override with output type
	const baseSchemaConfig = create.Config({
		model: openai('gpt-4o'),
		schema
	});

	const schemaOverrideGen = create.ObjectGenerator({
		output: 'object',
		schema
	}, baseSchemaConfig);

	// Schema-only override
	const objectParentConfig = create.Config({
		model: openai('gpt-4o'),
		output: 'object',
		schema
	});

	const schemaChildGen = create.ObjectGenerator({
		schema
	}, objectParentConfig);

	const invalidEnumStreamer = create.ObjectStreamer({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'enum',
		enum: ['yes', 'no']
	}); // ✗ Enum not supported with streaming

	// SECTION 11: Multi-level Inheritance Tests

	const rootConfigWithContext = create.Config({
		model: openai('gpt-4o'),
		context: { root: true }
	});

	// Complex inheritance test with templates and object generation
	const configChild = create.Config({
		filters: { upper: (s: string) => s.toUpperCase() },
		context: { parent: true },
		model: openai('gpt-4o'),
	}, rootConfigWithContext);
	const templateChildGen = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
		promptType: 'template',
		context: { child: true }
	}, configChild);

	const parentConfig2 = create.Config({
		model: openai('gpt-4o'),
	});

	const objectChildConfig2 = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, parentConfig2);

	await templateChildGen({ what: "person" }); // ✓ Uses merged context

	// Helper function for model type checking
	function modelConfigCheck<TConfig extends Partial<{ model: LanguageModel }>>(config: TConfig & { model: LanguageModel }) {
		console.log(config.model);
	}
	modelConfigCheck({ model: openai('gpt-4o') }); // ✓ Valid model configuration

	// SECTION 12: Mixed Configuration Tests

	const hybridStreamer = create.ObjectStreamer({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		loader: templateLoader,
		promptType: 'template-name',
	});

	const templateStreamer = create.ObjectStreamer({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		loader: templateLoader
	});

	// Test incompatible mixing of tools and object output
	const objectParentConfigWithContext = create.Config({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		context: { base: true }
	});

	const invalidToolChild = create.ObjectGenerator(
		{
			// @ts-expect-error
			tools: cityTools,
			prompt: "Generate {what}",
		}, objectParentConfigWithContext); // ✗ Cannot mix tools with object output

	// Test incompatible mixing of object output with tools parent
	const toolParentConfigWithContext = create.Config({
		model: openai('gpt-4o'),
		tools: cityTools
	});

	const invalidObjectChild = create.ObjectGenerator({
		// @ts-expect-error
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, toolParentConfigWithContext); // ✗ Cannot mix object output with tools

	// Test template context compatibility
	const baseModelConfig = create.Config({
		model: openai('gpt-4o'),
	});

	const templateContextGen = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
		context: { child: true }
	}, baseModelConfig);

	// Test parent template context compatibility
	const contextParentConfig = create.Config({
		model: openai('gpt-4o'),
		context: { base: true }
	});

	const objectChildGenWithContext = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, contextParentConfig);

	// Test promptType:'text' compatibility
	const textPromptParentConfig = create.Config({
		model: openai('gpt-4o'),
		promptType: 'text'
	});
	const invalidTemplateChild = create.ObjectGenerator({
		// @ts-expect-error
		output: 'object',
		schema,
		prompt: "Generate person",
		context: { child: true }
	}, textPromptParentConfig); // ✗ Cannot mix promptType:'text' with template config

	// Test promptType:'text' with parent template context
	const templateContextParent = create.Config({
		model: openai('gpt-4o'),
		context: { child: true }
	});
	const invalidTextPromptChild = create.ObjectGenerator({
		// @ts-expect-error
		output: 'object',
		schema,
		prompt: "Generate person",
		promptType: 'text'
	}, templateContextParent); // ✗ Cannot mix promptType:'text' with template config

	// Config-only inheritance tests
	const contextBaseConfig = create.Config({
		model: openai('gpt-4o'),
		context: { base: true }
	});
	const objectChildConfig3 = create.Config({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, contextBaseConfig);

	// Test promptType:'text' inheritance
	const textPromptBaseConfig = create.Config({
		model: openai('gpt-4o'),
		promptType: 'text'
	});

	const invalidTemplateChildConfig = create.Config({
		output: 'object',
		schema,
		prompt: "Generate person",
		context: { child: true }
		// @ts-expect-error
	}, textPromptBaseConfig); // ✗ Cannot mix promptType:'text' with template config

	const streamResult2 = await hybridStreamer("greetingTemplate", { user: "Bob" });
	for await (const chunk of streamResult2.partialObjectStream) { } // ✓ Templates + streaming

})().catch(console.error);