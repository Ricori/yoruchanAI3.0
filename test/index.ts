import yorubot from '@/core/yoruBot';
import yoruSchedule from '@/core/yoruSchedule';
import Axios from 'axios';

import BilibiliNewSharedJob from '@/tasks/bilibili';
import getBiliDynamic from '@/service/bilibili/dynamic';
import { printError } from '@/utils/print';
import { getAiReply, translateText } from '@/service/ai';
import { getAscii2dResult } from '@/service/searchImg/ascii2d';
import { createScreenshot } from '@/service/twitter/screenshot';
import { getLatestTweet, getTweetPost } from '@/service/twitter/tweet';
import { createMsgFromTweetId } from '@/tasks/twitter';
import getMessageCode, { extractCQCodes } from '@/utils/msgCode';
import { startTransfer } from '@/modules/group/ykhr/transfer';

// getAiReply(123, '今天吃什么？').then((res) => console.log(res))

// console.log(await createMsgFromTweetId('2024011099478122755'));

// getLatestTweet('Cho_KaguyaHime').then((res) => console.log(res));

