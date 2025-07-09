import { config } from 'dotenv';
import { expect } from 'chai';

// Load environment variables from .env file
config();

// Global test utilities
export const testUtils = {
	// Helper to check if environment variables are loaded
	isEnvLoaded: (key: string): boolean => {
		return process.env[key] !== undefined;
	},

	// Helper to get environment variable with fallback
	getEnv: (key: string, fallback?: string): string => {
		return process.env[key] || fallback || '';
	}
};

// Example of how to use environment variables in tests
export const createTestConfig = () => {
	return {
		apiKey: process.env.API_KEY || 'test-api-key',
		openaiApiKey: process.env.OPENAI_API_KEY || 'test-openai-key',
		nodeEnv: process.env.NODE_ENV || 'test',
		logLevel: process.env.LOG_LEVEL || 'info'
	};
};

// Export chai expect for convenience
export { expect };