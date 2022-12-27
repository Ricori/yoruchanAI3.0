import { Configuration, OpenAIApi } from 'openai';
import { yoruConfig } from '../../../config';

const configuration = new Configuration({
  apiKey: yoruConfig.openAi.apiKey,
});

const openai = new OpenAIApi(configuration);

export async function getOpenAiReply(prompt: string) {
  const response = await openai.createCompletion({
    model: 'text-davinci-003',
    prompt,
    temperature: 0.6, // 每次返回的答案的相似度0-1（0：每次都一样，1：每次都不一样）
    max_tokens: 3000, // 最多4096
    top_p: 1,
    frequency_penalty: 0.0,
    presence_penalty: 0.6,
    // stop: [' Human:', ' AI:'],
  }, {
    timeout: 30000,
  }).catch(() => undefined);
  if (response?.data?.choices?.[0]?.text) {
    // console.log(response.data);
    let { text } = response.data.choices[0];
    if (text.startsWith('\n\n')) {
      text = text.substring(2);
    }
    if (text.startsWith('？')) {
      text = text.substring(1).trimStart();
    }
    return text;
  }
  return undefined;
}

