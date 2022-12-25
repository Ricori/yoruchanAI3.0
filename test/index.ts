import YBot from '../src/core/YBot';
import YTime from '../src/core/YTime';
import Axios from 'axios';
import searchImage from '../src/modules/searchImg';
import saucenaoSearch from '../src/modules/searchImg/saucenao';
import whatAnimeSearch from '../src/modules/searchImg/whatanime';
import nhentaiSearch from '../src/modules/searchImg/nhentai';
import BilibiliNewSharedJob from '../src/tasks/bilibili';
import getBiliDynamic from '../src/service/biliDynamic';
import ascii2dSearch from '../src/modules/searchImg/ascii2d';
import { printError } from '../src/utils/print';
import { getOpenAiReply } from '../src/modules/openai';
//import './axiosProxy.ts';


const TEST_URL = 'https://c2cpicdw.qpic.cn/offpic_new/515302066//515302066-1715713257-5A2067B6C9174C9AEC89160AF032B73E/0?term=3';
const TEST_URL2 = 'https://c2cpicdw.qpic.cn/offpic_new/515302066//515302066-1088592798-570ED8ADE33A25F95D8FF4480E46A3F7/0?term=255'


async function searchImageTest() {
  const res = await searchImage(
    [
      TEST_URL
    ]
  )
  console.log(res)
}

async function saucenaoSearchTest() {
  const res = await saucenaoSearch(TEST_URL)
  console.log(res)
}

async function whatAnimeSearchTest() {
  const res = await whatAnimeSearch(TEST_URL)
  //const res = await getSearchResult(TEST_URL)
  console.log(res)
}

async function nhentaiSearchText() {
  const res = await nhentaiSearch('[みにおん] 敏感☆ろりトリス')
  console.log(res)
}


//saucenaoSearchTest();
//whatAnimeSearchTest()
//nhentaiSearchText()
//searchImageTest();

/*
const ybot = YBot.getInstance();
const ytime = YTime.getInstance();
ytime.initJobList([
  BilibiliNewSharedJob
]);
*/

// getBiliDynamic(4549624);
// nhentaiSearchText()
//searchImageTest();
//ascii2dSearch(TEST_URL);

getOpenAiReply('今天吃什么？').then((res) => console.log(res))