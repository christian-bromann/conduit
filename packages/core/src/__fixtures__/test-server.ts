Bun.serve({
  port: Number(process.env.PORT),
  fetch() {
    return new Response('ok');
  },
});
