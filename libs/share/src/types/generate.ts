/** Shape of requestBodyMap values — each value is a JS expression referencing body.* */
interface RequestBodyMapEntry {
  [outputKey: string]: string;
}

/** Dot-notation paths used to extract fields from an async task API response */
interface TaskResponseMap {
  /** e.g. "data.task_id" */
  taskIdPath: string;
  /** e.g. "data.status" */
  statusPath: string;
  /** sentinel value that means the task is done, e.g. "completed" */
  doneValue: string;
  /** e.g. "data.result_urls" */
  resultPath: string;
}

// export class MasterModelTypeDto {
//   id: number;
//   modelType: string;
//   type: string;
//   description: string;
//   isDefault: boolean;
//   modelDetails: any;
//   createdAt: Date;
//   updatedAt: Date;
//   /** key → JS expression template for building API request body from input body */
//   requestBodyMap?: RequestBodyMapEntry | null;
//   /** URL to poll for async task status; null means sendApi is synchronous */
//   taskPollApi?: string | null;
//   /** polling interval in seconds (default 10) */
//   taskPollSec?: number;
//   /** paths for extracting taskId/status/result from API responses */
//   taskResponseMap?: TaskResponseMap | null;
//   sendConfig?: {
//     type: string;
//     authorization?: string;
//   };
// }
export class MasterModelTypeDto {
  id: number;
  name: string;
  modelType: string;
  type: string;
  description: string;
  isDefault: boolean;
  modelDetails: any;
  createdAt: Date;
  updatedAt: Date;
  optionCode: string[];
  sendApi: string;
  sendConfig: any;
  requestBodyMap: any;
  taskPollApi: string;
  taskPollSec: number;
  taskResponseMap: any;
}
