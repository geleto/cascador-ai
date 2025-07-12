import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
export const model = anthropic('claude-3-haiku-latest');