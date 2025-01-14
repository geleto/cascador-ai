
import { Factory } from "./Factory";

export const create = new Factory();

/*import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

(async (): Promise<void> => {

	const parent = create.ConfigData({ model: openai('gpt-4') });
	const gen1 = create.TextGenerator({}, parent);

	// Return type checks
	const result = await gen1('test');
	const text: string = result.text; // should compile
	console.log(text);

	const wrongProp: any = result.wrong; // should NOT compile

	// Deep inheritance with return types
	const schema = z.object({
		name: z.string(),
		age: z.number(),
		hobbies: z.array(z.string()),
	});
	const genObject = create.ObjectGenerator({ schema }, 'object', parent);

	type MyType = z.infer<typeof schema>;
	const arrayResult = await genObject('test');
	const arr: MyType[] = arrayResult.object; // should compile
	const obj: MyType = arrayResult.object; // should NOT compile

	console.log(arr, obj, wrongProp)//shut up unused var warnings

})().catch(console.error);*/