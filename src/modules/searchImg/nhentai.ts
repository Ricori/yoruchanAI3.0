const NanaAPI = require('nana-api');

const nana = new NanaAPI();

const exts = {
  j: 'jpg',
  p: 'png',
  g: 'gif',
} as Record<string, string>;

/**
 * nhentai搜索，暂不启用
 */
export default async function nhentaiSearch(details: Record<string, any>) {
  const name = details.jp_name;

  return {
    success: false,
    msg: '',
  };

  /*
  try {
    const res = await nana.search(`${name} chinese`);
    console.log(res)
  } catch (error) {
    console.error(error)
  }

  let json = await Axios.get(getSearchURL(`${name} chinese`)).then(r => r.data);
  if (json.result.length === 0) {
    json = await Axios.get(getSearchURL(name)).then(r => r.data);
  }
  if (json.result.length === 0) {
    console.error(new Date().toLocaleString() + ' [Nhentai Error]API ERROR');
    return {
      success: false,
      msg: ''
    }
  }

  const result = json.result[0];
  const thumbnail = `https://t.nhentai.net/galleries/${result.media_id}/cover.${exts[result.images.thumbnail.t]
    }`;
  const url = `https://nhentai.net/g/${result.id}/`;
  console.log(result)
  const msg = MessageCode.share(url, `[${details.similarity}%] ${details.jp_name}`, details.origURL, thumbnail);
  return {
    success: true,
    msg
  }
  */
}
