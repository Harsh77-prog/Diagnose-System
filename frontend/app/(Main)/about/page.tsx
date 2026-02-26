export default function AboutPage() {
  return (
    <main className="min-h-screen px-6 py-24 md:px-12">
      <div className="mx-auto max-w-4xl space-y-10">
        <section className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">About MedCoreAI</h1>
          <p className="text-muted-foreground">
            MedCoreAI helps users explain symptoms clearly, understand possible
            conditions, and decide when to seek professional care.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Philosophy</h2>
          <p className="text-muted-foreground">
            Medical AI should explain, not decide, and assist, not replace
            healthcare professionals. The platform uses conservative language
            and safety-first guidance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">What This System Does</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Collects symptoms through structured conversation.</li>
            <li>Asks follow-up questions to improve prediction confidence.</li>
            <li>Uses historical chat context to support long-term analysis.</li>
            <li>Provides educational guidance and precautions.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Safety Notice</h2>
          <p className="text-muted-foreground">
            This platform is informational only. It does not provide medical
            diagnosis or treatment and is not a replacement for licensed care.
          </p>
        </section>
      </div>
    </main>
  );
}
