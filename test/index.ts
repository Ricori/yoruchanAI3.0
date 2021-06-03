import searchImage from '../src/modules/searchImg';
import saucenaoSearch from '../src/modules/searchImg/saucenao';
import whatAnimeSearch from '../src/modules/searchImg/whatanime';

const TEST_URL = 'https://ss2.bdstatic.com/70cFvnSh_Q1YnxGkpoWK1HF6hhy/it/u=2144640686,322131534&fm=11&gp=0.jpg';
const TEST_URL2 = 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fb-ssl.duitang.com%2Fuploads%2Fitem%2F201812%2F16%2F20181216125653_LnjdK.png&refer=http%3A%2F%2Fb-ssl.duitang.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=jpeg?sec=1625305871&t=303abe607ecd9dbef1f95d930239b919'

async function searchImageTest() {
  const res = await searchImage(
    [
      TEST_URL2
    ]
  )
  console.log(res)
}

async function saucenaoSearchTest() {
  const res = await saucenaoSearch(TEST_URL2)
  console.log(res)
}

async function whatAnimeSearchTest() {
  const res = await whatAnimeSearch(TEST_URL)
  //const res = await getSearchResult(TEST_URL)
  console.log(res)
}

saucenaoSearchTest();
//whatAnimeSearchTest()
searchImageTest();