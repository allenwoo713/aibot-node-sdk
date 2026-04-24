/**
 * WeCom Open Platform API type definitions
 */

/** In-memory and file cache structure for access_token */
export interface TokenCache {
  access_token: string;
  expires_at: number; // absolute timestamp in ms
}

/** Response from GET /gettoken endpoint */
export interface GetTokenResponse {
  errcode: number;
  errmsg: string;
  access_token?: string;
  expires_in?: number;
}

/** Generic WeCom API error envelope */
export interface WeComApiError {
  errcode: number;
  errmsg: string;
}

/** Response from POST /doc/get_doc_content endpoint */
export interface GetDocContentResponse {
  errcode: number;
  errmsg: string;
  /** Task ID for polling; present on every response */
  task_id?: string;
  /** true when document content is ready */
  task_done?: boolean;
  /** Document content in Markdown format (only when task_done is true) */
  content?: string;
}

/** Schedule attendee */
export interface ScheduleAttendee {
  userid: string;
}

/** Schedule data for create/get operations */
export interface ScheduleData {
  organizer: string;
  start_time: number;
  end_time: number;
  attendees?: ScheduleAttendee[];
  summary: string;
  description?: string;
  is_remind?: number;
  remind_before_event_secs?: number;
  location?: string;
  cal_id?: string;
}

/** Request body for POST /oa/schedule/add */
export interface CreateScheduleRequest {
  schedule: ScheduleData;
}

/** Response from POST /oa/schedule/add */
export interface CreateScheduleResponse extends WeComApiError {
  schedule_id?: string;
}

/** Request body for POST /oa/schedule/get */
export interface GetScheduleRequest {
  schedule_id: string;
}

/** Response from POST /oa/schedule/get */
export interface GetScheduleResponse extends WeComApiError {
  schedule?: ScheduleData & { schedule_id: string };
}
