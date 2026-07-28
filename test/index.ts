import nnkbot from '@/core/nnkBot';
import nnkSchedule from '@/core/nnkSchedule';
import Axios from 'axios';

import { printError } from '@/utils/print';
import { createScreenshot } from '@/service/twitter/screenshot';
import { getCachedLatestTweets, getTweetPost } from '@/service/twitter/tweet';
import { createMsgFromTweetId } from '@/service/twitter/message';
import getMessageCode, { extractCQCodes } from '@/utils/msgCode';
import { startTransfer } from '@/modules/group/ykhr/transfer';
import aliasIndex from '@/modules/aiReply/history/aliasIndex';
import { matchAlias } from '@/modules/aiReply/history/nameMatch';


// console.log(await createMsgFromTweetId('2024011099478122755'));
// getCachedLatestTweets(['Cho_KaguyaHime']).then((res) => console.log(res));

// console.log(aliasIndex.resolve(301750074, '空诚是谁'))

console.log(matchAlias('空诚是谁', '空诚slience'))