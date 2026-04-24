import type { WeComApiClient } from '../../api';
import type { AiBackend } from '../../ai/adapter';
import type { BotConfig } from '../../config';
import type { Logger } from '../../types';
import { ScheduleStore } from '../schedule-store';
import {
  type ParsedDocumentCommand,
  parseDocumentCommand,
  handleDocumentCommand,
} from './document';
import {
  type ParsedScheduleCommand,
  parseScheduleCommand,
  handleScheduleCommand,
} from './schedule';

export type { ParsedDocumentCommand, ParsedScheduleCommand };
export { parseDocumentCommand, handleDocumentCommand, parseScheduleCommand, handleScheduleCommand };

export type ParsedCommand = ParsedDocumentCommand | ParsedScheduleCommand;

export function parseCommand(content: string): ParsedCommand | null {
  const doc = parseDocumentCommand(content);
  if (doc) return doc;
  return parseScheduleCommand(content);
}

export async function handleCommand(
  command: ParsedCommand,
  apiClient: WeComApiClient,
  adapter: AiBackend,
  contactType: 'internal' | 'external',
  userid: string,
  scheduleStore: ScheduleStore,
  config: Pick<BotConfig, 'maxInputTokens'>,
  logger: Logger,
): Promise<string> {
  if (command.type === 'document') {
    return handleDocumentCommand(command.arg, apiClient, adapter, contactType, config, logger);
  }
  return handleScheduleCommand(command, apiClient, adapter, userid, scheduleStore, config, logger);
}
