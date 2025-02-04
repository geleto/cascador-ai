import { openai } from '@ai-sdk/openai';
import { ILoader, LoaderSource } from "cascada-tmpl";
import { z } from 'zod';
import { create } from '../../src';

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
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
	const grandparent = create.Config({ loader: someLoader });
	const parent = create.Config({ promptType: 'template-name' }, grandparent);
	const child = create.TemplateRenderer({}, parent);

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

})().catch(console.error);
