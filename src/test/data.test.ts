import { describe, expect, it } from "vitest";

import { requests } from "@/data/requests";
import { conflicts, originalSchedule } from "@/data/originalSchedule";
import { scheduleVariants } from "@/data/schedules";
import { timeToMinutes } from "@/utils/time";

describe("RailPlan mock data", () => {
  it("contains 22 unique maintenance requests", () => {
    expect(requests).toHaveLength(22);
    expect(new Set(requests.map((request) => request.id)).size).toBe(22);
  });

  it("starts with exactly six active conflicts", () => {
    expect(conflicts).toHaveLength(6);
    expect(originalSchedule.metrics.activeConflicts).toBe(6);
  });

  it("keeps every schedule reference linked to a request", () => {
    const requestIds = new Set(requests.map((request) => request.id));

    Object.values(scheduleVariants).forEach((variant) => {
      variant.jobs.forEach((job) => expect(requestIds.has(job.requestId)).toBe(true));
    });
  });

  it("provides five conflict-free optimisation strategies", () => {
    expect(Object.keys(scheduleVariants)).toHaveLength(5);
    Object.values(scheduleVariants).forEach((variant) => {
      expect(variant.metrics.activeConflicts).toBe(0);
    });
  });

  it("keeps optimised jobs within the engineering window without track overlap", () => {
    Object.values(scheduleVariants).forEach((variant) => {
      variant.jobs.forEach((job) => {
        expect(timeToMinutes(job.startTime)).toBeGreaterThanOrEqual(0);
        expect(timeToMinutes(job.endTime)).toBeLessThanOrEqual(240);
        expect(timeToMinutes(job.endTime)).toBeGreaterThan(timeToMinutes(job.startTime));
      });

      const sectors = new Set(variant.jobs.map((job) => job.sector));
      sectors.forEach((sector) => {
        const jobs = variant.jobs
          .filter((job) => job.sector === sector)
          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
        jobs.slice(1).forEach((job, index) => {
          expect(timeToMinutes(job.startTime)).toBeGreaterThanOrEqual(timeToMinutes(jobs[index].endTime));
        });
      });
    });
  });
});
