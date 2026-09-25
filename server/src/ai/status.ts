/** Operational messages only: never include prompts, API keys, or raw errors. */
let reporter: (message: string) => void = () => {};
export function setAiReporter(report: (message: string) => void): void { reporter = report; }
export function reportAi(message: string): void { try { reporter(`AI: ${message}`); } catch { console.warn('Could not deliver AI status notice.'); } }
