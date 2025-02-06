import yorubot from '@/core/yoruBot';
import yoruSchedule from '@/core/yoruSchedule';
import Axios from 'axios';

import BilibiliNewSharedJob from '@/tasks/bilibili';
import getBiliDynamic from '@/service/bilibili/dynamic';
import { printError } from '@/utils/print';
import { getAiReply } from '@/service/ai';
import FormData from 'form-data';
import { getAscii2dResult } from '@/service/searchImg/ascii2d';
//import './axiosProxy.ts';

const TEST_URL = 'https://c2cpicdw.qpic.cn/offpic_new/515302066//515302066-1715713257-5A2067B6C9174C9AEC89160AF032B73E/0?term=3';
const TEST_URL2 = 'https://c2cpicdw.qpic.cn/offpic_new/515302066//515302066-1088592798-570ED8ADE33A25F95D8FF4480E46A3F7/0?term=255'

getAiReply(123, '今天吃什么？').then((res) => console.log(res))