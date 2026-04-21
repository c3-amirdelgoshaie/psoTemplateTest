/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 *
 * API layer for the PSO natural-language Q&A agent.
 * Calls PsoAnalysisService.answerQuestion on the C3 backend.
 */

import { c3MemberAction } from '../c3Action';

export interface ChatHistoryEntry {
  question: string;
  answer: string;
}

/**
 * Call the C3 singleton service to answer a natural-language question
 * about the PSO data model.
 *
 * @param question     The user's current question.
 * @param chatHistory  Prior Q&A pairs for multi-turn context (client-trimmed).
 * @returns A markdown-formatted answer string.
 */
export const answerQuestion = async (
  question: string,
  chatHistory: ChatHistoryEntry[] = [],
): Promise<string> => {
  // Trim history before sending: last 5 pairs, answers ≤ 800 chars
  const MAX_PAIRS = 5;
  const MAX_ANSWER_LEN = 800;
  const trimmedHistory = chatHistory
    .slice(-MAX_PAIRS)
    .map((e) => ({ question: e.question, answer: e.answer.slice(0, MAX_ANSWER_LEN) }));

  const result = await c3MemberAction(
    'PsoAnalysisService', // C3 singleton type
    'answerQuestion',     // member action name
    {},                   // empty object = singleton (no instance id)
    [question, trimmedHistory],
  );

  if (typeof result === 'string') return result;
  if (result?.val && typeof result.val === 'string') return result.val;
  return JSON.stringify(result ?? 'No response received.');
};
