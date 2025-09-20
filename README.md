# Cascador-AI: Efficient AI Orchestration Made Intuitive

## What is Cascador-AI?

Building sophisticated AI systems - from multi-step agents and RAG pipelines to complex tool-use chains - requires orchestrating numerous asynchronous tasks. **Cascador-AI is an AI orchestration library that makes this radically simpler and more intuitive.** Built on the [Vercel AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core) and the powerful [Cascada Scripting and Templating Engine](https://github.com/geleto/cascada), it allows you to define these workflows with clean, declarative, synchronous-style code and templates. The engine automatically parallelizes asynchronous operations, giving you the performance of concurrent execution without the complexity of managing it.

### 🔀 A Code-First Philosophy: Write Logic, Not Graphs

Cascador-AI is built for developers who prefer expressing complex logic as **code, not as a graph of boilerplate nodes and edges**. Instead of forcing you to learn a rigid, declarative API to define nodes and edges, it lets you write your workflows using familiar patterns like variables, functions, loops, and conditionals. You write the logic; the engine handles the complex orchestration and parallel execution for you.

### ⚡ Parallel by Default, Data-Flow guided execution

The core of Cascador-AI is a **data-flow execution model**. Instead of running line-by-line, operations run as soon as their data dependencies are met. This means independent LLM calls or API requests in your script automatically run in parallel without any extra effort. For stateful operations where order is critical (like database writes), you can easily enforce a strict sequential execution, giving you the best of both worlds. This powerful combination means that instead of wrestling with computation graphs, message queues, or async boilerplate, you just write the logic - the engine handles the rest.

### 💡 Logic vs. Capabilities: A Clear Separation of Concerns

The library encourages a powerful separation between the *what* (the orchestration plan) and the *how* (the underlying tools and functions):

*   **The Logic (The "What"):** This is the high-level plan defined in a components that act as orchestrators. It's a readable, self-contained script or template that orchestrates the workflow, defining the steps and data flow.
    *   *Examples:* A script that first generates a draft, then sends it for critique, and finally revises it based on feedback; a template that fetches user data and product recommendations in parallel to render a personalized welcome email.

*   **The Capabilities (The "How"):** These are the concrete tools, APIs and data sources your logic uses to get the job done. You provide them in the `context` object, making them available to your scripts and templates. The engine automatically handles resolving promises, allowing you to focus on your workflow logic without async boilerplate.
    *   *Examples:* Seamlessly access asynchronous data and functionality - from static values (`{ qualityThreshold: 8 }`) and dynamic JavaScript functions (`(name) => name.toUpperCase()`) to external API calls (`fetchWeatherAPI(location)`), database queries (`db.getUser(id)`), custom service integrations, and other `Cascador-AI` components (`generateDraft(topic)`).

### 🧩 Composable & Reusable Components

Cascador-AI treats every piece of your AI workflow—from a simple text generator to a complex multi-step agent - as a modular, reusable component. Because you define logic as code, you can encapsulate functionality into distinct `TextGenerator/Streamer`, `ObjectGenerator/Streamer`, or `Script` and `Template` instances.

These components are not just static definitions; they are callable functions that can be passed around, nested, and composed. You can expose one component from within another's script or template by simply adding it to the `context`. This allows you to build sophisticated systems from smaller, testable, and self-contained parts, promoting clean architecture and avoiding monolithic, hard-to-maintain agent definitions. For even more powerful composition, Cascada templates and scripts can also `include` files, `import` macros, and `extend` parent templates and scripts.

### 🛠️ Full-Spectrum AI Functionality

Cascador-AI combines its unique orchestration capabilities with the robust features of the [Vercel AI SDK Core](https://sdk.vercel.ai/docs/ai-sdk-core) to provide a complete toolkit for modern AI development.

#### Powered by Cascada
*   **Declarative Agent Orchestration:** Define sophisticated, multi-step agent logic using clean, readable scripts. The engine automatically parallelizes independent operations, data-flows and piepeline steps while transparently managing data dependencies, letting you focus on the "what" instead of the "how."
*   **Dynamic Prompt Engineering:** Craft powerful, adaptive prompts by composing templates and scripts, embedding the results from other LLM calls, and injecting data from asynchronous sources like APIs or databases, all within a single, coherent workflow.
*   **Seamless Custom Integrations:** Easily plug any custom service, utility, or external API into your workflows. By adding them to the `context` object, they become available as simple function calls within your scripts and templates.

#### Powered by the Vercel AI SDK Core
*   **LLM Provider Flexibility:** Works with any major provider supported by the Vercel AI SDK Core, including OpenAI, Anthropic, Google, Cohere, and more. Swap models and providers with a single line of code.
*   **Structured Data Generation:** Generate strongly-typed, validated JSON objects and arrays using Zod schemas, ensuring reliable and predictable outputs from your LLMs.
*   **Model-Driven Tool Use:** Expose your own functions—like API calls or database queries—as tools that an LLM can decide to call based on its own reasoning to fulfill a user's request.
*   **Text Generation & Streaming:** Leverage powerful LLMs for both one-shot text generation and real-time streaming to create dynamic, interactive user experiences.

**⚠️ Welcome to the Cutting Edge! ⚠️**
Cascador-AI is a new project and is evolving quickly! This is exciting, but it also means things are in flux. You might run into bugs, and the documentation might not always align perfectly with the released code. It could be behind or have gaps. I am working hard to improve everything and welcome your contributions and feedback.

# Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Understanding the Cascador-AI API](#understanding-the-cascador-ai-api)
- [The `prompt` Property: Your Universal Input](#the-prompt-property-your-universal-input)
- [Configuration Management](#configuration-management)
- [The Cascador Components](#the-cascador-components)
- [Callable Component Objects](#callable-component-objects)
- [Using Components as Tools](#using-components-as-tools)
- [Template and Script Properties](#template-and-script-properties)
- [Vercel AI Properties](#vercel-ai-properties)
- [Using Components in Templates and Scripts](#using-components-in-templates-and-scripts)
- [Choosing Your Orchestration Strategy: Scripts, Templates, Context Methods, and Tools](#choosing-your-orchestration-strategy-scripts-templates-context-methods-and-tools)
- [Embedding Integration](#embedding-integration)
- [RAG Integration](#rag-integration)
- [Input and Output Validation with Zod](#input-and-output-validation-with-zod)
- [Type Checking](#type-checking)
- [Roadmap](#roadmap)


## Installation

Install any Vercel AI SDK 5.x version
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

This example demonstrates the core power of Cascador-AI by building a **self-improving content agent**. This agent orchestrates a multi-step workflow: it writes a draft, critiques its own work, and then iteratively revises the content until it meets a quality standard.

Here’s how it works:

```javascript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { create } from 'cascador-ai';
import { z } from 'zod';

// Define a reusable base configuration
const baseConfig = create.Config({ model: openai('gpt-4o'), temperature: 0.7, maxRetries: 3 });

// A component to write drafts (inherits from baseConfig)
const draftGenerator = create.TextGenerator.withTemplate({
	prompt: 'Write a short, engaging blog post about {{ topic }}.',
}, baseConfig);

// A component to critique drafts using a structured schema.
const critiqueGenerator = create.ObjectGenerator.withTemplate({
	schema: z.object({
		score: z.number().describe('Quality score from 1-10.'),
		suggestions: z.array(z.string()).describe('Actionable suggestions for improvement.'),
	}),
	prompt: 'Critique this blog post: {{ draft }}',
}, baseConfig);

// A component to rewrite a draft based on feedback
const revisionGenerator = create.TextGenerator.withTemplate({
	model: anthropic('claude-3-7-sonnet-latest'), //override the base model to use Claude Sonnet
	prompt: 'Rewrite the following post based on these suggestions:\n\nPOST:\n{{ draft }}\n\nSUGGESTIONS:\n- {{ suggestions | join("\n- ") }}',
}, baseConfig);

// Define the orchestration script for the agent
const contentAgent = create.Script({
	context: {
		draftGenerator, critiqueGenerator, revisionGenerator,
		topic: "the future of AI-powered development",
		qualityThreshold: 8, maxRevisions: 3, minRevisions: 1
	},
	script: `:data
      var revisionCount = 0
      var currentDraft = draftGenerator({ topic: topic }).text
      var critique = critiqueGenerator({ draft: currentDraft }).object

      // Iteratively revise until the quality threshold or maxRevisions is met
      while (critique.score < qualityThreshold or revisionCount < minRevisions) and revisionCount < maxRevisions
        revisionCount = revisionCount + 1
        currentDraft = revisionGenerator({ draft: currentDraft, suggestions: critique.suggestions }).text
        critique = critiqueGenerator({ draft: currentDraft, suggestions: critique.suggestions }).object
      endwhile

      @data = { finalDraft: currentDraft, finalScore: critique.score, revisionCount: revisionCount }`,
});

// Run the agent
(async () => {
	const result = await contentAgent();
	console.log(JSON.stringify(result, null, 2));
})().catch(console.error);
```

# Understanding the Cascador-AI API

## Components: The Heart of Cascador-AI

At the core of *Cascador-AI* are **components**—versatile objects that transform inputs into outputs. They are the building blocks for your workflows, designed to be both powerful and easy to compose. Every component is created using the `create` factory and can be called like a function. All components can be considered **renderers**, as they all produce an output (rendering text, data, or a stream). However, `Script` and `Function` components can also act as powerful **orchestrators**, defining and coordinating complex, multi-step workflows.

In Cascador-AI, you build workflows by making a **component** using the `create` factory for a specific task, like `TextGenerator`. You provide a configuration object with essential settings like the `model` to use and the `prompt` to send. To reuse settings, simply create a `Config` object and pass it as a second argument to have your component inherit from it. Or you can inherit the configuration of a component from another component.

```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

// Create a simple component with an inline configuration
const jokeGenerator = create.TextGenerator({
  model: openai('gpt-4o-mini'),
  prompt: 'Tell me a short, clean joke.',
});
```

A key feature is that **every component is a callable function**. This provides several powerful ways to use them:

1.  **With Pre-configured Input**: Call the component with no arguments (`await component()`) or just a context object (`await component({ user: 'Admin' })`) to use its pre-compiled prompt, script, or template for optimal performance.
2.  **With One-off Input**: Call the component with new arguments (`await component(newInput, newContext)`) for dynamic, on-the-fly execution. Both arguments are optional. The behavior of `newInput` depends on how the component was created.

### The Default Behavior: Plain Text

By default, LLM components (`TextGenerator`, `ObjectGenerator`, `TextStreamer`, `ObjectStreamer`) treat the `prompt` string as plain, unprocessed text.

```typescript
// The prompt is treated as static text, with no template processing.
const plainTextComponent = create.TextGenerator({
    model: openai('gpt-4o-mini'),
    prompt: 'Write a poem about the sea.'
});
```

### Adding Capabilities with Modifiers

To add dynamic processing capabilities like generating prompts with templates or scripts, or creating a tool - you use explicit modifiers on the base factory function. These modifiers "enhance" the base component with specific capabilities.

#### The `.with...` Family for Inline Content:
These modifiers create a component that adds the capability to render the prompt by processing it as a template, script, or function.
*   `default` with no modifier : the `prompt` property is a plain text.
*   `.withTemplate(...)`: the `prompt` property is a template.
*   `.withScript(...)`: the `prompt` property is a script
*   `.withFunction(...)`: the `prompt` property is a Javascript function.

#### The `.loads...` Family for External Content:
These modifiers create a component designed to load its prompt or script from an external source via a `loader`.

A loader, provided in the configuration objects, can be any of the built-in loaders - like FileSystemLoader (for Node.js), WebLoader (for browsers), or your own custom implementation.

*   `.loadsText(...)`: Loads the `prompt` and treats it as plain text.
*   `.loadsTemplate(...)`: Loads the `prompt` and treats it as a template.
*   `.loadsScript(...)`: Loads the `prompt` and treats it as a script.

#### The `.asTool` Modifier: Instantly Create LLM-Callable Tools
Turn non-streaming components into a powerful, model-driven tool by appending the `.asTool` modifier. This upgrades your component into a hybrid object: it remains a callable function for you to use directly in your code, while also becoming a fully-formed tool that an LLM can understand and decide to call.

To make this happen, just add two properties to your configuration:
*   `description`: A clear, natural language explanation of what the tool does. This is the LLM's guide.
*   `inputSchema`: A Zod schema defining the arguments the tool accepts, ensuring type-safe inputs from the model.

This modifier can be chained with any content loader, allowing you to create sophisticated tools from templates or scripts: `create.TextGenerator.withTemplate.asTool(...)`.

Here's a quick overview of the primary components you'll use:
*   [**`create.Config`**](#configuration-management): Not a component, but a factory for creating reusable configuration objects.
*   [**`create.Template`**](#template): **For presentation-layer generation.** Processes a Cascada template to produce a final string output.
*   [**`create.Script`**](#script): **For data-layer orchestration.** Executes a Cascada script.
*   [**`create.Function`**](#function): **For wrapping standard JS logic.** Creates a callable function from an `execute` method, which can be exposed as a tool to an LLM.
*   [**`create.TextGenerator` / `create.TextStreamer`**](#textgenerator): **For LLM-based text generation.** Generates or streams unstructured text.
*   [**`create.ObjectGenerator` / `create.ObjectStreamer`**](#objectgenerator): **For structured data from an LLM.** Generates or streams structured JSON objects.

### Callable Interface:

Every component can be invoked in two ways: with its built-in prompt if such was specified at creation time or with one-off inputs (prompt and/or context) provided with the call arguments.
```typescript
// Created with a templating modifier
const dynamicComponent = create.TextGenerator.withTemplate({
    model: openai('gpt-4o'),
    prompt: 'Hello {{ name }}',
    context: { name: 'World' }
});

// 1. Using configured pre-compiled prompt and context
const result = await dynamicComponent();
console.log(result.text); // "Hello World"

// 2. With a one-off prompt and context
// The one-off prompt is also processed as a template (since it was created as a template component)
const result2 = await dynamicComponent('Hi {{ user }}', { user: 'Alice' });
console.log(result2.text); // "Hi Alice"
```

Template and script prompts defined at creation are pre-compiled for efficiency, while prompts provided at runtime (one-off prompts) are compiled each time they are used, offering flexibility for dynamic scenarios.

## The `prompt` Property: Your Universal Input

In Cascador-AI, the `prompt` property is the versatile heart of every LLM component. Its behavior is determined by the factory method you use to create the component. The modifier—like `.withTemplate` or `.withScript`—sets the "mode" for how the `prompt` content will be processed before being sent to the LLM.

Here is a complete guide to its different modes:

| Creation Method | `prompt` Property Content | Processing Behavior |
| :--- | :--- | :--- |
| `create.TextGenerator(...)` | A static `string` or `ModelMessage[]` array. | The content is sent **directly** to the Vercel AI SDK with no processing. The user's runtime input is appended as the final `user` message. |
| `create.TextGenerator.withTemplate(...)` | A `string` containing a Cascada **template**. | The template is **rendered** into a final `string`, which becomes the LLM prompt. It only renders text and thus cannot produce a `ModelMessage[]` array. |
| `create.TextGenerator.withScript(...)` | A `string` containing a Cascada **script**. | The script is **executed**. Its return value—which can be a `string` or a `ModelMessage[]` array—becomes the LLM prompt. |
| `create.TextGenerator.withFunction(...)` | A synchronous or asynchronous JavaScript **function**. | The function is **executed**. Its return value—which can be a `string` or a `ModelMessage[]` array—becomes the LLM prompt. |

By embracing this single-property pattern, you only need to remember one rule: **the factory modifier defines the `prompt`'s behavior.**

## Configuration Management

Cascador-AI allows you to define shared configuration through `Config` objects that can be inherited by other components:

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

// Create a component that inherits from base config
const component = create.TextGenerator.withTemplate({
  prompt: 'Translate to {{ language }}: {{ text }}'
}, baseConfig);

// The component inherits model, temperature, and context from baseConfig
```
### Property Inheritance Explained
Properties in *Cascador-AI* flow through a chain of configurations - starting from initial `Config` object (or multiple configs in a parent hierarchy), passing through parent renderers, and ending at the renderer you’re crafting. Each level can tweak or extend what came before, but the rules differ
A component's final configuration is determined by a chain of parents, with the child's properties taking ultimate precedence. Here is a breakdown of the merging strategies for different property types:

| Property Type | Properties | Merging Strategy |
| :--- | :--- | :--- |
| **Scalar Properties** | `model`, `prompt`, `template`, `script`, `temperature`, `maxTokens`, etc. | **Override**: The child's value completely replaces the parent's value. |
| **Object Properties** | `context`, `filters`, `options` | **Shallow Merge**: The objects are merged. If a key exists in both the child and parent, the child's value for that key is used. |
| **Loader Property** | `loader` | **Advanced Merging**: Child loaders are prepended to the parent's loader chain, and named `race()` groups are intelligently combined. |

#### Detailed Merging Strategies

1.  **Override (Scalar Properties)**
    This is the simplest strategy. For any non-object property like `prompt` or `model`, the value defined in the child component is used, and the parent's value is ignored.

2.  **Shallow Merge (Object Properties)**
    For properties like `context` and `filters`, the keys and values are combined.
    *   **`context`**: The child's `context` is merged on top of the parent's. Any properties unique to the parent are kept. If the same property key exists in both, the child's value wins.
    *   **`filters`** and **`options`**: These follow the same merging logic as `context`.

3.  **Advanced Merging (`loader`)**
    The `loader` property has a sophisticated merging strategy to provide maximum flexibility:
    *   **Default Behavior (Prepending)**: By default, a child's loaders are placed *before* the parent's loaders in the final chain. This ensures the child's resources are found first, with the parent's serving as a fallback.
    *   **Named `race()` Group Merging**: If both the parent and child define loaders within a `race()` group of the same name (e.g., `race(..., 'cdn')`), the loaders from both are combined into a single, larger race group. This allows a child to *add* to a parent's concurrent loading strategy rather than replacing it.
    *   **Deduplication**: Cascador-AI automatically removes duplicate loader instances from the final chain to ensure efficiency.

#### Example in Action

Here’s how these rules play out in practice:

```typescript
const rootConfig = create.Config({
  prompt: 'Root {{ var }}',
  context: { var: 'root', theme: 'dark' }, // Initial context
  filters: { uppercase: (s) => s.toUpperCase() }
});

const midConfig = create.Config({
  prompt: 'Mid {{ var }}', // Overrides root prompt
  context: { var: 'mid' }, // Overrides 'var', keeps 'theme' from root
  filters: { lowercase: (s) => s.toLowerCase() } // Merges with uppercase filter from root
}, rootConfig);
// Resulting context: { var: 'mid', theme: 'dark' }

const parentComponent = create.TextGenerator.withTemplate({
  prompt: 'Parent {{ var }}', // Overrides mid prompt
  context: { user: 'guest' }, // Adds 'user', keeps 'var' and 'theme' from mid
}, midConfig);
// Resulting context: { var: 'mid', theme: 'dark', user: 'guest' }

const childComponent = create.TextGenerator.withTemplate({
  prompt: 'Child {{ var }} {{ user }}', // Overrides parent prompt
}, parentComponent);
// Final context: { var: 'mid', theme: 'dark', user: 'guest' }

(async () => {
  console.log((await childComponent()).text); // "Child mid guest"
  // Final filters: { uppercase, lowercase }
})();
```

### Inspecting the Final Configuration
The rules for how properties are inherited and merged (e.g., context and filters merge, prompt overrides) are powerful but complex. To see the result of all inherited and merged properties, you can access the read-only `.config` property on any component instance. This is an invaluable tool for debugging complex configurations.
```typescript
console.log(childComponent.config);
// Outputs the fully resolved configuration object
```

## The Cascador Components

### Your Toolkit for Every Task

*Cascador-AI* offers a suite of components, each tailored to a specific job - whether it’s executing scripts, rendering templates, generating or streaming text and data. The LLM components (Generate/Stream Object/Text), built on the Vercel AI SDK, share a common foundation where each LLM component has a corresponding Vercel AI SDK Core function.

Let's explore each component in detail.

### Template

**What it does**: Processes a Cascada template to produce a final string output, with no LLMs involved. Ideal for presentation-layer tasks like generating HTML or Markdown. An optional `inputSchema` can be used to validate the `context` data.

#### How to Create It
*   **Providing the Template Directly**: This is the default behavior. The `template` property contains the template string.
    ```typescript
    import { create } from 'cascador-ai';

    const component = create.Template({
      template: 'Hi {{ name }}! Today is {{ currentDay }}.',
      context: { name: 'User' }
    });
    ```
*   **Loading from a resource with `.loadsTemplate`**: Use this modifier to load the template from an external source. This requires a `loader`, and the `template` property now specifies the *name* of the template to load (e.g., a filename).
    ```typescript
    import { create, FileSystemLoader } from 'cascador-ai';

    const fileComponent = create.Template.loadsTemplate({
      loader: new FileSystemLoader('./templates'),
      template: 'welcome_email.njk', // This is the filename
      context: { name: 'User' }
    });
    ```

#### How to Call It
You can call any `Template` with a new template and context.
*   **With pre-configured input**:
    ```typescript
    const result = await component({ currentDay: 'Monday' }); // "Hi User! Today is Monday."
    ```
*   **With a one-off template string**:
    ```typescript
    const oneOffResult = await component('A new template for {{ name }}', { name: 'Alice' }); // "A new template for Alice"
    ```
*   **With a one-off template file** (if created with `.loadsTemplate`):
    ```typescript
    const otherFileResult = await fileComponent('goodbye_email.njk'); // Loads and renders a different file
    ```
**Use it for**: Generating HTML, dynamic reports, email templates, or any task needing flexible, non-LLM rendering where the final output is a string.

#### Using as a Tool (`.asTool`)
You can expose a `Template` component as a tool for an LLM to call. This is useful when you want the LLM to be able to generate a formatted string based on structured input.
```typescript
const reportTool = create.Template.asTool({
  description: 'Generates a formatted user summary string.',
  inputSchema: z.object({ name: z.string(), activity: z.number() }),
  template: 'User Report: {{ name }} has an activity score of {{ activity }}.'
});
```

### Script

**What it does**: Executes a Cascada script to produce a structured data object (JSON). It is the ideal tool for orchestrating data sources, running multi-step logic, and building the data layer of your application. An optional Zod `schema` can be provided to validate the script's output, and an `inputSchema` can validate the `context`.

#### How to Create It
*   **Providing the Script Directly**: This is the default behavior. The `script` property contains the script string.
```typescript
import { create } from 'cascador-ai';
import { z } from 'zod';

const dealFinder = create.Script({
  // Validate the final output object
  schema: z.record(
    z.string(), // e.g., "sku-a123"
    z.array(z.object({ vendor: z.string(), price: z.number() }))
  ),
  // Validate the input context
  inputSchema: z.object({
    productIds: z.array(z.string()),
    vendors: z.array(z.string()),
    getPrice: z.function()
  }),
  context: {
    productIds: ['sku-a123', 'sku-b456'],
    vendors: ['VendorX', 'VendorY'],
    getPrice: async (productId, vendor) => ({
      vendor,
      price: Math.floor(Math.random() * 101) + 100,
    }),
  },
  script: `
    :data
    for productId in productIds
      for vendor in vendors
        var priceInfo = getPrice(productId, vendor)
        @data[productId].push(priceInfo)
      endfor
    endfor
  `,
});
```

*   **Loading from a resource with `.loadsScript`**: Use this modifier to load the script from an external source. This requires a `loader`, and the `script` property now specifies the *name* of the script to load.
    ```typescript
    const agentRunner = create.Script.loadsScript({
      loader: new FileSystemLoader('./scripts'),
      script: 'content_agent.csc', // The filename of the script
    });
    ```

#### How to Call It
You can execute a new script dynamically by passing it as an argument.
*   **With pre-configured input**:
    ```typescript
    const result = await dealFinder();
    ```
*   **With a one-off script string**:
    ```typescript
    const oneOffResult = await runner(`
      :data
      @data.id = "new-id"
    `); // { id: "new-id" }
    ```
*   **With a one-off script file** (if created with `.loadsScript`):
    ```typescript
    const otherAgentResult = await agentRunner('cleanup_agent.csc'); // Loads and runs a different script
    ```

#### Using as a Tool (`.asTool`)
Exposing a `Script` as a tool allows an LLM to trigger complex, multi-step data orchestration tasks.
```typescript
const userOnboardingTool = create.Script.asTool({
    description: 'Onboards a new user by creating a profile and sending a welcome email.',
    inputSchema: z.object({ name: z.string(), email: z.string() }),
    context: { /* db, emailService, ... */ },
    script: `
      :data
      var profile = db.createUser({ name: name, email: email })
      var emailStatus = emailService.sendWelcome(email)
      @data = { userId: profile.id, emailSent: emailStatus.success }
    `
});
```

**Use it for**: Building type-safe data layers, orchestrating multi-step agentic workflows, and fetching and aggregating data from multiple APIs/databases. For a deep dive into the scripting language, see the **[Cascada Script Documentation](script.md)**.

### TextGenerator

**What it does**: Generates text via LLMs using Vercel’s [`generateText` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text). It can operate on a single `prompt` or a full conversational `messages` history. The `prompt` for the LLM can be provided as static text, or generated dynamically via a template or a script. This component is ideal for use cases where you need the complete text before proceeding, such as summarizing a document or calling tools.

#### How to Create It
*   **Default (Plain Text)**: The `prompt` is a static string with no processing. You can also provide a `ModelMessage[]` array in the `prompt` property to define a multi-message prompt, which is possible only for text-only components, not as input to those created with `.withTemplate` or `.withScript`.
    ```typescript
    const staticGenerator = create.TextGenerator({ model: openai('gpt-4o'), prompt: 'Summarize the concept of photosynthesis.' });
    ```
*   **With a Template (`.withTemplate`)**: The `prompt` is a Cascada template string.
    ```typescript
    const templateGenerator = create.TextGenerator.withTemplate({ model: openai('gpt-4o'), prompt: 'Describe {{topic}} in a single paragraph.' });
    ```
*   **With a Script (`.withScript`)**: The `prompt` property contains a Cascada script. The script can return a `string` (which becomes the prompt) or a `ModelMessage[]` array (for a multi-message prompt).
    ```typescript
    const scriptGenerator = create.TextGenerator.withScript({
      model: openai('gpt-4o'),
      prompt: `
        :data
        @data = "Summarize the key points from: " + article
      `
    });
    ```
*   **Loading from a resource (`.loads...`)**: Load the `prompt` from a file or other resource using a loader. The input can be treated as plain text (`.loadsText`), a template (`.loadsTemplate`), or a script (`.loadsScript`).
    ```typescript
    const loadedGenerator = create.TextGenerator.loadsTemplate({ loader, model: openai('gpt-4o'), prompt: 'summarize_article.njk' });
    ```

#### How to Call It
You can call a `TextGenerator` with a new `prompt`, `messages` array, `context` object, or a combination. The call returns a promise that resolves when the model has finished generating its response.

```typescript
const { text, toolCalls } = await templateGenerator({ topic: 'The Sun' });
```

#### Using as a Tool (`.asTool`)
Wrap a `TextGenerator` to create a tool that generates text based on structured input.
```typescript
const summarizeTool = create.TextGenerator.withTemplate.asTool({
  model: openai('gpt-4o-mini'),
  description: 'Summarizes a given piece of text into a single sentence.',
  inputSchema: z.object({ text: z.string() }),
  prompt: 'Provide a concise, one-sentence summary of: {{ text }}',
});
```

#### Return Value
When you `await` a `TextGenerator` call, it returns a promise that resolves to a rich result object, identical to the one from the Vercel AI SDK's [`generateText`](https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#generatetext) function. Key properties include:
*   **`text`**: The generated text as a string.
*   **`toolCalls`**: An array of tool calls the model decided to make.
*   **`toolResults`**: An array of results from the executed tools.
*   **`finishReason`**: The reason the model stopped generating (e.g., `'stop'`, `'tool-calls'`).
*   **`usage`**: Token usage information for the generation.
*   **`response`**: The raw response object, which contains:
    *   **`messages`**: An array of the new messages from the current turn (the user prompt message and the assistant's reply).
    *   **`messageHistory`**: The complete, updated message history, ready to be passed to the next conversational turn. It excludes static messages from the component's configuration.

***

### TextStreamer

**What it does**: Streams LLM text in real time using Vercel’s [`streamText` function](https://sdk.vercel.ai/docs/ai-sdk-core/stream-text). It shares the same creation patterns and message handling capabilities as `TextGenerator`, making it ideal for interactive applications like chatbots.

> **Note**: Streaming components like `TextStreamer` cannot be exposed as tools to an LLM, as the tool-use protocol requires a single, resolved response, not a stream.

#### How to Create It
`TextStreamer` is created with the same flexible modifiers as `TextGenerator`, allowing you to provide the prompt as static text, a `ModelMessage[]` array, or generate it dynamically from a template or script.

*   **Default (Plain Text)**:
    ```typescript
    const staticStreamer = create.TextStreamer({ model: openai('gpt-4o'), prompt: 'Write a short story.' });
    ```
*   **With a Template (`.withTemplate`)**:
    ```typescript
    const templateStreamer = create.TextStreamer.withTemplate({
      model: openai('gpt-4o'),
      prompt: 'Write a short story about a robot named {{ name }}.'
    });
    ```
*   **With a Script (`.withScript`)**: The script (provided in the `prompt` property) can return a prompt string or a full `ModelMessage[]` array.
    ```typescript
    const scriptStreamer = create.TextStreamer.withScript({
      model: openai('gpt-4o'),
      prompt: `
        :data
        @data = "Write a story based on this premise: " + premise
      `
    });
    ```
*   **Loading from a resource (`.loads...`)**: Load the `prompt` from a file. It can be treated as plain text (`.loadsText`), a template (`.loadsTemplate`), or a script (`.loadsScript`).
    ```typescript
    const loadedStreamer = create.TextStreamer.loadsTemplate({ loader, model: openai('gpt-4o'), prompt: 'story_prompt.njk' });
    ```

#### How to Call It
Calling a `TextStreamer` returns a result object **immediately**, without waiting for the model to respond. This object contains the stream and promises that will resolve when the stream is complete.

```typescript
// The call returns instantly
const result = await templateStreamer({ name: 'Zorp' });

// You can then consume the stream
for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

#### Return Value and Handling the Stream
The result object from a `TextStreamer` call is multifaceted, providing both streams for real-time consumption and promises for final data. It is identical to the one returned by the Vercel AI SDK's [`streamText`](https://sdk.vercel.ai/docs/ai-sdk-core/streaming-text#streamtext) function.

**Real-time Streams:**
*   **`textStream`**: A `ReadableStream` and `AsyncIterable` of text chunks. This is the primary stream for displaying generated text to a user in real time.
*   **`fullStream`**: A more advanced stream that provides all event types, including text deltas, tool calls, and lifecycle events (`'start'`, `'finish'`).

**Promises for Final Data:**
The result object also contains several promises that resolve **after** the stream has finished.
*   **`text`**: A promise that resolves to the full generated text string.
*   **`toolCalls`**: A promise that resolves to an array of any tool calls made.
*   **`finishReason`**: A promise that resolves to the reason the model stopped generating.
*   **`usage`**: A promise that resolves to the final token usage.
*   **`response`**: A promise that resolves to the raw response object, which contains:
    *   **`messages`**: An array of the new messages from the current turn (the user prompt message and the assistant's reply).
    *   **`messageHistory`**: The complete, updated message history, ready to be passed to the next conversational turn. It excludes static messages from the component's configuration.

**Callbacks for Fine-Grained Control:**
You can provide callbacks in the component's configuration to handle events as they happen.
*   **`onFinish`**: Called when the stream is complete, containing the final `text`, `usage`, and `response` (with `messages` and `messageHistory`).
*   **`onError`**: Called if an error occurs during streaming.
*   **`onChunk`**: Called for each individual chunk processed in the stream.

***

### ObjectGenerator
**What it does**: Produces structured data with Vercel’s [`generateObject` function](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-object), validated by a Zod schema. It follows the same creation and calling patterns as `TextGenerator`.

#### How to Create It
Like `TextGenerator`, it can operate on a single `prompt` or be given a conversational history via the `messages` property, making it useful for extracting structured data from a dialogue.

*   **Default (Plain Text)**: The `prompt` is a static string with no processing.
    ```typescript
    const staticObjGenerator = create.ObjectGenerator({ model: openai('gpt-4o'), schema: z.object({ ... }), prompt: 'Extract user data.' });
    ```
*   **With a Template (`.withTemplate`)**: The `prompt` is a Cascada template string.
    ```typescript
    import { z } from 'zod';

    const profileGenerator = create.ObjectGenerator.withTemplate({
      model: openai('gpt-4o'),
      schema: z.object({ name: z.string(), role: z.string() }),
      prompt: 'Generate a character profile for a {{ role }}.'
    });
    ```
*   **With a Script (`.withScript`)**: The `prompt` property contains a Cascada script whose output generates the prompt.
    ```typescript
    const scriptObjGenerator = create.ObjectGenerator.withScript({
      model: openai('gpt-4o'),
      schema: z.object({ ... }),
      prompt: `
        :data
        @data = "Extract key entities from: " + text
      `
    });
    ```
*   **Loading from a resource (`.loads...`)**: Load the `prompt` from a file. It can be treated as plain text (`.loadsText`), a template (`.loadsTemplate`), or a script (`.loadsScript`).
    ```typescript
    const loadedObjGenerator = create.ObjectGenerator.loadsTemplate({ loader, model: openai('gpt-4o'), schema: z.object({ ... }), prompt: 'extraction_prompt.njk' });
    ```

**Output Strategies:**
The `output` property in the configuration determines how the generated data is structured:
- **`object`** (default): Generates a single object matching the provided `schema`.
- **`array`**: Generates an array of objects, each matching the `schema`.
- **`enum`**: Generates a value from a provided list of enums. Requires an `enum` array in the configuration.
- **`no-schema`**: Generates data without a schema, useful for flexible outputs. Omit the `schema` property.

Additionally, you can provide `schemaName` and `schemaDescription` for better model guidance with some providers.

#### How to Call It
*   **With pre-configured input**:
    ```typescript
    const { object: profile } = await profileGenerator({ role: 'wizard' });
    ```
*   **With a one-off template**: The new input is processed as a template.
    ```typescript
    const { object: profile2 } = await profileGenerator('Create a profile for a {{ role }} named {{ name }}', { role: 'knight', name: 'Galahad' });
    ```

#### Using as a Tool (`.asTool`)
Create a tool that returns structured, validated JSON.
```typescript
const extractorTool = create.ObjectGenerator.withTemplate.asTool({
  model: openai('gpt-4o'),
  description: 'Extracts user name and email from text.',
  inputSchema: z.object({ text: z.string() }),
  schema: z.object({ name: z.string(), email: z.string().email() }),
  prompt: 'Extract the name and email from this text: {{ text }}',
});
```

#### Return Value
When you `await` an `ObjectGenerator` call, it returns a promise that resolves to a result object from the Vercel AI SDK's [`generateObject`](https://sdk.vercel.ai/docs/ai-sdk-core/generating-objects#generateobject) function. Key properties include:
*   **`object`**: The generated and validated JSON object.
*   **`usage`**: Token usage information.
*   **`finishReason`**: The reason the model stopped generating.

**Important Note**: Unlike `TextGenerator`, the return value for `ObjectGenerator` **does not** include `messages` or `messageHistory`. While you can provide a `messages` history to give the model context for its generation, its purpose is to produce a final, structured data object, not to continue a conversation.

**Use it for**: Data extraction, structured responses, or enum-based classification. [See Vercel docs on object generation](https://sdk.vercel.ai/docs/ai-sdk-core/generating-objects#generateobject) for return details.

### ObjectStreamer
**What it does**: Streams structured data incrementally via Vercel’s [`streamObject` function](https://sdk.vercel.ai/docs/ai-sdk-core/stream-object). It follows the same creation and calling patterns as `TextGenerator`.

> **Note**: Streaming components like `ObjectStreamer` cannot be exposed as tools to an LLM, as the tool-use protocol requires a single, resolved response, not a stream.

#### How to Create It
Like `TextStreamer`, it can operate on a single `prompt` or be given a conversational history via the `messages` property, allowing for context-aware data streaming.

*   **Default (Plain Text)**: The `prompt` is a static string with no processing.
    ```typescript
    const staticObjStreamer = create.ObjectStreamer({ model: openai('gpt-4o'), schema: z.object({ ... }), prompt: 'Generate a list of users.' });
    ```
*   **With a Template (`.withTemplate`)**: The `prompt` is a Cascada template string.
    ```typescript
    const characterStreamer = create.ObjectStreamer.withTemplate({
      model: openai('gpt-4o'),
      schema: z.object({ name: z.string(), description: z.string() }),
      output: 'array',
      prompt: 'Generate 3 characters from the {{ genre }} genre.'
    });
    ```
*   **With a Script (`.withScript`)**: The `prompt` property contains a Cascada script whose output generates the prompt.
    ```typescript
    const scriptObjStreamer = create.ObjectStreamer.withScript({
      model: openai('gpt-4o'),
      schema: z.object({ ... }),
      prompt: `
        :data
        @data = "Generate characters based on: " + theme
      `
    });
    ```
*   **Loading from a resource (`.loads...`)**: Load the `prompt` from a file. It can be treated as plain text (`.loadsText`), a template (`.loadsTemplate`), or a script (`.loadsScript`).
    ```typescript
    const loadedObjStreamer = create.ObjectStreamer.loadsTemplate({ loader, model: openai('gpt-4o'), schema: z.object({ ... }), prompt: 'character_generation.njk' });
    ```

**Output Strategies:**
The `output` property in the configuration determines the structure of the streamed data:
- **`object`** (default): Streams a single object. Use `partialObjectStream` to access incremental updates of the object.
- **`array`**: Streams an array of objects. Use `elementStream` to access each element as it’s generated.
- **`no-schema`**: Streams text data. Use `textStream` to access the streamed text.

The `enum` strategy is not supported for streaming.

#### How to Call It
*   **With pre-configured input**:
    ```typescript
    const { elementStream } = await characterStreamer({ genre: 'fantasy' });
    ```
*   **With a one-off template**: The new input is processed as a template.
    ```typescript
    const { elementStream: stream2 } = await characterStreamer('Generate 2 characters from {{ genre }}', { genre: 'sci-fi' });
    ```

#### Return Value and Handling the Stream
The result object from an `ObjectStreamer` call is returned **immediately** and contains streams for real-time consumption and promises for final data, mirroring the Vercel AI SDK's [`streamObject`](https://sdk.vercel.ai/docs/ai-sdk-core/streaming-objects#streamobject) function.

**Real-time Streams:**
*   **`partialObjectStream`**: A stream of partial updates to the object being generated (for `output: 'object'`).
*   **`elementStream`**: A stream that yields each complete element of an array as it's generated (for `output: 'array'`).
*   **`textStream`**: A stream of text chunks (for `output: 'no-schema'`).

**Promises for Final Data:**
The result object also contains promises that resolve **after** the stream has finished.
*   **`object`**: A promise that resolves to the full, validated JavaScript object.
*   **`finishReason`**: A promise that resolves to the reason the model stopped generating.
*   **`usage`**: A promise that resolves to the final token usage.

**Important Note**: Unlike `TextStreamer`, the final resolved values from an `ObjectStreamer` **do not** include `messages` or `messageHistory`. The focus is on delivering the structured data, not managing conversational state.

**Use it for**: Live dashboards, incremental JSON builds, or array streaming. [See Vercel docs on object streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming-objects#streamobject) for streaming specifics.

### Function
**What it does**: Wraps a standard JavaScript function into a callable component, allowing for input and output validation. This is the primary way to integrate custom, non-LLM logic into your workflows and expose it as a **Vercel AI SDK-compatible tool**.

You can define the function's logic in two ways:

1.  **As a Standard Callable Function**: The default `create.Function` returns a simple async function. This is useful for encapsulating logic to be used within the `context` of other components.

    ```typescript
    const toUpperCase = create.Function({
        inputSchema: z.object({ text: z.string() }),
        schema: z.string(), // Validate the output is a string
        execute: async ({ text }) => text.toUpperCase()
    });
    // Can now be used in another component's context:
    // context: { toUpperCase }
    ```

2.  **As a Tool (`.asTool`)**: The `.asTool` modifier formats the function into a standardized tool object that can be provided to an LLM.

    ```typescript
    const getTimeTool = create.Function.asTool({
        description: 'Gets the current time for a specific timezone.',
        inputSchema: z.object({ timezone: z.string() }),
        execute: async ({ timezone }) => ({
          time: new Date().toLocaleTimeString('en-US', { timeZone: timezone })
        })
    });
    ```

## Using Components as Tools
A powerful feature of Cascador-AI is the ability to expose almost any component as a tool that an LLM can decide to call. This allows the model to trigger complex, multi-step, or even other LLM-driven actions to fulfill a user's request.

**How it Works:**
You can convert a component into a tool by appending the `.asTool` modifier to its factory call. This pattern applies to `TextGenerator`, `ObjectGenerator`, `Template`, `Script`, and `Function` components.

When using `.asTool`, you must provide two additional properties in the configuration:
-   **`description`**: A string explaining what the tool does. The LLM uses this to decide when to call the tool.
-   **`inputSchema`**: A Zod schema defining the arguments the tool accepts. This property is mandatory for tools.

**Key Limitation:**
Streaming components (`TextStreamer` and `ObjectStreamer`) **cannot** be used as tools. The Vercel AI SDK's tool-use protocol requires a single, resolved response (a `Promise`), not a real-time stream.

**Accessing Tool Call Context:**
When a tool is created from a template or script-based component, a special `_toolCallOptions` object is automatically injected into its `context`, providing metadata like the `toolCallId` and the `messages` history that triggered the call.

The `_toolCallOptions` object contains:
- **`toolCallId`**: `string` - The unique ID for this specific tool call. Useful for logging or streaming updates.
- **`messages`**: `ModelMessage[]` - The message history sent to the LLM that triggered this tool call. Does not include the system prompt or the assistant's response.
- **`abortSignal`**: `AbortSignal` (optional) - A signal to gracefully cancel the operation if the overall request is aborted.

You can use this context within your tool's template or script to add logging or change its behavior.
```typescript
const loggingSummarizer = create.TextGenerator.withTemplate.asTool({
  model: openai('gpt-4o-mini'),
  description: 'Summarizes text and logs the call ID.',
  inputSchema: z.object({ text: z.string() }),
  prompt: `
    SYSTEM LOG: Starting summarization for tool call ID {{ _toolCallOptions.toolCallId }}.
    TASK: Provide a concise, one-sentence summary of: {{ text }}
  `,
});

// To use the tool, provide it to an LLM component:
const agent = create.TextGenerator({
  model: openai('gpt-4o'),
  tools: { summarize: loggingSummarizer },
  prompt: "Please summarize this for me: 'Cascador-AI is an AI orchestration library...'",
});

// The LLM will decide whether to call the tool to fulfill the request
(async () => {
    const chatResult = await agent();
    console.log('Model-Driven Result:', chatResult.toolCalls);
})();
```
**Use it for**: Creating modular, reusable, and type-safe functions that empower an autonomous agent to decide which actions to take.

## Template and Script Properties

For components created with `.withTemplate`, `.withScript`, or their `.loads...` variants, you can use a powerful set of properties to inject data, transform outputs, and manage dependencies. These properties are **only available** on components that use Cascada processing.

### prompt
The same 'prompt' property that by default has the text-only prompt is now the heart of your component - the template or script that gets processed. Set it in the configuration object when creating the component.

### context
Provides data and methods that can be accessed within templates and scripts. Both the data and method returns can be asynchronous (promises are automatically handled), keeping your logic clean and powerful.  Here’s what you can add to the `context` object:
- **Static Values**: Simple strings, numbers, or objects (e.g., `'London'`, `42`, `{ key: 'value' }`).
- **Synchronous Functions**: Basic logic or transformations (e.g., `(x) => x.toUpperCase()`).
- **Asynchronous Functions**: API calls, database queries, or file reads (e.g., `async () => await fetch(...)`).
- **Other Components**: Nest components for chained operations (e.g., a `TextGenerator` to translate text).
- **Custom Integrations**: Anything callable - think service clients or utility libraries.

Example:
```typescript
const component = create.TextGenerator.withTemplate({
  prompt: 'Weather in {{ city }}: {{ getWeather(city) }} - {{ (translator({ text: "Updated" })).text }}',
  context: {
    city: 'London', // Static value
    getWeather: async (city) => (await fetch(`https://api.weather.com/${city}`)).json(), // Async function
    translator: create.TextGenerator.withTemplate({ // Nested component
      model: openai('gpt-4o'),
      prompt: 'Translate to Spanish: {{ text }}'
    })
  }
});
```

### filters
Transform data on the fly with custom functions, sync or async, using the `|` operator:
```typescript
import { create } from 'cascador-ai';
import translate from 'translate';

const component = create.Template({
  filters: {
    translate: async (text, lang) => await translate(text, lang)
  },
  template: `
    Original: {{ text }}
    Spanish: {{ text | translate('es') }}
  `
});

(async () => {
  console.log(await component({ text: 'Hello world' }));
})();
```

### loader
Provides a loader that retrieves templates or scripts by name from an external source, like the filesystem or a database. Loaders are essential when using modifiers like `.loadsTemplate` or `.loadsScript`, and they also power compositional features within your scripts and templates, such as `import`, `include`, and `extend`.

```typescript
import { create, FileSystemLoader } from 'cascador-ai';

// Use the built-in FileSystemLoader to load from a local directory
const component = create.Template.loadsTemplate({
  loader: new FileSystemLoader('./templates'),
  template: 'main.njk', // The filename to load
});
```

*Cascador-AI* offers several loading options:

*   **Built-in Loaders**:
    *   **`FileSystemLoader`**: (Node.js only) Loads files from the local filesystem.
    *   **`WebLoader`**: (Browser only) Loads files over HTTP from a given base URL.
    *   **`PrecompiledLoader`**: Loads assets from a precompiled JavaScript object for optimal performance.

Of course. Here is the updated **Custom Loaders** section with more detailed explanations for `isRelative`, `resolve`, and a mention of the event system, all while keeping the style concise and developer-focused.

*   **Custom Loaders**: You can create a custom loader by providing either a simple asynchronous function or a more structured class. If a loader can't find an asset, it should return `null` to allow fallback to the next loader in the chain.

    **Example: Functional Loader**
    A loader can be a simple function. For more control, it can return a `LoaderSource` object (`{ src, path, noCache }`) to provide metadata for caching and error reporting.
    ```typescript
    // A custom loader that fetches templates from a network.
    const networkLoader = async (name: string) => {
      const response = await fetch(`https://my-cdn.com/templates/${name}`);
      if (!response.ok) return null;
      const src = await response.text();
      // Return a LoaderSource for better debugging and caching control
      return { src, path: name, noCache: false };
    };
    ```

    **Example: Class-based Loader**
    For advanced features like relative paths (`import`, `include`) and event-driven caching, use a class. A loader class has one required method and several optional ones for advanced functionality:

    | Method | Description | Required? |
    |---|---|:---:|
    | `load(name)` | The core method. Loads an asset by name and returns its content (as a string or `LoaderSource` object), or `null` if not found. Can be async. | **Yes** |
    | `isRelative(name)` | Returns `true` if a filename is relative (e.g., `./component.script`). This tells the engine that the path needs to be resolved. | No |
    | `resolve(from, to)`| Resolves a relative path (`to`) based on the path of a parent script (`from`). This is crucial for making features like `include "./child.csc"` work correctly. | No |
    | `on(event, handler)` | Listens for environment events (`'load'`, `'update'`). Useful for advanced, event-driven cache invalidation strategies. | No |

    Here is a class-based loader that supports relative paths:
    ```typescript
    class DatabaseLoader {
      constructor(private db: MyDatabaseClient) { }

      // The required 'load' method can be synchronous or asynchronous
      async load(name: string) {
        const scriptRecord = await this.db.scripts.findByName(name);
        return scriptRecord
          ? { src: scriptRecord.sourceCode, path: name, noCache: false }
          : null;
      }

      // Optional method to identify relative paths
      isRelative(filename: string): boolean {
        return filename.startsWith('./') || filename.startsWith('../');
      }

      // Optional method to resolve relative paths
      resolve(from: string, to: string): string {
        // A real implementation would use a robust path-joining library.
        // This is a simplified example.
        const fromDir = from.substring(0, from.lastIndexOf('/'));
        return `${fromDir}/${to}`;
      }
    }
    ```

*   **Declarative Loader Concurrency with `race()`**:

By default, child loaders are placed before parent loaders to create a sequential fallback chain. The `race()` function provides a more efficient alternative by running multiple loaders concurrently. Its key advantage is speed: the entire group resolves as soon as any loader finds the resource, without waiting for slower loaders (like a network request) to time out or fail. This makes `race()` beneficial even if only one loader in the group is expected to succeed, as it eliminates unnecessary delays from the others.

When you give `race()` a name (e.g., `race(..., 'cdn')`), you create a **named race group**. All loaders in groups with the same name across parent and child configurations are automatically merged into a single, combined race. This allows a child to add loaders to a parent's concurrent loading strategy instead of simply prepending to it.

```typescript
import { create, race, WebLoader, FileSystemLoader } from 'cascador-ai';

// Parent config defines a named race group for CDN loaders.
const parentConfig = create.Config({
  loader: race([
    new WebLoader('https://cdn.example.com/prompts/')
  ], 'cdn')
});

// Child generator ADDS a local loader to the 'cdn' race group.
const generator = create.TextGenerator({
  loader: race([
    new FileSystemLoader('./local_prompts/')
  ], 'cdn')
}, parentConfig);

// Result: The final generator has one loader that runs the WebLoader
// and FileSystemLoader in parallel, using the first successful result.
```

### options
Fine-tune the Cascada engine with extras like `autoescape` or `trimBlocks`:
```typescript
const component = create.Template({
  options: {
    autoescape: false,
    trimBlocks: true
  },
  template: '...'
});
```
See [Nunjucks docs](https://mozilla.github.io/nunjucks/api.html#configure) for more.

## Vercel AI Properties

*Cascador-AI* components inherit a robust set of properties from the [Vercel AI SDK](https://sdk.vercel.ai/), enabling fine-tuned control over language model behavior. These properties are available across all LLM component types and can be set in a base `Config` object, during component creation, or, where applicable overridden in runtime calls.

### model
**Purpose**: Specifies the language model to use for generation.
**Type**: Provider-specific model object (required).
**Details**: Must be supplied via a provider helper (e.g., `openai()`, `anthropic()`). Mandatory in component or `Config`.

### temperature
**Purpose**: Adjusts the randomness of the model's output.
**Type**: `number` (0 to 1, default: 0.7).

### maxTokens
**Purpose**: Limits the number of tokens generated to manage size and cost.
**Type**: `number` (optional).

### topP
**Purpose**: Controls diversity via nucleus sampling. Limits tokens to the top probability mass; an alternative to `temperature` for finer diversity control.
**Type**: `number` (0 to 1, default: 1).

### presencePenalty
**Purpose**: Discourages repetition of tokens already in the output. Positive values reduce reuse; negative encourage it.
**Type**: `number` (-2.0 to 2.0, default: 0).

### frequencyPenalty
**Purpose**: Reduces repetition based on token frequency. Higher values penalize frequent tokens; negative promote them.
**Type**: `number` (-2.0 to 2.0, default: 0).

### stop
**Purpose**: Halts generation at specified sequences.
**Type**: `string[]` (optional).
**Details**: Stops before generating the sequence; useful for structured outputs.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';

const component = create.TextGenerator({
  model: openai('gpt-4o'),
  stop: ['###', '\n\n'], // Stops at triple hash or double newline
  prompt: 'List 3 facts about space:\n1.'
});

(async () => {
  const { text } = await component();
  console.log(text); // Stops early if "###" or "\n\n" appears
})();
```

### tools
**Purpose**: Enables the model to call external functions *based on its own reasoning*.
**Details**: Supported by `TextGenerator` and `TextStreamer`. This is for model-driven tool use. For better organization, you can populate this with tools created by `create.Function.asTool`.
**Example**:
```typescript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import { z } from 'zod';

// Define a tool using create.Function.asTool
const getWeatherTool = create.Function.asTool({
  description: 'Gets the weather for a city.',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ temperature: Math.floor(Math.random() * 30) })
});

// Pass the tool to the LLM
const weatherAgent = create.TextGenerator({
  model: openai('gpt-4o'),
  tools: { getWeather: getWeatherTool },
  prompt: 'What’s the weather like in San Francisco?',
});

(async () => {
  // The LLM will see the prompt and decide to call getWeather.
  const { text, toolCalls } = await weatherAgent();
  console.log(text); // May contain the weather or be empty if a tool was called.
  console.log(toolCalls); // Will show the call to getWeather.
})();
```

### maxSteps
**Purpose**: Limits the number of model-driven tool-calling steps in a single turn. Works with the `tools` property in `TextGenerator` and `TextStreamer`.
**Type**: `number` (default: 1, optional).

## Using Components in Templates and Scripts

Components in *Cascador-AI* can be embedded within scripts or templates by adding them to the `context` object, enabling seamless task chaining and orchestration. This approach leverages the engine’s power to coordinate multiple components, execute them when their inputs are ready, and process their outputs dynamically.

### Example with `Script` for Data Orchestration

Use `Script` when your goal is to build a structured data object by orchestrating multiple steps.

```typescript
// ... (characterGenerator, storyGenerator, critiqueGenerator setup from previous examples) ...

// Orchestrating script
const mainOrchestrator = create.Script({
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
});

(async () => {
  const result = await mainOrchestrator();
  console.log(JSON.stringify(result, null, 2));
})();
```

### Example with `Template` for Presentation

Use `Template` when your primary goal is to generate a final string output, like an HTML page or a formatted report.

```typescript
// ... (characterGenerator, storyComponent, critiqueStreamer setup from previous examples) ...

// Orchestrating component for presentation
const mainComponent = create.Template({
  context: {
    characterGenerator,
    storyComponent,
    critiqueStreamer,
    topic: 'a lost astronaut'
  },
  template: `
    {% set character = (characterGenerator({ topic })).object %}
    Character: {{ character | json }}

    {% set storyContent = (storyComponent({ character, topic })).text %}
    Story: {{ storyContent }}

    Live Critique: {% set stream = (critiqueStreamer({ story: storyContent })).textStream %}
      {% for chunk in stream %}{{ chunk }}{% endfor %}
  `
});

(async () => {
  const result = await mainComponent();
  console.log(result); // Outputs a single formatted string
})();
```

### Key Points
- **Parallel Execution**: The critique stream runs after the story, which depends on the character, optimizing the dependency chain.
- **Result Handling**: Access `.object` for structured data, `.text` for stories, and `.textStream` for live critiques.
- **Dynamic Inputs**: Pass outputs (e.g., `character`) to subsequent components for cohesive workflows.
- **Versatility**: Combine different component types - like `ObjectGenerator`, `TextGenerator`, and `TextStreamer` - to handle varied tasks in one workflow.

## Conversational AI: Managing Message History

For building multi-turn chatbots and conversational agents, *Cascador-AI* provides robust message handling capabilities, specifically for the `TextGenerator` and `TextStreamer` components.

### The `messages` Property: Static vs. Dynamic History

The `messages` property plays a dual role depending on where you define it:

1.  **Static Configuration Messages**: When you set `messages` during component creation, it acts as a static "base layer" for every conversation. This is the ideal place for a `system` prompt, as it will be applied to every call without being part of the mutable chat history.

    ```typescript
    // The system message is part of the static configuration
    const chatAgent = create.TextStreamer({
      model: openai('gpt-4o'),
      messages: [{ role: 'system', content: 'You are a helpful assistant.' }]
    });
    ```

2.  **Dynamic History (Call Argument)**: When you pass a `messages` array as an argument during a call, it represents the dynamic, turn-by-turn history of the conversation.

### The Conversational Calling Pattern

To continue a conversation, you pass the history as an argument. The `prompt` string will be automatically added as the latest user message.

```typescript
// The 'chatHistory' array contains previous user/assistant turns
await chatAgent(newUserInput, chatHistory);
```

### Understanding the Response: `messages` vs. `messageHistory`

To make chat loops easy, the response object from `TextGenerator` and `TextStreamer` separates the turn's new messages from the full, ready-to-use history.

*   **`response.messages`**: The *delta* for the current turn. This includes the message generated from the input `prompt` and the `assistant`'s reply.
*   **`response.messageHistory`**: The *complete* dynamic history (input messages + delta), **excluding** any static messages from the component's configuration. This is the state you use for the next API call.

| Property                  | Purpose                               | What it Contains                                                         | Primary Use Case                                |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| `config.messages`         | Static Base Layer                     | System prompts, fixed instructions.                                      | Defining the agent's core personality/behavior. |
| `messages` (argument)     | Dynamic Input History                 | The `messageHistory` from the previous turn.                             | Continuing a conversation.                      |
| `response.messages`       | Delta of the Current Turn             | The new prompt message + the LLM's reply message.                        | Logging or displaying the latest exchange.      |
| `response.messageHistory` | Dynamic Output History (Next State)   | The input `messages` argument + `response.messages`. **Excludes config.** | Storing and feeding into the next API call.     |

### Advanced Message Composition
You can achieve more complex message structures using these advanced patterns:

**1. `prompt` as `ModelMessage[]`**
For text-only components (those not created with `.withTemplate` or `.withScript`), you can provide an array of messages directly in the `prompt` property at configuration time. This is useful for defining few-shot examples or complex initial prompts. The user's input at runtime will be appended as the final `user` message.
```typescript
const fewShotAgent = create.TextGenerator({
  model: openai('gpt-4o'),
  prompt: [
    { role: 'user', content: 'Translate "hello" to French.' },
    { role: 'assistant', content: 'Bonjour' },
    // The final prompt will be appended here as a user message
  ]
});
```

**2. Script Returning `ModelMessage[]`**
For components created with `.withScript`, the script can return a `ModelMessage[]` array instead of a string. These messages will be **appended** to the history before the final call to the LLM. This allows for dynamic construction of few-shot examples based on context.
```typescript
const dynamicFewShotAgent = create.TextGenerator.withScript({
    model: openai('gpt-4o'),
    context: {
        getExamples: async (topic) => ([ // Fetch examples from a DB
            { role: 'user', content: `Example question about ${topic}` },
            { role: 'assistant', content: `Example answer about ${topic}` }
        ])
    },
    prompt: `
        :data
        // The script's output is an array of messages
        @data = getExamples(topic)
    `
});
```
When called, the messages from `getExamples` will be added to the conversation before the user's prompt.

### Example: Building a Conversational Chatbot

Putting it all together, here's how you can build a complete, interactive chat loop using a `TextStreamer`.

```javascript
import { openai } from '@ai-sdk/openai';
import { create } from 'cascador-ai';
import { read, write } from 'promise-streams-and-pipes';

async function getUserInput(promptText) {
  await write(process.stdout, promptText);
  return (await read(process.stdin)).toString().trim();
}

// 1. Configure the agent with a static system prompt
const chatAgent = create.TextStreamer({
  model: openai('gpt-4o'),
  messages: [{
    role: 'system',
    content: 'You are a friendly chatbot. Keep answers concise.'
  }]
});

// 2. Initialize the dynamic history
let dynamicHistory = [];

// 3. Main chat loop
(async () => {
  while (true) {
    const userInput = await getUserInput('You: ');
    if (!userInput) {
      console.log('Chat ended.');
      break;
    }

    // 4. Call the agent with the user's prompt and the current dynamic history
    const result = await chatAgent(userInput, dynamicHistory);

    process.stdout.write('Bot: ');
    // Stream the response in real-time
    for await (const textPart of result.textStream) {
      process.stdout.write(textPart);
    }
    process.stdout.write('\n');

    // 5. Once the stream is finished, update the history for the next turn
    const { response } = result;
    dynamicHistory = (await response).messageHistory;
  }
})().catch(console.error);
```

## Choosing Your Orchestration Strategy: Scripts, Templates, Context Methods, and Tools

In *Cascador-AI*, you have several powerful mechanisms to build workflows. Choosing the right one depends on your goal and who is in control: are you building a structured data object, or are you rendering a final text document, as well as who should be in control: the developer or the AI model.

### `Script` & `Template`: For Data and Presentation Layers
-   **`Script`**: Use when the primary output is a structured data object (JSON). Ideal for data-layer logic, multi-step agents, and orchestrating various data sources. It is the backbone of your application's data layer.

**Use When:**
-   **The output is data:** Your main goal is to create a complex object or array to be used by your application.
-   **Complex logic is needed:** You need loops (`for`, `while`), conditionals (`if/else`), and variables to manage state across multiple async steps.
-   **Orchestrating multiple sources:** You are fetching data from several APIs, databases, and other components and need to combine them into a single, coherent object.
-   **Readability is key for complex flows:** The top-to-bottom, `await`-free syntax makes complex data dependencies easy to follow.

-   **`Template`**: Use when the primary output is a rendered string (for instance an HTML or a Markdown). Ideal for the presentation layer.

**Use When:**
-   **The output is text:** You are generating a final, human-readable document.
-   **Logic is simple and presentation-focused:** The workflow involves embedding data into a string using `{{ variable }}` and simple conditionals or loops with `{% %}` tags.
-   **You are building UIs:** Generating HTML with included partials is a classic use case.

### Context Methods & Filters: The Building Blocks
These are the fundamental JS/TS functions you provide to *both* scripts and templates. They are the efficient, predictable actions that your orchestrator calls.

**Use When:**
-   **You need raw performance:** A plain local JavaScript/TypeScript function is always faster than an LLM call.
-   **The logic is deterministic:** You need to fetch data from a known API endpoint, query a database, or perform a specific data transformation.
-   **You want to expose utilities:** Provide helper functions (e.g., `formatDate`, `calculateTotal`) to your scripts and templates.

### `Tools`: For Developer-Defined Functionality
Using `.asTool` (on `create.Function`, `script`, `template` or LLM generator provides a clean, type-safe way to expose custom functionality to an LLM.

**Use When:**
-   **The workflow is unpredictable**: You can't know ahead of time what the user will ask. The LLM must infer intent and select the appropriate tool (e.g., `getWeather` vs. `sendEmail`).
-   **You are building a conversational agent**: The LLM can chain its own reasoning—calling a tool, getting a result, and using that result to decide its next step—all within a single, autonomous turn.

## Embedding Integration

*Cascador-AI* seamlessly integrates vector embeddings from the Vercel AI SDK. By adding embedding functions to the `context` object, you can use them directly in scripts for tasks like semantic search, similarity comparisons, or retrieval-augmented generation (RAG).

### Example
Here’s how to find the most similar document to a user query using a `Script` to orchestrate the embedding and comparison tasks in parallel.

```typescript
import { openai } from '@ai-sdk/openai';
import { embed, cosineSimilarity } from 'ai';
import { create } from 'cascador-ai';
import fs from 'fs/promises';

const documentFinder = create.Script({
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
  `
});

(async () => {
  const result = await documentFinder();
  // Sort the results in JS after the script has run
  const sortedDocs = result.docs.sort((a, b) => b.similarity - a.similarity);
  console.log(`Most similar document to "${result.userQuery}":`);
  console.log(sortedDocs[0]);
})();
```

## RAG Integration

*Cascador-AI*’s script-driven approach simplifies retrieval-augmented generation (RAG) workflows. By using `Script`, you can clearly define the steps of your RAG pipeline: searching an index, retrieving context, and generating a final answer. This leverages automatic concurrency for maximum efficiency.

### Example
**Summary**: This example loads 10 documents, builds a vector index with LlamaIndex, and uses a `Script` to orchestrate the retrieval of relevant snippets about machine learning for cancer detection and then summarizes them.

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

// Answer generator component
const answerGenerator = create.TextGenerator.withTemplate({
  model: openai('gpt-4o'),
  prompt: 'Summarize the latest advancements in machine learning for cancer detection based on: {{ context }}'
});

// RAG orchestrator using Script
const ragOrchestrator = create.Script({
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

## Input and Output Validation with Zod

Cascador-AI integrates with Zod to provide automatic, runtime validation for both the data you provide to components and the data they produce, ensuring type safety throughout your workflows.

### Ensuring Type-Safe Inputs with `inputSchema`

The `inputSchema` property validates the `context` data provided to a component before execution, catching errors early and ensuring your logic receives the correct data structure.

-   **Applies to**: Any component that uses a `context` object (`Template`, `Script`, `Function`, and LLM components created with `.withTemplate` or `.withScript`).
-   **Usage**: Define the expected input data for a component using a Zod schema.
-   **Requirement**: This property is **mandatory** when creating a tool with `.asTool`, as it defines the tool's arguments for the LLM.

```typescript
import { z } from 'zod';

const userProcessor = create.Script({
  inputSchema: z.object({
    userId: z.string(),
    db: z.object({
      getUser: z.function(),
    }),
  }),
  script: `
    :data
    @data = db.getUser(userId)
  `
});

// This will succeed
await userProcessor({ context: { userId: '123', db: { getUser: (id) => ({ id }) } } });

// This will throw a validation error at runtime
await userProcessor({ context: { user_id: '123' } });
```

### Ensuring Type-Safe Outputs with `schema`

The `schema` property validates the final output of a component, guaranteeing that the produced data conforms to a specific structure. This is crucial for building reliable, predictable data pipelines.

-   **Applies to**: Components that produce structured JSON data (`ObjectGenerator`, `ObjectStreamer`, `Script`, `Function`).
-   **Usage**: Provide a Zod schema in the configuration to validate the component's return value.
-   **Benefit**: This is the core of reliable structured data generation, ensuring the final object is always valid and strongly-typed.

```typescript
import { z } from 'zod';

// For ObjectGenerator, this schema guides the LLM and validates the output.
const userExtractor = create.ObjectGenerator({
  model: openai('gpt-4o'),
  schema: z.object({ name: z.string(), email: z.string().email() }),
  prompt: 'Extract user info from text...'
});

// For Script and Function, it validates the final return value of your logic.
const dataAggregator = create.Script({
  schema: z.object({ status: z.string(), count: z.number() }),
  script: `
    :data
    @data.status = "completed"
    @data.count = 100
  `
});

const { object } = await userExtractor(); // object is guaranteed to match the schema
const result = await dataAggregator(); // result is guaranteed to match the schema
```

## Type Checking

*Cascador-AI*’s TypeScript integration enforces strict configuration rules to catch errors at compile time, preventing runtime issues. Below are examples of common type violations and the required properties they enforce.

### Examples
```typescript
import { create } from 'cascador-ai';
import { openai } from '@ai-sdk/openai';

// Error: Missing required model
const noModelComponent = create.TextGenerator({
  prompt: 'Hello'
}); // Type error: 'model' must be provided

// Error: Missing loader for external template
const namedTemplate = create.TextGenerator.loadsTemplate({
  prompt: 'my-template'
}); // Type error: 'loader' required for .loadsTemplate

// Error: Mixing incompatible properties
const invalidComponent = create.TextGenerator({
  model: openai('gpt-4o'),
  filters: {} // Type error: Filters are only allowed on template/script components
});
```

### Enforced Rules
- **Model**: Must be set in component creation or a parent `Config`.
- **Loader**: Required for `.loadsTemplate`, `.loadsScript`, or `.loadsText`.
- **Template/Script Properties**: `context`, `filters`, `loader`, and `options` are only allowed on components created with a Cascada modifier (`.withTemplate`, `.withScript`, or `.loads...`).

This type safety ensures robust, predictable workflows with early error detection.

## Roadmap

*Cascador-AI* is evolving to enhance its capabilities and robustness. Here are the key features planned for future releases:

- **OpenTelemetry/MLflow integration**: MLflow's tracing, which captures your app's entire execution, including prompts, retrievals, tool calls.
- **Automated Prompt Optimization**: Go beyond manual prompt engineering with a built-in create.Optimizer. Inspired by frameworks like DSPy, this feature will allow you to attach an optimizer to any generator. It will use your existing Evaluator as a guide to programmatically test and evolve your prompts, automatically discovering the highest-performing version for your specific task. This creates a powerful feedback loop, using the same components that guard your production app to continuously improve its core logic with minimal effort.
- **Execution Replay and Debugging**: A planned Cascada feature - creating an advanced logging system, via a dedicated output handler, to capture the entire execution trace. This will allow developers to replay and inspect the sequence of operations and variable states for complex debugging, and will integrate seamlessly with the Evaluator's trace history.
- **Image Generation**: Add support for generating images from prompts using models like DALL-E.
- **Versioned Templates and Scripts**: Enable loading versioned prompts with a loader that wraps unversioned loaders for better template management. Choose different versions depending on the model or validate old and new prompts during tests.
- **Streaming Text/Data Output Support** - for Template and Script components, depends on the cascada-engine adding support for this.
- **Text/Data Output Snapshot Support**: Request the template engine to return a snapshot of the currently rendered data. Due to the non-sequential nature of the rendering - regular streaming is not always practical. Useful for previews.
- **Instructions on integrating memory**: Provide clear patterns and examples for integrating long-term memory.