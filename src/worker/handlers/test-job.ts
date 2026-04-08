import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { jobs, jobEvents } from "@/lib/db/schema";

type DrizzleInstance = {
  update: typeof import("@/lib/db").db.update;
  insert: typeof import("@/lib/db").db.insert;
};

export async function handleTestJob(job: Job, db: DrizzleInstance) {
  const jobId = job.data.jobId as string;

  try {
    // Mark as active
    await db
      .update(jobs)
      .set({
        status: "active",
        currentStep: "initializing",
        progress: 0,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "started",
      data: { type: "test" },
    });

    // Simulate work in 5 steps
    for (let step = 1; step <= 5; step++) {
      await new Promise((r) => setTimeout(r, 1000));

      const progress = step * 20;

      await db
        .update(jobs)
        .set({
          progress,
          currentStep: `step-${step}`,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      await db.insert(jobEvents).values({
        jobId,
        event: "progress",
        data: { step, progress },
      });
    }

    // Mark as completed
    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "done",
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "completed",
      data: null,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";
    await db
      .update(jobs)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(jobEvents).values({
      jobId,
      event: "failed",
      data: { error: errorMessage },
    });

    throw err;
  }
}
