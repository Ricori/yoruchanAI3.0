import yorubot from '@/core/yoruBot';
import yoruSchedule from '@/core/yoruSchedule';
import Axios from 'axios';

import BilibiliNewSharedJob from '@/tasks/bilibili';
import getBiliDynamic from '@/service/bilibili/dynamic';
import { printError } from '@/utils/print';
import { getAiReply } from '@/service/ai';
import { getAscii2dResult } from '@/service/searchImg/ascii2d';
import { createScreenshot } from '@/service/twitter/screenshot';
import { getTweetPost } from '@/service/twitter/tweet';
import { createMsgFromTweetId } from '@/tasks/twitter';
//import './axiosProxy.ts';

// getAiReply(123, '今天吃什么？').then((res) => console.log(res))

// console.log(await createMsgFromTweetId('1994385602788389216'));