import Koa from 'koa';
import Router from 'koa-router';

const app = new Koa();
const router = new Router();
// const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Safari/537.36';

export default function initProxy() {
  router.get('/', (ctx) => {
    const {
      type,
    } = ctx.request.query;

    if (!type) {
      ctx.status = 403;
      return;
    }

    ctx.status = 403;
  });

  app.use(router.routes());
  app.listen(60233);

  console.log('Proxy Server: listen 60233 .. ');
}
