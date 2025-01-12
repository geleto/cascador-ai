import { Factory } from "./Factory";

export const create = new Factory();

/*const templateRenderer = create.TemplateRenderer({ prompt: 'Hello {{name}}' });
const result1 = templateRenderer({ context: { name: 'Alan' } });
const result2 = templateRenderer({ prompt: 'Hi {{name}}', context: { name: 'Bob' } });
const result3 = templateRenderer('Hey {{name}}', { name: 'Charlie' });
const result4 = templateRenderer();//error

const newRenderer = create.TemplateRenderer({ promptName: 'greeting', parent: templateRenderer });
const newRenderer2 = create.TemplateRenderer({ promptName: 'greeting', parent: new Config({ temperature: 0.5 }) });*/

/*const gen = create.TextGenerator({ model: openai('gpt-4o') });
gen({ prompt: 'Hello, world! {{text}}', context: { text: 'Hi' } }).then((result) => console.log(result.text));
gen('Hello {{name}}!', { name: 'Alex' }).then((result) => console.log(result.text));*/