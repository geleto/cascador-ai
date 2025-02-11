import { openai } from '@ai-sdk/openai';
import { ILoader, LoaderSource } from "cascada-tmpl";
import { z } from 'zod';
import { create } from '../../src';
import { LanguageModel } from 'ai';


/* eslint-disable @typescript-eslint/no-unused-vars */
(async (): Promise<void> => {

	const schema = z.object({
		name: z.string(),
		age: z.number(),
		hobbies: z.array(z.string()),
	});

	const tools = {
		cityAttractions: {
			parameters: z.object({ city: z.string() }),
			execute: async (city: string) => {
				console.log(city);
				await new Promise(resolve => setTimeout(resolve, 100));
				return { attractions: ['attraction1', 'attraction2', 'attraction3'] };
			},
		},
	};

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
	const someLoader = new StringLoader();
	someLoader.addTemplate('template1', 'Hello {name}');

	// Test Configuration Variations

	// 1. Basic prompt configurations
	const confWithPrompt = create.Config({ prompt: "Hello {name}" });
	const t1 = create.TemplateRenderer({}, confWithPrompt);
	// Should compile:
	await t1(); // ✓ Has prompt in config
	await t1({ name: "Bob" }); // ✓ Has prompt, context only
	await t1("Hi {name}"); // ✓ Override prompt
	await t1("Hi {name}", { x: 1 }); // ✓ Override + context
	// Should NOT compile:
	// @ts-expect-error
	await t1("Hi", {}, "extra"); // ✗ Too many args
	// @ts-expect-error
	await t1(123); // ✗ Wrong type - must be string

	// 2. Empty configurations
	const confEmpty = create.Config({});
	const t2 = create.TemplateRenderer({}, confEmpty);
	// Should NOT compile:
	// @ts-expect-error
	await t2(); // ✗ No prompt
	// @ts-expect-error
	await t2({ name: "Bob" }); // ✗ No prompt, context only not allowed
	// Should compile:
	await t2("Hi {name}"); // ✓ Provides required prompt
	await t2("Hi {name}", { x: 1 }); // ✓ Provides prompt and context

	// 3. Loader configurations
	const confWithLoader = create.Config({
		promptType: 'template-name',
		loader: someLoader
	});
	const t3 = create.TemplateRenderer({}, confWithLoader);
	// Should NOT compile:
	// @ts-expect-error
	await t3(); // ✗ No prompt
	// Should compile:
	await t3("template-name"); // ✓ Provides required prompt

	// 4. Prompt + Loader configurations
	const confWithPromptAndLoader = create.Config({
		prompt: "Hello {name}",
		promptType: 'template-name',
		loader: someLoader
	});

	const t4 = create.TemplateRenderer({}, confWithPromptAndLoader);
	// Should all compile:
	await t4(); // ✓ Has prompt in config
	await t4({ name: "Bob" }); // ✓ Has prompt, context only
	await t4("template-name"); // ✓ Override prompt
	await t4("template-name", { x: 1 }); // ✓ Override + context

	// 5. Child overriding parent
	const parentBasic = create.Config({ prompt: "Parent {name}" });
	const t5 = create.TemplateRenderer({ prompt: "Child {name}" }, parentBasic);
	// Should all compile:
	await t5(); // ✓ Has prompt in config
	await t5({ name: "Bob" }); // ✓ Has prompt, context only
	await t5("Override {name}"); // ✓ Override prompt

	// 6. Loader inheritance
	const parentWithLoader = create.Config({
		promptType: 'template-name',
		loader: someLoader
	});
	const t6 = create.TemplateRenderer({ prompt: "Child {name}" }, parentWithLoader);
	// Should all compile:
	await t6(); // ✓ Has prompt in child config
	await t6({ name: "Bob" }); // ✓ Has prompt, context only

	// 7. Invalid loader configurations
	// Should NOT compile at creation:
	// @ts-expect-error
	const t7 = create.TemplateRenderer({
		promptType: 'template-name' // ✗ No loader
	});
	// @ts-expect-error
	await t7(); // ✗ No loader

	// 8. Mixed configurations

	const test = create.Config({ prompt: "Parent {name}", promptType: 'template-name' });

	const parentWithPrompt = create.Config({ prompt: "Parent {name}" });
	const t8 = create.TemplateRenderer({
		promptType: 'template-name',
		loader: someLoader
	}, parentWithPrompt);
	// Should all compile:
	await t8(); // ✓ Has prompt from parent
	await t8("template-name"); // ✓ Override prompt
	await t8("template-name", { x: 1 }); // ✓ Override + context

	// 9. Type checking
	const t9 = create.TemplateRenderer({}, confWithPrompt);
	const conf = t9.config; // ✓ Should preserve exact type
	// Should NOT compile:
	// @ts-expect-error
	await t9(true); // ✗ Wrong type for prompt - must be string
	// @ts-expect-error
	await t9("Hi", true); // ✗ Wrong type for context - must be object
	// @ts-expect-error
	await t9({}, {}); // ✗ First arg must be string when providing context

	// 10. Context variations
	const t10 = create.TemplateRenderer({ prompt: "Hello {user.name}" }, confEmpty);
	// Should compile:
	await t10({ user: { name: "Bob" } }); // ✓ Valid context structure
	await t10("Hi {user.name}", { user: { name: "Bob" } }); // ✓ Override + valid context
	// Should NOT compile:
	// @ts-expect-error
	await t10({}, {}); // ✗ Invalid context structure

	// 11. Nested config inheritance
	const grandparent = create.Config({ model: openai('gpt-4o') });
	const parent = create.Config({ prompt: 'my prompt text' }, grandparent);

	const grandparent2 = create.Config({ loader: someLoader, promptType: 'template-name' });
	const parent2 = create.Config({ prompt: 'my prompt text' }, grandparent2);
	const child = create.TemplateRenderer({}, parent2);

	// 12. Override PromptType in Child:
	const parentTemplate = create.Config({
		promptType: 'template-name',
		loader: someLoader
	});
	const childDirect = create.TemplateRenderer({
		promptType: 'template' // changes to direct template
	}, parentTemplate);

	// 13. Empty Context Validation:
	const tContext = create.TemplateRenderer({ prompt: "Hello" });
	await tContext({}); // ✓ should compile - empty context is valid
	await tContext(); // ✓ should compile - undefined context is valid

	/* Test Factory Methods */

	// Text Generators
	const tg1 = create.TextGenerator({ model: openai('gpt-4o') });
	await tg1("Hello"); // ✓ Basic text generation
	// @ts-expect-error
	await tg1({ system: "Be helpful" }); // ✗ no prompt

	const parentWithModel = create.Config({ model: openai('gpt-4o') });
	const tg2 = create.TextGenerator({ prompt: "Hello" }, parentWithModel);
	await tg2(); // ✓ Inherited model

	const tg3 = create.TextGenerator({
		model: openai('gpt-4o'),
		messages: [{ role: 'user', content: 'Hi' }]
	});
	await tg3(); // ✓ Message-based

	const tg4 = create.TextGenerator({
		model: openai('gpt-4o'),
		tools,
		maxSteps: 3
	});
	await tg4("Find attractions in London"); // ✓ With tools

	// Text Streamers
	const ts1 = create.TextStreamer({ model: openai('gpt-4o') });
	const res1 = await ts1("Stream");
	for await (const chunk of res1.textStream) { } // ✓ Basic streaming

	//type t =

	// Object Generators
	const og1 = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'object',
		schema
	});
	await og1("Generate person"); // ✓ Object output

	const og2 = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'array',
		schema
	});
	await og2("Generate people"); // ✓ Array output

	const og3 = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'enum',
		enum: ['yes', 'no', 'maybe']
	});
	await og3("Should I?"); // ✓ Enum output

	const og4 = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'no-schema'
	});
	await og4("Free-form JSON"); // ✓ No schema

	const toolObj = create.ObjectGenerator({
		model: openai('gpt-4o'),
		tools,
		// @ts-expect-error
		output: 'object',//object can't be used with tools
		schema
	});

	// Object Streamers
	const os1 = create.ObjectStreamer({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		onFinish: (event) => console.log(event)
	});
	for await (const chunk of (await os1("Stream person")).partialObjectStream) { } // ✓ Object streaming

	// Error cases
	// @ts-expect-error
	const errModel = create.TextGenerator({}); // ✗ Missing model


	const errSchema = create.ObjectGenerator({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'object'
	}); // ✗ Missing schema

	const errEnum = create.ObjectGenerator({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'enum'
	}); // ✗ Missing enum

	const unknownProperty = create.ObjectGenerator({
		// @ts-expect-error
		output: 'object',
		schema,
		model: openai('gpt-4o'),
		zzz: 123
	});

	// Complex inheritance
	const toolParent = create.Config({
		model: openai('gpt-4o'),
		tools
	});

	const schemaChild2 = create.TextGenerator({
		maxSteps: 5
	}, toolParent);

	await schemaChild2("Generate person using tools"); // ✓ Inherited tools

	// Complex test cases for Factory methods

	// LLM Core Tests
	const tg5 = create.TextGenerator({
		model: openai('gpt-4o'),
		prompt: "Hello",
		messages: [{ role: 'system', content: 'Be helpful' }]
	}); // ✓ Both prompt and messages

	const tgParent = create.Config({
		messages: [{ role: 'system', content: 'Be helpful' }],
		model: openai('gpt-4o')
	});
	const tg6 = create.TextGenerator({ prompt: "Hello" }, tgParent); // ✓ Parent messages, child prompt

	// Template Integration
	const tg7 = create.TextGenerator({
		model: openai('gpt-4o'),
		promptType: 'template',
		prompt: "Hello {name}",
	});
	await tg7({ name: "Bob" }); // ✓ Template with generator

	const tg8 = create.TextGenerator({
		model: openai('gpt-4o'),
		promptType: 'template-name',
		loader: someLoader
	});
	await tg4("template1", { name: "Bob" }); // ✓ Template name with generator

	const ts2 = create.TextStreamer({
		model: openai('gpt-4o'),
		promptType: 'template',
		prompt: "Stream {what}"
	});
	for await (const chunk of (await ts2({ what: "data" })).textStream) { } // ✓ Template with streaming

	// Object Generation
	const complexSchema = z.object({
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

	const og5 = create.ObjectGenerator({
		model: openai('gpt-4o'),
		output: 'object',
		schema: complexSchema
	}); // ✓ Complex nested schema

	const og6 = create.ObjectGenerator({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'object',
		schema: complexSchema,
		tools
	}); // ✗ Can't mix tools with object output

	// Override output type
	const arrayParent = create.Config({
		model: openai('gpt-4o'),
		output: 'array',
		schema
	});

	const enumChild = create.ObjectGenerator({
		output: 'object'
	}, arrayParent); // ✓ Override output type

	// Override schema while defining output type
	const papa2 = create.Config({
		model: openai('gpt-4o'),
		schema
	});

	const baby2 = create.ObjectGenerator({
		output: 'object',
		schema
	}, papa2);

	// Override schema only
	const papa4 = create.Config({
		model: openai('gpt-4o'),
		output: 'object',
		schema
	});

	const baby4 = create.ObjectGenerator({
		schema
	}, papa4);

	const streamEnum = create.ObjectStreamer({
		model: openai('gpt-4o'),
		// @ts-expect-error
		output: 'enum',
		enum: ['yes', 'no']
	}); // ✗ Enum with stream

	// Complex Inheritance
	const grandp = create.Config({
		model: openai('gpt-4o'),
		//output: 'no-schema',
		//tools,
		context: { base: true }
	});

	/*const par = create.Config({
		//filters: { upper: (s: string) => s.toUpperCase() },
		//context: { parent: true },
		model: openai('gpt-4o'),
	}, grandp);*/

	/*const child2a = create.ObjectGenerator({
		promptType: 'template',
		prompt: "Generate {what}",
		context: { child: true }
	}, par); // ✓ Three level inheritance*/

	const child2 = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",

		//promptType: 'template',
		//prompt: "Generate {what}",
		//context: { child: true }
	}, grandp); // ✓ Three level inheritance (todo - par)



	const p = create.Config({
		model: openai('gpt-4o'),
	});

	const c = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, p);

	type t = typeof child2.config.prompt;
	type hasPrompt = typeof child2.config extends { prompt: string } ? true : false;

	await child2({ what: "person" }); // Uses merged context, tools, filters

	function myFunc<TConfig extends Partial<{ model: LanguageModel }>>(config: TConfig & { model: LanguageModel }) {
		console.log(config.model);
	}
	myFunc({ model: openai('gpt-4o') }); // ✓ Should compile

	// Mixed Template and Object Generation properties
	const mixed = create.ObjectStreamer({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		loader: someLoader,
		promptType: 'template-name',
	});

	const mixed2 = create.ObjectStreamer({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		//promptType: 'template-name',
		loader: someLoader
		/*promptType: 'template-name',
		loader: someLoader,
		//tools,
		context: { data: 123 }*/
	});

	//Mix tools in config with object in parent
	const par1 = create.Config({
		model: openai('gpt-4o'),
		output: 'object',
		schema,
		context: { base: true }
	});

	const ch1 = create.ObjectGenerator(// @ts-expect-error
		{
			tools,
			prompt: "Generate {what}",
		}, par1); // ✗ Can't mix tools with object output

	//Mix object in config with tools in parent
	const par3 = create.Config({
		model: openai('gpt-4o'),
		tools
	});

	// @ts-expect-error
	const ch3 = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, par3); // ✗ Can't mix tools with object output


	// Mix 'object' with TemplateConfig in config(e.g. context)
	const pa = create.Config({
		model: openai('gpt-4o'),
	});

	const ch = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
		context: { child: true }
	}, pa);

	// Mix 'object' with TemplateConfig in parent(e.g. context)
	const pa2 = create.Config({
		model: openai('gpt-4o'),
		context: { base: true }
	});

	const ch2 = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, pa2);

	// Mix promptType: 'text' in parent with TemplateConfig in config
	const pa4 = create.Config({
		model: openai('gpt-4o'),
		promptType: 'text'
	});
	// @ts-expect-error
	const ch4 = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Just Generate",
		context: { child: true }
	}, pa4); // ✗ Can't mix promptType: 'text' with TemplateConfig

	// Mix promptType: 'text' in config with TemplateConfig(context) in parent
	const pa5 = create.Config({
		model: openai('gpt-4o'),
		context: { child: true }
	});
	// @ts-expect-error
	const ch5 = create.ObjectGenerator({
		output: 'object',
		schema,
		prompt: "Just Generate",
		promptType: 'text'
	}, pa5);// ✗ Can't mix promptType: 'text' with TemplateConfig


	// Config only - Mix 'object' with TemplateConfig in parent(e.g. context)
	const pa6 = create.Config({
		model: openai('gpt-4o'),
		context: { base: true }
	});
	// @ts-expect-error
	const ch6 = create.Config({
		output: 'object',
		schema,
		prompt: "Generate {what}",
	}, pa2);

	// Config only - Mix promptType: 'text' in parent with TemplateConfig in config
	const pa7 = create.Config({
		model: openai('gpt-4o'),
		promptType: 'text'
	});
	// @ts-expect-error
	const ch7 = create.Config({
		output: 'object',
		schema,
		prompt: "Just Generate",
		context: { child: true }
	}, pa4); // ✗ Can't mix promptType: 'text' with TemplateConfig

	const result = await mixed("template1", { user: "Bob" });
	for await (const chunk of result.partialObjectStream) { } // ✓ Templates + tools + streaming

})().catch(console.error);
