import { RequestFirendEventData, PrivateMessageData, GroupMessageData } from './event';

export type RequestFirendListenerFc = (data: RequestFirendEventData) => Promise<void>;

export type PrivateMessageListenerFc = (data: PrivateMessageData) => Promise<boolean>;

export type GroupMessageListenerFc = (data: GroupMessageData) => Promise<boolean>;
