import { RequestFirendEventData } from "./event";

export interface AdaptorRequestParams extends Record<string, unknown> {
  readonly data: RequestFirendEventData;
  finish: boolean;
}


type FlowFunction<P> = (param: P) => P;