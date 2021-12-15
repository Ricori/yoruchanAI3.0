import { RequestFirendEventData, PrivateMessageEventData } from './event';

export type RequestFirendListenerFc = (data: RequestFirendEventData) => Promise<void>;

export type PrivateMessageListenerFc = (data: PrivateMessageEventData) => Promise<boolean>;
