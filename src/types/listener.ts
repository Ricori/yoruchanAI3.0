import { RequestFirendEventData, PrivateMessageEventData } from './event';

export type RequestFirendListenerFc = (data: RequestFirendEventData) => void;

export type PrivateMessageListenerFc = (data: PrivateMessageEventData) => boolean;
