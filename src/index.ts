
import { Factory } from "./Factory";

export const create = new Factory();

/*
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

(async (): Promise<void> => {

	const schema = z.object({
		name: z.string(),
		age: z.number(),
		hobbies: z.array(z.string()),
	});
	console.log(schema);

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
	console.log(tools);

	const conf1 = create.Config({ model: openai('gpt-4') });
	const gen1 = create.TextGenerator({}, conf1);

	const conf2 = create.Config({});
	const gen2 = create.TextGenerator({ model: openai('gpt-4') }, conf2);

	const conf3 = create.Config({});
	const gen3 = create.TextGenerator({}, conf3);

	const gen4 = create.TextGenerator({});

	const gen5 = create.Config({ prompt: 'hi' }, gen1);

	console.log(conf1, conf2, conf3, gen1, gen2, gen3, gen4, gen5);

	const textConf = create.Config({ model: openai('gpt-4'), tools });

	console.log(textConf);

	const parent = create.Config({ model: openai('gpt-4') });
	const gen1 = create.TextGenerator({}, parent);

	// Return type checks

	let result = await gen1('test');
	const result2 = await gen1({ prompt: 'test' });
	const result3 = await gen1({ prompt: 'test', model: openai('gpt-4') });

	conf = create.Config({});
	gen = create.TextGenerator({}, conf);
	result = await gen('test');

	const text: string = result.text; // should compile
	console.log(text);
	console.log(result2.text);

	const wrongProp: any = result.wrong; // should NOT compile

	// Deep inheritance with return types

	const genObject = create.ObjectGenerator({ schema }, 'object', parent);

	type MyType = z.infer<typeof schema>;
	const arrayResult = await genObject('test');
	const arr: MyType[] = arrayResult.object; // should compile
	const obj: MyType = arrayResult.object; // should NOT compile

	console.log(arr, obj, wrongProp)//shut up unused var warnings

})().catch(console.error);*/