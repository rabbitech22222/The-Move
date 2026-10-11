"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="p-12">
      <p className="eyebrow">작업 공간 오류</p>
      <h1 className="text-2xl font-semibold mt-2">
        작업 공간을 불러오지 못했습니다.
      </h1>
      <p className="muted mt-3 mb-6">
        데이터베이스 연결과 서버 설정을 확인한 뒤 다시 시도하세요.
      </p>
      <Button onClick={reset}>다시 시도</Button>
    </main>
  );
}
