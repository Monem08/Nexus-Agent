// ── The agent loop (Phase 2 — the "brain") ───────────────────
// Connects the model to the tools:
//   think → maybe call tools → run them on the VPS → feed results back →
//   think again → … → final answer.
// Emits structured events via onEvent so the phone can show live activity.

import { agentTurn } from '../providers/index.js';
import { TOOL_SPECS, execTool, MUTATING, previewAction } from './tools.js';
import { requestApproval } from './approvals.js';
import { audit, info } from '../logger.js';

const AGENT_SYSTEM = `You are Nexus, a coding agent working inside a project workspace on the user's own server.

You have tools: list_files, read_file, search_code (look around), and write_file, run_command (make changes). Changes require the user's approval — they'll see each write or command and approve or reject it, so proceed naturally and don't ask for permission in text; the system handles that.

How to work:
- Gather facts with the read tools before changing anything. Read a file before you overwrite it, and write back the COMPLETE new content.
- Take small steps and explain briefly what you're about to do.
- If the user rejects an action, adapt or stop — don't try to force it through.
- When the task is done, stop calling tools and give a short, clear summary of what you changed.`;

// Run one agent task. onEvent receives:
//   {type:'thinking', text}          — model's reasoning/among-steps text
//   {type:'tool', name, input}       — a tool the agent decided to run
//   {type:'tool_result', name, preview} — short preview of the tool output
//   {type:'final', text}             — the finished answer
//   {type:'error', message}          — something went wrong
export async function runAgent({ task, model, providerId, onEvent, signal, autoApprove = false, maxSteps = 12 }) {
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
      const isCmd = tc.name === 'run_command';
      if (!isCmd) onEvent({ type: 'tool', name: tc.name, input: tc.input || {} });
      info(`agent tool: ${tc.name}(${JSON.stringify(tc.input || {})})`);

      // Mutating tools pause for the user's approval unless auto-approve is on.
      if (MUTATING.has(tc.name) && !autoApprove) {
        let preview;
        try {
          preview = await previewAction(tc.name, tc.input || {});
        } catch (e) {
          preview = { kind: 'text', title: tc.name, body: e.message };
        }
        const apId = `ap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        onEvent({ type: 'approval', id: apId, name: tc.name, input: tc.input || {}, preview });
        const approved = await requestApproval(apId, { signal });
        onEvent({ type: 'approval_result', id: apId, approved });
        if (!approved) {
          results.push({ id: tc.id, name: tc.name, content: 'The user REJECTED this action. Do not retry it; adapt or stop.' });
          continue;
        }
      }

      const out = await execTool(tc.name, tc.input);
      if (isCmd) {
        onEvent({ type: 'command', cmd: tc.input?.cmd || '', output: out.length <= 8192 ? out : out.slice(0, 8192) + '\n…(truncated)' });
      } else {
        onEvent({ type: 'tool_result', name: tc.name, preview: out.slice(0, 240) });
      }
      results.push({ id: tc.id, name: tc.name, content: out });

      // A successful write → surface the file in the chat with copy/download.
      if (tc.name === 'write_file' && !/^(Error|Blocked)\b/.test(out)) {
        const content = typeof tc.input?.content === 'string' ? tc.input.content : '';
        onEvent({
          type: 'artifact',
          path: tc.input?.path || 'file',
          bytes: Buffer.byteLength(content),
          // cap what we ship back; huge files are still on disk / in the explorer
          content: content.length <= 256 * 1024 ? content : '',
          truncated: content.length > 256 * 1024,
        });
      }
    }

    history.push({ role: 'tool_results', results });
  }

  onEvent({ type: 'final', text: '(stopped: reached the step limit before finishing)' });
  audit('agent_limit', { maxSteps });
}
