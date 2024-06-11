import 'dotenv/config.js';

export class EnvironmentVariableConfigurationManager {
  async getRequired(variableName: string): Promise<string> {
    const value = process.env[variableName];
    if (!value) {
      throw new Error(`Required environment variable ${variableName} is not set`);
    }

    return value;
  }

  async getOptional(variableName: string): Promise<string | undefined> {
    return process.env[variableName] || undefined;
  }

  async getOptionalWithDefault(variableName: string, def: string): Promise<string> {
    return process.env[variableName] || def;
  }
}
