import { RequestFirendEventData, PrivateMessageEventData, GroupMessageEventData } from './event';

export type RequestFirendListenerFc = (data: RequestFirendEventData) => Promise<void>;

export type PrivateMessageListenerFc = (data: PrivateMessageEventData) => Promise<boolean>;

export type GroupMessageListenerFc = (data: GroupMessageEventData) => Promise<boolean>;
