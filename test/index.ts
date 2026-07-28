import nnkbot from '@/core/nnkBot';
import nnkSchedule from '@/core/nnkSchedule';
import Axios from 'axios';
import { botConfig } from '@/core/nnkConfig';
import { matchAlias } from '@/modules/aiReply/history/nameMatch';
import { ingestOnStartup } from '@/modules/aiReply/memory/ingest';


// console.log(await createMsgFromTweetId('2024011099478122755'));
// getCachedLatestTweets(['Cho_KaguyaHime']).then((res) => console.log(res));

// console.log(aliasIndex.resolve(301750074, '空诚是谁'))

// console.log(matchAlias('空诚是谁', '空诚slience'))

ingestOnStartup();