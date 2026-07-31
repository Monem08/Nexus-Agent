// ── The agent loop (Phase 2 — the "brain") ───────────────────
// Connects the model to the tools:
//   think → maybe call tools → run them on the VPS → feed results back →
//   think again → … → final answer.
// Emits structured events via onEvent so the phone can show live activity.

import { agentTurn } from '../providers/index.js';
import { TOOL_SPECS, execTool } from './tools.js';
import { audit, info } from '../logger.js';

const AGENT_SYSTEM = `You are Nexus, a coding agent working inside a project workspace on the user's own server.

You have tools to look around the project: list_files, read_file, and search_code. This version is READ-ONLY — you can inspect the project but cannot yet change files or run commands, so never claim you edited anything or ran a command.

How to work:
- Use the tools to gather the facts you need before answering. Prefer looking things up over guessing.
- Take small steps: list or search to find the right file, then read it.
- When you have enough to answer the user's request, stop calling tools and give a clear, concise final answer in plain language. Reference file paths you actually saw.
- If something can't be done in read-only mode, say so plainly.`;

// Run one agent task. onEvent receives:
//   {type:'thinking', text}          — model's reasoning/among-steps text
//   {type:'tool', name, input}       — a tool the agent decided to run
//   {type:'tool_result', name, preview} — short preview of the tool output
//   {type:'final', text}             — the finished answer
//   {type:'error', message}          — something went wrong
export async function runAgent({ task, model, providerId, onEvent, signal, maxSteps = 8 }) {
  const history = [{ role: 'user', content: task }];
  audit('agent_start', { task: String(task).slice(0, 200) });

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) return;

    const { text, toolCalls, stop } = await agentTurn({
      providerId,
      model,
      system: AGENT_SYSTEM,
      neutralMessages: history,
      tools: TOOL_SPECS,
      signal,
    });

    // Finished: no more tools requested.
    if (stop || toolCalls.length === 0) {
      onEvent({ type: 'final', text: text || '(the agent finished without a written answer)' });
      audit('agent_done', { steps: step });
      return;
    }

    if (text) onEvent({ type: 'thinking', text });

    // Record the assistant's turn (required for tool-result linkage).
    history.push({ role: 'assistant', text, toolCalls });

    // Execute each requested tool and collect results.
    const results = [];
    for (const tc of toolCalls) {
      if (signal?.aborted) return;
      onEvent({ type: 'tool', name: tc.name, input: tc.input || {} });
      info(`agent tool: ${tc.name}(${JSON.stringify(tc.input || {})})`);
      const out = await execTool(tc.name, tc.input);
      onEvent({ type: 'tool_result', name: tc.name, preview: out.slice(0, 240) });
      results.push({ id: tc.id, name: tc.name, content: out });
    }

    history.push({ role: 'tool_results', results });
  }

  onEvent({ type: 'final', text: '(stopped: reached the step limit before finishing)' });
  audit('agent_limit', { maxSteps });
}
