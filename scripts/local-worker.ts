import {
  heartbeat,
  prepareNewsQueue,
  runLocalJobOnce,
} from "../lib/local-worker";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  await prepareNewsQueue();
  console.log(
    "실제 로컬 작업 처리기 시작. 공개 뉴스 수집과 저장된 예약 작업을 처리합니다.",
  );
  const timer = setInterval(() => {
    void heartbeat().catch(() => {});
  }, 5000);
  let lastNews = Date.now();
  try {
    await heartbeat();
    const started: number[] = [];
    while (!stopping) {
      while (started.length && started[0] < Date.now() - 60000) started.shift();
      if (started.length < 12 && (await runLocalJobOnce()))
        started.push(Date.now());
      if (Date.now() - lastNews > 2 * 60 * 60_000) {
        await prepareNewsQueue();
        lastNews = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    clearInterval(timer);
  }
}
main().catch(() => {
  console.error(
    "로컬 작업 처리기가 중단되었습니다. 실행 창을 다시 열고 오피스의 실패 결과를 확인하세요.",
  );
  process.exitCode = 1;
});
