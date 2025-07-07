# Cascador-AI: Efficient AI Orchestration Made Intuitive

## What is Cascador-AI?

Building sophisticated AI systems—from multi-step agents and RAG pipelines to complex tool-use chains—requires orchestrating numerous asynchronous tasks. **Cascador-AI is an AI orchestration library that makes this process radically simpler.** Built on the [Vercel AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core) and the powerful [Cascada Template and Scripting Engine](https://github.com/geleto/cascada), it allows you to define these workflows with clean, declarative code.

Its core advantage is a **parallel-by-default** execution model. You define the logical steps of your workflow, and the engine automatically runs independent operations—like fetching RAG context, calling an LLM, and using a tool—concurrently. It intelligently manages the dependency graph, so you can focus on your AI logic instead of writing boilerplate for `Promise.all` and managing async state.

Cascador-AI provides two distinct and powerful approaches to building your application:

*   **Dynamic Prompting for LLM Calls**: All LLM renderers (`TextGenerator`, `ObjectGenerator`, etc.) are supercharged with a templating engine. This allows you to dynamically construct the perfect prompt by pulling in data from multiple async sources (APIs, databases, vector stores) right before the LLM call. This is ideal for everything from simple text generation to creating strongly-typed JSON objects. For cases where you only need to render a prompt or string without a subsequent LLM call, you can use the standalone `TemplateRenderer`.

*   **Agentic Orchestration with `ScriptRunner`**: When your workflow requires complex logic, state, and decision-making, `ScriptRunner` becomes your "agent brain." It allows you to write stateful, multi-step workflows with loops and conditionals using the [Cascada Script language](script.md). This is the ideal tool for implementing self-correcting agentic loops, complex data pipelines, or any task where you are building a structured data object as the primary output.

By seamlessly integrating multi-model calls, structured data generation, and complex control flow, Cascador-AI provides a robust, type-safe foundation for building your next-generation AI applications with less code and more clarity.

**⚠️ Welcome to the Cutting Edge! ⚠️**
Cascador-AI is a new project and is evolving quickly! This is exciting, but it also means things are in flux. You might run into bugs, and the documentation might not always align perfectly with the released code. It could be behind or have gaps. I am working hard to improve everything and welcome your contributions and feedback.

# Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Understanding the Cascador-AI API](#understanding-the-cascador-ai-api)
- [Configuration Management](#configuration-management)
- [Renderer Types](#renderer-types)
- [Callable Render Objects](#callable-render-objects)
- [Template Properties](#template-properties)
- [Vercel AI Properties](#vercel-ai-properties)
- [Using Renderers in Templates and Scripts](#using-renderers-in-templates-and-scripts)
- [Choosing Your Orchestration Strategy: Scripts, Templates, Context, and Tools](#choosing-your-orchestration-strategy-scripts-templates-context-and-tools)
- [Embedding Integration](#embedding-integration)
- [RAG Integration](#rag-integration)
- [Type Checking](#type-checking)
- [Roadmap](#roadmap)

## Why Cascador-AI?

- **Intuitive Orchestration**: Create complex AI workflows with easy-to-understand script and template syntax.
- **Data-Centric Scripting**: Use **Cascada Script** to build powerful, readable data pipelines for your application's data layer.
- **Parallel by Default**: Independent asynchronous operations run concurrently - no extra effort required.
- **Powerful Scripting & Templating**: Leverage variables, loops, macros, conditionals, and more via [Cascada](https://github.com/geleto/cascada).
- **Flexible Context**: Seamlessly access asynchronous data and functionality using the context object - from static values and dynamic functions to external APIs, database queries, custom service integrations and LLM requests.
- **LLM Provider Flexibility**: Works with any major provider through the [Vercel AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core).
- **Type-Safe**: Catch errors early with robust TypeScript support.

Built on the powerful combination of [Vercel AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core/) and the [Cascada Scripting and Template Engine](https://github.com/geleto/cascada), Cascador-AI delivers a developer experience that feels synchronous while providing the performance benefits of asynchronous execution.

## Installation

Install the Vercel AI SDK
```bash
npm install ai
```

Install Cascador-ai
```bash
npm install cascador-ai
```

Install the specific LLM providers that you plan to use:
```bash
npm install @ai-sdk/openai
```
Check the [Vercel AI SDK Core documentation](https://sdk.vercel.ai/docs/ai-sdk-core) for provider-specific setup details

## Quick Start

This example demonstrates the core power of Cascador-AI by building a **self-improving content agent**. Instead of just generating text, this agent orchestrates a multi-step workflow: it writes a draft, critiques its own work, and then iteratively revises the content until it meets a quality standard.

Here’s how it works:

```javascript
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import { z } from 'zod';

// 1. Define a reusable base configuration using GPT-4o
const baseConfig = create.Config({
    model: openai('gpt-4o'),
    temperature: 0.7,
});

// 2. Define the Agent's Core Capabilities (Renderers)

// A renderer to write drafts (inherits GPT-4o from baseConfig)
const draftGenerator = create.TextGenerator({
    prompt: 'Write a short, engaging blog post about {{ topic }}.',
}, baseConfig);

// A renderer to critique drafts using a structured schema.
// This overrides the base model to use Claude Sonnet for critique.
const critiqueGenerator = create.ObjectGenerator({
    model: anthropic('claude-3-7-sonnet-latest'),
    schema: z.object({
        score: z.number().describe('Quality score from 1-10 on clarity and engagement.'),
        suggestions: z.array(z.string()).describe('Specific, actionable suggestions for improvement.'),
    }),
    prompt: 'Critique this blog post. Provide a quality score and concrete suggestions for improvement.\n\nPOST:\n{{ draft }}',
}, baseConfig);

// A renderer to rewrite a draft based on feedback (inherits GPT-4o)
const revisionGenerator = create.TextGenerator({
    prompt: 'Rewrite the following blog post based on the suggestions provided.\n\nORIGINAL POST:\n{{ draft }}\n\nSUGGESTIONS:\n- {{ suggestions | join("\n- ") }}\n\nREVISED POST:',
}, baseConfig);


// 3. Define the Orchestrator Script
const contentAgent = create.ScriptRunner({
    context: {
        // Provide the renderers to the script
        draftGenerator,
        critiqueGenerator,
        revisionGenerator,
        // Define workflow parameters
        topic: 'the future of AI-powered development',
        qualityThreshold: 8,
		minRevisions: 1,
        maxRevisions: 3,
    },
    script:
      `// This script orchestrates the agent's "thought process".
      :data

      // --- Generate and critique the initial draft ---
      var currentDraft = draftGenerator({ topic: topic }).text
      var critiqueResult = critiqueGenerator({ draft: currentDraft }).object
      var qualityScore = critiqueResult.score
      var suggestions = critiqueResult.suggestions
      var revisionCount = 0
      var break = false

      // --- Start the revision loop ---
      while (qualityScore < qualityThreshold or revisionCount < minRevisions) and revisionCount < maxRevisions and not break
        var previousDraft = currentDraft
        var previousScore = qualityScore
        revisionCount = revisionCount + 1

        // Revise the draft based on the latest suggestions
        var revisedDraft = revisionGenerator({ draft: currentDraft, suggestions: suggestions }).text

        // --- Critique the NEW revised draft ---
        var newCritiqueResult = critiqueGenerator({ draft: revisedDraft }).object
        var newScore = newCritiqueResult.score

        // --- Decide whether to keep the revision ---
        if newScore < previousScore
          // Score got worse. Reject the revision and exit by forcing the loop to end.
          break = true
          revisionCount = revisionCount - 1
        else
          // Revision is an improvement. Accept it and update our state for the next loop.
          currentDraft = revisedDraft
          qualityScore = newScore
          suggestions = newCritiqueResult.suggestions
        endif
      endwhile

      // --- Assemble the final result ---
      @data.finalDraft = currentDraft
      @data.finalScore = qualityScore
      @data.revisionsMade = revisionCount
    `,
});

// 4. Run the Agent
(async () => {
    const result = await contentAgent();
    console.log(JSON.stringify(result, null, 2));
})();
```

### What This Example Demonstrates

-   **Agentic Behavior**: The script doesn't just execute a static list of tasks; it uses a goal-oriented loop (`qualityScore < qualityThreshold`) to make decisions and improve its output over multiple steps.
-   **Stateful Orchestration**: The `while` loop maintains and updates state (`currentDraft`, `qualityScore`) across multiple asynchronous LLM calls, which is essential for complex workflows.
-   **Effortless Concurrency**: All underlying LLM calls (`draftGenerator`, `critiqueGenerator`, etc.) are async operations that run when their data is ready, without you needing to write any `await` or promise-handling logic inside the script.
-   **Configuration Inheritance**: A `baseConfig` provides a default model (`gpt-4o`), which is automatically inherited by the renderers. The `critiqueGenerator` shows how this can be easily overridden for specific tasks.

# Understanding the Cascador-AI API

## Renderers: The Heart of Cascador-AI

At the core of *Cascador-AI* are **renderers** - versatile objects that transform inputs into outputs, whether that’s executing data-centric scripts, rendering templates, generating text with LLMs, or streaming structured data. Think of them as the building blocks for your workflows, designed to be both powerful and easy to use. Every renderer shares a few key traits:

- **Created with Factories**: Use the `create` namespace to spin up renderers with custom configurations, optionally inheriting from a parent (a `Config` object or another renderer):
  ```typescript
  import { create } from 'cascador-ai';
  import { openai } from '@ai-sdk/openai';

  // Standalone renderer
  const simpleRenderer = create.TextGenerator({
    model: openai('gpt-4o'),
    prompt: 'Hello {{ name }}'
  });

  // Inheriting from a base config
  const baseConfig = create.Config({
    model: openai('gpt-4o'),
    temperature: 0.7
  });
  const inheritingRenderer = create.TextGenerator({
    prompt: 'Greet {{ name }}'
  }, baseConfig);
  ```

- **Template And Script Properties**: Every renderer supports template and script processing through several key properties:
  - `promptType` - Controls the template processing mode
  - `context` - Provides data and methods for templates and scripts
  - `filters` - Adds transformation functions
  - `loader` - Enables external template/script loading

  [See Template Properties](#template-properties)

- **Callable Interface**: Invoke renderers in two ways: with their built-in setup or with one-off prompts and contexts. Precompiled prompts/scripts (set during creation) run faster, while on-the-fly inputs offer flexibility:
  ```typescript
  // Using configured precompiled prompt and context
  const result = await renderer();

  // With a one-off prompt and context
  const result = await renderer('Hi {{ name }}', { name: 'World' });
  ```
  One-off inputs specified in a call argument are compiled each time they're used, while inputs defined during renderer creation are precompiled for better performance. [See Callable Objects](#callable-objects)

- **Nested in Scripts and Templates**: Drop renderers into your `context` to use them within other scripts or templates, chaining tasks effortlessly:
  ```typescript
  const mainRenderer = create.TemplateRenderer({
    context: {
      translateRenderer // Assume this is a configured TextGenerator
    },
    prompt: `Original: "It always seems impossible until it's done."
Spanish: "{{ (translateRenderer({ text: "It always seems impossible until it's done", language: 'Spanish' })).text }}"
`
  }, baseConfig);
  ```
  [Check out Using Renderers in Templates and Scripts](#using-renderers-in-templates-and-scripts) for examples.

Renderers tie together *Cascador-AI*’s simplicity and concurrency magic, letting you orchestrate complex workflows with minimal fuss. Whether you’re building data pipelines, generating text, or rendering pure templates, they’ve got you covered.

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
### Property Inheritance Explained
Properties in *Cascador-AI* flow through a chain of configurations - starting from any `Config` object (or multiple), passing through parent renderers, and ending at the renderer you’re crafting. Each level can tweak or extend what came before, but the rules differ: scalar properties like `prompt` or `promptType` get overridden entirely, while objects like `filters`, and `loader` merge their contents, preserving and combining values.
For the `context` object a child renderer's context keeps all the parent root properties but overrides the ones with matching names

Here’s how it plays out:

```typescript
const rootConfig = create.Config({
  prompt: 'Root {{ var }}',
  context: { var: 'root', theme: 'dark' }, // Initial context
  filters: { uppercase: (s) => s.toUpperCase() }
});

const midConfig = create.Config({
  prompt: 'Mid {{ var }}',
  context: { var: 'mid' }, // Overrides 'var', keeps 'theme'
  filters: { lowercase: (s) => s.toLowerCase() } // Merges with uppercase
}, rootConfig);
// Resulting context: { var: 'mid', theme: 'dark' }

const parentRenderer = create.TextGenerator({
  prompt: 'Parent {{ var }}',
  context: { user: 'guest' }, // Adds 'user', keeps 'var' and 'theme'
}, midConfig);
// Resulting context: { var: 'mid', theme: 'dark', user: 'guest' }

const childRenderer = create.TextGenerator({
  prompt: 'Child {{ var }} {{ user }}', // Overrides prompt
}, parentRenderer);
// Resulting context: { var: 'mid', theme: 'dark', user: 'guest' }

(async () => {
  console.log((await childRenderer()).text); // "Child mid guest"
  // context: { var: 'mid', theme: 'dark', user: 'guest' }
  // filters: { uppercase, lowercase }
})();
```

## The Cascador Renderers

### Your Toolkit for Every Task

*Cascador-AI* offers a suite of renderers, each tailored to a specific job - whether it’s executing scripts, rendering templates, generating text, or streaming data. Built on the Vercel AI SDK, they share a common foundation where each LLM renderer has a corresponding Vercel AI SDK Core function. Here’s the lineup:

### TemplateRenderer
**What it does**: Pure template processing for string generation, with no LLMs involved. Perfect for stitching together dynamic content from data or async sources into a final text output like HTML or Markdown.

```typescript
import { create } from 'cascador-ai';

const baseConfig = create.Config({ /* shared settings */ });
const templatedRenderer = create.TemplateRenderer({
  prompt: 'Hi {{ name }}! Today is {{ currentDay }}.',
  context: {
    name: async () => (await sql.query('SELECT name FROM users LIMIT 1')).rows[0].name,
    currentDay: new Date().toLocaleDateString()
  }
}, baseConfig);

(async () => {
  const result = await templatedRenderer();
  console.log('Output:', result);
})();
```

**Use it for**: Generating HTML, dynamic reports, email templates, or any task needing flexible, non-LLM rendering where the final output is a string.

### ScriptRunner
**What it does**: Executes powerful, data-centric workflows using **[Cascada Script](script.md)**, a language designed for effortless concurrency. Unlike `TemplateRenderer`, which primarily produces a string, `ScriptRunner`'s main output is a structured data object (e.g., JSON), making it the ideal choice for your application's data layer. It excels at orchestrating complex logic, fetching data from multiple async sources in parallel, and transforming it into a final, clean object.

```typescript
import { create } from 'cascador-ai';

// A user service mock
const userService = {
  fetchProfile: async (id) => ({ id, name: 'Alice', email: 'alice@example.com' }),
  fetchPosts: async (id) => ([{ id: 101, title: 'First Post' }, { id: 102, title: 'Second Post' }]),
};

const userDashboardBuilder = create.ScriptRunner({
  context: {
    // Provide async functions to the script
    fetchProfile: userService.fetchProfile,
    fetchPosts: userService.fetchPosts,
  },
  script: `
    // The :data directive focuses the output to be a clean data object
    :data

    // These two async calls run in parallel automatically
    var profile = fetchProfile(userId)
    var posts = fetchPosts(userId)

    // The @data commands are buffered and run after the fetches complete,
    // assembling the final object in a predictable order.
    @data.user.id = profile.id
    @data.user.name = profile.name
    @data.posts = posts
  `
});

(async () => {
  const dashboardData = await userDashboardBuilder({ userId: 123 });
  console.log('Dashboard Data:', JSON.stringify(dashboardData, null, 2));
})();
```

**Use it for**: Implementing complex data layers, orchestrating multi-step agentic workflows, fetching and aggregating data from multiple APIs/databases, and any task where the primary output is structured data rather than a rendered string. For a deep dive into the scripting language, see the **[Cascada Script Documentation](script.md)**.


### TextGenerator
**What it does**: Generates text via LLMs using Vercel’s [`generateText` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text). Ideal for one-shot outputs like summaries or creative writing.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

const generator = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Describe "{{ topic }}" in 3 sentences.',
  context: {
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

**Use it for**: Article generation, quick answers, or API-driven content. [See Vercel docs on text generation](https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#generatetext) for return details.

### TextStreamer
**What it does**: Streams LLM text in real time with Vercel’s [`streamText` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text). Great for live updates or chat-style interfaces.

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

**Use it for**: Progressive rendering, chatbots, or interactive UIs. [See Vercel docs on text streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming-text#streamtext) for streaming specifics.

### ObjectGenerator
**What it does**: Produces structured data with Vercel’s [`generateObject` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-object), complete with schema validation. Think JSON outputs or classifications.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const profileGenerator = create.ObjectGenerator({
  model: openai('gpt-4o'),
  schema: z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.array(z.string())
  }),
  prompt: 'Generate a random person profile in JSON format.'
}, baseConfig);

(async () => {
  const { object: person } = await profileGenerator();
  console.log('Person:', person);
})();
```

You can specify how the data should be structured by setting `output` to:
- `object` (default) - Returns a single object matching the schema
- `array` - Returns an array of objects matching the schema
- `enum` - For classification tasks with a discrete set of possible values
- `no-schema` - No schema validation, returns raw JSON

**Use it for**: Data extraction, structured responses, or enum-based classification. [See Vercel docs on object generation](https://sdk.vercel.ai/docs/ai-sdk-core/generating-objects#generateobject) for return details.

### ObjectStreamer
**What it does**: Streams structured data incrementally via Vercel’s [`streamObject` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-object). Perfect for real-time data feeds or partial updates.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const characterStreamer = create.ObjectStreamer({
  model: openai('gpt-4o'),
  schema: z.array(z.object({
    name: z.string(),
    description: z.string()
  })),
  output: 'array',
  prompt: 'Generate 3 character descriptions.'
}, baseConfig);

(async () => {
  const { elementStream } = await characterStreamer();
  for await (const character of elementStream) {
    console.log('Character:', character);
  }
})();
```

You can specify how the data should be structured by setting `output` to:
- `object` (default) - Streams partial updates to a single object
- `array` - Streams complete elements from an array
- `no-schema` - No schema validation, streams raw JSON

**Use it for**: Live dashboards, incremental JSON builds, or array streaming. [See Vercel docs on object streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming-objects#streamobject) for streaming specifics.

## Callable Render Objects


Every renderer in *Cascador-AI* doubles as a callable object, giving you two ways to wield it: stick with its preconfigured setup or throw in a fresh prompt or context on the fly. Plus, renderers can serve as parent configurations for others, making them reusable building blocks.

Here’s how you can call them:

1. **Using the Predefined Prompt**: Rely on the prompt and context set when the renderer is created - precompiled for speed:
   ```typescript
   import { create } from 'cascador-ai';

   const renderer = create.TextGenerator({
     prompt: 'Hello {{ name }}',
     context: { name: 'World' }
   }, baseConfig);

   (async () => {
     const result = await renderer();
     console.log(result.text); // "Hello World"
   })();
   ```

2. **With a One-Off Prompt**: Pass a new prompt and optional context directly, compiled fresh each time:
   ```typescript
   (async () => {
     const result = await renderer('Hi {{ user }}', { user: 'Alice' });
     console.log(result.text); // "Hi Alice"
   })();
   ```

Precompiled prompts (set at creation) are optimized for performance, while one-off prompts offer quick adaptability—perfect for testing or dynamic scenarios.

## Template Properties

Renderers in *Cascador-AI* are powered by Cascada's scripting and templating engine. With a handful of properties, you can control how scripts and templates are processed, inject data, transform outputs, and even pull in external files. These apply to all renderers (unless you set `promptType: 'text'` to skip templating). Here’s what you can tweak:

### prompt
The heart of your renderer—it’s the template or text that gets processed. Set it in three spots:
- Base config: `create.Config({ prompt: 'Base {{ var }}' })`
- Renderer creation (recommended): `create.TextGenerator({ prompt: 'Main {{ var }}' })`
- Function call: `renderer('Dynamic {{ var }}', context)`

Prompts set at creation or in config are precompiled for speed; call-time prompts are compiled fresh each time. When paired with `messages`, the rendered prompt appends to the array (future feature).

### promptType
Controls how your prompt is handled:
- `'async-template'` (default) - Async processing with parallel promise resolution
- `'template'` - Standard synchronous Nunjucks templating
- `'template-name'` - Loads a named template synchronously (needs `loader`)
- `'async-template-name'` - Loads a named template asynchronously (needs `loader`)
- `'text'` - Skips templating, treats the prompt as plain text

### context
Provides data and methods that can be accessed within templates and scripts. Both the data and method returns can be asynchronous (promises are automatically handled), keeping your logic clean and powerful. Here’s what you can add to the `context` object:
- **Static Values**: Simple strings, numbers, or objects (e.g., `'London'`, `42`, `{ key: 'value' }`).
- **Synchronous Functions**: Basic logic or transformations (e.g., `(x) => x.toUpperCase()`).
- **Asynchronous Functions**: API calls, database queries, or file reads (e.g., `async () => await fetch(...)`).
- **Other Renderers**: Nest renderers for chained operations (e.g., a `TextGenerator` to translate text).
- **Custom Integrations**: Anything callable—think service clients or utility libraries.

Example:
```typescript
const renderer = create.TextGenerator({
  prompt: 'Weather in {{ city }}: {{ getWeather(city) }} - {{ (translator({ text: 'Updated' })).text }}',
  context: {
    city: 'London', // Static value
    getWeather: async (city) => (await fetch(`https://api.weather.com/${city}`)).json(), // Async function
    currentTime: new Date().toISOString(), // Static via function
    translator: create.TextGenerator({ // Nested renderer
      model: openai('gpt-4o'),
      prompt: 'Translate to Spanish: {{ text }}'
    }, baseConfig)
  }
}, baseConfig);
```

### filters
Transform data on the fly with custom functions, sync or async, using the `|` operator:
```typescript
import { create } from 'cascador-ai';
import translate from 'translate';

const renderer = create.TemplateRenderer({
  filters: {
    translate: async (text, lang) => await translate(text, lang)
  },
  prompt: `
    Original: {{ text }}
    Spanish: {{ text | translate('es') }}
  `
}, baseConfig);

(async () => {
  console.log(await renderer({ text: 'Hello world' }));
})();
```

### loader
Pull templates or scripts from files using a Nunjucks-compatible loader:
```typescript
import { create, FileSystemLoader } from 'cascador-ai';

const fileLoader = new FileSystemLoader('./templates');
const renderer = create.TemplateRenderer({
  loader: fileLoader,
  prompt: `
    {% include 'header.njk' %}
    {% include 'content.njk' %}
  `
}, baseConfig);
```
For named templates, use `promptType: 'template-name'` and set `prompt` to the filename (e.g., `'main.njk'`).

### options
Fine-tune the Nunjucks engine with extras like `autoescape` or `trimBlocks`:
```typescript
const renderer = create.TemplateRenderer({
  options: {
    autoescape: false,
    trimBlocks: true
  },
  prompt: '...'
}, baseConfig);
```
See [Nunjucks docs](https://mozilla.github.io/nunjucks/api.html#configure) for more.

## Vercel AI Properties

*Cascador-AI* renderers inherit a robust set of properties from the [Vercel AI SDK](https://sdk.vercel.ai/), enabling fine-tuned control over language model behavior. These properties are available across all renderer types and can be set in a base `Config` object, during renderer creation, or, where applicable, overridden in runtime calls. Below are the key properties, with examples provided for the less intuitive ones (`model`, `messages`, `stop`, `tools`).

### model
**Purpose**: Specifies the language model to use for generation.
**Type**: Provider-specific model object (required).
**Details**: Must be supplied via a provider helper (e.g., `openai()`, `anthropic()`). Mandatory in renderer or `Config`.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { create } from 'cascador-ai';

const baseConfig = create.Config({ temperature: 0.7 });
const openaiRenderer = create.TextGenerator({
  model: openai('gpt-4o'), // OpenAI's GPT-4o
  prompt: 'Summarize {{ text }}'
}, baseConfig);

const anthropicRenderer = create.TextGenerator({
  model: anthropic('claude-3-5-sonnet-20240620'), // Claude 3.5 Sonnet
  prompt: 'Analyze {{ data }}'
}, baseConfig);
```

### temperature
**Purpose**: Adjusts the randomness of the model's output.
**Type**: `number` (0 to 1, default: 0.7).
**Details**: Lower values for predictable responses; higher for creativity.

### maxTokens
**Purpose**: Limits the number of tokens generated.
**Type**: `number` (optional).
**Details**: Caps response length to manage size and cost.

### messages
**Purpose**: Defines a chat-style conversation history.
**Type**: Array of `{ role: 'system' | 'user' | 'assistant', content: string }` (optional).
**Details**: For multi-turn interactions; `prompt` appends as a user message (future behavior may evolve).
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';

const renderer = create.TextGenerator({
  model: openai('gpt-4o'),
  messages: [
    { role: 'system', content: 'You are a pirate captain.' },
    { role: 'user', content: 'What’s your ship called?' },
    { role: 'assistant', content: 'The Black Kraken, matey!' }
  ],
  prompt: 'Tell me about your latest adventure.'
}, baseConfig);

(async () => {
  const { text } = await renderer();
  console.log(text); // Continues pirate-themed chat
})();
```

### topP
**Purpose**: Controls diversity via nucleus sampling.
**Type**: `number` (0 to 1, default: 1).
**Details**: Limits tokens to the top probability mass; an alternative to `temperature` for finer diversity control.

### presencePenalty
**Purpose**: Discourages repetition of tokens already in the output.
**Type**: `number` (-2.0 to 2.0, default: 0).
**Details**: Positive values reduce reuse; negative encourage it.

### frequencyPenalty
**Purpose**: Reduces repetition based on token frequency.
**Type**: `number` (-2.0 to 2.0, default: 0).
**Details**: Higher values penalize frequent tokens; negative promote them.

### stop
**Purpose**: Halts generation at specified sequences.
**Type**: `string[]` (optional).
**Details**: Stops before generating the sequence; useful for structured outputs.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';

const renderer = create.TextGenerator({
  model: openai('gpt-4o'),
  stop: ['###', '\n\n'], // Stops at triple hash or double newline
  prompt: 'List 3 facts about space:\n1.'
}, baseConfig);

(async () => {
  const { text } = await renderer();
  console.log(text); // Stops early if "###" or "\n\n" appears
})();
```

### tools
**Purpose**: Enables the model to call external functions.
**Type**: Object mapping tool names to `{ description: string, parameters: z.ZodSchema, execute?: (args: any) => Promise<any> }` (optional).
**Details**: Supported by `TextGenerator` and `TextStreamer`; paired with `maxSteps`.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import { z } from 'zod';

const renderer = create.TextGenerator({
  model: openai('gpt-4o'),
  tools: {
    fetchStockPrice: {
      description: 'Get the current stock price',
      parameters: z.object({ ticker: z.string() }),
      execute: async ({ ticker }) => ({ price: 150.25, currency: 'USD' }) // Mock API
    }
  },
  prompt: 'What’s the stock price for {{ company }}?',
  context: { company: 'AAPL' }
}, baseConfig);

(async () => {
  const { text, toolCalls } = await renderer();
  console.log(text); // Incorporates tool result
})();
```

### maxSteps
**Purpose**: Limits the number of tool-calling steps.
**Type**: `number` (default: 1, optional).
**Details**: Works with `tools` in `TextGenerator` and `TextStreamer`.

## Using Renderers in Templates and Scripts

Renderers in *Cascador-AI* can be embedded within scripts or templates by adding them to the `context` object, enabling seamless task chaining and orchestration. This approach leverages the engine’s power to coordinate multiple renderers, execute them when their inputs are ready, and process their outputs dynamically.

### Example with `ScriptRunner` for Data Orchestration

Use `ScriptRunner` when your goal is to build a structured data object by orchestrating multiple steps. Its clear, top-to-bottom logic is ideal for data pipelines and complex agentic workflows.

```typescript
// ... (characterGenerator, storyGenerator, critiqueGenerator setup from previous examples) ...

// Orchestrating script
const mainOrchestrator = create.ScriptRunner({
  context: {
    characterGenerator,
    storyGenerator,
    critiqueGenerator,
    topic: 'a lost astronaut'
  },
  script: `
    :data
    // Step 1: Generate the character. This runs first.
    var character = (characterGenerator({ topic: topic })).object
    // Step 2: Generate the story using the character. This runs after character is ready.
    var story = (storyGenerator({ character: character, topic: topic })).text
    // Step 3: Critique the story. This runs after the story is ready.
    var critique = (critiqueGenerator({ story: story })).text
    // Assemble the final data object.
    @data.character = character
    @data.story = story
    @data.critique = critique
  `
}, baseConfig);

(async () => {
  const result = await mainOrchestrator();
  console.log(JSON.stringify(result, null, 2));
})();
```

### Example with `TemplateRenderer` for Presentation

Use `TemplateRenderer` when your primary goal is to generate a final string output, like an HTML page or a formatted report. The template syntax is concise for embedding results directly into text.

```typescript
// ... (characterGenerator, storyRenderer, critiqueStreamer setup from previous examples) ...

// Orchestrating renderer for presentation
const mainRenderer = create.TemplateRenderer({
  context: {
    characterGenerator,
    storyRenderer,
    critiqueStreamer,
    topic: 'a lost astronaut'
  },
  prompt: `
    {% set character = (characterGenerator({ topic })).object %}
    Character: {{ character | json }}

    {% set storyContent = (storyRenderer({ character, topic })).text %}
    Story: {{ storyContent }}

    Live Critique: {% set stream = (critiqueStreamer({ story: storyContent })).textStream %}
      {% for chunk in stream %}{{ chunk }}{% endfor %}
  `
}, baseConfig);

(async () => {
  const result = await mainRenderer();
  console.log(result); // Outputs a single formatted string
})();
```

### Key Points
- **Parallel Execution**: The critique stream runs after the story, which depends on the character, optimizing the dependency chain.
- **Result Handling**: Access `.object` for structured data, `.text` for stories, and `.textStream` for live critiques.
- **Dynamic Inputs**: Pass outputs (e.g., `character`) to subsequent renderers for cohesive workflows.
- **Versatility**: Combine different renderer types—like `ObjectGenerator`, `TextGenerator`, and `TextStreamer`—to handle varied tasks in one workflow.

## Choosing Your Orchestration Strategy: Scripts, Templates, Context Methods, and Tools

In *Cascador-AI*, you have several mechanisms to build workflows. Choosing the right one depends on your goal: are you building a structured data object, or are you rendering a final text document?

### `ScriptRunner`: For Data-Layer Logic and Orchestration
Use `ScriptRunner` when your primary goal is to produce a structured data object (JSON). It is the backbone of your application's data layer.

**Use When:**
-   **The output is data:** Your main goal is to create a complex object or array to be used by your application.
-   **Complex logic is needed:** You need loops (`for`, `while`), conditionals (`if/else`), and variables to manage state across multiple async steps.
-   **Orchestrating multiple sources:** You are fetching data from several APIs, databases, and other renderers and need to combine them into a single, coherent object.
-   **Readability is key for complex flows:** The top-to-bottom, `await`-free syntax makes complex data dependencies easy to follow.

### `TemplateRenderer`: For Presentation and String Generation
Use `TemplateRenderer` when your primary goal is to produce a string, such as HTML, Markdown, or a formatted report.

**Use When:**
-   **The output is text:** You are generating a final, human-readable document.
-   **Logic is simple and presentation-focused:** The workflow involves embedding data into a string using `{{ variable }}` and simple conditionals or loops with `{% %}` tags.
-   **You are building UIs:** Generating HTML with included partials is a classic use case.

### Context Methods & Filters: The Building Blocks
These are the fundamental JS/TS functions you provide to *both* scripts and templates. They are not an orchestration strategy on their own, but rather the efficient, predictable actions that your orchestrator calls.

**Use When:**
-   **You need raw performance:** A plain JavaScript/TypeScript function is always faster than an LLM call.
-   **The logic is deterministic:** You need to fetch data from a known API endpoint, query a database, or perform a specific data transformation.
-   **You want to expose utilities:** Provide helper functions (e.g., `formatDate`, `calculateTotal`) to your scripts and templates.

### LLM `tools`: For Dynamic, Model-Driven Actions
This is a specific feature of Vercel AI SDK where the *LLM itself decides* which function to call based on the prompt. It's a different paradigm from the developer-defined logic in scripts and templates.

**Use When:**
-   **The workflow is unpredictable:** You don't know ahead of time which information the user will ask for, so the LLM must decide whether to call a tool like `getWeather` or `findRestaurants`.
-   **You want a conversational agent:** The LLM can chain its own reasoning, calling a tool, getting a result, and using that result to decide its next step, all within a single turn.

## Embedding Integration

*Cascador-AI* seamlessly integrates vector embeddings from the Vercel AI SDK. By adding embedding functions to the `context` object, you can use them directly in scripts for tasks like semantic search, similarity comparisons, or retrieval-augmented generation (RAG).

### Example
Here’s how to find the most similar document to a user query using a `ScriptRunner` to orchestrate the embedding and comparison tasks in parallel.

```typescript
import { openai } from '@ai-sdk/openai';
import { embed, cosineSimilarity } from 'ai';
import { create } from 'cascador-ai';
import fs from 'fs/promises';

const documentFinder = create.ScriptRunner({
  context: {
    userQuery: 'machine learning applications',
    readFile: async (filePath) => await fs.readFile(filePath, 'utf-8'),
    embedText: async (text) => (await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text
    })).embedding,
    compareSimilarity: cosineSimilarity,
    range: (n) => [...Array(n).keys()], // Helper to generate numbers for the loop
  },
  script: `
    :data
    // Get the query embedding once.
    var queryEmbedding = embedText(userQuery)
    // The 'for' loop in Cascada Script runs in parallel for each item.
    // This fetches, reads, and embeds all 10 documents concurrently.
    for i in range(10)
      var docPath = 'docs/document' + (i + 1) + '.txt'
      var docText = readFile(docPath)
      var docEmbedding = embedText(docText)
      // The @data command is buffered, ensuring orderly assembly
      // after all parallel operations are complete.
      @data.docs.push({
        filename: docPath,
        similarity: compareSimilarity(queryEmbedding, docEmbedding)
      })
    endfor
    // Note: Reading from @data is not yet supported.
    // Sorting must be done in the calling JavaScript/TypeScript code.
  `
}, baseConfig);

(async () => {
  const result = await documentFinder();
  // Sort the results in JS after the script has run
  const sortedDocs = result.docs.sort((a, b) => b.similarity - a.similarity);
  console.log(`Most similar document to "${result.userQuery}":`);
  console.log(sortedDocs[0]);
})();
```

## RAG Integration

*Cascador-AI*’s script-driven approach simplifies retrieval-augmented generation (RAG) workflows. By using `ScriptRunner`, you can clearly define the steps of your RAG pipeline: searching an index, retrieving context, and generating a final answer. This leverages automatic concurrency for maximum efficiency.

### Example
**Summary**: This example loads 10 documents, builds a vector index with LlamaIndex, and uses a `ScriptRunner` to orchestrate the retrieval of relevant snippets about machine learning for cancer detection and then summarizes them.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';
import { Document, VectorStoreIndex, OpenAIEmbedding } from 'llamaindex';
import fs from 'fs/promises';

const docs = await Promise.all(
  [...Array(10)].map(async (_, i) =>
    new Document({ text: await fs.readFile(`document${i + 1}.txt`), id_: `doc${i + 1}` })
  ));
const vectorIndex = await VectorStoreIndex.fromDocuments(docs, {
  embedModel: new OpenAIEmbedding({ model: 'text-embedding-3-small' })
});

// Answer generator renderer
const answerGenerator = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: 'Summarize the latest advancements in machine learning for cancer detection based on: {{ context }}'
});

// RAG orchestrator using ScriptRunner
const ragOrchestrator = create.ScriptRunner({
  context: {
    query: 'What are the latest advancements in machine learning for cancer detection?',
    searchIndex: async (queryText) => {
      const queryEngine = vectorIndex.asQueryEngine();
      const response = await queryEngine.query(queryText);
      return response.sourceNodes.map(n => n.text).join('\n');
    },
    answerGenerator
  },
  script: `
    :data
    // Step 1: Search the index to get relevant context
    var context = searchIndex(query)
    // Step 2: Use the context to generate a final answer
    var answer = (answerGenerator({ context: context })).text
    // Step 3: Assemble the final output object
    @data.query = query
    @data.answer = answer
  `
});

(async () => {
  const result = await ragOrchestrator();
  console.log(JSON.stringify(result, null, 2));
})();
```

### Vercel AI Embedding Adapter
To use Vercel AI SDK embeddings instead of LlamaIndex’s embeddings with LlamaIndex, create an adapter:

```typescript
import { BaseEmbedding } from 'llamaindex';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

class VercelEmbeddingAdapter extends BaseEmbedding {
  constructor(private vercelModel = openai.embedding('text-embedding-3-small')) {
    super();
  }

  async getTextEmbedding(text: string): Promise<number[]> {
    const { embedding } = await embed({ model: this.vercelModel, value: text });
    return embedding;
  }

  async getQueryEmbedding(text: string): Promise<number[]> {
    return this.getTextEmbedding(text);
  }
}

// Usage:
const vectorIndex = await VectorStoreIndex.fromDocuments(docs, {
  embedModel: new VercelEmbeddingAdapter()
});
```

## Type Checking

*Cascador-AI*’s TypeScript integration enforces strict configuration rules to catch errors at compile time, preventing runtime issues. Below are examples of common type violations and the required properties they enforce.

### Examples
```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

// Error: Cannot mix text and template properties
const invalidRenderer = create.TextGenerator({
  promptType: 'text',
  filters: {}, // Type error: 'text' mode disallows template properties
});

// Error: Missing required model
const noModelRenderer = create.TextGenerator({
  prompt: 'Hello'
}); // Type error: 'model' must be provided

// Error: Missing loader for named template
const namedTemplate = create.TextGenerator({
  promptType: 'template-name',
  prompt: 'my-template'
}); // Type error: 'loader' required for 'template-name'

// Error: Missing prompt at runtime
const noPromptRenderer = create.TextGenerator({
  model: openai('gpt-4o')
});
await noPromptRenderer(); // Type error: 'prompt' required in config, creation, or call
```

### Enforced Rules
- **Model**: Must be set in renderer creation or a parent `Config`.
- **Loader**: Required for `promptType: 'template-name'` or `'async-template-name'`.
- **Prompt**: Must be provided in creation, a `Config`, or the runtime call.
- **Template Properties**: `filters`, `loader`, and `options` are disallowed when `promptType: 'text'`.

This type safety ensures robust, predictable workflows with early error detection.

## Roadmap

*Cascador-AI* is evolving to enhance its capabilities and robustness. Here are the key features planned for future releases:

- **optional JS/TS scripts and templates** to be used instead of Cascada
- **Integrating the messages property with prompts**: template prompts are rendered and appended to the messages (if the property exists)
- **Simplified loader wrapper**: replace the overcomplicated nunjucks loaders with simple function or interface
- **Image Generation**: Add support for generating images from prompts using models like DALL-E.
- **Versioned Templates**: Enable loading versioned prompts with a loader that wraps unversioned loaders for better template management.
- **Error Resilience**: Implement retry logic and Cascada’s upcoming try/except blocks for improved error handling.
- **Snapshot Support**: Request the template engine to return a snapshot of the currently rendered data. Due to the non-sequential nature of the rendering - regular streaming is not practical.
- **Instructions on integrating memory**: Provide clear patterns and examples for integrating long-term memory.