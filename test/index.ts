import yorubot from '@/core/yoruBot';
import yoruSchedule from '@/core/yoruSchedule';
import Axios from 'axios';

import BilibiliNewSharedJob from '@/tasks/bilibili';
import getBiliDynamic from '@/service/bilibili/dynamic';
import { printError } from '@/utils/print';
import { getAiReply } from '@/service/ai';
import FormData from 'form-data';
import { getAscii2dResult } from '@/service/searchImg/ascii2d';
import getLatestTweet from '@/service/twitter/tweet';
//import './axiosProxy.ts';

// getAiReply(123, '今天吃什么？').then((res) => console.log(res))

// getLatestTweet('kilacco', '');