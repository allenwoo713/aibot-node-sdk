import type { EventEmitter } from 'eventemitter3';
import type {
  BaseMessage,
  TextMessage,
  ImageMessage,
  MixedMessage,
  VoiceMessage,
  FileMessage,
  VideoMessage,
  EventMessage,
  EnterChatEvent,
  TemplateCardEventData,
  FeedbackEventData,
  DisconnectedEventData,
  EventMessageWith,
} from './event';
import type { WsFrame } from './api';

export interface TransportEventMap {
  message: (data: WsFrame<BaseMessage>) => void;
  'message.text': (data: WsFrame<TextMessage>) => void;
  'message.image': (data: WsFrame<ImageMessage>) => void;
  'message.mixed': (data: WsFrame<MixedMessage>) => void;
  'message.voice': (data: WsFrame<VoiceMessage>) => void;
  'message.file': (data: WsFrame<FileMessage>) => void;
  'message.video': (data: WsFrame<VideoMessage>) => void;
  event: (data: WsFrame<EventMessage>) => void;
  'event.enter_chat': (data: WsFrame<EventMessageWith<EnterChatEvent>>) => void;
  'event.template_card_event': (data: WsFrame<EventMessageWith<TemplateCardEventData>>) => void;
  'event.feedback_event': (data: WsFrame<EventMessageWith<FeedbackEventData>>) => void;
  'event.disconnected_event': (data: WsFrame<EventMessageWith<DisconnectedEventData>>) => void;
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
}

export interface Transport extends EventEmitter<TransportEventMap> {
  connect(): void;
  stop(): void;
  sendText(replyTo: WsFrame, text: string): Promise<void>;
  sendStream(replyTo: WsFrame, streamId: string, text: string, finish: boolean): Promise<void>;
  isConnected(): boolean;
}

export interface CallbackPayload {
  signature: string;
  timestamp: string;
  nonce: string;
  body: string;
}

export interface CallbackResponse {
  status: number;
  body: string;
}
