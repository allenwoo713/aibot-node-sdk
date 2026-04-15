import type { CallbackPayload, CallbackResponse, Transport } from '../types/transport';
import type { WsFrame, Logger } from '../types';
import { WsCmd } from '../types';
import { WecomCrypto } from '../wecom-crypto';
import { MessageHandler } from '../message-handler';
import { generateReqId } from '../utils';
import { DefaultLogger } from '../logger';

const seenMsgIds = new Map<string, number>();

function isDuplicate(msgid: string): boolean {
  const now = Date.now();
  if (seenMsgIds.has(msgid)) {
    return true;
  }
  seenMsgIds.set(msgid, now);
  for (const [id, ts] of seenMsgIds) {
    if (now - ts > 5 * 60 * 1000) {
      seenMsgIds.delete(id);
    }
  }
  return false;
}

function extractEncrypt(body: string): string | null {
  try {
    const json = JSON.parse(body);
    if (json.Encrypt) return json.Encrypt;
  } catch {}
  const match = body.match(/<Encrypt>([^\u003c]+)<\/Encrypt>/);
  if (match) return match[1];
  return null;
}

function normalizeCallbackToFrame(decryptedPayload: any): WsFrame {
  return {
    cmd: decryptedPayload.msgtype === 'event' ? WsCmd.EVENT_CALLBACK : WsCmd.CALLBACK,
    headers: { req_id: generateReqId('http_callback') },
    body: decryptedPayload,
  };
}

export async function handleCallback(
  payload: CallbackPayload,
  crypto: WecomCrypto,
  emitter: Transport,
  logger: Logger = new DefaultLogger('HttpCallback'),
): Promise<CallbackResponse> {
  const encrypt = extractEncrypt(payload.body);
  if (!encrypt) {
    logger.warn('Callback body missing Encrypt field');
    return { status: 400, body: 'Bad Request' };
  }

  if (!crypto.verifySignature(payload.signature, payload.timestamp, payload.nonce, encrypt)) {
    logger.warn('Callback signature verification failed');
    return { status: 403, body: 'Forbidden' };
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(payload.timestamp, 10);
  if (Math.abs(now - ts) > 300) {
    logger.warn('Callback timestamp stale');
    return { status: 403, body: 'Forbidden' };
  }

  let decrypted: string;
  try {
    decrypted = crypto.decrypt(encrypt);
  } catch (err: any) {
    logger.error('Callback decryption failed:', err.message);
    return { status: 403, body: 'Forbidden' };
  }

  let inner: any;
  try {
    inner = JSON.parse(decrypted);
  } catch (err: any) {
    logger.error('Callback inner JSON parse failed:', err.message);
    return { status: 400, body: 'Bad Request' };
  }

  const msgid = inner?.msgid as string | undefined;
  if (msgid && isDuplicate(msgid)) {
    logger.debug(`Duplicate callback dropped: ${msgid}`);
    return { status: 200, body: 'success' };
  }

  const frame = normalizeCallbackToFrame(inner);
  const messageHandler = new MessageHandler(logger);
  messageHandler.handleFrame(frame, emitter as any);

  return { status: 200, body: 'success' };
}
