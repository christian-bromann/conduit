import { createAgent } from 'langchain';

export const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5',
});
