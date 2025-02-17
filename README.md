# Cascador-AI – A Framework for AI Agent Orchestration

## Build AI workflows with templates - write sequential code, get parallel execution.

Cascador-AI lets you orchestrate multiple concurrent AI agents, API calls, external services and data operations using simple template syntax - no explicit async handling required. Write templates that look synchronous but execute concurrently under the hood, making it easy to create sophisticated AI pipelines without wrestling with promises or parallel execution.

[Cascador-AI](https://github.com/geleto/cascador-ai) combines the [Vercel AI SDK](https://sdk.vercel.ai/) with the [Cascada Template Engine](https://github.com/geleto/cascada) (a fork of [Nunjucks](https://mozilla.github.io/nunjucks/)). Its core strength is support for templates that look synchronous but execute concurrently under the hood, while .

**Note:** Cascador-ai is currently under active development and is not yet ready for production use. The most significant dependency is having the Cascada template engine reach production-ready status (for more details, refer to the [Cascada Development Status and Roadmap](https://github.com/geleto/cascada?tab=readme-ov-file#development-status-and-roadmap) ).
 
## Features

- **Template-Based Orchestration**
   Build AI workflows using templates that generate prompts, chain results, and control flow. [Cascada](https://github.com/geleto/cascada) templates combine programming constructs (variables, loops, conditionals), first-class functions and macros with composition features (inheritance, imports) to express complex orchestration patterns clearly.

- **Rich Context System**
   Context objects seamlessly integrate data and functionality into templates, from static values to async operations like API calls, external services and database queries.

- **Automatic Parallelization**
   The [Cascada Template Engine](https://github.com/geleto/cascada) automatically runs independent tasks (LLM calls, API requests and data processing) in parallel while managing dependencies - no explicit async and concurrency constructs required.
   
- **Standardized LLM Integrations**
   Built on the [Vercel AI SDK Core](https://sdk.vercel.ai/), which provides standardized integration with various Large Language Model providers such as:
   OpenAI, Azure, Anthropic, Amazon Bedrock, Google Generative AI, Google Vertex AI, Mistral, x.AI Grok...

- **Flexible Outputs**
   Generate or stream responses as text and structured data (objects/arrays) with validation through [Zod](https://github.com/colinhacks/zod) or JSON Schema.

- **Type Safety Support**
   Strong TypeScript integration that helps catch configuration errors early and ensures correct usage of renderers and templates.

## Installation

```bash
npm install cascador-ai
```

## Quick Start

This example demonstrates how to:
1. Define a base configuration that is shared across all generators.
2. Read a synopsis in the template from a file.
3. Expand the synopsis into a story.
4. Critique it.
4. Translate both the story and the critique into a specified language.

Generating the critique and translating the story will run in parallel, as these are two independent operations, but both must wait for the story generation to complete first.

```js
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import fs from 'fs/promises';

// Base shared configuration
const baseConfig = create.Config({
	temperature: 0.7,
});

// Story generator using Claude 3
const storylineGen = create.TextGenerator({
	model: anthropic('claude-3-5-sonnet-20240620'),
	prompt: 'Expand the following synopsis into a short story: {{ synopsis }}'
}, baseConfig);

// Critique generator using GPT-4
const critiqueGen = create.TextGenerator({
	model: openai('gpt-4o'),
	prompt: 'Provide a critical analysis of the following story: {{ story }}'
}, baseConfig);

// Translation using GPT-4
const translateGen = create.TextGenerator({
	model: openai('gpt-4o'),
	prompt: 'Translate the following text to {{ language }}: {{ text }}'
}, baseConfig);

// Main template renderer for orchestrating the whole process
const mainGenerator = create.TemplateRenderer({
	filters: {
		translate: async (text: string, lang: string) => (await translateGen({ text, language: lang })).text
	},
	context: {
		anguage: 'Spanish',
		readFile: async (filePath: string) => await fs.readFile(filePath, 'utf-8'),
		storylineGen,
		critiqueGen,
		language: 'Spanish',
	},
	prompt: `
    {% set synopsis = readFile('./src/synopsis.txt') %}
    {% set storyContent = (storylineGen({ synopsis: synopsis })).text %}
	Story: {{ storyContent }}
    {% set critiqueContent = (critiqueGen({ story: storyContent })).text %}
    Critique : {{ critiqueContent }}
	Story: in {{ storyContent | translate(language) }}`
});

(async () => {
	const result = await mainGenerator();
	console.log(result);
})();
```

# Understanding the Cascador-AI API

## Renderers: The Core Concept

In Cascador-AI, a renderer is any object that can process input and produce output, whether that's template rendering, LLM text generation, or structured data streaming. All Cascador objects are renderers that share these fundamental characteristics:

- **Factory Creation**: They are created using factory functions from the `create` namespace. Each factory function accepts a configuration object and an optional parent configuration:
  ```typescript
  import { create } from 'cascador-ai';
  import { openai } from '@ai-sdk/openai';
  
  // Create with direct configuration
  const simpleRenderer = create.TextGenerator({
    model: openai('gpt-4o'),
    prompt: 'Hello {{ name }}'
  });
  
  // Create with configuration and parent
  const baseConfig = create.Config({
    model: openai('gpt-4o'),
    temperature: 0.7
  });
  
  const inheritingRenderer = create.TextGenerator({
    prompt: 'Greet {{ name }}'
  }, baseConfig);
  ```

- **Template Properties**: Every renderer supports template processing through several key properties:
  - `promptType` - Controls the template processing mode
  - `context` - Provides data and methods for templates
  - `filters` - Adds template transformation functions
  - `loader` - Enables external template loading
  [See Template Properties](#template-properties)

- **Callable Interface**: Every renderer is a callable object that can be invoked in two ways:
  ```typescript
  // Using configured prompt and context
  const result = await renderer();
  
  // With a one-off prompt and context
  const result = await renderer('Hello {{ name }}', { name: 'World' });
  ```
  One-off prompts are compiled each time they're used, while prompts defined during renderer creation are precompiled for better performance. [See Callable Objects](#callable-objects)

- **Template Usage**: They can be used inside templates by adding them to the context object:
  ```typescript
  const mainRenderer = create.TemplateRenderer({
    context: {
      translateRenderer,  // Add renderer to context
      summarizeRenderer
    },
    prompt: '{{ (translateRenderer({ text })).text }}'
  }, baseConfig);
  ```
  [See Using Renderers in Templates](#using-renderers-in-templates)

## Configuration Management

Cascador-AI allows you to define shared configuration through `Config` objects that can be inherited by other renderers:

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

// Create a base configuration
const baseConfig = create.Config({
  model: openai('gpt-4o'),
  temperature: 0.7,
  context: {
    language: 'en'
  }
});

// Create a renderer that inherits from base config
const renderer = create.TextGenerator({
  prompt: 'Translate to {{ language }}: {{ text }}'
}, baseConfig);

// The renderer inherits model, temperature, and context from baseConfig
```

## Renderer Types

### TemplateRenderer
Pure template processing without LLM involvement. Unlike other renderers, it doesn't wrap any Vercel function and operates solely on templates:

```typescript
import { create } from 'cascador-ai';

const asyncTemplatedRenderer = create.TemplateRenderer({
  prompt: 'Hi {{ name }}! Today is {{ currentDay }}.',
  context: {
    name: async () => (await sql.query('SELECT name FROM users LIMIT 1')).rows[0].name,
    currentDay: new Date().toLocaleDateString(),
  }
}, baseConfig);

(async () => {
  const result = await asyncTemplatedRenderer();
  console.log('Async templated output:', result);
})();
```

### TextGenerator
Wraps Vercel's `generateText` function. Used for generating text completions from LLMs. See [Vercel generateText documentation](<link-to-vercel-docs>) for detailed return type information:

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const generator = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Describe "{{ topic }}" in 3 sentences.',
  context: {
    // The title of today's featured Wikipedia article:
    topic: async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
      const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${today}`;
      return (await (await fetch(url)).json()).tfa.normalizedtitle;
    }
  }
}, baseConfig);

(async () => {
  const { text } = await generator();
  console.log('Description:', text);
})();
```

### TextStreamer
Wraps Vercel's `streamText` function. Provides real-time streaming of LLM responses, making it ideal for chat interfaces, live updates, or progressive text rendering. See [Vercel streamText documentation](<link-to-vercel-docs>) for streaming interface details:

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const streamer = create.TextStreamer({
  model: openai('gpt-4o'),
  prompt: 'Write a poem about the sea.'
}, baseConfig);

(async () => {
  const { textStream } = await streamer();
  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }
})();
```

### ObjectGenerator
Wraps Vercel's `generateObject` function. Generates structured data with schema validation. See [Vercel generateObject documentation](<link-to-vercel-docs>) for output modes and validation:

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Example 1: Structured Data with Schema
const profileGenerator = create.ObjectGenerator({
  model: openai('gpt-4o'),
  schema: z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.array(z.string()),
  }),
  prompt: 'Generate a random person profile in JSON format.'
}, baseConfig);

(async () => {
  const { object: person } = await profileGenerator();
  console.log('Generated Person:', person);
})();

// Example 2: Classification with Enum
const genreClassifier = create.ObjectGenerator({
  model: openai('gpt-4o'),
  output: 'enum',
  enum: ['action', 'comedy', 'drama', 'horror', 'sci-fi'],
  prompt: 'Classify the genre of this movie plot: {{ plot }}'
}, baseConfig);

(async () => {
  const { object: genre } = await genreClassifier({
    plot: 'A group of astronauts travel through a wormhole...'
  });
  console.log('Genre:', genre);
})();
```

You can specify how the data should be structured by setting output to:
- `object` (default) - Returns a single object matching the schema
- `array` - Returns an array of objects matching the schema
- `enum` - For classification tasks with a discrete set of possible values
- `no-schema` - No schema validation, returns raw JSON

### ObjectStreamer
Wraps Vercel's `streamObject` function. Streams structured data with incremental updates. See [Vercel streamObject documentation](<link-to-vercel-docs>) for streaming modes:

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Example 1: Streaming Array Elements
const characterStreamer = create.ObjectStreamer({
  model: openai('gpt-4o'),
  schema: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
  output: 'array',
  prompt: 'Generate 3 character descriptions.'
}, baseConfig);

(async () => {
  const { elementStream } = await characterStreamer();
  for await (const character of elementStream) {
    console.log('New character:', character);
  }
})();

// Example 2: Streaming Partial Object Updates
const detailedStreamer = create.ObjectStreamer({
  model: openai('gpt-4o'),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    abilities: z.array(z.string())
  }),
  prompt: 'Generate a character description.'
}, baseConfig);

(async () => {
  const { partialObjectStream } = await detailedStreamer();
  for await (const partial of partialObjectStream) {
    console.log('Update:', partial);
  }
})();
```

You can specify how the data should be structured by setting output to:
- `object` (default) - Streams partial updates to a single object
- `array` - Streams complete elements from an array
- `no-schema` - No schema validation, streams raw JSON

## Callable Render Objects

Every renderer can be used as parent configuration and is also a callable object that can be invoked in two ways:

1. Using only the configuration provided during creation:
```typescript
const renderer = create.TextGenerator({
  prompt: 'Hello {{ name }}',
  context: { name: 'World' }
}, baseConfig);

const result = await renderer(); // Uses configured prompt and context
```

2. With a new prompt and optional context:
```typescript
const result = await renderer('Hi {{ user }}', { user: 'Alice' });
```

## Template Properties

All renderers (except when using `promptType: 'text'`) support several properties that control template processing:

### prompt
Defines the template or text that will be used for LLM interaction. Can be specified in three places:
- Base config: `create.Config({ prompt: 'Base prompt {{ var }}' })`
- Renderer creation (recommended): `create.TextGenerator({ prompt: 'Main prompt {{ var }}' })`
- Function call: `renderer('Dynamic prompt {{ var }}', context)`

Prompts defined in config or renderer creation are precompiled for better performance.
One-off prompts provided during function calls are compiled each time they're used.
When used with `messages`, the rendered prompt is appended to the messages array. (todo)

### promptType
Controls how the template is processed:
- `'async-template'` (default) - Enables asynchronous template processing with parallel resolution of promises
- `'template'` - Standard Nunjucks template processing without async features
- `'template-name'` - Loads and processes a named template synchronously (requires loader)
- `'async-template-name'` - Loads and processes a named template asynchronously (requires loader)
- `'text'` - Disables template processing, uses prompt as plain text

### context
Provides data and methods that can be accessed within templates. Both the data and method returns can be asynchronous (promises are automatically handled):

```typescript
const renderer = create.TextGenerator({
  prompt: 'Weather for {{ city }}: {{ getWeather(city) }}',
  context: {
    city: 'London',
    getWeather: async (city) => {
      const response = await fetch(`https://api.weather.com/${city}`);
      return response.json();
    },
    currentTime: new Date().toISOString()
  }
}, baseConfig);
```

### filters
Custom functions that transform data within templates using the `|` operator. Filters can be synchronous or asynchronous:

```typescript
import { create } from 'cascador-ai';
import translate from 'translate';

const translateRenderer = create.TemplateRenderer({
  filters: {
    translate: async (text, language) => await translate(text, language)
  },
  prompt: `
    Original: {{ text }}
    Spanish: {{ text | translate('es') }}
    French: {{ text | translate('fr') }}
  `
}, baseConfig);

const result = await translateRenderer({ text: 'Hello world' });
```

### loader
Enables loading templates from external files. Uses a Nunjucks-compatible loader system:

```typescript
import { create } from 'cascador-ai';
import { FileSystemLoader } from 'cascador-ai';

const fileLoader = new FileSystemLoader('./templates');

const renderer = create.TemplateRenderer({
  loader: fileLoader,
  prompt: `
    {% include 'header.njk' %}
    {% include 'content.njk' %}
    {% include 'footer.njk' %}
  `
}, baseConfig);
```

For named templates, specify the template name in the prompt property:

```typescript
const namedRenderer = create.TemplateRenderer({
  promptType: 'template-name',
  loader: fileLoader,
  prompt: 'main-template.njk'  // Will load and use this template
}, baseConfig);
```

### options
Additional template engine configuration options inherited from Nunjucks. See [Nunjucks Configuration](https://mozilla.github.io/nunjucks/api.html#configure) for available options:

```typescript
const renderer = create.TemplateRenderer({
  options: {
    autoescape: false,
    trimBlocks: true,
    lstripBlocks: true
  },
  prompt: '...'
}, baseConfig);
```

Template properties can be defined in either the base config or the renderer creation options. Properties defined during renderer creation take precedence over those in the base config.

## Vercel AI Properties

All renderers support the core properties from the Vercel AI SDK, here are the most common ones:

### model
The language model to use. Must be provided through a provider-specific helper:
```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

const renderer = create.TextGenerator({
  model: openai('gpt-4'),  // or anthropic('claude-3'), etc.
  // ...
});
```

### temperature
Controls randomness in the model's output, from 0 (deterministic) to 1 (creative). Default is 0.7.
```typescript
const renderer = create.TextGenerator({
  temperature: 0.3,  // More focused, consistent outputs
  // ...
});
```

### maxTokens
Maximum number of tokens to generate. Helps control response length.
```typescript
const renderer = create.TextGenerator({
  maxTokens: 500,
  // ...
});
```

### messages
Array of messages for chat-style interactions. Each message has a role and content:
```typescript
const renderer = create.TextGenerator({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' }
  ],
  // ...
});
```

### topP
Alternative to temperature for nucleus sampling. Value between 0 and 1. Default is 1.

### presencePenalty
Penalizes new tokens based on their presence in the text so far. Value between -2.0 and 2.0. Default is 0.

### frequencyPenalty  
Penalizes new tokens based on their frequency in the text so far. Value between -2.0 and 2.0. Default is 0.

### stop
Array of sequences where the model should stop generating further tokens.
```typescript
const renderer = create.TextGenerator({
  stop: ["\n", "END"],
  // ...
});
```

## Using Renderers in Templates

Renderers can be used within templates by adding them to the context object:

```typescript
const translateRenderer = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Translate to Spanish: {{ text }}'
}, baseConfig);

const mainRenderer = create.TemplateRenderer({
  context: {
    translateRenderer
  },
  prompt: `
    {% set original = "Hello world" %}
    {% set translation = (translateRenderer({ text: original })).text %}
    
    Original: {{ original }}
    Spanish: {{ translation }}
  `
}, baseConfig);
```

Key points about using renderers in templates:
- Results include Vercel SDK properties (`.text`, `.textStream`, `.object`)
- Renderers execute automatically when their inputs are available
- Multiple renderers in the same template run in parallel when possible
- Any renderer type can be used (generators, streamers, template renderers)

## Type Checking

Cascador-AI's type system enforces strict configuration rules to prevent runtime errors:

```typescript
// Type error: Cannot mix text and template properties
const invalidRenderer = create.TextGenerator({
  promptType: 'text',
  filters: {}, // Error: text mode cannot have template properties
}, baseConfig);

// Type error: Missing required model
const noModelRenderer = create.TextGenerator({
  prompt: 'Hello'
}, baseConfig); // Error unless baseConfig provides model

// Type error: Missing loader for named template
const namedTemplate = create.TextGenerator({
  promptType: 'template-name',
  prompt: 'my-template'
}, baseConfig); // Error: loader is required for template-name

// Type error: Missing prompt
const noPromptRenderer = create.TextGenerator({
  model: openai('gpt-4o')
}, baseConfig);
await noPromptRenderer(); // Error: prompt required in either config, creation, or call
```

Required properties are enforced:
- `model` must be provided in either config or creation options
- `loader` is required when using template-name or async-template-name
- `prompt` must be provided in either config, creation options, or function call
- Template properties (filters, loader, options) cannot be used with `promptType: 'text'`

## Roadmap

- **Embeddings Support**
- **Image Generation**
  Integrate image generators (e.g., DALL-E) to produce images from prompts.
- **`onStepFinish` Callback**
  Provide hooks to capture intermediate steps or partial outputs.
- **Error Handling & Recovery**
  Implement robust retry mechanisms and upcoming Cascada try/except blocks for improved error handling.