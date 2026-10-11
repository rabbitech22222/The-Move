import Link from "next/link";
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div>
        <p className="eyebrow">404 / THE MOVE OS</p>
        <h1 className="text-3xl font-semibold mt-3">This page moved.</h1>
        <Link className="text-red-600 mt-6 inline-block" href="/">
          Return to the workspace →
        </Link>
      </div>
    </main>
  );
}
