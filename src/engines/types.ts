export interface AccentResult {
  results: string[];
  scores: number[];
  lowConfidence: boolean;
}

export interface WorkerRequest {
  type: 'ADD_ACCENTS';
  id: string;
  payload: { text: string; k: number };
}

export interface WorkerResultResponse {
  type: 'RESULT';
  id: string;
  payload: { results: string[]; scores: number[]; lowConfidence: boolean };
}

export interface WorkerErrorResponse {
  type: 'ERROR';
  id: string;
  payload: { message: string };
}

export type WorkerResponse = WorkerResultResponse | WorkerErrorResponse;

export type SyllableMap = Record<string, string[]>;
export type UnigramMap = Record<string, number>;
export type BigramMap = Record<string, Record<string, number>>;
